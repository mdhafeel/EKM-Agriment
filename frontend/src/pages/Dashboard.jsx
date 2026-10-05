import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import StatCard from '../components/common/StatCard';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertTriangle, ArrowDown, ArrowUp, RefreshCw, Calendar, Download } from 'lucide-react';
import { useRefresh } from '../context/RefreshContext';
import { exportDashboardExcel } from '../utils/exportExcel';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'year', label: 'This Year' },
  { key: 'custom', label: 'Custom' },
];

const fmt = (v) => '₹' + (parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshKey } = useRefresh();
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/dashboard?period=${period}`;
      if (period === 'custom' && customFrom && customTo) url += `&from=${customFrom}&to=${customTo}`;
      const res = await api.get(url);
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo]);

  // Re-fetch when period changes, user navigates here, or any page triggers global refresh
  useEffect(() => { fetchData(); }, [fetchData, location.key, refreshKey]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (period === 'custom' && customFrom && customTo) {
        params.set('from', customFrom);
        params.set('to', customTo);
      } else if (period === 'today') {
        const t = new Date().toISOString().split('T')[0];
        params.set('from', t); params.set('to', t);
      } else if (period === 'month') {
        const m = new Date().toISOString().substring(0, 7);
        params.set('from', `${m}-01`);
        params.set('to', new Date().toISOString().split('T')[0]);
      } else if (period === 'year') {
        const y = new Date().getFullYear();
        params.set('from', `${y}-01-01`);
        params.set('to', `${y}-12-31`);
      }
      const res = await api.get(`/settings/export-excel-data?${params}`);
      await exportDashboardExcel(res.data, res.data.period);
    } catch (e) {
      console.error('Export failed:', e);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary || {};
  const t = data?.today || {};

  const statusBadge = (val, good = true) => val > 0
    ? <span className={`text-xs font-semibold ${good ? 'text-green-600' : 'text-red-600'}`}>{currency(val)}</span>
    : <span className="text-xs text-gray-400">₹0.00</span>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">Business overview and analytics</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={fetchData} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition" title="Refresh">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleExport} disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition"
            >
              <Download size={14} />
              <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export Excel'}</span>
              <span className="sm:hidden">{exporting ? '...' : 'Excel'}</span>
            </button>
          </div>
        </div>

        {/* Period filter — scrollable on mobile */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap flex-shrink-0
                ${period === p.key ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date range */}
        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]" />
            <input type="date" value={customTo}   onChange={e => setCustomTo(e.target.value)}   className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[140px]" />
            <button onClick={fetchData} className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm">Apply</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <StatCard title="Total Investment"    value={currency(s.totalInvestment)}    onClick={() => navigate('/investments')} />
            <StatCard title="Total Sales"         value={currency(s.totalSales)}         onClick={() => navigate('/sales')} />
            <StatCard title="Total Expenses"      value={currency(s.totalExpenses)}      onClick={() => navigate('/expenses')} />
            <StatCard title="Customer Receivable" value={currency(s.customerReceivable)} subtitle="Outstanding from customers" onClick={() => navigate('/customers')} />
            <StatCard title="Supplier Payable"    value={currency(s.supplierPayable)}    subtitle="Owed to suppliers" onClick={() => navigate('/suppliers')} />
          </div>

          {/* Account Balances — Cash + Bank + UPI + Total */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Account Balances</h3>
              <button onClick={() => navigate('/accounts')} className="text-xs text-indigo-600 hover:underline">Manage accounts</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Cash */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 cursor-pointer hover:bg-gray-100 transition" onClick={() => navigate('/accounts')}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Cash Balance</p>
                <p className="text-xl font-bold text-gray-900">{currency(s.cashBalance)}</p>
                <p className="text-xs text-gray-400 mt-1">Physical cash in hand</p>
              </div>
              {/* Bank + UPI combined */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 cursor-pointer hover:bg-gray-100 transition" onClick={() => navigate('/accounts')}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Bank Balance</p>
                <p className="text-xl font-bold text-gray-900">{currency(s.bankBalance)}</p>
                <div className="flex items-center gap-3 mt-1">
                  {s.bankOnlyBalance > 0 && <span className="text-xs text-gray-400">Bank: {currency(s.bankOnlyBalance)}</span>}
                  {s.upiBalance > 0 && <span className="text-xs text-gray-400">UPI: {currency(s.upiBalance)}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">Bank + UPI accounts</p>
              </div>
              {/* UPI separately for clarity */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 cursor-pointer hover:bg-gray-100 transition" onClick={() => navigate('/accounts')}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">UPI Balance</p>
                <p className="text-xl font-bold text-gray-900">{currency(s.upiBalance || 0)}</p>
                <p className="text-xs text-gray-400 mt-1">Included in Bank Balance</p>
              </div>
              {/* Total across all accounts */}
              <div className="bg-gray-900 rounded-xl p-4 cursor-pointer hover:bg-gray-800 transition" onClick={() => navigate('/accounts')}>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Total Balance</p>
                <p className="text-xl font-bold text-white">{currency(s.totalBalance || (s.cashBalance + s.bankBalance))}</p>
                <p className="text-xs text-gray-400 mt-1">Cash + Bank + UPI</p>
              </div>
            </div>

            {/* Per-account breakdown if multiple accounts */}
            {data?.accounts && data.accounts.length > 3 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-3">All Accounts</p>
                <div className="flex flex-wrap gap-3">
                  {data.accounts.map(acc => (
                    <div key={acc.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${acc.current_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <span className="text-gray-600 font-medium">{acc.name}</span>
                      <span className={`font-bold ${acc.current_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{currency(acc.current_balance)}</span>
                      <span className="text-xs text-gray-400 capitalize">({acc.type})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profit Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gross Profit</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">{currency(s.grossProfit)}</p>
              <p className="text-xs text-gray-400 mt-1">Sales minus cost of goods</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Net {s.netProfit >= 0 ? 'Profit' : 'Loss'}</p>
              <p className={`text-3xl font-bold mt-1 ${s.netProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{currency(Math.abs(s.netProfit))}</p>
              <p className="text-xs text-gray-400 mt-1">After all operating expenses</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Outstanding Payments</p>
              <p className="text-3xl font-bold mt-1 text-gray-900">{currency((s.overduePayments || 0) + (s.pendingPayments || 0))}</p>
              <p className="text-xs text-gray-400 mt-1">{s.overduePayments > 0 ? `₹${(s.overduePayments || 0).toLocaleString('en-IN', {maximumFractionDigits:0})} overdue` : 'No overdue payments'}</p>
            </div>
          </div>

          {/* Today's Summary */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={18} className="text-indigo-600" />
              <h3 className="font-semibold text-gray-900">Today's Activity</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Today's Income", val: t.income, color: 'green' },
                { label: "Today's Expenses", val: t.expenses, color: 'red' },
                { label: "Today's Sales", val: t.sales, color: 'blue' },
                { label: "Today's Purchases", val: t.purchases, color: 'orange' },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className={`text-lg font-bold text-${item.color}-600`}>{currency(item.val)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Income vs Expense */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Daily Income vs Expense (Last 30 Days)</h3>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={data?.charts?.daily || []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v?.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={(v, n) => [currency(v), n === 'sales' ? 'Sales' : 'Expenses']} labelFormatter={l => date(l)} />
                  <Legend />
                  <Area type="monotone" dataKey="sales" name="Sales" stroke="#6366f1" fill="url(#salesGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fill="url(#expGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Monthly Revenue */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Monthly Revenue</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data?.charts?.monthly || []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={(v) => currency(v)} />
                  <Bar dataKey="sales" name="Sales" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent Transactions */}
            <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Recent Transactions</h3>
                <button onClick={() => navigate('/payments')} className="text-xs text-indigo-600 hover:underline">View all</button>
              </div>
              <div className="space-y-3">
                {(data?.recentTransactions || []).slice(0, 6).map((tx, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tx.type === 'received' ? 'bg-green-100' : 'bg-red-100'}`}>
                      {tx.type === 'received' ? <ArrowUp size={14} className="text-green-600" /> : <ArrowDown size={14} className="text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{tx.name}</p>
                      <p className="text-xs text-gray-400">{date(tx.date)}</p>
                    </div>
                    <p className={`text-sm font-semibold ${tx.type === 'received' ? 'text-green-600' : 'text-red-600'}`}>{currency(tx.amount)}</p>
                  </div>
                ))}
                {!(data?.recentTransactions?.length) && <p className="text-sm text-gray-400 text-center py-4">No transactions yet</p>}
              </div>
            </div>

            {/* Low Stock */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-yellow-500" />
                  <h3 className="font-semibold text-gray-900">Low Stock</h3>
                  {s.lowStockCount > 0 && <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full">{s.lowStockCount}</span>}
                </div>
                <button onClick={() => navigate('/stock')} className="text-xs text-indigo-600 hover:underline">View all</button>
              </div>
              <div className="space-y-2">
                {(data?.lowStockItems || []).slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.part_name}</p>
                      <p className="text-xs text-gray-400">{p.part_code}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.current_stock === 0 ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {p.current_stock === 0 ? 'Out' : p.current_stock} {p.unit}
                    </span>
                  </div>
                ))}
                {!(data?.lowStockItems?.length) && <p className="text-sm text-gray-400 text-center py-4">All items have sufficient stock</p>}
              </div>
            </div>

            {/* Pending Payments */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Pending Payments</h3>
                <button onClick={() => navigate('/payments')} className="text-xs text-indigo-600 hover:underline">View all</button>
              </div>
              <div className="space-y-3">
                {(data?.pendingList || []).slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{p.party_name}</p>
                      <p className="text-xs text-gray-400">{p.due_date ? `Due: ${date(p.due_date)}` : date(p.date)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-orange-600">{currency(p.pending_amount || p.amount)}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${p.status === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.status}</span>
                    </div>
                  </div>
                ))}
                {!(data?.pendingList?.length) && <p className="text-sm text-gray-400 text-center py-4">No pending payments</p>}
              </div>
            </div>
          </div>

          {/* Each account individually — shown when there are more than 3 accounts */}
          {data?.accounts && data.accounts.length > 3 && null}
        </>
      )}
    </div>
  );
}
