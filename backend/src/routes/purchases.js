const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry, updateAccountBalance, checkLowStock } = require('../db/helpers');

// GET /api/purchases
router.get('/', authenticateToken, requirePermission('purchases'), (req, res) => {
  const db = getDb();
  const { search, supplier_id, status, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search) { where += ` AND (p.purchase_no LIKE ? OR p.invoice_number LIKE ? OR s.name LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (supplier_id) { where += ` AND p.supplier_id = ?`; params.push(supplier_id); }
  if (status) { where += ` AND p.payment_status = ?`; params.push(status); }
  if (from) { where += ` AND p.date >= ?`; params.push(from); }
  if (to) { where += ` AND p.date <= ?`; params.push(to); }

  const purchases = db.prepare(`SELECT p.*, s.name as supplier_name, u.full_name as created_by_name
    FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN users u ON u.id=p.created_by
    WHERE ${where} ORDER BY p.date DESC, p.id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  const stats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(p.total_amount),0) as total,
    COALESCE(SUM(p.paid_amount),0) as paid, COALESCE(SUM(p.pending_amount),0) as pending
    FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE ${where}`).get(...params);

  res.json({ purchases, total: stats.cnt, stats, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/purchases/:id
router.get('/:id', authenticateToken, requirePermission('purchases'), (req, res) => {
  const db = getDb();
  const purchase = db.prepare(`SELECT p.*, s.name as supplier_name, s.contact_number as supplier_phone, s.gst_number as supplier_gst
    FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?`).get(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });
  const items = db.prepare('SELECT pi.*, sp.part_name as part_name_resolved FROM purchase_items pi LEFT JOIN spare_parts sp ON sp.id=pi.part_id WHERE pi.purchase_id=?').all(req.params.id);
  res.json({ purchase, items });
});

// POST /api/purchases
router.post('/', authenticateToken, requirePermission('purchases'), (req, res) => {
  const db = getDb();
  const { date, supplier_id, invoice_number, items, payment_status, payment_method, account_id, paid_amount, notes } = req.body;

  if (!date || !items || !items.length) return res.status(400).json({ error: 'date and items required' });

  const allowNegative = db.prepare(`SELECT value FROM settings WHERE key='allow_negative_stock'`).get()?.value === '1';

  const purchase_no = generateCode('PUR', 'purchases', 'purchase_no');
  let subtotal = 0, gst_total = 0, discount_total = 0;

  for (const item of items) {
    if (!item.part_name || !item.quantity || !item.unit_price) return res.status(400).json({ error: 'Each item needs part_name, quantity, unit_price' });
    const lineTotal = item.quantity * item.unit_price;
    const discAmt = lineTotal * ((item.discount_percent || 0) / 100);
    const gstAmt = (lineTotal - discAmt) * ((item.gst_percent || 0) / 100);
    subtotal += lineTotal;
    discount_total += discAmt;
    gst_total += gstAmt;
  }

  const total_amount = subtotal - discount_total + gst_total;
  const paid = parseFloat(paid_amount) || (payment_status === 'paid' ? total_amount : 0);
  const pending = total_amount - paid;
  const finalStatus = paid >= total_amount ? 'paid' : (paid > 0 ? 'partial' : 'pending');

  const doInsert = db.transaction(() => {
    const result = db.prepare(`INSERT INTO purchases (purchase_no,date,supplier_id,invoice_number,subtotal,discount_amount,gst_amount,total_amount,paid_amount,pending_amount,payment_status,payment_method,account_id,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      purchase_no, date, supplier_id || null, invoice_number, subtotal, discount_total, gst_total,
      total_amount, paid, pending, finalStatus, payment_method || null, account_id || null, notes, req.user.id
    );

    const purchaseId = result.lastInsertRowid;

    for (const item of items) {
      const lineTotal = item.quantity * item.unit_price;
      const discAmt = lineTotal * ((item.discount_percent || 0) / 100);
      const gstAmt = (lineTotal - discAmt) * ((item.gst_percent || 0) / 100);
      const itemTotal = lineTotal - discAmt + gstAmt;

      db.prepare(`INSERT INTO purchase_items (purchase_id,part_id,part_name,part_number,quantity,unit_price,discount_percent,gst_percent,total_amount)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(purchaseId, item.part_id || null, item.part_name, item.part_number || null, item.quantity, item.unit_price, item.discount_percent || 0, item.gst_percent || 0, itemTotal);

      // Update stock
      if (item.part_id) {
        db.prepare("UPDATE spare_parts SET current_stock = current_stock + ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(item.quantity, item.part_id);
        db.prepare(`INSERT INTO stock_movements (part_id,movement_type,reference_type,reference_id,quantity,unit_price,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`).run(
          item.part_id, 'purchase', 'purchase', purchaseId, item.quantity, item.unit_price, `Purchase ${purchase_no}`, req.user.id
        );
        // Update purchase price on part
        db.prepare('UPDATE spare_parts SET purchase_price = ? WHERE id = ?').run(item.unit_price, item.part_id);
      }
    }

    // Update account balance
    if (account_id && paid > 0) updateAccountBalance(account_id, -paid);

    // Add to ledger
    addLedgerEntry({
      date, transaction_no: purchase_no, transaction_type: 'purchase',
      reference_type: 'purchase', reference_id: purchaseId,
      description: `Parts purchase ${purchase_no}${invoice_number ? ' Invoice:'+invoice_number : ''}`,
      debit: paid, credit: 0,
      account_id, payment_method: payment_method || null,
      party_name: supplier_id ? db.prepare('SELECT name FROM suppliers WHERE id=?').get(supplier_id)?.name : 'Unknown Supplier',
      created_by: req.user.id
    });

    return purchaseId;
  });

  const id = doInsert();
  checkLowStock();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'purchases', record_id: id, new_value: { purchase_no, total_amount }, ip_address: req.ip });
  res.status(201).json({ id, purchase_no, message: 'Purchase recorded' });
});

// PUT /api/purchases/:id/payment — record additional payment
router.put('/:id/payment', authenticateToken, requirePermission('purchases'), (req, res) => {
  const db = getDb();
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

  const { paid_amount, payment_method, account_id, date } = req.body;
  const additionalPaid = parseFloat(paid_amount);
  if (!additionalPaid || additionalPaid <= 0) return res.status(400).json({ error: 'Valid paid_amount required' });
  if (additionalPaid > purchase.pending_amount) return res.status(400).json({ error: 'Payment exceeds pending amount' });

  const newPaid = purchase.paid_amount + additionalPaid;
  const newPending = purchase.total_amount - newPaid;
  const newStatus = newPending <= 0 ? 'paid' : 'partial';

  db.prepare(`UPDATE purchases SET paid_amount=?, pending_amount=?, payment_status=?, updated_at=datetime('now') WHERE id=?`).run(newPaid, newPending, newStatus, req.params.id);

  if (account_id) updateAccountBalance(account_id, -additionalPaid);

  addLedgerEntry({
    date: date || new Date().toISOString().split('T')[0],
    transaction_no: `PAY-${purchase.purchase_no}`,
    transaction_type: 'purchase',
    reference_type: 'purchase', reference_id: parseInt(req.params.id),
    description: `Payment for purchase ${purchase.purchase_no}`,
    debit: additionalPaid, credit: 0, account_id, payment_method: payment_method || 'cash',
    party_name: null, created_by: req.user.id
  });

  res.json({ message: 'Payment recorded', new_status: newStatus, pending_amount: newPending });
});

// DELETE /api/purchases/:id
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(req.params.id);
  if (!purchase) return res.status(404).json({ error: 'Purchase not found' });

  const doDelete = db.transaction(() => {
    const items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(req.params.id);
    for (const item of items) {
      if (item.part_id) {
        db.prepare('UPDATE spare_parts SET current_stock = current_stock - ? WHERE id = ?').run(item.quantity, item.part_id);
      }
    }
    db.prepare('DELETE FROM purchase_items WHERE purchase_id = ?').run(req.params.id);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(req.params.id);
    db.prepare(`DELETE FROM ledger WHERE reference_type='purchase' AND reference_id=?`).run(req.params.id);
    db.prepare(`DELETE FROM stock_movements WHERE reference_type='purchase' AND reference_id=?`).run(req.params.id);
    if (purchase.account_id && purchase.paid_amount > 0) updateAccountBalance(purchase.account_id, purchase.paid_amount);
  });

  doDelete();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'purchases', record_id: req.params.id, old_value: purchase, ip_address: req.ip });
  res.json({ message: 'Purchase deleted and stock reversed' });
});

module.exports = router;
