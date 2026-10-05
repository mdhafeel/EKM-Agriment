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
import { FormField, Input, Textarea } from '../components/common/FormField';
import { Plus, Edit, Trash2, Eye, Search } from 'lucide-react';

const EMPTY = { name: '', contact_number: '', email: '', address: '', gst_number: '', notes: '' };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]);
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
      const res = await api.get(`/suppliers?search=${search}&page=${page}&limit=${LIMIT}`);
      setSuppliers(res.data.suppliers);
      setTotal(res.data.total);
    } catch { error('Failed to load suppliers'); }
    finally { setLoading(false); }
  }, [search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => { setEditItem(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (item) => { setEditItem(item); setForm({ name: item.name, contact_number: item.contact_number || '', email: item.email || '', address: item.address || '', gst_number: item.gst_number || '', notes: item.notes || '' }); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.name.trim()) { error('Supplier name is required'); return; }
    setSaving(true);
    try {
      if (editItem) { await api.put(`/suppliers/${editItem.id}`, form); success('Supplier updated'); }
      else { await api.post('/suppliers', form); success('Supplier created'); }
      setModalOpen(false); fetchData();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/suppliers/${deleteItem.id}`);
      success('Supplier deleted'); setDeleteItem(null); fetchData();
    } catch (e) { error(e.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const columns = [
    { key: 'supplier_code', label: 'ID', className: 'font-mono text-xs w-24' },
    { key: 'name', label: 'Name', render: (v, row) => (<div><p className="font-medium">{v}</p>{row.contact_number && <p className="text-xs text-gray-400">{row.contact_number}</p>}</div>) },
    { key: 'gst_number', label: 'GST', render: v => v || '—' },
    { key: 'total_purchases', label: 'Total Purchases', render: v => currency(v) },
    { key: 'total_paid', label: 'Total Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
    { key: 'outstanding_payable', label: 'Outstanding', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'last_payment_date', label: 'Last Activity', render: v => date(v) },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => navigate(`/suppliers/${row.id}`)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"><Eye size={15} /></button>
        <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit size={15} /></button>
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 size={15} /></button>
      </div>
    )}
  ];

  return (
    <div className="p-6">
      <PageHeader title="Suppliers" subtitle={`${total} suppliers`}
        actions={<button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"><Plus size={16} />Add Supplier</button>}
      />
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <Table columns={columns} data={suppliers} loading={loading} />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Supplier' : 'Add Supplier'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Supplier Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField label="Contact Number"><Input value={form.contact_number} onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} /></FormField>
          <FormField label="Email"><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormField>
          <FormField label="GST Number"><Input value={form.gst_number} onChange={e => setForm(f => ({ ...f, gst_number: e.target.value }))} /></FormField>
          <FormField label="Address" className="sm:col-span-2"><Textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></FormField>
          <FormField label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </Modal>
      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete} loading={deleting} danger title="Delete Supplier" message={`Delete "${deleteItem?.name}"?`} confirmLabel="Delete" />
    </div>
  );
}
