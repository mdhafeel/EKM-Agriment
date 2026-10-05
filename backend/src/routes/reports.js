const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');
const { authenticateToken, requirePermission } = require('../middleware/auth');

// Build a safe parameterized date clause. Returns { clause, params }
function dateClause(col, from, to) {
  const parts = [];
  const params = [];
  if (from) { parts.push(`${col} >= ?`); params.push(from); }
  if (to)   { parts.push(`${col} <= ?`); params.push(to); }
  return { clause: parts.length ? parts.join(' AND ') : '1=1', params };
}

// GET /api/reports/profit-loss?from=&to=
router.get('/profit-loss', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const dc = dateClause('date', from, to);

  const salesRow = db.prepare(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(cost_of_goods),0) as cogs, COALESCE(SUM(gross_profit),0) as gross FROM sales WHERE ${dc.clause}`).get(...dc.params);
  const expenses  = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE ${dc.clause}`).get(...dc.params).total;

  const grossProfit = salesRow.gross;
  const netProfit   = grossProfit - expenses;

  const expByCategory = db.prepare(`
    SELECT COALESCE(ec.name, e.category_name, 'Other') as category,
           COALESCE(SUM(e.amount),0) as total
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE ${dc.clause}
    GROUP BY category
    ORDER BY total DESC
  `).all(...dc.params);

  // Monthly P&L — safe approach: build WHERE fragments inline
  const salesDC  = dateClause('s.date', from, to);
  const expDC    = dateClause('e.date', from, to);

  const monthlySales = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(total_amount) as sales,
           SUM(cost_of_goods) as cogs
    FROM sales
    WHERE ${dc.clause}
    GROUP BY month
  `).all(...dc.params);

  const monthlyExp = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(amount) as expenses
    FROM expenses
    WHERE ${dc.clause}
    GROUP BY month
  `).all(...dc.params);

  // Merge by month
  const monthMap = {};
  for (const r of monthlySales) {
    monthMap[r.month] = { month: r.month, sales: r.sales || 0, cogs: r.cogs || 0, expenses: 0 };
  }
  for (const r of monthlyExp) {
    if (!monthMap[r.month]) monthMap[r.month] = { month: r.month, sales: 0, cogs: 0, expenses: 0 };
    monthMap[r.month].expenses = r.expenses || 0;
  }
  const monthly = Object.values(monthMap)
    .map(r => ({ ...r, net_profit: r.sales - r.cogs - r.expenses }))
    .sort((a, b) => a.month.localeCompare(b.month));

  res.json({
    sales: salesRow.total,
    cogs: salesRow.cogs,
    gross_profit: grossProfit,
    operating_expenses: expenses,
    net_profit: netProfit,
    expense_breakdown: expByCategory,
    monthly,
  });
});

// GET /api/reports/cash-flow?from=&to=
router.get('/cash-flow', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const dc = dateClause('date', from, to);

  const get = (sql, ...p) => db.prepare(sql).get(...p);

  const customerPayments = get(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND party_type='customer' AND ${dc.clause}`, ...dc.params).t;
  const partsSalesIncome = get(`SELECT COALESCE(SUM(paid_amount),0) as t FROM sales WHERE ${dc.clause}`, ...dc.params).t;
  const investmentsIn    = get(`SELECT COALESCE(SUM(amount),0) as t FROM investments WHERE ${dc.clause}`, ...dc.params).t;
  const otherIncome      = get(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='received' AND (party_type IS NULL OR party_type NOT IN ('customer','supplier')) AND ${dc.clause}`, ...dc.params).t;

  const partsOut    = get(`SELECT COALESCE(SUM(paid_amount),0) as t FROM purchases WHERE ${dc.clause}`, ...dc.params).t;
  const supplierPay = get(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='paid' AND party_type='supplier' AND ${dc.clause}`, ...dc.params).t;
  const expenseOut  = get(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE ${dc.clause}`, ...dc.params).t;
  const otherOut    = get(`SELECT COALESCE(SUM(amount),0) as t FROM payments WHERE type='paid' AND (party_type IS NULL OR party_type NOT IN ('customer','supplier')) AND ${dc.clause}`, ...dc.params).t;

  const moneyIn  = customerPayments + partsSalesIncome + otherIncome + investmentsIn;
  const moneyOut = partsOut + supplierPay + expenseOut + otherOut;

  const monthlyFlow = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
      COALESCE(SUM(CASE WHEN type='received' THEN amount ELSE 0 END),0) as money_in,
      COALESCE(SUM(CASE WHEN type='paid'     THEN amount ELSE 0 END),0) as money_out
    FROM payments
    WHERE ${dc.clause}
    GROUP BY month
    ORDER BY month
  `).all(...dc.params);

  res.json({
    money_in:  { customer_payments: customerPayments, parts_sales: partsSalesIncome, other_income: otherIncome, investments: investmentsIn, total: moneyIn },
    money_out: { parts_purchases: partsOut, supplier_payments: supplierPay, expenses: expenseOut, other: otherOut, total: moneyOut },
    net_cash_flow: moneyIn - moneyOut,
    monthly: monthlyFlow,
  });
});

// GET /api/reports/stock
router.get('/stock', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { category_id, supplier_id, stock_status, search } = req.query;

  let where = 'sp.is_active = 1';
  const params = [];

  if (category_id)  { where += ' AND sp.category_id = ?';  params.push(category_id); }
  if (supplier_id)  { where += ' AND sp.supplier_id = ?';  params.push(supplier_id); }
  if (stock_status === 'low')  where += ' AND sp.current_stock <= sp.min_stock_level AND sp.current_stock > 0';
  else if (stock_status === 'out')  where += ' AND sp.current_stock = 0';
  else if (stock_status === 'over') where += ' AND sp.current_stock > sp.max_stock_level';
  if (search) {
    where += ' AND (sp.part_name LIKE ? OR sp.part_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const parts = db.prepare(`
    SELECT sp.*,
           pc.name  as cat_name,
           s.name   as supplier_name,
           (sp.current_stock * sp.purchase_price) as stock_value,
           (sp.current_stock * sp.selling_price)  as retail_value
    FROM spare_parts sp
    LEFT JOIN parts_categories pc ON pc.id = sp.category_id
    LEFT JOIN suppliers        s  ON s.id  = sp.supplier_id
    WHERE ${where}
    ORDER BY sp.part_name
  `).all(...params);

  const summary = db.prepare(`
    SELECT COUNT(*) as total_parts,
           COALESCE(SUM(current_stock * purchase_price), 0) as total_value,
           SUM(CASE WHEN current_stock = 0                                        THEN 1 ELSE 0 END) as out_of_stock,
           SUM(CASE WHEN current_stock <= min_stock_level AND current_stock > 0   THEN 1 ELSE 0 END) as low_stock,
           SUM(CASE WHEN current_stock > max_stock_level                          THEN 1 ELSE 0 END) as overstock
    FROM spare_parts
    WHERE is_active = 1
  `).get();

  res.json({ parts, summary });
});

// GET /api/reports/customer-outstanding
router.get('/customer-outstanding', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const customers = db.prepare(`
    SELECT c.id, c.name, c.phone, c.vehicle_number,
      COALESCE(SUM(s.total_amount),   0) as total_billing,
      COALESCE(SUM(s.paid_amount),    0) as total_paid,
      COALESCE(SUM(s.pending_amount), 0) as outstanding,
      MAX(s.date) as last_transaction
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    WHERE c.is_active = 1
    GROUP BY c.id
    HAVING outstanding > 0
    ORDER BY outstanding DESC
  `).all();
  res.json({ customers, total_outstanding: customers.reduce((acc, c) => acc + c.outstanding, 0) });
});

// GET /api/reports/supplier-outstanding
router.get('/supplier-outstanding', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const suppliers = db.prepare(`
    SELECT s.id, s.name, s.contact_number, s.gst_number,
      COALESCE(SUM(p.total_amount),   0) as total_purchases,
      COALESCE(SUM(p.paid_amount),    0) as total_paid,
      COALESCE(SUM(p.pending_amount), 0) as outstanding,
      MAX(p.date) as last_transaction
    FROM suppliers s
    LEFT JOIN purchases p ON p.supplier_id = s.id
    WHERE s.is_active = 1
    GROUP BY s.id
    HAVING outstanding > 0
    ORDER BY outstanding DESC
  `).all();
  res.json({ suppliers, total_outstanding: suppliers.reduce((acc, s) => acc + s.outstanding, 0) });
});

// GET /api/reports/gst?from=&to=
router.get('/gst', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { from, to } = req.query;
  const dc = dateClause('date', from, to);

  const salesGST    = db.prepare(`SELECT COALESCE(SUM(gst_amount),0) as total, COALESCE(SUM(total_amount),0) as gross FROM sales    WHERE ${dc.clause}`).get(...dc.params);
  const purchaseGST = db.prepare(`SELECT COALESCE(SUM(gst_amount),0) as total, COALESCE(SUM(total_amount),0) as gross FROM purchases WHERE ${dc.clause}`).get(...dc.params);

  res.json({
    output_gst:     salesGST.total,
    output_on:      salesGST.gross,
    input_gst:      purchaseGST.total,
    input_on:       purchaseGST.gross,
    net_gst_payable: salesGST.total - purchaseGST.total,
  });
});

// GET /api/reports/vehicle?vehicle_number=
router.get('/vehicle', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { vehicle_number } = req.query;
  if (!vehicle_number) return res.status(400).json({ error: 'vehicle_number required' });

  const sales     = db.prepare(`SELECT s.*, si.part_name, si.quantity, si.unit_price, si.total_amount as item_total
    FROM sales s LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.vehicle_number LIKE ?`).all(`%${vehicle_number}%`);
  const customers = db.prepare(`SELECT * FROM customers WHERE vehicle_number LIKE ?`).all(`%${vehicle_number}%`);

  res.json({ sales, customers });
});

// GET /api/reports/summary?from=&to=&type=daily|weekly|monthly|yearly
router.get('/summary', authenticateToken, requirePermission('reports'), (req, res) => {
  const db = getDb();
  const { from, to, type = 'monthly' } = req.query;
  const dc = dateClause('date', from, to);

  const groupFmt = {
    daily:   "strftime('%Y-%m-%d', date)",
    weekly:  "strftime('%Y-W%W', date)",
    yearly:  "strftime('%Y', date)",
    monthly: "strftime('%Y-%m', date)",
  }[type] || "strftime('%Y-%m', date)";

  const sales     = db.prepare(`SELECT ${groupFmt} as period, COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(paid_amount),0) as collected FROM sales     WHERE ${dc.clause} GROUP BY period ORDER BY period`).all(...dc.params);
  const expenses  = db.prepare(`SELECT ${groupFmt} as period, COALESCE(SUM(amount),0) as total                                                   FROM expenses  WHERE ${dc.clause} GROUP BY period ORDER BY period`).all(...dc.params);
  const purchases = db.prepare(`SELECT ${groupFmt} as period, COALESCE(SUM(total_amount),0) as total                                             FROM purchases WHERE ${dc.clause} GROUP BY period ORDER BY period`).all(...dc.params);

  res.json({ sales, expenses, purchases, type });
});

module.exports = router;
