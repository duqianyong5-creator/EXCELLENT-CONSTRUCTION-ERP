import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Badge, Button, Typography, Space } from 'antd';
import {
  DashboardOutlined, TeamOutlined, OrderedListOutlined, ClockCircleOutlined,
  WarningOutlined, BellOutlined, LogoutOutlined, TruckOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SettingOutlined, UserOutlined,
  NotificationOutlined,
} from '@ant-design/icons';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { useAnomalyAlarm } from '../../hooks/useAnomalyAlarm';
import DashboardPage from './DashboardPage';
import UsersPage from './UsersPage';
import TasksPage from './TasksPage';
import WorkRecordsPage from './WorkRecordsPage';
import AnomaliesPage from './AnomaliesPage';
import NotificationsPage from './NotificationsPage';
import AnnouncementsPage from './AnnouncementsPage';
import SettingsPage from './SettingsPage';

const { Sider, Header, Content } = Layout;
const { Text } = Typography;

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';

// monitor 标记：大屏监控账号只看「仪表盘(地图)」「异常管理」「通知」
const menuItems = [
  { key: '/admin/dashboard', icon: <DashboardOutlined />, label: '仪表盘', labelEn: 'Dashboard', monitor: true },
  { key: '/admin/users', icon: <TeamOutlined />, label: '用户管理', labelEn: 'Users' },
  { key: '/admin/tasks', icon: <OrderedListOutlined />, label: '任务管理', labelEn: 'Tasks' },
  { key: '/admin/work-records', icon: <ClockCircleOutlined />, label: '工时管理', labelEn: 'Work Records' },
  { key: '/admin/anomalies', icon: <WarningOutlined />, label: '异常管理', labelEn: 'Anomalies', monitor: true },
  { key: '/admin/notifications', icon: <BellOutlined />, label: '通知', labelEn: 'Notifications', monitor: true },
  { key: '/admin/announcements', icon: <NotificationOutlined />, label: '公告管理', labelEn: 'Announcements' },
  { key: '/admin/settings', icon: <SettingOutlined />, label: '系统设置', labelEn: 'Settings' },
];

const ROLE_LABELS: Record<string, string> = {
  admin: '管理员', dispatcher: '调度员', monitor: '监控大屏',
};

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { unread } = useSelector((s: RootState) => s.notif);
  const [collapsed, setCollapsed] = useState(false);
  const lang = i18n.language;

  // 全局静止报警提示音：任意管理页面都会响（不必停留在「异常管理」页）
  useAnomalyAlarm(!!user);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const userMenu = {
    items: [
      { key: 'logout', label: t('logout'), icon: <LogoutOutlined />, onClick: handleLogout, danger: true },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={208}
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 100,
          background: 'linear-gradient(180deg, #111827 0%, #1a1f2e 100%)',
          boxShadow: '4px 0 20px rgba(0,0,0,0.15)',
        }}
        trigger={null}
      >
        {/* Logo */}
        <div style={{
          height: 72,
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: 10,
          padding: collapsed ? '0 16px' : '0 14px',
        }}>
          <img
            src="/log.png"
            alt="logo"
            style={{
              width: 40, height: 40, borderRadius: '50%', objectFit: 'cover',
              border: `2px solid ${AMBER}55`, boxShadow: '0 0 0 3px rgba(245,158,11,0.08)',
              flexShrink: 0,
            }}
          />
          {!collapsed && (
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 14.5, lineHeight: 1.2, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
                ECT ERP
              </div>
              <div style={{
                color: 'rgba(255,255,255,0.45)', fontWeight: 500, fontSize: 10, letterSpacing: 0.2,
                whiteSpace: 'nowrap',
              }}>
                Management System
              </div>
            </div>
          )}
        </div>

        {/* Menu */}
        <div style={{ padding: '16px 10px' }}>
          {menuItems.filter((item) => user?.role !== 'monitor' || item.monitor).map((item) => {
            const isActive = location.pathname === item.key;
            const label = lang === 'zh' ? item.label : item.labelEn;

            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  display: 'flex', alignItems: 'center',
                  gap: 12, padding: '13px 16px',
                  borderRadius: 12, cursor: 'pointer',
                  marginBottom: 4,
                  background: isActive
                    ? `linear-gradient(135deg, ${AMBER}25, ${AMBER}10)`
                    : 'transparent',
                  border: isActive ? `1px solid ${AMBER}35` : '1px solid transparent',
                  color: isActive ? AMBER : 'rgba(255,255,255,0.55)',
                  fontSize: 14, fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
                  }
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                {!collapsed && <span style={{ whiteSpace: 'nowrap', flex: 1 }}>{label}</span>}
                {!collapsed && item.key === '/admin/notifications' && unread > 0 && (
                  <Badge count={unread} size="small" />
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom logout */}
        <div
          onClick={handleLogout}
          style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '14px 16px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            background: 'rgba(0,0,0,0.2)',
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 12, cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: '#ef4444', flexShrink: 0,
          }}>
            <LogoutOutlined />
          </div>
          {!collapsed && (
            <span style={{ color: '#fca5a5', fontSize: 14, fontWeight: 600 }}>退出登录</span>
          )}
        </div>
      </Sider>

      <Layout style={{
        marginLeft: collapsed ? 80 : 208,
        transition: 'margin 0.3s ease',
        background: 'transparent',
      }}>
        <Header style={{
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.05)',
          position: 'sticky',
          top: 0,
          zIndex: 99,
          height: 64,
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: 18, color: '#374151',
                width: 40, height: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            />
          </div>
          <Space size={16}>
            <Badge count={unread} size="small" offset={[-2, 2]}>
              <Button
                type="text"
                icon={<BellOutlined />}
                onClick={() => navigate('/admin/notifications')}
                style={{
                  color: '#374151',
                  width: 40, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 10,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fef3c7';
                  e.currentTarget.style.color = AMBER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#374151';
                }}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight" trigger={['click']}>
              <Space
                style={{
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: 12,
                  transition: 'all 0.2s',
                  border: '1px solid transparent',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f5f5f5';
                  e.currentTarget.style.borderColor = '#e5e5e5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#fef3c7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: AMBER_DARK,
                }}>
                  <UserOutlined />
                </div>
                <div>
                  <Text strong style={{ fontSize: 13, color: '#1a1a1a' }}>
                    {user?.fullName || user?.username}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                    {ROLE_LABELS[user?.role || ''] || '调度员'}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: '20px 24px',
          minHeight: 'calc(100vh - 104px)',
        }}>
          <Routes>
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="work-records" element={<WorkRecordsPage />} />
            <Route path="anomalies" element={<AnomaliesPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="announcements" element={<AnnouncementsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  );
}
