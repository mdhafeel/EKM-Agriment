import { useState, useEffect } from 'react';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import { useNotification } from '../context/NotificationContext';
import PageHeader from '../components/common/PageHeader';
import Modal from '../components/common/Modal';
import Table from '../components/common/Table';
import { FormField, Input, Select } from '../components/common/FormField';
import { Wallet, Building2, Smartphone, Plus, ArrowRightLeft } from 'lucide-react';
import { today } from '../utils/formatters';

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAcc, setSelectedAcc] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txTotal, setTxTotal] = useState({});
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [transferForm, setTransferForm] = useState({ from_account_id: '', to_account_id: '', amount: '', date: today(), description: '' });
  const [newAccForm, setNewAccForm] = useState({ name: '', type: 'cash', opening_balance: '0', bank_name: '', account_number: '', ifsc_code: '' });
  const { success, error } = useNotification();

  const fetchAccounts = () => api.get('/accounts').then(r => setAccounts(r.data)).catch(() => {});
  const fetchTransfers = () => api.get('/accounts/transfers/list').then(r => setTransfers(r.data)).catch(() => {});

  useEffect(() => { fetchAccounts(); fetchTransfers(); }, []);

  useEffect(() => {
    if (!selectedAcc) return;
    setLoading(true);
    const params = new URLSearchParams({ page: txPage, limit: 50 });
    if (txFrom) params.set('from', txFrom);
    if (txTo) params.set('to', txTo);
    api.get(`/accounts/${selectedAcc.id}/transactions?${params}`)
      .then(r => { setTransactions(r.data.entries); setTxTotal(r.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedAcc, txPage, txFrom, txTo]);

  const handleTransfer = async () => {
    if (!transferForm.from_account_id || !transferForm.to_account_id || !transferForm.amount) { error('All fields required'); return; }
    try {
      await api.post('/accounts/transfer', transferForm);
      success('Transfer completed');
      setTransferModal(false);
      fetchAccounts(); fetchTransfers();
    } catch (e) { error(e.response?.data?.error || 'Transfer failed'); }
  };

  const handleAddAccount = async () => {
    if (!newAccForm.name) { error('Account name required'); return; }
    try {
      await api.post('/accounts', newAccForm);
      success('Account created');
      setAddModal(false);
      fetchAccounts();
    } catch (e) { error(e.response?.data?.error || 'Create failed'); }
  };

  const accIcon = (type) => {
    if (type === 'cash') return <Wallet size={20} />;
    if (type === 'bank') return <Building2 size={20} />;
    return <Smartphone size={20} />;
  };

  const accColor = (type) => {
    if (type === 'cash') return 'bg-green-500';
    if (type === 'bank') return 'bg-blue-500';
    if (type === 'upi') return 'bg-purple-500';
    return 'bg-gray-500';
  };

  const txColumns = [
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'transaction_no', label: 'Reference', className: 'font-mono text-xs' },
    { key: 'transaction_type', label: 'Type', render: v => <span className="capitalize text-xs bg-gray-100 px-2 py-0.5 rounded">{v}</span> },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'credit', label: 'Credit', render: v => parseFloat(v) > 0 ? <span className="text-green-600 font-medium">{currency(v)}</span> : '—' },
    { key: 'balance', label: 'Balance', render: v => <span className="font-semibold">{currency(v)}</span> },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Cash & Bank" subtitle="Account balances and transactions"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setAddModal(true)} className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50"><Plus size={16} />Add Account</button>
            <button onClick={() => setTransferModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-indigo-700"><ArrowRightLeft size={16} />Transfer</button>
          </div>
        }
      />

      {/* Account Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {accounts.map(acc => (
          <button key={acc.id} onClick={() => setSelectedAcc(acc)}
            className={`text-left p-5 rounded-xl border-2 transition ${selectedAcc?.id === acc.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-100 bg-white hover:border-gray-300'} shadow-sm`}>
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${accColor(acc.type)} rounded-xl flex items-center justify-center text-white`}>{accIcon(acc.type)}</div>
              <div>
                <p className="font-semibold text-gray-900">{acc.name}</p>
                <p className="text-xs text-gray-500 capitalize">{acc.type}</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{currency(acc.current_balance)}</p>
            <p className="text-xs text-gray-400 mt-1">Opening: {currency(acc.opening_balance)}</p>
          </button>
        ))}
      </div>

      {/* Transaction History */}
      {selectedAcc && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-gray-900">{selectedAcc.name} — Transaction History</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Credits: <strong className="text-green-600">{currency(txTotal.total_credit)}</strong></span>
                <span className="text-gray-500">Debits: <strong className="text-red-600">{currency(txTotal.total_debit)}</strong></span>
              </div>
            </div>
            <div className="flex gap-3 mt-3">
              <input type="date" value={txFrom} onChange={e => setTxFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
              <input type="date" value={txTo} onChange={e => setTxTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>
          <Table columns={txColumns} data={transactions} loading={loading} emptyMessage="No transactions for this account" />
        </div>
      )}

      {/* Recent Transfers */}
      {transfers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Recent Transfers</h3>
          <div className="space-y-3">
            {transfers.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <div className="flex-1"><span className="font-medium">{t.from_name}</span><span className="text-gray-400 mx-2">→</span><span className="font-medium">{t.to_name}</span></div>
                <span className="font-semibold text-indigo-600">{currency(t.amount)}</span>
                <span className="text-gray-400 text-xs">{date(t.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="Transfer Between Accounts" size="sm">
        <div className="space-y-4">
          <FormField label="From Account" required>
            <Select value={transferForm.from_account_id} onChange={e => setTransferForm(f => ({ ...f, from_account_id: e.target.value }))}>
              <option value="">-- Select --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({currency(a.current_balance)})</option>)}
            </Select>
          </FormField>
          <FormField label="To Account" required>
            <Select value={transferForm.to_account_id} onChange={e => setTransferForm(f => ({ ...f, to_account_id: e.target.value }))}>
              <option value="">-- Select --</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Amount ₹" required><Input type="number" value={transferForm.amount} onChange={e => setTransferForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" min="0" /></FormField>
          <FormField label="Date"><Input type="date" value={transferForm.date} onChange={e => setTransferForm(f => ({ ...f, date: e.target.value }))} /></FormField>
          <FormField label="Description"><Input value={transferForm.description} onChange={e => setTransferForm(f => ({ ...f, description: e.target.value }))} /></FormField>
          <div className="bg-yellow-50 text-yellow-800 text-xs p-3 rounded-lg">Note: Transfers are not counted as income or expense — they only move balance between accounts.</div>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setTransferModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleTransfer} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Transfer</button>
        </div>
      </Modal>

      {/* Add Account Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Account" size="sm">
        <div className="space-y-4">
          <FormField label="Account Name" required><Input value={newAccForm.name} onChange={e => setNewAccForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Current Account" /></FormField>
          <FormField label="Type" required>
            <Select value={newAccForm.type} onChange={e => setNewAccForm(f => ({ ...f, type: e.target.value }))}>
              <option value="cash">Cash</option><option value="bank">Bank</option><option value="upi">UPI</option><option value="other">Other</option>
            </Select>
          </FormField>
          <FormField label="Opening Balance ₹"><Input type="number" value={newAccForm.opening_balance} onChange={e => setNewAccForm(f => ({ ...f, opening_balance: e.target.value }))} /></FormField>
          {newAccForm.type === 'bank' && <>
            <FormField label="Bank Name"><Input value={newAccForm.bank_name} onChange={e => setNewAccForm(f => ({ ...f, bank_name: e.target.value }))} /></FormField>
            <FormField label="Account Number"><Input value={newAccForm.account_number} onChange={e => setNewAccForm(f => ({ ...f, account_number: e.target.value }))} /></FormField>
            <FormField label="IFSC Code"><Input value={newAccForm.ifsc_code} onChange={e => setNewAccForm(f => ({ ...f, ifsc_code: e.target.value }))} /></FormField>
          </>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={() => setAddModal(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700">Cancel</button>
          <button onClick={handleAddAccount} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Create</button>
        </div>
      </Modal>
    </div>
  );
}
