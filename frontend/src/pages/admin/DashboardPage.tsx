import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Row, Col, Card, Typography, Spin, Button } from 'antd';
import {
  TruckOutlined, OrderedListOutlined, CheckCircleOutlined,
  ClockCircleOutlined, ReloadOutlined, CalendarOutlined, RocketOutlined,
} from '@ant-design/icons';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tasksApi, gpsApi, usersApi } from '../../api';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';

interface StatCardProps {
  title: string; value: number; icon: React.ReactNode; bg: string; accent: string;
}
function StatCard({ title, value, icon, bg, accent }: StatCardProps) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)', height: '100%' }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: accent, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function DriverMap({ positions }: { positions: any[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    leafletMap.current = L.map(mapRef.current, {
      center: [22.3193, 114.1694],
      zoom: 10,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(leafletMap.current);
    return () => {
      leafletMap.current?.remove();
      leafletMap.current = null;
    };
  }, []);

  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const validPos = positions.filter(p =>
      p.latitude != null && p.longitude != null &&
      !isNaN(Number(p.latitude)) && !isNaN(Number(p.longitude))
    );

    validPos.forEach(pos => {
      const lat = Number(pos.latitude ?? pos.g_latitude);
      const lng = Number(pos.longitude ?? pos.g_longitude);
      const speed = Number(pos.speed ?? pos.g_speed ?? 0).toFixed(1);
      const name = pos.driver?.fullName ?? pos.driver?.username ?? `司机`;
      const icon = L.divIcon({
        className: '',
        html: `<div style="display:flex;flex-direction:column;align-items:center">
          <div style="background:#F59E0B;color:#000;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.4);border:2px solid #fff;font-weight:700">${name.charAt(0).toUpperCase()}</div>
          <div style="background:rgba(0,0,0,0.7);color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;font-weight:600;margin-top:2px;white-space:nowrap;max-width:72px;overflow:hidden;text-overflow:ellipsis">${name}</div>
        </div>`,
        iconSize: [80, 52],
        iconAnchor: [40, 52],
      });
      const marker = L.marker([lat, lng], { icon })
        .bindPopup(`<b>${name}</b><br/>速度：${speed} km/h<br/>坐标：${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        .addTo(map);
      markersRef.current.push(marker);
    });

    if (validPos.length === 1) {
      map.setView([Number(validPos[0].latitude ?? validPos[0].g_latitude), Number(validPos[0].longitude ?? validPos[0].g_longitude)], 13);
    } else if (validPos.length > 1) {
      const bounds = L.latLngBounds(validPos.map(p => [Number(p.latitude ?? p.g_latitude), Number(p.longitude ?? p.g_longitude)] as [number, number]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [positions]);

  return <div ref={mapRef} style={{ width: '100%', height: 440, borderRadius: 12 }} />;
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>({});
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [driverCount, setDriverCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [taskStats, pos, drivers]: any = await Promise.all([
        tasksApi.stats(),
        gpsApi.positions(),
        usersApi.drivers(),
      ]);
      setStats(taskStats);
      setDriverCount(drivers?.length || 0);
      // Build driverId → driver map for name enrichment
      const driverMap: Record<string, any> = {};
      (Array.isArray(drivers) ? drivers : []).forEach((d: any) => { driverMap[d.id] = d; });
      const enriched = (Array.isArray(pos) ? pos : []).map((p: any) => {
        const dId = p.driverId ?? p.g_driver_id ?? p.driver_id;
        return { ...p, driver: driverMap[dId] ?? null };
      });
      setPositions(enriched);
    } catch (e) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const [pos, drivers]: any = await Promise.all([gpsApi.positions(), usersApi.drivers()]);
        if (Array.isArray(pos)) {
          const driverMap: Record<string, any> = {};
          (Array.isArray(drivers) ? drivers : []).forEach((d: any) => { driverMap[d.id] = d; });
          setPositions(pos.map((p: any) => {
            const dId = p.driverId ?? p.g_driver_id ?? p.driver_id;
            return { ...p, driver: driverMap[dId] ?? null };
          }));
        }
      } catch {}
    }, 10000);
    const handler = (e: any) => {
      const { driverId, latitude, longitude } = e.detail;
      setPositions(prev => [...prev.filter(p => (p.driverId ?? p.driver_id) !== driverId), { driverId, latitude, longitude }]);
    };
    window.addEventListener('gps:update', handler);
    return () => { clearInterval(interval); window.removeEventListener('gps:update', handler); };
  }, [loadData]);

  const statCards = [
    { title: '当日任务', value: stats.today ?? 0, icon: <CalendarOutlined />, bg: '#FFFBEB', accent: AMBER },
    { title: '运送中', value: stats.inProgress || 0, icon: <TruckOutlined />, bg: '#FFF7ED', accent: '#F97316' },
    { title: '已完成', value: stats.completed || 0, icon: <CheckCircleOutlined />, bg: '#F0FDF4', accent: '#22C55E' },
    { title: '总任务', value: stats.total || 0, icon: <OrderedListOutlined />, bg: '#EFF6FF', accent: '#3B82F6' },
    { title: '司机人数', value: driverCount, icon: <RocketOutlined />, bg: '#FAF5FF', accent: '#A855F7' },
  ];

  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <Title level={3} style={{ margin: 0, color: '#1a1a1a', fontWeight: 800 }}>运营概览</Title>
          <Text style={{ color: '#999', fontSize: 13 }}>{dateStr}</Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={loadData} style={{ borderColor: AMBER, color: AMBER, borderRadius: 10 }}>刷新</Button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}><Spin size="large" /></div>
      ) : (
        <>
          <Row gutter={[14, 14]} style={{ marginBottom: 24 }}>
            {statCards.map(card => (
              <Col xs={12} sm={8} lg={Math.floor(24 / statCards.length) as any} key={card.title}>
                <StatCard {...card} />
              </Col>
            ))}
          </Row>

          {(stats.pending || 0) > 0 && (
            <div style={{ background: `linear-gradient(135deg, ${AMBER}, ${AMBER_DARK})`, borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClockCircleOutlined style={{ color: '#fff', fontSize: 18 }} />
              <Text style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>有 {stats.pending} 个任务待分配司机</Text>
            </div>
          )}

          <Card
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TruckOutlined style={{ color: AMBER, fontSize: 18 }} />
                <span style={{ fontWeight: 700 }}>实时位置监控</span>
                <div style={{ background: positions.length > 0 ? '#22C55E' : '#d9d9d9', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
                  {positions.length} 辆在线
                </div>
              </div>
            }
            bordered={false}
            style={{ borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,.06)' }}
          >
            <DriverMap positions={positions} />
          </Card>
        </>
      )}
    </div>
  );
}
