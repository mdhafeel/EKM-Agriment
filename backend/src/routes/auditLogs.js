const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/audit-logs
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const { module, user_id, action, from, to, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (module) { where += ` AND al.module=?`; params.push(module); }
  if (user_id) { where += ` AND al.user_id=?`; params.push(user_id); }
  if (action) { where += ` AND al.action=?`; params.push(action); }
  if (from) { where += ` AND al.created_at >= ?`; params.push(from); }
  if (to) { where += ` AND al.created_at <= ?`; params.push(to + ' 23:59:59'); }

  const logs = db.prepare(`SELECT al.*, u.full_name FROM audit_logs al LEFT JOIN users u ON u.id=al.user_id WHERE ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM audit_logs al WHERE ${where}`).get(...params).cnt;

  res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = router;
