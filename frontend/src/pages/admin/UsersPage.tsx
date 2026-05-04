import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Form, Input, Select,
  message, Popconfirm, Typography, Tabs, Badge, Avatar,
} from 'antd';
import {
  PlusOutlined, UserOutlined, CheckOutlined, CloseOutlined,
  DeleteOutlined, StopOutlined, PlayCircleOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { usersApi } from '../../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const ROLE_COLOR: Record<string, string> = { admin: 'red', dispatcher: 'blue', driver: 'green', client: 'purple' };
const ROLE_LABEL: Record<string, string> = { admin: '管理员', dispatcher: '调度员', driver: '司机', client: '客户' };
const STATUS_COLOR: Record<string, string> = { pending: 'orange', active: 'green', rejected: 'red', disabled: 'default' };
const STATUS_LABEL: Record<string, string> = { pending: '待审核', active: '正常', rejected: '已拒绝', disabled: '已禁用' };

export default function UsersPage() {
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [all, pend]: any = await Promise.all([usersApi.list(), usersApi.pending()]);
      setUsers(all || []);
      setPending(pend || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    await usersApi.approve(id);
    message.success('已审批通过');
    load();
  };

  const handleReject = async (id: string) => {
    await usersApi.reject(id);
    message.success('已拒绝');
    load();
  };

  const handleDisable = async (id: string) => {
    await usersApi.disable(id);
    message.success('已禁用');
    load();
  };

  const handleEnable = async (id: string) => {
    await usersApi.enable(id);
    message.success('已启用');
    load();
  };

  const handleDelete = async (id: string) => {
    try {
      await usersApi.delete(id);
      message.success('用户已删除');
      load();
    } catch (e: any) {
      message.error(e?.message || e?.error || '删除失败');
    }
  };

  const handleResetPassword = async (values: any) => {
    if (!resetTargetId) return;
    try {
      await usersApi.resetPassword(resetTargetId, values.newPassword);
      message.success('密码已重置');
      setResetOpen(false);
      resetForm.resetFields();
      setResetTargetId(null);
    } catch (e: any) {
      message.error(e?.message || '重置失败');
    }
  };

  const handleCreate = async (values: any) => {
    await usersApi.create(values);
    message.success('用户创建成功');
    setCreateOpen(false);
    form.resetFields();
    load();
  };

  const columns = [
    {
      title: '用户', key: 'user', width: 180,
      render: (_: any, r: any) => (
        <Space>
          <Avatar style={{ backgroundColor: ROLE_COLOR[r.role] + '22', color: ROLE_COLOR[r.role], fontWeight: 700 }}>
            {(r.fullName || r.username || '?')[0].toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{r.fullName || r.username}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{r.email}</div>
          </div>
        </Space>
      ),
    },
    { title: '用户名', dataIndex: 'username', key: 'username', width: 110 },
    { title: '电话', dataIndex: 'phone', key: 'phone', width: 120, render: (v: string) => v || '-' },
    {
      title: '角色', dataIndex: 'role', key: 'role', width: 90,
      render: (r: string) => <Tag color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
    },
    {
      title: '注册时间', dataIndex: 'createdAt', key: 'createdAt', width: 120,
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '操作', key: 'actions', fixed: 'right' as const, width: isAdmin ? 260 : 140,
      render: (_: any, record: any) => (
        <Space size={4}>
          {record.status === 'active' && (
            <Popconfirm title="确定禁用此账户？" onConfirm={() => handleDisable(record.id)}>
              <Button size="small" icon={<StopOutlined />} danger>禁用</Button>
            </Popconfirm>
          )}
          {record.status === 'disabled' && (
            <Button size="small" icon={<PlayCircleOutlined />} type="primary" ghost onClick={() => handleEnable(record.id)}>启用</Button>
          )}
          {isAdmin && (
            <Button
              size="small" icon={<KeyOutlined />} type="text"
              onClick={() => { setResetTargetId(record.id); setResetOpen(true); }}
            >重置密码</Button>
          )}
          {isAdmin && record.id !== currentUser?.id && (
            <Popconfirm
              title="确定删除此账户？"
              description="删除后数据不可恢复"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" icon={<DeleteOutlined />} danger type="text">删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const pendingColumns = [
    {
      title: '用户', key: 'user',
      render: (_: any, r: any) => (
        <Space>
          <Avatar style={{ backgroundColor: '#f0f0f0', color: '#666' }}>
            {(r.fullName || r.username || '?')[0].toUpperCase()}
          </Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{r.fullName || r.username}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{r.email}</div>
          </div>
        </Space>
      ),
    },
    {
      title: '申请角色', dataIndex: 'role', key: 'role',
      render: (r: string) => <Tag color={ROLE_COLOR[r]}>{ROLE_LABEL[r]}</Tag>,
    },
    {
      title: '申请时间', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm'),
    },
    {
      title: '审核', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record.id)}>通过</Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReject(record.id)}>拒绝</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>用户管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {isAdmin ? '管理员可创建、禁用、删除账户' : '调度员可审核账户，不可删除'}
          </Text>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建账户</Button>
        )}
      </div>

      <Card bordered={false} styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Tabs
          style={{ padding: '0 16px' }}
          items={[
            {
              key: 'all',
              label: <span>全部用户 <Badge count={users.length} color="blue" /></span>,
              children: (
                <Table
                  columns={columns} dataSource={users} rowKey="id"
                  loading={loading} pagination={{ pageSize: 15 }}
                  scroll={{ x: 800 }} size="middle"
                />
              ),
            },
            {
              key: 'pending',
              label: <span>待审核 <Badge count={pending.length} /></span>,
              children: (
                <Table
                  columns={pendingColumns} dataSource={pending} rowKey="id"
                  loading={loading} pagination={{ pageSize: 15 }} size="middle"
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="重置用户密码" open={resetOpen}
        onCancel={() => { setResetOpen(false); resetForm.resetFields(); setResetTargetId(null); }}
        footer={null} destroyOnClose width={400}
      >
        <Form form={resetForm} onFinish={handleResetPassword} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item
            name="newPassword" label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码不能少于6位' }]}
          >
            <Input.Password placeholder="至少6位" />
          </Form.Item>
          <Form.Item
            name="confirm" label="确认密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Space>
              <Button onClick={() => { setResetOpen(false); resetForm.resetFields(); setResetTargetId(null); }}>取消</Button>
              <Button type="primary" htmlType="submit">确认重置</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal title="创建账户" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose width={480}>
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ paddingTop: 8 }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="fullName" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ required: true }, { type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select>
              <Option value="admin">管理员</Option>
              <Option value="dispatcher">调度员</Option>
              <Option value="driver">司机</Option>
              <Option value="client">客户</Option>
            </Select>
          </Form.Item>
          <Form.Item name="password" label="初始密码（留空默认 Temp@123456）">
            <Input.Password placeholder="Temp@123456" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Space>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">创建</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
