const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit } = require('../db/helpers');

// GET /api/suppliers
router.get('/', authenticateToken, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let query = `
    SELECT s.*,
      COALESCE(SUM(p.total_amount),0) as total_purchases,
      COALESCE(SUM(p.paid_amount),0) as total_paid,
      COALESCE(SUM(p.pending_amount),0) as outstanding_payable,
      MAX(p.date) as last_payment_date
    FROM suppliers s
    LEFT JOIN purchases p ON p.supplier_id = s.id
    WHERE s.is_active = 1
  `;
  const params = [];
  if (search) {
    query += ` AND (s.name LIKE ? OR s.contact_number LIKE ? OR s.supplier_code LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  query += ` GROUP BY s.id ORDER BY s.name LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const suppliers = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM suppliers WHERE is_active=1`).get().cnt;

  res.json({ suppliers, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/suppliers/:id
router.get('/:id', authenticateToken, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const purchases = db.prepare('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY date DESC').all(req.params.id);
  const payments = db.prepare(`SELECT * FROM payments WHERE party_id = ? AND party_type = 'supplier' ORDER BY date DESC`).all(req.params.id);
  const stats = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as total_purchases, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(pending_amount),0) as outstanding FROM purchases WHERE supplier_id = ?`).get(req.params.id);
  const parts = db.prepare('SELECT * FROM spare_parts WHERE supplier_id = ? AND is_active = 1 ORDER BY part_name').all(req.params.id);

  res.json({ supplier, purchases, payments, stats, parts });
});

// POST /api/suppliers
router.post('/', authenticateToken, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const { name, contact_number, email, address, gst_number, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Supplier name is required' });

  const supplier_code = generateCode('SUP', 'suppliers', 'supplier_code');
  const result = db.prepare(`INSERT INTO suppliers (supplier_code,name,contact_number,email,address,gst_number,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(supplier_code, name, contact_number, email, address, gst_number, notes, req.user.id);

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'suppliers', record_id: result.lastInsertRowid, new_value: { name }, ip_address: req.ip });
  res.status(201).json({ id: result.lastInsertRowid, supplier_code, message: 'Supplier created' });
});

// PUT /api/suppliers/:id
router.put('/:id', authenticateToken, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const { name, contact_number, email, address, gst_number, notes } = req.body;
  db.prepare(`UPDATE suppliers SET name=COALESCE(?,name), contact_number=COALESCE(?,contact_number), email=COALESCE(?,email),
    address=COALESCE(?,address), gst_number=COALESCE(?,gst_number), notes=COALESCE(?,notes), updated_at=datetime('now') WHERE id=?`).run(
    name, contact_number, email, address, gst_number, notes, req.params.id
  );

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'suppliers', record_id: req.params.id, old_value: supplier, new_value: req.body, ip_address: req.ip });
  res.json({ message: 'Supplier updated' });
});

// DELETE /api/suppliers/:id
router.delete('/:id', authenticateToken, requirePermission('suppliers'), (req, res) => {
  const db = getDb();
  const supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  db.prepare("UPDATE suppliers SET is_active = 0, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?").run(req.params.id);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'suppliers', record_id: req.params.id, old_value: { name: supplier.name }, ip_address: req.ip });
  res.json({ message: 'Supplier deleted' });
});

module.exports = router;
