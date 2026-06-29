import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  EditOutlined,
  UserOutlined,
  MailOutlined,
  TeamOutlined,
  CarOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { RootState } from '../../store';
import { usersApi } from '../../api';

const { Title, Text } = Typography;
const { Option } = Select;

const compactModalStyles = {
  header: { padding: '14px 18px' },
  body: { padding: '14px 18px 18px' },
};
const compactFormItemStyle = { marginBottom: 10 };

const ROLE_COLOR: Record<string, string> = {
  admin: 'red',
  dispatcher: 'blue',
  driver: 'green',
  client: 'purple',
  monitor: 'gold',
};

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  dispatcher: '调度员',
  driver: '司机',
  client: '客户',
  monitor: '监控大屏',
};

function StatCard({ icon, color, value, label }: { icon: React.ReactNode; color: string; value: number; label: string }) {
  return (
    <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: 16 } }}>
      <Space size={14} align="center">
        <div style={{
          width: 46, height: 46, borderRadius: 12,
          background: `${color}1f`, color, fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1, color: '#0f172a' }}>{value}</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{label}</div>
        </div>
      </Space>
    </Card>
  );
}

// 操作按钮统一配色（清晰可读）
const BTN = {
  edit: { background: '#fff7ed', color: '#ea580c', borderColor: '#fed7aa' },
  reset: { background: '#eff6ff', color: '#2563eb', borderColor: '#bfdbfe' },
  del: { background: '#fef2f2', color: '#ef4444', borderColor: '#fecaca' },
  notify: { background: '#f8fafc', color: '#475569', borderColor: '#e2e8f0' },
};

const STATUS_COLOR: Record<string, string> = {
  pending: 'orange',
  active: 'green',
  rejected: 'red',
  disabled: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  active: '正常',
  rejected: '已拒绝',
  disabled: '已禁用',
};

export default function UsersPage() {
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const isAdmin = currentUser?.role === 'admin';

  const [users, setUsers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
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

  useEffect(() => {
    load();
  }, []);

  const [notifyTarget, setNotifyTarget] = useState<any>(null);
  const [notifyBody, setNotifyBody] = useState('');
  const [notifySubject, setNotifySubject] = useState('');

  // 审核通过邮件正文
  const buildApprovalBody = (u: any) =>
    `尊敬的 ${u.fullName || u.username}，您好！\n\n` +
    `您的账户已通过管理员审核，现已可以正常登录使用。\n` +
    `登录账号：${u.username}\n\n` +
    `请使用注册时的账号与密码登录系统。\n\n` +
    `——ECT 货运调度管理系统`;

  // 审核拒绝邮件正文
  const buildRejectBody = (u: any) =>
    `尊敬的 ${u.fullName || u.username}，您好！\n\n` +
    `很抱歉，您申请的账户（${u.username}）未通过管理员审核。\n` +
    `如有疑问，请联系管理员。\n\n` +
    `——ECT 货运调度管理系统`;

  // 审核通过：先通过，再弹出邮件让管理员手动发送通知
  const handleApprove = async (record: any) => {
    await usersApi.approve(record.id);
    message.success('用户已通过');
    load();
    if (record.email) {
      setNotifyTarget(record);
      setNotifySubject('账户审核通过通知 - ECT 货运调度管理系统');
      setNotifyBody(buildApprovalBody(record));
    }
  };

  // 审核拒绝：先拒绝，再弹出邮件让管理员手动发送通知
  const handleReject = async (record: any) => {
    await usersApi.reject(record.id);
    message.success('用户已拒绝');
    load();
    if (record.email) {
      setNotifyTarget(record);
      setNotifySubject('账户审核结果通知 - ECT 货运调度管理系统');
      setNotifyBody(buildRejectBody(record));
    }
  };

  // 打开本机邮箱客户端（mailto），由管理员在自己的邮箱里手动发送，无需服务器 SMTP
  const handleOpenMail = () => {
    if (!notifyTarget) return;
    const url = `mailto:${encodeURIComponent(notifyTarget.email)}?subject=${encodeURIComponent(notifySubject)}&body=${encodeURIComponent(notifyBody)}`;
    window.location.href = url;
    setNotifyTarget(null);
  };

  const openEdit = (record: any) => {
    setEditTarget(record);
    editForm.setFieldsValue({
      username: record.username,
      email: record.email,
      fullName: record.fullName,
      phone: record.phone,
      role: record.role,
      status: record.status,
    });
    setEditOpen(true);
  };

  const handleEdit = async (values: any) => {
    if (!editTarget) return;
    try {
      await usersApi.update(editTarget.id, values);
      message.success('账户已更新');
      setEditOpen(false);
      setEditTarget(null);
      editForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.message || e?.error || '更新失败');
    }
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
    try {
      await usersApi.create(values);
      message.success('账号已创建');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.message || e?.error || '创建失败');
    }
  };

  const columns = [
    {
      title: '用户名', dataIndex: 'username', key: 'username',
      render: (v: string) => <Text style={{ fontFamily: 'monospace', fontWeight: 600 }}>{v}</Text>,
    },
    {
      title: '姓名', key: 'name',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.fullName || record.username}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{record.email}</div>
        </div>
      ),
    },
    {
      title: '角色', dataIndex: 'role', key: 'role',
      render: (role: string) => <Tag color={ROLE_COLOR[role]}>{ROLE_LABEL[role]}</Tag>,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status',
      render: (status: string) => <Tag color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      align: 'right' as const,
      render: (_: any, record: any) => (
        <Space size={6}>
          {isAdmin && record.id !== currentUser?.id && (
            <Button size="small" icon={<EditOutlined />} style={BTN.edit} onClick={() => openEdit(record)}>
              编辑
            </Button>
          )}
          {isAdmin && record.id !== currentUser?.id && (
            <Button
              size="small"
              icon={<KeyOutlined />}
              style={BTN.reset}
              onClick={() => { setResetTargetId(record.id); setResetOpen(true); }}
            >
              重置密码
            </Button>
          )}
          {isAdmin && record.id !== currentUser?.id && (
            <Popconfirm
              title="确定删除该账号？"
              description="此操作不可撤销。"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" icon={<DeleteOutlined />} style={BTN.del}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const pendingColumns = [
    {
      title: '用户',
      key: 'user',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.fullName || record.username}</div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>{record.email}</div>
        </div>
      ),
    },
    {
      title: '申请角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => <Tag color={ROLE_COLOR[role]}>{ROLE_LABEL[role]}</Tag>,
    },
    {
      title: '申请时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => dayjs(value).format('MM-DD HH:mm'),
    },
    {
      title: '审核',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="primary" size="small" icon={<CheckOutlined />} onClick={() => handleApprove(record)}>
            通过
          </Button>
          <Button danger size="small" icon={<CloseOutlined />} onClick={() => handleReject(record)}>
            拒绝
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>
            用户管理
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {isAdmin ? '管理员可创建、编辑、删除及重置账号。' : '调度员可审核待处理账号。'}
          </Text>
        </div>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            创建账号
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard icon={<TeamOutlined />} color="#3b82f6" value={users.length} label="账户总数" />
        <StatCard icon={<CarOutlined />} color="#22c55e" value={users.filter((u) => u.role === 'driver').length} label="司机" />
        <StatCard icon={<SafetyCertificateOutlined />} color="#F59E0B" value={users.filter((u) => u.role === 'admin').length} label="管理员" />
      </div>

      <Card bordered={false} styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Tabs
          style={{ padding: '0 16px' }}
          items={[
            {
              key: 'all',
              label: (
                <span>
                  全部用户 <Badge count={users.length} color="blue" />
                </span>
              ),
              children: (
                <Table
                  columns={columns}
                  dataSource={users}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 15 }}
                  size="middle"
                />
              ),
            },
            {
              key: 'pending',
              label: (
                <span>
                  待审核 <Badge count={pending.length} />
                </span>
              ),
              children: (
                <Table
                  columns={pendingColumns}
                  dataSource={pending}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 15 }}
                  size="middle"
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="编辑账户"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false);
          setEditTarget(null);
          editForm.resetFields();
        }}
        footer={null}
        destroyOnClose
        centered
        width={400}
        styles={compactModalStyles}
      >
        <Form form={editForm} onFinish={handleEdit} layout="vertical" size="small" style={{ paddingTop: 0 }}>
          <Form.Item name="username" label="用户名" style={compactFormItemStyle} rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="email" label="邮箱" style={compactFormItemStyle} rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="fullName" label="姓名" style={compactFormItemStyle}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话" style={compactFormItemStyle}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" style={compactFormItemStyle} rules={[{ required: true, message: '请选择角色' }]}>
            <Select>
              <Option value="admin">管理员</Option>
              <Option value="dispatcher">调度员</Option>
              <Option value="driver">司机</Option>
              <Option value="client">客户</Option>
              <Option value="monitor">监控大屏</Option>
            </Select>
          </Form.Item>
          <Form.Item name="status" label="状态" style={compactFormItemStyle} rules={[{ required: true, message: '请选择状态' }]}>
            <Select>
              <Option value="active">正常</Option>
              <Option value="pending">待审核</Option>
              <Option value="rejected">已拒绝</Option>
              <Option value="disabled">已禁用</Option>
            </Select>
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => {
                  setEditOpen(false);
                  setEditTarget(null);
                  editForm.resetFields();
                }}
              >
                取消
              </Button>
              <Button size="small" type="primary" htmlType="submit">
                保存
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal
        title="重置密码"
        open={resetOpen}
        onCancel={() => {
          setResetOpen(false);
          resetForm.resetFields();
          setResetTargetId(null);
        }}
        footer={null}
        destroyOnClose
        centered
        width={380}
        styles={compactModalStyles}
      >
        <Form form={resetForm} onFinish={handleResetPassword} layout="vertical" size="small" style={{ paddingTop: 0 }}>
          <Form.Item
            name="newPassword"
            label="新密码"
            style={compactFormItemStyle}
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password placeholder="至少 6 位" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['newPassword']}
            style={compactFormItemStyle}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="再次输入新密码" />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <Space size={8}>
              <Button
                size="small"
                onClick={() => {
                  setResetOpen(false);
                  resetForm.resetFields();
                  setResetTargetId(null);
                }}
              >
                取消
              </Button>
              <Button size="small" type="primary" htmlType="submit">
                重置
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal
        title="发送审核结果通知邮件"
        open={!!notifyTarget}
        onCancel={() => setNotifyTarget(null)}
        onOk={handleOpenMail}
        okText="打开邮箱发送"
        cancelText="取消"
        okButtonProps={{ icon: <MailOutlined /> }}
        centered
        width={480}
        destroyOnClose
        styles={compactModalStyles}
      >
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}><Text type="secondary">收件人：</Text>{notifyTarget?.fullName || notifyTarget?.username}</div>
          <div><Text type="secondary">邮箱：</Text><Text strong>{notifyTarget?.email}</Text></div>
        </div>
        <Text type="secondary" style={{ fontSize: 13 }}>邮件正文（可编辑）：</Text>
        <Input.TextArea
          rows={7}
          style={{ marginTop: 6 }}
          value={notifyBody}
          onChange={(e) => setNotifyBody(e.target.value)}
        />
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          点击「打开邮箱发送」会用你电脑的邮箱客户端新建一封已填好的邮件，由你手动点击发送。无需配置服务器 SMTP。
        </Text>
      </Modal>

      <Modal title="创建账号" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose centered width={400} styles={compactModalStyles}>
        <Form form={form} onFinish={handleCreate} layout="vertical" size="small" style={{ paddingTop: 0 }}>
          <Form.Item name="username" label="用户名" style={compactFormItemStyle} rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="fullName" label="姓名" style={compactFormItemStyle} rules={[{ required: true, message: '请输入姓名' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" style={compactFormItemStyle} rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="电话" style={compactFormItemStyle}>
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色" style={compactFormItemStyle} rules={[{ required: true, message: '请选择角色' }]}>
            <Select placeholder="请选择角色">
              <Option value="admin">管理员</Option>
              <Option value="dispatcher">调度员</Option>
              <Option value="driver">司机</Option>
              <Option value="client">客户</Option>
              <Option value="monitor">监控大屏</Option>
            </Select>
          </Form.Item>
          <Form.Item name="password" label="密码" style={compactFormItemStyle} rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少 6 位' }]}>
            <Input.Password />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <Space size={8}>
              <Button size="small" onClick={() => setCreateOpen(false)}>取消</Button>
              <Button size="small" type="primary" htmlType="submit">
                创建
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
