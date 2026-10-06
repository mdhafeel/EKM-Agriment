import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { FormField, Input, Textarea, Badge } from '../components/common/FormField';
import { Plus, Edit, Trash2, Eye, Search, Phone, Car } from 'lucide-react';

const EMPTY = { name: '', phone: '', email: '', address: '', vehicle_number: '', vehicle_model: '', vehicle_brand: '', notes: '' };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const { success, error } = useNotification();
  const navigate = useNavigate();
  const LIMIT = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/customers?search=${search}&page=${page}&limit=${LIMIT}`);
      setCustomers(res.data.customers);
      setTotal(res.data.total);
    } catch { error('Failed to load customers'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => { setEditItem(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ name: item.name, phone: item.phone || '', email: item.email || '', address: item.address || '', vehicle_number: item.vehicle_number || '', vehicle_model: item.vehicle_model || '', vehicle_brand: item.vehicle_brand || '', notes: item.notes || '' }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { error('Customer name is required'); return; }
    setSaving(true);
    try {
      if (editItem) {
        await api.put(`/customers/${editItem.id}`, form);
        success('Customer updated');
      } else {
        await api.post('/customers', form);
        success('Customer created');
      }
      setModalOpen(false);
      fetchData();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/customers/${deleteItem.id}`);
      success('Customer deleted');
      setDeleteItem(null);
      fetchData();
    } catch (e) { error(e.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const columns = [
    { key: 'customer_code', label: 'ID', className: 'w-24 font-mono text-xs' },
    { key: 'name', label: 'Name', render: (v, row) => (
      <div>
        <p className="font-medium text-gray-900">{v}</p>
        {row.phone && <p className="text-xs text-gray-500 flex items-center gap-1"><Phone size={10} />{row.phone}</p>}
      </div>
    )},
    { key: 'vehicle_number', label: 'Vehicle', render: (v, row) => v ? (
      <div className="flex items-center gap-1"><Car size={12} className="text-gray-400" /><span>{v}</span>{row.vehicle_model && <span className="text-xs text-gray-400">({row.vehicle_model})</span>}</div>
    ) : '—' },
    { key: 'total_billing', label: 'Total Billing', render: v => <span className="font-medium">{currency(v)}</span>, hideOnMobile: true },
    { key: 'total_paid', label: 'Paid', render: v => <span className="text-green-600 font-medium">{currency(v)}</span>, hideOnMobile: true },
    { key: 'total_pending', label: 'Pending', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : <span className="text-gray-400">{currency(0)}</span> },
    { key: 'last_payment_date', label: 'Last Activity', render: v => date(v) },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => navigate(`/customers/${row.id}`)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"><Eye size={15} /></button>
        <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit size={15} /></button>
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 size={15} /></button>
      </div>
    )}
  ];

  return (
    <div className="p-6">
      <PageHeader title="Customers" subtitle={`${total} customers`}
        actions={<button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"><Plus size={16} />Add Customer</button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search name, phone, vehicle..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Table columns={columns} data={customers} loading={loading} emptyMessage="No customers found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Customer' : 'Add Customer'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Customer Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" /></FormField>
          <FormField label="Phone Number"><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+91 9999999999" /></FormField>
          <FormField label="Email"><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" /></FormField>
          <FormField label="Vehicle Number"><Input value={form.vehicle_number} onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))} placeholder="TN01AB1234" /></FormField>
          <FormField label="Vehicle Brand"><Input value={form.vehicle_brand} onChange={e => setForm(f => ({ ...f, vehicle_brand: e.target.value }))} placeholder="Maruti, Honda..." /></FormField>
          <FormField label="Vehicle Model"><Input value={form.vehicle_model} onChange={e => setForm(f => ({ ...f, vehicle_model: e.target.value }))} placeholder="Swift, Activa..." /></FormField>
          <FormField label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Full address" /></FormField>
          <FormField label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes..." /></FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-medium">{saving ? 'Saving...' : 'Save Customer'}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} loading={deleting} danger
        title="Delete Customer" message={`Are you sure you want to delete "${deleteItem?.name}"? This will deactivate the customer record.`} confirmLabel="Delete" />
    </div>
  );
}
