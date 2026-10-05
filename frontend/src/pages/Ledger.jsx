import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { currency, date, dateTime } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import StatCard from '../components/common/StatCard';
import { Search, BookOpen, ArrowUp, ArrowDown } from 'lucide-react';

const TX_TYPES = ['investment','income','expense','purchase','sale','payment','transfer'];

export default function Ledger() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const LIMIT = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ search, page, limit: LIMIT });
      if (filterType) params.set('type', filterType);
      if (filterAccount) params.set('account_id', filterAccount);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/ledger?${params}`);
      setEntries(res.data.entries);
      setTotal(res.data.total);
      setStats({ total_debit: res.data.total_debit, total_credit: res.data.total_credit });
    } catch {}
    finally { setLoading(false); }
  }, [search, page, filterType, filterAccount, from, to]);

  useEffect(() => { fetchData(); api.get('/accounts').then(r => setAccounts(r.data)).catch(() => {}); }, []);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { setPage(1); }, [search, filterType, filterAccount]);

  const txTypeColor = { investment: 'bg-purple-100 text-purple-700', income: 'bg-green-100 text-green-700', expense: 'bg-red-100 text-red-700', purchase: 'bg-orange-100 text-orange-700', sale: 'bg-blue-100 text-blue-700', payment: 'bg-indigo-100 text-indigo-700', transfer: 'bg-gray-100 text-gray-700' };

  const columns = [
    { key: 'date', label: 'Date', render: v => date(v) },
    { key: 'transaction_no', label: 'Ref #', className: 'font-mono text-xs' },
    { key: 'transaction_type', label: 'Type', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${txTypeColor[v] || 'bg-gray-100 text-gray-700'}`}>{v}</span> },
    { key: 'description', label: 'Description', render: v => <span className="text-sm">{v}</span> },
    { key: 'party_name', label: 'Party', render: v => v || '—' },
    { key: 'account_name', label: 'Account', render: v => v || '—' },
    { key: 'payment_method', label: 'Method', render: v => v ? <span className="capitalize text-xs">{v.replace('_',' ')}</span> : '—' },
    { key: 'debit', label: 'Debit', render: v => parseFloat(v) > 0 ? <span className="text-red-600 font-medium">{currency(v)}</span> : <span className="text-gray-300">—</span> },
    { key: 'credit', label: 'Credit', render: v => parseFloat(v) > 0 ? <span className="text-green-600 font-medium">{currency(v)}</span> : <span className="text-gray-300">—</span> },
    { key: 'balance', label: 'Balance', render: v => <span className={`font-semibold ${parseFloat(v) >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{currency(v)}</span> },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Transaction Ledger" subtitle="Complete financial transaction history" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Total Entries" value={total} icon={BookOpen} color="indigo" />
        <StatCard title="Total Credits" value={currency(stats.total_credit)} icon={ArrowUp} color="green" />
        <StatCard title="Total Debits" value={currency(stats.total_debit)} icon={ArrowDown} color="red" />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Search description, reference..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Types</option>
            {TX_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <Table columns={columns} data={entries} loading={loading} emptyMessage="No ledger entries found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>
    </div>
  );
}
