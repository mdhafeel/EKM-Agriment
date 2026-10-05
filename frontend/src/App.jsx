import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { RefreshProvider } from './context/RefreshContext';
import Layout from './components/Layout';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Suppliers from './pages/Suppliers';
import Payments from './pages/Payments';
import Investments from './pages/Investments';
import Expenses from './pages/Expenses';
import SpareParts from './pages/SpareParts';
import Purchases from './pages/Purchases';
import Sales from './pages/Sales';
import Stock from './pages/Stock';
import Accounts from './pages/Accounts';
import Ledger from './pages/Ledger';
import DailyTracking from './pages/DailyTracking';
import ProfitLoss from './pages/ProfitLoss';
import Reports from './pages/Reports';
import Notifications from './pages/Notifications';
import Users from './pages/Users';
import Settings from './pages/Settings';
import AuditLog from './pages/AuditLog';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerDetail />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/investments" element={<Investments />} />
              <Route path="/expenses" element={<Expenses />} />
              <Route path="/spare-parts" element={<SpareParts />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/sales" element={<Sales />} />
              <Route path="/stock" element={<Stock />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/daily-tracking" element={<DailyTracking />} />
              <Route path="/profit-loss" element={<ProfitLoss />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/audit-log" element={<ProtectedRoute adminOnly><AuditLog /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <NotificationProvider>
        <RefreshProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </RefreshProvider>
      </NotificationProvider>
    </BrowserRouter>
  );
}
