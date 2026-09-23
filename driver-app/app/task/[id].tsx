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
import { colors, space, font, weight, radius, hit } from '../../src/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GPS_UPLOAD_INTERVAL_MS = 10000;

export default function TaskDetailScreen() {
  // 顶部安全区按机型取：原来写死 56，iPhone Pro 的灵动岛是 59~62，标题会被压住
  const insets = useSafeAreaInsets();
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
        <ActivityIndicator size="large" color={colors.accent} />
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
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: space.huge }}>
      {/* 顶部 */}
      <View style={[styles.topBar, { paddingTop: insets.top + space.lg }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={16} color={colors.accent} />
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
            ? <ActivityIndicator color={colors.onAccent} />
            : (
              <View style={styles.actionBtnRow}>
                <Ionicons name="play-circle" size={20} color={colors.onAccent} />
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
                    hitSlop={{ top: space.md, bottom: space.md, left: space.md, right: space.md }}
                    onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Ionicons name="close" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 5 && (
                <TouchableOpacity style={styles.photoAdd} onPress={handlePickPhoto} activeOpacity={0.7}>
                  <Ionicons name="camera" size={24} color={colors.accent} />
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
              ? <ActivityIndicator color={colors.onAccent} />
              : (
                <View style={styles.actionBtnRow}>
                  <Ionicons name="checkmark-done-circle" size={20} color={colors.onAccent} />
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
                ? { backgroundColor: colors.successSoft, borderColor: colors.success }
                : { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
            ]}>
              <Ionicons
                name={task.status === 'completed' ? 'checkmark' : 'close'}
                size={30}
                color={task.status === 'completed' ? colors.success : colors.danger}
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
                <View style={{ marginTop: space.lg }}>
                  <SectionTitle icon="images-outline" text={t('td.donePhotos')} />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }}>
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
      <Ionicons name={icon} size={16} color={colors.accent} style={{ marginRight: space.sm }} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  errorText: { color: colors.textMuted, fontSize: font.base },
  topBar: {
    backgroundColor: colors.bg,
    paddingTop: space.huge + space.lg,
    paddingBottom: space.md,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    minHeight: hit.min,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  backText: { color: colors.accent, fontSize: font.sm, fontWeight: weight.heavy },
  topTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: font.lg, fontWeight: weight.bold },
  gpsBanner: {
    backgroundColor: colors.successSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  gpsIndicator: {
    width: space.sm, height: space.sm, borderRadius: radius.pill, backgroundColor: colors.success,
  },
  gpsText: { color: colors.success, fontSize: font.sm, fontWeight: weight.semibold },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  sectionAccent: { width: 3, height: font.lg, borderRadius: radius.pill, backgroundColor: colors.accent },
  sectionTitle: { fontSize: font.base, fontWeight: weight.bold, color: colors.text, letterSpacing: 0.2 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { width: 96, fontSize: font.sm, color: colors.textMuted, fontWeight: weight.semibold },
  infoValue: { flex: 1, minWidth: 0, fontSize: font.base, color: colors.text, fontWeight: weight.semibold },
  actionBtn: {
    marginHorizontal: space.lg,
    marginTop: space.lg,
    borderRadius: radius.lg,
    padding: space.lg,
    minHeight: hit.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startBtn: { backgroundColor: colors.accent },
  completeBtn: { backgroundColor: colors.success },
  btnDisabled: { opacity: 0.6 },
  actionBtnRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  actionBtnText: { color: colors.onAccent, fontSize: font.lg, fontWeight: weight.heavy },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  photoWrap: { position: 'relative' },
  photo: { width: 88, height: 88, borderRadius: radius.md },
  remotePhoto: { width: 112, height: 112, borderRadius: radius.md },
  photoDelete: {
    position: 'absolute', top: -space.sm, right: -space.sm,
    width: space.xxl, height: space.xxl, borderRadius: radius.pill,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
  },
  photoAdd: {
    width: 88, height: 88, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  photoAddText: { fontSize: font.xs, color: colors.textFaint, marginTop: space.xs },
  doneBox: {
    alignItems: 'center', paddingVertical: space.xxl, paddingHorizontal: space.lg,
    marginHorizontal: space.lg, marginTop: space.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  doneBadge: {
    width: 64, height: 64, borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: space.md,
  },
  doneText: { fontSize: font.lg, color: colors.text, fontWeight: weight.heavy },
  viewerBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '80%' },
  viewerHint: {
    position: 'absolute', bottom: space.huge + space.sm,
    color: colors.textMuted, fontSize: font.sm,
  },
});
