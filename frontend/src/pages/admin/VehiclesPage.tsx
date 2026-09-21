import React, { useCallback, useEffect, useState } from 'react';
import {
  Table, Card, Button, Tag, Space, Modal, Typography, Form, Input, InputNumber,
  Popconfirm, message, Tooltip, Alert, Progress, DatePicker,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ReloadOutlined, CarOutlined,
  FileProtectOutlined, DashboardOutlined, WarningOutlined,
} from '@ant-design/icons';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { RootState } from '../../store';
import { vehiclesApi } from '../../api';

const { Title, Text, Paragraph } = Typography;
const AMBER = '#F59E0B';

type Level = 'unknown' | 'ok' | 'warn' | 'critical' | 'exceeded';

type Vehicle = {
  id: string; plate: string; displayPlate: string; label?: string | null; enabled: boolean;
  rucLicenceNo?: string | null; rucStartKm?: number | null; rucEndKm?: number | null; rucPurchasedAt?: string | null;
  odometerKm?: number | null; odometerCalibratedKm?: number | null; odometerCalibratedAt?: string | null;
  level: Level; remainingKm: number | null; avgDailyKm: number;
  projectedDays: number | null; projectedExhaustedAt: string | null; daysSinceCalibration: number | null;
};

const LEVEL_META: Record<Level, { color: string; zh: string; en: string }> = {
  unknown: { color: 'default', zh: '未登记', en: 'No licence' },
  ok: { color: 'green', zh: '正常', en: 'OK' },
  warn: { color: 'gold', zh: '需安排购买', en: 'Buy soon' },
  critical: { color: 'orange', zh: '即将用完', en: 'Almost out' },
  exceeded: { color: 'red', zh: '已超出许可', en: 'Exceeded' },
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
};
const km = (v: unknown): string => {
  const n = num(v);
  return n == null ? '—' : `${Math.round(n).toLocaleString()} km`;
};

export default function VehiclesPage() {
  const { i18n } = useTranslation();
  const zh = i18n.language === 'zh';
  const { user } = useSelector((s: RootState) => s.auth);
  const isAdmin = user?.role === 'admin';

  const [list, setList] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [rucTarget, setRucTarget] = useState<Vehicle | null>(null);
  const [odoTarget, setOdoTarget] = useState<Vehicle | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addForm] = Form.useForm();
  const [rucForm] = Form.useForm();
  const [odoForm] = Form.useForm();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data: any = await vehiclesApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch {
      if (!silent) message.error(zh ? '加载失败' : 'Failed to load');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [zh]);

  useEffect(() => { load(); }, [load]);

  const submit = async (fn: () => Promise<any>, ok: string) => {
    setSubmitting(true);
    try {
      await fn();
      message.success(ok);
      setAddOpen(false); setRucTarget(null); setOdoTarget(null);
      load(true);
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || (zh ? '操作失败' : 'Failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const openRuc = (v: Vehicle) => {
    setRucTarget(v);
    const start = num(v.odometerKm) ?? num(v.rucEndKm) ?? 0;
    // 新许可通常从当前里程接着买，按 1000 km 一档预填，省去手算
    rucForm.setFieldsValue({
      licenceNo: '',
      startKm: Math.round(start),
      endKm: Math.round(start) + 1000,
      purchasedAt: dayjs(),
    });
  };

  const openOdo = (v: Vehicle) => {
    setOdoTarget(v);
    odoForm.setFieldsValue({ odometerKm: num(v.odometerKm) ? Math.round(num(v.odometerKm)!) : undefined });
  };

  const columns = [
    {
      title: zh ? '车牌' : 'Plate', key: 'plate', width: 150, fixed: 'left' as const,
      render: (_: any, r: Vehicle) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ letterSpacing: 1 }}>{r.displayPlate}</Text>
          {r.label ? <Text type="secondary" style={{ fontSize: 12 }}>{r.label}</Text> : null}
        </Space>
      ),
    },
    {
      title: zh ? 'RUC 状态' : 'RUC status', key: 'level', width: 130,
      render: (_: any, r: Vehicle) => {
        const meta = LEVEL_META[r.level] || LEVEL_META.unknown;
        return <Tag color={meta.color} style={{ fontWeight: 600 }}>{zh ? meta.zh : meta.en}</Tag>;
      },
    },
    {
      title: zh ? '剩余里程' : 'Remaining', key: 'remaining', width: 190,
      render: (_: any, r: Vehicle) => {
        const remaining = num(r.remainingKm);
        if (remaining == null) {
          return <Text type="secondary">{zh ? '未登记许可' : 'No licence recorded'}</Text>;
        }
        const total = Math.max(1, (num(r.rucEndKm) ?? 0) - (num(r.rucStartKm) ?? 0));
        const used = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
        return (
          <Space direction="vertical" size={0} style={{ width: '100%' }}>
            <Text strong style={{ color: remaining <= 0 ? '#dc2626' : remaining <= 200 ? '#ea580c' : undefined }}>
              {remaining <= 0 ? (zh ? `已超出 ${Math.abs(Math.round(remaining))} km` : `${Math.abs(Math.round(remaining))} km over`) : km(remaining)}
            </Text>
            <Progress
              percent={used} size="small" showInfo={false}
              strokeColor={remaining <= 0 ? '#dc2626' : remaining <= 200 ? '#ea580c' : remaining <= 500 ? AMBER : '#22c55e'}
            />
          </Space>
        );
      },
    },
    {
      title: zh ? '预计用完' : 'Runs out', key: 'projected', width: 150,
      render: (_: any, r: Vehicle) => {
        const days = num(r.projectedDays);
        if (days == null) {
          return <Text type="secondary" style={{ fontSize: 12 }}>{zh ? '用量不足，暂不预估' : 'Not enough data'}</Text>;
        }
        return (
          <Space direction="vertical" size={0}>
            <Text>{zh ? `约 ${Math.floor(days)} 天后` : `~${Math.floor(days)} days`}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {r.projectedExhaustedAt ? dayjs(r.projectedExhaustedAt).format('MM-DD') : ''}
              {r.avgDailyKm > 0 ? ` · ${Math.round(r.avgDailyKm)} km/${zh ? '天' : 'd'}` : ''}
            </Text>
          </Space>
        );
      },
    },
    {
      title: zh ? '里程（估算）' : 'Odometer (est.)', key: 'odo', width: 180,
      render: (_: any, r: Vehicle) => {
        const stale = (r.daysSinceCalibration ?? 999) > 30 || r.daysSinceCalibration == null;
        return (
          <Space direction="vertical" size={0}>
            <Text>{km(r.odometerKm)}</Text>
            <Tooltip title={zh
              ? '系统按定位器里程估算，与车上 hubodometer 会有误差。定期用实际读数校准可以让提醒更准。'
              : 'Estimated from tracker mileage; recalibrate from the hubodometer to keep it accurate.'}>
              <Text type={stale ? 'warning' : 'secondary'} style={{ fontSize: 12 }}>
                {r.daysSinceCalibration == null
                  ? (zh ? '从未校准' : 'never calibrated')
                  : (zh ? `${r.daysSinceCalibration} 天前校准` : `calibrated ${r.daysSinceCalibration}d ago`)}
              </Text>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: zh ? '许可' : 'Licence', key: 'licence', width: 190,
      render: (_: any, r: Vehicle) => num(r.rucEndKm) == null ? <Text type="secondary">—</Text> : (
        <Space direction="vertical" size={0}>
          <Text style={{ fontSize: 13 }}>{km(r.rucStartKm)} → {km(r.rucEndKm)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {r.rucLicenceNo || (zh ? '无单号' : 'no number')}
            {r.rucPurchasedAt ? ` · ${dayjs(r.rucPurchasedAt).format('YYYY-MM-DD')}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: zh ? '操作' : 'Actions', key: 'actions', width: 210,
      render: (_: any, r: Vehicle) => (
        <Space size={4} wrap>
          <Button size="small" type="primary" ghost icon={<FileProtectOutlined />} onClick={() => openRuc(r)}>
            {zh ? '登记许可' : 'Licence'}
          </Button>
          <Button size="small" icon={<DashboardOutlined />} onClick={() => openOdo(r)}>
            {zh ? '校准里程' : 'Calibrate'}
          </Button>
          {isAdmin && (
            <Popconfirm
              title={zh ? '确定删除这辆车？' : 'Delete this vehicle?'}
              onConfirm={() => submit(() => vehiclesApi.delete(r.id), zh ? '已删除' : 'Deleted')}
              okText={zh ? '删除' : 'Delete'} okButtonProps={{ danger: true }} cancelText={zh ? '取消' : 'Cancel'}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const needAttention = list.filter((v) => v.level === 'warn' || v.level === 'critical' || v.level === 'exceeded');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <CarOutlined style={{ marginRight: 8, color: AMBER }} />
          {zh ? '车辆与 RUC 路税' : 'Vehicles & RUC'}
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>{zh ? '刷新' : 'Refresh'}</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddOpen(true); }}>
            {zh ? '登记车辆' : 'Add vehicle'}
          </Button>
        </Space>
      </div>

      {needAttention.length > 0 && (
        <Alert
          type={needAttention.some((v) => v.level === 'exceeded') ? 'error' : 'warning'}
          showIcon icon={<WarningOutlined />} style={{ marginBottom: 16, borderRadius: 10 }}
          message={zh
            ? `${needAttention.length} 辆车的 RUC 路税需要处理`
            : `${needAttention.length} vehicle(s) need RUC attention`}
          description={
            <Space wrap size={[8, 4]}>
              {needAttention.map((v) => (
                <Tag key={v.id} color={LEVEL_META[v.level].color}>
                  <Text strong>{v.displayPlate}</Text>
                  <Text style={{ marginLeft: 6, fontSize: 12 }}>
                    {(num(v.remainingKm) ?? 0) <= 0
                      ? (zh ? `已超出 ${Math.abs(Math.round(num(v.remainingKm) ?? 0))} km` : `${Math.abs(Math.round(num(v.remainingKm) ?? 0))} km over`)
                      : (zh ? `剩 ${Math.round(num(v.remainingKm) ?? 0)} km` : `${Math.round(num(v.remainingKm) ?? 0)} km left`)}
                  </Text>
                </Tag>
              ))}
            </Space>
          }
        />
      )}

      <Alert
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 10 }}
        message={zh
          ? '里程为系统估算值，购买 RUC 时请以车上 hubodometer 的实际读数为准'
          : 'Mileage here is an estimate — buy RUC using the actual hubodometer reading'}
        description={zh
          ? '系统按车载定位器上报的里程累计，用于提前提醒；购买本身仍需在 NZTA 或代理处办理（自动购买需要 NZTA 认证的电子里程记录资质）。'
          : 'Distance is accumulated from tracker mileage for early warning only. Purchase is still done through NZTA or an agent.'}
      />

      <Card bordered={false} style={{ borderRadius: 12 }}>
        <Table
          columns={columns} dataSource={list} rowKey="id" loading={loading}
          pagination={{ pageSize: 20 }} scroll={{ x: 1100 }}
          locale={{ emptyText: zh ? '还没有登记车辆。登记后即可跟踪 RUC 路税剩余里程。' : 'No vehicles yet.' }}
        />
      </Card>

      {/* 登记车辆 */}
      <Modal
        title={zh ? '登记车辆' : 'Add vehicle'} open={addOpen} onCancel={() => setAddOpen(false)}
        onOk={async () => {
          const v = await addForm.validateFields();
          submit(() => vehiclesApi.create(v), zh ? '已登记' : 'Added');
        }}
        confirmLoading={submitting} okText={zh ? '登记' : 'Add'} cancelText={zh ? '取消' : 'Cancel'}
        centered width={420} forceRender
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="plate" label={zh ? '车牌' : 'Plate'}
            rules={[{ required: true, message: zh ? '请输入车牌' : 'Required' }]}
            extra={zh ? '要与定位器登记、司机接单时填写的车牌一致' : 'Must match the tracker and what drivers type'}
          >
            <Input placeholder="ABC123" maxLength={32} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="label" label={zh ? '备注名称' : 'Label'}>
            <Input placeholder={zh ? '例如：1 号车' : 'e.g. Truck #1'} maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 登记 RUC 许可 */}
      <Modal
        title={zh ? `登记 RUC 许可 · ${rucTarget?.displayPlate ?? ''}` : `Record RUC licence · ${rucTarget?.displayPlate ?? ''}`}
        open={!!rucTarget} onCancel={() => setRucTarget(null)}
        onOk={async () => {
          const v = await rucForm.validateFields();
          submit(() => vehiclesApi.recordLicence(rucTarget!.id, {
            licenceNo: v.licenceNo,
            startKm: v.startKm,
            endKm: v.endKm,
            purchasedAt: v.purchasedAt ? v.purchasedAt.toISOString() : undefined,
          }), zh ? '许可已登记' : 'Licence recorded');
        }}
        confirmLoading={submitting} okText={zh ? '保存' : 'Save'} cancelText={zh ? '取消' : 'Cancel'}
        centered width={460} forceRender
      >
        <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
          {zh
            ? '按购买到的 RUC 许可上的里程范围填写。保存后提醒会重新开始计算。'
            : 'Enter the distance range printed on the RUC licence you purchased.'}
        </Paragraph>
        <Form form={rucForm} layout="vertical">
          <Form.Item name="licenceNo" label={zh ? '许可编号' : 'Licence number'}>
            <Input placeholder={zh ? '选填' : 'Optional'} maxLength={64} />
          </Form.Item>
          <Form.Item
            name="startKm" label={zh ? '起始里程 (km)' : 'Start reading (km)'}
            rules={[{ required: true, message: zh ? '请填写' : 'Required' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={1000} />
          </Form.Item>
          <Form.Item
            name="endKm" label={zh ? '截止里程 (km)' : 'End reading (km)'}
            rules={[
              { required: true, message: zh ? '请填写' : 'Required' },
              ({ getFieldValue }) => ({
                validator: (_, value) => value > getFieldValue('startKm')
                  ? Promise.resolve()
                  : Promise.reject(new Error(zh ? '截止里程必须大于起始里程' : 'End must be greater than start')),
              }),
            ]}
            extra={zh ? '跑到这个里程之前必须续买' : 'The vehicle must not travel past this reading'}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={1000} />
          </Form.Item>
          <Form.Item name="purchasedAt" label={zh ? '购买日期' : 'Purchased on'}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 校准里程 */}
      <Modal
        title={zh ? `校准里程 · ${odoTarget?.displayPlate ?? ''}` : `Calibrate odometer · ${odoTarget?.displayPlate ?? ''}`}
        open={!!odoTarget} onCancel={() => setOdoTarget(null)}
        onOk={async () => {
          const v = await odoForm.validateFields();
          submit(() => vehiclesApi.calibrate(odoTarget!.id, v.odometerKm), zh ? '里程已校准' : 'Calibrated');
        }}
        confirmLoading={submitting} okText={zh ? '保存' : 'Save'} cancelText={zh ? '取消' : 'Cancel'}
        centered width={420} forceRender
      >
        <Paragraph type="secondary" style={{ fontSize: 12.5 }}>
          {zh
            ? '填写车上 hubodometer（里程计）的实际读数。这会成为新的基准，之后继续按定位器里程累加。'
            : 'Enter the actual hubodometer reading; it becomes the new baseline.'}
        </Paragraph>
        <Form form={odoForm} layout="vertical">
          <Form.Item
            name="odometerKm" label={zh ? '当前实际里程 (km)' : 'Current reading (km)'}
            rules={[{ required: true, message: zh ? '请填写' : 'Required' }]}
          >
            <InputNumber style={{ width: '100%' }} min={0} step={100} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
