import * as XLSX from 'xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────
const num = (v) => parseFloat(v || 0);
const fmt = (v) => num(v) === 0 ? '' : num(v).toFixed(0);   // blank for zero, no decimals
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Style helpers ─────────────────────────────────────────────────────────
function cellStyle(ws, cellRef, style) {
  if (!ws[cellRef]) return;
  ws[cellRef].s = style;
}

const HEADER_STYLE = {
  font:      { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
  fill:      { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border:    { bottom: { style: 'thin', color: { rgb: 'AAAAAA' } } },
};

const TOTAL_STYLE = {
  font:      { bold: true, sz: 11 },
  fill:      { fgColor: { rgb: 'FFF2CC' } },
  alignment: { horizontal: 'right' },
};

const PROFIT_STYLE = {
  font:      { bold: true, sz: 11, color: { rgb: '006100' } },
  fill:      { fgColor: { rgb: 'C6EFCE' } },
  alignment: { horizontal: 'right' },
};

const ALT_ROW_STYLE = {
  fill: { fgColor: { rgb: 'F8F9FA' } },
};

// ── Apply styles to a range of cells in a row ─────────────────────────────
function styleRow(ws, rowIdx, numCols, style) {
  for (let c = 0; c < numCols; c++) {
    const ref = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[ref]) ws[ref] = { t: 's', v: '' };
    ws[ref].s = style;
  }
}

// ── Set column widths ─────────────────────────────────────────────────────
function setColWidths(ws, widths) {
  ws['!cols'] = widths.map(w => ({ wch: w }));
}

// ── Main export function ──────────────────────────────────────────────────
export async function exportDashboardExcel(apiData, period) {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title:       'AutoShop Manager — Business Ledger',
    Subject:     'Monthly Ledger Report',
    CreatedDate: new Date(),
  };

  const { sales, purchases, expenses, payments, investments, summary: s,
    customers, stock, monthlyPL, monthlyExp, generatedAt } = apiData;

  // ── Combine all transactions into a flat list with month key ──────────
  const allTx = [];

  // Sales → Item rows
  sales.forEach(r => {
    allTx.push({
      date:     r.date,
      item:     r.customer_name || 'Walk-in',
      purchase: 0,
      sales:    num(r.total_amount),
      received: num(r.paid_amount),
      balance:  0, // calculated later
      type:     'sale',
      note:     r.sale_no,
    });
  });

  // Purchases → Purchase rows
  purchases.forEach(r => {
    allTx.push({
      date:     r.date,
      item:     r.supplier || 'Purchase',
      purchase: num(r.total_amount),
      sales:    0,
      received: 0,
      balance:  0,
      type:     'purchase',
      note:     r.purchase_no,
    });
  });

  // Expenses → Purchase (cost) rows
  expenses.forEach(r => {
    allTx.push({
      date:     r.date,
      item:     r.category || r.paid_to || 'Expense',
      purchase: num(r.amount),
      sales:    0,
      received: 0,
      balance:  0,
      type:     'expense',
      note:     r.expense_no,
    });
  });

  // Payments received → Payment rows (dash for purchase/sales, amount in Received)
  payments.filter(p => p.type === 'received').forEach(r => {
    allTx.push({
      date:     r.date,
      item:     'Payment — ' + (r.party_name || ''),
      purchase: null,  // shows as dash
      sales:    null,  // shows as dash
      received: num(r.amount),
      balance:  0,
      type:     'payment',
      note:     r.payment_no,
    });
  });

  // Sort all transactions by date
  allTx.sort((a, b) => new Date(a.date) - new Date(b.date));

  // ── Group by month ────────────────────────────────────────────────────
  const monthMap = {};
  allTx.forEach(tx => {
    const [year, month] = tx.date.split('-');
    const key = `${year}-${month}`;
    if (!monthMap[key]) monthMap[key] = [];
    monthMap[key].push(tx);
  });

  // ── Build OVERVIEW sheet first ────────────────────────────────────────
  buildOverviewSheet(wb, s, apiData.accounts, generatedAt);

  // ── Build one sheet per month ─────────────────────────────────────────
  const sortedMonths = Object.keys(monthMap).sort();

  if (sortedMonths.length === 0) {
    // No data yet — add a blank month sheet for the current month
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthMap[key] = [];
    sortedMonths.push(key);
  }

  sortedMonths.forEach(monthKey => {
    const [year, monthNum] = monthKey.split('-');
    const monthName = MONTH_NAMES[parseInt(monthNum) - 1];
    const sheetName = `${monthName} ${year}`.substring(0, 31); // Excel sheet name limit

    buildMonthSheet(wb, sheetName, monthMap[monthKey], monthKey);
  });

  // ── All-time Ledger sheet ─────────────────────────────────────────────
  buildLedgerSheet(wb, allTx, 'All Transactions');

  // ── Customers sheet ───────────────────────────────────────────────────
  buildCustomersSheet(wb, customers);

  // ── Stock sheet ───────────────────────────────────────────────────────
  buildStockSheet(wb, stock);

  // ── Download ──────────────────────────────────────────────────────────
  const filename = `AutoShop_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.writeFile(wb, filename, { cellStyles: true });
}

// ─────────────────────────────────────────────────────────────────────────
// OVERVIEW SHEET
// ─────────────────────────────────────────────────────────────────────────
function buildOverviewSheet(wb, s, accounts, generatedAt) {
  const rows = [
    // Title
    ['AutoShop Manager — Business Overview', '', '', ''],
    ['Generated:', new Date(generatedAt).toLocaleDateString('en-IN'), '', ''],
    [],
    // Section header
    ['FINANCIAL SUMMARY', '', '', ''],
    ['Description', '', 'Amount (₹)', ''],
    ['Total Investment',       '', num(s.totalInvestment), ''],
    ['Total Sales',            '', num(s.totalSales), ''],
    ['Total Purchases',        '', num(s.totalPurchases), ''],
    ['Total Expenses',         '', num(s.totalExpenses), ''],
    ['Gross Profit',           '', num(s.grossProfit), ''],
    ['Net Profit / Loss',      '', num(s.netProfit), ''],
    ['Customer Receivable',    '', num(s.custReceivable), ''],
    ['Supplier Payable',       '', num(s.suppPayable), ''],
    [],
    ["TODAY'S ACTIVITY", '', '', ''],
    ['Description', '', 'Amount (₹)', ''],
    ["Today's Sales",          '', num(s.todaySales), ''],
    ["Today's Expenses",       '', num(s.todayExpenses), ''],
    ["Today's Income",         '', num(s.todayIncome), ''],
    ["Today's Purchases",      '', num(s.todayPurchases), ''],
    [],
    ['ACCOUNT BALANCES', '', '', ''],
    ['Account', 'Type', 'Balance (₹)', ''],
    ...accounts.map(a => [a.name, a.type.toUpperCase(), num(a.balance), '']),
    ['TOTAL', '', num(s.totalBalance), ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [30, 15, 18, 10]);

  // Style section headers
  [3, 14, 22].forEach(r => {
    styleRow(ws, r, 4, { font: { bold: true, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E3A5F' } } });
  });
  // Style column headers
  [4, 15, 23].forEach(r => {
    styleRow(ws, r, 4, HEADER_STYLE);
  });
  // Style total row
  styleRow(ws, rows.length - 1, 4, TOTAL_STYLE);

  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
    { s: { r: 14, c: 0 }, e: { r: 14, c: 3 } },
    { s: { r: 22, c: 0 }, e: { r: 22, c: 3 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Overview');
}

// ─────────────────────────────────────────────────────────────────────────
// MONTH SHEET  (Date | Item | Purchase | Sales | Received | Balance)
// ─────────────────────────────────────────────────────────────────────────
function buildMonthSheet(wb, sheetName, txList, monthKey) {
  const [year, monthNum] = monthKey.split('-');
  const monthLabel = `${MONTH_NAMES[parseInt(monthNum) - 1]} ${year}`;

  // Running balance calculation
  let balance = 0;
  const rows = [];

  // ── Title row (row 0) ──
  rows.push([monthLabel, '', '', '', '', '']);

  // ── Blank row (row 1) ──
  rows.push(['', '', '', '', '', '']);

  // ── Header row (row 2) ──
  rows.push(['Date', 'Item', 'Purchase', 'Sales', 'Received', 'Balance']);

  // ── Transaction rows ──
  txList.forEach(tx => {
    const saleAmt = num(tx.sales);
    const purAmt  = num(tx.purchase);
    const recAmt  = num(tx.received);

    // Balance logic: 
    // + Sales amount
    // - Purchase/Expense amount  
    // Payment received counts as collection (already in sales side)
    if (tx.type === 'sale')     balance += saleAmt;
    if (tx.type === 'purchase') balance -= purAmt;
    if (tx.type === 'expense')  balance -= purAmt;
    if (tx.type === 'payment')  balance += recAmt;

    // Format date as dd-Mon
    const d     = new Date(tx.date);
    const day   = String(d.getDate()).padStart(2, '0');
    const mon   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
    const dateStr = `${day}-${mon}`;

    rows.push([
      dateStr,
      tx.item,
      tx.purchase === null ? '-' : (num(tx.purchase) === 0 ? '' : num(tx.purchase)),
      tx.sales    === null ? '-' : (num(tx.sales)    === 0 ? '' : num(tx.sales)),
      num(tx.received) === 0 ? '' : num(tx.received),
      balance === 0 ? '00' : balance,
    ]);
  });

  // ── Blank separator ──
  rows.push(['', '', '', '', '', '']);
  rows.push(['', '', '', '', '', '']);

  // ── Totals row ──
  const totalPurchase = txList.reduce((s, t) => s + (t.type !== 'payment' ? num(t.purchase) : 0), 0);
  const totalSales    = txList.reduce((s, t) => s + num(t.sales), 0);
  const totalReceived = txList.reduce((s, t) => s + num(t.received), 0);
  const profit        = totalSales - totalPurchase;

  const totalRowIdx = rows.length;
  rows.push([
    'total',
    '',
    totalPurchase === 0 ? '' : totalPurchase,
    totalSales    === 0 ? '' : totalSales,
    '',
    '',
  ]);

  // ── Profit row ──
  const profitRowIdx = rows.length;
  rows.push([
    '',
    '',
    '',
    '',
    'profit',
    profit === 0 ? '00' : profit,
  ]);

  // ── Build worksheet ──
  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 28, 14, 14, 14, 14]);

  // Merge title
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
  ];

  // Style title
  const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
  if (ws[titleCell]) ws[titleCell].s = {
    font:      { bold: true, sz: 14, color: { rgb: '1E3A5F' } },
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  // Style header row
  styleRow(ws, 2, 6, HEADER_STYLE);

  // Alternate row shading for transactions
  for (let i = 3; i < totalRowIdx - 2; i++) {
    if ((i - 3) % 2 === 1) styleRow(ws, i, 6, ALT_ROW_STYLE);
  }

  // Style totals row
  styleRow(ws, totalRowIdx, 6, TOTAL_STYLE);

  // Style profit row
  styleRow(ws, profitRowIdx, 6, PROFIT_STYLE);

  // Right-align numeric columns (Purchase, Sales, Received, Balance)
  for (let r = 3; r <= profitRowIdx; r++) {
    [2, 3, 4, 5].forEach(c => {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref] && typeof ws[ref].v === 'number') {
        ws[ref].s = { ...(ws[ref].s || {}), alignment: { horizontal: 'right' } };
      }
    });
  }

  // Set row heights
  ws['!rows'] = [{ hpt: 22 }, { hpt: 6 }, { hpt: 20 }];

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// ─────────────────────────────────────────────────────────────────────────
// ALL-TIME LEDGER SHEET
// ─────────────────────────────────────────────────────────────────────────
function buildLedgerSheet(wb, allTx, sheetName) {
  let balance = 0;
  const dataRows = allTx.map(tx => {
    if (tx.type === 'sale')     balance += num(tx.sales);
    if (tx.type === 'purchase') balance -= num(tx.purchase);
    if (tx.type === 'expense')  balance -= num(tx.purchase);
    if (tx.type === 'payment')  balance += num(tx.received);

    return [
      tx.date, tx.item,
      tx.purchase === null ? '-' : (num(tx.purchase) || ''),
      tx.sales    === null ? '-' : (num(tx.sales)    || ''),
      num(tx.received) || '',
      balance || '00',
      tx.type.toUpperCase(),
      tx.note || '',
    ];
  });

  const totalPurchase = allTx.reduce((s, t) => s + (t.type !== 'payment' ? num(t.purchase) : 0), 0);
  const totalSales    = allTx.reduce((s, t) => s + num(t.sales), 0);
  const totalReceived = allTx.reduce((s, t) => s + num(t.received), 0);
  const profit        = totalSales - totalPurchase;

  const rows = [
    ['Date', 'Item', 'Purchase', 'Sales', 'Received', 'Balance', 'Type', 'Reference'],
    ...dataRows,
    [],
    ['TOTAL', '', totalPurchase || '', totalSales || '', totalReceived || '', '', '', ''],
    ['', '', '', '', 'PROFIT', profit, '', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 28, 14, 14, 14, 14, 12, 14]);

  styleRow(ws, 0, 8, HEADER_STYLE);
  for (let i = 1; i < rows.length - 3; i++) {
    if (i % 2 === 0) styleRow(ws, i, 8, ALT_ROW_STYLE);
  }
  styleRow(ws, rows.length - 2, 8, TOTAL_STYLE);
  styleRow(ws, rows.length - 1, 8, PROFIT_STYLE);

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
}

// ─────────────────────────────────────────────────────────────────────────
// CUSTOMERS SHEET
// ─────────────────────────────────────────────────────────────────────────
function buildCustomersSheet(wb, customers) {
  const rows = [
    ['Customer Name', 'Phone', 'Vehicle', 'Total Billing', 'Total Paid', 'Balance Due'],
    ...customers.map(c => [
      c.name, c.phone || '—', c.vehicle_number || '—',
      num(c.total_billing), num(c.total_paid), num(c.outstanding),
    ]),
    [],
    ['TOTAL', '', '',
      customers.reduce((s, c) => s + num(c.total_billing), 0),
      customers.reduce((s, c) => s + num(c.total_paid), 0),
      customers.reduce((s, c) => s + num(c.outstanding), 0),
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [25, 14, 14, 16, 16, 14]);
  styleRow(ws, 0, 6, HEADER_STYLE);
  styleRow(ws, rows.length - 1, 6, TOTAL_STYLE);
  for (let i = 1; i < rows.length - 2; i++) {
    if (i % 2 === 0) styleRow(ws, i, 6, ALT_ROW_STYLE);
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
}

// ─────────────────────────────────────────────────────────────────────────
// STOCK SHEET
// ─────────────────────────────────────────────────────────────────────────
function buildStockSheet(wb, stock) {
  const rows = [
    ['Part Code', 'Part Name', 'Category', 'Stock', 'Unit', 'Buy Price', 'Sell Price', 'Stock Value', 'Status'],
    ...stock.map(r => [
      r.part_code, r.part_name, r.category || '—',
      r.current_stock, r.unit,
      num(r.purchase_price), num(r.selling_price), num(r.stock_value), r.status,
    ]),
    [],
    ['', 'TOTAL STOCK VALUE', '', '', '',
      '', '', stock.reduce((s, r) => s + num(r.stock_value), 0), '',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 25, 18, 8, 8, 12, 12, 14, 14]);
  styleRow(ws, 0, 9, HEADER_STYLE);
  styleRow(ws, rows.length - 1, 9, TOTAL_STYLE);
  for (let i = 1; i < rows.length - 2; i++) {
    if (i % 2 === 0) styleRow(ws, i, 9, ALT_ROW_STYLE);
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
}
