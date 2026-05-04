import React, { useState } from 'react';
import { Form, Input, Button, Typography, message, Space, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api';
import { setCredentials } from '../../store/slices/authSlice';

const { Text } = Typography;
const AMBER = '#F59E0B';

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: any) => {
    try {
      setLoading(true);
      const res: any = await authApi.login({ identifier: values.identifier, password: values.password });
      dispatch(setCredentials({ token: res.access_token, user: res.user }));
      message.success(t('login_success'));

      const role = res.user.role;
      if (role === 'admin' || role === 'dispatcher') navigate('/admin/dashboard');
      else if (role === 'driver') navigate('/driver/tasks');
      else navigate('/client/tasks');
    } catch (err: any) {
      message.error(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0B0F1A 0%, #111827 50%, #1C2030 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      {/* 背景装饰光晕 */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 600, height: 600, borderRadius: '50%',
        background: `radial-gradient(circle, ${AMBER}08 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* 公司 Logo + 名称 */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img
            src="/logo.svg"
            alt="Excellent Construction Ltd"
            style={{ width: 88, height: 88, marginBottom: 16 }}
          />
          <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.5 }}>
            Excellent Construction Ltd
          </div>
          <div style={{ fontSize: 12, color: '#4A5568', marginTop: 6, letterSpacing: 1 }}>
            DISPATCH MANAGEMENT SYSTEM
          </div>
        </div>

        {/* 登录卡片 */}
        <div style={{
          backgroundColor: '#141824',
          borderRadius: 20,
          padding: '32px 28px',
          border: '1px solid #1E2535',
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 24 }}>
            账号登录
          </div>

          <Form onFinish={onFinish} size="large" layout="vertical">
            <Form.Item name="identifier" rules={[{ required: true, message: '请输入账号' }]}
              style={{ marginBottom: 16 }}>
              <Input
                prefix={<UserOutlined style={{ color: '#4A5568' }} />}
                placeholder={t('email_or_username')}
                style={{
                  backgroundColor: '#0D1117', borderColor: '#1E2535',
                  color: '#E2E8F0', borderRadius: 12, height: 48,
                }}
              />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}
              style={{ marginBottom: 24 }}>
              <Input.Password
                prefix={<LockOutlined style={{ color: '#4A5568' }} />}
                placeholder={t('password')}
                style={{
                  backgroundColor: '#0D1117', borderColor: '#1E2535',
                  color: '#E2E8F0', borderRadius: 12, height: 48,
                }}
              />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              style={{
                height: 48, borderRadius: 12,
                background: `linear-gradient(135deg, ${AMBER}, #D97706)`,
                border: 'none', fontSize: 16, fontWeight: 700, color: '#000',
              }}
            >
              {t('login')}
            </Button>
          </Form>

          <Divider style={{ borderColor: '#1E2535' }}>
            <Text style={{ color: '#2D3748', fontSize: 12 }}>OR</Text>
          </Divider>

          <div style={{ textAlign: 'center' }}>
            <Text style={{ color: '#4A5568' }}>还没有账户？ </Text>
            <Link to="/register" style={{ color: AMBER }}>申请注册</Link>
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Space>
              <Button
                type="text" size="small"
                onClick={() => { i18n.changeLanguage('zh'); localStorage.setItem('language', 'zh'); }}
                style={{ color: '#4A5568', fontSize: 12 }}
              >中文</Button>
              <Button
                type="text" size="small"
                onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); }}
                style={{ color: '#4A5568', fontSize: 12 }}
              >English</Button>
            </Space>
          </div>
        </div>

        <Text style={{ display: 'block', textAlign: 'center', marginTop: 20, color: '#1E2535', fontSize: 12 }}>
          © 2025 Excellent Construction Ltd
        </Text>
      </div>
    </div>
  );
}
