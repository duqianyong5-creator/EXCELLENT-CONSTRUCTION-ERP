import React, { useEffect, useState } from 'react';
import { Card, Button, Modal, Table, Tag, Typography, Form, Input, InputNumber, message, Empty, Alert } from 'antd';
import { FileTextOutlined, KeyOutlined, ReloadOutlined, GlobalOutlined, ClockCircleOutlined, AlertOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import dayjs from 'dayjs';
import { RootState } from '../../store';
import { operationLogsApi, usersApi, systemSettingsApi } from '../../api';

const { Title, Text } = Typography;
const AMBER = '#F59E0B';

// 统一的设置卡片：flex 布局，文字列 flex:1 + minWidth:0，内容永远不会溢出卡片
function SettingCard({
  icon, color, title, desc, onClick, children, span, titleColor, borderColor,
}: {
  icon: React.ReactNode; color: string; title: string; desc: string;
  onClick?: () => void; children?: React.ReactNode; span?: boolean;
  titleColor?: string; borderColor?: string;
}) {
  return (
    <Card
      hoverable={!!onClick}
      bordered={false}
      onClick={onClick}
      style={{
        borderRadius: 12,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        gridColumn: span ? '1 / -1' : undefined,
        border: borderColor ? `1px solid ${borderColor}` : undefined,
      }}
      styles={{ body: { padding: 18 } }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 10, flexShrink: 0,
          background: `${color}1f`, color, fontSize: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Title level={5} style={{ margin: 0, color: titleColor }}>{title}</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{desc}</Text>
          {children}
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const { i18n } = useTranslation();
  // 操作日志 + 清空数据：仅管理员可见；调度员无此权限
  const isAdmin = useSelector((s: RootState) => s.auth.user?.role) === 'admin';
  const setLang = (lng: 'zh' | 'en') => {
    i18n.changeLanguage(lng);
    localStorage.setItem('language', lng);
  };
  const [logsOpen, setLogsOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [form] = Form.useForm();
  const [adjustDefault, setAdjustDefault] = useState<number>(
    Number(localStorage.getItem('wr_adjust_default')) === 60 ? 60 : 30,
  );
  const saveAdjustDefault = (v: number) => {
    setAdjustDefault(v);
    localStorage.setItem('wr_adjust_default', String(v));
    message.success('已保存：默认调整 ' + (v === 60 ? '一小时' : '半小时'));
  };

  // GPS 报警 + 清空数据（后端 system-settings）
  const [gpsForm] = Form.useForm();
  const [gpsSaving, setGpsSaving] = useState(false);
  const [pwdSet, setPwdSet] = useState(false); // 是否已设置清空数据密码
  const [pwdInput, setPwdInput] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearPwd, setClearPwd] = useState('');
  const [clearLoading, setClearLoading] = useState(false);

  const loadSettings = async () => {
    try {
      const s: any = await systemSettingsApi.get();
      gpsForm.setFieldsValue({
        gps_stationary_minutes: Number(s.gps_stationary_minutes) || 15,
        gps_alarm_repeat: Number(s.gps_alarm_repeat) || 3,
        gps_alarm_delay_minutes: Number(s.gps_alarm_delay_minutes) || 10,
        gps_stationary_radius_m: Number(s.gps_stationary_radius_m) || 80,
      });
      setPwdSet(!!s.clear_data_password_set);
    } catch {
      /* 忽略加载失败 */
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const saveGps = async () => {
    const v = await gpsForm.validateFields();
    setGpsSaving(true);
    try {
      await systemSettingsApi.update({
        gps_stationary_minutes: String(v.gps_stationary_minutes),
        gps_alarm_repeat: String(v.gps_alarm_repeat),
        gps_alarm_delay_minutes: String(v.gps_alarm_delay_minutes),
        gps_stationary_radius_m: String(v.gps_stationary_radius_m),
      });
      message.success('GPS 报警设置已保存');
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setGpsSaving(false);
    }
  };

  const saveClearPwd = async () => {
    if (!pwdInput || pwdInput.length < 4) {
      message.error('清空数据密码至少 4 位');
      return;
    }
    setPwdSaving(true);
    try {
      await systemSettingsApi.update({ clear_data_password: pwdInput });
      message.success('清空数据密码已设置');
      setPwdInput('');
      setPwdSet(true);
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const handleClearData = async () => {
    setClearLoading(true);
    try {
      await systemSettingsApi.clearData(clearPwd);
      message.success('数据已清空');
      setClearOpen(false);
      setClearPwd('');
    } catch (e: any) {
      message.error(e?.message || '清空失败');
    } finally {
      setClearLoading(false);
    }
  };

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const data: any = await operationLogsApi.list({ limit: 100 });
      setLogs(Array.isArray(data) ? data : []);
    } catch (error: any) {
      message.error(error?.message || '加载操作日志失败');
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    if (logsOpen) loadLogs();
  }, [logsOpen]);

  const handlePasswordSave = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    setPasswordLoading(true);
    try {
      await usersApi.changePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码已更新');
      form.resetFields();
      setPasswordOpen(false);
    } catch (error: any) {
      message.error(error?.message || '密码更新失败');
    } finally {
      setPasswordLoading(false);
    }
  };

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作人',
      dataIndex: 'actorName',
      width: 160,
      render: (value: string, record: any) => value || record.actor?.username || '-',
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 180,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '对象',
      width: 150,
      render: (_: unknown, record: any) => (
        <Text type="secondary">
          {[record.targetType, record.targetId].filter(Boolean).join(': ') || '-'}
        </Text>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      render: (value: string) => value || '-',
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0 }}>系统设置</Title>
        <Text type="secondary">操作日志、密码、语言、工时调整、GPS 报警与数据清理等系统配置。</Text>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, alignItems: 'stretch' }}>
        {isAdmin && (
          <SettingCard
            icon={<FileTextOutlined />} color={AMBER}
            title="操作日志" desc="查看登录、任务、用户、工时等操作记录。"
            onClick={() => setLogsOpen(true)}
          />
        )}

        <SettingCard
          icon={<KeyOutlined />} color={AMBER}
          title="修改密码" desc="修改当前管理员账号的登录密码。"
          onClick={() => setPasswordOpen(true)}
        />

        <SettingCard
          icon={<GlobalOutlined />} color={AMBER}
          title="语言 / Language" desc="切换系统显示语言。"
        >
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type={i18n.language === 'zh' ? 'primary' : 'default'} size="small" onClick={() => setLang('zh')}>中文</Button>
            <Button type={i18n.language === 'en' ? 'primary' : 'default'} size="small" onClick={() => setLang('en')}>English</Button>
          </div>
        </SettingCard>

        <SettingCard
          icon={<ClockCircleOutlined />} color={AMBER}
          title="工时调整默认值" desc="自动给每条工时记录增加的时长（记为系统调整，计入最终工时 = GPS工时 + 此值）。"
        >
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button type={adjustDefault === 30 ? 'primary' : 'default'} size="small" onClick={() => saveAdjustDefault(30)}>半小时（30分钟）</Button>
            <Button type={adjustDefault === 60 ? 'primary' : 'default'} size="small" onClick={() => saveAdjustDefault(60)}>一小时（60分钟）</Button>
          </div>
        </SettingCard>

        {/* GPS 异常报警设置 */}
        <SettingCard
          span
          icon={<AlertOutlined />} color="#ef4444"
          title="GPS 异常报警"
          desc="司机停在原地超过设定时长就报警（带声音）。判定不看瞬时速度（GPS 静止会漂移、出现假速度），而是看一段时间内是否始终待在「位移阈值」范围内。"
        >
          <Form form={gpsForm} layout="vertical" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 20px', alignItems: 'flex-end' }}>
              <Form.Item name="gps_stationary_minutes" label="多久不动报警" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={1} max={240} addonAfter="分钟" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="gps_stationary_radius_m" label="位移阈值" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={20} max={2000} step={10} addonAfter="米" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="gps_alarm_delay_minutes" label="延时报警间隔" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={1} max={120} addonAfter="分钟" style={{ width: 130 }} />
              </Form.Item>
              <Form.Item name="gps_alarm_repeat" label="最多报警次数" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={1} max={10} addonAfter="次" style={{ width: 110 }} />
              </Form.Item>
              <Form.Item label=" " colon={false} style={{ marginBottom: 12 }}>
                <Button type="primary" onClick={saveGps} loading={gpsSaving}>保存</Button>
              </Form.Item>
            </div>
          </Form>
          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
            说明：在「多久不动报警」时长内，司机始终没离开「位移阈值」（默认 80 米，可容忍 GPS 漂移）即视为静止并报警。首次报警后等待「延时间隔」，若仍未移动则二次、三次报警，直到「最多报警次数」。可在异常页「忽略」结案或「延时」延后。
          </Text>
        </SettingCard>

        {/* 清空数据（危险操作）—— 仅管理员 */}
        {isAdmin && (
        <SettingCard
          span
          icon={<DeleteOutlined />} color="#ef4444"
          title="清空数据" titleColor="#cf1322" borderColor="#ffccc7"
          desc="清空仪表盘、任务管理、工时管理、异常通知、通知、公告等业务数据（用户账号保留）。需先设置清空数据密码。"
        >
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
            <div>
              <Text style={{ fontSize: 13 }}>清空数据密码 {pwdSet && <Tag color="green" style={{ marginLeft: 6 }}>已设置</Tag>}</Text>
              <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Input.Password
                  placeholder={pwdSet ? '输入新密码可修改' : '设置密码（至少4位）'}
                  value={pwdInput}
                  onChange={(e) => setPwdInput(e.target.value)}
                  style={{ width: 220 }}
                />
                <Button onClick={saveClearPwd} loading={pwdSaving}>保存密码</Button>
              </div>
            </div>
            <Button danger type="primary" icon={<DeleteOutlined />} disabled={!pwdSet} onClick={() => setClearOpen(true)}>
              清空数据
            </Button>
          </div>
        </SettingCard>
        )}
      </div>

      <Modal
        title="操作日志"
        open={logsOpen}
        onCancel={() => setLogsOpen(false)}
        footer={[
          <Button key="refresh" icon={<ReloadOutlined />} onClick={loadLogs} loading={logsLoading}>
            刷新
          </Button>,
          <Button key="close" onClick={() => setLogsOpen(false)}>关闭</Button>,
        ]}
        width={980}
        centered
      >
        <Table
          rowKey="id"
          loading={logsLoading}
          columns={columns}
          dataSource={logs}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无操作日志" /> }}
          scroll={{ x: 850 }}
        />
      </Modal>

      <Modal
        title="修改密码"
        open={passwordOpen}
        onCancel={() => setPasswordOpen(false)}
        footer={null}
        centered
        width={420}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handlePasswordSave}>
          <Form.Item name="oldPassword" label="原密码" rules={[{ required: true, message: '请输入原密码' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 8, message: '密码至少 8 位' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" rules={[{ required: true, message: '请再次输入新密码' }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={passwordLoading}>
            更新密码
          </Button>
        </Form>
      </Modal>

      <Modal
        title={<span style={{ color: '#cf1322' }}><DeleteOutlined /> 确认清空数据</span>}
        open={clearOpen}
        onCancel={() => { setClearOpen(false); setClearPwd(''); }}
        onOk={handleClearData}
        confirmLoading={clearLoading}
        okText="确认清空"
        cancelText="取消"
        okButtonProps={{ danger: true, disabled: !clearPwd }}
        centered
        width={460}
        destroyOnClose
      >
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="此操作不可恢复"
          description="将永久删除全部任务、工时、调整记录、GPS 轨迹、异常、通知与公告。用户账号不受影响。"
        />
        <Text>请输入清空数据密码以确认：</Text>
        <Input.Password
          style={{ marginTop: 8 }}
          placeholder="清空数据密码"
          value={clearPwd}
          onChange={(e) => setClearPwd(e.target.value)}
          onPressEnter={handleClearData}
        />
      </Modal>
    </div>
  );
}
