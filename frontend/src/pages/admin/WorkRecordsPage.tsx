import React, { useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Form, InputNumber,
  message, Typography, Tooltip, Image, Input, Popconfirm, Descriptions,
} from 'antd';
import {
  ClockCircleOutlined, EditOutlined, PlusOutlined,
  EyeOutlined, DeleteOutlined, PictureOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { workRecordsApi, adjustmentsApi } from '../../api';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { TextArea } = Input;

function minutesToHM(min: number) {
  if (!min) return '0h 0m';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${m}m`;
}

export default function WorkRecordsPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [adjustForm] = Form.useForm();
  const [finalForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    const list: any = await workRecordsApi.list();
    setRecords(list || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleAdjust = async (values: any) => {
    await adjustmentsApi.add({
      workRecordId: selected.id,
      driverId: selected.driverId,
      taskId: selected.taskId,
      addedMinutes: values.addedMinutes,
      reason: values.reason,
    });
    message.success('工时调整成功');
    setAdjustOpen(false);
    adjustForm.resetFields();
    loadData();
  };

  const handleSetFinal = async (values: any) => {
    await adjustmentsApi.setFinal({ workRecordId: selected.id, finalMinutes: values.finalMinutes });
    message.success('最终工时已设置');
    setFinalOpen(false);
    finalForm.resetFields();
    loadData();
  };

  const loadLogs = async (record: any) => {
    setSelected(record);
    const data: any = await adjustmentsApi.logs({ taskId: record.taskId });
    setLogs(data || []);
    setLogsOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await workRecordsApi.delete(id);
      message.success('记录已删除');
      loadData();
    } catch {
      message.error('删除失败');
    }
  };

  const openDetail = (record: any) => {
    setSelected(record);
    setDetailOpen(true);
  };

  const columns = [
    {
      title: '司机', key: 'driver',
      render: (_: any, r: any) => r.driver?.fullName || r.driver?.username || '-',
    },
    {
      title: '任务', key: 'task',
      render: (_: any, r: any) => r.task?.title || '-',
    },
    {
      title: '开始时间', dataIndex: 'startTime', key: 'startTime',
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: '结束时间', dataIndex: 'endTime', key: 'endTime',
      render: (v: string) => v ? dayjs(v).format('MM-DD HH:mm') : '-',
    },
    {
      title: t('system_duration'), dataIndex: 'systemDuration', key: 'systemDuration',
      render: (v: number) => <Tag color="blue">{minutesToHM(v)}</Tag>,
    },
    {
      title: t('final_duration'), dataIndex: 'finalDuration', key: 'finalDuration',
      render: (v: number) => <Tag color="green" style={{ fontWeight: 700 }}>{minutesToHM(v)}</Tag>,
    },
    {
      title: '照片', key: 'photos',
      render: (_: any, r: any) => {
        const count = r.imageUrls?.length || 0;
        return count > 0
          ? <Tag color="purple" icon={<PictureOutlined />}>{count} 张</Tag>
          : <Text type="secondary" style={{ fontSize: 12 }}>无</Text>;
      },
    },
    {
      title: '异常', dataIndex: 'anomalyFlag', key: 'anomalyFlag',
      render: (v: boolean) => v ? <Tag color="red">有异常</Tag> : <Tag color="green">正常</Tag>,
    },
    {
      title: t('operation'), key: 'actions',
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            size="small" icon={<EyeOutlined />}
            onClick={() => openDetail(record)}
          >
            详情
          </Button>
          <Tooltip title="+30分钟 / +1小时">
            <Button size="small" icon={<PlusOutlined />} onClick={() => { setSelected(record); setAdjustOpen(true); }}>
              调整
            </Button>
          </Tooltip>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setSelected(record); finalForm.setFieldsValue({ finalMinutes: record.finalDuration }); setFinalOpen(true); }}>
            覆盖
          </Button>
          <Button size="small" type="link" onClick={() => loadLogs(record)}>日志</Button>
          <Popconfirm
            title="确定删除此工时记录？"
            description="删除后无法恢复"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>{t('work_records')}</Title>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table columns={columns} dataSource={records} rowKey="id" loading={loading} pagination={{ pageSize: 15 }} scroll={{ x: 1100 }} />
      </Card>

      {/* 详情弹窗 */}
      <Modal
        title="工时记录详情"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        width={680}
        destroyOnClose
      >
        {selected && (
          <>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 20 }}>
              <Descriptions.Item label="司机" span={1}>
                {selected.driver?.fullName || selected.driver?.username || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="任务" span={1}>
                {selected.task?.title || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="路线" span={2}>
                {selected.task?.startLocation && selected.task?.endLocation
                  ? `${selected.task.startLocation} → ${selected.task.endLocation}`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {selected.startTime ? dayjs(selected.startTime).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="结束时间">
                {selected.endTime ? dayjs(selected.endTime).format('YYYY-MM-DD HH:mm') : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="系统工时">
                <Tag color="blue">{minutesToHM(selected.systemDuration)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="最终工时">
                <Tag color="green" style={{ fontWeight: 700 }}>{minutesToHM(selected.finalDuration)}</Tag>
              </Descriptions.Item>
              {selected.adjustmentTime > 0 && (
                <Descriptions.Item label="调整时间" span={2}>
                  <Tag color="orange">+{minutesToHM(selected.adjustmentTime)}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="异常" span={2}>
                {selected.anomalyFlag ? <Tag color="red">有异常</Tag> : <Tag color="green">正常</Tag>}
              </Descriptions.Item>
              {selected.completionNotes && (
                <Descriptions.Item label="完成备注" span={2}>
                  {selected.completionNotes}
                </Descriptions.Item>
              )}
            </Descriptions>

            <div>
              <Text strong style={{ fontSize: 14 }}>
                <PictureOutlined style={{ marginRight: 6 }} />
                完成照片
                {selected.imageUrls?.length > 0 && (
                  <Tag color="purple" style={{ marginLeft: 8 }}>{selected.imageUrls.length} 张</Tag>
                )}
              </Text>
              {selected.imageUrls?.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <Image.PreviewGroup>
                    <Space wrap size={10}>
                      {selected.imageUrls.map((url: string, i: number) => (
                        <Image
                          key={i}
                          src={url}
                          width={150}
                          height={150}
                          style={{ objectFit: 'cover', borderRadius: 8, border: '1px solid #e8e8e8' }}
                          alt={`照片${i + 1}`}
                          placeholder={
                            <div style={{ width: 150, height: 150, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <PictureOutlined style={{ fontSize: 24, color: '#bbb' }} />
                            </div>
                          }
                        />
                      ))}
                    </Space>
                  </Image.PreviewGroup>
                </div>
              ) : (
                <div style={{ marginTop: 12, padding: '20px', background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
                  <PictureOutlined style={{ fontSize: 32, color: '#d9d9d9' }} />
                  <div style={{ color: '#999', marginTop: 8, fontSize: 13 }}>司机未上传照片</div>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* Adjust Modal */}
      <Modal title="调整工时" open={adjustOpen} onCancel={() => setAdjustOpen(false)} footer={null} destroyOnClose>
        <Form form={adjustForm} onFinish={handleAdjust} layout="vertical">
          <Form.Item name="addedMinutes" label="增加时间（分钟）" rules={[{ required: true }]}>
            <Space>
              <Button onClick={() => adjustForm.setFieldsValue({ addedMinutes: 30 })}>+30 分钟</Button>
              <Button onClick={() => adjustForm.setFieldsValue({ addedMinutes: 60 })}>+1 小时</Button>
            </Space>
            <InputNumber min={1} style={{ width: '100%', marginTop: 8 }} placeholder="或手动输入分钟数" />
          </Form.Item>
          <Form.Item name="reason" label="调整原因">
            <TextArea rows={2} />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAdjustOpen(false)}>{t('cancel')}</Button>
              <Button type="primary" htmlType="submit">确认调整</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Set Final Modal */}
      <Modal title="手动设置最终工时" open={finalOpen} onCancel={() => setFinalOpen(false)} footer={null} destroyOnClose>
        <Form form={finalForm} onFinish={handleSetFinal} layout="vertical">
          <Form.Item name="finalMinutes" label="最终工时（分钟）" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setFinalOpen(false)}>{t('cancel')}</Button>
              <Button type="primary" htmlType="submit">保存</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Logs Modal */}
      <Modal title="调整日志" open={logsOpen} onCancel={() => setLogsOpen(false)} footer={null} width={600}>
        <Table
          size="small"
          dataSource={logs}
          rowKey="id"
          columns={[
            { title: '调整量', dataIndex: 'addedMinutes', key: 'addedMinutes', render: (v: number) => `${v > 0 ? '+' : ''}${v} 分钟` },
            { title: '原因', dataIndex: 'reason', key: 'reason' },
            { title: '操作员', key: 'operator', render: (_: any, r: any) => r.operator?.fullName || r.operator?.username },
            { title: '时间', dataIndex: 'createdAt', key: 'createdAt', render: (v: string) => dayjs(v).format('MM-DD HH:mm') },
          ]}
        />
      </Modal>
    </div>
  );
}
