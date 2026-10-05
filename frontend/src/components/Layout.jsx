import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import {
  LayoutDashboard, Users, Truck, CreditCard, TrendingUp, Receipt,
  Package, ShoppingCart, ShoppingBag, BarChart3, Building2,
  Calendar, PieChart, BarChart2, Bell, Settings, LogOut,
  Menu, X, ChevronDown, Wrench, Search, Shield, UserCog
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, module: null },
  { path: '/customers', label: 'Customers', icon: Users, module: 'customers' },
  { path: '/suppliers', label: 'Suppliers', icon: Truck, module: 'suppliers' },
  { path: '/payments', label: 'Payments', icon: CreditCard, module: 'payments' },
  { path: '/investments', label: 'Investments', icon: TrendingUp, module: 'investments' },
  { path: '/expenses', label: 'Expenses', icon: Receipt, module: 'expenses' },
  { path: '/spare-parts', label: 'Spare Parts', icon: Package, module: 'spare_parts' },
  { path: '/purchases', label: 'Purchases', icon: ShoppingCart, module: 'purchases' },
  { path: '/sales', label: 'Sales & Invoices', icon: ShoppingBag, module: 'sales' },
  { path: '/stock', label: 'Stock', icon: BarChart3, module: 'spare_parts' },
  { path: '/accounts', label: 'Cash & Bank', icon: Building2, module: 'accounts' },
  { path: '/daily-tracking', label: 'Daily Tracking', icon: Calendar, module: null },
  { path: '/profit-loss', label: 'Profit & Loss', icon: PieChart, module: 'reports' },
  { path: '/reports', label: 'Reports', icon: BarChart2, module: 'reports' },
  { path: '/notifications', label: 'Notifications', icon: Bell, module: null },
  { path: '/users', label: 'Users', icon: UserCog, module: null, adminOnly: true },
  { path: '/audit-log', label: 'Audit Log', icon: Shield, module: null, adminOnly: true },
  { path: '/settings', label: 'Settings', icon: Settings, module: null },
];

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen]         = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount]         = useState(0);
  const [searchQ, setSearchQ]                 = useState('');
  const [searchResults, setSearchResults]     = useState([]);
  const [showSearch, setShowSearch]           = useState(false);
  const searchRef = useRef(null);
  const { user, logout, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Close mobile sidebar on route change
  useEffect(() => { setMobileSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    api.get('/notifications?unread_only=true&limit=1')
      .then(r => setUnreadCount(r.data.unreadCount || 0))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    if (searchQ.length >= 2) {
      const t = setTimeout(() => {
        api.get(`/settings/search?q=${encodeURIComponent(searchQ)}`)
          .then(r => setSearchResults(r.data.results || []))
          .catch(() => {});
      }, 300);
      return () => clearTimeout(t);
    } else { setSearchResults([]); }
  }, [searchQ]);

  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setShowSearch(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    document.body.style.overflow = mobileSidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileSidebarOpen]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const visibleNav = NAV_ITEMS.filter(item => {
    if (item.adminOnly && user?.role !== 'admin') return false;
    if (item.module && !hasPermission(item.module)) return false;
    return true;
  });

  // ── Sidebar nav content — isMobile ensures labels always show in mobile drawer ──
  const SidebarNav = ({ isMobile = false }) => {
    const showLabel = isMobile || sidebarOpen;
    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <Wrench size={18} className="text-white" />
            </div>
            {showLabel && (
              <span className="font-bold text-white text-sm leading-tight">
                AutoShop<br /><span className="text-indigo-300 font-normal text-xs">Manager</span>
              </span>
            )}
          </div>
          {isMobile && (
            <button onClick={() => setMobileSidebarOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg mb-0.5 transition-all group relative
                  ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {showLabel
                  ? <span className="text-sm font-medium">{item.label}</span>
                  : (
                    <div className="absolute left-14 bg-slate-800 text-white text-xs px-2 py-1 rounded
                      opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 shadow">
                      {item.label}
                    </div>
                  )
                }
              </Link>
            );
          })}
        </nav>

        {/* User strip */}
        <div className="border-t border-slate-700 p-3">
          <div className={`flex items-center gap-3 ${showLabel ? '' : 'justify-center'}`}>
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.full_name?.[0] || 'U'}
            </div>
            {showLabel && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{user?.full_name}</p>
                  <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
                </div>
                <button onClick={handleLogout} className="text-slate-400 hover:text-white transition" title="Logout">
                  <LogOut size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* ── Desktop Sidebar ─────────────────────────────────────── */}
      <aside className={`hidden lg:flex flex-col bg-slate-900 transition-all duration-300 flex-shrink-0 relative
        ${sidebarOpen ? 'w-56' : 'w-16'}`}>
        <SidebarNav />
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="absolute -right-3 top-6 w-6 h-6 bg-slate-700 rounded-full flex items-center
            justify-center text-slate-300 hover:bg-indigo-600 hover:text-white transition z-10 shadow"
        >
          {sidebarOpen
            ? <ChevronDown size={12} className="rotate-90" />
            : <ChevronDown size={12} className="-rotate-90" />}
        </button>
      </aside>

      {/* ── Mobile Sidebar Overlay ──────────────────────────────── */}
      {/* Backdrop */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/50 transition-opacity duration-300
          ${mobileSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileSidebarOpen(false)}
      />
      {/* Drawer — slides in from left */}
      <aside
        className={`lg:hidden fixed top-0 left-0 h-full w-72 max-w-[85vw] bg-slate-900 z-50
          flex flex-col transform transition-transform duration-300 ease-in-out
          ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarNav isMobile />
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Topbar */}
        <header className="bg-white border-b border-gray-200 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 h-14 flex-shrink-0 z-30">
          {/* Hamburger */}
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition flex-shrink-0"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          {/* Global Search */}
          <div className="relative flex-1 min-w-0" ref={searchRef}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition"
              placeholder="Search..."
              value={searchQ}
              onChange={e => { setSearchQ(e.target.value); setShowSearch(true); }}
              onFocus={() => setShowSearch(true)}
            />
            {showSearch && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-72 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button key={i}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center gap-2 border-b last:border-0"
                    onClick={() => { navigate(`/${r.module}/${r.id}`); setShowSearch(false); setSearchQ(''); }}>
                    <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded capitalize flex-shrink-0">{r.type}</span>
                    <span className="text-sm text-gray-700 truncate">{r.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link to="/notifications"
              className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
            <Link to="/settings"
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
              <Settings size={20} />
            </Link>
            <button onClick={handleLogout}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
              <LogOut size={15} />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
