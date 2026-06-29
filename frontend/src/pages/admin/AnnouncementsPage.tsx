import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Typography, Form,
  Input, Select, Popconfirm, Switch, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, NotificationOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { announcementsApi } from '../../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

const TARGET_LABEL: Record<string, { text: string; color: string }> = {
  all: { text: '全部', color: 'blue' },
  client: { text: '客户', color: 'green' },
  driver: { text: '司机', color: 'orange' },
};

export default function AnnouncementsPage() {
  const { t } = useTranslation();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const data: any = await announcementsApi.list();
      setList(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await announcementsApi.create(values);
      message.success('公告已发布');
      setOpen(false);
      form.resetFields();
      load();
    } catch {
      message.error('发布失败');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (record: any, active: boolean) => {
    try {
      await announcementsApi.setActive(record.id, active);
      message.success(active ? '已启用' : '已停用');
      load();
    } catch {
      message.error('操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await announcementsApi.delete(id);
      message.success('已删除');
      load();
    } catch {
      message.error('删除失败');
    }
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', render: (v: string) => <Text strong>{v}</Text> },
    { title: '内容', dataIndex: 'content', key: 'content', ellipsis: true,
      render: (v: string) => <Text type="secondary">{v}</Text> },
    {
      title: '发送对象', dataIndex: 'targetRole', key: 'targetRole', width: 110,
      render: (v: string) => {
        const m = TARGET_LABEL[v] || TARGET_LABEL.all;
        return <Tag color={m.color}>{m.text}</Tag>;
      },
    },
    {
      title: '状态', dataIndex: 'active', key: 'active', width: 100,
      render: (v: boolean, r: any) => (
        <Switch checked={v} size="small" onChange={(checked) => toggleActive(r, checked)} />
      ),
    },
    { title: '发布时间', dataIndex: 'createdAt', key: 'createdAt', width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm') },
    {
      title: '操作', key: 'actions', width: 90,
      render: (_: any, r: any) => (
        <Popconfirm title="确定删除此公告？" onConfirm={() => handleDelete(r.id)} okText="删除" okButtonProps={{ danger: true }} cancelText="取消">
          <Button size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <NotificationOutlined style={{ marginRight: 8, color: '#F59E0B' }} />
          公告管理
        </Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>发布公告</Button>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table columns={columns} dataSource={list} rowKey="id" loading={loading} pagination={{ pageSize: 12 }} />
      </Card>

      <Modal
        title="发布公告"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={handleCreate}
        confirmLoading={submitting}
        okText="发布"
        cancelText="取消"
        centered
        width={460}
        destroyOnClose
      >
        <Form form={form} layout="vertical" initialValues={{ targetRole: 'all' }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
            <Input placeholder="公告标题" maxLength={100} />
          </Form.Item>
          <Form.Item name="content" label="内容" rules={[{ required: true, message: '请输入内容' }]}>
            <TextArea rows={4} placeholder="公告内容" maxLength={1000} showCount />
          </Form.Item>
          <Form.Item name="targetRole" label="发送对象" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'all', label: '全部（客户 + 司机）' },
                { value: 'client', label: '客户' },
                { value: 'driver', label: '司机' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
