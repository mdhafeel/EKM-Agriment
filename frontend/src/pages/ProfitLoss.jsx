import { useState, useEffect } from 'react';
import api from '../utils/api';
import { currency } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Minus } from 'lucide-react';

export default function ProfitLoss() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/reports/profit-loss?${params}`);
      setData(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Profit & Loss" subtitle="Financial performance overview" />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-gray-600">Date Range:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        <button onClick={fetchData} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Apply</button>
        <button onClick={() => { setFrom(''); setTo(''); setTimeout(fetchData, 50); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">All Time</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
      ) : data && (
        <>
          {/* P&L Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase font-medium mb-1">Gross Sales</p>
              <p className="text-2xl font-bold text-gray-900">{currency(data.sales)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase font-medium mb-1">Cost of Goods</p>
              <p className="text-2xl font-bold text-red-600">{currency(data.cogs)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase font-medium mb-1">Gross Profit</p>
              <p className={`text-2xl font-bold ${data.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{currency(data.gross_profit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <p className="text-xs text-gray-500 uppercase font-medium mb-1">Operating Expenses</p>
              <p className="text-2xl font-bold text-orange-600">{currency(data.operating_expenses)}</p>
            </div>
          </div>

          {/* Net Profit Card */}
          <div className={`rounded-xl p-6 text-white ${data.net_profit >= 0 ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}>
            <div className="flex items-center gap-3">
              {data.net_profit >= 0 ? <TrendingUp size={32} /> : <TrendingDown size={32} />}
              <div>
                <p className="text-white/80 text-sm">Net {data.net_profit >= 0 ? 'Profit' : 'Loss'}</p>
                <p className="text-4xl font-bold">{currency(Math.abs(data.net_profit))}</p>
              </div>
            </div>
            <p className="text-white/70 text-sm mt-2">Gross Profit ({currency(data.gross_profit)}) − Operating Expenses ({currency(data.operating_expenses)})</p>
          </div>

          {/* Statement Table */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-900">P&L Statement</h3></div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="bg-green-50"><td className="px-5 py-3 font-semibold text-gray-700">INCOME</td><td></td></tr>
                <tr className="border-b border-gray-50"><td className="px-5 py-3 pl-10 text-gray-600">Parts Sales Revenue</td><td className="px-5 py-3 text-right font-medium text-green-600">{currency(data.sales)}</td></tr>
                <tr className="bg-gray-50 border-b"><td className="px-5 py-3 font-semibold text-gray-700">Total Income</td><td className="px-5 py-3 text-right font-bold">{currency(data.sales)}</td></tr>

                <tr className="bg-red-50 mt-2"><td className="px-5 py-3 font-semibold text-gray-700">COST OF GOODS SOLD</td><td></td></tr>
                <tr className="border-b border-gray-50"><td className="px-5 py-3 pl-10 text-gray-600">Purchase Cost of Sold Items</td><td className="px-5 py-3 text-right text-red-600 font-medium">{currency(data.cogs)}</td></tr>
                <tr className="bg-gray-50 border-b"><td className="px-5 py-3 font-semibold text-gray-700">Gross Profit</td><td className={`px-5 py-3 text-right font-bold ${data.gross_profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{currency(data.gross_profit)}</td></tr>

                <tr className="bg-orange-50 mt-2"><td className="px-5 py-3 font-semibold text-gray-700">OPERATING EXPENSES</td><td></td></tr>
                {data.expense_breakdown?.map(e => (
                  <tr key={e.category} className="border-b border-gray-50"><td className="px-5 py-3 pl-10 text-gray-600">{e.category}</td><td className="px-5 py-3 text-right text-orange-600">{currency(e.total)}</td></tr>
                ))}
                <tr className="bg-gray-50 border-b"><td className="px-5 py-3 font-semibold">Total Expenses</td><td className="px-5 py-3 text-right font-bold text-orange-600">{currency(data.operating_expenses)}</td></tr>

                <tr className={data.net_profit >= 0 ? 'bg-green-100' : 'bg-red-100'}><td className="px-5 py-4 font-bold text-lg">NET {data.net_profit >= 0 ? 'PROFIT' : 'LOSS'}</td><td className={`px-5 py-4 text-right font-bold text-xl ${data.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{currency(Math.abs(data.net_profit))}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Monthly Chart */}
          {data.monthly?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Monthly P&L</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '₹' + (v/1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={v => currency(v)} />
                  <Legend />
                  <Bar dataKey="sales" name="Sales" fill="#6366f1" radius={[3,3,0,0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3,3,0,0]} />
                  <Bar dataKey="net_profit" name="Net Profit" fill="#10b981" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}
