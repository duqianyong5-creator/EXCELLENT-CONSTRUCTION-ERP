import React, { useEffect, useState } from 'react';
import { Table, Card, Tag, Button, Space, Badge, Typography, Tooltip, message } from 'antd';
import { WarningOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import api from '../../api';
import dayjs from 'dayjs';

const { Title } = Typography;

const anomalyLabels: Record<string, { label: string; color: string }> = {
  gps_disconnect:      { label: 'GPS断连',    color: 'volcano' },
  speed_anomaly:       { label: '速度异常',    color: 'red' },
  teleport:            { label: '瞬移异常',    color: 'magenta' },
  time_inconsistency:  { label: '时间不一致',  color: 'orange' },
};

export default function AnomaliesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data: any = await api.get(showAll ? '/anomalies' : '/anomalies/unresolved');
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [showAll]);

  const resolve = async (id: string) => {
    await api.patch(`/anomalies/${id}/resolve`);
    message.success('已标记为已处理');
    load();
  };

  const unresolvedCount = items.filter((i) => !i.resolved).length;

  const columns = [
    {
      title: '异常类型', dataIndex: 'anomalyType', key: 'anomalyType',
      render: (v: string) => {
        const info = anomalyLabels[v] || { label: v, color: 'default' };
        return <Tag color={info.color} icon={<WarningOutlined />}>{info.label}</Tag>;
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
      title: '速度', dataIndex: 'speed', key: 'speed',
      render: (v: number) => v ? `${Number(v).toFixed(1)} km/h` : '-',
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
      render: (v: boolean) => v
        ? <Tag color="green" icon={<CheckCircleOutlined />}>已处理</Tag>
        : <Badge status="error" text="未处理" />,
    },
    {
      title: '操作', key: 'actions',
      render: (_: any, r: any) => !r.resolved && (
        <Button size="small" type="primary" onClick={() => resolve(r.id)}>标记已处理</Button>
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
          <Button
            type={showAll ? 'default' : 'primary'}
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? '只看未处理' : '查看全部'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
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
          scroll={{ x: 900 }}
        />
      </Card>
    </div>
  );
}
