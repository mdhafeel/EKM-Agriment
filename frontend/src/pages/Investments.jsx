import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency, date, today } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import { useRefresh } from '../context/RefreshContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { FormField, Input, Select, Textarea } from '../components/common/FormField';
import {
  Plus, Search, TrendingUp, Edit, Trash2, X, PlusCircle,
  Wallet, Smartphone, Building2, CreditCard, CircleDollarSign,
  ChevronDown, ChevronUp, User,
} from 'lucide-react';

// ── Constants ────────────────────────────────────────────────────────────
const METHOD_CONFIG = {
  cash:          { label: 'Cash',          icon: Wallet,           badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-500', cardBg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  upi:           { label: 'UPI',           icon: Smartphone,       badge: 'bg-violet-100 text-violet-700',   bar: 'bg-violet-500',  cardBg: 'bg-violet-50 border-violet-200',   text: 'text-violet-700'  },
  bank_transfer: { label: 'Bank Transfer', icon: Building2,        badge: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-500',    cardBg: 'bg-blue-50 border-blue-200',       text: 'text-blue-700'    },
  card:          { label: 'Card',          icon: CreditCard,       badge: 'bg-orange-100 text-orange-700',   bar: 'bg-orange-500',  cardBg: 'bg-orange-50 border-orange-200',   text: 'text-orange-700'  },
  other:         { label: 'Other',         icon: CircleDollarSign, badge: 'bg-gray-100 text-gray-700',       bar: 'bg-gray-400',    cardBg: 'bg-gray-50 border-gray-200',       text: 'text-gray-700'    },
};
const METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'other'];

const EMPTY_SPLIT = { payment_method: 'cash', amount: '', account_id: '', notes: '' };
const EMPTY_FORM  = { date: today(), investor_name: '', purpose: '', description: '' };

// ── Helpers ──────────────────────────────────────────────────────────────
const MethodBadge = ({ method }) => {
  const cfg = METHOD_CONFIG[method] || METHOD_CONFIG.other;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.badge}`}>
      <Icon size={11} />{cfg.label}
    </span>
  );
};

export default function Investments() {
  const [investments, setInvestments]           = useState([]);
  const [total, setTotal]                       = useState(0);
  const [totalAmount, setTotalAmount]           = useState(0);
  const [byMethod, setByMethod]                 = useState([]);
  const [byInvestor, setByInvestor]             = useState([]);
  const [byInvestorMethod, setByInvestorMethod] = useState([]);
  const [page, setPage]                         = useState(1);
  const [search, setSearch]                     = useState('');
  const [from, setFrom]                         = useState('');
  const [to, setTo]                             = useState('');
  const [loading, setLoading]                   = useState(true);

  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [splits, setSplits]         = useState([{ ...EMPTY_SPLIT }]);
  const [saving, setSaving]         = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [accounts, setAccounts]     = useState([]);
  const [expandedRows, setExpandedRows] = useState({});

  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();
  const LIMIT = 20;

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, page, limit: LIMIT });
      if (from) p.set('from', from);
      if (to)   p.set('to', to);
      const res = await api.get(`/investments?${p}`);
      setInvestments(res.data.investments || []);
      setTotal(res.data.total);
      setTotalAmount(res.data.total_amount);
      setByMethod(res.data.byMethod || []);
      setByInvestor(res.data.byInvestor || []);
      setByInvestorMethod(res.data.byInvestorMethod || []);
    } catch { error('Failed to load investments'); }
    finally { setLoading(false); }
  }, [search, page, from, to]);

  useEffect(() => {
    fetchData();
    api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { setPage(1); }, [search]);

  // ── Split helpers ──────────────────────────────────────────────────────
  const addSplit = () => {
    // Default new split to UPI if cash already used, else cash
    const usedMethods = splits.map(s => s.payment_method);
    const nextMethod = usedMethods.includes('cash') && !usedMethods.includes('upi')
      ? 'upi'
      : usedMethods.includes('upi') && !usedMethods.includes('bank_transfer')
      ? 'bank_transfer'
      : 'other';
    const methodToType = { cash: 'cash', upi: 'upi', bank_transfer: 'bank', card: 'bank', other: null };
    const targetType = methodToType[nextMethod];
    const matchingAcc = targetType ? accounts.find(a => a.type === targetType) : null;
    setSplits(s => [...s, { ...EMPTY_SPLIT, payment_method: nextMethod, account_id: matchingAcc ? String(matchingAcc.id) : '' }]);
  };
  const removeSplit = (i) => setSplits(s => s.filter((_, idx) => idx !== i));
  const updateSplit = (i, key, val) => setSplits(s => s.map((sp, idx) => {
    if (idx !== i) return sp;
    const updated = { ...sp, [key]: val };
    // Auto-select matching account when payment method changes
    if (key === 'payment_method') {
      const methodToAccountType = {
        cash: 'cash',
        upi: 'upi',
        bank_transfer: 'bank',
        card: 'bank',
        other: null,
      };
      const targetType = methodToAccountType[val];
      if (targetType) {
        const matchingAccount = accounts.find(a => a.type === targetType);
        if (matchingAccount) updated.account_id = String(matchingAccount.id);
      }
    }
    return updated;
  }));
  const splitTotal  = splits.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);

  // ── Modal open/close ───────────────────────────────────────────────────
  const openCreate = () => {
    setEditItem(null);
    setForm(EMPTY_FORM);
    // Auto-select cash account for the default split
    const cashAcc = accounts.find(a => a.type === 'cash');
    setSplits([{ ...EMPTY_SPLIT, account_id: cashAcc ? String(cashAcc.id) : '' }]);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ date: item.date, investor_name: item.investor_name, purpose: item.purpose || '', description: item.description || '' });
    setSplits(
      item.splits && item.splits.length > 0
        ? item.splits.map(s => ({ payment_method: s.payment_method, amount: s.amount, account_id: s.account_id || '', notes: s.notes || '' }))
        : [{ ...EMPTY_SPLIT }]
    );
    setModalOpen(true);
  };

  // ── Save ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.date || !form.investor_name.trim()) { error('Date and investor name required'); return; }
    if (splits.some(s => !s.payment_method || !s.amount || parseFloat(s.amount) <= 0)) {
      error('Each payment split needs a method and a positive amount'); return;
    }
    // Warn if any split has no account — balance won't be updated
    const splitsWithNoAccount = splits.filter(s => !s.account_id);
    if (splitsWithNoAccount.length > 0) {
      const methods = splitsWithNoAccount.map(s => METHOD_CONFIG[s.payment_method]?.label || s.payment_method).join(', ');
      const proceed = window.confirm(
        `Warning: The following splits have no account selected: ${methods}\n\nBalance will NOT be updated for these splits. Do you want to proceed?`
      );
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        splits: splits.map(s => ({
          payment_method: s.payment_method,
          amount: parseFloat(s.amount),
          // Convert empty string to null so backend doesn't try to update a non-existent account
          account_id: s.account_id && s.account_id !== '' ? parseInt(s.account_id) : null,
          notes: s.notes || null,
        })),
      };
      if (editItem) { await api.put(`/investments/${editItem.id}`, payload); success('Investment updated'); }
      else          { await api.post('/investments', payload);               success('Investment recorded'); }
      setModalOpen(false);
      fetchData();
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  // ── Row expand toggle ──────────────────────────────────────────────────
  const toggleRow = (id) => setExpandedRows(p => ({ ...p, [id]: !p[id] }));

  // ── Investor method split helper ───────────────────────────────────────
  const getInvestorMethods = (name) => byInvestorMethod.filter(r => r.investor_name === name);
  const pct = (val) => totalAmount > 0 ? ((val / totalAmount) * 100).toFixed(1) : '0.0';

  // ── Table columns ──────────────────────────────────────────────────────
  const columns = [
    { key: 'investment_no', label: 'Inv #', className: 'font-mono text-xs w-28' },
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'investor_name', label: 'Investor', render: v => <span className="font-medium">{v}</span> },
    { key: 'purpose', label: 'Purpose', render: v => v || '—' },
    {
      key: 'splits', label: 'Payment Split',
      render: (splits) => (
        <div className="flex flex-wrap gap-1">
          {(splits || []).map((s, i) => (
            <MethodBadge key={i} method={s.payment_method} />
          ))}
        </div>
      ),
    },
    {
      key: 'amount', label: 'Total Amount',
      render: (v, row) => (
        <div>
          <p className="font-bold text-indigo-600 text-base">{currency(v)}</p>
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
          <button onClick={() => openEdit(row)}    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit size={15} /></button>
          <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  // Custom table render to support expandable rows
  const renderTable = () => {
    if (loading) return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
    if (investments.length === 0) return (
      <p className="text-center py-12 text-gray-400">No investments found</p>
    );
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
            {investments.map(row => (
              <>
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  {columns.map(col => (
                    <td key={col.key} className="px-4 py-3">
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
                {/* Expanded split detail row */}
                {expandedRows[row.id] && row.splits && row.splits.length > 0 && (
                  <tr key={`${row.id}-expand`} className="bg-indigo-50">
                    <td colSpan={columns.length} className="px-6 py-4">
                      <p className="text-xs font-semibold text-indigo-600 uppercase mb-3">Payment Split Details — {row.investor_name}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {row.splits.map((s, i) => {
                          const cfg = METHOD_CONFIG[s.payment_method] || METHOD_CONFIG.other;
                          const Icon = cfg.icon;
                          const splitPct = row.amount > 0 ? ((s.amount / row.amount) * 100).toFixed(1) : '0';
                          return (
                            <div key={i} className={`rounded-xl border p-4 ${cfg.cardBg}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shadow-sm">
                                  <Icon size={14} className={cfg.text} />
                                </div>
                                <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
                              </div>
                              <p className="text-xl font-bold text-gray-900">{currency(s.amount)}</p>
                              <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
                                <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${splitPct}%` }} />
                              </div>
                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs text-gray-500">{splitPct}% of total</span>
                                {s.account_name && <span className="text-xs text-gray-400">{s.account_name}</span>}
                              </div>
                              {s.notes && <p className="text-xs text-gray-500 mt-1 italic">{s.notes}</p>}
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

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <PageHeader
        title="Investments"
        subtitle="Track all capital invested — with payment method splits"
        actions={
          <button onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
            <Plus size={16} />Add Investment
          </button>
        }
      />

      {/* ── TOTAL + METHOD SPLIT CARDS ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Grand total */}
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl p-5 text-white">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-indigo-200" />
            <p className="text-indigo-100 text-xs font-semibold uppercase">Total</p>
          </div>
          <p className="text-2xl font-bold">{currency(totalAmount)}</p>
          <p className="text-indigo-200 text-xs mt-1">{total} investment{total !== 1 ? 's' : ''}</p>
        </div>

        {/* Per method cards */}
        {METHODS.map(method => {
          const row = byMethod.find(r => r.payment_method === method);
          const amt = row?.total || 0;
          const cnt = row?.inv_count || 0;
          const cfg = METHOD_CONFIG[method];
          const Icon = cfg.icon;
          const percentage = pct(amt);
          return (
            <div key={method} className={`rounded-xl p-4 border ${cfg.cardBg} ${amt === 0 ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} className={cfg.text} />
                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
              </div>
              <p className={`text-lg font-bold ${amt > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{currency(amt)}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{cnt} inv</span>
                <span className={`text-xs font-bold ${cfg.text}`}>{percentage}%</span>
              </div>
              <div className="mt-1.5 h-1 bg-white rounded-full overflow-hidden">
                <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── INVESTOR BREAKDOWN ──────────────────────────────────────── */}
      {byInvestor.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <User size={16} className="text-indigo-500" />
            <h3 className="font-semibold text-gray-900">Investor-wise Payment Split</h3>
            <span className="ml-auto text-xs text-gray-400">{byInvestor.length} investor{byInvestor.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-gray-50">
            {byInvestor.map(investor => {
              const methods = getInvestorMethods(investor.investor_name);
              const investorPct = pct(investor.total);
              return (
                <div key={investor.investor_name} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-indigo-700 font-bold">{investor.investor_name.charAt(0).toUpperCase()}</span>
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">{investor.investor_name}</p>
                          <p className="text-xs text-gray-400">{investor.count} transaction{investor.count !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-bold text-xl text-indigo-700">{currency(investor.total)}</p>
                          <p className="text-xs text-gray-400">{investorPct}% of total investment</p>
                        </div>
                      </div>
                      {/* Method split cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                        {methods.map(m => {
                          const cfg = METHOD_CONFIG[m.payment_method] || METHOD_CONFIG.other;
                          const Icon = cfg.icon;
                          const mPct = investor.total > 0 ? ((m.total / investor.total) * 100).toFixed(1) : '0';
                          return (
                            <div key={m.payment_method} className={`rounded-lg border p-3 ${cfg.cardBg}`}>
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Icon size={13} className={cfg.text} />
                                <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
                              </div>
                              <p className="text-base font-bold text-gray-900">{currency(m.total)}</p>
                              <div className="flex items-center justify-between mt-1.5">
                                <div className="flex-1 h-1 bg-white rounded-full overflow-hidden mr-2">
                                  <div className={`h-full ${cfg.bar} rounded-full`} style={{ width: `${mPct}%` }} />
                                </div>
                                <span className={`text-xs font-bold ${cfg.text} flex-shrink-0`}>{mPct}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── TRANSACTIONS TABLE ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search investor, purpose..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-400 ml-auto">Click <ChevronDown size={12} className="inline" /> to see split details</p>
        </div>
        {renderTable()}
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* ── ADD / EDIT MODAL ─────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Investment' : 'Record Investment'} size="lg">
        {/* Header fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <FormField label="Date" required>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </FormField>
          <FormField label="Investor Name" required>
            <Input value={form.investor_name} onChange={e => setForm(f => ({ ...f, investor_name: e.target.value }))} placeholder="Investor / Owner name" />
          </FormField>
          <FormField label="Purpose">
            <Input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} placeholder="Business expansion, equipment..." />
          </FormField>
          <FormField label="Description / Notes">
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Additional notes..." />
          </FormField>
        </div>

        {/* Payment Splits */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-indigo-50 px-4 py-3 flex items-center justify-between border-b border-indigo-100">
            <div>
              <p className="text-sm font-semibold text-indigo-800">Payment Method Splits</p>
              <p className="text-xs text-indigo-500 mt-0.5">Add one row per payment method used</p>
            </div>
            <button onClick={addSplit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 transition">
              <PlusCircle size={13} />Add Split
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {splits.map((split, i) => {
              const cfg = METHOD_CONFIG[split.payment_method] || METHOD_CONFIG.other;
              const Icon = cfg.icon;
              return (
                <div key={i} className={`p-4 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    {/* Method selector */}
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Payment Method</label>
                      <div className="relative">
                        <select
                          value={split.payment_method}
                          onChange={e => updateSplit(i, 'payment_method', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none bg-white"
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
                        type="number"
                        value={split.amount}
                        onChange={e => updateSplit(i, 'amount', e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>

                  {/* Account */}
                    <div className="sm:col-span-4">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Credit to Account
                        {split.account_id && (() => {
                          const acc = accounts.find(a => String(a.id) === String(split.account_id));
                          return acc ? (
                            <span className="ml-2 font-semibold text-indigo-600">
                              (Balance: ₹{parseFloat(acc.current_balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })})
                            </span>
                          ) : null;
                        })()}
                      </label>
                      <select
                        value={split.account_id}
                        onChange={e => updateSplit(i, 'account_id', e.target.value)}
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white ${!split.account_id ? 'border-orange-300 bg-orange-50' : 'border-gray-300'}`}
                      >
                        <option value="">⚠ Select account (required for balance)</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.type.toUpperCase()}) — ₹{parseFloat(a.current_balance).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </option>
                        ))}
                      </select>
                      {!split.account_id && (
                        <p className="text-xs text-orange-600 mt-1">⚠ No account selected — balance will not be updated</p>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="sm:col-span-2 flex items-end justify-end">
                      <button
                        onClick={() => removeSplit(i)}
                        disabled={splits.length === 1}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove this split"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Optional notes for this split */}
                  <div className="mt-2">
                    <input
                      type="text"
                      value={split.notes}
                      onChange={e => updateSplit(i, 'notes', e.target.value)}
                      placeholder="Note for this split (optional)..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white"
                    />
                  </div>

                  {/* Split amount indicator */}
                  {split.amount && parseFloat(split.amount) > 0 && (
                    <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.badge}`}>
                      <Icon size={10} />{cfg.label}: {currency(split.amount)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Total row */}
          <div className="bg-indigo-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-indigo-100 text-sm">Total Investment Amount</p>
              {splits.length > 1 && (
                <div className="flex gap-1">
                  {splits.filter(s => parseFloat(s.amount) > 0).map((s, i) => {
                    const cfg = METHOD_CONFIG[s.payment_method] || METHOD_CONFIG.other;
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
            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-medium transition">
            {saving ? 'Saving...' : editItem ? 'Update Investment' : `Save — ${currency(splitTotal)}`}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteItem} onClose={() => setDeleteItem(null)} danger
        title="Delete Investment"
        message={`Delete ₹${(deleteItem?.amount || 0).toLocaleString('en-IN')} investment by ${deleteItem?.investor_name}? All ${deleteItem?.splits?.length || 1} payment split(s) will be reversed from account balances.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await api.delete(`/investments/${deleteItem.id}`);
            success('Investment deleted');
            setDeleteItem(null);
            fetchData();
            api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
            triggerRefresh();
          }
          catch (e) { error(e.response?.data?.error || 'Delete failed'); }
        }}
      />
    </div>
  );
}
