import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, Image, Platform, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { tasksApi, gpsApi, workRecordsApi } from '../../src/api';
import { setActiveTask, setGpsRunning } from '../../src/store/taskSlice';
import type { RootState } from '../../src/store';
import { useLang } from '../../src/i18n';
import { showAppAlert } from '../../src/AppDialog';

const GPS_UPLOAD_INTERVAL_MS = 10000;

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { isGpsRunning, activeTaskId } = useSelector((s: RootState) => s.task);
  const { t } = useLang();
  const role = user?.role || '';
  const canOperate = role === 'driver';

  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [workRecord, setWorkRecord] = useState<any>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const gpsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const data: any = await tasksApi.get(id);
      setTask(data);
      if (data?.status === 'completed') {
        try {
          const wr: any = await workRecordsApi.byTask(id);
          setWorkRecord(wr);
        } catch {
          setWorkRecord(null);
        }
      } else {
        setWorkRecord(null);
      }
    } catch {
      showAppAlert(t('td.error'), t('td.errLoad'));
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
      showAppAlert(t('td.permTitle'), t('td.permMsg'));
      return;
    }
    dispatch(setGpsRunning(true));
    gpsInterval.current = setInterval(async () => {
      try {
        let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
        if (!loc) loc = await Location.getLastKnownPositionAsync();
        if (!loc) return;
        await gpsApi.upload({
          taskId: id,
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          speed: Math.max(0, (loc.coords.speed ?? 0) * 3.6),
          heading: loc.coords.heading ?? undefined,
          accuracy: loc.coords.accuracy ?? undefined,
        });
      } catch (e: any) { if (__DEV__) console.log('[gps] upload failed:', e?.message || e); }
    }, GPS_UPLOAD_INTERVAL_MS);
  }, [id, dispatch]);

  const stopGpsUpload = useCallback(() => {
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    dispatch(setGpsRunning(false));
  }, [dispatch]);

  const handleStart = async () => {
    showAppAlert(t('td.startTitle'), t('td.startConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('td.startOk'), onPress: async () => {
          try {
            setStarting(true);
            await tasksApi.start(id);
            dispatch(setActiveTask({ id, title: task.title, startLocation: task.startLocation, endLocation: task.endLocation, status: 'in_progress' }));
            await startGpsUpload();
            await loadTask();
            showAppAlert(t('td.started'), t('td.startedMsg'));
          } catch (err: any) {
            showAppAlert(t('common.fail'), err.message || t('td.startFailed'));
          } finally {
            setStarting(false);
          }
        },
      },
    ]);
  };

  const handlePickPhoto = async () => {
    if (photos.length >= 5) {
      showAppAlert(t('common.notice'), t('td.max5'));
      return;
    }
    showAppAlert(t('td.pickPhoto'), '', [
      {
        text: t('td.takePhoto'), onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsEditing: false,
          });
          if (!res.canceled && res.assets[0]) {
            setPhotos(prev => [...prev, res.assets[0].uri]);
          }
        },
      },
      {
        text: t('td.fromAlbum'), onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.7,
            allowsMultipleSelection: false,
          });
          if (!res.canceled && res.assets[0]) {
            setPhotos(prev => [...prev, res.assets[0].uri]);
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const handleComplete = async () => {
    if (photos.length === 0) {
      showAppAlert(t('common.notice'), t('td.need1photo'));
      return;
    }
    showAppAlert(t('td.completeTitle'), t('td.completeConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('td.completeOk'), onPress: async () => {
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
            showAppAlert(t('td.completed'), t('td.completedMsg'), [
              { text: t('common.back'), onPress: () => router.back() },
            ]);
          } catch (err: any) {
            showAppAlert(t('td.submitFailed'), err.message || t('td.completeFailed'));
            setCompleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={AMBER} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t('td.notFound')}</Text>
      </View>
    );
  }

  const isActive = task.status === 'in_progress' && activeTaskId === id;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 顶部 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={16} color={AMBER} />
          <Text style={styles.backText}>{t('td.backBtn')}</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle} numberOfLines={1}>{task.title}</Text>
      </View>

      {/* GPS 状态栏 */}
      {canOperate && isActive && (
        <View style={styles.gpsBanner}>
          <View style={styles.gpsIndicator} />
          <Text style={styles.gpsText}>{t('td.gpsRunning')}</Text>
        </View>
      )}

      {/* 任务信息 */}
      <View style={styles.section}>
        <SectionTitle icon="document-text-outline" text={t('td.taskInfo')} />
        <InfoRow label={t('td.client')} value={task.client?.fullName || task.client?.username || '-'} />
        <InfoRow label={t('td.to')} value={task.endLocation} />
        {task.vehiclePlate ? <InfoRow label={t('td.plate')} value={task.vehiclePlate} /> : null}
        {task.cargo && <InfoRow label={t('td.cargo')} value={task.cargo} />}
        {task.cargoWeight && <InfoRow label={t('td.weight')} value={`${task.cargoWeight} ${t('td.ton')}`} />}
        {task.scheduledAt && (
          <InfoRow label={t('td.scheduled')} value={new Date(task.scheduledAt).toLocaleString()} />
        )}
        {task.notes && <InfoRow label={t('td.notes')} value={task.notes} />}
      </View>

      {/* 操作按钮 */}
      {canOperate && task.status === 'assigned' && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.startBtn, starting && styles.btnDisabled]}
          onPress={handleStart}
          disabled={starting}
          activeOpacity={0.85}
        >
          {starting
            ? <ActivityIndicator color="#fff" />
            : (
              <View style={styles.actionBtnRow}>
                <Ionicons name="play-circle" size={20} color="#0B0F1A" />
                <Text style={styles.actionBtnText}>{t('td.startBtn')}</Text>
              </View>
            )
          }
        </TouchableOpacity>
      )}

      {canOperate && task.status === 'in_progress' && (
        <>
          {/* 照片上传 */}
          <View style={styles.section}>
            <SectionTitle icon="camera-outline" text={t('td.photos')} />
            <View style={styles.photoGrid}>
              {photos.map((uri, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photo} />
                  <TouchableOpacity
                    style={styles.photoDelete}
                    onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close" size={13} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity style={styles.photoAdd} onPress={handlePickPhoto} activeOpacity={0.7}>
                  <Ionicons name="camera" size={24} color="rgba(245,158,11,0.9)" />
                  <Text style={styles.photoAddText}>{t('td.addPhoto')}</Text>
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
              : (
                <View style={styles.actionBtnRow}>
                  <Ionicons name="checkmark-done-circle" size={20} color="#0B0F1A" />
                  <Text style={styles.actionBtnText}>{t('td.completeBtn')}</Text>
                </View>
              )
            }
          </TouchableOpacity>
        </>
      )}

      {(task.status === 'completed' || task.status === 'cancelled') && (
        <>
          <View style={styles.doneBox}>
            <View style={[
              styles.doneBadge,
              task.status === 'completed'
                ? { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.4)' }
                : { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.4)' },
            ]}>
              <Ionicons
                name={task.status === 'completed' ? 'checkmark' : 'close'}
                size={30}
                color={task.status === 'completed' ? '#22c55e' : '#ef4444'}
              />
            </View>
            <Text style={styles.doneText}>
              {task.status === 'completed' ? t('td.taskDone') : t('td.taskCancelled')}
            </Text>
          </View>
          {task.status === 'completed' && workRecord && (
            <View style={styles.section}>
              <SectionTitle icon="time-outline" text={t('td.workRecord')} />
              <InfoRow label={t('td.startTime')} value={workRecord.startTime ? new Date(workRecord.startTime).toLocaleString() : '—'} />
              <InfoRow label={t('td.endTime')} value={workRecord.endTime ? new Date(workRecord.endTime).toLocaleString() : '—'} />
              <InfoRow label={t('td.duration')} value={workRecord.finalDuration != null ? `${Math.floor(workRecord.finalDuration / 60)}h ${workRecord.finalDuration % 60}m` : '—'} />
              {workRecord.completionNotes ? <InfoRow label={t('td.notes')} value={workRecord.completionNotes} /> : null}
              {Array.isArray(workRecord.imageUrls) && workRecord.imageUrls.length > 0 ? (
                <View style={{ marginTop: 16 }}>
                  <SectionTitle icon="images-outline" text={t('td.donePhotos')} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {workRecord.imageUrls.map((u: string, i: number) => (
                      <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => setViewerUrl(u)}>
                        <Image source={{ uri: u }} style={styles.remotePhoto} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}
            </View>
          )}
        </>
      )}

      {/* 图片全屏查看 */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={styles.viewerBackdrop} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {viewerUrl ? <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" /> : null}
          <Text style={styles.viewerHint}>{t('td.tapClose')}</Text>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

function SectionTitle({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionAccent} />
      <Ionicons name={icon} size={16} color={AMBER} style={{ marginRight: 7 }} />
      <Text style={styles.sectionTitle}>{text}</Text>
    </View>
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

const AMBER = '#F59E0B';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0F1A' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0B0F1A' },
  errorText: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  topBar: {
    backgroundColor: '#0B0F1A',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    marginRight: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  backText: { color: AMBER, fontSize: 14, fontWeight: '800' },
  topTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  gpsBanner: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34,197,94,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
  },
  gpsIndicator: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e', marginRight: 8,
  },
  gpsText: { color: '#22c55e', fontSize: 13, fontWeight: '600' },
  section: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: AMBER, marginRight: 9 },
  sectionTitle: { fontSize: 15.5, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  infoLabel: { width: 92, fontSize: 13.5, color: 'rgba(148,163,184,0.85)', fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 14.5, color: '#f1f5f9', fontWeight: '600' },
  actionBtn: {
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  startBtn: {
    backgroundColor: AMBER,
    shadowColor: AMBER, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  completeBtn: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  btnDisabled: { opacity: 0.6 },
  actionBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionBtnText: { color: '#0B0F1A', fontSize: 17, fontWeight: '800' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { position: 'relative' },
  photo: { width: 90, height: 90, borderRadius: 12 },
  remotePhoto: { width: 110, height: 110, borderRadius: 12 },
  photoDelete: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center',
  },
  photoDeleteText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  photoAdd: {
    width: 90, height: 90, borderRadius: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)',
  },
  photoAddIcon: { fontSize: 24 },
  photoAddText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 },
  doneBox: {
    alignItems: 'center', paddingVertical: 22, paddingHorizontal: 16,
    marginHorizontal: 14, marginTop: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.55)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  doneBadge: {
    width: 60, height: 60, borderRadius: 30,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  doneText: { fontSize: 16.5, color: '#fff', fontWeight: '800' },
  viewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  viewerHint: {
    position: 'absolute', bottom: 50,
    color: 'rgba(255,255,255,0.55)', fontSize: 13,
  },
});
