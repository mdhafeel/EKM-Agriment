import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import StatCard from '../components/common/StatCard';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { FormField, Input, Select, Textarea } from '../components/common/FormField';
import { AlertTriangle, Package, BarChart3, CheckCircle, Edit, Trash2, Layers, Search } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';
import { useRefresh } from '../context/RefreshContext';

export default function Stock() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('');
  const [search, setSearch]       = useState('');
  const [editItem, setEditItem]   = useState(null);
  const [editForm, setEditForm]   = useState({});
  const [saving, setSaving]       = useState(false);
  const [adjustItem, setAdjustItem]   = useState(null);
  const [adjustQty, setAdjustQty]     = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [deleteItem, setDeleteItem]   = useState(null);
  const [deleting, setDeleting]       = useState(false);
  const [categories, setCategories]   = useState([]);
  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();

  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter) params.set('stock_status', filter);
    if (search) params.set('search', search);
    api.get(`/reports/stock?${params}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    api.get('/spare-parts/categories').then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const stockStatus = (part) => {
    if (part.current_stock === 0)                    return { label: 'Out of Stock', cls: 'bg-red-100 text-red-700' };
    if (part.current_stock <= part.min_stock_level)  return { label: 'Low Stock',    cls: 'bg-yellow-100 text-yellow-700' };
    if (part.current_stock > part.max_stock_level)   return { label: 'Overstock',    cls: 'bg-blue-100 text-blue-700' };
    return { label: 'Normal', cls: 'bg-green-100 text-green-700' };
  };

  const openEdit = async (partCode) => {
    try {
      const res = await api.get(`/spare-parts?search=${encodeURIComponent(partCode)}&limit=1`);
      const part = res.data.parts?.[0];
      if (!part) { error('Part not found'); return; }
      setEditItem(part);
      setEditForm({
        part_name:       part.part_name       || '',
        part_number:     part.part_number     || '',
        purchase_price:  part.purchase_price  ?? '',
        selling_price:   part.selling_price   ?? '',
        min_stock_level: part.min_stock_level ?? '',
        max_stock_level: part.max_stock_level ?? '',
        unit:            part.unit            || 'pcs',
        location:        part.location        || '',
        gst_percent:     part.gst_percent     ?? '',
        category_id:     part.category_id     || '',
        notes:           part.notes           || '',
      });
    } catch { error('Failed to load part details'); }
  };

  const handleSave = async () => {
    if (!editForm.part_name?.trim()) { error('Part name required'); return; }
    setSaving(true);
    try {
      await api.put(`/spare-parts/${editItem.id}`, {
        ...editForm,
        purchase_price:  parseFloat(editForm.purchase_price)  || 0,
        selling_price:   parseFloat(editForm.selling_price)   || 0,
        min_stock_level: parseInt(editForm.min_stock_level)   || 0,
        max_stock_level: parseInt(editForm.max_stock_level)   || 0,
        gst_percent:     parseFloat(editForm.gst_percent)     || 0,
      });
      success('Part updated');
      setEditItem(null);
      fetchData();
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Update failed'); }
    finally { setSaving(false); }
  };

  const handleAdjust = async () => {
    const qty = parseInt(adjustQty);
    if (isNaN(qty)) { error('Enter a valid quantity'); return; }
    try {
      await api.post(`/spare-parts/${adjustItem.id}/adjust-stock`, { quantity: qty, notes: adjustNotes || 'Manual adjustment' });
      success('Stock adjusted');
      setAdjustItem(null); setAdjustQty(''); setAdjustNotes('');
      fetchData();
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Adjustment failed'); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/spare-parts/${deleteItem.id}`);
      success('Part deleted');
      setDeleteItem(null);
      fetchData();
      triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Delete failed'); }
    finally { setDeleting(false); }
  };

  const columns = [
    { key: 'part_code',  label: 'Code', className: 'font-mono text-xs w-24' },
    {
      key: 'part_name', label: 'Part Name',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900">{v}</p>
          <p className="text-xs text-gray-400">{row.cat_name || '—'}</p>
        </div>
      ),
    },
    {
      key: 'current_stock', label: 'Stock',
      render: (v, row) => (
        <span className="font-bold text-gray-900">
          {v} <span className="text-xs text-gray-400 font-normal">{row.unit}</span>
        </span>
      ),
    },
    { key: 'min_stock_level', label: 'Min', render: v => <span className="text-xs">{v}</span>, hideOnMobile: true },
    { key: 'max_stock_level', label: 'Max', render: v => <span className="text-xs">{v}</span>, hideOnMobile: true },
    { key: 'purchase_price', label: 'Buy Price',  render: v => currency(v), hideOnMobile: true },
    { key: 'selling_price',  label: 'Sell Price', render: v => currency(v), hideOnMobile: true },
    { key: 'stock_value',    label: 'Value',       render: v => <span className="font-medium text-indigo-600">{currency(v)}</span>, hideOnMobile: true },
    {
      key: 'status', label: 'Status',
      render: (_, row) => {
        const s = stockStatus(row);
        return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>{s.label}</span>;
      },
    },
    { key: 'supplier_name', label: 'Supplier', render: v => v || '—' },
    {
      key: 'actions', label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button onClick={() => { setAdjustItem(row); setAdjustQty(''); setAdjustNotes(''); }}
            className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition" title="Adjust Stock">
            <Layers size={14} />
          </button>
          <button onClick={() => openEdit(row.part_code)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Edit">
            <Edit size={14} />
          </button>
          <button onClick={() => setDeleteItem(row)}
            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition" title="Delete">
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  const s = data?.summary || {};

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Stock" subtitle="Inventory levels — edit parts, adjust stock, delete items" />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard title="Total Parts"  value={s.total_parts  || 0}            icon={Package}       color="indigo" />
        <StatCard title="Total Value"  value={currency(s.total_value)}        icon={BarChart3}     color="blue"   />
        <StatCard title="Low Stock"    value={s.low_stock    || 0}            icon={AlertTriangle} color="yellow" />
        <StatCard title="Out of Stock" value={s.out_of_stock || 0}            icon={AlertTriangle} color="red"    />
        <StatCard title="Overstock"    value={s.overstock    || 0}            icon={CheckCircle}   color="teal"   />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search part name, code..."
              value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[['', 'All'], ['low', 'Low Stock'], ['out', 'Out of Stock'], ['over', 'Overstock']].map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${filter === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <Table columns={columns} data={data?.parts || []} loading={loading} emptyMessage="No parts found" />
      </div>

      {/* Edit Modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title={`Edit — ${editItem?.part_name || ''}`} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Part Name" required className="sm:col-span-2">
            <Input value={editForm.part_name || ''} onChange={e => setEditForm(f => ({ ...f, part_name: e.target.value }))} />
          </FormField>
          <FormField label="Part Number">
            <Input value={editForm.part_number || ''} onChange={e => setEditForm(f => ({ ...f, part_number: e.target.value }))} placeholder="OEM / Part number" />
          </FormField>
          <FormField label="Category">
            <Select value={editForm.category_id || ''} onChange={e => setEditForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">-- Select Category --</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Purchase Price">
            <Input type="number" value={editForm.purchase_price ?? ''} onChange={e => setEditForm(f => ({ ...f, purchase_price: e.target.value }))} min="0" />
          </FormField>
          <FormField label="Selling Price">
            <Input type="number" value={editForm.selling_price ?? ''} onChange={e => setEditForm(f => ({ ...f, selling_price: e.target.value }))} min="0" />
          </FormField>
          <FormField label="GST %">
            <Input type="number" value={editForm.gst_percent ?? ''} onChange={e => setEditForm(f => ({ ...f, gst_percent: e.target.value }))} min="0" max="100" />
          </FormField>
          <FormField label="Unit">
            <Input value={editForm.unit || ''} onChange={e => setEditForm(f => ({ ...f, unit: e.target.value }))} placeholder="pcs, kg, litre..." />
          </FormField>
          <FormField label="Min Stock">
            <Input type="number" value={editForm.min_stock_level ?? ''} onChange={e => setEditForm(f => ({ ...f, min_stock_level: e.target.value }))} min="0" />
          </FormField>
          <FormField label="Max Stock">
            <Input type="number" value={editForm.max_stock_level ?? ''} onChange={e => setEditForm(f => ({ ...f, max_stock_level: e.target.value }))} min="0" />
          </FormField>
          <FormField label="Location">
            <Input value={editForm.location || ''} onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))} placeholder="Rack A-1" />
          </FormField>
          <FormField label="Notes" className="sm:col-span-2">
            <Textarea value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setEditItem(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-medium">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={!!adjustItem} onClose={() => setAdjustItem(null)} title={`Adjust Stock — ${adjustItem?.part_name || ''}`} size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between text-sm">
            <span className="text-gray-500">Current Stock</span>
            <strong>{adjustItem?.current_stock} {adjustItem?.unit}</strong>
          </div>
          <FormField label="Adjustment Quantity" required>
            <Input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="+10 to add, -5 to remove" />
            <p className="text-xs text-gray-400 mt-1">Positive = add, Negative = remove</p>
          </FormField>
          {adjustQty && !isNaN(parseInt(adjustQty)) && (
            <div className={`flex justify-between p-3 rounded-lg text-sm font-medium ${(adjustItem?.current_stock + parseInt(adjustQty)) < 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
              <span>Stock after:</span>
              <strong>{adjustItem?.current_stock + parseInt(adjustQty)} {adjustItem?.unit}</strong>
            </div>
          )}
          <FormField label="Reason">
            <Textarea value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} placeholder="Reason for adjustment..." rows={2} />
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setAdjustItem(null)} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleAdjust} className="flex-1 px-4 py-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">Apply</button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        danger
        title="Delete Part"
        confirmLabel="Delete"
        message={`Delete "${deleteItem?.part_name}" (${deleteItem?.part_code})? This will remove the part from inventory.`}
      />
    </div>
  );
}
