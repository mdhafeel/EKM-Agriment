const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry, updateAccountBalance, checkLowStock } = require('../db/helpers');

// GET /api/sales
router.get('/', authenticateToken, requirePermission('sales'), (req, res) => {
  const db = getDb();
  const { search, customer_id, status, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search) { where += ` AND (s.sale_no LIKE ? OR s.customer_name LIKE ? OR s.vehicle_number LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (customer_id) { where += ` AND s.customer_id = ?`; params.push(customer_id); }
  if (status) { where += ` AND s.payment_status = ?`; params.push(status); }
  if (from) { where += ` AND s.date >= ?`; params.push(from); }
  if (to) { where += ` AND s.date <= ?`; params.push(to); }

  const sales = db.prepare(`SELECT s.*, u.full_name as created_by_name FROM sales s LEFT JOIN users u ON u.id=s.created_by WHERE ${where} ORDER BY s.date DESC, s.id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const stats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(s.total_amount),0) as total,
    COALESCE(SUM(s.paid_amount),0) as paid, COALESCE(SUM(s.pending_amount),0) as pending,
    COALESCE(SUM(s.gross_profit),0) as profit
    FROM sales s WHERE ${where}`).get(...params);

  res.json({ sales, total: stats.cnt, stats, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/sales/:id
router.get('/:id', authenticateToken, requirePermission('sales'), (req, res) => {
  const db = getDb();
  const sale = db.prepare(`SELECT s.*, c.phone as customer_phone, c.address as customer_address, c.vehicle_brand, c.vehicle_model
    FROM sales s LEFT JOIN customers c ON c.id=s.customer_id WHERE s.id=?`).get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });
  const items = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(req.params.id);
  res.json({ sale, items });
});

// POST /api/sales
router.post('/', authenticateToken, requirePermission('sales'), (req, res) => {
  const db = getDb();
  const { date, customer_id, customer_name, vehicle_number, items, payment_status, payment_method, account_id, paid_amount, notes } = req.body;

  if (!date || !items || !items.length) return res.status(400).json({ error: 'date and items required' });

  const allowNegative = db.prepare(`SELECT value FROM settings WHERE key='allow_negative_stock'`).get()?.value === '1';

  // Validate stock
  for (const item of items) {
    if (item.part_id) {
      const part = db.prepare('SELECT current_stock, part_name FROM spare_parts WHERE id=?').get(item.part_id);
      if (part && part.current_stock < item.quantity && !allowNegative) {
        return res.status(400).json({ error: `Insufficient stock for ${part.part_name}. Available: ${part.current_stock}` });
      }
    }
  }

  const sale_no = generateCode('SAL', 'sales', 'sale_no');
  let subtotal = 0, gst_total = 0, discount_total = 0, cogs = 0;

  for (const item of items) {
    const lineTotal = item.quantity * item.unit_price;
    const discAmt = lineTotal * ((item.discount_percent || 0) / 100);
    const gstAmt = (lineTotal - discAmt) * ((item.gst_percent || 0) / 100);
    subtotal += lineTotal;
    discount_total += discAmt;
    gst_total += gstAmt;

    // Cost of goods
    if (item.part_id) {
      const part = db.prepare('SELECT purchase_price FROM spare_parts WHERE id=?').get(item.part_id);
      if (part) cogs += item.quantity * part.purchase_price;
    } else if (item.cost_price) {
      cogs += item.quantity * item.cost_price;
    }
  }

  const total_amount = subtotal - discount_total + gst_total;
  const paid = parseFloat(paid_amount) || (payment_status === 'paid' ? total_amount : 0);
  const pending = total_amount - paid;
  const finalStatus = paid >= total_amount ? 'paid' : (paid > 0 ? 'partial' : 'pending');
  const grossProfit = total_amount - cogs;

  const cName = customer_id ? db.prepare('SELECT name FROM customers WHERE id=?').get(customer_id)?.name : customer_name;

  const doInsert = db.transaction(() => {
    const result = db.prepare(`INSERT INTO sales (sale_no,date,customer_id,customer_name,vehicle_number,subtotal,discount_amount,gst_amount,total_amount,paid_amount,pending_amount,payment_status,payment_method,account_id,cost_of_goods,gross_profit,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      sale_no, date, customer_id || null, cName || customer_name || 'Walk-in',
      vehicle_number, subtotal, discount_total, gst_total, total_amount, paid, pending,
      finalStatus, payment_method || null, account_id || null, cogs, grossProfit, notes, req.user.id
    );

    const saleId = result.lastInsertRowid;

    for (const item of items) {
      const lineTotal = item.quantity * item.unit_price;
      const discAmt = lineTotal * ((item.discount_percent || 0) / 100);
      const gstAmt = (lineTotal - discAmt) * ((item.gst_percent || 0) / 100);
      const itemTotal = lineTotal - discAmt + gstAmt;
      const costPrice = item.part_id ? (db.prepare('SELECT purchase_price FROM spare_parts WHERE id=?').get(item.part_id)?.purchase_price || 0) : (item.cost_price || 0);
      const itemProfit = itemTotal - (item.quantity * costPrice);

      db.prepare(`INSERT INTO sale_items (sale_id,part_id,part_name,part_number,quantity,unit_price,cost_price,discount_percent,gst_percent,total_amount,profit)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(saleId, item.part_id || null, item.part_name, item.part_number || null, item.quantity, item.unit_price, costPrice, item.discount_percent || 0, item.gst_percent || 0, itemTotal, itemProfit);

      // Decrease stock
      if (item.part_id) {
        db.prepare("UPDATE spare_parts SET current_stock = current_stock - ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(item.quantity, item.part_id);
        db.prepare(`INSERT INTO stock_movements (part_id,movement_type,reference_type,reference_id,quantity,unit_price,notes,created_by) VALUES (?,?,?,?,?,?,?,?)`).run(
          item.part_id, 'sale', 'sale', saleId, -item.quantity, item.unit_price, `Sale ${sale_no}`, req.user.id
        );
      }
    }

    // Update customer balance
    if (customer_id && pending > 0) {
      // Already tracked via sales.pending_amount
    }

    // Update account
    if (account_id && paid > 0) updateAccountBalance(account_id, paid);

    // Add to ledger
    addLedgerEntry({
      date, transaction_no: sale_no, transaction_type: 'sale',
      reference_type: 'sale', reference_id: saleId,
      description: `Parts sale ${sale_no} - ${cName || 'Walk-in'}`,
      debit: 0, credit: paid,
      account_id, payment_method: payment_method || null,
      party_name: cName || 'Walk-in', created_by: req.user.id
    });

    // Create invoice record
    const inv_no = generateCode('INV', 'invoices', 'invoice_no');
    db.prepare(`INSERT INTO invoices (invoice_no,date,type,customer_id,sale_id,customer_name,vehicle_number,subtotal,discount_amount,gst_amount,total_amount,paid_amount,balance_amount,payment_method,payment_status,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      inv_no, date, 'sale', customer_id || null, saleId,
      cName || customer_name || 'Walk-in', vehicle_number,
      subtotal, discount_total, gst_total, total_amount, paid, pending,
      payment_method || null, finalStatus, req.user.id
    );

    return saleId;
  });

  const id = doInsert();
  checkLowStock();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'sales', record_id: id, new_value: { sale_no, total_amount }, ip_address: req.ip });
  res.status(201).json({ id, sale_no, message: 'Sale recorded' });
});

// PUT /api/sales/:id/payment
router.put('/:id/payment', authenticateToken, requirePermission('sales'), (req, res) => {
  const db = getDb();
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const { paid_amount, payment_method, account_id, date } = req.body;
  const additionalPaid = parseFloat(paid_amount);
  if (!additionalPaid || additionalPaid <= 0) return res.status(400).json({ error: 'Valid paid_amount required' });
  if (additionalPaid > sale.pending_amount) return res.status(400).json({ error: 'Payment exceeds pending amount' });

  const newPaid = sale.paid_amount + additionalPaid;
  const newPending = sale.total_amount - newPaid;
  const newStatus = newPending <= 0 ? 'paid' : 'partial';

  db.prepare(`UPDATE sales SET paid_amount=?, pending_amount=?, payment_status=?, updated_at=datetime('now') WHERE id=?`).run(newPaid, newPending, newStatus, req.params.id);
  db.prepare(`UPDATE invoices SET paid_amount=?, balance_amount=?, payment_status=?, updated_at=datetime('now') WHERE sale_id=?`).run(newPaid, newPending, newStatus, req.params.id);

  if (account_id) updateAccountBalance(account_id, additionalPaid);

  addLedgerEntry({
    date: date || new Date().toISOString().split('T')[0],
    transaction_no: `COL-${sale.sale_no}`, transaction_type: 'income',
    reference_type: 'sale', reference_id: parseInt(req.params.id),
    description: `Collection for sale ${sale.sale_no}`,
    debit: 0, credit: additionalPaid, account_id, payment_method: payment_method || 'cash',
    party_name: sale.customer_name, created_by: req.user.id
  });

  res.json({ message: 'Payment recorded', new_status: newStatus, pending_amount: newPending });
});

// DELETE /api/sales/:id
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(req.params.id);
  if (!sale) return res.status(404).json({ error: 'Sale not found' });

  const doDelete = db.transaction(() => {
    const items = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(req.params.id);
    for (const item of items) {
      if (item.part_id) db.prepare('UPDATE spare_parts SET current_stock = current_stock + ? WHERE id = ?').run(item.quantity, item.part_id);
    }
    db.prepare('DELETE FROM sale_items WHERE sale_id=?').run(req.params.id);
    db.prepare('DELETE FROM invoices WHERE sale_id=?').run(req.params.id);
    db.prepare('DELETE FROM sales WHERE id=?').run(req.params.id);
    db.prepare(`DELETE FROM ledger WHERE reference_type='sale' AND reference_id=?`).run(req.params.id);
    db.prepare(`DELETE FROM stock_movements WHERE reference_type='sale' AND reference_id=?`).run(req.params.id);
    if (sale.account_id && sale.paid_amount > 0) updateAccountBalance(sale.account_id, -sale.paid_amount);
  });

  doDelete();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'sales', record_id: req.params.id, old_value: sale, ip_address: req.ip });
  res.json({ message: 'Sale deleted and stock restored' });
});

module.exports = router;
