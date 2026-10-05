import { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { dateTime } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import Pagination from '../components/common/Pagination';
import { Search, Shield } from 'lucide-react';

const ACTION_COLORS = { create: 'bg-green-100 text-green-700', update: 'bg-blue-100 text-blue-700', delete: 'bg-red-100 text-red-700', login: 'bg-indigo-100 text-indigo-700', logout: 'bg-gray-100 text-gray-700' };

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const LIMIT = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (filterModule) params.set('module', filterModule);
      if (filterAction) params.set('action', filterAction);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await api.get(`/audit-logs?${params}`);
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch {}
    finally { setLoading(false); }
  }, [page, filterModule, filterAction, from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    { key: 'created_at', label: 'Date/Time', render: v => dateTime(v) },
    { key: 'full_name', label: 'User', render: (v, row) => <span className="font-medium">{v || row.username}</span> },
    { key: 'action', label: 'Action', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ACTION_COLORS[v] || 'bg-gray-100 text-gray-600'}`}>{v}</span> },
    { key: 'module', label: 'Module', render: v => <span className="capitalize text-sm">{v?.replace('_',' ')}</span> },
    { key: 'record_id', label: 'Record ID', render: v => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'old_value', label: 'Old Value', render: v => v ? <span className="text-xs text-gray-500 truncate max-w-[120px] block font-mono">{v}</span> : '—' },
    { key: 'new_value', label: 'New Value', render: v => v ? <span className="text-xs text-gray-500 truncate max-w-[120px] block font-mono">{v}</span> : '—' },
    { key: 'ip_address', label: 'IP', render: v => v || '—' },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Audit Log" subtitle="Track all system changes and user actions" />

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3">
          <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Modules</option>
            {['auth','customers','suppliers','payments','investments','expenses','spare_parts','purchases','sales','accounts','users','settings'].map(m => <option key={m} value={m} className="capitalize">{m.replace('_',' ')}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Actions</option>
            {['create','update','delete','login','logout'].map(a => <option key={a} value={a} className="capitalize">{a}</option>)}
          </select>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <Table columns={columns} data={logs} loading={loading} emptyMessage="No audit logs found" />
        <Pagination page={page} total={total} limit={LIMIT} onPageChange={setPage} />
      </div>
    </div>
  );
}
