const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry, updateAccountBalance, createNotification } = require('../db/helpers');

// GET /api/payments
router.get('/', authenticateToken, requirePermission('payments'), (req, res) => {
  const db = getDb();
  const { search, type, status, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search) { where += ` AND (p.party_name LIKE ? OR p.payment_no LIKE ? OR p.reference_number LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (type) { where += ` AND p.type = ?`; params.push(type); }
  if (status) { where += ` AND p.status = ?`; params.push(status); }
  if (from) { where += ` AND p.date >= ?`; params.push(from); }
  if (to) { where += ` AND p.date <= ?`; params.push(to); }

  const payments = db.prepare(`SELECT p.*, u.full_name as created_by_name FROM payments p LEFT JOIN users u ON u.id = p.created_by WHERE ${where} ORDER BY p.date DESC, p.id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const stats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN type='received' THEN amount ELSE 0 END),0) as total_received,
    COALESCE(SUM(CASE WHEN type='paid' THEN amount ELSE 0 END),0) as total_paid,
    COALESCE(SUM(CASE WHEN status IN ('pending','partial') THEN pending_amount ELSE 0 END),0) as pending_amount,
    COALESCE(SUM(CASE WHEN status='overdue' THEN pending_amount ELSE 0 END),0) as overdue_amount
    FROM payments p WHERE ${where}`).get(...params);

  res.json({ payments, total: stats.cnt, stats, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/payments/:id
router.get('/:id', authenticateToken, requirePermission('payments'), (req, res) => {
  const db = getDb();
  const payment = db.prepare('SELECT p.*, u.full_name as created_by_name FROM payments p LEFT JOIN users u ON u.id=p.created_by WHERE p.id=?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payment);
});

// POST /api/payments
router.post('/', authenticateToken, requirePermission('payments'), (req, res) => {
  const db = getDb();
  const { date, type, party_type, party_id, party_name, category, amount, payment_method,
    account_id, reference_number, description, due_date, status, notes } = req.body;

  if (!date || !type || !party_name || !amount) return res.status(400).json({ error: 'date, type, party_name, amount required' });
  if (!['received','paid'].includes(type)) return res.status(400).json({ error: 'type must be received or paid' });
  if (parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be positive' });

  const payment_no = generateCode('PAY', 'payments', 'payment_no');
  const pending_amount = status === 'paid' ? 0 : parseFloat(amount);

  const doInsert = db.transaction(() => {
    const result = db.prepare(`INSERT INTO payments (payment_no,date,type,party_type,party_id,party_name,category,amount,payment_method,account_id,reference_number,description,due_date,status,pending_amount,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payment_no, date, type, party_type, party_id || null, party_name, category,
      parseFloat(amount), payment_method || 'cash', account_id || null,
      reference_number, description, due_date, status || 'paid', pending_amount, notes, req.user.id
    );

    // Update account balance
    if (account_id && status === 'paid') {
      const delta = type === 'received' ? parseFloat(amount) : -parseFloat(amount);
      updateAccountBalance(account_id, delta);
    }

    // Add to ledger
    addLedgerEntry({
      date, transaction_no: payment_no, transaction_type: type === 'received' ? 'income' : 'expense',
      reference_type: 'payment', reference_id: result.lastInsertRowid,
      description: description || `${type === 'received' ? 'Received from' : 'Paid to'} ${party_name}`,
      debit: type === 'paid' ? parseFloat(amount) : 0,
      credit: type === 'received' ? parseFloat(amount) : 0,
      account_id, payment_method: payment_method || 'cash', party_name, created_by: req.user.id
    });

    // Check for large expense notification
    if (type === 'paid' && parseFloat(amount) > 50000) {
      createNotification({ type: 'large_expense', title: 'Large Payment Made', message: `Payment of ₹${amount} made to ${party_name}`, reference_type: 'payment', reference_id: result.lastInsertRowid });
    }

    return result.lastInsertRowid;
  });

  const id = doInsert();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'payments', record_id: id, new_value: { payment_no, type, party_name, amount }, ip_address: req.ip });
  res.status(201).json({ id, payment_no, message: 'Payment recorded' });
});

// PUT /api/payments/:id
router.put('/:id', authenticateToken, requirePermission('payments'), (req, res) => {
  const db = getDb();
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const { date, party_name, category, amount, payment_method, account_id, reference_number, description, due_date, status, notes } = req.body;
  const newAmount = parseFloat(amount) || payment.amount;
  const newStatus = status || payment.status;
  const pending_amount = newStatus === 'paid' ? 0 : newAmount;

  db.prepare(`UPDATE payments SET date=COALESCE(?,date), party_name=COALESCE(?,party_name), category=COALESCE(?,category),
    amount=?, payment_method=COALESCE(?,payment_method), account_id=COALESCE(?,account_id), reference_number=COALESCE(?,reference_number),
    description=COALESCE(?,description), due_date=COALESCE(?,due_date), status=?, pending_amount=?,
    notes=COALESCE(?,notes), updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?`).run(
    date, party_name, category, newAmount, payment_method, account_id, reference_number,
    description, due_date, newStatus, pending_amount, notes, req.params.id
  );

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'payments', record_id: req.params.id, old_value: payment, new_value: req.body, ip_address: req.ip });
  res.json({ message: 'Payment updated' });
});

// DELETE /api/payments/:id  — requires admin
router.delete('/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admin can delete payment records' });
  const db = getDb();
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  const doDelete = db.transaction(() => {
    // Reverse account balance
    if (payment.account_id && payment.status === 'paid') {
      const delta = payment.type === 'received' ? -payment.amount : payment.amount;
      updateAccountBalance(payment.account_id, delta);
    }
    db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
    db.prepare(`DELETE FROM ledger WHERE reference_type='payment' AND reference_id=?`).run(req.params.id);
  });

  doDelete();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'payments', record_id: req.params.id, old_value: payment, ip_address: req.ip });
  res.json({ message: 'Payment deleted' });
});

// GET /api/payments/overdue/list — auto-mark overdue
router.get('/overdue/list', authenticateToken, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  // Auto-mark overdue
  db.prepare(`UPDATE payments SET status='overdue' WHERE status IN ('pending','partial') AND due_date IS NOT NULL AND due_date < ?`).run(today);
  const overdue = db.prepare(`SELECT * FROM payments WHERE status='overdue' ORDER BY due_date ASC`).all();
  res.json(overdue);
});

module.exports = router;
