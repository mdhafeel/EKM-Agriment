import { useState, useEffect } from 'react';
import api from '../utils/api';
import { currency, date, today } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import PageHeader from '../components/common/PageHeader';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

export default function DailyTracking() {
  const [selectedDate, setSelectedDate] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [closing, setClosing] = useState(null);
  const [openingCash, setOpeningCash] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const { success, error } = useNotification();

  const fetchDay = async (d) => {
    setLoading(true);
    try {
      const res = await api.get(`/daily-tracking/${d}`);
      setData(res.data);
      setClosing(res.data.closing);
      setOpeningCash(res.data.closing?.opening_cash || '');
      setNotes(res.data.closing?.notes || '');
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchDay(selectedDate); }, [selectedDate]);

  const changeDate = (delta) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  const handleClose = async () => {
    setSaving(true);
    try {
      const res = await api.post(`/daily-tracking/${selectedDate}/close`, { opening_cash: parseFloat(openingCash) || 0, notes });
      success('Daily closing saved');
      fetchDay(selectedDate);
    } catch (e) { error(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const c = data?.computed || {};
  const cl = closing;

  const rows = [
    { label: 'Opening Cash', val: cl?.opening_cash ?? openingCash, highlight: false, editable: true },
    { label: 'Cash Received', val: c.cash_received, color: 'green' },
    { label: 'UPI Received', val: c.upi_received, color: 'green' },
    { label: 'Bank Received', val: c.bank_received, color: 'green' },
    { label: 'Cash Paid', val: c.cash_paid, color: 'red' },
    { label: 'Parts Purchases (Total)', val: c.parts_purchase, color: 'orange' },
    { label: 'Parts Sales (Total)', val: c.parts_sales, color: 'green' },
    { label: 'Other Expenses', val: c.other_expenses, color: 'red' },
    { label: 'Investment Added', val: c.investment_added, color: 'blue' },
    { label: 'Customer Payments', val: c.customer_payments, color: 'green' },
    { label: 'Supplier Payments', val: c.supplier_payments, color: 'orange' },
    { label: 'Closing Cash', val: cl?.closing_cash, highlight: true, formula: `Opening + Cash In - Cash Out` },
    { label: 'Closing Bank', val: cl?.closing_bank, highlight: true },
    { label: 'Daily Profit/Loss', val: cl?.daily_profit, highlight: true, profit: true },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Daily Tracking" subtitle="Day-wise financial activity" />

      {/* Date Navigator */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => changeDate(-1)} className="p-2 rounded-lg hover:bg-gray-100 transition"><ChevronLeft size={20} /></button>
          <div className="flex items-center gap-3">
            <Calendar size={20} className="text-indigo-600" />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <button onClick={() => changeDate(1)} className="p-2 rounded-lg hover:bg-gray-100 transition" disabled={selectedDate >= today()}><ChevronRight size={20} /></button>
          <button onClick={() => setSelectedDate(today())} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium">Today</button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Summary Table */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Daily Summary — {date(selectedDate)}</h3>
              {cl && <span className="flex items-center gap-1 text-green-600 text-sm"><CheckCircle size={16} />Closed</span>}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${row.highlight ? 'bg-gray-50' : ''}`}>
                    <td className="px-5 py-3 text-gray-600">
                      {row.label}
                      {row.formula && <span className="text-xs text-gray-400 ml-2">({row.formula})</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.editable && !cl ? (
                        <input type="number" value={openingCash} onChange={e => setOpeningCash(e.target.value)}
                          className="w-32 border border-gray-300 rounded px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-indigo-400" placeholder="0.00" />
                      ) : (
                        <span className={`font-medium ${row.profit ? (parseFloat(row.val) >= 0 ? 'text-green-600' : 'text-red-600') : row.color === 'green' ? 'text-green-600' : row.color === 'red' ? 'text-red-600' : row.color === 'orange' ? 'text-orange-600' : row.color === 'blue' ? 'text-blue-600' : row.highlight ? 'text-gray-900 font-bold' : 'text-gray-700'}`}>
                          {row.val !== undefined && row.val !== null ? currency(row.val) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Notes */}
            <div className="p-5 border-t border-gray-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" placeholder="End of day notes..." />
            </div>
            <div className="px-5 pb-5">
              <button onClick={handleClose} disabled={saving} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-medium">
                {saving ? 'Saving...' : cl ? 'Update Daily Closing' : 'Save Daily Closing'}
              </button>
            </div>
          </div>

          {/* Transactions */}
          <div className="space-y-4">
            {data?.transactions && Object.entries(data.transactions).map(([type, txList]) => txList.length > 0 && (
              <div key={type} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h4 className="font-semibold text-gray-800 capitalize mb-3">{type} ({txList.length})</h4>
                <div className="space-y-2">
                  {txList.slice(0, 5).map((tx, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 truncate flex-1">{tx.party_name || tx.description || tx.investor_name || '—'}</span>
                      <span className="font-medium ml-2">{currency(tx.total_amount || tx.amount)}</span>
                    </div>
                  ))}
                  {txList.length > 5 && <p className="text-xs text-gray-400">+{txList.length - 5} more...</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
