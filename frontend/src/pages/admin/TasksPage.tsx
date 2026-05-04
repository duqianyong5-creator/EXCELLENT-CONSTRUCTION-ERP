import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Form, Input, Select,
  message, Popconfirm, Typography, DatePicker, InputNumber, Tooltip, Empty,
  Descriptions, Image,
} from 'antd';
import {
  PlusOutlined, EnvironmentOutlined, CarOutlined, UserOutlined,
  EyeOutlined, DeleteOutlined, MailOutlined, PictureOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { tasksApi, usersApi, workRecordsApi } from '../../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const STATUS_COLOR: Record<string, string> = {
  pending: 'default', assigned: 'blue', in_progress: 'orange',
  completed: 'green', cancelled: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '待分配', assigned: '待出发', in_progress: '运送中',
  completed: '已完成', cancelled: '已取消',
};

function minutesToHM(min: number) {
  if (!min) return '0h 0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export default function TasksPage() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [workRecord, setWorkRecord] = useState<any>(null);
  const [emailLoading, setEmailLoading] = useState(false);
  const [form] = Form.useForm();
  const [assignForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [taskList, driverList, clientList]: any = await Promise.all([
        tasksApi.list(), usersApi.drivers(), usersApi.clients(),
      ]);
      setTasks(taskList || []);
      setDrivers(driverList || []);
      setClients(clientList || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c: any) => c.id === clientId);
    if (client) {
      const name = client.fullName || client.username;
      form.setFieldValue('title', `${name}的运输任务`);
    }
  };

  const handleCreate = async (values: any) => {
    try {
      await tasksApi.create({ ...values, scheduledAt: values.scheduledAt?.toISOString() });
      message.success('任务已创建');
      setCreateOpen(false);
      form.resetFields();
      loadData();
    } catch (e: any) {
      message.error(e?.message || '创建失败，请检查填写内容');
    }
  };

  const handleAssign = async (values: any) => {
    try {
      await tasksApi.assign(selectedTask.id, values.driverId);
      message.success('司机已分配');
      setAssignOpen(false);
      assignForm.resetFields();
      loadData();
    } catch (e: any) {
      message.error(e?.message || '分配失败');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await tasksApi.cancel(id);
      message.success('任务已取消');
      loadData();
    } catch (e: any) {
      message.error(e?.message || '取消失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tasksApi.delete(id);
      message.success('任务已删除');
      loadData();
    } catch {
      message.error('删除失败');
    }
  };

  const openDetail = async (task: any) => {
    setSelectedTask(task);
    setWorkRecord(null);
    setDetailOpen(true);
    if (task.status === 'completed') {
      try {
        const wr: any = await workRecordsApi.byTask(task.id);
        setWorkRecord(wr);
      } catch {
        // no work record yet
      }
    }
  };

  const handleSendEmail = async () => {
    if (!selectedTask) return;
    setEmailLoading(true);
    try {
      const res: any = await tasksApi.sendEmail(selectedTask.id);
      if (res?.success) {
        message.success(res.message || '邮件已发送');
      } else {
        message.warning(res?.message || '发送失败');
      }
    } catch (err: any) {
      message.error(err?.message || '发送邮件失败');
    } finally {
      setEmailLoading(false);
    }
  };

  const columns = [
    {
      title: '任务名称', dataIndex: 'title', key: 'title', width: 160,
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{v}</Text>,
    },
    {
      title: '路线', key: 'route', width: 220,
      render: (_: any, r: any) => (
        <Tooltip title={`${r.startLocation} → ${r.endLocation}`}>
          <div style={{ fontSize: 12 }}>
            <div><EnvironmentOutlined style={{ color: '#52c41a', marginRight: 4 }} />{r.startLocation}</div>
            <div style={{ color: '#bbb', margin: '2px 0 2px 4px' }}>↓</div>
            <div><EnvironmentOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />{r.endLocation}</div>
          </div>
        </Tooltip>
      ),
    },
    {
      title: '客户', key: 'client', width: 110,
      render: (_: any, r: any) => (
        <Space size={4}>
          <UserOutlined style={{ color: '#722ed1' }} />
          <span>{r.client?.fullName || r.client?.username || '-'}</span>
        </Space>
      ),
    },
    {
      title: '司机', key: 'driver', width: 110,
      render: (_: any, r: any) => r.driver ? (
        <Space size={4}>
          <CarOutlined style={{ color: '#1677ff' }} />
          <span>{r.driver.fullName || r.driver.username}</span>
        </Space>
      ) : <Tag>未分配</Tag>,
    },
    { title: '货物', dataIndex: 'cargo', key: 'cargo', width: 100, render: (v: string) => v || '-' },
    {
      title: '计划时间', dataIndex: 'scheduledAt', key: 'scheduledAt', width: 100,
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (s: string) => <Tag color={STATUS_COLOR[s]}>{STATUS_LABEL[s]}</Tag>,
    },
    {
      title: '操作', key: 'actions', fixed: 'right' as const, width: 220,
      render: (_: any, record: any) => (
        <Space size={4} wrap>
          <Button
            size="small" icon={<EyeOutlined />}
            onClick={() => openDetail(record)}
          >
            详情
          </Button>
          {record.status === 'pending' && (
            <Button
              size="small" type="primary" icon={<CarOutlined />}
              onClick={() => { setSelectedTask(record); setAssignOpen(true); }}
            >
              分配
            </Button>
          )}
          {['pending', 'assigned'].includes(record.status) && (
            <Popconfirm title="确定取消此任务？" onConfirm={() => handleCancel(record.id)}>
              <Button size="small" danger>取消</Button>
            </Popconfirm>
          )}
          {['completed', 'cancelled'].includes(record.status) && (
            <Popconfirm
              title="确定删除此任务？"
              description="删除后无法恢复，相关工时记录也会保留"
              onConfirm={() => handleDelete(record.id)}
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>任务管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>选择客户后任务名称自动填写</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建任务</Button>
      </div>

      <Card bordered={false} styles={{ body: { padding: 0 } }} style={{ borderRadius: 12, overflow: 'hidden' }}>
        <Table
          columns={columns} dataSource={tasks} rowKey="id"
          loading={loading} pagination={{ pageSize: 15 }}
          scroll={{ x: 1100 }} size="middle"
          locale={{ emptyText: <Empty description="暂无任务" /> }}
        />
      </Card>

      {/* 任务详情弹窗 */}
      <Modal
        title="任务详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={700}
        footer={
          <Space>
            <Button onClick={() => setDetailOpen(false)}>关闭</Button>
            {selectedTask?.status === 'completed' && (
              <Button
                type="primary"
                icon={<MailOutlined />}
                loading={emailLoading}
                onClick={handleSendEmail}
              >
                发送邮件给客户
              </Button>
            )}
          </Space>
        }
        destroyOnClose
      >
        {selectedTask && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="任务名称" span={2}>
                <Text strong>{selectedTask.title}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="客户">
                <Space size={4}>
                  <UserOutlined style={{ color: '#722ed1' }} />
                  {selectedTask.client?.fullName || selectedTask.client?.username || '-'}
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="客户邮箱">
                {selectedTask.client?.email
                  ? <Text copyable>{selectedTask.client.email}</Text>
                  : <Text type="secondary">未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="司机">
                {selectedTask.driver
                  ? <Space size={4}><CarOutlined style={{ color: '#1677ff' }} />{selectedTask.driver.fullName || selectedTask.driver.username}</Space>
                  : <Tag>未分配</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={STATUS_COLOR[selectedTask.status]}>{STATUS_LABEL[selectedTask.status]}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="起点" span={2}>
                <EnvironmentOutlined style={{ color: '#52c41a', marginRight: 4 }} />
                {selectedTask.startLocation}
              </Descriptions.Item>
              <Descriptions.Item label="终点" span={2}>
                <EnvironmentOutlined style={{ color: '#ff4d4f', marginRight: 4 }} />
                {selectedTask.endLocation}
              </Descriptions.Item>
              {selectedTask.cargo && (
                <Descriptions.Item label="货物">{selectedTask.cargo}</Descriptions.Item>
              )}
              {selectedTask.cargoWeight && (
                <Descriptions.Item label="重量">{selectedTask.cargoWeight} 吨</Descriptions.Item>
              )}
              {selectedTask.scheduledAt && (
                <Descriptions.Item label="计划时间" span={2}>
                  {dayjs(selectedTask.scheduledAt).format('YYYY-MM-DD HH:mm')}
                </Descriptions.Item>
              )}
              {selectedTask.notes && (
                <Descriptions.Item label="备注" span={2}>{selectedTask.notes}</Descriptions.Item>
              )}
            </Descriptions>

            {/* 工时记录 + 照片（已完成任务） */}
            {selectedTask.status === 'completed' && (
              <div>
                <Text strong style={{ fontSize: 14 }}>工时 & 完成照片</Text>
                {workRecord ? (
                  <>
                    <Descriptions bordered column={2} size="small" style={{ marginTop: 12, marginBottom: 16 }}>
                      <Descriptions.Item label="开始时间">
                        {workRecord.startTime ? dayjs(workRecord.startTime).format('MM-DD HH:mm') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="完成时间">
                        {workRecord.endTime ? dayjs(workRecord.endTime).format('MM-DD HH:mm') : '-'}
                      </Descriptions.Item>
                      <Descriptions.Item label="实际工时">
                        <Tag color="green" style={{ fontWeight: 700 }}>{minutesToHM(workRecord.finalDuration)}</Tag>
                      </Descriptions.Item>
                      {workRecord.completionNotes && (
                        <Descriptions.Item label="完成备注" span={2}>
                          {workRecord.completionNotes}
                        </Descriptions.Item>
                      )}
                    </Descriptions>

                    <div>
                      <Text style={{ fontSize: 13 }}>
                        <PictureOutlined style={{ marginRight: 6 }} />
                        完成照片
                        {workRecord.imageUrls?.length > 0 && (
                          <Tag color="purple" style={{ marginLeft: 8 }}>{workRecord.imageUrls.length} 张</Tag>
                        )}
                      </Text>
                      {workRecord.imageUrls?.length > 0 ? (
                        <div style={{ marginTop: 10 }}>
                          <Image.PreviewGroup>
                            <Space wrap size={8}>
                              {workRecord.imageUrls.map((url: string, i: number) => (
                                <Image
                                  key={i}
                                  src={url}
                                  width={140}
                                  height={140}
                                  style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8' }}
                                  alt={`照片${i + 1}`}
                                  placeholder={
                                    <div style={{ width: 140, height: 140, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <PictureOutlined style={{ fontSize: 24, color: '#bbb' }} />
                                    </div>
                                  }
                                />
                              ))}
                            </Space>
                          </Image.PreviewGroup>
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, padding: '16px', background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
                          <PictureOutlined style={{ fontSize: 28, color: '#d9d9d9' }} />
                          <div style={{ color: '#999', marginTop: 6, fontSize: 13 }}>司机未上传照片</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ marginTop: 10, padding: '16px', background: '#fafafa', borderRadius: 8, textAlign: 'center', color: '#999' }}>
                    加载工时记录中...
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 创建任务 */}
      <Modal title="创建任务" open={createOpen} onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        footer={null} width={560} destroyOnClose>
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ paddingTop: 8 }}>

          <Form.Item name="clientId" label="客户" rules={[{ required: true, message: '请选择客户' }]}>
            <Select
              showSearch
              placeholder="输入姓名搜索客户"
              optionFilterProp="label"
              onChange={handleClientChange}
              notFoundContent={<Empty description="无客户账户，请先创建" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              options={clients.map((c: any) => ({
                value: c.id,
                label: c.fullName || c.username,
                name: c.fullName || c.username,
              }))}
              optionRender={(opt) => (
                <Space>
                  <UserOutlined style={{ color: '#722ed1' }} />
                  <span>{opt.data.label}</span>
                </Space>
              )}
            />
          </Form.Item>

          {/* 任务名称隐藏字段，由客户选择自动填写 */}
          <Form.Item name="title" hidden rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="driverId" label="司机" rules={[{ required: true, message: '请选择司机' }]}>
            <Select
              showSearch
              placeholder="输入姓名搜索司机"
              optionFilterProp="label"
              notFoundContent={<Empty description="无可用司机" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
              options={drivers.map((d: any) => ({
                value: d.id,
                label: d.fullName || d.username,
              }))}
              optionRender={(opt) => (
                <Space>
                  <CarOutlined style={{ color: '#1677ff' }} />
                  <span>{opt.data.label}</span>
                </Space>
              )}
            />
          </Form.Item>

          <Form.Item name="startLocation" label="起点地址" rules={[{ required: true }]}>
            <Input placeholder="如：广州白云区仓库" prefix={<EnvironmentOutlined style={{ color: '#52c41a' }} />} />
          </Form.Item>
          <Form.Item name="endLocation" label="终点地址" rules={[{ required: true }]}>
            <Input placeholder="如：深圳罗湖区客户仓" prefix={<EnvironmentOutlined style={{ color: '#ff4d4f' }} />} />
          </Form.Item>

          <Space style={{ width: '100%' }}>
            <Form.Item name="cargo" label="货物描述" style={{ flex: 1, marginBottom: 12 }}>
              <Input placeholder="货物类型" />
            </Form.Item>
            <Form.Item name="cargoWeight" label="重量（吨）" style={{ width: 130, marginBottom: 12 }}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          <Form.Item name="scheduledAt" label="计划执行时间">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={2} />
          </Form.Item>

          <div style={{ textAlign: 'right', paddingTop: 4 }}>
            <Space>
              <Button onClick={() => { setCreateOpen(false); form.resetFields(); }}>取消</Button>
              <Button type="primary" htmlType="submit">创建任务</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* 分配司机 */}
      <Modal title="分配司机" open={assignOpen} onCancel={() => setAssignOpen(false)} footer={null} destroyOnClose width={400}>
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f5f5f5', borderRadius: 8 }}>
          <Text type="secondary">任务：</Text>
          <Text strong>{selectedTask?.title}</Text>
        </div>
        <Form form={assignForm} onFinish={handleAssign} layout="vertical">
          <Form.Item name="driverId" label="选择司机" rules={[{ required: true, message: '请选择司机' }]}>
            <Select
              showSearch
              placeholder="输入姓名搜索"
              optionFilterProp="label"
              options={drivers.map((d: any) => ({
                value: d.id,
                label: d.fullName || d.username,
              }))}
              optionRender={(opt) => (
                <Space>
                  <CarOutlined style={{ color: '#1677ff' }} />
                  <span>{opt.data.label}</span>
                </Space>
              )}
            />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAssignOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit">确认分配</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
