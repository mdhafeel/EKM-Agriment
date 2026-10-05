import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import StatCard from '../components/common/StatCard';
import Table from '../components/common/Table';
import { ArrowLeft, Phone, Car, MapPin, IndianRupee, Receipt, Package } from 'lucide-react';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('sales');

  useEffect(() => {
    api.get(`/customers/${id}`).then(r => setData(r.data)).catch(() => navigate('/customers')).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>;
  if (!data) return null;

  const { customer, sales, payments, stats } = data;

  return (
    <div className="p-6">
      <PageHeader
        title={customer.name}
        subtitle={customer.customer_code}
        actions={<button onClick={() => navigate('/customers')} className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"><ArrowLeft size={16} />Back</button>}
      />

      {/* Info Card */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {customer.phone && <div className="flex items-center gap-2"><Phone size={16} className="text-gray-400" /><span className="text-sm">{customer.phone}</span></div>}
          {customer.vehicle_number && <div className="flex items-center gap-2"><Car size={16} className="text-gray-400" /><span className="text-sm">{customer.vehicle_number} {customer.vehicle_model ? `(${customer.vehicle_model})` : ''}</span></div>}
          {customer.address && <div className="flex items-center gap-2 col-span-2"><MapPin size={16} className="text-gray-400" /><span className="text-sm">{customer.address}</span></div>}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="Total Billing" value={currency(stats.total_billing)} icon={IndianRupee} color="indigo" />
        <StatCard title="Amount Paid" value={currency(stats.total_paid)} icon={Receipt} color="green" />
        <StatCard title="Pending Balance" value={currency(stats.total_pending)} icon={Package} color="red" />
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
        <div className="flex border-b border-gray-100">
          {['sales', 'payments'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-6 py-3 text-sm font-medium capitalize transition ${tab === t ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{t}</button>
          ))}
        </div>
        <div className="p-4">
          {tab === 'sales' && (
            <Table
              columns={[
                { key: 'sale_no', label: 'Sale #', className: 'font-mono text-xs' },
                { key: 'date', label: 'Date', render: v => date(v) },
                { key: 'total_amount', label: 'Total', render: v => currency(v) },
                { key: 'paid_amount', label: 'Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
                { key: 'pending_amount', label: 'Pending', render: v => parseFloat(v) > 0 ? <span className="text-red-600">{currency(v)}</span> : '—' },
                { key: 'payment_status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v === 'paid' ? 'bg-green-100 text-green-700' : v === 'partial' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{v}</span> },
              ]}
              data={sales}
              emptyMessage="No sales found"
            />
          )}
          {tab === 'payments' && (
            <Table
              columns={[
                { key: 'payment_no', label: 'Payment #', className: 'font-mono text-xs' },
                { key: 'date', label: 'Date', render: v => date(v) },
                { key: 'amount', label: 'Amount', render: v => currency(v) },
                { key: 'payment_method', label: 'Method' },
                { key: 'status', label: 'Status', render: v => <span className={`px-2 py-0.5 rounded-full text-xs ${v === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{v}</span> },
              ]}
              data={payments}
              emptyMessage="No payments found"
            />
          )}
        </div>
      </div>
    </div>
  );
}
