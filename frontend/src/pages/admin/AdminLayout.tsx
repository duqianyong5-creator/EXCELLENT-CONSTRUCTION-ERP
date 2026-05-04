import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Typography, Space } from 'antd';
import {
  DashboardOutlined, TeamOutlined, OrderedListOutlined, ClockCircleOutlined,
  WarningOutlined, BellOutlined, UserOutlined, LogoutOutlined, TruckOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, GlobalOutlined,
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import DashboardPage from './DashboardPage';
import UsersPage from './UsersPage';
import TasksPage from './TasksPage';
import WorkRecordsPage from './WorkRecordsPage';
import AnomaliesPage from './AnomaliesPage';
import NotificationsPage from './NotificationsPage';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const AMBER = '#F59E0B';

const menuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '仪表盘', labelEn: 'Dashboard' },
  { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理', labelEn: 'Users' },
  { key: '/admin/tasks', icon: <OrderedListOutlined />, label: '任务管理', labelEn: 'Tasks' },
  { key: '/admin/work-records', icon: <ClockCircleOutlined />, label: '工时管理', labelEn: 'Work Records' },
  { key: '/admin/anomalies', icon: <WarningOutlined />, label: '异常管理', labelEn: 'Anomalies' },
  { key: '/admin/notifications', icon: <BellOutlined />, label: '通知', labelEn: 'Notifications' },
];

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { unread } = useSelector((s: RootState) => s.notif);
  const [collapsed, setCollapsed] = useState(false);
  const lang = i18n.language;

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const toggleLang = () => {
    const next = lang === 'zh' ? 'en' : 'zh';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
  };

  const userMenu = {
    items: [
      { key: 'lang', label: lang === 'zh' ? 'English' : '中文', icon: <GlobalOutlined />, onClick: toggleLang },
      { type: 'divider' as const },
      { key: 'logout', label: t('logout'), icon: <LogoutOutlined />, onClick: handleLogout, danger: true },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={220}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
          background: '#111827',
        }}
        trigger={null}
      >
        {/* Logo */}
        <div style={{
          height: 68,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: 10,
          padding: '0 14px',
        }}>
          <img
            src="/logo.svg"
            alt="logo"
            style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0 }}
          />
          {!collapsed && (
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 13, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                Excellent Construction
              </div>
              <div style={{ color: AMBER, fontWeight: 600, fontSize: 10, letterSpacing: 1 }}>
                Ltd — 调度管理
              </div>
            </div>
          )}
        </div>

        {/* Menu */}
        <div style={{ padding: '12px 8px' }}>
          {menuItems.map((item) => {
            const isActive = location.pathname === item.key;
            const label = lang === 'zh' ? item.label : item.labelEn;
            const icon = item.key === '/admin/notifications'
              ? <Badge count={unread} size="small" offset={[4, 0]}>{item.icon}</Badge>
              : item.icon;

            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 10, padding: '11px 14px',
                  borderRadius: 10, cursor: 'pointer',
                  marginBottom: 2,
                  background: isActive ? `linear-gradient(135deg, ${AMBER}22, ${AMBER}11)` : 'transparent',
                  border: isActive ? `1px solid ${AMBER}33` : '1px solid transparent',
                  color: isActive ? AMBER : 'rgba(255,255,255,0.55)',
                  fontSize: 14, fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>{label}</span>}
              </div>
            );
          })}
        </div>

        {/* Bottom user info */}
        {!collapsed && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: `${AMBER}33`, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                fontSize: 14, color: AMBER, fontWeight: 700,
              }}>
                {(user?.fullName || user?.username || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                  {user?.fullName || user?.username}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>
                  {user?.role === 'admin' ? '管理员' : '调度员'}
                </div>
              </div>
            </div>
          </div>
        )}
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin 0.2s' }}>
        <Header style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f0f0f0',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          height: 56,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 18, color: '#555' }}
            />
            {collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src="/logo.svg" alt="logo" style={{ width: 28, height: 28, borderRadius: 7 }} />
                <Text strong style={{ fontSize: 13, color: '#1a1a1a' }}>Excellent Construction Ltd</Text>
              </div>
            )}
          </div>
          <Space>
            <Badge count={unread} size="small">
              <Button
                type="text" icon={<BellOutlined />}
                onClick={() => navigate('/admin/notifications')}
                style={{ color: '#555' }}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 8 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 8,
                  background: `linear-gradient(135deg, ${AMBER}, #D97706)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: '#fff', fontWeight: 700,
                }}>
                  {(user?.fullName || user?.username || '?')[0].toUpperCase()}
                </div>
                <div>
                  <Text strong style={{ fontSize: 13 }}>{user?.fullName || user?.username}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                    {user?.role === 'admin' ? '管理员' : '调度员'}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: '20px 24px',
          minHeight: 'calc(100vh - 96px)',
        }}>
          <Routes>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="work-records" element={<WorkRecordsPage />} />
            <Route path="anomalies" element={<AnomaliesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
