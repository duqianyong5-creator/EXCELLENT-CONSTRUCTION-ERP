import React, { useState } from 'react';
import { Form, Input, Button, Select, message, Result } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { authApi } from '../../api';

const { Option } = Select;
const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';

const bgStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  position: 'relative',
  background:
    'radial-gradient(circle at 6% 94%, rgba(245,158,11,0.16), transparent 42%), ' +
    'linear-gradient(135deg, #0d1424 0%, #131c30 50%, #0b1220 100%)',
  backgroundColor: '#0b1220',
};

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFinish = async (values: any) => {
    try {
      setLoading(true);
      await authApi.register(values);
      setSuccess(true);
    } catch (err: any) {
      message.error(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={bgStyle}>
        <div className="reg-card" style={{ textAlign: 'center' }}>
          <Result
            status="success"
            title="注册申请已提交"
            subTitle="管理员审核通过后，您将可以登录系统。请耐心等待。"
            extra={
              <Link to="/login">
                <Button className="reg-submit" style={{ width: 160 }}>返回登录</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div style={bgStyle}>
      <div className="reg-card">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img
            src="/log.png"
            alt="Excellent Construction Ltd"
            style={{
              width: 88, height: 88, borderRadius: '50%', objectFit: 'cover',
              boxShadow: '0 10px 28px rgba(245,158,11,0.4)', marginBottom: 14,
            }}
          />
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>申请注册</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>提交后等待管理员审核</div>
        </div>

        <Form onFinish={onFinish} size="large" layout="vertical" requiredMark={false} className="reg-form">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '用户名至少3位' }]}>
            <Input prefix={<UserOutlined style={{ color: '#9ca3af' }} />} placeholder="用户名（3位以上）" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '请输入有效邮箱' }]}>
            <Input prefix={<MailOutlined style={{ color: '#9ca3af' }} />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="fullName" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input prefix={<UserOutlined style={{ color: '#9ca3af' }} />} placeholder="姓名" />
          </Form.Item>
          <Form.Item name="phone">
            <Input prefix={<PhoneOutlined style={{ color: '#9ca3af' }} />} placeholder="电话（选填）" />
          </Form.Item>
          <Form.Item name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="注册身份">
              <Option value="driver">司机 Driver</Option>
              <Option value="client">客户 Client</Option>
            </Select>
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 8, message: '密码至少8位' }]}>
            <Input.Password prefix={<LockOutlined style={{ color: '#9ca3af' }} />} placeholder="密码（8位以上）" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block className="reg-submit">
            提交申请
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
          <span style={{ color: '#94a3b8' }}>已有账户？</span>
          <Link to="/login" className="reg-link">返回登录</Link>
        </div>
      </div>

      <style>{`
        .reg-card {
          position: relative; z-index: 1;
          width: 100%; max-width: 440px;
          background: #ffffff;
          border-radius: 18px;
          padding: 40px 36px;
          box-shadow: 0 30px 80px rgba(0,0,0,0.5);
        }
        .reg-form .ant-input-affix-wrapper,
        .reg-form .ant-select-selector {
          border-radius: 10px !important;
          border-color: #e2e8f0 !important;
        }
        .reg-form .ant-input-affix-wrapper { padding: 10px 14px; }
        .reg-form .ant-input-affix-wrapper:hover,
        .reg-form .ant-input-affix-wrapper-focused,
        .reg-form .ant-select-focused .ant-select-selector,
        .reg-form .ant-select-selector:hover {
          border-color: ${AMBER} !important;
          box-shadow: 0 0 0 3px ${AMBER}22 !important;
        }
        .reg-form .ant-form-item { margin-bottom: 16px; }
        .reg-submit {
          height: 48px; border-radius: 12px; margin-top: 6px;
          background: ${AMBER} !important; border: none !important;
          font-size: 15px; font-weight: 700; color: #fff !important;
          box-shadow: 0 8px 22px ${AMBER}55;
          transition: all 0.2s ease;
        }
        .reg-submit:hover {
          background: ${AMBER_DARK} !important;
          transform: translateY(-1px); box-shadow: 0 10px 28px ${AMBER}66;
        }
        .reg-link { color: ${AMBER}; font-weight: 700; margin-left: 4px; text-decoration: none; }
        .reg-link:hover { color: ${AMBER_DARK}; }
      `}</style>
    </div>
  );
}
