import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card, List, Tag, Button, Modal, Form, Input, Upload, message,
  Typography, Space, Divider, Statistic, Badge, Progress, Alert,
} from 'antd';
import {
  EnvironmentOutlined, ClockCircleOutlined, CarOutlined,
  CameraOutlined, CheckCircleOutlined, PlayCircleOutlined,
  WifiOutlined, DisconnectOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { tasksApi, gpsApi } from '../../api';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';

dayjs.extend(duration);

const { Title, Text } = Typography;
const { TextArea } = Input;

const statusColors: Record<string, string> = {
  pending: 'default', assigned: 'blue', in_progress: 'orange', completed: 'green', cancelled: 'red',
};
const statusLabels: Record<string, string> = {
  pending: '待分配', assigned: '待开始', in_progress: '进行中', completed: '已完成', cancelled: '已取消',
};

export default function DriverTasksPage() {
  const { t } = useTranslation();
  const { user } = useSelector((s: RootState) => s.auth);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTask, setActiveTask] = useState<any>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<'on' | 'off' | 'error'>('off');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const timerRef = useRef<any>(null);
  const gpsRef = useRef<any>(null);
  const startTimeRef = useRef<Date | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<any[]>([]);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    const data: any = await tasksApi.list();
    const list = (data || []).filter((t: any) => t.driverId === user?.id);
    setTasks(list);
    const inProgress = list.find((t: any) => t.status === 'in_progress');
    if (inProgress && !activeTask) setActiveTask(inProgress);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // GPS upload every 10s
  const startGps = useCallback((taskId: string) => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }

    const upload = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGpsStatus('on');
          setGpsCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          gpsApi.upload({
            taskId,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            speed: (pos.coords.speed || 0) * 3.6,
            accuracy: pos.coords.accuracy,
          });
        },
        () => setGpsStatus('error'),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    };

    upload();
    gpsRef.current = setInterval(upload, 10000);
  }, []);

  const stopGps = useCallback(() => {
    if (gpsRef.current) { clearInterval(gpsRef.current); gpsRef.current = null; }
    setGpsStatus('off');
  }, []);

  // Timer
  useEffect(() => {
    if (activeTask?.status === 'in_progress') {
      startTimeRef.current = new Date();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current!.getTime()) / 1000));
      }, 1000);
      startGps(activeTask.id);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      stopGps();
    };
  }, [activeTask?.id, activeTask?.status]);

  const handleStart = async (task: any) => {
    if (gpsStatus === 'off' && navigator.geolocation) {
      // Check GPS availability
    }
    await tasksApi.start(task.id);
    setActiveTask({ ...task, status: 'in_progress' });
    message.success('任务已开始，GPS追踪已启动');
    loadTasks();
  };

  const handleComplete = async (values: any) => {
    const formData = new FormData();
    formData.append('notes', values.notes || '');
    fileList.forEach((f) => {
      if (f.originFileObj) formData.append('images', f.originFileObj);
    });
    if (fileList.length === 0) {
      message.error('请至少上传一张工作记录照片');
      return;
    }
    await tasksApi.complete(activeTask.id, formData);
    message.success('任务完成！');
    setCompleteOpen(false);
    setActiveTask(null);
    setFileList([]);
    stopGps();
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsed(0);
    form.resetFields();
    loadTasks();
  };

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const todayTasks = tasks.filter((t) => {
    const today = dayjs().startOf('day');
    return t.scheduledAt ? dayjs(t.scheduledAt).isAfter(today) : true;
  });

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>
        {t('today')  || '今日任务'} — {dayjs().format('YYYY年MM月DD日')}
      </Title>

      {/* Active task tracker */}
      {activeTask && activeTask.status === 'in_progress' && (
        <Card
          style={{ marginBottom: 20, border: '2px solid #fa8c16', borderRadius: 12, background: '#fffbe6' }}
          bodyStyle={{ padding: 20 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <Text strong style={{ fontSize: 16 }}>进行中：{activeTask.title}</Text>
              <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                <Statistic
                  title="实时工时"
                  value={formatTime(elapsed)}
                  prefix={<ClockCircleOutlined />}
                  valueStyle={{ color: '#fa8c16', fontSize: 28, fontWeight: 700 }}
                />
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>
                <Space>
                  {gpsStatus === 'on' ? (
                    <Tag color="green" icon={<WifiOutlined />}>GPS 正常</Tag>
                  ) : gpsStatus === 'error' ? (
                    <Tag color="red" icon={<DisconnectOutlined />}>GPS 异常</Tag>
                  ) : (
                    <Tag color="default">GPS 初始化</Tag>
                  )}
                  {gpsCoords && <Text type="secondary" style={{ fontSize: 12 }}>{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</Text>}
                </Space>
              </div>
              <Button
                type="primary"
                danger
                size="large"
                icon={<CheckCircleOutlined />}
                onClick={() => setCompleteOpen(true)}
                style={{ borderRadius: 8 }}
              >
                完成任务
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Task list */}
      <Card bordered={false} style={{ borderRadius: 12 }}>
        <List
          loading={loading}
          dataSource={tasks}
          locale={{ emptyText: '今日暂无任务' }}
          renderItem={(task: any) => (
            <List.Item
              style={{ padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}
              extra={
                task.status === 'assigned' ? (
                  <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => handleStart(task)}>
                    {t('start_task')}
                  </Button>
                ) : null
              }
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Text strong>{task.title}</Text>
                    <Tag color={statusColors[task.status]}>{statusLabels[task.status]}</Tag>
                  </Space>
                }
                description={
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Space>
                      <EnvironmentOutlined style={{ color: '#52c41a' }} />
                      <Text type="secondary">{task.startLocation}</Text>
                      <Text type="secondary">→</Text>
                      <EnvironmentOutlined style={{ color: '#ff4d4f' }} />
                      <Text type="secondary">{task.endLocation}</Text>
                    </Space>
                    {task.cargo && (
                      <Space>
                        <Text type="secondary">货物：{task.cargo}</Text>
                        {task.cargoWeight && <Text type="secondary">({task.cargoWeight}吨)</Text>}
                      </Space>
                    )}
                    {task.scheduledAt && (
                      <Space>
                        <ClockCircleOutlined style={{ color: '#1677ff' }} />
                        <Text type="secondary">{dayjs(task.scheduledAt).format('YYYY-MM-DD HH:mm')}</Text>
                      </Space>
                    )}
                    {task.client && (
                      <Space>
                        <Text type="secondary">客户：{task.client.fullName || task.client.username}</Text>
                      </Space>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      {/* Complete Task Modal */}
      <Modal
        title="完成任务确认"
        open={completeOpen}
        onCancel={() => setCompleteOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Alert message="请上传工作完成记录照片（必填）" type="info" showIcon style={{ marginBottom: 16 }} />
        <Form form={form} onFinish={handleComplete} layout="vertical">
          <Form.Item label="工作记录照片（必填）">
            <Upload
              listType="picture-card"
              fileList={fileList}
              onChange={({ fileList: fl }) => setFileList(fl)}
              beforeUpload={() => false}
              maxCount={5}
            >
              {fileList.length < 5 && (
                <div>
                  <CameraOutlined style={{ fontSize: 20 }} />
                  <div style={{ marginTop: 8 }}>上传照片</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <TextArea rows={3} placeholder="任务完成备注（可选）" />
          </Form.Item>
          <div style={{ background: '#f5f5f5', padding: '12px 16px', borderRadius: 8, marginBottom: 16 }}>
            <Text type="secondary">本次工时：{formatTime(elapsed)}</Text>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setCompleteOpen(false)}>取消</Button>
              <Button type="primary" htmlType="submit" icon={<CheckCircleOutlined />}>提交完成</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
