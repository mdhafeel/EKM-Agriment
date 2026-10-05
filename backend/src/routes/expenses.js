const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry, updateAccountBalance, createNotification } = require('../db/helpers');

// GET /api/expenses/categories
router.get('/categories', authenticateToken, (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM expense_categories WHERE is_active=1 ORDER BY name').all());
});

// GET /api/expenses/account-balance/:id
router.get('/account-balance/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT id, name, type, current_balance FROM accounts WHERE id=? AND is_active=1').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.json(account);
});

// POST /api/expenses/categories
router.post('/categories', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name required' });
  const result = db.prepare('INSERT OR IGNORE INTO expense_categories (name) VALUES (?)').run(name);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Category created' });
});

// GET /api/expenses
router.get('/', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const { search, category_id, from, to, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = '1=1';
  const params = [];
  if (search)      { where += ` AND (e.paid_to LIKE ? OR e.expense_no LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (category_id) { where += ` AND e.category_id = ?`; params.push(category_id); }
  if (from)        { where += ` AND e.date >= ?`; params.push(from); }
  if (to)          { where += ` AND e.date <= ?`; params.push(to); }

  const expenses = db.prepare(`
    SELECT e.*, ec.name as category_name_resolved, u.full_name as created_by_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE ${where}
    ORDER BY e.date DESC, e.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  // Attach splits to each expense
  const getSplits = db.prepare(`
    SELECT s.*, a.name as account_name, a.type as account_type
    FROM expense_splits s
    LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.expense_id = ?
    ORDER BY s.amount DESC
  `);
  for (const exp of expenses) {
    exp.splits = getSplits.all(exp.id);
  }

  const stats      = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(e.amount),0) as total FROM expenses e WHERE ${where}`).get(...params);
  const byCategory = db.prepare(`
    SELECT COALESCE(ec.name, e.category_name, 'Uncategorized') as category,
           COALESCE(SUM(e.amount),0) as total
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE ${where}
    GROUP BY category ORDER BY total DESC
  `).all(...params);

  // Summary by payment method across splits
  const byMethod = db.prepare(`
    SELECT s.payment_method, COALESCE(SUM(s.amount),0) as total, COUNT(*) as count
    FROM expense_splits s
    JOIN expenses e ON e.id = s.expense_id
    WHERE ${where}
    GROUP BY s.payment_method ORDER BY total DESC
  `).all(...params);

  res.json({ expenses, total: stats.cnt, total_amount: stats.total, byCategory, byMethod, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/expenses/:id
router.get('/:id', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const expense = db.prepare(`
    SELECT e.*, ec.name as category_name_resolved, u.full_name as created_by_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.id = ?
  `).get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });
  expense.splits = db.prepare(`
    SELECT s.*, a.name as account_name
    FROM expense_splits s LEFT JOIN accounts a ON a.id = s.account_id
    WHERE s.expense_id = ? ORDER BY s.amount DESC
  `).all(req.params.id);
  res.json(expense);
});

// POST /api/expenses
// Body: { date, category_id, paid_to, splits: [{ payment_method, amount, account_id }] }
router.post('/', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const { date, category_id, category_name, paid_to, splits } = req.body;

  if (!date) return res.status(400).json({ error: 'date is required' });
  if (!splits || !Array.isArray(splits) || splits.length === 0)
    return res.status(400).json({ error: 'At least one payment split is required' });
  for (const s of splits) {
    if (!s.payment_method || !s.amount || parseFloat(s.amount) <= 0)
      return res.status(400).json({ error: 'Each split needs payment_method and a positive amount' });
  }

  const totalAmount = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
  const catName     = category_id ? db.prepare('SELECT name FROM expense_categories WHERE id=?').get(category_id)?.name : category_name;
  const expense_no  = generateCode('EXP', 'expenses', 'expense_no');
  const firstSplit  = splits[0];

  const id = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO expenses (expense_no, date, category_id, category_name, amount,
        payment_method, account_id, paid_to, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      expense_no, date, category_id || null, catName || null, totalAmount,
      firstSplit.payment_method, firstSplit.account_id || null, paid_to || null, req.user.id
    );
    const expId = result.lastInsertRowid;

    for (const s of splits) {
      const amt = parseFloat(s.amount);
      const accId = s.account_id && s.account_id !== '' ? parseInt(s.account_id) : null;

      db.prepare(`INSERT INTO expense_splits (expense_id, payment_method, amount, account_id, notes) VALUES (?, ?, ?, ?, ?)`)
        .run(expId, s.payment_method, amt, accId, s.notes || null);

      if (accId) updateAccountBalance(accId, -amt);

      addLedgerEntry({
        date,
        transaction_no: `${expense_no}-${s.payment_method.toUpperCase()}`,
        transaction_type: 'expense',
        reference_type: 'expense',
        reference_id: expId,
        description: `${catName || 'Expense'}${paid_to ? ' - ' + paid_to : ''} via ${s.payment_method}`,
        debit: amt, credit: 0,
        account_id: accId,
        payment_method: s.payment_method,
        party_name: paid_to || null,
        created_by: req.user.id,
      });
    }

    if (totalAmount > 50000) {
      createNotification({
        type: 'large_expense', title: 'Large Expense Recorded',
        message: `₹${totalAmount.toLocaleString('en-IN')} for ${catName || paid_to || 'expense'}`,
        reference_type: 'expense', reference_id: expId,
      });
    }

    return expId;
  })();

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'expenses', record_id: id, new_value: { expense_no, amount: totalAmount, splits: splits.length }, ip_address: req.ip });
  res.status(201).json({ id, expense_no, total_amount: totalAmount, message: 'Expense recorded' });
});

// PUT /api/expenses/:id
router.put('/:id', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  const { date, category_id, category_name, paid_to, splits } = req.body;

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
      // Reverse old splits
      const oldSplits = db.prepare('SELECT * FROM expense_splits WHERE expense_id=?').all(expense.id);
      for (const s of oldSplits) {
        if (s.account_id) updateAccountBalance(s.account_id, s.amount); // restore
      }
      db.prepare('DELETE FROM expense_splits WHERE expense_id=?').run(expense.id);
      db.prepare(`DELETE FROM ledger WHERE reference_type='expense' AND reference_id=?`).run(expense.id);

      const newTotal  = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const catName   = category_id ? db.prepare('SELECT name FROM expense_categories WHERE id=?').get(category_id)?.name || category_name : category_name;
      const firstSplit = splits[0];
      const txDate    = date || expense.date;

      db.prepare(`UPDATE expenses SET
        date=COALESCE(?,date), category_id=COALESCE(?,category_id), category_name=COALESCE(?,category_name),
        amount=?, payment_method=?, account_id=?, paid_to=COALESCE(?,paid_to),
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?
      `).run(date || null, category_id || null, catName || null, newTotal, firstSplit.payment_method, firstSplit.account_id || null, paid_to || null, expense.id);

      for (const s of splits) {
        const amt   = parseFloat(s.amount);
        const accId = s.account_id && s.account_id !== '' ? parseInt(s.account_id) : null;

        db.prepare(`INSERT INTO expense_splits (expense_id, payment_method, amount, account_id, notes) VALUES (?, ?, ?, ?, ?)`)
          .run(expense.id, s.payment_method, amt, accId, s.notes || null);

        if (accId) updateAccountBalance(accId, -amt);

        addLedgerEntry({
          date: txDate,
          transaction_no: `${expense.expense_no}-${s.payment_method.toUpperCase()}`,
          transaction_type: 'expense',
          reference_type: 'expense', reference_id: expense.id,
          description: `${catName || 'Expense'}${paid_to ? ' - ' + paid_to : ''} via ${s.payment_method}`,
          debit: amt, credit: 0,
          account_id: accId, payment_method: s.payment_method,
          party_name: paid_to || null, created_by: req.user.id,
        });
      }
    } else {
      db.prepare(`UPDATE expenses SET
        date=COALESCE(?,date), category_id=COALESCE(?,category_id),
        category_name=COALESCE(?,category_name), paid_to=COALESCE(?,paid_to),
        updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?
      `).run(date || null, category_id || null, category_name || null, paid_to || null, expense.id);
    }
  })();

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'update', module: 'expenses', record_id: expense.id, old_value: { amount: expense.amount }, new_value: { splits: splits?.length }, ip_address: req.ip });
  res.json({ message: 'Expense updated' });
});

// DELETE /api/expenses/:id
router.delete('/:id', authenticateToken, requirePermission('expenses'), (req, res) => {
  const db = getDb();
  const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(req.params.id);
  if (!expense) return res.status(404).json({ error: 'Expense not found' });

  db.transaction(() => {
    const splits = db.prepare('SELECT * FROM expense_splits WHERE expense_id=?').all(expense.id);
    for (const s of splits) {
      if (s.account_id) updateAccountBalance(s.account_id, s.amount); // restore balance
    }
    // CASCADE deletes expense_splits
    db.prepare('DELETE FROM expenses WHERE id=?').run(expense.id);
    db.prepare(`DELETE FROM ledger WHERE reference_type='expense' AND reference_id=?`).run(expense.id);
  })();

  logAudit({ user_id: req.user.id, username: req.user.username, action: 'delete', module: 'expenses', record_id: expense.id, old_value: { amount: expense.amount }, ip_address: req.ip });
  res.json({ message: 'Expense deleted' });
});

module.exports = router;
