import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import LeafletMap from '../../src/LeafletMap';
import { gpsApi, tasksApi } from '../../src/api';
import type { RootState } from '../../src/store';

const AMBER = '#F59E0B';

type DriverPos = {
  driverId: string;
  driverName?: string;
  taskId?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  timestamp?: string;
};

export default function TrackingScreen() {
  const { user } = useSelector((s: RootState) => s.auth);
  const role = user?.role || '';
  const [positions, setPositions] = useState<DriverPos[]>([]);
  const [driverTodayTasks, setDriverTodayTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverPos | null>(null);
  const timer = useRef<any>(null);

  const fetchPositions = useCallback(async () => {
    try {
      if (role === 'driver') {
        const tasks: any[] = (await tasksApi.today()) as any;
        setDriverTodayTasks(Array.isArray(tasks) ? tasks : []);
      } else if (role === 'admin' || role === 'dispatcher') {
        const data: any[] = (await gpsApi.positions()) as any;
        if (Array.isArray(data)) {
          setPositions(data.map((p) => ({
            driverId: p.driver_id ?? p.driverId ?? '',
            latitude: parseFloat(p.latitude),
            longitude: parseFloat(p.longitude),
            speed: p.speed,
            timestamp: p.timestamp,
            taskId: p.task_id ?? p.taskId,
          })));
        }
      } else if (role === 'client') {
        const tasks: any[] = (await tasksApi.list()) as any;
        const active = (Array.isArray(tasks) ? tasks : []).filter(
          (t) => t.status === 'in_progress' && (t.driverId || t.driver_id),
        );
        const results = await Promise.all(
          active.map((t) =>
            gpsApi.driverPosition(t.driverId ?? t.driver_id).catch(() => null),
          ),
        );
        const valid: DriverPos[] = [];
        results.forEach((pos: any, i) => {
          if (pos && pos.latitude && pos.longitude) {
            valid.push({
              driverId: active[i].driverId ?? active[i].driver_id,
              driverName: active[i].driverName ?? active[i].driver_name ?? '司机',
              taskId: active[i].id,
              latitude: parseFloat(pos.latitude),
              longitude: parseFloat(pos.longitude),
              speed: pos.speed,
              timestamp: pos.timestamp,
            });
          }
        });
        setPositions(valid);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchPositions();
    timer.current = setInterval(fetchPositions, 15000);
    return () => clearInterval(timer.current);
  }, [fetchPositions]);

  const focusDriver = (pos: DriverPos) => {
    setSelected(pos);
  };

  const title = role === 'client' ? '追踪司机' : '位置追踪';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1677ff" />
        <Text style={styles.loadingText}>加载地图中...</Text>
      </View>
    );
  }

  if (role === 'driver') {
    return (
      <View style={styles.driverTodayContainer}>
        <View style={styles.driverTodayHeader}>
          <Text style={styles.driverTodayTitle}>当日任务</Text>
          <Text style={styles.driverTodaySub}>今天需要关注的运输任务</Text>
        </View>
        <FlatList
          data={driverTodayTasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.driverTodayList,
            driverTodayTasks.length === 0 && { flex: 1, justifyContent: 'center' },
          ]}
          renderItem={({ item, index }) => (
            <View style={styles.driverTodayCard}>
              <Text style={styles.driverTodayNo}>#{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.driverTodayName} numberOfLines={1}>{item.title || '运输任务'}</Text>
              <Text style={styles.driverTodayMeta} numberOfLines={1}>
                {(item.cargo || '货物')} · {item.endLocation || '未设置终点'}
              </Text>
              <Text style={styles.driverTodayStatus}>
                {item.status === 'in_progress' ? '进行中' : item.status === 'assigned' ? '待接受' : '已完成'}
              </Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.driverTodayEmpty}>
              <Text style={styles.driverTodayEmptyIcon}>📋</Text>
              <Text style={styles.driverTodayEmptyTitle}>今日暂无任务</Text>
              <Text style={styles.driverTodayEmptySub}>下拉任务页刷新试试</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LeafletMap
        positions={positions}
        focusId={selected?.driverId}
        style={StyleSheet.absoluteFill}
        topInset={66}
        bottomInset={18}
      />

      {/* 顶部遮罩，保证系统状态栏图标在浅色地图上可读 */}
      <View style={styles.topScrim} pointerEvents="none" />

      {/* 悬浮标题胶囊（全屏地图） */}
      <View style={styles.floatingHeader} pointerEvents="box-none">
        <View style={styles.headerPill}>
          <View style={[styles.onlineDot, positions.length === 0 && styles.onlineDotOff]} />
          <View>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub}>
              {positions.length > 0 ? `${positions.length} 名司机在线` : '暂无在线司机'}
            </Text>
          </View>
        </View>
      </View>

      {/* 司机列表面板 */}
      {positions.length > 0 && (
        <View style={styles.panel}>
          <FlatList
            data={positions}
            keyExtractor={(p) => p.driverId}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.driverCard,
                  selected?.driverId === item.driverId && styles.driverCardActive,
                ]}
                onPress={() => focusDriver(item)}
              >
                <Text style={styles.driverCardIcon}>🚛</Text>
                <Text style={styles.driverCardName} numberOfLines={1}>
                  {item.driverName || '司机'}
                </Text>
                {item.speed != null && (
                  <Text style={styles.driverCardSpeed}>
                    {Math.round(item.speed)} km/h
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {positions.length === 0 && (
        <View style={styles.emptyOverlay} pointerEvents="none">
          <View style={styles.emptyIconWrap}>
            <Ionicons name="location-outline" size={30} color="rgba(255,255,255,0.85)" />
          </View>
          <Text style={styles.emptyText}>暂无司机在线</Text>
          <Text style={styles.emptySub}>任务进行中时司机会上传位置</Text>
        </View>
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={fetchPositions} activeOpacity={0.85}>
        <Ionicons name="refresh" size={16} color={AMBER} />
        <Text style={styles.refreshText}>刷新</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  driverTodayContainer: {
    flex: 1,
    backgroundColor: '#070b15',
  },
  driverTodayHeader: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  driverTodayTitle: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
  },
  driverTodaySub: {
    color: 'rgba(148,163,184,0.68)',
    fontSize: 14,
    marginTop: 8,
  },
  driverTodayList: {
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
  driverTodayCard: {
    backgroundColor: '#0d1320',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(71,85,105,0.34)',
    padding: 18,
    marginBottom: 14,
  },
  driverTodayNo: {
    color: '#F59E0B',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 12,
  },
  driverTodayName: {
    color: '#f8fafc',
    fontSize: 19,
    fontWeight: '900',
  },
  driverTodayMeta: {
    color: 'rgba(148,163,184,0.72)',
    fontSize: 14,
    marginTop: 8,
    fontWeight: '700',
  },
  driverTodayStatus: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '900',
    marginTop: 16,
  },
  driverTodayEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverTodayEmptyIcon: {
    fontSize: 48,
    marginBottom: 14,
  },
  driverTodayEmptyTitle: {
    color: 'rgba(226,232,240,0.82)',
    fontSize: 21,
    fontWeight: '900',
  },
  driverTodayEmptySub: {
    color: 'rgba(148,163,184,0.5)',
    fontSize: 14,
    marginTop: 10,
  },
  container: { flex: 1, backgroundColor: '#070b15' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#070b15' },
  loadingText: { marginTop: 12, color: 'rgba(148,163,184,0.8)', fontSize: 14 },

  topScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 64,
    backgroundColor: 'rgba(7,11,21,0.5)',
  },
  floatingHeader: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 60, paddingHorizontal: 16,
    alignItems: 'flex-start',
  },
  headerPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(7,11,21,0.85)',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  onlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#22c55e', marginRight: 10 },
  onlineDotOff: { backgroundColor: '#64748b' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  panel: {
    position: 'absolute',
    bottom: 104,
    left: 0,
    right: 0,
    paddingVertical: 10,
  },
  driverCard: {
    backgroundColor: 'rgba(13,19,32,0.92)',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 6,
    alignItems: 'center',
    minWidth: 84,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  driverCardActive: {
    borderWidth: 2,
    borderColor: AMBER,
  },
  driverCardIcon: { fontSize: 22, marginBottom: 4 },
  driverCardName: { fontSize: 12, color: '#f1f5f9', fontWeight: '700', maxWidth: 72 },
  driverCardSpeed: { fontSize: 11, color: '#4ade80', marginTop: 2, fontWeight: '700' },
  emptyOverlay: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(7,11,21,0.8)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyText: { fontSize: 16, color: '#f1f5f9', fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 },
  emptySub: { fontSize: 13, color: 'rgba(241,245,249,0.85)', marginTop: 6, textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6 },
  refreshBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(7,11,21,0.88)',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  refreshText: { fontSize: 14, color: AMBER, fontWeight: '800', marginLeft: 6 },
});
