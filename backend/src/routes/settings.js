const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// GET /api/settings
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// PUT /api/settings
router.put('/', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const stmt = db.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%d %H:%M:%S','now'))`);
  const upsertMany = db.transaction((entries) => {
    for (const [k, v] of entries) stmt.run(k, String(v ?? ''));
  });
  upsertMany(Object.entries(req.body));
  res.json({ message: 'Settings saved' });
});

// GET /api/settings/export-excel-data — all data for Excel export
router.get('/export-excel-data', authenticateToken, (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const today = new Date().toISOString().split('T')[0];

  let dw = '1=1';
  if (from) dw += ` AND date >= '${from}'`;
  if (to)   dw += ` AND date <= '${to}'`;

  // ── Dashboard summary ──────────────────────────────────────────────
  const totalInvestment = db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM investments').get().v;
  const totalSales      = db.prepare('SELECT COALESCE(SUM(total_amount),0) as v FROM sales').get().v;
  const totalExpenses   = db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM expenses').get().v;
  const totalCOGS       = db.prepare('SELECT COALESCE(SUM(cost_of_goods),0) as v FROM sales').get().v;
  const grossProfit     = totalSales - totalCOGS;
  const netProfit       = grossProfit - totalExpenses;
  const totalPurchases  = db.prepare('SELECT COALESCE(SUM(total_amount),0) as v FROM purchases').get().v;
  const custReceivable  = db.prepare(`SELECT COALESCE(SUM(pending_amount),0) as v FROM sales WHERE payment_status != 'paid'`).get().v;
  const suppPayable     = db.prepare(`SELECT COALESCE(SUM(pending_amount),0) as v FROM purchases WHERE payment_status != 'paid'`).get().v;
  const accounts        = db.prepare('SELECT * FROM accounts WHERE is_active=1').all();
  const cashBalance     = accounts.filter(a => a.type === 'cash').reduce((s,a) => s + a.current_balance, 0);
  const bankBalance     = accounts.filter(a => a.type === 'bank' || a.type === 'upi').reduce((s,a) => s + a.current_balance, 0);
  const totalBalance    = accounts.reduce((s,a) => s + a.current_balance, 0);

  // Today
  const todaySales     = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as v FROM sales WHERE date='${today}'`).get().v;
  const todayExpenses  = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE date='${today}'`).get().v;
  const todayIncome    = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE type='received' AND date='${today}'`).get().v;
  const todayPurchases = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as v FROM purchases WHERE date='${today}'`).get().v;

  // ── Detailed data ──────────────────────────────────────────────────
  const sales = db.prepare(`
    SELECT sale_no, date, customer_name, vehicle_number,
           total_amount, paid_amount, pending_amount,
           cost_of_goods, gross_profit, payment_status, payment_method
    FROM sales WHERE ${dw} ORDER BY date DESC
  `).all();

  const purchases = db.prepare(`
    SELECT p.purchase_no, p.date, s.name as supplier, p.invoice_number,
           p.total_amount, p.paid_amount, p.pending_amount, p.payment_status
    FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id
    WHERE ${dw} ORDER BY p.date DESC
  `).all();

  const expenses = db.prepare(`
    SELECT e.expense_no, e.date,
           COALESCE(ec.name, e.category_name, 'Other') as category,
           e.amount, e.payment_method, e.paid_to
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id=e.category_id
    WHERE ${dw} ORDER BY e.date DESC
  `).all();

  const investments = db.prepare(`
    SELECT i.investment_no, i.date, i.investor_name, i.amount, i.payment_method, i.purpose
    FROM investments i WHERE ${dw} ORDER BY i.date DESC
  `).all();

  const payments = db.prepare(`
    SELECT payment_no, date, type, party_name, amount, payment_method, status, category
    FROM payments WHERE ${dw} ORDER BY date DESC
  `).all();

  const customers = db.prepare(`
    SELECT c.name, c.phone, c.vehicle_number,
           COALESCE(SUM(s.total_amount),0) as total_billing,
           COALESCE(SUM(s.paid_amount),0)  as total_paid,
           COALESCE(SUM(s.pending_amount),0) as outstanding
    FROM customers c
    LEFT JOIN sales s ON s.customer_id=c.id
    WHERE c.is_active=1
    GROUP BY c.id ORDER BY total_billing DESC
  `).all();

  const stock = db.prepare(`
    SELECT sp.part_code, sp.part_name, sp.current_stock, sp.unit,
           sp.purchase_price, sp.selling_price,
           (sp.current_stock * sp.purchase_price) as stock_value,
           pc.name as category,
           CASE WHEN sp.current_stock=0 THEN 'Out of Stock'
                WHEN sp.current_stock <= sp.min_stock_level THEN 'Low Stock'
                ELSE 'Normal' END as status
    FROM spare_parts sp
    LEFT JOIN parts_categories pc ON pc.id=sp.category_id
    WHERE sp.is_active=1
    ORDER BY sp.part_name
  `).all();

  const monthlyPL = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           COALESCE(SUM(total_amount),0) as sales,
           COALESCE(SUM(cost_of_goods),0) as cogs,
           COALESCE(SUM(gross_profit),0) as gross_profit
    FROM sales GROUP BY month ORDER BY month
  `).all();

  const monthlyExp = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           COALESCE(SUM(amount),0) as expenses
    FROM expenses GROUP BY month ORDER BY month
  `).all();

  res.json({
    generatedAt: new Date().toISOString(),
    period: { from: from || 'All time', to: to || today },
    summary: {
      totalInvestment, totalSales, totalExpenses, totalPurchases,
      grossProfit, netProfit, custReceivable, suppPayable,
      cashBalance, bankBalance, totalBalance,
      todaySales, todayExpenses, todayIncome, todayPurchases,
    },
    accounts: accounts.map(a => ({ name: a.name, type: a.type, balance: a.current_balance })),
    sales, purchases, expenses, investments, payments,
    customers, stock, monthlyPL, monthlyExp,
  });
});

// GET /api/settings/backup — export all data as JSON
router.get('/backup', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const tables = ['users','customers','suppliers','accounts','investments','expense_categories','expenses','parts_categories','spare_parts','purchases','purchase_items','sales','sale_items','payments','ledger','account_transfers','daily_closing','invoices','notifications','audit_logs','settings'];
  const backup = {};
  for (const t of tables) {
    try { backup[t] = db.prepare(`SELECT * FROM ${t}`).all(); } catch(e) { backup[t] = []; }
  }
  res.setHeader('Content-Disposition', `attachment; filename=workshop_backup_${new Date().toISOString().split('T')[0]}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.json({ backup_date: new Date().toISOString(), data: backup });
});

// GET /api/settings/search?q=
router.get('/search', authenticateToken, (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ results: [] });

  const results = [];

  const customers = db.prepare(`SELECT id, name, phone, vehicle_number, 'customer' as type FROM customers WHERE is_active=1 AND (name LIKE ? OR phone LIKE ? OR vehicle_number LIKE ?) LIMIT 5`).all(`%${q}%`, `%${q}%`, `%${q}%`);
  results.push(...customers.map(c => ({ ...c, label: `${c.name} (${c.phone || c.vehicle_number})`, module: 'customers' })));

  const suppliers = db.prepare(`SELECT id, name, contact_number, 'supplier' as type FROM suppliers WHERE is_active=1 AND (name LIKE ? OR contact_number LIKE ?) LIMIT 5`).all(`%${q}%`, `%${q}%`);
  results.push(...suppliers.map(s => ({ ...s, label: s.name, module: 'suppliers' })));

  const parts = db.prepare(`SELECT id, part_name as name, part_code, part_number, 'part' as type FROM spare_parts WHERE is_active=1 AND (part_name LIKE ? OR part_number LIKE ? OR part_code LIKE ?) LIMIT 5`).all(`%${q}%`, `%${q}%`, `%${q}%`);
  results.push(...parts.map(p => ({ ...p, label: `${p.name} (${p.part_code})`, module: 'spare_parts' })));

  const payments = db.prepare(`SELECT id, payment_no as name, party_name, amount, 'payment' as type FROM payments WHERE payment_no LIKE ? OR party_name LIKE ? LIMIT 5`).all(`%${q}%`, `%${q}%`);
  results.push(...payments.map(p => ({ ...p, label: `${p.name} - ${p.party_name}`, module: 'payments' })));

  const invoices = db.prepare(`SELECT id, invoice_no as name, customer_name, total_amount, 'invoice' as type FROM invoices WHERE invoice_no LIKE ? OR customer_name LIKE ? LIMIT 5`).all(`%${q}%`, `%${q}%`);
  results.push(...invoices.map(i => ({ ...i, label: `${i.name} - ${i.customer_name}`, module: 'invoices' })));

  res.json({ results });
});

// GET /api/settings/invoices/:id — get invoice for print
router.get('/invoices/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const invoice = db.prepare(`SELECT i.*, u.full_name as created_by_name FROM invoices i LEFT JOIN users u ON u.id=i.created_by WHERE i.id=?`).get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  let items = [];
  if (invoice.sale_id) items = db.prepare('SELECT * FROM sale_items WHERE sale_id=?').all(invoice.sale_id);
  else if (invoice.purchase_id) items = db.prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(invoice.purchase_id);

  const businessSettings = {};
  const rows = db.prepare(`SELECT key,value FROM settings WHERE key LIKE 'business%' OR key='currency' OR key='invoice_prefix'`).all();
  rows.forEach(r => { businessSettings[r.key] = r.value; });

  res.json({ invoice, items, business: businessSettings });
});

// GET /api/settings/invoices — list all invoices
router.get('/invoices', authenticateToken, (req, res) => {
  const db = getDb();
  const { search, from, to, status, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  let where = '1=1';
  const params = [];
  if (search) { where += ` AND (invoice_no LIKE ? OR customer_name LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (from) { where += ` AND date >= ?`; params.push(from); }
  if (to) { where += ` AND date <= ?`; params.push(to); }
  if (status) { where += ` AND payment_status = ?`; params.push(status); }
  const invoices = db.prepare(`SELECT * FROM invoices WHERE ${where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as cnt FROM invoices WHERE ${where}`).get(...params).cnt;
  res.json({ invoices, total });
});

module.exports = router;
