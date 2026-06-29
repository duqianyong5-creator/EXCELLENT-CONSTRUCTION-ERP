import React, { useState } from 'react';
import { Form, Input, Button, message } from 'antd';
import {
  UserOutlined, LockOutlined, LaptopOutlined, PhoneOutlined, MailOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api';
import { setCredentials } from '../../store/slices/authSlice';

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';

// 左侧功能标签 —— 根据本系统真实功能
const FEATURES = ['用户管理', '任务调度', '工时记录', 'GPS 追踪', '异常监控', '通知中心'];

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
      if (role === 'admin' || role === 'dispatcher' || role === 'monitor') navigate('/admin/dashboard');
      else if (role === 'driver') navigate('/driver/tasks');
      else navigate('/client/tasks');
    } catch (err: any) {
      message.error(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        {/* ===== 左侧：品牌信息 ===== */}
        <div className="login-left">
          <img src="./log.png" alt="Excellent Construction Ltd" className="login-logo" />

          <div className="brand-name">
            EXCELLENT<br />
            <span style={{ color: AMBER }}>CONSTRUCTION</span> LTD
          </div>
          <div className="brand-sub">DISPATCH MANAGEMENT SYSTEM</div>

          <div className="feature-tags">
            {FEATURES.map((f) => (
              <span key={f} className="feature-tag">{f}</span>
            ))}
          </div>

          <div className="contact-block">
            <div className="contact-row">
              <span className="contact-icon"><LaptopOutlined /></span>
              <div>
                <div className="contact-main">IT Project Manager</div>
                <div className="contact-sub">
                  IT 项目经理 <PhoneOutlined style={{ color: AMBER, margin: '0 4px' }} /> 021 079 8567
                </div>
              </div>
            </div>
            <div className="contact-row">
              <span className="contact-icon"><MailOutlined /></span>
              <div className="contact-main">duqianyong5@gmail.com</div>
            </div>
          </div>
        </div>

        {/* ===== 右侧：登录表单 ===== */}
        <div className="login-right">
          <div className="accent-bar" />
          <h1 className="portal-title">Admin Portal</h1>
          <p className="portal-sub">Dashboard · Tasks · Records · Users</p>

          <Form onFinish={onFinish} layout="vertical" requiredMark={false} className="login-form">
            <Form.Item
              name="identifier"
              label={<span className="field-label">USERNAME <span className="field-label-zh">用户名</span></span>}
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#9ca3af' }} />}
                placeholder={t('email_or_username')}
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="field-label">PASSWORD <span className="field-label-zh">密码</span></span>}
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#9ca3af' }} />}
                placeholder={t('password')}
                autoComplete="current-password"
              />
            </Form.Item>

            <Button type="primary" htmlType="submit" loading={loading} block className="signin-btn">
              Sign In&nbsp;→
            </Button>
          </Form>

          <div className="right-footer" style={{ justifyContent: 'flex-end' }}>
            <span className="lang-switch">
              <button
                className={i18n.language === 'zh' ? 'lang-on' : 'lang-off'}
                onClick={() => { i18n.changeLanguage('zh'); localStorage.setItem('language', 'zh'); }}
              >CN</button>
              <button
                className={i18n.language === 'en' ? 'lang-on' : 'lang-off'}
                onClick={() => { i18n.changeLanguage('en'); localStorage.setItem('language', 'en'); }}
              >EN</button>
            </span>
          </div>

          <div className="version">V1.0.0</div>
        </div>
      </div>

      <style>{`
        .login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(circle at 6% 94%, rgba(245,158,11,0.16), transparent 42%),
            linear-gradient(135deg, #0d1424 0%, #131c30 50%, #0b1220 100%);
          background-color: #0b1220;
        }
        .login-bg::before {
          content: '';
          position: fixed; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 44px 44px;
          pointer-events: none;
        }
        .login-card {
          position: relative; z-index: 1;
          display: flex;
          width: 100%; max-width: 880px;
          min-height: 460px;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 30px 80px rgba(0,0,0,0.55);
        }
        /* 左侧 */
        .login-left {
          flex: 1;
          background: linear-gradient(160deg, #1a2336 0%, #131b2c 100%);
          padding: 40px 40px;
          display: flex; flex-direction: column;
        }
        .login-logo {
          width: 100px; height: 100px;
          border-radius: 50%;
          object-fit: cover;
          box-shadow: 0 10px 30px rgba(245,158,11,0.4);
          margin-bottom: 16px;
        }
        .brand-name {
          font-size: 23px; font-weight: 800; line-height: 1.15;
          color: #fff; letter-spacing: 0.5px;
        }
        .brand-sub {
          margin-top: 8px;
          font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
          color: #64748b; text-transform: uppercase;
        }
        .feature-tags {
          display: flex; flex-wrap: wrap; gap: 8px;
          margin-top: 22px;
        }
        .feature-tag {
          padding: 5px 13px;
          font-size: 12px; color: #cbd5e1;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 999px;
        }
        .contact-block { margin-top: auto; padding-top: 26px; display: flex; flex-direction: column; gap: 12px; }
        .contact-row { display: flex; align-items: center; gap: 14px; }
        .contact-icon {
          width: 40px; height: 40px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.05);
          border-radius: 10px; color: ${AMBER}; font-size: 18px;
        }
        .contact-main { color: #e2e8f0; font-size: 13px; font-weight: 600; }
        .contact-sub { color: #94a3b8; font-size: 11px; margin-top: 2px; }
        /* 右侧 */
        .login-right {
          flex: 1;
          background: #ffffff;
          padding: 40px 44px;
          display: flex; flex-direction: column; justify-content: center;
        }
        .accent-bar { width: 40px; height: 4px; border-radius: 3px; background: ${AMBER}; margin-bottom: 16px; }
        .portal-title { font-size: 23px; font-weight: 800; color: #0f172a; margin: 0; }
        .portal-sub { font-size: 13px; color: #64748b; margin: 5px 0 22px; }
        .field-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; color: #334155; }
        .field-label-zh { color: #94a3b8; font-weight: 500; letter-spacing: 0; }
        .login-form .ant-input-affix-wrapper {
          border-radius: 10px; padding: 10px 13px; border-color: #e2e8f0;
        }
        .login-form .ant-input-affix-wrapper:hover,
        .login-form .ant-input-affix-wrapper-focused {
          border-color: ${AMBER}; box-shadow: 0 0 0 3px ${AMBER}22;
        }
        .login-form .ant-form-item { margin-bottom: 16px; }
        .signin-btn {
          height: 46px; border-radius: 12px; margin-top: 6px;
          background: ${AMBER}; border: none;
          font-size: 15px; font-weight: 700; color: #fff;
          box-shadow: 0 8px 22px ${AMBER}55;
          transition: all 0.2s ease;
        }
        .signin-btn:hover {
          background: ${AMBER_DARK} !important; color: #fff !important;
          transform: translateY(-1px); box-shadow: 0 10px 28px ${AMBER}66;
        }
        .right-footer {
          display: flex; align-items: center; justify-content: space-between;
          margin-top: 16px; font-size: 13px;
        }
        .register-link { color: ${AMBER}; font-weight: 700; margin-left: 4px; text-decoration: none; }
        .register-link:hover { color: ${AMBER_DARK}; }
        .lang-switch { display: inline-flex; gap: 4px; }
        .lang-switch button {
          border: none; background: transparent; cursor: pointer;
          font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 8px;
        }
        .lang-on { background: ${AMBER}; color: #fff; }
        .lang-off { color: #94a3b8; }
        .version { text-align: center; color: #cbd5e1; font-size: 12px; margin-top: 14px; font-weight: 600; }
        /* 响应式：窄屏堆叠，隐藏左侧品牌大区块 */
        @media (max-width: 760px) {
          .login-card { flex-direction: column; max-width: 440px; min-height: 0; }
          .login-left { padding: 36px 32px 24px; align-items: center; text-align: center; }
          .brand-name { font-size: 24px; }
          .feature-tags { justify-content: center; }
          .contact-block { margin-top: 28px; align-items: center; }
          .login-right { padding: 36px 32px; }
        }
      `}</style>
    </div>
  );
}
