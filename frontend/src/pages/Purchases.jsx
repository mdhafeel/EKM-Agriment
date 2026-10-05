import { useState, useEffect, useCallback, useRef } from 'react';
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
import { FormField, Input, Select, Textarea } from '../components/common/FormField';
import { Plus, Search, Trash2, Eye, ShoppingCart, X, PlusCircle } from 'lucide-react';

const EMPTY_FORM = { date: today(), supplier_id: '', invoice_number: '', payment_status: 'pending', payment_method: 'cash', account_id: '', paid_amount: '', notes: '' };
const EMPTY_ITEM = { part_id: '', part_name: '', part_number: '', quantity: 1, unit_price: '', discount_percent: 0, gst_percent: 0 };

// ── Searchable part input ─────────────────────────────────────────────────
function PartSearchInput({ parts, value, partNumber, onSelect }) {
  const [query, setQuery]   = useState(value || '');
  const [open, setOpen]     = useState(false);
  const ref                 = useRef(null);

  // Sync when parent resets
  useEffect(() => { setQuery(value || ''); }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim().length > 0
    ? parts.filter(p =>
        p.part_name.toLowerCase().includes(query.toLowerCase()) ||
        (p.part_code && p.part_code.toLowerCase().includes(query.toLowerCase())) ||
        (p.part_number && p.part_number.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 10)
    : parts.slice(0, 8);

  const handleSelect = (p) => {
    setQuery(p.part_name);
    onSelect(p);
    setOpen(false);
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onSelect({ part_id: '', part_name: e.target.value, part_number: partNumber || '', purchase_price: '', gst_percent: 0 });
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => setOpen(true)}
        placeholder="Search part name or code..."
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
      />
      {open && (
        <div className="absolute z-50 left-0 w-64 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 italic">No parts found — will save as typed</p>
          ) : (
            filtered.map(p => (
              <button key={p.id} type="button" onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                <p className="text-xs font-medium text-gray-800">{p.part_name}</p>
                <p className="text-xs text-gray-400">{p.part_code}{p.part_number ? ` · ${p.part_number}` : ''} — Stock: {p.current_stock}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewItem, setViewItem] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [payForm, setPayForm] = useState({ paid_amount: '', payment_method: 'cash', account_id: '', date: today() });
  const [form, setForm] = useState(EMPTY_FORM);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [parts, setParts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();
  const LIMIT = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterStatus) params.set('status', filterStatus);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/purchases?${params}`);
      setPurchases(res.data.purchases);
      setTotal(res.data.total);
      setStats(res.data.stats || {});
    } catch { error('Failed to load purchases'); }
    finally { setLoading(false); }
  }, [search, page, filterStatus, from, to]);

  useEffect(() => {
    fetchData();
    api.get('/suppliers?limit=200').then(r => setSuppliers(r.data.suppliers)).catch(() => {});
    api.get('/spare-parts?limit=500').then(r => setParts(r.data.parts)).catch(() => {});
    api.get('/accounts').then(r => setAccounts(r.data)).catch(() => {});
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filterStatus]);

  const openCreate = () => { setForm(EMPTY_FORM); setItems([{ ...EMPTY_ITEM }]); setModalOpen(true); };

  const openView = async (id) => {
    try {
      const res = await api.get(`/purchases/${id}`);
      setViewData(res.data);
      setViewItem(id);
    } catch { error('Failed to load purchase details'); }
  };

  const addItem = () => setItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, k, v) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const onPartSelect = (i, p) => {
    if (p.id) {
      // Selected from list — auto-fill all fields
      updateItem(i, 'part_id', p.id);
      updateItem(i, 'part_name', p.part_name);
      updateItem(i, 'part_number', p.part_number || '');
      updateItem(i, 'unit_price', p.purchase_price || '');
      updateItem(i, 'gst_percent', p.gst_percent || 0);
    } else {
      // Typed manually
      updateItem(i, 'part_id', '');
      updateItem(i, 'part_name', p.part_name || '');
    }
  };

  const lineTotal = (item) => {
    const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
    const gst = (base - disc) * ((parseFloat(item.gst_percent) || 0) / 100);
    return base - disc + gst;
  };

  const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0);

  const handleSave = async () => {
    if (!form.date) { error('Date required'); return; }
    if (items.some(it => !it.part_name || !it.unit_price || !it.quantity)) { error('All line items need part name, quantity, and price'); return; }
    setSaving(true);
    try {
      const payload = { ...form, items: items.map(it => ({ ...it, quantity: parseInt(it.quantity), unit_price: parseFloat(it.unit_price), discount_percent: parseFloat(it.discount_percent) || 0, gst_percent: parseFloat(it.gst_percent) || 0 })) };
      if (form.payment_status === 'paid') payload.paid_amount = grandTotal;
      await api.post('/purchases', payload);
      success('Purchase recorded and stock updated');
      setModalOpen(false); fetchData(); triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (!payForm.paid_amount) { error('Enter paid amount'); return; }
    try {
      await api.put(`/purchases/${payModal.id}/payment`, payForm);
      success('Payment recorded');
      setPayModal(null);
      fetchData();
    } catch (e) { error(e.response?.data?.error || 'Payment failed'); }
  };

  const statusBg = { paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', pending: 'bg-blue-100 text-blue-700' };

  const columns = [
    { key: 'purchase_no', label: 'PUR #', className: 'font-mono text-xs' },
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'supplier_name', label: 'Supplier', render: v => v || 'Unknown' },
    { key: 'invoice_number', label: 'Invoice', render: v => v || '—' },
    { key: 'total_amount', label: 'Total', render: v => <span className="font-semibold">{currency(v)}</span> },
    { key: 'paid_amount', label: 'Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
    { key: 'pending_amount', label: 'Pending', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'payment_status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBg[v] || ''}`}>{v}</span> },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openView(row.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Eye size={14} /></button>
        {row.payment_status !== 'paid' && <button onClick={() => { setPayModal(row); setPayForm({ paid_amount: row.pending_amount, payment_method: 'cash', account_id: '', date: today() }); }} className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Pay</button>}
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
      </div>
    )}
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Purchases" subtitle="Spare parts purchased from suppliers"
        actions={<button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={16} />New Purchase</button>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Purchases" value={currency(stats.total)} icon={ShoppingCart} color="indigo" />
        <StatCard title="Total Paid" value={currency(stats.paid)} icon={ShoppingCart} color="green" />
        <StatCard title="Pending" value={currency(stats.pending)} icon={ShoppingCart} color="yellow" />
        <StatCard title="Purchase Count" value={stats.cnt || 0} icon={ShoppingCart} color="blue" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search purchase, invoice..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <Table columns={columns} data={purchases} loading={loading} />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* Create Purchase Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Purchase" size="xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <FormField label="Date" required><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></FormField>
          <FormField label="Supplier">
            <Select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">-- Supplier --</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Invoice Number"><Input value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-001" /></FormField>
          <FormField label="Payment Status">
            <Select value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}>
              <option value="pending">Pending</option><option value="partial">Partial</option><option value="paid">Paid</option>
            </Select>
          </FormField>
          {form.payment_status !== 'pending' && <>
            <FormField label="Payment Method">
              <Select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
                {['cash','upi','bank_transfer','card','other'].map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
              </Select>
            </FormField>
            <FormField label="Account">
              <Select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                <option value="">-- Account --</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </FormField>
            {form.payment_status === 'partial' && <FormField label="Paid Amount"><Input type="number" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} /></FormField>}
          </>}
        </div>

        {/* Items */}
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Purchase Items</span>
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><PlusCircle size={14} />Add Item</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-48">Part</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-24">Part No.</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Qty</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-28">Unit Price</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">Disc%</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-20">GST%</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-28">Total</th>
                <th className="w-8"></th>
              </tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      <PartSearchInput
                        parts={parts}
                        value={item.part_name}
                        partNumber={item.part_number}
                        onSelect={(p) => onPartSelect(i, p)}
                      />
                    </td>
                    <td className="px-3 py-2"><input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={item.part_number} onChange={e => updateItem(i, 'part_number', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" max="100" value={item.discount_percent} onChange={e => updateItem(i, 'discount_percent', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" max="100" value={item.gst_percent} onChange={e => updateItem(i, 'gst_percent', e.target.value)} /></td>
                    <td className="px-3 py-2 font-medium text-right">{currency(lineTotal(item))}</td>
                    <td className="px-2"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 p-1" disabled={items.length === 1}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={6} className="px-4 py-2 text-right font-semibold text-gray-700">Grand Total:</td>
                <td className="px-3 py-2 font-bold text-indigo-700 text-right">{currency(grandTotal)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        <FormField label="Notes"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></FormField>
        <div className="flex gap-3 mt-4">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save Purchase'}</button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewItem} onClose={() => { setViewItem(null); setViewData(null); }} title={`Purchase — ${viewData?.purchase?.purchase_no || ''}`} size="lg">
        {viewData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Supplier:</span> <span className="font-medium">{viewData.purchase.supplier_name}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="font-medium">{date(viewData.purchase.date)}</span></div>
              <div><span className="text-gray-500">Invoice:</span> <span className="font-medium">{viewData.purchase.invoice_number || '—'}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className={`px-2 py-0.5 rounded text-xs ${statusBg[viewData.purchase.payment_status]}`}>{viewData.purchase.payment_status}</span></div>
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-50"><th className="text-left px-3 py-2">Part</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Total</th></tr></thead>
              <tbody>{viewData.items.map((it, i) => (<tr key={i} className="border-t border-gray-100"><td className="px-3 py-2">{it.part_name}</td><td className="px-3 py-2 text-center">{it.quantity}</td><td className="px-3 py-2 text-right">{currency(it.unit_price)}</td><td className="px-3 py-2 text-right font-medium">{currency(it.total_amount)}</td></tr>))}</tbody>
              <tfoot><tr className="bg-gray-50 border-t"><td colSpan={3} className="px-3 py-2 text-right font-semibold">Total:</td><td className="px-3 py-2 text-right font-bold text-indigo-700">{currency(viewData.purchase.total_amount)}</td></tr></tfoot>
            </table>
            <div className="flex justify-between text-sm"><span>Paid: <strong className="text-green-600">{currency(viewData.purchase.paid_amount)}</strong></span><span>Pending: <strong className="text-red-600">{currency(viewData.purchase.pending_amount)}</strong></span></div>
          </div>
        )}
      </Modal>

      {/* Payment Modal */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Record Payment" size="sm">
        <div className="space-y-4">
          <div className="bg-yellow-50 rounded-lg p-3 text-sm">Pending: <strong>{currency(payModal?.pending_amount)}</strong></div>
          <FormField label="Payment Amount" required><Input type="number" value={payForm.paid_amount} onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))} /></FormField>
          <FormField label="Date"><Input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} /></FormField>
          <FormField label="Payment Method">
            <Select value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              {['cash','upi','bank_transfer','card'].map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
            </Select>
          </FormField>
          <FormField label="Account">
            <Select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">-- Select Account --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setPayModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handlePayment} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Record Payment</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={async () => { try { await api.delete(`/purchases/${deleteItem.id}`); success('Deleted and stock reversed'); setDeleteItem(null); fetchData(); } catch (e) { error(e.response?.data?.error || 'Delete failed'); } }} danger title="Delete Purchase" message="This will reverse all stock updates. Continue?" confirmLabel="Delete" />
    </div>
  );
}
