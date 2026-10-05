import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { currency, date, paymentMethodLabel, today } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import StatCard from '../components/common/StatCard';
import { FormField, Input, Select } from '../components/common/FormField';
import { Plus, Search, ArrowUp, ArrowDown, Clock, AlertCircle } from 'lucide-react';

const METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'other'];
const STATUS_LIST = ['paid', 'partial', 'pending', 'overdue'];

const METHOD_TO_ACCOUNT_TYPE = {
  cash: 'cash',
  upi: 'upi',
  bank_transfer: 'bank',
  card: 'bank',
  other: null,
};

const EMPTY = {
  date: today(),
  type: 'received',
  party_type: 'customer',
  party_id: '',
  party_name: '',
  category: '',
  amount: '',
  payment_method: 'cash',
  account_id: '',
  reference_number: '',
  due_date: '',
  status: 'paid',
};

// ── Inline searchable party input ────────────────────────────────────────
function PartySearchInput({ partyType, customers, suppliers, value, onChange }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  // Sync when parent resets form
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const list = partyType === 'customer' ? customers : partyType === 'supplier' ? suppliers : [];
  const filtered = query.trim().length > 0
    ? list.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        (p.phone && p.phone.includes(query))
      )
    : list.slice(0, 8); // show first 8 when no query

  const handleSelect = (p) => {
    setQuery(p.name);
    onChange(p.name, p.id);
    setOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onChange(e.target.value, ''); // clear id when typing manually
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        placeholder={
          partyType === 'customer' ? 'Search customer name or phone...' :
          partyType === 'supplier' ? 'Search supplier name...' :
          'Enter party name...'
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 transition"
      />
      {open && list.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">No match — will save as typed</p>
          ) : (
            filtered.map(p => (
              <button key={p.id} type="button" onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 flex items-center justify-between border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-800 text-sm">{p.name}</span>
                {p.phone && <span className="text-xs text-gray-400">{p.phone}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Payments() {
  const [payments, setPayments]         = useState([]);
  const [total, setTotal]               = useState(0);
  const [stats, setStats]               = useState({});
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom]                 = useState('');
  const [to, setTo]                     = useState('');
  const [loading, setLoading]           = useState(true);
  const [modalOpen, setModalOpen]       = useState(false);
  const [editItem, setEditItem]         = useState(null);
  const [form, setForm]                 = useState(EMPTY);
  const [saving, setSaving]             = useState(false);
  const [deleteItem, setDeleteItem]     = useState(null);
  const [accounts, setAccounts]         = useState([]);
  const [customers, setCustomers]       = useState([]);
  const [suppliers, setSuppliers]       = useState([]);
  const { success, error } = useNotification();
  const LIMIT = 20;

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterType)   params.set('type', filterType);
      if (filterStatus) params.set('status', filterStatus);
      if (from) params.set('from', from);
      if (to)   params.set('to', to);
      const res = await api.get(`/payments?${params}`);
      setPayments(res.data.payments);
      setTotal(res.data.total);
      setStats(res.data.stats || {});
    } catch { error('Failed to load payments'); }
    finally { setLoading(false); }
  }, [search, page, filterType, filterStatus, from, to]);

  useEffect(() => {
    fetchData();
    api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
    api.get('/customers?limit=500').then(r => setCustomers(r.data.customers || [])).catch(() => {});
    api.get('/suppliers?limit=200').then(r => setSuppliers(r.data.suppliers || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filterType, filterStatus]);

  // ── Auto-select account by method ────────────────────────────────
  const getAutoAccount = (method) => {
    const t = METHOD_TO_ACCOUNT_TYPE[method];
    if (!t) return '';
    const acc = accounts.find(a => a.type === t);
    return acc ? String(acc.id) : '';
  };

  // ── When party_type changes, reset party selection ────────────────
  const handlePartyTypeChange = (newType) => {
    setForm(f => ({ ...f, party_type: newType, party_id: '', party_name: '' }));
  };

  // ── Modal open ────────────────────────────────────────────────────
  const openCreate = (type = 'received') => {
    setEditItem(null);
    const defaultMethod = 'cash';
    setForm({ ...EMPTY, type, payment_method: defaultMethod, account_id: getAutoAccount(defaultMethod) });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      date: item.date, type: item.type,
      party_type: item.party_type || 'customer',
      party_id: item.party_id ? String(item.party_id) : '',
      party_name: item.party_name,
      category: item.category || '',
      amount: item.amount,
      payment_method: item.payment_method || 'cash',
      account_id: item.account_id ? String(item.account_id) : '',
      reference_number: item.reference_number || '',
      due_date: item.due_date || '',
      status: item.status,
    });
    setModalOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.party_name?.trim()) { error('Party name is required'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { error('Amount must be greater than 0'); return; }
    if (!form.date) { error('Date is required'); return; }
    setSaving(true);
    try {
      const payload = {
        date: form.date,
        type: form.type,
        party_type: form.party_type,
        party_id: form.party_id && form.party_id !== '' ? parseInt(form.party_id) : null,
        party_name: form.party_name.trim(),
        category: form.category || null,
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
        account_id: form.account_id && form.account_id !== '' ? parseInt(form.account_id) : null,
        reference_number: form.reference_number || null,
        due_date: form.due_date || null,
        status: form.status,
        description: null,
        notes: null,
      };
      if (editItem) { await api.put(`/payments/${editItem.id}`, payload); success('Payment updated'); }
      else          { await api.post('/payments', payload);               success('Payment recorded'); }
      setModalOpen(false);
      fetchData();
      api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  // ── Table ─────────────────────────────────────────────────────────
  const statusBg = {
    paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-blue-100 text-blue-700', overdue: 'bg-red-100 text-red-700',
  };

  const columns = [
    { key: 'payment_no', label: 'Pay #', className: 'font-mono text-xs' },
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'type', label: 'Type', render: v => (
      <span className={`flex items-center gap-1 text-xs font-medium ${v === 'received' ? 'text-green-600' : 'text-red-600'}`}>
        {v === 'received' ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {v}
      </span>
    )},
    { key: 'party_name', label: 'Party', render: (v, row) => (
      <div>
        <p className="font-medium">{v}</p>
        {row.category && <p className="text-xs text-gray-400">{row.category}</p>}
      </div>
    )},
    { key: 'amount', label: 'Amount', render: (v, row) => (
      <span className={`font-semibold ${row.type === 'received' ? 'text-green-600' : 'text-red-600'}`}>{currency(v)}</span>
    )},
    { key: 'payment_method', label: 'Method', render: v => paymentMethodLabel(v) },
    { key: 'status', label: 'Status', render: v => (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBg[v] || ''}`}>{v}</span>
    )},
    { key: 'due_date', label: 'Due', render: v => v ? date(v) : '—' },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-xs">Edit</button>
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg text-xs">Del</button>
      </div>
    )},
  ];

  // current balance of selected account
  const selectedAcc = accounts.find(a => String(a.id) === String(form.account_id));

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Payments"
        subtitle="Track all money received and paid"
        actions={
          <div className="flex gap-2">
            <button onClick={() => openCreate('received')} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <ArrowUp size={15} />Money In
            </button>
            <button onClick={() => openCreate('paid')} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium">
              <ArrowDown size={15} />Money Out
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Received" value={currency(stats.total_received)} />
        <StatCard title="Total Paid"     value={currency(stats.total_paid)} />
        <StatCard title="Pending"        value={currency(stats.pending_amount)} />
        <StatCard title="Overdue"        value={currency(stats.overdue_amount)} />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search party, reference..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            <option value="received">Received</option>
            <option value="paid">Paid</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Status</option>
            {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <Table columns={columns} data={payments} loading={loading} />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* ── Payment Modal ─────────────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? 'Edit Payment' : form.type === 'received' ? '💚 Money In' : '🔴 Money Out'}
        size="md"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* Date */}
          <FormField label="Date" required>
            <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </FormField>

          {/* Type */}
          <FormField label="Type" required>
            <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="received">💚 Money Received</option>
              <option value="paid">🔴 Money Paid</option>
            </Select>
          </FormField>

          {/* Party Type */}
          <FormField label="Party Type">
            <Select value={form.party_type} onChange={e => handlePartyTypeChange(e.target.value)}>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
              <option value="other">Other</option>
            </Select>
          </FormField>

          {/* Party Name — searchable input with live suggestions */}
          <FormField label="Party Name" required className="sm:col-span-2">
            <PartySearchInput
              partyType={form.party_type}
              customers={customers}
              suppliers={suppliers}
              value={form.party_name}
              onChange={(name, id) => setForm(f => ({ ...f, party_name: name, party_id: id || '' }))}
            />
          </FormField>

          {/* Amount */}
          <FormField label="Amount ₹" required>
            <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" min="0" step="0.01" />
          </FormField>

          {/* Status */}
          <FormField label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>

          {/* Payment Method — auto-selects account */}
          <FormField label="Payment Method">
            <Select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value, account_id: getAutoAccount(e.target.value) }))}>
              {METHODS.map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
            </Select>
          </FormField>

          {/* Account */}
          <FormField label={
            <span>
              Account{selectedAcc && <span className="ml-2 text-xs font-semibold text-indigo-600">(Bal: {currency(selectedAcc.current_balance)})</span>}
            </span>
          }>
            <Select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">-- No account --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.type.toUpperCase()}) — {currency(a.current_balance)}</option>)}
            </Select>
          </FormField>

          {/* Category */}
          <FormField label="Category">
            <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Workshop, Service, Parts..." />
          </FormField>

          {/* Reference */}
          <FormField label="Reference No.">
            <Input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="UPI ref / cheque no." />
          </FormField>

          {/* Due Date */}
          {form.status !== 'paid' && (
            <FormField label="Due Date" className="sm:col-span-2">
              <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </FormField>
          )}
        </div>

        {/* Balance preview */}
        {form.account_id && selectedAcc && form.amount && parseFloat(form.amount) > 0 && form.status === 'paid' && (
          <div className={`mt-4 flex items-center gap-3 p-3 rounded-lg text-sm border ${form.type === 'received' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <span className="text-gray-600">Balance will change:</span>
            <span className="font-medium">{currency(selectedAcc.current_balance)}</span>
            <span className="text-gray-400">→</span>
            <span className={`font-bold ${form.type === 'received' ? 'text-green-600' : 'text-red-600'}`}>
              {currency(selectedAcc.current_balance + (form.type === 'received' ? 1 : -1) * parseFloat(form.amount))}
            </span>
          </div>
        )}

        <div className="flex gap-3 mt-5">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSave} disabled={saving}
            className={`flex-1 px-4 py-2.5 text-white rounded-lg font-medium disabled:opacity-60 transition ${form.type === 'received' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {saving ? 'Saving...' : editItem ? 'Update' : form.type === 'received' ? 'Record Money In' : 'Record Money Out'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          try {
            await api.delete(`/payments/${deleteItem.id}`);
            success('Payment deleted');
            setDeleteItem(null);
            fetchData();
          } catch (e) { error(e.response?.data?.error || 'Delete failed'); }
        }}
        danger title="Delete Payment"
        message="Permanently delete this payment record?"
        confirmLabel="Delete"
      />
    </div>
  );
}
