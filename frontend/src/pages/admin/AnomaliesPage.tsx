import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Space, Badge, Typography, Tooltip, Modal, InputNumber, Switch, message } from 'antd';
import { WarningOutlined, CheckCircleOutlined, ReloadOutlined, SoundOutlined, ClockCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api, { anomaliesApi } from '../../api';
import { isAnomalySoundOn, setAnomalySoundOn } from '../../hooks/useAnomalyAlarm';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const anomalyLabels: Record<string, { label: string; color: string }> = {
  gps_disconnect:      { label: 'GPS断连',    color: 'volcano' },
  speed_anomaly:       { label: '速度异常',    color: 'red' },
  teleport:            { label: '瞬移异常',    color: 'magenta' },
  time_inconsistency:  { label: '时间不一致',  color: 'orange' },
  stationary:          { label: 'GPS静止',     color: 'red' },
};

export default function AnomaliesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  // 声音开关与全局报警提示音（useAnomalyAlarm）共用 localStorage 标志；
  // 实际的「检测到新静止报警就响」由 AdminLayout 里的全局 hook 负责，任意页面都会响。
  const [soundOn, setSoundOn] = useState(isAnomalySoundOn());
  const [snoozeFor, setSnoozeFor] = useState<any>(null);
  const [snoozeMinutes, setSnoozeMinutes] = useState(10);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data: any = await api.get(showAll ? '/anomalies' : '/anomalies/unresolved');
      const list = Array.isArray(data) ? data : [];
      setItems(list);
    } catch { setItems([]); }
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, [showAll]);

  // 每 15 秒自动刷新（用于静止报警实时提醒）
  useEffect(() => {
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [showAll]);

  const ignore = async (id: string) => {
    await anomaliesApi.ignore(id);
    message.success('已忽略');
    load();
  };

  const resolve = async (id: string) => {
    await anomaliesApi.resolve(id);
    message.success('已标记为已处理');
    load();
  };

  const doSnooze = async () => {
    if (!snoozeFor) return;
    await anomaliesApi.snooze(snoozeFor.id, snoozeMinutes);
    message.success(`已延时 ${snoozeMinutes} 分钟，若仍未移动将再次报警`);
    setSnoozeFor(null);
    load();
  };

  const unresolvedCount = items.filter((i) => !i.resolved).length;

  const columns = [
    {
      title: '异常类型', dataIndex: 'anomalyType', key: 'anomalyType',
      render: (v: string, r: any) => {
        const info = anomalyLabels[v] || { label: v, color: 'default' };
        return (
          <Space size={4}>
            <Tag color={info.color} icon={<WarningOutlined />}>{info.label}</Tag>
            {v === 'stationary' && r.alarmCount > 1 && <Tag color="red">第{r.alarmCount}次</Tag>}
          </Space>
        );
      },
    },
    {
      title: '司机', key: 'driver',
      render: (_: any, r: any) => r.driver?.fullName || r.driver?.username || '-',
    },
    {
      title: '任务', key: 'task',
      render: (_: any, r: any) => r.task?.title || '-',
    },
    {
      title: '说明', dataIndex: 'description', key: 'description', ellipsis: true,
      render: (v: string) => v ? <Text type="secondary">{v}</Text> : '-',
    },
    {
      title: '坐标', key: 'coords',
      render: (_: any, r: any) => r.latitude
        ? <Tooltip title="点击查看位置"><span style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer' }} onClick={() => window.open(`https://maps.google.com/?q=${r.latitude},${r.longitude}`, '_blank')}>{Number(r.latitude).toFixed(5)}, {Number(r.longitude).toFixed(5)}</span></Tooltip>
        : '-',
    },
    {
      title: '检测时间', dataIndex: 'detectedAt', key: 'detectedAt',
      render: (v: string) => dayjs(v).format('MM-DD HH:mm:ss'),
      sorter: (a: any, b: any) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
    },
    {
      title: '状态', dataIndex: 'resolved', key: 'resolved',
      render: (v: boolean, r: any) => {
        if (v) return <Tag color="green" icon={<CheckCircleOutlined />}>已处理</Tag>;
        if (r.snoozeUntil && new Date(r.snoozeUntil).getTime() > Date.now()) {
          return <Tag color="gold" icon={<ClockCircleOutlined />}>延时至 {dayjs(r.snoozeUntil).format('HH:mm')}</Tag>;
        }
        return <Badge status="error" text="未处理" />;
      },
    },
    {
      title: '操作', key: 'actions', width: 200,
      render: (_: any, r: any) => r.resolved ? null : (
        <Space size="small">
          {r.anomalyType === 'stationary' && (
            <Button size="small" icon={<ClockCircleOutlined />} onClick={() => { setSnoozeFor(r); setSnoozeMinutes(10); }}>延时</Button>
          )}
          <Button size="small" icon={<StopOutlined />} onClick={() => ignore(r.id)}>忽略</Button>
          <Button size="small" type="primary" onClick={() => resolve(r.id)}>已处理</Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>异常管理</Title>
          {unresolvedCount > 0 && <Badge count={unresolvedCount} style={{ backgroundColor: '#ff4d4f' }} />}
        </Space>
        <Space>
          <Tooltip title="报警声音提醒">
            <Space size={4}>
              <SoundOutlined style={{ color: soundOn ? '#F59E0B' : '#bbb' }} />
              <Switch size="small" checked={soundOn} onChange={(v) => { setSoundOn(v); setAnomalySoundOn(v); }} />
            </Space>
          </Tooltip>
          <Button
            type={showAll ? 'default' : 'primary'}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? '只看未处理' : '查看全部'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => load()}>刷新</Button>
        </Space>
      </div>

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          columns={columns}
          dataSource={items}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20 }}
          rowClassName={(r) => !r.resolved ? 'ant-table-row-selected' : ''}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={<span><ClockCircleOutlined /> 延时报警</span>}
        open={!!snoozeFor}
        onCancel={() => setSnoozeFor(null)}
        onOk={doSnooze}
        okText="确认延时"
        cancelText="取消"
        centered
        width={420}
        destroyOnClose
      >
        <Text>延后多久后若司机仍未移动则再次报警：</Text>
        <div style={{ marginTop: 12 }}>
          <InputNumber min={1} max={120} value={snoozeMinutes} onChange={(v) => setSnoozeMinutes(Number(v) || 10)} addonAfter="分钟" style={{ width: 160 }} />
        </div>
      </Modal>
    </div>
  );
}
