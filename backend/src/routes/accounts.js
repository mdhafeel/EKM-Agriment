const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requireAdmin, requirePermission } = require('../middleware/auth');
const { generateCode, logAudit, addLedgerEntry } = require('../db/helpers');

// GET /api/accounts
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT * FROM accounts WHERE is_active=1 ORDER BY type, name').all();
  res.json(accounts);
});

// GET /api/accounts/:id/transactions
router.get('/:id/transactions', authenticateToken, (req, res) => {
  const db = getDb();
  const { from, to, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = 'account_id = ?';
  const params = [req.params.id];
  if (from) { where += ` AND date >= ?`; params.push(from); }
  if (to) { where += ` AND date <= ?`; params.push(to); }

  const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const entries = db.prepare(`SELECT * FROM ledger WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(credit),0) as total_credit, COALESCE(SUM(debit),0) as total_debit FROM ledger WHERE ${where}`).get(...params);

  res.json({ account, entries, total: total.cnt, total_credit: total.total_credit, total_debit: total.total_debit });
});

// POST /api/accounts
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, type, opening_balance, bank_name, account_number, ifsc_code } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  const bal = parseFloat(opening_balance) || 0;
  const result = db.prepare('INSERT INTO accounts (name,type,opening_balance,current_balance,bank_name,account_number,ifsc_code) VALUES (?,?,?,?,?,?,?)').run(name, type, bal, bal, bank_name, account_number, ifsc_code);
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'accounts', record_id: result.lastInsertRowid, new_value: { name, type }, ip_address: req.ip });
  res.status(201).json({ id: result.lastInsertRowid, message: 'Account created' });
});

// PUT /api/accounts/:id
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const { name, bank_name, account_number, ifsc_code, is_active } = req.body;
  db.prepare(`UPDATE accounts SET name=COALESCE(?,name), bank_name=COALESCE(?,bank_name), account_number=COALESCE(?,account_number),
    ifsc_code=COALESCE(?,ifsc_code), is_active=COALESCE(?,is_active), updated_at=strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?`).run(
    name, bank_name, account_number, ifsc_code, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id
  );
  res.json({ message: 'Account updated' });
});

// POST /api/accounts/transfer
router.post('/transfer', authenticateToken, requirePermission('accounts'), (req, res) => {
  const db = getDb();
  const { from_account_id, to_account_id, amount, date, description } = req.body;
  if (!from_account_id || !to_account_id || !amount) return res.status(400).json({ error: 'from_account_id, to_account_id, amount required' });
  if (from_account_id === to_account_id) return res.status(400).json({ error: 'Cannot transfer to same account' });
  const transferAmt = parseFloat(amount);
  if (transferAmt <= 0) return res.status(400).json({ error: 'Amount must be positive' });

  const fromAcc = db.prepare('SELECT * FROM accounts WHERE id=?').get(from_account_id);
  if (!fromAcc) return res.status(404).json({ error: 'Source account not found' });
  if (fromAcc.current_balance < transferAmt) return res.status(400).json({ error: 'Insufficient balance in source account' });

  const transfer_no = generateCode('TRF', 'account_transfers', 'transfer_no');
  const txDate = date || new Date().toISOString().split('T')[0];
  const desc = description || `Transfer from ${fromAcc.name}`;

  const doTransfer = db.transaction(() => {
    db.prepare("UPDATE accounts SET current_balance = current_balance - ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?").run(transferAmt, from_account_id);
    db.prepare("UPDATE accounts SET current_balance = current_balance + ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id=?").run(transferAmt, to_account_id);
    db.prepare('INSERT INTO account_transfers (transfer_no,date,from_account_id,to_account_id,amount,description,created_by) VALUES (?,?,?,?,?,?,?)').run(transfer_no, txDate, from_account_id, to_account_id, transferAmt, description, req.user.id);

    // Ledger for from account (debit)
    const fromLast = db.prepare('SELECT balance FROM ledger WHERE account_id=? ORDER BY id DESC LIMIT 1').get(from_account_id);
    db.prepare(`INSERT INTO ledger (date,transaction_no,transaction_type,reference_type,description,debit,credit,balance,account_id,payment_method,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(txDate, transfer_no, 'transfer', 'transfer', desc, transferAmt, 0, (fromLast?.balance || 0) - transferAmt, from_account_id, 'internal', req.user.id);

    // Ledger for to account (credit)
    const toLast = db.prepare('SELECT balance FROM ledger WHERE account_id=? ORDER BY id DESC LIMIT 1').get(to_account_id);
    db.prepare(`INSERT INTO ledger (date,transaction_no,transaction_type,reference_type,description,debit,credit,balance,account_id,payment_method,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(txDate, transfer_no, 'transfer', 'transfer', desc, 0, transferAmt, (toLast?.balance || 0) + transferAmt, to_account_id, 'internal', req.user.id);
  });

  doTransfer();
  logAudit({ user_id: req.user.id, username: req.user.username, action: 'create', module: 'accounts', record_id: null, new_value: { transfer_no, amount: transferAmt }, ip_address: req.ip });
  res.status(201).json({ transfer_no, message: 'Transfer completed' });
});

// GET /api/accounts/transfers
router.get('/transfers/list', authenticateToken, (req, res) => {
  const db = getDb();
  const transfers = db.prepare(`SELECT at.*, fa.name as from_name, ta.name as to_name, u.full_name as created_by_name
    FROM account_transfers at
    LEFT JOIN accounts fa ON fa.id=at.from_account_id
    LEFT JOIN accounts ta ON ta.id=at.to_account_id
    LEFT JOIN users u ON u.id=at.created_by
    ORDER BY at.date DESC, at.id DESC LIMIT 100`).all();
  res.json(transfers);
});

module.exports = router;
