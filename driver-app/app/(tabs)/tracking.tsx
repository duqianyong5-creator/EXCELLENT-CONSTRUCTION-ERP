import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, FlatList,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector } from 'react-redux';
import { gpsApi, tasksApi } from '../../src/api';
import type { RootState } from '../../src/store';

type DriverPos = {
  driverId: string;
  driverName?: string;
  taskId?: string;
  latitude: number;
  longitude: number;
  speed?: number;
  timestamp?: string;
};

const CHINA_REGION = {
  latitude: 35.0,
  longitude: 105.0,
  latitudeDelta: 20,
  longitudeDelta: 20,
};

export default function TrackingScreen() {
  const { user } = useSelector((s: RootState) => s.auth);
  const role = user?.role || '';
  const [positions, setPositions] = useState<DriverPos[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DriverPos | null>(null);
  const mapRef = useRef<MapView>(null);
  const timer = useRef<any>(null);

  const fetchPositions = useCallback(async () => {
    try {
      if (role === 'admin' || role === 'dispatcher') {
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
    mapRef.current?.animateToRegion(
      {
        latitude: pos.latitude,
        longitude: pos.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      600,
    );
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSub}>
          {positions.length > 0
            ? `${positions.length} 名司机在线`
            : '暂无在线司机'}
        </Text>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={
          positions.length > 0
            ? {
                latitude: positions[0].latitude,
                longitude: positions[0].longitude,
                latitudeDelta: 0.5,
                longitudeDelta: 0.5,
              }
            : CHINA_REGION
        }
      >
        {positions.map((pos, idx) => (
          <Marker
            key={pos.driverId || idx}
            coordinate={{ latitude: pos.latitude, longitude: pos.longitude }}
            title={pos.driverName || '司机'}
            description={
              pos.speed != null ? `速度: ${Math.round(pos.speed)} km/h` : ''
            }
            onPress={() => setSelected(pos)}
          >
            <View style={styles.markerWrap}>
              <Text style={styles.markerIcon}>🚛</Text>
            </View>
          </Marker>
        ))}
      </MapView>

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
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyText}>暂无司机在线</Text>
          <Text style={styles.emptySub}>任务进行中时司机会上传位置</Text>
        </View>
      )}

      <TouchableOpacity style={styles.refreshBtn} onPress={fetchPositions}>
        <Text style={styles.refreshText}>🔄 刷新</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#999', fontSize: 14 },
  header: {
    backgroundColor: '#1677ff',
    padding: 20,
    paddingTop: 60,
    paddingBottom: 24,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  map: { flex: 1 },
  markerWrap: { alignItems: 'center', justifyContent: 'center' },
  markerIcon: { fontSize: 30 },
  panel: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    paddingVertical: 10,
  },
  driverCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 6,
    alignItems: 'center',
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  driverCardActive: {
    borderWidth: 2,
    borderColor: '#1677ff',
  },
  driverCardIcon: { fontSize: 22, marginBottom: 4 },
  driverCardName: { fontSize: 12, color: '#333', fontWeight: '600', maxWidth: 70 },
  driverCardSpeed: { fontSize: 11, color: '#52c41a', marginTop: 2 },
  emptyOverlay: {
    position: 'absolute',
    top: '45%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: '#666', fontWeight: '600' },
  emptySub: { fontSize: 13, color: '#999', marginTop: 6 },
  refreshBtn: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  refreshText: { fontSize: 14, color: '#1677ff', fontWeight: '600' },
});
