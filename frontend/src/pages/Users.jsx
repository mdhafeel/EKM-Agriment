import { useState, useEffect } from 'react';
import api from '../utils/api';
import { dateTime } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Modal from '../components/common/Modal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { FormField, Input, Select, Badge } from '../components/common/FormField';
import { Plus, Edit, Trash2, Key } from 'lucide-react';

const ALL_MODULES = ['customers','suppliers','payments','investments','expenses','spare_parts','purchases','sales','accounts','ledger','reports'];

const EMPTY = { username: '', email: '', full_name: '', password: '', role: 'staff', permissions: [] };
const EMPTY_RESET = { user_id: null, new_password: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [resetModal, setResetModal] = useState(false);
  const [resetForm, setResetForm] = useState(EMPTY_RESET);
  const { success, error } = useNotification();
  const { user: currentUser } = useAuth();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch { error('Failed to load users'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const openCreate = () => { setEditItem(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (item) => {
    setEditItem(item);
    setForm({ username: item.username, email: item.email, full_name: item.full_name, password: '', role: item.role, permissions: item.permissions || [] });
    setModalOpen(true);
  };

  const togglePermission = (module) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(module) ? f.permissions.filter(p => p !== module) : [...f.permissions, module]
    }));
  };

  const handleSave = async () => {
    if (!form.username || !form.email || !form.full_name) { error('Username, email, full name required'); return; }
    if (!editItem && !form.password) { error('Password required for new user'); return; }
    setSaving(true);
    try {
      const payload = { ...form };
      if (editItem && !payload.password) delete payload.password;
      if (editItem) { await api.put(`/users/${editItem.id}`, payload); success('User updated'); }
      else { await api.post('/users', payload); success('User created'); }
      setModalOpen(false); fetchData();
    } catch (e) { error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (!resetForm.new_password || resetForm.new_password.length < 6) { error('Password must be at least 6 characters'); return; }
    try {
      await api.post('/auth/reset-password', resetForm);
      success('Password reset successfully');
      setResetModal(false);
      setResetForm(EMPTY_RESET);
    } catch (e) { error(e.response?.data?.error || 'Reset failed'); }
  };

  const columns = [
    { key: 'username', label: 'Username', className: 'font-mono text-sm' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>{v}</span> },
    { key: 'permissions', label: 'Permissions', render: (v, row) => row.role === 'admin' ? <span className="text-xs text-gray-400">All access</span> : <span className="text-xs text-gray-600">{(v || []).length} modules</span> },
    { key: 'is_active', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs ${v ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{v ? 'Active' : 'Inactive'}</span> },
    { key: 'created_at', label: 'Created', render: v => dateTime(v) },
    { key: 'actions', label: '', render: (_, row) => (
      <div className="flex items-center gap-1">
        <button onClick={() => { setResetModal(true); setResetForm({ user_id: row.id, new_password: '' }); }} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title="Reset Password"><Key size={14} /></button>
        <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={14} /></button>
        {row.id !== currentUser?.id && <button onClick={() => setDeleteItem(row)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}
      </div>
    )}
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="User Management" subtitle="Manage staff access and permissions"
        actions={<button onClick={openCreate} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"><Plus size={16} />Add User</button>}
      />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <Table columns={columns} data={users} loading={loading} />
      </div>

      {/* User Form Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit User' : 'Add User'} size="md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Full Name" required><Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></FormField>
          <FormField label="Username" required><Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></FormField>
          <FormField label="Email" required><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormField>
          <FormField label={editItem ? 'New Password (leave blank to keep)' : 'Password'} required={!editItem}>
            <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editItem ? 'Leave blank to keep current' : 'Min 6 characters'} />
          </FormField>
          <FormField label="Role" className="sm:col-span-2">
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, permissions: e.target.value === 'admin' ? ['*'] : [] }))}>
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </Select>
          </FormField>
          {form.role === 'staff' && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Module Permissions</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(module => (
                  <label key={module} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={form.permissions.includes(module)} onChange={() => togglePermission(module)}
                      className="rounded text-indigo-600 focus:ring-indigo-500" />
                    <span className="text-sm capitalize text-gray-700">{module.replace('_',' ')}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Saving...' : 'Save User'}</button>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={resetModal} onClose={() => setResetModal(false)} title="Reset Password" size="sm">
        <div className="space-y-4">
          <FormField label="New Password" required>
            <Input type="password" value={resetForm.new_password} onChange={e => setResetForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Min 6 characters" />
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setResetModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleReset} className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700">Reset Password</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={async () => { try { await api.delete(`/users/${deleteItem.id}`); success('User deactivated'); setDeleteItem(null); fetchData(); } catch (e) { error(e.response?.data?.error || 'Delete failed'); } }} danger title="Deactivate User" message={`Deactivate "${deleteItem?.full_name}"? They will no longer be able to login.`} confirmLabel="Deactivate" />
    </div>
  );
}
