import React, { useState } from 'react';
import { Form, Input, Button, Card, Select, Typography, message, Result } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, TruckOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

export default function RegisterPage() {
  const { t } = useTranslation();
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
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1677ff 0%, #0050b3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Card style={{ borderRadius: 16, maxWidth: 480 }} bodyStyle={{ padding: '48px' }}>
          <Result
            status="success"
            title="注册申请已提交"
            subTitle="管理员审核通过后，您将可以登录系统。请耐心等待。"
            extra={<Link to="/login"><Button type="primary">返回登录</Button></Link>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #1677ff 0%, #0050b3 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <Card style={{ width: '100%', maxWidth: 440, borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} bodyStyle={{ padding: '40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #1677ff, #0050b3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <TruckOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={3} style={{ margin: 0 }}>申请注册</Title>
          <Text type="secondary">提交后等待管理员审核</Text>
        </div>

        <Form onFinish={onFinish} size="large" layout="vertical">
          <Form.Item name="username" rules={[{ required: true }, { min: 3, message: '用户名至少3位' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名（3位以上）" />
          </Form.Item>
          <Form.Item name="email" rules={[{ required: true }, { type: 'email', message: '请输入有效邮箱' }]}>
            <Input prefix={<MailOutlined />} placeholder="邮箱" />
          </Form.Item>
          <Form.Item name="fullName">
            <Input placeholder="姓名（选填）" />
          </Form.Item>
          <Form.Item name="phone">
            <Input placeholder="电话（选填）" />
          </Form.Item>
          <Form.Item name="role" rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="注册身份">
              <Option value="driver">司机 Driver</Option>
              <Option value="client">客户 Client</Option>
            </Select>
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true }, { min: 8, message: '密码至少8位' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码（8位以上）" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 46, borderRadius: 8 }}>
            提交申请
          </Button>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Text type="secondary">已有账户？ </Text>
          <Link to="/login">返回登录</Link>
        </div>
      </Card>
    </div>
  );
}
