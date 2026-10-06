import { useState } from 'react';
import api from '../utils/api';
import { currency, date } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import Table from '../components/common/Table';
import { BarChart2, Download, Search, Users, Truck, Package, TrendingUp, FileText } from 'lucide-react';

const REPORT_TYPES = [
  { key: 'summary', label: 'Summary Report', icon: BarChart2 },
  { key: 'customer-outstanding', label: 'Customer Outstanding', icon: Users },
  { key: 'supplier-outstanding', label: 'Supplier Outstanding', icon: Truck },
  { key: 'stock', label: 'Stock Report', icon: Package },
  { key: 'gst', label: 'GST / Tax Report', icon: FileText },
  { key: 'vehicle', label: 'Vehicle Report', icon: Search },
  { key: 'cash-flow', label: 'Cash Flow', icon: TrendingUp },
];

export default function Reports() {
  const [activeReport, setActiveReport] = useState('summary');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summaryType, setSummaryType] = useState('monthly');
  const [vehicleNumber, setVehicleNumber] = useState('');

  const runReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (activeReport === 'summary') params.set('type', summaryType);
      if (activeReport === 'vehicle') params.set('vehicle_number', vehicleNumber);
      const res = await api.get(`/reports/${activeReport}?${params}`);
      setData(res.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const exportCSV = (rows, filename) => {
    if (!rows || !rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(','), ...rows.map(r => keys.map(k => `"${r[k] ?? ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const renderReport = () => {
    if (!data) return <div className="text-center py-16 text-gray-400">Run a report to see results</div>;

    if (activeReport === 'customer-outstanding') return (
      <div>
        <div className="mb-4 p-3 bg-red-50 rounded-lg text-sm">Total Outstanding: <strong className="text-red-600">{currency(data.total_outstanding)}</strong></div>
        <Table columns={[
          { key: 'name', label: 'Customer' },
          { key: 'phone', label: 'Phone' },
          { key: 'vehicle_number', label: 'Vehicle' },
          { key: 'total_billing', label: 'Total Billed', render: v => currency(v) },
          { key: 'total_paid', label: 'Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
          { key: 'outstanding', label: 'Outstanding', render: v => <span className="text-red-600 font-bold">{currency(v)}</span> },
          { key: 'last_transaction', label: 'Last Transaction', render: v => date(v) },
        ]} data={data.customers || []} loading={loading} />
      </div>
    );

    if (activeReport === 'supplier-outstanding') return (
      <div>
        <div className="mb-4 p-3 bg-orange-50 rounded-lg text-sm">Total Payable: <strong className="text-orange-600">{currency(data.total_outstanding)}</strong></div>
        <Table columns={[
          { key: 'name', label: 'Supplier' },
          { key: 'contact_number', label: 'Phone' },
          { key: 'total_purchases', label: 'Total Purchases', render: v => currency(v) },
          { key: 'total_paid', label: 'Paid', render: v => <span className="text-green-600">{currency(v)}</span> },
          { key: 'outstanding', label: 'Outstanding', render: v => <span className="text-orange-600 font-bold">{currency(v)}</span> },
          { key: 'last_transaction', label: 'Last Transaction', render: v => date(v) },
        ]} data={data.suppliers || []} loading={loading} />
      </div>
    );

    if (activeReport === 'stock') return (
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {[['total_parts','Total Parts','indigo'],['out_of_stock','Out of Stock','red'],['low_stock','Low Stock','yellow']].map(([k,l,c]) => (
            <div key={k} className={`p-3 bg-${c}-50 rounded-lg text-center`}><p className="text-xs text-gray-500">{l}</p><p className={`text-xl font-bold text-${c}-600`}>{data.summary?.[k] || 0}</p></div>
          ))}
        </div>
        <Table columns={[
          { key: 'part_code', label: 'Code', className: 'font-mono text-xs' },
          { key: 'part_name', label: 'Part Name' },
          { key: 'current_stock', label: 'Stock', render: (v, row) => `${v} ${row.unit}` },
          { key: 'min_stock_level', label: 'Min' },
          { key: 'purchase_price', label: 'Buy', render: v => currency(v) },
          { key: 'stock_value', label: 'Value', render: v => <span className="font-medium text-indigo-600">{currency(v)}</span> },
        ]} data={data.parts || []} loading={loading} />
      </div>
    );

    if (activeReport === 'gst') return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4"><p className="text-xs text-gray-500 mb-1">Output GST (on Sales)</p><p className="text-xl font-bold text-green-600">{currency(data.output_gst)}</p><p className="text-xs text-gray-400">On sales of {currency(data.output_on)}</p></div>
          <div className="bg-red-50 rounded-lg p-4"><p className="text-xs text-gray-500 mb-1">Input GST (on Purchases)</p><p className="text-xl font-bold text-red-600">{currency(data.input_gst)}</p><p className="text-xs text-gray-400">On purchases of {currency(data.input_on)}</p></div>
          <div className={`rounded-lg p-4 ${data.net_gst_payable >= 0 ? 'bg-orange-50' : 'bg-blue-50'}`}><p className="text-xs text-gray-500 mb-1">Net GST {data.net_gst_payable >= 0 ? 'Payable' : 'Receivable'}</p><p className={`text-xl font-bold ${data.net_gst_payable >= 0 ? 'text-orange-600' : 'text-blue-600'}`}>{currency(Math.abs(data.net_gst_payable))}</p></div>
        </div>
      </div>
    );

    if (activeReport === 'vehicle') return (
      <div>
        {data.customers?.length > 0 && <div className="mb-4"><h4 className="font-medium mb-2">Matching Customers</h4><Table columns={[{key:'name',label:'Name'},{key:'phone',label:'Phone'},{key:'vehicle_number',label:'Vehicle'},{key:'vehicle_model',label:'Model'}]} data={data.customers} loading={loading} /></div>}
        {data.sales?.length > 0 && <div><h4 className="font-medium mb-2">Sales History</h4><Table columns={[{key:'sale_no',label:'Sale #',className:'font-mono text-xs'},{key:'date',label:'Date',render:v=>date(v)},{key:'customer_name',label:'Customer'},{key:'total_amount',label:'Amount',render:v=>currency(v)}]} data={data.sales} loading={loading} /></div>}
        {!data.customers?.length && !data.sales?.length && <p className="text-center text-gray-400 py-8">No records found for this vehicle</p>}
      </div>
    );

    if (activeReport === 'cash-flow') return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg p-4"><p className="text-xs text-gray-500 mb-2">Money In</p><p className="text-2xl font-bold text-green-600">{currency(data.money_in?.total)}</p><div className="mt-2 space-y-1 text-xs">{Object.entries(data.money_in||{}).filter(([k])=>k!=='total').map(([k,v])=><div key={k} className="flex justify-between"><span className="text-gray-500 capitalize">{k.replace('_',' ')}</span><span>{currency(v)}</span></div>)}</div></div>
          <div className="bg-red-50 rounded-lg p-4"><p className="text-xs text-gray-500 mb-2">Money Out</p><p className="text-2xl font-bold text-red-600">{currency(data.money_out?.total)}</p><div className="mt-2 space-y-1 text-xs">{Object.entries(data.money_out||{}).filter(([k])=>k!=='total').map(([k,v])=><div key={k} className="flex justify-between"><span className="text-gray-500 capitalize">{k.replace('_',' ')}</span><span>{currency(v)}</span></div>)}</div></div>
          <div className={`rounded-lg p-4 ${data.net_cash_flow >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}><p className="text-xs text-gray-500 mb-1">Net Cash Flow</p><p className={`text-2xl font-bold ${data.net_cash_flow >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{currency(data.net_cash_flow)}</p></div>
        </div>
      </div>
    );

    if (activeReport === 'summary') return (
      <Table columns={[
        { key: 'period', label: 'Period' },
        { key: 'total', label: 'Sales', render: v => currency(v) },
        { key: 'collected', label: 'Collected', render: v => <span className="text-green-600">{currency(v)}</span> },
      ]} data={data.sales || []} loading={loading} />
    );

    return null;
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Reports" subtitle="Business analytics and data exports" />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Report Selector */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Report Type</p>
          <nav className="space-y-1">
            {REPORT_TYPES.map(rt => {
              const Icon = rt.icon;
              return (
                <button key={rt.key} onClick={() => { setActiveReport(rt.key); setData(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition text-left ${activeReport === rt.key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
                  <Icon size={16} />{rt.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Report View */}
        <div className="lg:col-span-3 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            {activeReport === 'summary' && (
              <select value={summaryType} onChange={e => setSummaryType(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
              </select>
            )}
            {activeReport === 'vehicle' && (
              <input value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Vehicle number..." />
            )}
            <button onClick={runReport} disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-60">
              {loading ? 'Running...' : 'Run Report'}
            </button>
            {data && (
              <button onClick={() => exportCSV(
                activeReport === 'customer-outstanding' ? data.customers :
                activeReport === 'supplier-outstanding' ? data.suppliers :
                activeReport === 'stock' ? data.parts :
                data.sales || [],
                `${activeReport}_report.csv`
              )} className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                <Download size={15} />Export CSV
              </button>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            {loading ? <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div> : renderReport()}
          </div>
        </div>
      </div>
    </div>
  );
}
