import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency, date, paymentMethodLabel, today } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import { useRefresh } from '../context/RefreshContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import StatCard from '../components/common/StatCard';
import { FormField, Input, Select } from '../components/common/FormField';
import {
  Plus, Search, Edit, Trash2, Receipt, Wallet,
  ChevronDown, ChevronUp, X, PlusCircle,
  Smartphone, Building2, CreditCard, CircleDollarSign,
} from 'lucide-react';

// ── payment method config ─────────────────────────────────────────────────
const METHOD_CONFIG = {
  cash:          { label: 'Cash',          icon: Wallet,           badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', cardBg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  upi:           { label: 'UPI',           icon: Smartphone,       badge: 'bg-violet-100 text-violet-700',   bar: 'bg-violet-500',  cardBg: 'bg-violet-50 border-violet-200',   text: 'text-violet-700'  },
  bank_transfer: { label: 'Bank Transfer', icon: Building2,        badge: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-500',    cardBg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700'    },
  card:          { label: 'Card',          icon: CreditCard,       badge: 'bg-orange-100 text-orange-700',   bar: 'bg-orange-500',  cardBg: 'bg-orange-50 border-orange-200',   text: 'text-orange-700'  },
  other:         { label: 'Other',         icon: CircleDollarSign, badge: 'bg-gray-100 text-gray-700',       bar: 'bg-gray-400',    cardBg: 'bg-gray-50 border-gray-200',       text: 'text-gray-700'    },
};
const METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'other'];

const EMPTY_SPLIT = { payment_method: 'cash', amount: '', account_id: '' };
const EMPTY_FORM  = { date: today(), category_id: '', paid_to: '' };

const MethodBadge = ({ method }) => {
  const cfg = METHOD_CONFIG[method] || METHOD_CONFIG.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      <Icon size={11} />{cfg.label}
    </span>
  );
};

export default function Expenses() {
  const [expenses, setExpenses]         = useState([]);
  const [total, setTotal]               = useState(0);
  const [totalAmount, setTotalAmount]   = useState(0);
  const [byCategory, setByCategory]     = useState([]);
  const [byMethod, setByMethod]         = useState([]);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [from, setFrom]                 = useState('');
  const [to, setTo]                     = useState('');
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [form, setForm]                 = useState(EMPTY_FORM);
  const [splits, setSplits]             = useState([{ ...EMPTY_SPLIT }]);
  const [saving, setSaving]             = useState(false);
  const [deleteItem, setDeleteItem]     = useState(null);
  const [categories, setCategories]     = useState([]);
  const [accounts, setAccounts]         = useState([]);
  const [expandedRows, setExpandedRows] = useState({});

  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();
  const LIMIT = 20;

  // ── fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterCat) p.set('category_id', filterCat);
      if (from) p.set('from', from);
      if (to)   p.set('to', to);
      const res = await api.get(`/expenses?${p}`);
      setExpenses(res.data.expenses || []);
      setTotal(res.data.total);
      setTotalAmount(res.data.total_amount);
      setByCategory(res.data.byCategory || []);
      setByMethod(res.data.byMethod || []);
    } catch { error('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [search, page, filterCat, from, to]);

  useEffect(() => {
    fetchData();
    api.get('/expenses/categories').then(r => setCategories(r.data)).catch(() => {});
    api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filterCat]);

  // ── split helpers ────────────────────────────────────────────────────
  const getAutoAccount = (method) => {
    const typeMap = { cash: 'cash', upi: 'upi', bank_transfer: 'bank', card: 'bank', other: null };
    const t = typeMap[method];
    if (!t) return '';
    const acc = accounts.find(a => a.type === t);
    return acc ? String(acc.id) : '';
  };

  const addSplit = () => {
    const used    = splits.map(s => s.payment_method);
    const next    = METHODS.find(m => !used.includes(m)) || 'other';
    const autoAcc = getAutoAccount(next);
    setSplits(s => [...s, { payment_method: next, amount: '', account_id: autoAcc }]);
  };

  const removeSplit = (i) => setSplits(s => s.filter((_, idx) => idx !== i));

  const updateSplit = (i, key, val) => setSplits(s => s.map((sp, idx) => {
    if (idx !== i) return sp;
    const updated = { ...sp, [key]: val };
    if (key === 'payment_method') updated.account_id = getAutoAccount(val);
    return updated;
  }));

  const splitTotal = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  // ── modal helpers ────────────────────────────────────────────────────
  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    const cashAcc = accounts.find(a => a.type === 'cash');
    setSplits([{ payment_method: 'cash', amount: '', account_id: cashAcc ? String(cashAcc.id) : '' }]);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ date: item.date, category_id: item.category_id || '', paid_to: item.paid_to || '' });
    setSplits(
      item.splits && item.splits.length > 0
        ? item.splits.map(s => ({ payment_method: s.payment_method, amount: s.amount, account_id: s.account_id ? String(s.account_id) : '' }))
        : [{ ...EMPTY_SPLIT }]
    );
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.date) { error('Date is required'); return; }
    if (splits.some(s => !s.payment_method || !s.amount || parseFloat(s.amount) <= 0)) {
      error('Each split needs a payment method and a positive amount'); return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        splits: splits.map(s => ({
          payment_method: s.payment_method,
          amount: parseFloat(s.amount),
          account_id: s.account_id && s.account_id !== '' ? parseInt(s.account_id) : null,
        })),
      };
      if (editItem) { await api.put(`/expenses/${editItem.id}`, payload); success('Expense updated'); }
      else          { await api.post('/expenses', payload);               success('Expense recorded'); }
      setModalOpen(false);
      fetchData();
      api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const toggleRow = (id) => setExpandedRows(p => ({ ...p, [id]: !p[id] }));

  // ── table columns ────────────────────────────────────────────────────
  const columns = [
    { key: 'expense_no',             label: 'Exp #',    className: 'font-mono text-xs' },
    { key: 'date',                   label: 'Date',     render: v => date(v) },
    { key: 'category_name_resolved', label: 'Category', render: (v, row) => v || row.category_name || '—' },
    { key: 'paid_to',                label: 'Paid To',  render: v => v || '—' },
    {
      key: 'splits', label: 'Payment Split',
      render: (splits) => (
        <div className="flex flex-wrap gap-1">
          {(splits || []).map((s, i) => <MethodBadge key={i} method={s.payment_method} />)}
        </div>
      ),
    },
    {
      key: 'amount', label: 'Total Amount',
      render: (v, row) => (
        <div>
          <p className="font-bold text-red-600 text-base">{currency(v)}</p>
          {row.splits && row.splits.length > 1 && (
            <p className="text-xs text-gray-400">{row.splits.length} splits</p>
          )}
        </div>
      ),
    },
    {
      key: 'expand', label: '',
      render: (_, row) => (
        <button onClick={() => toggleRow(row.id)} className="p-1.5 text-gray-400 hover:text-indigo-600 rounded-lg transition">
          {expandedRows[row.id] ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      ),
    },
    {
      key: 'actions', label: '',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => openEdit(row)}      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={14} /></button>
          <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ];

  // Custom render with expandable split detail rows
  const renderTable = () => {
    if (loading) return <div className="flex items-center justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full" /></div>;
    if (expenses.length === 0) return <p className="text-center py-12 text-gray-400">No expenses found</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {columns.map(col => (
                <th key={col.key} className="text-left px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {expenses.map(row => (
              <>
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
                {/* Expanded split detail */}
                {expandedRows[row.id] && row.splits && row.splits.length > 0 && (
                  <tr key={`${row.id}-exp`} className="bg-red-50">
                    <td colSpan={columns.length} className="px-6 py-4">
                      <p className="text-xs font-semibold text-red-600 uppercase mb-3">
                        Payment Split — {row.category_name_resolved || row.category_name || 'Expense'}{row.paid_to ? ` (${row.paid_to})` : ''}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {row.splits.map((s, i) => {
                          const cfg = METHOD_CONFIG[s.payment_method] || METHOD_CONFIG.other;
                          const Icon = cfg.icon;
                          const pct = row.amount > 0 ? ((s.amount / row.amount) * 100).toFixed(1) : '0';
                          return (
                            <div key={i} className={`rounded-xl border p-3 ${cfg.cardBg}`}>
                              <div className="flex items-center gap-1.5 mb-2">
                                <div className="w-6 h-6 rounded-lg bg-white flex items-center justify-center">
                                  <Icon size={13} className={cfg.text} />
                                </div>
                                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                              </div>
                              <p className="text-base font-bold text-gray-900">{currency(s.amount)}</p>
                              <div className="mt-1.5 h-1 bg-white rounded-full overflow-hidden">
                                <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${pct}%` }} />
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className={`text-xs font-bold ${cfg.text}`}>{pct}%</span>
                                {s.account_name && <span className="text-xs text-gray-400">{s.account_name}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Expenses"
        subtitle="All business expenses with payment splits"
        actions={
          <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            <Plus size={16} />Add Expense
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Expenses" value={currency(totalAmount)} icon={Receipt} color="red" />
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm sm:col-span-2">
          <p className="text-xs font-medium text-gray-500 uppercase mb-3">By Category</p>
          <div className="flex flex-wrap gap-2">
            {byCategory.slice(0, 8).map(c => (
              <div key={c.category} className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-1.5">
                <span className="text-xs text-gray-700">{c.category}</span>
                <span className="text-xs font-bold text-red-700">{currency(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Method split summary */}
      {byMethod.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {METHODS.map(method => {
            const row = byMethod.find(r => r.payment_method === method);
            const amt = row?.total || 0;
            const cfg = METHOD_CONFIG[method];
            const Icon = cfg.icon;
            const pct = totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) : '0';
            return (
              <div key={method} className={`rounded-xl border p-4 bg-white ${amt === 0 ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={14} className={cfg.text} />
                  <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                </div>
                <p className={`text-lg font-bold ${amt > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{currency(amt)}</p>
                <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`text-xs font-bold mt-1 ${cfg.text}`}>{pct}%</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Account balances */}
      {accounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5">
            <Wallet size={13} />Current Account Balances
          </p>
          <div className="flex flex-wrap gap-3">
            {accounts.map(acc => (
              <div key={acc.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${acc.current_balance < 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                <span className="text-gray-600 font-medium">{acc.name}</span>
                <span className={`font-bold ${acc.current_balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{currency(acc.current_balance)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search paid to, expense no..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-400 self-center ml-auto">Click <ChevronDown size={12} className="inline" /> to see split details</p>
        </div>
        {renderTable()}
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Expense' : 'Add Expense'} size="lg">
        {/* Header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <FormField label="Date" required>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </FormField>
          <FormField label="Category">
            <Select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">-- Select Category --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Paid To">
            <Input value={form.paid_to} onChange={e => setForm(f => ({ ...f, paid_to: e.target.value }))} placeholder="Vendor / person" />
          </FormField>
        </div>

        {/* Payment Splits */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-red-50 px-4 py-3 flex items-center justify-between border-b border-red-100">
            <div>
              <p className="text-sm font-semibold text-red-800">Payment Method Splits</p>
              <p className="text-xs text-red-500 mt-0.5">Add one row per payment method used (e.g. Cash + UPI)</p>
            </div>
            <button onClick={addSplit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition">
              <PlusCircle size={13} />Add Split
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {splits.map((split, i) => {
              const cfg  = METHOD_CONFIG[split.payment_method] || METHOD_CONFIG.other;
              const Icon = cfg.icon;
              const selectedAcc = accounts.find(a => String(a.id) === String(split.account_id));
              return (
                <div key={i} className={`p-4 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Method */}
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                      <div className="relative">
                        <select
                          value={split.payment_method}
                          onChange={e => updateSplit(i, 'payment_method', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 appearance-none bg-white"
                        >
                          {METHODS.map(m => <option key={m} value={m}>{METHOD_CONFIG[m].label}</option>)}
                        </select>
                        <Icon size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${cfg.text} pointer-events-none`} />
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount ₹</label>
                      <input
                        type="number" value={split.amount} min="0" step="0.01" placeholder="0.00"
                        onChange={e => updateSplit(i, 'amount', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                      />
                    </div>

                    {/* Account */}
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Deduct From Account
                        {selectedAcc && (
                          <span className="ml-2 font-semibold text-indigo-600">
                            (Bal: {currency(selectedAcc.current_balance)})
                          </span>
                        )}
                      </label>
                      <select
                        value={split.account_id}
                        onChange={e => updateSplit(i, 'account_id', e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white ${!split.account_id ? 'border-orange-300 bg-orange-50' : 'border-gray-300'}`}
                      >
                        <option value="">⚠ Select account</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type.toUpperCase()}) — {currency(a.current_balance)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Remove */}
                    <div className="sm:col-span-1 flex items-end justify-end">
                      <button onClick={() => removeSplit(i)} disabled={splits.length === 1}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed">
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Live badge */}
                  {split.amount && parseFloat(split.amount) > 0 && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
                        <Icon size={10} />{cfg.label}: {currency(split.amount)}
                        {selectedAcc && ` → Remaining: ${currency(selectedAcc.current_balance - parseFloat(split.amount))}`}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total row */}
          <div className="bg-red-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-red-100 text-sm">Total Expense</p>
              {splits.length > 1 && (
                <div className="flex gap-1">
                  {splits.filter(s => parseFloat(s.amount) > 0).map((s, i) => {
                    const cfg  = METHOD_CONFIG[s.payment_method] || METHOD_CONFIG.other;
                    const Icon = cfg.icon;
                    return (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/20 text-white rounded text-xs">
                        <Icon size={9} />{currency(s.amount)}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-white text-xl font-bold">{currency(splitTotal)}</p>
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving || splitTotal === 0}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 font-medium transition">
            {saving ? 'Saving...' : editItem ? 'Update Expense' : `Save — ${currency(splitTotal)}`}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteItem} onClose={() => setDeleteItem(null)} danger
        title="Delete Expense"
        message={`Delete expense of ${currency(deleteItem?.amount)}? All split account balances will be restored.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/expenses/${deleteItem.id}`);
            success('Expense deleted');
            setDeleteItem(null);
            fetchData();
            api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
            triggerRefresh();
          } catch (e) { error(e.response?.data?.error || 'Delete failed'); }
        }}
      />
    </div>
  );
}
