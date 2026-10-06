import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useNotification } from '../context/NotificationContext';
import PageHeader from '../components/common/PageHeader';
import { FormField, Input, Select, Textarea } from '../components/common/FormField';
import { Save, Download, Building2, CreditCard, Bell, Database, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('business');
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwdSaving, setPwdSaving] = useState(false);
  const { success, error } = useNotification();
  const { user } = useAuth();

  useEffect(() => {
    api.get('/settings').then(r => setSettings(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      success('Settings saved successfully');
    } catch (e) {
      error(e.response?.data?.error || 'Failed to save settings — please try again');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = async () => {
    try {
      const res = await api.get('/settings/backup');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `workshop_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
      URL.revokeObjectURL(url);
      success('Backup downloaded');
    } catch { error('Backup failed'); }
  };

  const handlePwdChange = async () => {
    if (!pwdForm.current_password || !pwdForm.new_password) { error('All fields required'); return; }
    if (pwdForm.new_password !== pwdForm.confirm_password) { error('New passwords do not match'); return; }
    if (pwdForm.new_password.length < 6) { error('Password must be at least 6 characters'); return; }
    setPwdSaving(true);
    try {
      await api.post('/auth/change-password', { current_password: pwdForm.current_password, new_password: pwdForm.new_password });
      success('Password changed successfully');
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e) { error(e.response?.data?.error || 'Password change failed'); }
    finally { setPwdSaving(false); }
  };

  const set = (k) => (e) => setSettings(s => ({ ...s, [k]: e.target.value }));

  const TABS = [
    { key: 'business', label: 'Business Info', icon: Building2 },
    { key: 'invoice', label: 'Invoice & Currency', icon: CreditCard },
    { key: 'notifications', label: 'Notifications', icon: Bell },
    { key: 'backup', label: 'Backup & Data', icon: Database },
    { key: 'security', label: 'Security', icon: Lock },
  ];

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Settings" subtitle="Configure your workshop management system"
        actions={tab !== 'backup' && tab !== 'security' && <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60"><Save size={16} />{saving ? 'Saving...' : 'Save Settings'}</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Mobile: horizontal scrollable tabs */}
        <div className="lg:hidden bg-white rounded-xl border border-gray-100 shadow-sm p-3">
          <div className="flex overflow-x-auto gap-2 scrollbar-thin pb-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap flex-shrink-0
                    ${tab === t.key ? 'bg-indigo-600 text-white' : 'text-gray-600 bg-gray-50 hover:bg-gray-100'}`}>
                  <Icon size={14} />{t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Desktop: vertical tab nav */}
        <div className="hidden lg:block bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <nav className="space-y-1">
            {TABS.map(t => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left ${tab === t.key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Icon size={16} />{t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-6">
          {tab === 'business' && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Business Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Business Name" className="sm:col-span-2"><Input value={settings.business_name || ''} onChange={set('business_name')} /></FormField>
                <FormField label="Phone"><Input value={settings.business_phone || ''} onChange={set('business_phone')} /></FormField>
                <FormField label="Email"><Input type="email" value={settings.business_email || ''} onChange={set('business_email')} /></FormField>
                <FormField label="GST Number"><Input value={settings.business_gst || ''} onChange={set('business_gst')} /></FormField>
                <FormField label="Address" className="sm:col-span-2"><Textarea value={settings.business_address || ''} onChange={set('business_address')} rows={3} /></FormField>
              </div>
            </div>
          )}

          {tab === 'invoice' && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Invoice & Currency Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Currency Symbol"><Input value={settings.currency || '₹'} onChange={set('currency')} placeholder="₹" /></FormField>
                <FormField label="Invoice Prefix"><Input value={settings.invoice_prefix || 'INV'} onChange={set('invoice_prefix')} /></FormField>
                <FormField label="Purchase Prefix"><Input value={settings.purchase_prefix || 'PUR'} onChange={set('purchase_prefix')} /></FormField>
                <FormField label="Sale Prefix"><Input value={settings.sale_prefix || 'SAL'} onChange={set('sale_prefix')} /></FormField>
                <FormField label="Payment Prefix"><Input value={settings.payment_prefix || 'PAY'} onChange={set('payment_prefix')} /></FormField>
                <FormField label="Expense Prefix"><Input value={settings.expense_prefix || 'EXP'} onChange={set('expense_prefix')} /></FormField>
                <FormField label="Allow Negative Stock" className="sm:col-span-2">
                  <Select value={settings.allow_negative_stock || '0'} onChange={set('allow_negative_stock')}>
                    <option value="0">No — Block sale if stock is 0</option>
                    <option value="1">Yes — Allow negative stock (not recommended)</option>
                  </Select>
                </FormField>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Notification Settings</h3>
              <div className="space-y-4">
                {[
                  { key: 'low_stock_notify', label: 'Low stock alerts', desc: 'Notify when parts reach minimum stock level' },
                  { key: 'overdue_notify', label: 'Overdue payment alerts', desc: 'Notify when payments pass due date' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={settings[item.key] === '1'} onChange={e => setSettings(s => ({ ...s, [item.key]: e.target.checked ? '1' : '0' }))} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Data Backup</h3>
              <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                All data is stored in a local SQLite database. Export a full backup at any time as a JSON file.
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={handleBackup} className="flex items-center gap-3 p-4 border-2 border-dashed border-indigo-300 rounded-xl hover:bg-indigo-50 transition group">
                  <Download size={24} className="text-indigo-500 group-hover:text-indigo-700" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">Download Full Backup</p>
                    <p className="text-sm text-gray-500">Export all data as JSON — customers, sales, purchases, inventory, and more</p>
                  </div>
                </button>
              </div>
              <div className="p-4 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                <strong>Important:</strong> Back up your data regularly. The database file is located at <code className="bg-yellow-100 px-1 rounded">workshop-manager/backend/workshop.db</code>
              </div>
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-5">
              <h3 className="font-semibold text-gray-900">Change Password</h3>
              <p className="text-sm text-gray-500">Changing password for: <strong>{user?.username}</strong></p>
              <div className="space-y-4 max-w-md">
                <FormField label="Current Password"><Input type="password" value={pwdForm.current_password} onChange={e => setPwdForm(f => ({ ...f, current_password: e.target.value }))} /></FormField>
                <FormField label="New Password"><Input type="password" value={pwdForm.new_password} onChange={e => setPwdForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Min 6 characters" /></FormField>
                <FormField label="Confirm New Password"><Input type="password" value={pwdForm.confirm_password} onChange={e => setPwdForm(f => ({ ...f, confirm_password: e.target.value }))} /></FormField>
                <button onClick={handlePwdChange} disabled={pwdSaving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60">{pwdSaving ? 'Changing...' : 'Change Password'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
