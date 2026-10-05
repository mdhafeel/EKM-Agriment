const { getDb } = require('./schema');

// Generate sequential codes like INV-0001
function generateCode(prefix, table, codeColumn) {
  const db = getDb();
  const row = db.prepare(`SELECT ${codeColumn} FROM ${table} WHERE ${codeColumn} LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}-%`);
  if (!row) return `${prefix}-0001`;
  const lastNum = parseInt(row[codeColumn].split('-').pop(), 10) || 0;
  return `${prefix}-${String(lastNum + 1).padStart(4, '0')}`;
}

// Get setting value
function getSetting(key) {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

// Update account balance by delta — uses strftime for portability
function updateAccountBalance(accountId, delta) {
  if (!accountId || accountId === '' || accountId === 'null' || isNaN(parseInt(accountId))) return;
  const id = parseInt(accountId);
  if (!id || id <= 0) return;
  const db = getDb();
  db.prepare(`UPDATE accounts SET current_balance = current_balance + ?, updated_at = strftime('%Y-%m-%d %H:%M:%S','now') WHERE id = ?`)
    .run(delta, id);
}

// Add ledger entry
function addLedgerEntry({ date, transaction_no, transaction_type, reference_type, reference_id,
  description, debit, credit, account_id, payment_method, party_name, created_by }) {
  const db = getDb();
  const lastEntry = db.prepare('SELECT balance FROM ledger WHERE account_id = ? ORDER BY id DESC LIMIT 1').get(account_id);
  const prevBalance = lastEntry ? lastEntry.balance : 0;
  const balance = prevBalance + (credit || 0) - (debit || 0);
  db.prepare(`INSERT INTO ledger (date, transaction_no, transaction_type, reference_type, reference_id,
    description, debit, credit, balance, account_id, payment_method, party_name, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    date, transaction_no, transaction_type, reference_type, reference_id,
    description, debit || 0, credit || 0, balance, account_id, payment_method, party_name, created_by
  );
}

// Log audit
function logAudit({ user_id, username, action, module, record_id, old_value, new_value, ip_address }) {
  const db = getDb();
  db.prepare(`INSERT INTO audit_logs (user_id, username, action, module, record_id, old_value, new_value, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    user_id, username, action, module, record_id,
    old_value ? JSON.stringify(old_value) : null,
    new_value ? JSON.stringify(new_value) : null,
    ip_address
  );
}

// Create notification
function createNotification({ type, title, message, reference_type, reference_id }) {
  const db = getDb();
  db.prepare(`INSERT INTO notifications (type, title, message, reference_type, reference_id)
    VALUES (?, ?, ?, ?, ?)`).run(type, title, message, reference_type, reference_id);
}

// Check and create low stock notifications
function checkLowStock() {
  const db = getDb();
  const lowStockParts = db.prepare(`
    SELECT id, part_name, current_stock, min_stock_level
    FROM spare_parts
    WHERE is_active = 1 AND current_stock <= min_stock_level
  `).all();
  for (const part of lowStockParts) {
    const existing = db.prepare(`
      SELECT id FROM notifications WHERE reference_type = 'spare_part' AND reference_id = ?
      AND type IN ('low_stock','out_of_stock') AND is_read = 0
    `).get(part.id);
    if (!existing) {
      const type = part.current_stock === 0 ? 'out_of_stock' : 'low_stock';
      createNotification({
        type,
        title: part.current_stock === 0 ? 'Out of Stock' : 'Low Stock Alert',
        message: `${part.part_name}: ${part.current_stock} units remaining (min: ${part.min_stock_level})`,
        reference_type: 'spare_part',
        reference_id: part.id
      });
    }
  }
}

module.exports = { generateCode, getSetting, updateAccountBalance, addLedgerEntry, logAudit, createNotification, checkLowStock };
