import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { RootState } from '../../store';
import { logout } from '../../store/slices/authSlice';

const { Title, Text } = Typography;

export default function DriverLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((s: RootState) => s.auth);

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 24,
        padding: '48px 40px',
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ fontSize: 72, marginBottom: 16 }}>📱</div>

        <Title level={3} style={{ color: '#fff', margin: 0 }}>请使用手机 App</Title>
        <Text style={{ color: 'rgba(255,255,255,0.6)', display: 'block', marginTop: 12, fontSize: 15, lineHeight: 1.8 }}>
          司机端功能已迁移至手机 App
          <br />请在手机上打开 <strong style={{ color: '#1677ff' }}>Expo Go</strong> 扫码使用
        </Text>

        <div style={{
          background: 'rgba(22,119,255,0.15)',
          border: '1px solid rgba(22,119,255,0.3)',
          borderRadius: 12,
          padding: 16,
          marginTop: 24,
          textAlign: 'left',
        }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 8 }}>当前登录账户</div>
          <div style={{ color: '#fff', fontWeight: 600 }}>{user?.fullName || user?.username}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{user?.email}</div>
        </div>

        <div style={{
          marginTop: 24,
          padding: '12px 0',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
            App 功能：今日任务 · GPS追踪 · 拍照完工 · 工时记录
          </Text>
        </div>

        <Button
          icon={<LogoutOutlined />}
          onClick={handleLogout}
          style={{
            marginTop: 20,
            width: '100%',
            height: 42,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'rgba(255,255,255,0.6)',
            borderRadius: 10,
          }}
        >
          退出登录
        </Button>
      </div>
    </div>
  );
}
