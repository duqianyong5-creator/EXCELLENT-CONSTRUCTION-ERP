import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { tasksApi, gpsApi } from '../../src/api';
import { setActiveTask, setGpsRunning } from '../../src/store/taskSlice';
import type { RootState } from '../../src/store';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dispatch = useDispatch();
  const { isGpsRunning, activeTaskId } = useSelector((s: RootState) => s.task);

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const gpsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const data: any = await tasksApi.get(id);
      setTask(data);
    } catch {
      Alert.alert('错误', '无法加载任务详情');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadTask(); }, [loadTask]);

  // 清理 GPS 定时器
  useEffect(() => {
    return () => {
      if (gpsInterval.current) clearInterval(gpsInterval.current);
    };
  }, []);

  const startGpsUpload = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('权限不足', '需要位置权限才能上报GPS');
      return;
    }
    dispatch(setGpsRunning(true));
    gpsInterval.current = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await gpsApi.upload({
          taskId: id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          speed: Math.max(0, (loc.coords.speed ?? 0) * 3.6),
          heading: loc.coords.heading ?? undefined,
          accuracy: loc.coords.accuracy ?? undefined,
        });
      } catch { /* 静默忽略单次上传失败 */ }
    }, 10000);
  }, [id, dispatch]);

  const stopGpsUpload = useCallback(() => {
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    dispatch(setGpsRunning(false));
  }, [dispatch]);

  const handleStart = async () => {
    Alert.alert('开始任务', '确认开始执行此任务？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认开始', onPress: async () => {
          try {
            setStarting(true);
            await tasksApi.start(id);
            dispatch(setActiveTask({ id, title: task.title, startLocation: task.startLocation, endLocation: task.endLocation, status: 'in_progress' }));
            await startGpsUpload();
            await loadTask();
            Alert.alert('✅ 已开始', 'GPS上报已启动，每10秒自动上传位置');
          } catch (err: any) {
            Alert.alert('失败', err.message || '开始任务失败');
          } finally {
            setStarting(false);
          }
        },
      },
    ]);
  };

  const handlePickPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('提示', '最多上传5张照片');
      return;
    }
    Alert.alert('选择照片', '', [
      {
        text: '拍照', onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsEditing: false,
          });
          if (!res.canceled && res.assets[0]) {
            setPhotos(prev => [...prev, res.assets[0].uri]);
          }
        },
      },
      {
        text: '从相册选择', onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
            allowsMultipleSelection: false,
          });
          if (!res.canceled && res.assets[0]) {
            setPhotos(prev => [...prev, res.assets[0].uri]);
          }
        },
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleComplete = async () => {
    if (photos.length === 0) {
      Alert.alert('提示', '请至少上传1张工作照片');
      return;
    }
    Alert.alert('完成任务', '确认任务已完成？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确认完成', onPress: async () => {
          try {
            setCompleting(true);
            stopGpsUpload();
            const formData = new FormData();
            photos.forEach((uri, index) => {
              const filename = `photo_${index}.jpg`;
              (formData as any).append('images', {
                uri,
                name: filename,
                type: 'image/jpeg',
              } as any);
            });
            if (notes) formData.append('completionNotes', notes);
            await tasksApi.complete(id, formData);
            dispatch(setActiveTask(null));
            Alert.alert('✅ 任务完成', '工作记录已提交', [
              { text: '返回', onPress: () => router.back() },
            ]);
          } catch (err: any) {
            Alert.alert('提交失败', err.message || '完成任务失败，请重试');
            setCompleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1677ff" />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>任务不存在</Text>
      </View>
    );
  }

  const isActive = task.status === 'in_progress' && activeTaskId === id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 顶部 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← 返回</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{task.title}</Text>
      </View>

      {/* GPS 状态栏 */}
      {isActive && (
        <View style={styles.gpsBanner}>
          <View style={styles.gpsIndicator} />
          <Text style={styles.gpsText}>GPS 定位中（每10秒上报）</Text>
        </View>
      )}

      {/* 任务信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>任务信息</Text>
        <InfoRow label="起点" value={task.startLocation} />
        <InfoRow label="终点" value={task.endLocation} />
        {task.cargo && <InfoRow label="货物" value={task.cargo} />}
        {task.cargoWeight && <InfoRow label="重量" value={`${task.cargoWeight} 吨`} />}
        {task.scheduledAt && (
          <InfoRow label="计划时间" value={new Date(task.scheduledAt).toLocaleString('zh-CN')} />
        )}
        {task.notes && <InfoRow label="备注" value={task.notes} />}
      </View>

      {/* 操作按钮 */}
      {task.status === 'assigned' && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.startBtn, starting && styles.btnDisabled]}
          onPress={handleStart}
          disabled={starting}
          activeOpacity={0.85}
        >
          {starting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.actionBtnText}>🚀 开始任务</Text>
          }
        </TouchableOpacity>
      )}

      {task.status === 'in_progress' && (
        <>
          {/* 照片上传 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>工作照片（至少1张）</Text>
            <View style={styles.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.photoDelete}
                    onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Text style={styles.photoDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity style={styles.photoAdd} onPress={handlePickPhoto} activeOpacity={0.7}>
                  <Text style={styles.photoAddIcon}>📷</Text>
                  <Text style={styles.photoAddText}>添加照片</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, styles.completeBtn, completing && styles.btnDisabled]}
            onPress={handleComplete}
            disabled={completing}
            activeOpacity={0.85}
          >
            {completing
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.actionBtnText}>✅ 完成任务</Text>
            }
          </TouchableOpacity>
        </>
      )}

      {(task.status === 'completed' || task.status === 'cancelled') && (
        <View style={styles.doneBox}>
          <Text style={styles.doneIcon}>{task.status === 'completed' ? '✅' : '❌'}</Text>
          <Text style={styles.doneText}>
            {task.status === 'completed' ? '任务已完成' : '任务已取消'}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#999', fontSize: 16 },
  topBar: {
    backgroundColor: '#1677ff',
    paddingTop: 56,
    paddingBottom: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { marginRight: 12 },
  backText: { color: '#fff', fontSize: 16 },
  topTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  gpsBanner: {
    backgroundColor: '#f6ffed',
    borderBottomWidth: 1,
    borderBottomColor: '#b7eb8f',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
  },
  gpsIndicator: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#52c41a', marginRight: 8,
  },
  gpsText: { color: '#52c41a', fontSize: 13, fontWeight: '500' },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a1a', marginBottom: 12 },
  infoRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  infoLabel: { width: 72, fontSize: 14, color: '#888' },
  infoValue: { flex: 1, fontSize: 14, color: '#1a1a1a' },
  actionBtn: {
    margin: 16,
    marginTop: 20,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  startBtn: { backgroundColor: '#1677ff' },
  completeBtn: { backgroundColor: '#52c41a' },
  btnDisabled: { opacity: 0.6 },
  actionBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { position: 'relative' },
  photo: { width: 90, height: 90, borderRadius: 10 },
  photoDelete: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#ff4d4f', alignItems: 'center', justifyContent: 'center',
  },
  photoDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  photoAdd: {
    width: 90, height: 90, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#d9d9d9', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa',
  },
  photoAddIcon: { fontSize: 24 },
  photoAddText: { fontSize: 11, color: '#999', marginTop: 4 },
  doneBox: {
    alignItems: 'center', padding: 40, margin: 16,
    backgroundColor: '#fff', borderRadius: 14,
  },
  doneIcon: { fontSize: 48, marginBottom: 12 },
  doneText: { fontSize: 18, color: '#666', fontWeight: '500' },
});
