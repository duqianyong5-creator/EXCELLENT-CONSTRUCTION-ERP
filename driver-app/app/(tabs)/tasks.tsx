import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { tasksApi } from '../../src/api';

const STATUS_LABEL: Record<string, string> = {
  pending: '待分配', assigned: '待出发', in_progress: '运送中',
  completed: '已完成', cancelled: '已取消',
};
const STATUS_COLOR: Record<string, string> = {
  pending: '#faad14', assigned: '#1677ff', in_progress: '#52c41a',
  completed: '#8c8c8c', cancelled: '#ff4d4f',
};

export default function TasksScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data: any = await tasksApi.today();
      setTasks(Array.isArray(data) ? data : []);
    } catch {
      Alert.alert('加载失败', '无法获取任务列表');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1677ff" />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>今日任务</Text>
        <Text style={styles.headerSub}>{new Date().toLocaleDateString('zh-CN')}</Text>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tasks.length === 0 ? styles.empty : { padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>今日暂无任务</Text>
            <Text style={styles.emptySub}>下拉刷新</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/task/${item.id}`)}
            activeOpacity={0.85}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '20' }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>
                  {STATUS_LABEL[item.status] || item.status}
                </Text>
              </View>
            </View>

            <View style={styles.route}>
              <View style={styles.routeDot} />
              <Text style={styles.routeText} numberOfLines={1}>{item.startLocation}</Text>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.route}>
              <View style={[styles.routeDot, { backgroundColor: '#ff4d4f' }]} />
              <Text style={styles.routeText} numberOfLines={1}>{item.endLocation}</Text>
            </View>

            {item.cargo && (
              <Text style={styles.cargo}>货物：{item.cargo}{item.cargoWeight ? `  ${item.cargoWeight}吨` : ''}</Text>
            )}

            <Text style={styles.cardFooter}>点击查看详情 →</Text>
          </TouchableOpacity>
        )}
      />
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
  empty: { flex: 1 },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyText: { fontSize: 18, color: '#999', fontWeight: '500' },
  emptySub: { fontSize: 13, color: '#bbb', marginTop: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a1a', flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  route: { flexDirection: 'row', alignItems: 'center', marginVertical: 2 },
  routeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1677ff', marginRight: 8 },
  routeLine: { width: 1, height: 12, backgroundColor: '#e0e0e0', marginLeft: 3.5, marginVertical: 1 },
  routeText: { fontSize: 14, color: '#555', flex: 1 },
  cargo: { fontSize: 13, color: '#888', marginTop: 10, backgroundColor: '#f5f5f5', padding: 8, borderRadius: 8 },
  cardFooter: { fontSize: 12, color: '#1677ff', textAlign: 'right', marginTop: 10 },
});
