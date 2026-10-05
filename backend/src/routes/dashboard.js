const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { period = 'month', from, to } = req.query;
  const today = new Date().toISOString().split('T')[0];

  // Build date filter string (values are hardcoded ISO dates — safe, not user SQL injection)
  let dateFilter = '1=1';
  switch (period) {
    case 'today':      dateFilter = `date = '${today}'`; break;
    case 'yesterday':  { const y = new Date(); y.setDate(y.getDate()-1); dateFilter = `date = '${y.toISOString().split('T')[0]}'`; break; }
    case 'week':       { const w = new Date(); w.setDate(w.getDate()-7);  dateFilter = `date >= '${w.toISOString().split('T')[0]}'`; break; }
    case 'month':      dateFilter = `date LIKE '${today.substring(0,7)}%'`; break;
    case 'last_month': { const d = new Date(); d.setMonth(d.getMonth()-1); dateFilter = `date LIKE '${d.toISOString().substring(0,7)}%'`; break; }
    case 'year':       dateFilter = `date LIKE '${today.substring(0,4)}%'`; break;
    case 'custom':     if (from && to) dateFilter = `date >= '${from}' AND date <= '${to}'`; break;
  }

  // ── All-time totals ──────────────────────────────────────────────
  const totalInvestment  = db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM investments').get().v;
  const totalSales       = db.prepare('SELECT COALESCE(SUM(total_amount),0) as v FROM sales').get().v;
  const totalPartsValue  = db.prepare('SELECT COALESCE(SUM(current_stock * purchase_price),0) as v FROM spare_parts WHERE is_active=1').get().v;
  const totalExpenses    = db.prepare('SELECT COALESCE(SUM(amount),0) as v FROM expenses').get().v;
  const totalPurchases   = db.prepare('SELECT COALESCE(SUM(total_amount),0) as v FROM purchases').get().v;
  const totalCOGS        = db.prepare('SELECT COALESCE(SUM(cost_of_goods),0) as v FROM sales').get().v;

  // Customer receivable = sum of pending_amount on SALES (not payments)
  const customerReceivable = db.prepare(`SELECT COALESCE(SUM(pending_amount),0) as v FROM sales WHERE payment_status != 'paid'`).get().v;
  // Supplier payable = sum of pending_amount on PURCHASES
  const supplierPayable    = db.prepare(`SELECT COALESCE(SUM(pending_amount),0) as v FROM purchases WHERE payment_status != 'paid'`).get().v;

  const accounts    = db.prepare('SELECT * FROM accounts WHERE is_active=1').all();
  const cashBalance = accounts.filter(a => a.type === 'cash').reduce((s, a) => s + a.current_balance, 0);
  // bankBalance includes BOTH bank + UPI so investor UPI payment always shows in "Bank Balance"
  const bankBalance = accounts.filter(a => a.type === 'bank' || a.type === 'upi').reduce((s, a) => s + a.current_balance, 0);
  const upiBalance  = accounts.filter(a => a.type === 'upi').reduce((s, a) => s + a.current_balance, 0);
  const bankOnlyBalance = accounts.filter(a => a.type === 'bank').reduce((s, a) => s + a.current_balance, 0);
  const otherBalance = accounts.filter(a => !['cash','bank','upi'].includes(a.type)).reduce((s, a) => s + a.current_balance, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.current_balance, 0);

  const grossProfit = totalSales - totalCOGS;
  const netProfit   = grossProfit - totalExpenses;

  // Overdue / pending payments: use amount column (payments table has no pending_amount)
  const overduePayments = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE status='overdue'`).get().v;
  const pendingPayments = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE status IN ('pending','partial')`).get().v;

  // Stock alerts
  const lowStockCount   = db.prepare('SELECT COUNT(*) as v FROM spare_parts WHERE is_active=1 AND current_stock <= min_stock_level AND current_stock > 0').get().v;
  const outOfStockCount = db.prepare('SELECT COUNT(*) as v FROM spare_parts WHERE is_active=1 AND current_stock = 0').get().v;

  // ── Period-filtered stats ────────────────────────────────────────
  const periodSales      = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(paid_amount),0) as received FROM sales WHERE ${dateFilter}`).get();
  const periodExpenses   = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE ${dateFilter}`).get().v;
  const periodPurchases  = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as v FROM purchases WHERE ${dateFilter}`).get().v;
  const periodInvestment = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM investments WHERE ${dateFilter}`).get().v;
  const periodIncome     = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE type='received' AND ${dateFilter}`).get().v;

  // ── Today specifics ──────────────────────────────────────────────
  const todayIncome    = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE type='received' AND date='${today}'`).get().v;
  const todayExpenses  = db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE date='${today}'`).get().v;
  const todayPurchases = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as v FROM purchases WHERE date='${today}'`).get().v;
  const todaySales     = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as v FROM sales WHERE date='${today}'`).get().v;

  // ── Charts ───────────────────────────────────────────────────────
  const dailyChart = db.prepare(`
    WITH RECURSIVE cnt(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM cnt WHERE n < 29)
    SELECT date(strftime('%Y-%m-%d','now','-' || n || ' days')) as date,
      COALESCE((SELECT SUM(total_amount) FROM sales s WHERE s.date = date(strftime('%Y-%m-%d','now','-' || n || ' days'))),0) as sales,
      COALESCE((SELECT SUM(amount)       FROM expenses e WHERE e.date = date(strftime('%Y-%m-%d','now','-' || n || ' days'))),0) as expenses
    FROM cnt ORDER BY date
  `).all();

  const monthlyChart = db.prepare(`
    SELECT strftime('%Y-%m', date) as month, COALESCE(SUM(total_amount),0) as sales
    FROM sales WHERE date >= date(strftime('%Y-%m-%d','now','-365 days'))
    GROUP BY month ORDER BY month
  `).all();

  // ── Recent transactions ──────────────────────────────────────────
  const recentTransactions = db.prepare(`
    SELECT 'payment' as type, payment_no as ref, date, party_name as name, amount, payment_method, status
    FROM payments ORDER BY created_at DESC LIMIT 5
  `).all();

  // ── Low stock items ──────────────────────────────────────────────
  const lowStockItems = db.prepare(`
    SELECT id, part_name, part_code, current_stock, min_stock_level, unit
    FROM spare_parts WHERE is_active=1 AND current_stock <= min_stock_level
    ORDER BY current_stock ASC LIMIT 10
  `).all();

  // ── Pending payments list ────────────────────────────────────────
  // payments.amount = the full amount; no pending_amount column on payments
  const pendingList = db.prepare(`
    SELECT payment_no, date, party_name, amount, amount as pending_amount, status, due_date
    FROM payments WHERE status IN ('pending','partial','overdue')
    ORDER BY due_date ASC NULLS LAST LIMIT 10
  `).all();

  res.json({
    summary: {
      totalInvestment, totalSales, totalExpenses, totalPurchases,
      totalPartsValue, customerReceivable, supplierPayable,
      cashBalance, bankBalance, upiBalance, bankOnlyBalance, otherBalance, totalBalance,
      grossProfit, netProfit,
      overduePayments, pendingPayments, lowStockCount, outOfStockCount
    },
    period: {
      sales: periodSales.total, received: periodSales.received,
      expenses: periodExpenses, purchases: periodPurchases,
      investment: periodInvestment, income: periodIncome
    },
    today: { income: todayIncome, expenses: todayExpenses, purchases: todayPurchases, sales: todaySales },
    charts: { daily: dailyChart, monthly: monthlyChart },
    recentTransactions,
    lowStockItems,
    pendingList,
    accounts
  });
});

module.exports = router;
