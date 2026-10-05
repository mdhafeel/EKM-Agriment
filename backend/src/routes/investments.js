const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry, updateAccountBalance } = require('../db/helpers');

// ── GET /api/investments ──────────────────────────────────────────────────
router.get('/', authenticateToken, requirePermission('investments'), (req, res) => {
  const db = getDb();
  const { search, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search) {
    where += ` AND (i.investor_name LIKE ? OR i.investment_no LIKE ? OR i.purpose LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (from) { where += ` AND i.date >= ?`; params.push(from); }
  if (to)   { where += ` AND i.date <= ?`; params.push(to); }

  // Main investments list with their splits
  const investments = db.prepare(`
    SELECT i.*, u.full_name as created_by_name
    FROM investments i
    LEFT JOIN users u ON u.id = i.created_by
    WHERE ${where}
    ORDER BY i.date DESC, i.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  // Attach splits to each investment
  const getSplits = db.prepare(`
    SELECT s.*, a.name as account_name, a.type as account_type
    FROM investment_splits s
    LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.investment_id = ?
    ORDER BY s.amount DESC
  `);
  for (const inv of investments) {
    inv.splits = getSplits.all(inv.id);
  }

  const total = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(i.amount),0) as total_amount
    FROM investments i WHERE ${where}
  `).get(...params);

  // ── Summary: total split by payment method (across all investments) ──
  const byMethod = db.prepare(`
    SELECT s.payment_method,
           COALESCE(SUM(s.amount),0) as total,
           COUNT(DISTINCT s.investment_id) as inv_count,
           COUNT(*) as split_count
    FROM investment_splits s
    JOIN investments i ON i.id = s.investment_id
    WHERE ${where.replace(/i\./g, 'i.')}
    GROUP BY s.payment_method
    ORDER BY total DESC
  `).all(...params);

  // ── Summary: per investor total ──
  const byInvestor = db.prepare(`
    SELECT i.investor_name,
           COALESCE(SUM(i.amount),0) as total,
           COUNT(*) as count
    FROM investments i
    WHERE ${where}
    GROUP BY i.investor_name
    ORDER BY total DESC
  `).all(...params);

  // ── Summary: per investor × per method (from splits) ──
  const byInvestorMethod = db.prepare(`
    SELECT i.investor_name, s.payment_method,
           COALESCE(SUM(s.amount),0) as total,
           COUNT(*) as count
    FROM investment_splits s
    JOIN investments i ON i.id = s.investment_id
    WHERE ${where.replace(/i\./g, 'i.')}
    GROUP BY i.investor_name, s.payment_method
    ORDER BY i.investor_name, total DESC
  `).all(...params);

  res.json({
    investments,
    total: total.cnt,
    total_amount: total.total_amount,
    byMethod,
    byInvestor,
    byInvestorMethod,
    page: parseInt(page),
    limit: parseInt(limit),
  });
});

// ── GET /api/investments/:id ──────────────────────────────────────────────
router.get('/:id', authenticateToken, requirePermission('investments'), (req, res) => {
  const db = getDb();
  const inv = db.prepare(`
    SELECT i.*, u.full_name as created_by_name
    FROM investments i LEFT JOIN users u ON u.id = i.created_by
    WHERE i.id = ?
  `).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });
  inv.splits = db.prepare(`
    SELECT s.*, a.name as account_name
    FROM investment_splits s LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.investment_id = ? ORDER BY s.amount DESC
  `).all(req.params.id);
  res.json(inv);
});

// ── POST /api/investments ─────────────────────────────────────────────────
// Body: { date, investor_name, purpose, description, splits: [{ payment_method, amount, account_id, notes }] }
router.post('/', authenticateToken, requirePermission('investments'), (req, res) => {
  const db = getDb();
  const { date, investor_name, purpose, description, splits } = req.body;

  if (!date || !investor_name) return res.status(400).json({ error: 'date and investor_name required' });
  if (!splits || !Array.isArray(splits) || splits.length === 0)
    return res.status(400).json({ error: 'At least one payment split is required' });
  for (const s of splits) {
    if (!s.payment_method || !s.amount || parseFloat(s.amount) <= 0)
      return res.status(400).json({ error: 'Each split needs payment_method and a positive amount' });
  }

  const totalAmount = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const investment_no = generateCode('INV', 'investments', 'investment_no');

  // Use first split's method & account for legacy columns
  const firstSplit = splits[0];

  const id = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO investments
        (investment_no, date, investor_name, amount, payment_method, account_id, purpose, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      investment_no, date, investor_name,
      totalAmount, firstSplit.payment_method, firstSplit.account_id || null,
      purpose || null, description || null, req.user.id
    );
    const invId = result.lastInsertRowid;

    // Insert all splits + update accounts + ledger
    for (const s of splits) {
      db.prepare(`
        INSERT INTO investment_splits (investment_id, payment_method, amount, account_id, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(invId, s.payment_method, parseFloat(s.amount), s.account_id || null, s.notes || null);

      if (s.account_id) updateAccountBalance(s.account_id, parseFloat(s.amount));

      addLedgerEntry({
        date,
        transaction_no: `${investment_no}-${s.payment_method.toUpperCase()}`,
        transaction_type: 'investment',
        reference_type: 'investment',
        reference_id: invId,
        description: `Investment by ${investor_name} via ${s.payment_method}${purpose ? ' — ' + purpose : ''}`,
        credit: parseFloat(s.amount),
        debit: 0,
        account_id: s.account_id || null,
        payment_method: s.payment_method,
        party_name: investor_name,
        created_by: req.user.id,
      });
    }
    return invId;
  })();

  logAudit({
    user_id: req.user.id, username: req.user.username,
    action: 'create', module: 'investments', record_id: id,
    new_value: { investor_name, amount: totalAmount, splits: splits.length },
    ip_address: req.ip,
  });
  res.status(201).json({ id, investment_no, total_amount: totalAmount, message: 'Investment recorded' });
});

// ── PUT /api/investments/:id ──────────────────────────────────────────────
router.put('/:id', authenticateToken, requirePermission('investments'), (req, res) => {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });

  const { date, investor_name, purpose, description, splits } = req.body;

  if (splits && (!Array.isArray(splits) || splits.length === 0))
    return res.status(400).json({ error: 'At least one split required' });
  if (splits) {
    for (const s of splits) {
      if (!s.payment_method || !s.amount || parseFloat(s.amount) <= 0)
        return res.status(400).json({ error: 'Each split needs payment_method and a positive amount' });
    }
  }

  db.transaction(() => {
    if (splits) {
      // Reverse old splits from account balances
      const oldSplits = db.prepare('SELECT * FROM investment_splits WHERE investment_id = ?').all(inv.id);
      for (const s of oldSplits) {
        if (s.account_id) updateAccountBalance(s.account_id, -s.amount);
      }

      // Delete old splits and ledger entries
      db.prepare('DELETE FROM investment_splits WHERE investment_id = ?').run(inv.id);
      db.prepare(`DELETE FROM ledger WHERE reference_type='investment' AND reference_id=?`).run(inv.id);

      // Insert new splits
      const newTotal = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const firstSplit = splits[0];

      db.prepare(`
        UPDATE investments SET
          date = COALESCE(?, date),
          investor_name = COALESCE(?, investor_name),
          amount = ?,
          payment_method = ?,
          account_id = ?,
          purpose = COALESCE(?, purpose),
          description = COALESCE(?, description),
          updated_at = strftime('%Y-%m-%d %H:%M:%S','now')
        WHERE id = ?
      `).run(date || null, investor_name || null, newTotal, firstSplit.payment_method, firstSplit.account_id || null, purpose || null, description || null, inv.id);

      const txDate = date || inv.date;
      for (const s of splits) {
        db.prepare(`
          INSERT INTO investment_splits (investment_id, payment_method, amount, account_id, notes)
          VALUES (?, ?, ?, ?, ?)
        `).run(inv.id, s.payment_method, parseFloat(s.amount), s.account_id || null, s.notes || null);

        if (s.account_id) updateAccountBalance(s.account_id, parseFloat(s.amount));

        addLedgerEntry({
          date: txDate,
          transaction_no: `${inv.investment_no}-${s.payment_method.toUpperCase()}`,
          transaction_type: 'investment',
          reference_type: 'investment',
          reference_id: inv.id,
          description: `Investment by ${investor_name || inv.investor_name} via ${s.payment_method}`,
          credit: parseFloat(s.amount),
          debit: 0,
          account_id: s.account_id || null,
          payment_method: s.payment_method,
          party_name: investor_name || inv.investor_name,
          created_by: req.user.id,
        });
      }
    } else {
      // Only update header fields (no split change)
      db.prepare(`
        UPDATE investments SET
          date = COALESCE(?, date),
          investor_name = COALESCE(?, investor_name),
          purpose = COALESCE(?, purpose),
          description = COALESCE(?, description),
          updated_at = strftime('%Y-%m-%d %H:%M:%S','now')
        WHERE id = ?
      `).run(date || null, investor_name || null, purpose || null, description || null, inv.id);
    }
  })();

  logAudit({
    user_id: req.user.id, username: req.user.username,
    action: 'update', module: 'investments', record_id: inv.id,
    old_value: { investor_name: inv.investor_name, amount: inv.amount },
    new_value: { investor_name, splits: splits?.length },
    ip_address: req.ip,
  });
  res.json({ message: 'Investment updated' });
});

// ── DELETE /api/investments/:id ───────────────────────────────────────────
router.delete('/:id', authenticateToken, requirePermission('investments'), (req, res) => {
  const db = getDb();
  const inv = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Investment not found' });

  db.transaction(() => {
    // Reverse all splits from account balances
    const splits = db.prepare('SELECT * FROM investment_splits WHERE investment_id = ?').all(inv.id);
    for (const s of splits) {
      if (s.account_id) updateAccountBalance(s.account_id, -s.amount);
    }
    // CASCADE deletes investment_splits automatically
    db.prepare('DELETE FROM investments WHERE id = ?').run(inv.id);
    db.prepare(`DELETE FROM ledger WHERE reference_type='investment' AND reference_id=?`).run(inv.id);
  })();

  logAudit({
    user_id: req.user.id, username: req.user.username,
    action: 'delete', module: 'investments', record_id: inv.id,
    old_value: { investor_name: inv.investor_name, amount: inv.amount },
    ip_address: req.ip,
  });
  res.json({ message: 'Investment deleted' });
});

module.exports = router;
