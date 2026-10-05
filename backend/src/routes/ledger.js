const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// GET /api/ledger
router.get('/', authenticateToken, requirePermission('ledger'), (req, res) => {
  const db = getDb();
  const { search, type, account_id, from, to, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search) { where += ` AND (l.description LIKE ? OR l.transaction_no LIKE ? OR l.party_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (type) { where += ` AND l.transaction_type = ?`; params.push(type); }
  if (account_id) { where += ` AND l.account_id = ?`; params.push(account_id); }
  if (from) { where += ` AND l.date >= ?`; params.push(from); }
  if (to) { where += ` AND l.date <= ?`; params.push(to); }

  const entries = db.prepare(`SELECT l.*, a.name as account_name, u.full_name as created_by_name
    FROM ledger l LEFT JOIN accounts a ON a.id=l.account_id LEFT JOIN users u ON u.id=l.created_by
    WHERE ${where} ORDER BY l.date DESC, l.id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);

  const stats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(l.debit),0) as total_debit, COALESCE(SUM(l.credit),0) as total_credit FROM ledger l WHERE ${where}`).get(...params);

  res.json({ entries, total: stats.cnt, total_debit: stats.total_debit, total_credit: stats.total_credit, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = router;
