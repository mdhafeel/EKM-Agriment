import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import { useRefresh } from '../context/RefreshContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import StatCard from '../components/common/StatCard';
import { FormField, Input, Select, Textarea } from '../components/common/FormField';
import SearchableSelect from '../components/common/SearchableSelect';
import {
  Plus, Search, Edit, Trash2, AlertTriangle, Package,
  BarChart3, Layers, Tag, ChevronRight, X, FolderPlus,
  PlusCircle, Check,
} from 'lucide-react';

const EMPTY_FORM = {
  part_name: '', part_number: '',
  category_id: '', subcategory_id: '',
  purchase_price: '', selling_price: '',
  opening_stock: '', min_stock_level: '5', max_stock_level: '100',
  unit: 'pcs', location: '', gst_percent: '0',
  barcode: '', notes: '',
};

export default function SpareParts() {
  // ── List state ─────────────────────────────────────────────────────────
  const [parts, setParts]               = useState([]);
  const [total, setTotal]               = useState(0);
  const [totalValue, setTotalValue]     = useState(0);
  const [lowStockCount, setLowStockCount]   = useState(0);
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  const [page, setPage]                 = useState(1);
  const [search, setSearch]             = useState('');
  const [filterCat, setFilterCat]       = useState('');
  const [filterSubCat, setFilterSubCat] = useState('');
  const [filterStock, setFilterStock]   = useState('');
  const [loading, setLoading]           = useState(true);

  // ── Part form ─────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // ── Stock adjust ─────────────────────────────────────────────────────
  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustQty, setAdjustQty]     = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');

  // ── Category manage modal ────────────────────────────────────────────
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCatName, setNewCatName]     = useState('');
  const [newSubCatName, setNewSubCatName] = useState('');
  const [newSubCatParent, setNewSubCatParent] = useState('');
  const [editCat, setEditCat]       = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [deleteCat, setDeleteCat]   = useState(null);

  // ── Quick-add inline (inside Add Part form) ───────────────────────────
  const [quickCatInput, setQuickCatInput] = useState('');
  const [quickSubInput, setQuickSubInput] = useState('');
  const [showQuickCat, setShowQuickCat]   = useState(false);
  const [showQuickSub, setShowQuickSub]   = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers]   = useState([]);

  const { success, error } = useNotification();
  const { triggerRefresh } = useRefresh();
  const LIMIT = 20;

  // ── Derived ──────────────────────────────────────────────────────────
  const availableSubcats = categories.find(c => String(c.id) === String(form.category_id))?.subcategories || [];
  const filterSubcats    = categories.find(c => String(c.id) === String(filterCat))?.subcategories || [];

  // ── Fetch ─────────────────────────────────────────────────────────────
  const fetchCategories = useCallback(() => {
    return api.get('/spare-parts/categories').then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const fetchParts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterCat)    p.set('category_id', filterCat);
      if (filterSubCat) p.set('subcategory_id', filterSubCat);
      if (filterStock)  p.set('stock_status', filterStock);
      const res = await api.get(`/spare-parts?${p}`);
      setParts(res.data.parts);
      setTotal(res.data.total);
      setTotalValue(res.data.totalValue);
      setLowStockCount(res.data.lowStockCount);
      setOutOfStockCount(res.data.outOfStockCount);
    } catch { error('Failed to load parts'); }
    finally { setLoading(false); }
  }, [search, page, filterCat, filterSubCat, filterStock]);

  useEffect(() => {
    fetchCategories();
    api.get('/suppliers?limit=200').then(r => setSuppliers(r.data.suppliers || [])).catch(() => {});
  }, []);
  useEffect(() => { fetchParts(); }, [fetchParts]);
  useEffect(() => { setPage(1); }, [search, filterCat, filterSubCat, filterStock]);
  useEffect(() => { setForm(f => ({ ...f, subcategory_id: '' })); }, [form.category_id]);
  useEffect(() => { setFilterSubCat(''); }, [filterCat]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  // ── Quick-add: new category inline ────────────────────────────────────
  const handleQuickAddCat = async () => {
    if (!quickCatInput.trim()) { error('Enter a category name'); return; }
    try {
      const res = await api.post('/spare-parts/categories', { name: quickCatInput.trim() });
      success(`Category "${quickCatInput.trim()}" added`);
      await fetchCategories();
      setForm(f => ({ ...f, category_id: String(res.data.id), subcategory_id: '' }));
      setQuickCatInput('');
      setShowQuickCat(false);
    } catch (e) { error(e.response?.data?.error || 'Failed'); }
  };

  // ── Quick-add: new subcategory inline ─────────────────────────────────
  const handleQuickAddSub = async () => {
    if (!form.category_id) { error('Select a category first'); return; }
    if (!quickSubInput.trim()) { error('Enter a subcategory name'); return; }
    try {
      const res = await api.post('/spare-parts/subcategories', { category_id: form.category_id, name: quickSubInput.trim() });
      success(`Subcategory "${quickSubInput.trim()}" added`);
      await fetchCategories();
      setForm(f => ({ ...f, subcategory_id: String(res.data.id) }));
      setQuickSubInput('');
      setShowQuickSub(false);
    } catch (e) { error(e.response?.data?.error || 'Failed'); }
  };

  // ── Part form open ─────────────────────────────────────────────────────
  const openCreate = () => {
    setEditItem(null); setForm(EMPTY_FORM);
    setShowQuickCat(false); setShowQuickSub(false);
    setQuickCatInput(''); setQuickSubInput('');
    setModalOpen(true);
  };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({
      part_name: item.part_name || '', part_number: item.part_number || '',
      category_id: item.category_id || '', subcategory_id: item.subcategory_id || '',
      purchase_price: item.purchase_price, selling_price: item.selling_price,
      opening_stock: item.opening_stock, min_stock_level: item.min_stock_level,
      max_stock_level: item.max_stock_level, unit: item.unit || 'pcs',
      location: item.location || '', gst_percent: item.gst_percent,
      barcode: item.barcode || '', notes: item.notes || '',
    });
    setShowQuickCat(false); setShowQuickSub(false);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.part_name.trim()) { error('Part name required'); return; }
    setSaving(true);
    try {
      const payload = { ...form, purchase_price: parseFloat(form.purchase_price) || 0, selling_price: parseFloat(form.selling_price) || 0 };
      if (editItem) { await api.put(`/spare-parts/${editItem.id}`, payload); success('Part updated'); }
      else          { await api.post('/spare-parts', payload);               success('Part created'); }
      setModalOpen(false); fetchParts(); triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  // ── Stock adjust ──────────────────────────────────────────────────────
  const handleAdjust = async () => {
    if (!adjustQty || isNaN(parseInt(adjustQty))) { error('Enter a valid quantity'); return; }
    try {
      await api.post(`/spare-parts/${adjustModal.id}/adjust-stock`, { quantity: parseInt(adjustQty), notes: adjustNotes });
      success('Stock adjusted');
      setAdjustModal(null); setAdjustQty(''); setAdjustNotes('');
      fetchParts(); triggerRefresh();
    } catch (e) { error(e.response?.data?.error || 'Adjustment failed'); }
  };

  // ── Category management (modal) ───────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) { error('Enter a category name'); return; }
    try { await api.post('/spare-parts/categories', { name: newCatName.trim() }); success('Category added'); setNewCatName(''); fetchCategories(); }
    catch (e) { error(e.response?.data?.error || 'Failed'); }
  };
  const handleAddSubcategory = async () => {
    if (!newSubCatParent || !newSubCatName.trim()) { error('Select a category and enter a name'); return; }
    try { await api.post('/spare-parts/subcategories', { category_id: newSubCatParent, name: newSubCatName.trim() }); success('Subcategory added'); setNewSubCatName(''); fetchCategories(); }
    catch (e) { error(e.response?.data?.error || 'Failed'); }
  };
  const handleEditCatSave = async () => {
    if (!editCatName.trim()) return;
    try {
      if (editCat.type === 'cat') await api.put(`/spare-parts/categories/${editCat.id}`, { name: editCatName });
      else await api.put(`/spare-parts/subcategories/${editCat.id}`, { name: editCatName });
      success('Updated'); setEditCat(null); setEditCatName(''); fetchCategories();
    } catch (e) { error(e.response?.data?.error || 'Failed'); }
  };
  const handleDeleteCat = async () => {
    try {
      if (deleteCat.type === 'cat') await api.delete(`/spare-parts/categories/${deleteCat.id}`);
      else await api.delete(`/spare-parts/subcategories/${deleteCat.id}`);
      success('Deleted'); setDeleteCat(null); fetchCategories();
    } catch (e) { error(e.response?.data?.error || 'Cannot delete — parts may be using it'); }
  };

  // ── Table ─────────────────────────────────────────────────────────────
  const stockBadge = p => {
    if (p.current_stock === 0)                   return <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">Out</span>;
    if (p.current_stock <= p.min_stock_level)    return <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium">Low</span>;
    if (p.current_stock > p.max_stock_level)     return <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700 font-medium">Over</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 font-medium">OK</span>;
  };

  const columns = [
    { key: 'part_code', label: 'Code', className: 'font-mono text-xs w-24' },
    { key: 'part_name', label: 'Part Name', render: (v, row) => (<div><p className="font-medium text-gray-900">{v}</p><p className="text-xs text-gray-400">{row.part_number ? row.part_number : ''}</p></div>) },
    { key: 'category_name_resolved', label: 'Category', render: (v, row) => (<div><p className="text-sm text-gray-700">{v || '—'}</p>{row.subcategory_name_resolved && <p className="text-xs text-indigo-500 flex items-center gap-0.5"><ChevronRight size={10} />{row.subcategory_name_resolved}</p>}</div>) },
    { key: 'current_stock', label: 'Stock', render: (v, row) => (<div className="flex items-center gap-2"><span className="font-semibold">{v}</span><span className="text-xs text-gray-400">{row.unit}</span>{stockBadge(row)}</div>) },
    { key: 'purchase_price', label: 'Buy',   render: v => currency(v) },
    { key: 'selling_price',  label: 'Sell',  render: v => currency(v) },
    { key: 'stock_value',    label: 'Value', render: v => <span className="font-medium text-indigo-600">{currency(v)}</span> },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => { setAdjustModal(row); setAdjustQty(''); setAdjustNotes(''); }} className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg" title="Adjust Stock"><Layers size={14} /></button>
        <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={14} /></button>
        <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Spare Parts" subtitle="Manage inventory and stock"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setCatModalOpen(true)} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition"><Tag size={15} />Categories</button>
            <button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"><Plus size={16} />Add Part</button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard title="Total Parts"  value={total}             icon={Package}       color="indigo" />
        <StatCard title="Stock Value"  value={currency(totalValue)} icon={BarChart3}  color="blue" />
        <StatCard title="Low Stock"    value={lowStockCount}     icon={AlertTriangle} color="yellow" />
        <StatCard title="Out of Stock" value={outOfStockCount}   icon={AlertTriangle} color="red" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search part name, code..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="min-w-[200px]">
            <SearchableSelect options={categories.map(c => ({ value: String(c.id), label: c.name }))} value={String(filterCat || '')} onChange={v => setFilterCat(v)} placeholder="All Categories" />
          </div>
          {filterCat && filterSubcats.length > 0 && (
            <div className="min-w-[200px]">
              <SearchableSelect options={filterSubcats.map(s => ({ value: String(s.id), label: s.name }))} value={String(filterSubCat || '')} onChange={v => setFilterSubCat(v)} placeholder="All Subcategories" />
            </div>
          )}
          <select value={filterStock} onChange={e => setFilterStock(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Stock</option><option value="low">Low Stock</option><option value="out">Out of Stock</option><option value="over">Overstock</option>
          </select>
        </div>
        <Table columns={columns} data={parts} loading={loading} emptyMessage="No spare parts found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>

      {/* ── Add/Edit Part Modal ────────────────────────────────────────── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Spare Part' : 'Add Spare Part'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Part Name" required className="sm:col-span-2">
            <Input value={form.part_name} onChange={set('part_name')} placeholder="e.g. Piston Kit" />
          </FormField>
          <FormField label="Part Number">
            <Input value={form.part_number} onChange={set('part_number')} placeholder="OEM / Part number" />
          </FormField>

          {/* ── CATEGORY with quick-add ── */}
          <FormField label="Category">
            <SearchableSelect
              options={categories.map(c => ({ value: String(c.id), label: c.name }))}
              value={String(form.category_id || '')}
              onChange={v => setForm(f => ({ ...f, category_id: v, subcategory_id: '' }))}
              placeholder="-- Search Category --"
            />
            {/* Quick-add toggle */}
            {!showQuickCat ? (
              <button type="button" onClick={() => setShowQuickCat(true)}
                className="mt-1.5 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                <PlusCircle size={13} />Add new category
              </button>
            ) : (
              <div className="mt-2 flex gap-2">
                <Input
                  value={quickCatInput}
                  onChange={e => setQuickCatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddCat()}
                  placeholder="New category name"
                  className="flex-1 text-xs"
                  autoFocus
                />
                <button onClick={handleQuickAddCat} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 flex items-center gap-1"><Check size={12} />Save</button>
                <button onClick={() => { setShowQuickCat(false); setQuickCatInput(''); }} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"><X size={12} /></button>
              </div>
            )}
          </FormField>

          {/* ── SUBCATEGORY with quick-add ── */}
          <FormField label="Subcategory">
            <SearchableSelect
              options={availableSubcats.map(s => ({ value: String(s.id), label: s.name }))}
              value={String(form.subcategory_id || '')}
              onChange={v => setForm(f => ({ ...f, subcategory_id: v }))}
              placeholder={!form.category_id ? '— Select category first —' : availableSubcats.length === 0 ? '— No subcategories —' : '-- Search Subcategory --'}
              disabled={!form.category_id}
            />
            {/* Quick-add toggle — only when category is selected */}
            {form.category_id && !showQuickSub ? (
              <button type="button" onClick={() => setShowQuickSub(true)}
                className="mt-1.5 flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                <PlusCircle size={13} />Add new subcategory
              </button>
            ) : form.category_id && showQuickSub ? (
              <div className="mt-2 flex gap-2">
                <Input
                  value={quickSubInput}
                  onChange={e => setQuickSubInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAddSub()}
                  placeholder="New subcategory name"
                  className="flex-1 text-xs"
                  autoFocus
                />
                <button onClick={handleQuickAddSub} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 flex items-center gap-1"><Check size={12} />Save</button>
                <button onClick={() => { setShowQuickSub(false); setQuickSubInput(''); }} className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50"><X size={12} /></button>
              </div>
            ) : null}
          </FormField>

          <FormField label="Purchase Price ₹" required><Input type="number" value={form.purchase_price} onChange={set('purchase_price')} placeholder="0.00" min="0" /></FormField>
          <FormField label="Selling Price ₹" required><Input type="number" value={form.selling_price} onChange={set('selling_price')} placeholder="0.00" min="0" /></FormField>
          <FormField label="GST %"><Input type="number" value={form.gst_percent} onChange={set('gst_percent')} placeholder="18" min="0" max="100" /></FormField>
          {!editItem && <FormField label="Opening Stock"><Input type="number" value={form.opening_stock} onChange={set('opening_stock')} placeholder="0" min="0" /></FormField>}
          <FormField label="Min Stock Level"><Input type="number" value={form.min_stock_level} onChange={set('min_stock_level')} min="0" /></FormField>
          <FormField label="Max Stock Level"><Input type="number" value={form.max_stock_level} onChange={set('max_stock_level')} min="0" /></FormField>
          <FormField label="Unit"><Input value={form.unit} onChange={set('unit')} placeholder="pcs, kg, litre..." /></FormField>
          <FormField label="Rack / Location"><Input value={form.location} onChange={set('location')} placeholder="Rack A-1" /></FormField>
          <FormField label="Barcode"><Input value={form.barcode} onChange={set('barcode')} /></FormField>
          <FormField label="Notes" className="sm:col-span-2"><Textarea value={form.notes} onChange={set('notes')} /></FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 font-medium">{saving ? 'Saving...' : 'Save Part'}</button>
        </div>
      </Modal>

      {/* ── Stock Adjust Modal ─────────────────────────────────────────── */}
      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title={`Adjust Stock — ${adjustModal?.part_name}`} size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm flex items-center justify-between"><span>Current Stock:</span><strong>{adjustModal?.current_stock} {adjustModal?.unit}</strong></div>
          <FormField label="Adjustment Quantity" required>
            <Input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} placeholder="+10 to add, -5 to remove" />
            <p className="text-xs text-gray-400 mt-1">Positive = add, Negative = remove</p>
          </FormField>
          <FormField label="Reason / Notes"><Textarea value={adjustNotes} onChange={e => setAdjustNotes(e.target.value)} rows={2} /></FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setAdjustModal(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleAdjust} className="flex-1 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700">Apply</button>
        </div>
      </Modal>

      {/* ── Category Management Modal ──────────────────────────────────── */}
      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Manage Categories & Subcategories" size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Left — Add new */}
          <div className="space-y-5">
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><FolderPlus size={15} />Add New Category</h4>
              <div className="flex gap-2">
                <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCategory()} placeholder="Category name" className="flex-1" />
                <button onClick={handleAddCategory} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Add</button>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><ChevronRight size={15} />Add New Subcategory</h4>
              <div className="space-y-2">
                <SearchableSelect options={categories.map(c => ({ value: String(c.id), label: c.name }))} value={String(newSubCatParent || '')} onChange={v => setNewSubCatParent(v)} placeholder="-- Parent Category --" />
                <div className="flex gap-2">
                  <Input value={newSubCatName} onChange={e => setNewSubCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSubcategory()} placeholder="Subcategory name" className="flex-1" />
                  <button onClick={handleAddSubcategory} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Add</button>
                </div>
              </div>
            </div>
            {editCat && (
              <div className="border border-indigo-200 rounded-lg p-3 bg-indigo-50">
                <p className="text-xs font-medium text-indigo-700 mb-2">Rename {editCat.type === 'cat' ? 'Category' : 'Subcategory'}</p>
                <div className="flex gap-2">
                  <Input value={editCatName} onChange={e => setEditCatName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEditCatSave()} className="flex-1" />
                  <button onClick={handleEditCatSave} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm">Save</button>
                  <button onClick={() => setEditCat(null)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">✕</button>
                </div>
              </div>
            )}
          </div>
          {/* Right — Category tree */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {categories.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No categories yet</p>}
            {categories.map(cat => (
              <div key={cat.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50">
                  <span className="font-medium text-sm text-gray-800 flex items-center gap-1.5">
                    <Tag size={13} className="text-indigo-400" />{cat.name}
                    <span className="text-xs text-gray-400">({cat.subcategories?.length || 0})</span>
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditCat({ id: cat.id, name: cat.name, type: 'cat' }); setEditCatName(cat.name); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit size={12} /></button>
                    <button onClick={() => setDeleteCat({ id: cat.id, name: cat.name, type: 'cat' })} className="p-1 text-red-400 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                  </div>
                </div>
                {cat.subcategories?.map(sub => (
                  <div key={sub.id} className="flex items-center justify-between px-3 py-1.5 border-t border-gray-100 hover:bg-gray-50">
                    <span className="text-sm text-gray-600 flex items-center gap-1.5 pl-3"><ChevronRight size={11} className="text-gray-400" />{sub.name}</span>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditCat({ id: sub.id, name: sub.name, type: 'sub' }); setEditCatName(sub.name); }} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit size={11} /></button>
                      <button onClick={() => setDeleteCat({ id: sub.id, name: sub.name, type: 'sub' })} className="p-1 text-red-400 hover:bg-red-50 rounded"><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
                {cat.subcategories?.length === 0 && <div className="px-3 py-1.5 border-t border-gray-100"><span className="text-xs text-gray-400 pl-3 italic">No subcategories</span></div>}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-gray-100 flex justify-end">
          <button onClick={() => setCatModalOpen(false)} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Done</button>
        </div>
      </Modal>

      {/* Delete Part */}
      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} danger title="Delete Part" confirmLabel="Delete"
        message={`Delete "${deleteItem?.part_name}"?`}
        onConfirm={async () => { try { await api.delete(`/spare-parts/${deleteItem.id}`); success('Part deleted'); setDeleteItem(null); fetchParts(); triggerRefresh(); } catch (e) { error(e.response?.data?.error || 'Delete failed'); } }}
      />

      {/* Delete Category/Subcategory */}
      <ConfirmDialog open={!!deleteCat} onClose={() => setDeleteCat(null)} danger
        title={`Delete ${deleteCat?.type === 'cat' ? 'Category' : 'Subcategory'}`} confirmLabel="Delete"
        message={`Delete "${deleteCat?.name}"?`}
        onConfirm={handleDeleteCat}
      />
    </div>
  );
}
