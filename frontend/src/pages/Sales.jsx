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
import {
  Plus, Search, Eye, Trash2, ShoppingBag, TrendingUp,
  X, PlusCircle, Printer, FileText, Download, Receipt,
} from 'lucide-react';

const EMPTY_FORM = {
  date: today(), customer_id: '', customer_name: '', vehicle_number: '',
  payment_status: 'pending', payment_method: 'cash', account_id: '', paid_amount: '', notes: '',
};
const EMPTY_ITEM = { part_id: '', part_name: '', part_number: '', quantity: 1, unit_price: '', discount_percent: 0, gst_percent: 0 };
const STATUS_BG  = { paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', pending: 'bg-blue-100 text-blue-700' };

// ── Searchable part input (same as in Purchases) ──────────────────────────
function PartSearchInput({ parts, value, onSelect }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen]   = useState(false);
  const ref               = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

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

  const handleSelect = (p) => { setQuery(p.part_name); onSelect(p); setOpen(false); };

  const handleChange = (e) => {
    setQuery(e.target.value);
    onSelect({ id: '', part_name: e.target.value, part_number: '', selling_price: '', gst_percent: 0 });
    setOpen(true);
  };

  return (
    <div ref={ref} className="relative">
      <input type="text" value={query} onChange={handleChange} onFocus={() => setOpen(true)}
        placeholder="Search part name or code..."
        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400" />
      {open && (
        <div className="absolute z-50 left-0 w-64 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length === 0
            ? <p className="px-3 py-2 text-xs text-gray-400 italic">No parts found — will save as typed</p>
            : filtered.map(p => (
              <button key={p.id} type="button" onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-50 last:border-0">
                <p className="text-xs font-medium text-gray-800">{p.part_name}</p>
                <p className="text-xs text-gray-400">{p.part_code} — Stock: {p.current_stock} — ₹{p.selling_price}</p>
              </button>
            ))
          }
        </div>
      )}
    </div>
  );
}

export default function Sales() {
  const [activeTab, setActiveTab] = useState('sales'); // 'sales' | 'invoices'

  // ── Sales state ──────────────────────────────────────────────────────
  const [sales, setSales]             = useState([]);
  const [salesTotal, setSalesTotal]   = useState(0);
  const [stats, setStats]             = useState({});
  const [salesPage, setSalesPage]     = useState(1);
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');
  const [salesLoading, setSalesLoading] = useState(true);

  const [modalOpen, setModalOpen]     = useState(false);
  const [viewItem, setViewItem]       = useState(null);
  const [viewData, setViewData]       = useState(null);
  const [payModal, setPayModal]       = useState(null);
  const [payForm, setPayForm]         = useState({ paid_amount: '', payment_method: 'cash', account_id: '', date: today() });
  const [form, setForm]               = useState(EMPTY_FORM);
  const [items, setItems]             = useState([{ ...EMPTY_ITEM }]);
  const [saving, setSaving]           = useState(false);
  const [deleteItem, setDeleteItem]   = useState(null);
  const [customers, setCustomers]     = useState([]);
  const [parts, setParts]             = useState([]);
  const [accounts, setAccounts]       = useState([]);

  // ── Invoice state ────────────────────────────────────────────────────
  const [invoices, setInvoices]           = useState([]);
  const [invoicesTotal, setInvoicesTotal] = useState(0);
  const [invPage, setInvPage]             = useState(1);
  const [invSearch, setInvSearch]         = useState('');
  const [invStatus, setInvStatus]         = useState('');
  const [invFrom, setInvFrom]             = useState('');
  const [invTo, setInvTo]                 = useState('');
  const [invLoading, setInvLoading]       = useState(true);
  const [invoiceModal, setInvoiceModal]   = useState(false);
  const [invoiceData, setInvoiceData]     = useState(null);
  const invoicePrintRef                   = useRef(null);

  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();
  const LIMIT = 20;

  // ── Fetch sales ───────────────────────────────────────────────────────
  const fetchSales = useCallback(async () => {
    setSalesLoading(true);
    try {
      const p = new URLSearchParams({ search, page: salesPage, limit: LIMIT });
      if (filterStatus) p.set('status', filterStatus);
      if (from) p.set('from', from);
      if (to)   p.set('to', to);
      const res = await api.get(`/sales?${p}`);
      setSales(res.data.sales);
      setSalesTotal(res.data.total);
      setStats(res.data.stats || {});
    } catch { error('Failed to load sales'); }
    finally { setSalesLoading(false); }
  }, [search, salesPage, filterStatus, from, to]);

  // ── Fetch invoices ────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    setInvLoading(true);
    try {
      const p = new URLSearchParams({ search: invSearch, page: invPage, limit: LIMIT });
      if (invStatus) p.set('status', invStatus);
      if (invFrom)   p.set('from', invFrom);
      if (invTo)     p.set('to', invTo);
      const res = await api.get(`/settings/invoices?${p}`);
      setInvoices(res.data.invoices);
      setInvoicesTotal(res.data.total);
    } catch {}
    finally { setInvLoading(false); }
  }, [invSearch, invPage, invStatus, invFrom, invTo]);

  useEffect(() => {
    fetchSales();
    api.get('/customers?limit=500').then(r => setCustomers(r.data.customers || [])).catch(() => {});
    api.get('/spare-parts?limit=500').then(r => setParts(r.data.parts || [])).catch(() => {});
    api.get('/accounts').then(r => setAccounts(r.data || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchSales(); }, [fetchSales]);
  useEffect(() => { setSalesPage(1); }, [search, filterStatus]);
  useEffect(() => { if (activeTab === 'invoices') fetchInvoices(); }, [activeTab, fetchInvoices]);
  useEffect(() => { setInvPage(1); }, [invSearch, invStatus]);

  // ── Sale form helpers ─────────────────────────────────────────────────
  const openCreate = () => { setForm(EMPTY_FORM); setItems([{ ...EMPTY_ITEM }]); setModalOpen(true); };

  const openView = async (id) => {
    try { const res = await api.get(`/sales/${id}`); setViewData(res.data); setViewItem(id); }
    catch { error('Failed to load sale details'); }
  };

  const addItem    = () => setItems(p => [...p, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));

  const onPartSelect = (i, p) => {
    if (p.id) {
      updateItem(i, 'part_id', p.id);
      updateItem(i, 'part_name', p.part_name);
      updateItem(i, 'part_number', p.part_number || '');
      updateItem(i, 'unit_price', p.selling_price || '');
      updateItem(i, 'gst_percent', p.gst_percent || 0);
    } else {
      updateItem(i, 'part_id', '');
      updateItem(i, 'part_name', p.part_name || '');
    }
  };

  const onCustomerSelect = (custId) => {
    const cust = customers.find(c => c.id === parseInt(custId));
    setForm(f => ({ ...f, customer_id: custId, customer_name: cust?.name || '', vehicle_number: cust?.vehicle_number || '' }));
  };

  const lineTotal = (item) => {
    const base = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0);
    const disc = base * ((parseFloat(item.discount_percent) || 0) / 100);
    const gst  = (base - disc) * ((parseFloat(item.gst_percent) || 0) / 100);
    return base - disc + gst;
  };
  const grandTotal = items.reduce((s, it) => s + lineTotal(it), 0);

  const handleSave = async () => {
    if (!form.date) { error('Date required'); return; }
    if (items.some(it => !it.part_name || !it.unit_price || !it.quantity)) { error('All items need name, quantity, and price'); return; }
    setSaving(true);
    try {
      const payload = { ...form, items: items.map(it => ({ ...it, quantity: parseInt(it.quantity), unit_price: parseFloat(it.unit_price), discount_percent: parseFloat(it.discount_percent) || 0, gst_percent: parseFloat(it.gst_percent) || 0 })) };
      if (form.payment_status === 'paid') payload.paid_amount = grandTotal;
      await api.post('/sales', payload);
      success('Sale recorded and stock updated');
      setModalOpen(false);
      fetchSales();
      if (activeTab === 'invoices') fetchInvoices();
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handlePayment = async () => {
    if (!payForm.paid_amount) { error('Enter paid amount'); return; }
    try {
      await api.put(`/sales/${payModal.id}/payment`, payForm);
      success('Payment recorded'); setPayModal(null); fetchSales();
    } catch (e) { error(e.response?.data?.error || 'Payment failed'); }
  };

  // ── Invoice helpers ───────────────────────────────────────────────────
  const openInvoice = async (saleId) => {
    try {
      // Find invoice linked to this sale
      const listRes = await api.get(`/settings/invoices?limit=500`);
      const inv = listRes.data.invoices.find(i => i.sale_id === saleId);
      if (!inv) { error('Invoice not found for this sale'); return; }
      const res = await api.get(`/settings/invoices/${inv.id}`);
      setInvoiceData(res.data);
      setInvoiceModal(true);
    } catch { error('Failed to load invoice'); }
  };

  const openInvoiceById = async (id) => {
    try {
      const res = await api.get(`/settings/invoices/${id}`);
      setInvoiceData(res.data);
      setInvoiceModal(true);
    } catch { error('Failed to load invoice'); }
  };

  const printInvoice = () => {
    const content = invoicePrintRef.current?.innerHTML;
    if (!content) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Invoice</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 24px; color: #111; margin: 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
        th { background: #4f46e5; color: white; padding: 10px 12px; font-size: 13px; }
        td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
        .header { display: flex; justify-content: space-between; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #4f46e5; }
        .bill-to { background: #eef2ff; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
        .totals { float: right; width: 280px; }
        .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
        .grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #4f46e5; padding-top: 8px; margin-top: 4px; color: #4f46e5; }
        .paid-row { color: #059669; font-weight: 600; }
        .balance-row { color: #dc2626; font-weight: bold; background: #fef2f2; padding: 8px 12px; border-radius: 6px; }
        .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }
        .status-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .status-paid { background: #d1fae5; color: #065f46; }
        .status-pending { background: #fee2e2; color: #991b1b; }
        .status-partial { background: #fef3c7; color: #92400e; }
        @media print { body { padding: 12px; } }
      </style></head><body>${content}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  // ── Sales table columns ───────────────────────────────────────────────
  const salesColumns = [
    { key: 'sale_no', label: 'Sale #', className: 'font-mono text-xs' },
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'customer_name', label: 'Customer', render: (v, row) => (
      <div><p className="font-medium">{v}</p>{row.vehicle_number && <p className="text-xs text-gray-400">{row.vehicle_number}</p>}</div>
    )},
    { key: 'total_amount',  label: 'Total',   render: v => <span className="font-semibold">{currency(v)}</span> },
    { key: 'paid_amount',   label: 'Paid',    render: v => <span className="text-green-600">{currency(v)}</span> },
    { key: 'pending_amount',label: 'Pending', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'gross_profit',  label: 'Profit',  render: v => <span className="text-indigo-600 font-medium">{currency(v)}</span> },
    { key: 'payment_status',label: 'Status',  render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[v] || ''}`}>{v}</span> },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openView(row.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg" title="View"><Eye size={14} /></button>
        <button onClick={() => openInvoice(row.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Invoice / Bill"><FileText size={14} /></button>
        {row.payment_status !== 'paid' && (
          <button onClick={() => { setPayModal(row); setPayForm({ paid_amount: row.pending_amount, payment_method: 'cash', account_id: '', date: today() }); }}
            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-lg hover:bg-green-200">Collect</button>
        )}
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  // ── Invoices table columns ────────────────────────────────────────────
  const invoiceColumns = [
    { key: 'invoice_no',    label: 'Invoice #', className: 'font-mono text-xs' },
    { key: 'date',          label: 'Date',     render: v => date(v) },
    { key: 'customer_name', label: 'Customer' },
    { key: 'vehicle_number',label: 'Vehicle',  render: v => v || '—' },
    { key: 'total_amount',  label: 'Total',    render: v => <span className="font-semibold">{currency(v)}</span> },
    { key: 'paid_amount',   label: 'Paid',     render: v => <span className="text-green-600">{currency(v)}</span> },
    { key: 'balance_amount',label: 'Balance',  render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'payment_status',label: 'Status',   render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BG[v] || ''}`}>{v}</span> },
    { key: 'actions', label: '', render: (_, row) => (
      <button onClick={() => openInvoiceById(row.id)} className="flex items-center gap-1.5 px-3 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-medium">
        <Printer size={12} />Print
      </button>
    )},
  ];

  // ── Invoice print template ────────────────────────────────────────────
  const InvoiceTemplate = () => {
    if (!invoiceData) return null;
    const inv = invoiceData.invoice;
    const biz = invoiceData.business || {};
    const hasDiscount = invoiceData.items.some(it => parseFloat(it.discount_percent) > 0);
    const hasGST      = invoiceData.items.some(it => parseFloat(it.gst_percent) > 0);
    return (
      <div ref={invoicePrintRef} className="bg-white">
        {/* Header */}
        <div className="flex justify-between items-start mb-6 pb-5 border-b-2 border-indigo-600">
          <div>
            <h2 className="text-2xl font-bold text-indigo-700">{biz.business_name || 'Auto Workshop'}</h2>
            {biz.business_address && <p className="text-sm text-gray-500 mt-1">{biz.business_address}</p>}
            {biz.business_phone   && <p className="text-sm text-gray-500">📞 {biz.business_phone}</p>}
            {biz.business_email   && <p className="text-sm text-gray-500">✉ {biz.business_email}</p>}
            {biz.business_gst     && <p className="text-sm text-gray-500 font-medium">GST: {biz.business_gst}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-indigo-600 tracking-wider">INVOICE</p>
            <p className="text-base font-mono font-semibold text-gray-800 mt-1">#{inv.invoice_no}</p>
            <p className="text-sm text-gray-500">Date: <strong>{date(inv.date)}</strong></p>
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold uppercase ${
              inv.payment_status === 'paid' ? 'bg-green-100 text-green-700 border border-green-300'
              : inv.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
              : 'bg-red-100 text-red-700 border border-red-300'
            }`}>{inv.payment_status}</span>
          </div>
        </div>

        {/* Bill To + Vehicle */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-indigo-50 rounded-lg p-4">
            <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2">Bill To</p>
            <p className="font-bold text-gray-900 text-base">{inv.customer_name}</p>
            {inv.customer_phone   && <p className="text-sm text-gray-600 mt-0.5">📞 {inv.customer_phone}</p>}
            {inv.customer_address && <p className="text-sm text-gray-600 mt-0.5">{inv.customer_address}</p>}
          </div>
          {inv.vehicle_number && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Vehicle</p>
              <p className="font-bold text-gray-900 text-base">🚗 {inv.vehicle_number}</p>
            </div>
          )}
        </div>

        {/* Items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-indigo-600 text-white">
              <th className="text-left px-3 py-2.5 rounded-tl-lg font-semibold">#</th>
              <th className="text-left px-3 py-2.5 font-semibold">Item</th>
              <th className="text-center px-3 py-2.5 font-semibold">Qty</th>
              <th className="text-right px-3 py-2.5 font-semibold">Rate</th>
              {hasDiscount && <th className="text-center px-3 py-2.5 font-semibold">Disc%</th>}
              {hasGST      && <th className="text-center px-3 py-2.5 font-semibold">GST%</th>}
              <th className="text-right px-3 py-2.5 rounded-tr-lg font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoiceData.items.map((item, i) => (
              <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                <td className="px-3 py-2.5 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-gray-900">{item.part_name}</p>
                  {item.part_number && <p className="text-xs text-gray-400">Part# {item.part_number}</p>}
                </td>
                <td className="px-3 py-2.5 text-center font-medium">{item.quantity}</td>
                <td className="px-3 py-2.5 text-right">{currency(item.unit_price)}</td>
                {hasDiscount && <td className="px-3 py-2.5 text-center text-red-600">{parseFloat(item.discount_percent) > 0 ? `${item.discount_percent}%` : '—'}</td>}
                {hasGST      && <td className="px-3 py-2.5 text-center text-blue-600">{parseFloat(item.gst_percent) > 0 ? `${item.gst_percent}%` : '—'}</td>}
                <td className="px-3 py-2.5 text-right font-bold">{currency(item.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-72 space-y-1">
            <div className="flex justify-between text-sm py-1">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-medium">{currency(inv.subtotal)}</span>
            </div>
            {parseFloat(inv.discount_amount) > 0 && (
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500">Discount</span>
                <span className="text-red-600 font-medium">− {currency(inv.discount_amount)}</span>
              </div>
            )}
            {parseFloat(inv.gst_amount) > 0 && (
              <div className="flex justify-between text-sm py-1">
                <span className="text-gray-500">GST / Tax</span>
                <span className="font-medium">{currency(inv.gst_amount)}</span>
              </div>
            )}
            <div className="flex justify-between py-2.5 border-t-2 border-indigo-600 mt-2">
              <span className="font-bold text-base">Grand Total</span>
              <span className="font-bold text-xl text-indigo-700">{currency(inv.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm py-1 border-t border-gray-200 pt-2">
              <span className="text-gray-500">Amount Paid</span>
              <span className="font-semibold text-green-600">{currency(inv.paid_amount)}</span>
            </div>
            {parseFloat(inv.balance_amount) > 0 ? (
              <div className="flex justify-between py-2 bg-red-50 px-3 rounded-lg mt-1 border border-red-200">
                <span className="font-bold text-red-700">Balance Due</span>
                <span className="font-bold text-red-700 text-base">{currency(inv.balance_amount)}</span>
              </div>
            ) : (
              <div className="flex justify-center py-2 bg-green-50 px-3 rounded-lg mt-1 border border-green-200">
                <span className="font-bold text-green-700">✓ FULLY PAID</span>
              </div>
            )}
          </div>
        </div>

        {/* Payment method */}
        {inv.payment_method && (
          <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm mb-4">
            <span className="text-gray-500">Payment Method: </span>
            <span className="font-semibold capitalize">{inv.payment_method.replace('_', ' ')}</span>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700">Thank you for your business! 🙏</p>
          {(biz.business_phone || biz.business_email) && (
            <p className="text-xs text-gray-400 mt-1">
              {biz.business_phone && `📞 ${biz.business_phone}`}
              {biz.business_phone && biz.business_email && ' | '}
              {biz.business_email && `✉ ${biz.business_email}`}
            </p>
          )}
        </div>
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader
        title="Sales & Invoices"
        subtitle="Manage sales, collect payments, and print bills"
        actions={
          <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            <Plus size={16} />New Sale
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Sales"  value={currency(stats.total)}  icon={ShoppingBag} color="green"  />
        <StatCard title="Collected"    value={currency(stats.paid)}   icon={Receipt}     color="indigo" />
        <StatCard title="Pending"      value={currency(stats.pending)} icon={ShoppingBag} color="yellow" />
        <StatCard title="Gross Profit" value={currency(stats.profit)} icon={TrendingUp}  color="purple" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('sales')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition border-b-2 ${activeTab === 'sales' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <ShoppingBag size={16} />Sales List
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'sales' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{salesTotal}</span>
          </button>
          <button
            onClick={() => setActiveTab('invoices')}
            className={`flex items-center gap-2 px-6 py-3.5 text-sm font-semibold transition border-b-2 ${activeTab === 'invoices' ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
          >
            <FileText size={16} />Invoices & Bills
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === 'invoices' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{invoicesTotal}</span>
          </button>
        </div>

        {/* ── SALES TAB ─────────────────────────────────────────────── */}
        {activeTab === 'sales' && (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Search sale, customer, vehicle..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
              </select>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={to}   onChange={e => setTo(e.target.value)}   className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <Table columns={salesColumns} data={sales} loading={salesLoading} />
            <Pagination page={salesPage} total={salesTotal} limit={LIMIT} onPageChange={setSalesPage} />
          </>
        )}

        {/* ── INVOICES TAB ──────────────────────────────────────────── */}
        {activeTab === 'invoices' && (
          <>
            <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  placeholder="Invoice no., customer..." value={invSearch} onChange={e => setInvSearch(e.target.value)} />
              </div>
              <select value={invStatus} onChange={e => setInvStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="pending">Pending</option>
              </select>
              <input type="date" value={invFrom} onChange={e => setInvFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              <input type="date" value={invTo}   onChange={e => setInvTo(e.target.value)}   className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <Table columns={invoiceColumns} data={invoices} loading={invLoading} emptyMessage="No invoices found" />
            <Pagination page={invPage} total={invoicesTotal} limit={LIMIT} onPageChange={setInvPage} />
          </>
        )}
      </div>

      {/* ── New Sale Modal ─────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Sale" size="xl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <FormField label="Date" required><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></FormField>
          <FormField label="Customer">
            <Select value={form.customer_id} onChange={e => onCustomerSelect(e.target.value)}>
              <option value="">Walk-in / New</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Customer Name"><Input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} placeholder="Name if not in list" /></FormField>
          <FormField label="Vehicle Number"><Input value={form.vehicle_number} onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))} placeholder="TN01AB1234" /></FormField>
          <FormField label="Payment Status">
            <Select value={form.payment_status} onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </Select>
          </FormField>
          {form.payment_status !== 'pending' && (
            <>
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
              {form.payment_status === 'partial' && (
                <FormField label="Paid Amount"><Input type="number" value={form.paid_amount} onChange={e => setForm(f => ({ ...f, paid_amount: e.target.value }))} /></FormField>
              )}
            </>
          )}
        </div>

        {/* Items */}
        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-gray-50 px-4 py-2 flex justify-between">
            <span className="text-sm font-medium text-gray-700">Sale Items</span>
            <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-600"><PlusCircle size={14} />Add Item</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-3 py-2 font-medium text-gray-600 w-48">Part</th>
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
                        onSelect={(p) => onPartSelect(i, p)}
                      />
                    </td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="1" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" max="100" value={item.discount_percent} onChange={e => updateItem(i, 'discount_percent', e.target.value)} /></td>
                    <td className="px-3 py-2"><input type="number" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" min="0" max="100" value={item.gst_percent} onChange={e => updateItem(i, 'gst_percent', e.target.value)} /></td>
                    <td className="px-3 py-2 font-medium text-right">{currency(lineTotal(item))}</td>
                    <td className="px-2"><button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600 p-1" disabled={items.length === 1}><X size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-gray-50 border-t">
                <td colSpan={5} className="px-4 py-2 text-right font-semibold">Grand Total:</td>
                <td className="px-3 py-2 font-bold text-green-700 text-right">{currency(grandTotal)}</td>
                <td></td>
              </tr></tfoot>
            </table>
          </div>
        </div>

        <FormField label="Notes"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></FormField>
        <div className="flex gap-3 mt-4">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">
            {saving ? 'Saving...' : 'Complete Sale'}
          </button>
        </div>
      </Modal>

      {/* ── View Sale Modal ────────────────────────────────────────── */}
      <Modal open={!!viewItem} onClose={() => { setViewItem(null); setViewData(null); }} title={`Sale — ${viewData?.sale?.sale_no || ''}`} size="lg">
        {viewData && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => { setViewItem(null); setViewData(null); openInvoice(viewData.sale.id); }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                <FileText size={15} />View Invoice / Print Bill
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-500">Customer:</span> <strong>{viewData.sale.customer_name}</strong></div>
              <div><span className="text-gray-500">Vehicle:</span> <strong>{viewData.sale.vehicle_number || '—'}</strong></div>
              <div><span className="text-gray-500">Date:</span> <strong>{date(viewData.sale.date)}</strong></div>
              <div><span className="text-gray-500">Gross Profit:</span> <strong className="text-indigo-600">{currency(viewData.sale.gross_profit)}</strong></div>
            </div>
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-50">
                <th className="text-left px-3 py-2">Part</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr></thead>
              <tbody>
                {viewData.items.map((it, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-2">{it.part_name}</td>
                    <td className="px-3 py-2 text-center">{it.quantity}</td>
                    <td className="px-3 py-2 text-right">{currency(it.unit_price)}</td>
                    <td className="px-3 py-2 text-right text-green-600">{currency(it.profit)}</td>
                    <td className="px-3 py-2 text-right font-medium">{currency(it.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-gray-50 border-t">
                <td colSpan={4} className="px-3 py-2 text-right font-semibold">Total:</td>
                <td className="px-3 py-2 text-right font-bold text-green-700">{currency(viewData.sale.total_amount)}</td>
              </tr></tfoot>
            </table>
            <div className="flex justify-between text-sm">
              <span>Paid: <strong className="text-green-600">{currency(viewData.sale.paid_amount)}</strong></span>
              <span>Pending: <strong className="text-red-600">{currency(viewData.sale.pending_amount)}</strong></span>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Collect Payment Modal ──────────────────────────────────── */}
      <Modal open={!!payModal} onClose={() => setPayModal(null)} title="Collect Payment" size="sm">
        <div className="space-y-4">
          <div className="bg-green-50 rounded-lg p-3 text-sm">Pending: <strong>{currency(payModal?.pending_amount)}</strong></div>
          <FormField label="Amount" required><Input type="number" value={payForm.paid_amount} onChange={e => setPayForm(f => ({ ...f, paid_amount: e.target.value }))} /></FormField>
          <FormField label="Date"><Input type="date" value={payForm.date} onChange={e => setPayForm(f => ({ ...f, date: e.target.value }))} /></FormField>
          <FormField label="Method">
            <Select value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}>
              {['cash','upi','bank_transfer','card'].map(m => <option key={m} value={m}>{paymentMethodLabel(m)}</option>)}
            </Select>
          </FormField>
          <FormField label="Account">
            <Select value={payForm.account_id} onChange={e => setPayForm(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">-- Account --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setPayModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handlePayment} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Collect</button>
        </div>
      </Modal>

      {/* ── Invoice / Bill Print Modal ─────────────────────────────── */}
      <Modal open={invoiceModal} onClose={() => { setInvoiceModal(false); setInvoiceData(null); }} title="Invoice / Bill" size="lg">
        {invoiceData && (
          <div>
            <div className="flex justify-end gap-2 mb-4">
              <button onClick={printInvoice}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                <Printer size={15} />Print Bill
              </button>
              <button onClick={printInvoice}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Download size={15} />Save as PDF
              </button>
            </div>
            <InvoiceTemplate />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteItem} onClose={() => setDeleteItem(null)} danger
        title="Delete Sale" confirmLabel="Delete"
        message="This will restore stock. Continue?"
        onConfirm={async () => {
          try { await api.delete(`/sales/${deleteItem.id}`); success('Deleted and stock restored'); setDeleteItem(null); fetchSales(); triggerRefresh(); }
          catch (e) { error(e.response?.data?.error || 'Delete failed'); }
        }}
      />
    </div>
  );
}
