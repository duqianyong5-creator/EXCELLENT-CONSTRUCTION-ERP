import React, { useEffect, Component } from 'react';

class ErrorBoundary extends Component<{ children: React.ReactNode }, { error: any }> {
  state = { error: null };
  static getDerivedStateFromError(error: any) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444' }}>页面加载出错</h2>
          <pre style={{ color: '#666', fontSize: 12, textAlign: 'left', maxWidth: 600, margin: '0 auto' }}>
            {String(this.state.error)}
          </pre>
          <button onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
            style={{ marginTop: 20, padding: '8px 24px', background: '#F59E0B', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            清除缓存并重新登录
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from './store';
import { setUnread } from './store/slices/notifSlice';
import { useSocket } from './hooks/useSocket';
import { notificationsApi } from './api';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import AdminLayout from './pages/admin/AdminLayout';
import DriverLayout from './pages/driver/DriverLayout';
import ClientLayout from './pages/client/ClientLayout';

function RequireAuth({ children, roles }: { children: JSX.Element; roles?: string[] }) {
  const { isAuthenticated, user } = useSelector((s: RootState) => s.auth);
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/unauthorized" replace />;
  return children;
}

function RoleRouter() {
  const { user } = useSelector((s: RootState) => s.auth);
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'admin':
    case 'dispatcher':
      return <Navigate to="/admin/dashboard" replace />;
    case 'driver':
      return <Navigate to="/driver/tasks" replace />;
    case 'client':
      return <Navigate to="/client/tasks" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}

export default function App() {
  const { token } = useSelector((s: RootState) => s.auth);
  const dispatch = useDispatch();
  useSocket(token);

  useEffect(() => {
    if (token) {
      notificationsApi.unreadCount().then((count: any) => {
        dispatch(setUnread(typeof count === 'number' ? count : 0));
      });
    }
  }, [token]);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<RoleRouter />} />

        {/* Admin / Dispatcher */}
        <Route
          path="/admin/*"
          element={
            <RequireAuth roles={['admin', 'dispatcher']}>
              <AdminLayout />
            </RequireAuth>
          }
        />

        {/* Driver */}
        <Route
          path="/driver/*"
          element={
            <RequireAuth roles={['driver']}>
              <DriverLayout />
            </RequireAuth>
          }
        />

        {/* Client */}
        <Route
          path="/client/*"
          element={
            <RequireAuth roles={['client']}>
              <ClientLayout />
            </RequireAuth>
          }
        />

        <Route path="/unauthorized" element={<div style={{ padding: 40, textAlign: 'center', fontSize: 24 }}>无权访问</div>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
