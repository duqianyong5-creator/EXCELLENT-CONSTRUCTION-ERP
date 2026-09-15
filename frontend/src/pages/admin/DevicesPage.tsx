import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Typography, Form, Input, Switch,
  Popconfirm, message, Tooltip, Alert, Badge,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined, ReloadOutlined, AimOutlined,
  PoweroffOutlined, ThunderboltOutlined, EnvironmentOutlined, ApiOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { RootState } from '../../store';
import { gpsDevicesApi } from '../../api';

const { Title, Text } = Typography;
const AMBER = '#F59E0B';

type Device = {
  id: string; deviceNo: string; vehiclePlate?: string | null; name?: string | null; enabled: boolean;
  lastSeenAt?: string | null; lastFixAt?: string | null; lastLatitude?: number | null; lastLongitude?: number | null;
  lastSpeed?: number | null; batteryPercent?: number | null; externalPower?: boolean | null; signalPercent?: number | null;
  online: boolean; connection?: { addr: string; connectedAt: string; tzOffset: number } | null;
};

type Gateway = {
  port: number | null;
  online: Array<{ deviceNo: string }>;
  unregistered: Array<{ deviceNo: string; addr: string; count: number; lastAt: string }>;
};

function ago(value?: string | null, zh = true): string {
  if (!value) return '—';
  const sec = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (sec < 10) return zh ? '刚刚' : 'just now';
  if (sec < 60) return zh ? `${sec} 秒前` : `${sec}s ago`;
  if (sec < 3600) return zh ? `${Math.floor(sec / 60)} 分钟前` : `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return zh ? `${Math.floor(sec / 3600)} 小时前` : `${Math.floor(sec / 3600)}h ago`;
  return dayjs(value).format('MM-DD HH:mm');
}

export default function DevicesPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language === 'zh';
  const { user } = useSelector((s: RootState) => s.auth);
  const isAdmin = user?.role === 'admin';

  const [list, setList] = useState<Device[]>([]);
  const [gateway, setGateway] = useState<Gateway | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const devices: any = await gpsDevicesApi.list();
      setList(Array.isArray(devices) ? devices : []);
      // 网关状态仅管理员/调度员可见；监控角色拿不到时不影响设备列表
      try {
        const gw: any = await gpsDevicesApi.gateway();
        setGateway(gw || null);
      } catch {
        setGateway(null);
      }
    } catch {
      if (!silent) message.error(zh ? '加载失败' : 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    load();
    const timer = setInterval(() => load(true), 15000);
    return () => clearInterval(timer);
  }, [load]);

  // Modal 用 forceRender 让 Form 常驻挂载，setFieldsValue 才能在打开前生效
  const openCreate = (deviceNo = '') => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ deviceNo, vehiclePlate: '', name: '', enabled: true });
    setOpen(true);
  };

  const openEdit = (d: Device) => {
    setEditing(d);
    form.setFieldsValue({ deviceNo: d.deviceNo, vehiclePlate: d.vehiclePlate || '', name: d.name || '', enabled: d.enabled });
    setOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      if (editing) {
        await gpsDevicesApi.update(editing.id, { vehiclePlate: values.vehiclePlate, name: values.name, enabled: values.enabled });
        message.success(zh ? '已保存' : 'Saved');
      } else {
        await gpsDevicesApi.create(values);
        message.success(zh ? '设备已登记' : 'Device registered');
      }
      setOpen(false);
      form.resetFields();
      load(true);
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || (zh ? '操作失败' : 'Failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await gpsDevicesApi.delete(id);
      message.success(zh ? '已删除' : 'Deleted');
      load(true);
    } catch {
      message.error(zh ? '删除失败' : 'Delete failed');
    }
  };

  const sendCommand = async (d: Device, type: 'reboot' | 'realtime' | 'locate') => {
    try {
      await gpsDevicesApi.command(d.id, type === 'realtime' ? { type, intervalSec: 10 } : { type });
      message.success(
        type === 'reboot' ? (zh ? '已下发重启' : 'Reboot sent')
          : type === 'realtime' ? (zh ? '已下发实时模式（10 秒/次、不休眠）' : 'Realtime mode sent (10s, no sleep)')
            : (zh ? '已请求立即定位' : 'Locate requested'),
      );
    } catch (e: any) {
      message.error(e?.response?.data?.message || (zh ? '设备不在线' : 'Device offline'));
    }
  };

  const columns = [
    {
      title: zh ? '设备号' : 'Device No.', dataIndex: 'deviceNo', key: 'deviceNo', width: 150,
      render: (v: string, r: Device) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text>
          {r.name ? <Text type="secondary" style={{ fontSize: 12 }}>{r.name}</Text> : null}
        </Space>
      ),
    },
    {
      title: zh ? '车牌' : 'Plate', dataIndex: 'vehiclePlate', key: 'vehiclePlate', width: 120,
      render: (v: string | null) => v
        ? <Tag color="gold" style={{ fontWeight: 700, letterSpacing: 1 }}>{v}</Tag>
        : <Text type="warning">{zh ? '未绑定' : 'Unbound'}</Text>,
    },
    {
      title: zh ? '状态' : 'Status', key: 'status', width: 110,
      render: (_: any, r: Device) => (
        <Space direction="vertical" size={0}>
          {r.online
            ? <Badge status="processing" color="#22c55e" text={<Text style={{ color: '#16a34a', fontWeight: 600 }}>{zh ? '在线' : 'Online'}</Text>} />
            : <Badge status="default" text={<Text type="secondary">{zh ? '离线' : 'Offline'}</Text>} />}
          {!r.enabled && <Tag color="red" style={{ marginTop: 4 }}>{zh ? '已停用' : 'Disabled'}</Tag>}
        </Space>
      ),
    },
    {
      title: zh ? '最后上报' : 'Last seen', key: 'lastSeenAt', width: 130,
      render: (_: any, r: Device) => (
        <Tooltip title={r.lastSeenAt ? dayjs(r.lastSeenAt).format('YYYY-MM-DD HH:mm:ss') : ''}>
          <Text type={r.online ? undefined : 'secondary'}>{ago(r.lastSeenAt, zh)}</Text>
        </Tooltip>
      ),
    },
    {
      title: zh ? '最后位置' : 'Last fix', key: 'fix', width: 210,
      render: (_: any, r: Device) => r.lastLatitude != null && r.lastLongitude != null ? (
        <Space direction="vertical" size={0}>
          <a
            href={`https://www.openstreetmap.org/?mlat=${r.lastLatitude}&mlon=${r.lastLongitude}#map=16/${r.lastLatitude}/${r.lastLongitude}`}
            target="_blank" rel="noreferrer" style={{ fontFamily: 'monospace', fontSize: 12 }}
          >
            <EnvironmentOutlined /> {Number(r.lastLatitude).toFixed(5)}, {Number(r.lastLongitude).toFixed(5)}
          </a>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {Number(r.lastSpeed ?? 0).toFixed(0)} km/h · {ago(r.lastFixAt, zh)}
          </Text>
        </Space>
      ) : <Text type="secondary">—</Text>,
    },
    {
      title: zh ? '电量 / 信号' : 'Battery / Signal', key: 'power', width: 140,
      render: (_: any, r: Device) => (
        <Space size={6}>
          {r.batteryPercent != null && (
            <Tag color={r.batteryPercent < 20 ? 'red' : r.batteryPercent < 50 ? 'orange' : 'green'}>
              {r.externalPower ? <ThunderboltOutlined /> : null} {r.batteryPercent}%
            </Tag>
          )}
          {r.signalPercent != null && <Tag>{zh ? '信号' : 'Sig'} {r.signalPercent}%</Tag>}
          {r.batteryPercent == null && r.signalPercent == null && <Text type="secondary">—</Text>}
        </Space>
      ),
    },
    {
      title: zh ? '操作' : 'Actions', key: 'actions', width: 250,
      render: (_: any, r: Device) => (
        <Space size={4} wrap>
          <Tooltip title={zh ? '编辑车牌/名称' : 'Edit'}>
            <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          </Tooltip>
          <Tooltip title={zh ? '立即定位一次' : 'Locate now'}>
            <Button size="small" icon={<AimOutlined />} disabled={!r.online} onClick={() => sendCommand(r, 'locate')} />
          </Tooltip>
          <Popconfirm
            title={zh ? '下发车队实时模式？' : 'Send fleet realtime mode?'}
            description={zh ? '每 10 秒上报、静止也上报、禁止休眠（接车电使用）' : 'Report every 10s, also when stationary, never sleep'}
            onConfirm={() => sendCommand(r, 'realtime')} okText={zh ? '下发' : 'Send'} cancelText={zh ? '取消' : 'Cancel'}
            disabled={!r.online}
          >
            <Tooltip title={zh ? '实时模式' : 'Realtime mode'}>
              <Button size="small" icon={<ThunderboltOutlined />} disabled={!r.online} />
            </Tooltip>
          </Popconfirm>
          <Popconfirm
            title={zh ? '重启设备？' : 'Reboot device?'} onConfirm={() => sendCommand(r, 'reboot')}
            okText={zh ? '重启' : 'Reboot'} cancelText={zh ? '取消' : 'Cancel'} disabled={!r.online}
          >
            <Tooltip title={zh ? '重启' : 'Reboot'}>
              <Button size="small" icon={<PoweroffOutlined />} disabled={!r.online} />
            </Tooltip>
          </Popconfirm>
          {isAdmin && (
            <Popconfirm
              title={zh ? '确定删除此设备？' : 'Delete this device?'} onConfirm={() => handleDelete(r.id)}
              okText={zh ? '删除' : 'Delete'} okButtonProps={{ danger: true }} cancelText={zh ? '取消' : 'Cancel'}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const onlineCount = list.filter((d) => d.online).length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ApiOutlined style={{ marginRight: 8, color: AMBER }} />
          {zh ? 'GPS 设备' : 'GPS Devices'}
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>{zh ? '刷新' : 'Refresh'}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>{zh ? '登记设备' : 'Add device'}</Button>
        </Space>
      </div>

      {gateway && (
        gateway.port
          ? (
            <Alert
              type="info" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
              message={zh
                ? <span>网关已启动，监听 TCP 端口 <Text code>{gateway.port}</Text>；当前在线 <Text strong>{onlineCount}</Text> / {list.length} 台。设备的服务器地址请配置为本后端对外的 TCP 地址（Railway：Networking → TCP Proxy）。</span>
                : <span>Gateway listening on TCP port <Text code>{gateway.port}</Text>; online <Text strong>{onlineCount}</Text> / {list.length}. Point devices at this backend's public TCP address (Railway: Networking → TCP Proxy).</span>}
            />
          )
          : (
            <Alert
              type="warning" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
              message={zh ? '定位器网关未启动：后端未设置环境变量 JT808_PORT。' : 'Gateway is off: JT808_PORT is not set on the backend.'}
            />
          )
      )}

      {gateway && gateway.unregistered.length > 0 && (
        <Card
          size="small" bordered={false}
          style={{ marginBottom: 16, borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a' }}
          title={<span style={{ color: '#b45309' }}>{zh ? '有未登记的设备正在尝试连接' : 'Unregistered devices are trying to connect'}</span>}
        >
          <Space wrap>
            {gateway.unregistered.map((u) => (
              <Tag
                key={u.deviceNo} color="orange" style={{ padding: '4px 10px', cursor: 'pointer', fontSize: 13 }}
                onClick={() => openCreate(u.deviceNo)}
              >
                <Text strong style={{ fontFamily: 'monospace' }}>{u.deviceNo}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{u.addr} · ×{u.count} · {ago(u.lastAt, zh)}</Text>
                <PlusOutlined style={{ marginLeft: 8 }} />
              </Tag>
            ))}
          </Space>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {zh ? '点击设备号即可登记并绑定车牌。登记后设备下次注册即被接受。' : 'Click a device number to register it and bind a plate.'}
            </Text>
          </div>
        </Card>
      )}

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          columns={columns} dataSource={list} rowKey="id" loading={loading}
          pagination={{ pageSize: 20 }} scroll={{ x: 1000 }}
          locale={{ emptyText: zh ? '还没有登记设备。设备接线开机后会出现在上方「未登记设备」里，点一下即可登记。' : 'No devices yet.' }}
        />
      </Card>

      <Modal
        title={editing ? (zh ? '编辑设备' : 'Edit device') : (zh ? '登记设备' : 'Add device')}
        open={open} onCancel={() => setOpen(false)} onOk={handleSubmit} confirmLoading={submitting}
        okText={editing ? (zh ? '保存' : 'Save') : (zh ? '登记' : 'Add')} cancelText={zh ? '取消' : 'Cancel'}
        centered width={440} forceRender
      >
        <Form form={form} layout="vertical" initialValues={{ enabled: true }}>
          <Form.Item
            name="deviceNo" label={zh ? '设备号' : 'Device number'}
            rules={[{ required: true, message: zh ? '请输入设备号' : 'Required' }, { pattern: /^\d{5,20}$/, message: zh ? '5~20 位数字' : '5-20 digits' }]}
            extra={zh ? '设备机身/说明书上的 11 位号码（协议里的终端手机号）' : 'The 11-digit number printed on the device'}
          >
            <Input placeholder="51160004464" disabled={!!editing} maxLength={20} style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item
            name="vehiclePlate" label={zh ? '车牌' : 'Vehicle plate'}
            extra={zh ? '必须与司机接单时填写的车牌一致（不区分大小写与空格）' : 'Must match the plate the driver enters when accepting a task'}
          >
            <Input placeholder="ABC123" maxLength={32} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="name" label={zh ? '备注名称' : 'Name'}>
            <Input placeholder={zh ? '例如：1 号车 / 张三的车' : 'e.g. Truck #1'} maxLength={128} />
          </Form.Item>
          <Form.Item name="enabled" label={zh ? '启用' : 'Enabled'} valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
