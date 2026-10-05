const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit } = require('../db/helpers');

// GET /api/customers
router.get('/', authenticateToken, requirePermission('customers'), (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT c.*,
      COALESCE(SUM(s.total_amount),0) as total_billing,
      COALESCE(SUM(s.paid_amount),0) as total_paid,
      COALESCE(SUM(s.pending_amount),0) as total_pending,
      MAX(s.date) as last_payment_date
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    WHERE c.is_active = 1
  `;
  const params = [];
  if (search) {
    query += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.vehicle_number LIKE ? OR c.customer_code LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ` GROUP BY c.id ORDER BY c.name LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const customers = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM customers WHERE is_active=1 ${search ? 'AND (name LIKE ? OR phone LIKE ? OR vehicle_number LIKE ?)' : ''}`).get(...(search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [])).cnt;

  res.json({ customers, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/customers/:id
router.get('/:id', authenticateToken, requirePermission('customers'), (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const sales = db.prepare('SELECT * FROM sales WHERE customer_id = ? ORDER BY date DESC').all(req.params.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE party_id = ? AND party_type = 'customer' ORDER BY date DESC`).all(req.params.id);
  const stats = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as total_billing, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(pending_amount),0) as total_pending FROM sales WHERE customer_id = ?`).get(req.params.id);

  res.json({ customer, sales, payments, stats });
});

// POST /api/customers
router.post('/', authenticateToken, requirePermission('customers'), (req, res) => {
  const db = getDb();
  const { name, phone, email, address, vehicle_number, vehicle_model, vehicle_brand, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Customer name is required' });

  const customer_code = generateCode('CUS', 'customers', 'customer_code');
  const result = db.prepare(`INSERT INTO customers (customer_code,name,phone,email,address,vehicle_number,vehicle_model,vehicle_brand,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(customer_code, name, phone, email, address, vehicle_number, vehicle_model, vehicle_brand, notes, req.user.id);

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'customers', record_id: result.lastInsertRowid, new_value: { name, phone }, ip_address: req.ip });
  res.status(201).json({ id: result.lastInsertRowid, customer_code, message: 'Customer created' });
});

// PUT /api/customers/:id
router.put('/:id', authenticateToken, requirePermission('customers'), (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { name, phone, email, address, vehicle_number, vehicle_model, vehicle_brand, notes } = req.body;
  db.prepare(`UPDATE customers SET name=COALESCE(?,name), phone=COALESCE(?,phone), email=COALESCE(?,email),
    address=COALESCE(?,address), vehicle_number=COALESCE(?,vehicle_number), vehicle_model=COALESCE(?,vehicle_model),
    vehicle_brand=COALESCE(?,vehicle_brand), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`).run(
    name, phone, email, address, vehicle_number, vehicle_model, vehicle_brand, notes, req.params.id
  );

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'customers', record_id: req.params.id, old_value: customer, new_value: req.body, ip_address: req.ip });
  res.json({ message: 'Customer updated' });
});

// DELETE /api/customers/:id
router.delete('/:id', authenticateToken, requirePermission('customers'), (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  db.prepare("UPDATE customers SET is_active = 0, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(req.params.id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'customers', record_id: req.params.id, old_value: { name: customer.name }, ip_address: req.ip });
  res.json({ message: 'Customer deleted' });
});

module.exports = router;
