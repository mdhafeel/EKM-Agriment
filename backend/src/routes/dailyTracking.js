const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken } = require('../middleware/auth');

// GET /api/daily-tracking/:date
router.get('/:date', authenticateToken, (req, res) => {
  const db = getDb();
  const { date } = req.params;

  // Get existing closing record
  const closing = db.prepare('SELECT * FROM daily_closing WHERE date=?').get(date);

  // Compute actuals for the date
  const cashIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='received' AND payment_method='cash' AND date=?`).get(date).total;
  const upiIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='received' AND payment_method='upi' AND date=?`).get(date).total;
  const bankIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='received' AND payment_method='bank_transfer' AND date=?`).get(date).total;
  const cashPaid = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='paid' AND payment_method='cash' AND date=?`).get(date).total;
  const partsPurchase = db.prepare(`SELECT COALESCE(SUM(paid_amount),0) as total FROM purchases WHERE date=?`).get(date).total;
  const partsSales = db.prepare(`SELECT COALESCE(SUM(paid_amount),0) as total FROM sales WHERE date=?`).get(date).total;
  const expenses = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date=?`).get(date).total;
  const investments = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM investments WHERE date=?`).get(date).total;
  const customerPayments = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='received' AND party_type='customer' AND date=?`).get(date).total;
  const supplierPayments = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE type='paid' AND party_type='supplier' AND date=?`).get(date).total;

  // All transactions of the day
  const transactions = {
    payments: db.prepare(`SELECT * FROM payments WHERE date=? ORDER BY created_at`).all(date),
    expenses: db.prepare(`SELECT * FROM expenses WHERE date=? ORDER BY created_at`).all(date),
    purchases: db.prepare(`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.date=? ORDER BY p.created_at`).all(date),
    sales: db.prepare(`SELECT * FROM sales WHERE date=? ORDER BY created_at`).all(date),
    investments: db.prepare(`SELECT * FROM investments WHERE date=? ORDER BY created_at`).all(date),
  };

  // Account balances
  const accounts = db.prepare('SELECT * FROM accounts WHERE is_active=1').all();

  const computed = {
    date,
    cash_received: cashIncome,
    upi_received: upiIncome,
    bank_received: bankIncome,
    cash_paid: cashPaid,
    parts_purchase: partsPurchase,
    parts_sales: partsSales,
    other_expenses: expenses,
    investment_added: investments,
    customer_payments: customerPayments,
    supplier_payments: supplierPayments,
  };

  res.json({ closing, computed, transactions, accounts });
});

// GET /api/daily-tracking — list all daily summaries
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const { year, month } = req.query;
  let where = '1=1';
  const params = [];
  if (year) { where += ` AND date LIKE ?`; params.push(`${year}%`); }
  if (month) { where += ` AND date LIKE ?`; params.push(`${month}%`); }

  const closings = db.prepare(`SELECT * FROM daily_closing WHERE ${where} ORDER BY date DESC`).all(...params);

  // Also build computed summaries for dates without a closing record
  let startDate, endDate;
  if (month) {
    startDate = `${month}-01`;
    const d = new Date(month + '-01');
    d.setMonth(d.getMonth() + 1); d.setDate(0);
    endDate = d.toISOString().split('T')[0];
  } else if (year) {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  res.json({ closings });
});

// POST /api/daily-tracking/:date/close
router.post('/:date/close', authenticateToken, (req, res) => {
  const db = getDb();
  const { date } = req.params;
  const { opening_cash, notes } = req.body;

  const cashIn = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND payment_method='cash' AND date=?`).get(date).t;
  const cashOut = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE payment_method='cash' AND date=?`).get(date).t +
    db.prepare(`SELECT COALESCE(SUM(paid_amount),0) as t FROM purchases WHERE payment_method='cash' AND date=?`).get(date).t +
    db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='paid' AND payment_method='cash' AND date=?`).get(date).t;
  const upiIn = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND payment_method='upi' AND date=?`).get(date).t;
  const bankIn = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND payment_method='bank_transfer' AND date=?`).get(date).t;
  const partsPurchase = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM purchases WHERE date=?`).get(date).t;
  const partsSales = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as t FROM sales WHERE date=?`).get(date).t;
  const workshopIncome = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND category='Workshop' AND date=?`).get(date).t;
  const otherExp = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE date=?`).get(date).t;
  const investmentAdded = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM investments WHERE date=?`).get(date).t;
  const customerPay = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND party_type='customer' AND date=?`).get(date).t;
  const supplierPay = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='paid' AND party_type='supplier' AND date=?`).get(date).t;

  const openCash = parseFloat(opening_cash) || 0;
  const closingCash = openCash + cashIn - cashOut;
  const bankAccount = db.prepare(`SELECT current_balance FROM accounts WHERE type='bank' ORDER BY id LIMIT 1`).get()?.current_balance || 0;
  const dailyProfit = partsSales - partsPurchase - otherExp;

  const existing = db.prepare('SELECT id FROM daily_closing WHERE date=?').get(date);
  if (existing) {
    db.prepare(`UPDATE daily_closing SET opening_cash=?,cash_received=?,cash_paid=?,upi_received=?,bank_received=?,parts_purchase=?,parts_sales=?,workshop_income=?,other_income=?,other_expenses=?,investment_added=?,customer_payments=?,supplier_payments=?,closing_cash=?,closing_bank=?,daily_profit=?,notes=?,updated_at=datetime('now') WHERE date=?`).run(openCash,cashIn,cashOut,upiIn,bankIn,partsPurchase,partsSales,workshopIncome,0,otherExp,investmentAdded,customerPay,supplierPay,closingCash,bankAccount,dailyProfit,notes,date);
  } else {
    db.prepare(`INSERT INTO daily_closing (date,opening_cash,cash_received,cash_paid,upi_received,bank_received,parts_purchase,parts_sales,workshop_income,other_income,other_expenses,investment_added,customer_payments,supplier_payments,closing_cash,closing_bank,daily_profit,notes,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(date,openCash,cashIn,cashOut,upiIn,bankIn,partsPurchase,partsSales,workshopIncome,0,otherExp,investmentAdded,customerPay,supplierPay,closingCash,bankAccount,dailyProfit,notes,req.user.id);
  }

  res.json({ message: 'Daily closing saved', closing_cash: closingCash, daily_profit: dailyProfit });
});

module.exports = router;
