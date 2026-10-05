import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import { Search, Printer, Download, Eye } from 'lucide-react';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewModal, setViewModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const LIMIT = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterStatus) params.set('status', filterStatus);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/settings/invoices?${params}`);
      setInvoices(res.data.invoices);
      setTotal(res.data.total);
    } catch {}
    finally { setLoading(false); }
  }, [search, page, filterStatus, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filterStatus]);

  const openInvoice = async (id) => {
    try {
      const res = await api.get(`/settings/invoices/${id}`);
      setInvoiceData(res.data);
      setViewModal(true);
    } catch {}
  };

  const printInvoice = () => { window.print(); };

  const statusBg = { paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', pending: 'bg-blue-100 text-blue-700' };

  const columns = [
    { key: 'invoice_no', label: 'Invoice #', className: 'font-mono text-xs' },
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'customer_name', label: 'Customer' },
    { key: 'vehicle_number', label: 'Vehicle', render: v => v || '—' },
    { key: 'total_amount', label: 'Total', render: v => <span className="font-semibold">{currency(v)}</span> },
    { key: 'paid_amount', label: 'Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
    { key: 'balance_amount', label: 'Balance', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'payment_status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBg[v] || ''}`}>{v}</span> },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openInvoice(row.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"><Eye size={14} /></button>
      </div>
    )}
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Invoices" subtitle="Sales invoices and receipts" />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Invoice number, customer..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Status</option>
            <option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option>
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <Table columns={columns} data={invoices} loading={loading} />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* Invoice Print Modal */}
      <Modal open={viewModal} onClose={() => setViewModal(false)} title="Invoice" size="lg">
        {invoiceData && (
          <div>
            <div className="flex justify-end gap-2 mb-4 print:hidden">
              <button onClick={printInvoice} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><Printer size={16} />Print</button>
            </div>
            <div id="invoice-print" className="border border-gray-200 rounded-xl p-6">
              {/* Business Header */}
              <div className="flex justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{invoiceData.business?.business_name || 'Auto Workshop'}</h2>
                  <p className="text-sm text-gray-500">{invoiceData.business?.business_address}</p>
                  <p className="text-sm text-gray-500">{invoiceData.business?.business_phone}</p>
                  {invoiceData.business?.business_gst && <p className="text-sm text-gray-500">GST: {invoiceData.business?.business_gst}</p>}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-indigo-600">INVOICE</p>
                  <p className="text-sm font-mono text-gray-700">{invoiceData.invoice.invoice_no}</p>
                  <p className="text-sm text-gray-500">Date: {date(invoiceData.invoice.date)}</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-2 ${invoiceData.invoice.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{invoiceData.invoice.payment_status?.toUpperCase()}</span>
                </div>
              </div>

              {/* Customer */}
              <div className="bg-gray-50 rounded-lg p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{invoiceData.invoice.customer_name}</p>
                {invoiceData.invoice.customer_phone && <p className="text-sm text-gray-600">{invoiceData.invoice.customer_phone}</p>}
                {invoiceData.invoice.vehicle_number && <p className="text-sm text-gray-600">Vehicle: {invoiceData.invoice.vehicle_number}</p>}
                {invoiceData.invoice.customer_address && <p className="text-sm text-gray-600">{invoiceData.invoice.customer_address}</p>}
              </div>

              {/* Items */}
              <table className="w-full text-sm mb-5">
                <thead><tr className="bg-indigo-600 text-white">
                  <th className="text-left px-3 py-2 rounded-tl-lg">#</th>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Disc%</th>
                  <th className="px-3 py-2">GST%</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Amount</th>
                </tr></thead>
                <tbody>
                  {invoiceData.items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-400">{i+1}</td>
                      <td className="px-3 py-2"><span className="font-medium">{item.part_name}</span>{item.part_number && <span className="text-xs text-gray-400 ml-1">({item.part_number})</span>}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{currency(item.unit_price)}</td>
                      <td className="px-3 py-2 text-center">{item.discount_percent || 0}%</td>
                      <td className="px-3 py-2 text-center">{item.gst_percent || 0}%</td>
                      <td className="px-3 py-2 text-right font-medium">{currency(item.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-1 text-sm"><span className="text-gray-500">Subtotal</span><span>{currency(invoiceData.invoice.subtotal)}</span></div>
                  {parseFloat(invoiceData.invoice.discount_amount) > 0 && <div className="flex justify-between py-1 text-sm"><span className="text-gray-500">Discount</span><span className="text-red-600">-{currency(invoiceData.invoice.discount_amount)}</span></div>}
                  {parseFloat(invoiceData.invoice.gst_amount) > 0 && <div className="flex justify-between py-1 text-sm"><span className="text-gray-500">GST</span><span>{currency(invoiceData.invoice.gst_amount)}</span></div>}
                  <div className="flex justify-between py-2 border-t border-gray-200 font-bold text-base mt-1"><span>Total</span><span className="text-indigo-700">{currency(invoiceData.invoice.total_amount)}</span></div>
                  <div className="flex justify-between py-1 text-sm"><span className="text-gray-500">Paid</span><span className="text-green-600">{currency(invoiceData.invoice.paid_amount)}</span></div>
                  {parseFloat(invoiceData.invoice.balance_amount) > 0 && <div className="flex justify-between py-2 border-t border-gray-200 font-bold text-base text-red-600"><span>Balance Due</span><span>{currency(invoiceData.invoice.balance_amount)}</span></div>}
                </div>
              </div>

              <div className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-gray-100">Thank you for your business!</div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
