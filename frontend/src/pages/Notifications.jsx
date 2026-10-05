import { useState, useEffect } from 'react';
import api from '../utils/api';
import { dateTime } from '../utils/formatters';
import PageHeader from '../components/common/PageHeader';
import { Bell, AlertTriangle, CheckCircle, Info, AlertCircle, Check, Trash2 } from 'lucide-react';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === 'unread') params.set('unread_only', 'true');
      const res = await api.get(`/notifications?${params}&limit=100`);
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [filter]);

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all/all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnreadCount(0);
  };

  const deleteNotification = async (id) => {
    await api.delete(`/notifications/${id}`);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const typeIcon = (type) => {
    if (type === 'low_stock' || type === 'out_of_stock') return <AlertTriangle size={18} className="text-yellow-500" />;
    if (type === 'overdue_payment') return <AlertCircle size={18} className="text-red-500" />;
    if (type === 'large_expense') return <AlertCircle size={18} className="text-orange-500" />;
    return <Info size={18} className="text-blue-500" />;
  };

  const typeBg = (type) => {
    if (type === 'low_stock' || type === 'out_of_stock') return 'bg-yellow-50 border-yellow-200';
    if (type === 'overdue_payment') return 'bg-red-50 border-red-200';
    if (type === 'large_expense') return 'bg-orange-50 border-orange-200';
    return 'bg-blue-50 border-blue-200';
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
      <PageHeader title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread notifications` : 'All caught up'}
        actions={
          <div className="flex gap-2">
            {unreadCount > 0 && <button onClick={markAllRead} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"><Check size={16} />Mark All Read</button>}
          </div>
        }
      />

      <div className="flex gap-2">
        {['all', 'unread'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition capitalize ${filter === f ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
            {f} {f === 'unread' && unreadCount > 0 && <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5">{unreadCount}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>
      ) : (
        <div className="space-y-3">
          {notifications.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 text-center">
              <Bell size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No notifications</p>
            </div>
          )}
          {notifications.map(n => (
            <div key={n.id} className={`flex items-start gap-4 p-4 rounded-xl border ${typeBg(n.type)} ${n.is_read ? 'opacity-60' : ''}`}>
              <div className="flex-shrink-0 mt-0.5">{typeIcon(n.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{n.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{dateTime(n.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!n.is_read && <button onClick={() => markRead(n.id)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Mark as read"><Check size={14} /></button>}
                    <button onClick={() => deleteNotification(n.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
              {!n.is_read && <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
