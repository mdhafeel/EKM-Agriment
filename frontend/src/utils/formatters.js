export const currency = (val) => {
  const num = parseFloat(val) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const number = (val) => {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('en-IN');
};

export const date = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return val; }
};

export const dateTime = (val) => {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return val; }
};

export const percent = (val) => `${parseFloat(val || 0).toFixed(2)}%`;

export const statusColor = (status) => {
  const map = {
    paid: 'text-green-700 bg-green-100',
    partial: 'text-yellow-700 bg-yellow-100',
    pending: 'text-blue-700 bg-blue-100',
    overdue: 'text-red-700 bg-red-100',
    active: 'text-green-700 bg-green-100',
    inactive: 'text-gray-600 bg-gray-100',
    low: 'text-yellow-700 bg-yellow-100',
    out: 'text-red-700 bg-red-100',
  };
  return map[status?.toLowerCase()] || 'text-gray-700 bg-gray-100';
};

export const paymentMethodLabel = (method) => {
  const map = { cash: 'Cash', upi: 'UPI', bank_transfer: 'Bank Transfer', card: 'Card', other: 'Other', internal: 'Internal' };
  return map[method] || method || '—';
};

export const today = () => new Date().toISOString().split('T')[0];
export const thisMonth = () => new Date().toISOString().substring(0, 7);
export const thisYear = () => new Date().getFullYear().toString();
