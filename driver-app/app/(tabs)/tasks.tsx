import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Modal, TextInput, ScrollView, Image,
  DeviceEventEmitter, AppState,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { gpsApi, gpsDevicesApi, notificationsApi, tasksApi, usersApi } from '../../src/api';
import { setActiveTask, setGpsRunning } from '../../src/store/taskSlice';
import type { RootState } from '../../src/store';
import { useLang } from '../../src/i18n';
import { showAppAlert } from '../../src/AppDialog';
import { startBackgroundGps, stopBackgroundGps } from '../../src/backgroundLocation';

const AMBER = '#F59E0B';
const AMBER_DARK = '#D97706';
const GPS_UPLOAD_INTERVAL_MS = 10000;

const STATUS_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'rgba(250, 204, 21, 0.15)', text: '#eab308', border: 'rgba(250, 204, 21, 0.3)' },
  assigned: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' },
  in_progress: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e', border: 'rgba(34, 197, 94, 0.3)' },
  completed: { bg: 'rgba(107, 114, 128, 0.15)', text: '#6b7280', border: 'rgba(107, 114, 128, 0.3)' },
  cancelled: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
};

export default function TasksScreen() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user } = useSelector((s: RootState) => s.auth);
  const { t, lang } = useLang();
  const role = user?.role || '';
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [pickOpen, setPickOpen] = useState<null | 'client' | 'driver'>(null);
  const [pickSearch, setPickSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [endLocation, setEndLocation] = useState('');
  const [cargo, setCargo] = useState('');
  const [cargoWeight, setCargoWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [assigningTask, setAssigningTask] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [acceptTask, setAcceptTask] = useState<any>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [knownPlates, setKnownPlates] = useState<Array<{ plate: string; name?: string | null }>>([]);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [driverFilter, setDriverFilter] = useState<'all' | 'assigned' | 'in_progress' | 'completed'>('all');
  const [searchText, setSearchText] = useState('');
  const [adminFilter, setAdminFilter] = useState<'all' | 'in_progress' | 'completed'>('all');
  const [todayOnly, setTodayOnly] = useState(false);
  const [completeTask, setCompleteTask] = useState<any>(null);
  const [completePhotos, setCompletePhotos] = useState<string[]>([]);
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null);
  const gpsInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsResumedFor = useRef<string | null>(null);

  const load = useCallback(async () => {
    // 已退出登录(无角色)就别再拉取，否则会因没有 token 失败、在登录页弹「加载失败」
    if (!role) { setLoading(false); setRefreshing(false); return; }
    try {
      const data: any = await tasksApi.list();
      setTasks(Array.isArray(data) ? data : []);
      try {
        const [items, unread]: any = await Promise.all([
          notificationsApi.list(),
          notificationsApi.unreadCount(),
        ]);
        setNotifications(Array.isArray(items) ? items : []);
        setUnreadCount(Number(unread) || 0);
      } catch {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch {
      showAppAlert(t('tasks.loadFailed'), t('tasks.loadFailedSub'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => { load(); }, [load]);

  // Real-time: refresh the task list the instant a task is dispatched (socket push).
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('tasks:refresh', () => { load(); });
    return () => sub.remove();
  }, [load]);

  useEffect(() => {
    return () => {
      if (gpsInterval.current) clearInterval(gpsInterval.current);
    };
  }, []);

  const onRefresh = () => { setRefreshing(true); load(); };

  // 计划执行时间：Android 先选日期再选时间，合并成完整时间。
  const onSchedPickerChange = (event: any, selected?: Date) => {
    if (event?.type === 'dismissed' || !selected) { setPicker(null); return; }
    if (picker === 'date') {
      setTempDate(selected);
      setPicker('time');
      return;
    }
    const d = new Date(tempDate);
    d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    setScheduledAt(d);
    setPicker(null);
  };

  const getToday = () => {
    const now = new Date();
    return now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    });
  };

  const getInProgressCount = () => tasks.filter(t => t.status === 'in_progress').length;
  const getCompletedCount = () => tasks.filter(t => t.status === 'completed').length;
  const title = role === 'driver' ? t('tasks.titleDriver') : (role === 'client' ? t('tasks.titleClient') : t('tasks.titleManage'));
  const canManage = role === 'admin' || role === 'dispatcher';

  const getPersonName = (person: any) =>
    person?.fullName || person?.username || person?.email || '-';

  const uploadLocationOnce = async (taskId: string) => {
    // 优先实时定位；拿不到（室内/信号弱）就用最后已知位置，保证仍能上报，地图不掉点
    let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (!loc) loc = await Location.getLastKnownPositionAsync();
    if (!loc) return;
    await gpsApi.upload({
      taskId,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      speed: Math.max(0, (loc.coords.speed ?? 0) * 3.6),
      heading: loc.coords.heading ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
    });
  };

  const ensureLocationPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      showAppAlert(t('d.locPerm'), t('d.locPermMsg'));
      return false;
    }
    return true;
  };

  const startGpsUpload = async (taskId: string) => {
    if (gpsInterval.current) { clearInterval(gpsInterval.current); gpsInterval.current = null; }
    dispatch(setGpsRunning(true));
    // 先传一次，立刻有点
    try { await uploadLocationOnce(taskId); } catch (e: any) {
      if (__DEV__) console.log('[gps] first upload failed:', e?.message || e);
    }
    // 优先后台定位（锁屏/切后台也上报）
    const bgOk = await startBackgroundGps(taskId);
    if (bgOk) {
      if (__DEV__) console.log('[gps] background location started');
      return true; // 后台服务接管，不再开前台定时器
    }
    // 回退：前台定时上报（如 Expo Go 不支持后台时）
    if (__DEV__) console.log('[gps] background not available, using foreground interval');
    gpsInterval.current = setInterval(async () => {
      try {
        await uploadLocationOnce(taskId);
      } catch (e: any) {
        if (__DEV__) console.log('[gps] upload failed:', e?.message || e);
      }
    }, GPS_UPLOAD_INTERVAL_MS);
    return true;
  };

  const stopGpsUpload = () => {
    if (gpsInterval.current) {
      clearInterval(gpsInterval.current);
      gpsInterval.current = null;
    }
    dispatch(setGpsRunning(false));
    stopBackgroundGps();
    gpsResumedFor.current = null;
  };

  // 自动恢复 GPS：司机重开 App / 回到任务页时，若有「进行中」任务但还没在上报，就自动开始上报。
  // 不用再手动重新接受，修掉「重开 App 后 GPS 不传」。
  useEffect(() => {
    if (role !== 'driver') return;
    const active = tasks.find((tk: any) => tk.status === 'in_progress');
    if (!active) return;
    if (gpsResumedFor.current === active.id) return; // 已为该任务启动过
    gpsResumedFor.current = active.id;
    dispatch(setActiveTask({
      id: active.id,
      title: active.title,
      startLocation: active.startLocation,
      endLocation: active.endLocation,
      status: 'in_progress',
    }));
    startGpsUpload(active.id);
  }, [tasks, role]);

  // 回到前台时,若有进行中任务,确保后台定位仍在跑。
  // 这样「定位卡住时重进 App 即可恢复」——不必重新登录(startBackgroundGps 幂等,在跑则不重复启动)。
  useEffect(() => {
    if (role !== 'driver') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const active = tasks.find((tk: any) => tk.status === 'in_progress');
      if (active) startBackgroundGps(active.id);
    });
    return () => sub.remove();
  }, [tasks, role]);

  const openAcceptTask = (task: any) => {
    setAcceptTask(task);
    setVehiclePlate('');
  };

  const handleConfirmTaskInfo = () => {
    setPlateOpen(true);
    // 拉一次已登记车牌：车上装了定位器的车可以直接点选，车牌必须和登记的一致轨迹才对得上
    gpsDevicesApi.plates()
      .then((data: any) => setKnownPlates(Array.isArray(data) ? data : []))
      .catch(() => setKnownPlates([]));
  };

  const handleStartAcceptedTask = async () => {
    if (!acceptTask) return;
    if (!vehiclePlate.trim()) {
      showAppAlert(t('common.notice'), t('d.platePrompt'));
      return;
    }
    try {
      setStartingTaskId(acceptTask.id);
      const gpsReady = await ensureLocationPermission();
      if (!gpsReady) return;
      await tasksApi.start(acceptTask.id, vehiclePlate.trim());
      await startGpsUpload(acceptTask.id);
      dispatch(setActiveTask({
        id: acceptTask.id,
        title: acceptTask.title,
        startLocation: acceptTask.startLocation,
        endLocation: acceptTask.endLocation,
        status: 'in_progress',
      }));
      setAcceptTask(null);
      setPlateOpen(false);
      setVehiclePlate('');
      await load();
      showAppAlert(
        t('d.accepted'),
        lang === 'zh'
          ? `车牌 ${vehiclePlate.trim()} 已确认，GPS定位已启动`
          : `Plate ${vehiclePlate.trim()} confirmed, GPS tracking started`,
      );
    } catch (e: any) {
      showAppAlert(t('d.acceptFailed'), e?.message || t('d.acceptFailedMsg'));
    } finally {
      setStartingTaskId(null);
    }
  };

  const openNotification = async (item: any) => {
    try {
      if (!item.isRead) await notificationsApi.markRead(item.id);
      setNotificationsOpen(false);
      await load();
      const taskId = item?.meta?.taskId;
      if (role === 'driver' && taskId) {
        const target = tasks.find((task) => task.id === taskId);
        if (target?.status === 'assigned') openAcceptTask(target);
        if (target?.status === 'in_progress') openCompleteTask(target);
        return;
      }
      if (taskId) router.push(`/task/${taskId}`);
    } catch {
      showAppAlert(t('common.notice'), t('tasks.notifOpenFail'));
    }
  };

  const openCompleteTask = (task: any) => {
    setCompleteTask(task);
    setCompletePhotos([]);
  };

  const handleTakeCompletePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showAppAlert(t('d.camPerm'), t('d.camPermMsg'));
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.72,
      allowsEditing: false,
    });
    if (!res.canceled && res.assets[0]) {
      setCompletePhotos(prev => [...prev, res.assets[0].uri].slice(0, 5));
    }
  };

  const handleSubmitCompleteTask = async () => {
    if (!completeTask) return;
    if (completePhotos.length === 0) {
      showAppAlert(t('common.notice'), t('d.need1'));
      return;
    }
    try {
      setCompletingTaskId(completeTask.id);
      const formData = new FormData();
      completePhotos.forEach((uri, index) => {
        (formData as any).append('images', {
          uri,
          name: `completion_${index + 1}.jpg`,
          type: 'image/jpeg',
        } as any);
      });
      await tasksApi.complete(completeTask.id, formData);
      stopGpsUpload();
      dispatch(setActiveTask(null));
      setCompleteTask(null);
      setCompletePhotos([]);
      await load();
      showAppAlert(t('d.finishDone'), t('d.finishDoneMsg'));
    } catch (e: any) {
      showAppAlert(t('td.submitFailed'), e?.message || t('td.completeFailed'));
    } finally {
      setCompletingTaskId(null);
    }
  };

  const OVERDUE_GRACE_MS = 5 * 60 * 1000; // 逾期 5 分钟内不显示「已逾期」
  const isDriverTaskOverdue = (task: any) => {
    if (!task?.scheduledAt) return false;
    // 已完成/已取消不算；接受任务后(进行中)也不算——接受即视为已响应，超时 5 分钟内接受不算逾期。
    if (['completed', 'cancelled', 'in_progress'].includes(task.status)) return false;
    return new Date(task.scheduledAt).getTime() + OVERDUE_GRACE_MS < Date.now();
  };

  const isTodayTask = (task: any) => {
    if (!task?.scheduledAt) return false;
    const d = new Date(task.scheduledAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  };

  const formatDriverDate = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toISOString().slice(0, 10);
  };

  const formatDriverDateTime = (value?: string) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const getDriverStatusText = (task: any) => {
    if (isDriverTaskOverdue(task)) return t('d.sOverdue');
    if (task.status === 'assigned') return t('d.sToAccept');
    if (task.status === 'in_progress') return t('d.sInProgress');
    if (task.status === 'completed') return t('d.fCompleted');
    if (task.status === 'cancelled') return t('d.sCancelled');
    return t('d.sToAccept');
  };

  const getDriverAccent = (task: any) => {
    if (isDriverTaskOverdue(task)) return '#ef4444';
    if (task.status === 'assigned') return AMBER;
    if (task.status === 'in_progress') return '#3b82f6';
    if (task.status === 'completed') return '#22c55e';
    return '#64748b';
  };

  const driverName = user?.fullName || user?.username || t('d.driverFallback');
  const driverInProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const driverCompletedCount = tasks.filter(t => t.status === 'completed').length;
  const driverOverdueCount = tasks.filter(isDriverTaskOverdue).length;
  const driverSubtitle = driverInProgressCount > 0
    ? (lang === 'zh' ? `今日有 ${driverInProgressCount} 个进行中任务` : `${driverInProgressCount} task(s) in progress today`)
    : t('d.subIdle');
  const driverFilterItems = [
    { key: 'all' as const, label: t('d.fAll') },
    { key: 'assigned' as const, label: t('d.fAssigned') },
    { key: 'in_progress' as const, label: t('d.fInProgress') },
    { key: 'completed' as const, label: t('d.fCompleted') },
  ];
  const filteredDriverTasks = tasks.filter((task) => {
    if (todayOnly && !isTodayTask(task)) return false;
    const q = searchText.trim().toLowerCase();
    const matchesSearch = !q || [
      task.title,
      task.cargo,
      task.endLocation,
      task.startLocation,
      task.client?.fullName,
      task.client?.username,
      task.client?.email,
      formatDriverDate(task.scheduledAt),
      formatDriverDate(task.createdAt),
    ].some((value) => String(value || '').toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (driverFilter === 'all') return true;
    if (driverFilter === 'completed') return task.status === 'completed';
    return task.status === driverFilter;
  });

  // Admin/client list: today toggle + status filter + search.
  const todayCount = tasks.filter(isTodayTask).length;
  const adminFilterItems = [
    { key: 'all' as const, label: t('d.fAll') },
    { key: 'in_progress' as const, label: t('tasks.inProgress') },
    { key: 'completed' as const, label: t('tasks.completed') },
  ];
  const filteredAdminTasks = tasks.filter((task) => {
    if (todayOnly && !isTodayTask(task)) return false;
    if (adminFilter === 'in_progress' && task.status !== 'in_progress') return false;
    if (adminFilter === 'completed' && task.status !== 'completed') return false;
    const q = searchText.trim().toLowerCase();
    if (!q) return true;
    return [
      task.title,
      task.cargo,
      task.endLocation,
      task.startLocation,
      task.client?.fullName,
      task.client?.username,
      task.client?.email,
      task.driver?.fullName,
      task.driver?.username,
      formatDriverDate(task.scheduledAt),
      formatDriverDate(task.createdAt),
    ].some((value) => String(value || '').toLowerCase().includes(q));
  });

  // 发布任务表单:必填是否齐全(控制按钮态) + 自动任务名预览(客户-年月日-序号)
  const createFormValid = !!(selectedClient?.id && selectedDriver?.id && endLocation.trim() && cargo.trim() && cargoWeight.trim() && scheduledAt);
  const taskNamePreview = (() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const sameDay = tasks.filter((tk: any) => typeof tk?.title === 'string' && tk.title.includes(`-${ymd}-`)).length;
    const clientName = selectedClient ? (selectedClient.fullName || selectedClient.username) : (lang === 'zh' ? '客户' : 'Client');
    return `${lang === 'zh' ? '任务名' : 'Task'}: ${clientName}-${ymd}-${String(sameDay + 1).padStart(3, '0')}`;
  })();

  // 选择器列表:支持按姓名/账号/邮箱搜索
  const pickList = (pickOpen === 'client' ? clients : drivers).filter((it: any) => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return true;
    return [it.fullName, it.username, it.email].some((v) => String(v || '').toLowerCase().includes(q));
  });

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingSpinner}>
          <ActivityIndicator size="large" color={AMBER} />
        </View>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (role === 'driver') {
    return (
      <View style={styles.driverPage}>
        <View style={styles.driverHeader}>
              <Text style={styles.driverGreeting}>{t('d.greetingPrefix')}{driverName}</Text>
              <Text style={styles.driverSubTitle}>{driverSubtitle}</Text>

              <View style={styles.driverStatsGrid}>
                <TouchableOpacity
                  style={[styles.driverStatCard, styles.driverStatBlue, todayOnly && { borderColor: AMBER, backgroundColor: 'rgba(245,158,11,0.1)' }]}
                  onPress={() => setTodayOnly(v => !v)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.driverStatValue, { color: todayOnly ? AMBER : '#60a5fa' }]}>{todayOnly ? todayCount : tasks.length}</Text>
                  <Text style={styles.driverStatLabel}>{todayOnly ? t('d.statToday') : t('d.statTotal')}</Text>
                </TouchableOpacity>
                <View style={[styles.driverStatCard, styles.driverStatAmber]}>
                  <Text style={[styles.driverStatValue, { color: AMBER }]}>{driverInProgressCount}</Text>
                  <Text style={styles.driverStatLabel}>{t('d.statActive')}</Text>
                </View>
                <View style={[styles.driverStatCard, styles.driverStatRed]}>
                  <Text style={[styles.driverStatValue, { color: '#ff4d4f' }]}>{driverOverdueCount}</Text>
                  <Text style={styles.driverStatLabel}>{t('d.statOverdue')}</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.driverFilterRow}
              >
                {driverFilterItems.map((item) => {
                  const active = driverFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.driverFilterPill, active && styles.driverFilterPillActive]}
                      onPress={() => setDriverFilter(item.key)}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.driverFilterText, active && styles.driverFilterTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.driverSearchBox}>
                <Ionicons name="search" size={17} color="rgba(148,163,184,0.8)" style={{ marginRight: 10 }} />
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  style={styles.driverSearchInput}
                  placeholder={t('d.search')}
                  placeholderTextColor="rgba(148,163,184,0.7)"
                />
              </View>
            </View>
        <FlatList
          data={filteredDriverTasks}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.driverListContentScroll,
            filteredDriverTasks.length === 0 && { flexGrow: 1 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={AMBER}
              colors={[AMBER]}
            />
          }
          ListEmptyComponent={
            <View style={styles.driverEmptyBox}>
              <View style={styles.driverEmptyIcon}>
                <Ionicons name="clipboard-outline" size={38} color={AMBER} />
              </View>
              <Text style={styles.driverEmptyTitle}>{t('d.emptyTitle')}</Text>
              <Text style={styles.driverEmptySub}>{t('d.emptySub')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const accent = getDriverAccent(item);
            const statusText = getDriverStatusText(item);
            const clientName = getPersonName(item.client);
            return (
              <TouchableOpacity
                style={[styles.driverTaskCard, { borderLeftColor: accent }]}
                activeOpacity={1}
              >
                <View style={[styles.driverStatusBadge, styles.driverStatusBadgeAbs, { backgroundColor: `${accent}22` }]}>
                  <Text style={[styles.driverStatusText, { color: accent }]}>{statusText}</Text>
                </View>

                <Text style={[styles.driverTaskTitle, styles.driverTaskTitlePad]} numberOfLines={1}>{item.title || t('d.taskFallback')}</Text>
                <Text style={styles.driverTaskMeta} numberOfLines={1}>
                  {(item.cargo || t('d.cargoFallback'))}{clientName !== '-' ? ` · ${clientName}` : ''}
                </Text>
                {!!item.endLocation && (
                  <Text style={styles.driverTaskRoute} numberOfLines={1}>{item.endLocation}</Text>
                )}

                <View style={styles.driverTaskDivider} />

                <View style={styles.driverTaskBottom}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.driverInfoLine}>
                      <Ionicons name="time-outline" size={14} color="rgba(148,163,184,0.95)" />
                      <Text style={styles.driverTaskDate}>{t('d.due')} {formatDriverDateTime(item.scheduledAt)}</Text>
                    </View>
                    <View style={[styles.driverInfoLine, { marginTop: 6 }]}>
                      <Ionicons name="create-outline" size={13} color="rgba(100,116,139,0.8)" />
                      <Text style={styles.driverTaskCreated}>{t('d.createdAt')} {formatDriverDateTime(item.createdAt)}</Text>
                    </View>
                  </View>
                  {item.cargoWeight ? (
                    <View style={styles.driverAmountPill}>
                      <Text style={styles.driverAmountValue}>{item.cargoWeight}</Text>
                      <Text style={styles.driverAmountUnit}>{t('tasks.ton')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.driverTaskAmount}>—</Text>
                  )}
                </View>

                {item.status === 'assigned' && (
                  <TouchableOpacity
                    style={[styles.driverAcceptInline, startingTaskId === item.id && styles.btnDisabled]}
                    onPress={() => openAcceptTask(item)}
                    disabled={startingTaskId === item.id}
                    activeOpacity={0.85}
                  >
                    {startingTaskId === item.id
                      ? <ActivityIndicator color="#93c5fd" />
                      : <Text style={styles.driverAcceptInlineText}>{t('d.accept')}</Text>}
                  </TouchableOpacity>
                )}
                {item.status === 'in_progress' && (
                  <TouchableOpacity
                    style={[styles.driverCompleteInline, completingTaskId === item.id && styles.btnDisabled]}
                    onPress={() => openCompleteTask(item)}
                    disabled={completingTaskId === item.id}
                    activeOpacity={0.85}
                  >
                    {completingTaskId === item.id
                      ? <ActivityIndicator color="#bbf7d0" />
                      : <Text style={styles.driverCompleteInlineText}>{t('d.finish')}</Text>}
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />

        <Modal visible={!!acceptTask && !plateOpen} animationType="fade" transparent onRequestClose={() => setAcceptTask(null)}>
          <View style={styles.pickWrap}>
            <View style={styles.acceptCard}>
              <View style={styles.pickHeader}>
                <Text style={styles.pickHeaderTitle}>{t('d.acceptConfirm')}</Text>
                <TouchableOpacity onPress={() => setAcceptTask(null)} style={styles.modalClose} activeOpacity={0.8}>
                  <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
              </View>
              {acceptTask && (
                <View style={styles.acceptContent}>
                  <Text style={styles.acceptTitle} numberOfLines={2}>{acceptTask.title}</Text>
                  <View style={styles.acceptInfoBox}>
                    <View style={styles.acceptInfoRow}>
                      <Text style={styles.acceptInfoLabel}>{t('d.client')}</Text>
                      <Text style={styles.acceptInfoValue}>{getPersonName(acceptTask.client)}</Text>
                    </View>
                    <View style={styles.acceptInfoRow}>
                      <Text style={styles.acceptInfoLabel}>{t('d.to')}</Text>
                      <Text style={styles.acceptInfoValue}>{acceptTask.endLocation || '-'}</Text>
                    </View>
                    <View style={styles.acceptInfoRow}>
                      <Text style={styles.acceptInfoLabel}>{t('d.cargo')}</Text>
                      <Text style={styles.acceptInfoValue}>{acceptTask.cargo || '-'}</Text>
                    </View>
                    <View style={styles.acceptInfoRow}>
                      <Text style={styles.acceptInfoLabel}>{t('d.weight')}</Text>
                      <Text style={styles.acceptInfoValue}>
                        {acceptTask.cargoWeight ? `${acceptTask.cargoWeight} ${t('td.ton')}` : '-'}
                      </Text>
                    </View>
                    <View style={styles.acceptInfoRow}>
                      <Text style={styles.acceptInfoLabel}>{t('d.scheduled')}</Text>
                      <Text style={styles.acceptInfoValue}>
                        {acceptTask.scheduledAt ? new Date(acceptTask.scheduledAt).toLocaleString() : '-'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.acceptActions}>
                    <TouchableOpacity
                      style={[styles.modalBtnSecondary, { flex: 1 }]}
                      onPress={() => setAcceptTask(null)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, { flex: 1, marginTop: 0, marginBottom: 0 }]}
                      onPress={handleConfirmTaskInfo}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.modalBtnText}>{t('d.confirm')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Modal>

        <Modal visible={plateOpen} animationType="fade" transparent onRequestClose={() => setPlateOpen(false)}>
          <View style={styles.pickWrap}>
            <View style={styles.acceptCard}>
              <View style={styles.pickHeader}>
                <Text style={styles.pickHeaderTitle}>{t('d.plateTitle')}</Text>
                <TouchableOpacity onPress={() => setPlateOpen(false)} style={styles.modalClose} activeOpacity={0.8}>
                  <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
              </View>
              <View style={styles.acceptContent}>
                <Text style={styles.plateHint}>{t('d.plateHint')}</Text>
                <TextInput
                  value={vehiclePlate}
                  onChangeText={setVehiclePlate}
                  style={styles.plateInput}
                  placeholder={t('d.platePh')}
                  placeholderTextColor="rgba(255,255,255,0.28)"
                  autoCapitalize="characters"
                />
                {knownPlates.length > 0 && (
                  <View style={styles.platePickBox}>
                    <Text style={styles.platePickLabel}>
                      {lang === 'zh' ? '装了定位器的车（点一下自动填）' : 'Vehicles with a tracker (tap to fill)'}
                    </Text>
                    <View style={styles.platePickRow}>
                      {knownPlates.map((item) => {
                        const active = vehiclePlate.trim().toUpperCase().replace(/[\s-]/g, '')
                          === item.plate.toUpperCase().replace(/[\s-]/g, '');
                        return (
                          <TouchableOpacity
                            key={item.plate}
                            style={[styles.plateChipBtn, active && styles.plateChipBtnActive]}
                            onPress={() => setVehiclePlate(item.plate)}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="car-outline" size={14} color={active ? '#111827' : AMBER} />
                            <Text style={[styles.plateChipBtnText, active && styles.plateChipBtnTextActive]}>
                              {item.plate}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
                <TouchableOpacity
                  style={[styles.modalBtn, startingTaskId && styles.btnDisabled]}
                  onPress={handleStartAcceptedTask}
                  disabled={!!startingTaskId}
                  activeOpacity={0.85}
                >
                  {startingTaskId
                    ? <ActivityIndicator color="#000" />
                    : <Text style={styles.modalBtnText}>{t('d.plateConfirm')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={!!completeTask} animationType="fade" transparent onRequestClose={() => setCompleteTask(null)}>
          <View style={styles.pickWrap}>
            <View style={styles.acceptCard}>
              <View style={styles.pickHeader}>
                <Text style={styles.pickHeaderTitle}>{t('d.finishTitle')}</Text>
                <TouchableOpacity
                  onPress={() => {
                    setCompleteTask(null);
                    setCompletePhotos([]);
                  }}
                  style={styles.modalClose}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
              </View>
              <View style={styles.acceptContent}>
                <Text style={styles.acceptTitle} numberOfLines={2}>{completeTask?.title || t('d.taskFallback')}</Text>
                <Text style={styles.completeHint}>{t('d.completeHint')}</Text>

                <View style={styles.completePhotoGrid}>
                  {completePhotos.map((uri, index) => (
                    <View key={uri} style={styles.completePhotoWrap}>
                      <Image source={{ uri }} style={styles.completePhoto} />
                      <TouchableOpacity
                        style={styles.completePhotoRemove}
                        onPress={() => setCompletePhotos(prev => prev.filter((_, i) => i !== index))}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="close" size={13} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {completePhotos.length < 5 && (
                    <TouchableOpacity style={styles.completePhotoAdd} onPress={handleTakeCompletePhoto} activeOpacity={0.85}>
                      <Ionicons name="camera-outline" size={26} color="rgba(226,232,240,0.8)" style={{ marginBottom: 6 }} />
                      <Text style={styles.completePhotoAddText}>{t('d.takePhoto')}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.completeSubmitBtn, completingTaskId && styles.btnDisabled]}
                  onPress={handleSubmitCompleteTask}
                  disabled={!!completingTaskId}
                  activeOpacity={0.85}
                >
                  {completingTaskId
                    ? <ActivityIndicator color="#052e16" />
                    : <Text style={styles.completeSubmitText}>{t('d.submitFinish')}</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={notificationsOpen} animationType="slide" transparent onRequestClose={() => setNotificationsOpen(false)}>
          <View style={styles.pickWrap}>
            <View style={styles.pickCard}>
              <View style={styles.pickHeader}>
                <Text style={styles.pickHeaderTitle}>{t('tasks.notifTitle0')}</Text>
                <TouchableOpacity onPress={() => setNotificationsOpen(false)} style={styles.modalClose} activeOpacity={0.8}>
                  <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={notifications}
                keyExtractor={(it: any) => it.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.notificationItem, !item.isRead && styles.notificationItemUnread]}
                    onPress={() => openNotification(item)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.notificationItemHeader}>
                      <Text style={styles.notificationItemTitle} numberOfLines={1}>{item.title}</Text>
                      {!item.isRead && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notificationItemBody} numberOfLines={2}>{item.content}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={{ padding: 24 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>{t('tasks.noNotif')}</Text>
                  </View>
                }
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSub}>{getToday()}</Text>
          </View>
          <TouchableOpacity style={styles.headerIconBtn} onPress={load} activeOpacity={0.8}>
            <Ionicons name="refresh" size={19} color={AMBER} />
          </TouchableOpacity>
        </View>

        <View style={[styles.driverStatsGrid, { marginTop: 16, marginBottom: 0 }]}>
          <TouchableOpacity
            style={[styles.driverStatCard, styles.driverStatBlue, todayOnly && { borderColor: AMBER, backgroundColor: 'rgba(245,158,11,0.1)' }]}
            onPress={() => setTodayOnly(v => !v)}
            activeOpacity={0.85}
          >
            <Text style={[styles.driverStatValue, { color: todayOnly ? AMBER : '#60a5fa' }]}>{todayOnly ? todayCount : tasks.length}</Text>
            <Text style={styles.driverStatLabel}>{todayOnly ? t('d.statToday') : t('d.statTotal')}</Text>
          </TouchableOpacity>
          <View style={[styles.driverStatCard, styles.driverStatAmber]}>
            <Text style={[styles.driverStatValue, { color: AMBER }]}>{getInProgressCount()}</Text>
            <Text style={styles.driverStatLabel}>{t('tasks.inProgress')}</Text>
          </View>
          <View style={[styles.driverStatCard, { borderColor: 'rgba(34,197,94,0.35)' }]}>
            <Text style={[styles.driverStatValue, { color: '#22c55e' }]}>{getCompletedCount()}</Text>
            <Text style={styles.driverStatLabel}>{t('tasks.completed')}</Text>
          </View>
        </View>
        {canManage && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={async () => {
              try {
                const [c, d]: any = await Promise.all([usersApi.clients(), usersApi.drivers()]);
                setClients(Array.isArray(c) ? c : []);
                setDrivers(Array.isArray(d) ? d : []);
              } catch {
                setClients([]);
                setDrivers([]);
              }
              setSelectedClient(null);
              setSelectedDriver(null);
              setEndLocation('');
              setCargo('');
              setCargoWeight('');
              setNotes('');
              setScheduledAt(null);
              setCreateOpen(true);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="add-circle" size={19} color="#000" />
            <Text style={styles.createBtnText}>{t('tasks.createTask')}</Text>
          </TouchableOpacity>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 14 }}
          contentContainerStyle={styles.driverFilterRow}
        >
          {adminFilterItems.map((item) => {
            const active = adminFilter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.driverFilterPill, active && styles.driverFilterPillActive]}
                onPress={() => setAdminFilter(item.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.driverFilterText, active && styles.driverFilterTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={[styles.driverSearchBox, { marginBottom: 0 }]}>
          <Ionicons name="search" size={17} color="rgba(148,163,184,0.8)" style={{ marginRight: 10 }} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            style={styles.driverSearchInput}
            placeholder={t('d.search')}
            placeholderTextColor="rgba(148,163,184,0.7)"
          />
        </View>
      </View>

      {/* Task List */}
      <FlatList
        data={filteredAdminTasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={tasks.length === 0 ? styles.empty : { padding: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AMBER}
            colors={[AMBER]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="clipboard-outline" size={36} color={AMBER} />
            </View>
            <Text style={styles.emptyText}>{t('tasks.emptyTitle')}</Text>
            <Text style={styles.emptySub}>{t('tasks.emptySub')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusStyle = STATUS_COLOR[item.status] || STATUS_COLOR.pending;
          return (
            <TouchableOpacity
              style={[styles.card, { borderLeftWidth: 4, borderLeftColor: statusStyle.text }]}
              onPress={() => {
                if (role === 'driver' && item.status === 'assigned') {
                  openAcceptTask(item);
                  return;
                }
                if (item.status === 'in_progress' || item.status === 'completed' || canManage) {
                  router.push(`/task/${item.id}`);
                }
              }}
              activeOpacity={0.85}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
                  <Text style={[styles.badgeText, { color: statusStyle.text }]}>
                    {t('status.' + item.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.destRow}>
                <Ionicons name="location" size={15} color="#ef4444" />
                <Text style={styles.destText} numberOfLines={1}>{item.endLocation}</Text>
              </View>

              <View style={styles.cardMetaGrid}>
                <View style={styles.cardMetaItem}>
                  <Ionicons name="business-outline" size={13} color="rgba(148,163,184,0.85)" />
                  <Text style={styles.cardMetaText} numberOfLines={1}>{getPersonName(item.client)}</Text>
                </View>
                <View style={styles.cardMetaItem}>
                  <Ionicons name="person-outline" size={13} color="rgba(148,163,184,0.85)" />
                  <Text style={styles.cardMetaText} numberOfLines={1}>{getPersonName(item.driver)}</Text>
                </View>
                <View style={[styles.cardMetaItem, { flexBasis: '100%' }]}>
                  <Ionicons name="time-outline" size={13} color="rgba(148,163,184,0.85)" />
                  <Text style={styles.cardMetaText} numberOfLines={1}>
                    {item.scheduledAt ? formatDriverDateTime(item.scheduledAt) : (lang === 'zh' ? '未排期' : 'Unscheduled')}
                  </Text>
                </View>
              </View>

              {item.cargo && (
                <View style={styles.cargoContainer}>
                  <Ionicons name="cube-outline" size={15} color={AMBER} style={{ marginRight: 8 }} />
                  <Text style={styles.cargoText}>
                    {item.cargo}
                    {item.cargoWeight ? ` · ${item.cargoWeight} ${t('tasks.ton')}` : ''}
                  </Text>
                </View>
              )}

              {canManage && (
                <View style={styles.actionRow}>
                  {item.status === 'pending' && (
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnPrimary]}
                      onPress={async () => {
                        try {
                          const d: any = await usersApi.drivers();
                          setDrivers(Array.isArray(d) ? d : []);
                        } catch {
                          setDrivers([]);
                        }
                        setAssigningTask(item);
                        setPickOpen('driver');
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="person-add-outline" size={14} color={AMBER} />
                      <Text style={styles.smallBtnTextPrimary}>{t('tasks.assignDriver')}</Text>
                    </TouchableOpacity>
                  )}
                  {(item.status === 'pending' || item.status === 'assigned') && (
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => {
                        showAppAlert(t('tasks.cancelTask'), t('tasks.cancelConfirm'), [
                          { text: t('tasks.dontCancel'), style: 'cancel' },
                          {
                            text: t('tasks.cancelTask'), style: 'destructive', onPress: async () => {
                              try {
                                await tasksApi.cancel(item.id);
                                load();
                              } catch (e: any) {
                                showAppAlert(t('common.fail'), e?.message || t('tasks.cancelFailed'));
                              }
                            },
                          },
                        ]);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="close-circle-outline" size={14} color="#ef4444" />
                      <Text style={styles.smallBtnTextDanger}>{t('tasks.cancel')}</Text>
                    </TouchableOpacity>
                  )}
                  {(item.status === 'completed' || item.status === 'cancelled') && (
                    <TouchableOpacity
                      style={[styles.smallBtn, styles.smallBtnDanger]}
                      onPress={() => {
                        showAppAlert(t('tasks.deleteTask'), t('tasks.deleteConfirm'), [
                          { text: t('common.cancel'), style: 'cancel' },
                          {
                            text: t('tasks.delete'), style: 'destructive', onPress: async () => {
                              try {
                                await tasksApi.delete(item.id);
                                load();
                              } catch (e: any) {
                                showAppAlert(t('common.fail'), e?.message || t('tasks.deleteFailed'));
                              }
                            },
                          },
                        ]);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={14} color="#ef4444" />
                      <Text style={styles.smallBtnTextDanger}>{t('tasks.delete')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {role === 'driver' && item.status === 'assigned' && (
                <TouchableOpacity
                  style={[styles.acceptBtn, startingTaskId === item.id && styles.btnDisabled]}
                  onPress={() => openAcceptTask(item)}
                  disabled={startingTaskId === item.id}
                  activeOpacity={0.85}
                >
                  {startingTaskId === item.id
                    ? <ActivityIndicator color="#000" />
                    : <Text style={styles.acceptBtnText}>{t('d.accept')}</Text>}
                </TouchableOpacity>
              )}

              {role === 'driver' && item.status === 'in_progress' && (
                <TouchableOpacity
                  style={styles.continueBtn}
                  onPress={() => router.push(`/task/${item.id}`)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.continueBtnText}>{t('d.continue')}</Text>
                  <View style={styles.arrowIcon}>
                    <Text style={styles.arrowText}>→</Text>
                  </View>
                </TouchableOpacity>
              )}

              {role !== 'driver' && (
                <View style={styles.cardFooter}>
                  <Text style={styles.footerText}>{t('d.viewTask')}</Text>
                  {item.vehiclePlate ? (
                    <View style={styles.plateChip}>
                      <Ionicons name="car-outline" size={14} color={AMBER} />
                      <Text style={styles.plateChipText}>{item.vehiclePlate}</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="rgba(245,158,11,0.6)" />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <Modal visible={!!acceptTask && !plateOpen} animationType="fade" transparent onRequestClose={() => setAcceptTask(null)}>
        <View style={styles.pickWrap}>
          <View style={styles.acceptCard}>
            <View style={styles.pickHeader}>
              <Text style={styles.pickHeaderTitle}>{t('d.acceptConfirm')}</Text>
              <TouchableOpacity onPress={() => setAcceptTask(null)} style={styles.modalClose} activeOpacity={0.8}>
                <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
            {acceptTask && (
              <View style={styles.acceptContent}>
                <Text style={styles.acceptTitle} numberOfLines={2}>{acceptTask.title}</Text>
                <View style={styles.acceptInfoBox}>
                  <View style={styles.acceptInfoRow}>
                    <Text style={styles.acceptInfoLabel}>{t('d.client')}</Text>
                    <Text style={styles.acceptInfoValue}>{getPersonName(acceptTask.client)}</Text>
                  </View>
                  <View style={styles.acceptInfoRow}>
                    <Text style={styles.acceptInfoLabel}>{t('d.to')}</Text>
                    <Text style={styles.acceptInfoValue}>{acceptTask.endLocation || '-'}</Text>
                  </View>
                  <View style={styles.acceptInfoRow}>
                    <Text style={styles.acceptInfoLabel}>{t('d.cargo')}</Text>
                    <Text style={styles.acceptInfoValue}>{acceptTask.cargo || '-'}</Text>
                  </View>
                  <View style={styles.acceptInfoRow}>
                    <Text style={styles.acceptInfoLabel}>{t('d.weight')}</Text>
                    <Text style={styles.acceptInfoValue}>
                      {acceptTask.cargoWeight ? `${acceptTask.cargoWeight} ${t('td.ton')}` : '-'}
                    </Text>
                  </View>
                  <View style={styles.acceptInfoRow}>
                    <Text style={styles.acceptInfoLabel}>{t('d.scheduled')}</Text>
                    <Text style={styles.acceptInfoValue}>
                      {acceptTask.scheduledAt ? new Date(acceptTask.scheduledAt).toLocaleString() : '-'}
                    </Text>
                  </View>
                </View>
                <View style={styles.acceptActions}>
                  <TouchableOpacity
                    style={[styles.modalBtnSecondary, { flex: 1 }]}
                    onPress={() => setAcceptTask(null)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnSecondaryText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { flex: 1, marginTop: 0, marginBottom: 0 }]}
                    onPress={handleConfirmTaskInfo}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.modalBtnText}>{t('d.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={plateOpen} animationType="fade" transparent onRequestClose={() => setPlateOpen(false)}>
        <View style={styles.pickWrap}>
          <View style={styles.acceptCard}>
            <View style={styles.pickHeader}>
              <Text style={styles.pickHeaderTitle}>{t('d.plateTitle')}</Text>
              <TouchableOpacity onPress={() => setPlateOpen(false)} style={styles.modalClose} activeOpacity={0.8}>
                <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
            <View style={styles.acceptContent}>
              <Text style={styles.plateHint}>{t('d.plateHint')}</Text>
              <TextInput
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                style={styles.plateInput}
                placeholder={t('d.platePh')}
                placeholderTextColor="rgba(255,255,255,0.28)"
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={[styles.modalBtn, startingTaskId && styles.btnDisabled]}
                onPress={handleStartAcceptedTask}
                disabled={!!startingTaskId}
                activeOpacity={0.85}
              >
                {startingTaskId
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.modalBtnText}>{t('d.plateConfirm')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={notificationsOpen} animationType="slide" transparent onRequestClose={() => setNotificationsOpen(false)}>
        <View style={styles.pickWrap}>
          <View style={styles.pickCard}>
            <View style={styles.pickHeader}>
              <Text style={styles.pickHeaderTitle}>{t('tasks.notifTitle0')}</Text>
              <TouchableOpacity onPress={() => setNotificationsOpen(false)} style={styles.modalClose} activeOpacity={0.8}>
                <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={notifications}
              keyExtractor={(it: any) => it.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.notificationItem, !item.isRead && styles.notificationItemUnread]}
                  onPress={() => openNotification(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.notificationItemHeader}>
                    <Text style={styles.notificationItemTitle} numberOfLines={1}>{item.title}</Text>
                    {!item.isRead && <View style={styles.unreadDot} />}
                  </View>
                  <Text style={styles.notificationItemBody} numberOfLines={2}>{item.content}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={{ padding: 24 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>{t('tasks.noNotif')}</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{t('tasks.createTaskTitle')}</Text>
                <Text style={styles.modalSubtitle}>{taskNamePreview}</Text>
              </View>
              <TouchableOpacity onPress={() => setCreateOpen(false)} style={styles.modalClose} activeOpacity={0.8}>
                <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* 第 1 步 客户与司机 */}
              <View style={styles.formSectionHead}>
                <View style={styles.formSectionBar} />
                <Text style={styles.formSectionTitle}>{lang === 'zh' ? '客户与司机' : 'Client & Driver'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.selectRow, selectedClient && styles.selectRowFilled]}
                onPress={() => { setPickSearch(''); setPickOpen('client'); }}
                activeOpacity={0.85}
              >
                <View style={[styles.selectAvatar, selectedClient && styles.selectAvatarFilled]}>
                  {selectedClient
                    ? <Text style={styles.selectAvatarText}>{String(selectedClient.fullName || selectedClient.username || '?').slice(0, 1).toUpperCase()}</Text>
                    : <Ionicons name="business-outline" size={18} color="rgba(148,163,184,0.9)" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectRowLabel}>{t('tasks.client')} <Text style={styles.requiredMark}>*</Text></Text>
                  <Text style={[styles.selectRowValue, !selectedClient && styles.selectRowPlaceholder]} numberOfLines={1}>
                    {selectedClient ? (selectedClient.fullName || selectedClient.username || selectedClient.email) : t('tasks.selectClient')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="rgba(148,163,184,0.6)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.selectRow, selectedDriver && styles.selectRowFilled]}
                onPress={() => { setPickSearch(''); setPickOpen('driver'); }}
                activeOpacity={0.85}
              >
                <View style={[styles.selectAvatar, selectedDriver && styles.selectAvatarFilled]}>
                  {selectedDriver
                    ? <Text style={styles.selectAvatarText}>{String(selectedDriver.fullName || selectedDriver.username || '?').slice(0, 1).toUpperCase()}</Text>
                    : <Ionicons name="person-outline" size={18} color="rgba(148,163,184,0.9)" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.selectRowLabel}>{t('tasks.driver')} <Text style={styles.requiredMark}>*</Text></Text>
                  <Text style={[styles.selectRowValue, !selectedDriver && styles.selectRowPlaceholder]} numberOfLines={1}>
                    {selectedDriver ? (selectedDriver.fullName || selectedDriver.username || selectedDriver.email) : t('tasks.selectDriver')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={17} color="rgba(148,163,184,0.6)" />
              </TouchableOpacity>

              {/* 第 2 步 运输信息 */}
              <View style={styles.formSectionHead}>
                <View style={styles.formSectionBar} />
                <Text style={styles.formSectionTitle}>{lang === 'zh' ? '运输信息' : 'Shipment'}</Text>
              </View>
              <Text style={styles.formLabel}>{t('tasks.endAddr')} <Text style={styles.requiredMark}>*</Text></Text>
              <View style={styles.inputRow}>
                <Ionicons name="location-outline" size={17} color="rgba(148,163,184,0.75)" style={styles.inputRowIcon} />
                <TextInput value={endLocation} onChangeText={setEndLocation} style={styles.inputRowField} placeholder={t('tasks.endAddrPh')} placeholderTextColor="#6b7280" />
              </View>
              <Text style={styles.formLabel}>{t('tasks.cargo')} <Text style={styles.requiredMark}>*</Text></Text>
              <View style={styles.inputRow}>
                <Ionicons name="cube-outline" size={17} color="rgba(148,163,184,0.75)" style={styles.inputRowIcon} />
                <TextInput value={cargo} onChangeText={setCargo} style={styles.inputRowField} placeholder={t('tasks.cargoPh')} placeholderTextColor="#6b7280" />
              </View>
              <Text style={styles.formLabel}>{t('tasks.weight')} <Text style={styles.requiredMark}>*</Text></Text>
              <View style={styles.inputRow}>
                <Ionicons name="scale-outline" size={17} color="rgba(148,163,184,0.75)" style={styles.inputRowIcon} />
                <TextInput value={cargoWeight} onChangeText={setCargoWeight} style={styles.inputRowField} placeholder={t('tasks.weightPh')} placeholderTextColor="#6b7280" keyboardType="numeric" />
                <Text style={styles.inputSuffix}>{t('tasks.ton')}</Text>
              </View>

              {/* 第 3 步 时间与备注 */}
              <View style={styles.formSectionHead}>
                <View style={styles.formSectionBar} />
                <Text style={styles.formSectionTitle}>{lang === 'zh' ? '时间与备注' : 'Schedule & Notes'}</Text>
              </View>
              <Text style={styles.formLabel}>{t('tasks.scheduledTime')} <Text style={styles.requiredMark}>*</Text></Text>
              <TouchableOpacity
                style={styles.inputRow}
                onPress={() => { setTempDate(scheduledAt || new Date()); setPicker('date'); }}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={17} color={scheduledAt ? AMBER : 'rgba(148,163,184,0.75)'} style={styles.inputRowIcon} />
                <Text style={[styles.inputRowField, { color: scheduledAt ? '#fff' : '#6b7280', paddingVertical: 13 }]}>
                  {scheduledAt ? formatDriverDateTime(scheduledAt.toISOString()) : t('tasks.pickTime')}
                </Text>
                <Ionicons name="chevron-down" size={15} color="rgba(148,163,184,0.6)" />
              </TouchableOpacity>
              {picker && (
                <DateTimePicker
                  value={tempDate}
                  mode={picker}
                  is24Hour
                  onChange={onSchedPickerChange}
                />
              )}
              <Text style={styles.formLabel}>{t('tasks.notes')}</Text>
              <TextInput value={notes} onChangeText={setNotes} style={[styles.formInput, styles.formTextarea]} placeholder={t('common.optional')} placeholderTextColor="#6b7280" multiline />

              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnRow, (saving || !createFormValid) && styles.btnDisabled]}
                onPress={async () => {
                  if (!selectedClient?.id || !selectedDriver?.id || !endLocation.trim() || !cargo.trim() || !cargoWeight.trim() || !scheduledAt) {
                    showAppAlert(t('common.notice'), t('tasks.fillRequired'));
                    return;
                  }
                  try {
                    setSaving(true);
                    // 任务名 = 客户名-年月日-当日序号（如 test1-20260627-001）
                    // 用「标题里已含今天日期」数序号：不受时区影响、按顺序递增。
                    const _now = new Date();
                    const _pad = (n: number) => String(n).padStart(2, '0');
                    const _ymd = `${_now.getFullYear()}${_pad(_now.getMonth() + 1)}${_pad(_now.getDate())}`;
                    const _sameDay = tasks.filter(
                      (tk: any) => typeof tk?.title === 'string' && tk.title.includes(`-${_ymd}-`),
                    ).length;
                    const _clientName = selectedClient.fullName || selectedClient.username || '客户';
                    const titleText = `${_clientName}-${_ymd}-${String(_sameDay + 1).padStart(3, '0')}`;
                    const payload: any = {
                      clientId: selectedClient.id,
                      driverId: selectedDriver.id,
                      title: titleText,
                      endLocation: endLocation.trim(),
                      scheduledAt: scheduledAt.toISOString(),
                    };
                    if (cargo.trim()) payload.cargo = cargo.trim();
                    if (cargoWeight.trim()) payload.cargoWeight = Number(cargoWeight);
                    if (notes.trim()) payload.notes = notes.trim();
                    await tasksApi.create(payload);
                    setCreateOpen(false);
                    load();
                    showAppAlert(t('common.success'), t('tasks.created'));
                  } catch (e: any) {
                    showAppAlert(t('common.fail'), e?.message || t('tasks.createFailed'));
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                activeOpacity={0.85}
              >
                {saving ? <ActivityIndicator color="#000" /> : (
                  <>
                    <Ionicons name="paper-plane" size={17} color="#000" />
                    <Text style={styles.modalBtnText}>{t('tasks.createDispatch')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={pickOpen != null} animationType="fade" transparent onRequestClose={() => setPickOpen(null)}>
        <View style={styles.pickWrap}>
          <View style={styles.pickCard}>
            <View style={styles.pickHeader}>
              <Text style={styles.pickHeaderTitle}>{pickOpen === 'client' ? t('tasks.selectClient') : t('tasks.selectDriver')}</Text>
              <TouchableOpacity onPress={() => { setPickOpen(null); setAssigningTask(null); }} style={styles.modalClose} activeOpacity={0.8}>
                <Ionicons name="close" size={19} color="rgba(255,255,255,0.75)" />
              </TouchableOpacity>
            </View>
            <View style={styles.pickSearchBox}>
              <Ionicons name="search" size={16} color="rgba(148,163,184,0.8)" />
              <TextInput
                value={pickSearch}
                onChangeText={setPickSearch}
                style={styles.pickSearchInput}
                placeholder={t('d.search')}
                placeholderTextColor="rgba(148,163,184,0.6)"
              />
            </View>
            <FlatList
              data={pickList}
              keyExtractor={(it: any) => it.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = pickOpen === 'client' ? selectedClient?.id === item.id : (!assigningTask && selectedDriver?.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.pickItem, selected && styles.pickItemSelected]}
                    onPress={async () => {
                      if (pickOpen === 'client') {
                        setSelectedClient(item);
                        setPickOpen(null);
                        return;
                      }
                      if (assigningTask) {
                        try {
                          await tasksApi.assign(assigningTask.id, item.id);
                          setAssigningTask(null);
                          setPickOpen(null);
                          load();
                          showAppAlert(t('common.success'), t('tasks.driverAssigned'));
                        } catch (e: any) {
                          showAppAlert(t('common.fail'), e?.message || t('tasks.assignFailed'));
                        }
                        return;
                      }
                      setSelectedDriver(item);
                      setPickOpen(null);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.selectAvatar, styles.selectAvatarFilled, { marginRight: 12 }]}>
                      <Text style={styles.selectAvatarText}>
                        {String(item.fullName || item.username || '?').slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickItemTitle} numberOfLines={1}>
                        {item.fullName || item.username || item.email}
                      </Text>
                      <Text style={styles.pickItemSub} numberOfLines={1}>{item.email}</Text>
                    </View>
                    {selected && <Ionicons name="checkmark-circle" size={21} color={AMBER} />}
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={{ padding: 20 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>{t('common.noData')}</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  driverPage: {
    flex: 1,
    backgroundColor: '#0B0F1A',
  },
  driverListContentScroll: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 28,
  },
  driverHeader: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 4,
    backgroundColor: '#0B0F1A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  driverGreeting: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 38,
  },
  driverSubTitle: {
    color: 'rgba(148,163,184,0.72)',
    fontSize: 14,
    marginTop: 8,
    marginBottom: 24,
  },
  driverStatsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  driverStatCard: {
    flex: 1,
    minHeight: 68,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
  },
  driverStatBlue: {
    borderColor: 'rgba(96,165,250,0.35)',
  },
  driverStatAmber: {
    borderColor: 'rgba(245,158,11,0.35)',
  },
  driverStatRed: {
    borderColor: 'rgba(239,68,68,0.35)',
  },
  driverStatValue: {
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 28,
  },
  driverStatLabel: {
    color: 'rgba(148,163,184,0.78)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 5,
  },
  driverFilterRow: {
    gap: 8,
    paddingRight: 8,
    marginBottom: 14,
  },
  driverFilterPill: {
    minWidth: 64,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  driverFilterPillActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  driverFilterText: {
    color: 'rgba(203,213,225,0.72)',
    fontSize: 14,
    fontWeight: '800',
  },
  driverFilterTextActive: {
    color: '#111827',
  },
  driverSearchBox: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  driverSearchIcon: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 24,
    marginRight: 10,
  },
  driverSearchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 15,
    height: '100%',
  },
  driverTaskCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 12,
  },
  driverTaskTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  driverStatusBadge: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  driverStatusBadgeAbs: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  driverTaskTitlePad: {
    paddingRight: 80,
  },
  driverStatusText: {
    fontSize: 13,
    fontWeight: '900',
  },
  driverTaskTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 5,
  },
  driverTaskMeta: {
    color: 'rgba(148,163,184,0.78)',
    fontSize: 14,
    fontWeight: '700',
  },
  driverTaskRoute: {
    color: 'rgba(148,163,184,0.68)',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  driverTaskDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginTop: 12,
  },
  driverTaskBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  driverInfoLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverTaskDate: {
    color: 'rgba(148,163,184,0.82)',
    fontSize: 13.5,
    fontWeight: '700',
    marginLeft: 6,
  },
  driverTaskCreated: {
    color: 'rgba(100,116,139,0.72)',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  driverTaskAmount: {
    color: AMBER,
    fontSize: 16,
    fontWeight: '900',
    marginLeft: 14,
  },
  driverAmountPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginLeft: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  driverAmountValue: {
    color: AMBER,
    fontSize: 17,
    fontWeight: '900',
  },
  driverAmountUnit: {
    color: AMBER,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 3,
  },
  driverAcceptInline: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
    backgroundColor: 'rgba(245,158,11,0.15)',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverAcceptInlineText: {
    color: AMBER,
    fontSize: 16,
    fontWeight: '900',
  },
  driverCompleteInline: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.48)',
    backgroundColor: 'rgba(22,163,74,0.18)',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverCompleteInlineText: {
    color: '#bbf7d0',
    fontSize: 16,
    fontWeight: '900',
  },
  completeHint: {
    color: 'rgba(203,213,225,0.62)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
  },
  completePhotoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  completePhotoWrap: {
    width: 86,
    height: 86,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#111827',
  },
  completePhoto: {
    width: '100%',
    height: '100%',
  },
  completePhotoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completePhotoRemoveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '900',
  },
  completePhotoAdd: {
    width: 86,
    height: 86,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(148,163,184,0.48)',
    backgroundColor: 'rgba(15,23,42,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completePhotoAddIcon: {
    fontSize: 26,
    marginBottom: 6,
  },
  completePhotoAddText: {
    color: 'rgba(226,232,240,0.72)',
    fontSize: 13,
    fontWeight: '800',
  },
  completeSubmitBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeSubmitText: {
    color: '#052e16',
    fontSize: 16,
    fontWeight: '900',
  },
  driverEmptyBox: {
    flex: 1,
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 50,
  },
  driverEmptyIcon: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: `${AMBER}16`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  driverEmptyIconText: {
    fontSize: 42,
  },
  driverEmptyTitle: {
    color: 'rgba(226,232,240,0.82)',
    fontSize: 21,
    fontWeight: '900',
  },
  driverEmptySub: {
    color: 'rgba(148,163,184,0.5)',
    fontSize: 14,
    marginTop: 12,
    fontWeight: '700',
  },
  container: {
    flex: 1,
    backgroundColor: '#0B0F1A',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0B0F1A',
  },
  loadingSpinner: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: `${AMBER}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  header: {
    backgroundColor: '#0B0F1A',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  statsBadge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  headerBtn: {
    flex: 1,
    backgroundColor: AMBER,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  headerBtnGhost: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  headerBtnText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
  },
  headerBtnGhostText: {
    color: AMBER,
  },
  statItem: {
    alignItems: 'center',
    minWidth: 50,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: AMBER,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 12,
  },
  notificationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    marginTop: 16,
  },
  notificationBarUnread: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  notificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${AMBER}25`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationIconText: {
    color: AMBER,
    fontWeight: '900',
    fontSize: 18,
  },
  notificationTitle: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  notificationSub: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  notificationArrow: {
    color: AMBER,
    fontSize: 12,
    fontWeight: '800',
  },
  notificationItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  notificationItemUnread: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
  },
  notificationItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationItemTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  notificationItemBody: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    marginTop: 5,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: AMBER,
  },
  empty: {
    flex: 1,
  },
  emptyBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: `${AMBER}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 40,
  },
  emptyText: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 8,
  },
  card: {
    backgroundColor: 'rgba(30, 41, 59, 0.55)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  cardNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${AMBER}20`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: AMBER,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  destLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginLeft: 8,
    marginRight: 10,
  },
  destText: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  routeContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  routeLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    width: 32,
  },
  routeText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    flex: 1,
  },
  routeLine: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginLeft: 4,
    marginVertical: 4,
  },
  cargoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  cargoIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  cargoText: {
    fontSize: 13,
    color: AMBER,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  smallBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  smallBtnPrimary: {
    backgroundColor: `${AMBER}20`,
    borderWidth: 1,
    borderColor: `${AMBER}35`,
  },
  smallBtnDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  smallBtnTextPrimary: {
    color: AMBER,
    fontWeight: '800',
    fontSize: 13,
  },
  smallBtnTextDanger: {
    color: '#ef4444',
    fontWeight: '800',
    fontSize: 13,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  arrowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: `${AMBER}20`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    fontSize: 14,
    color: AMBER,
    fontWeight: '700',
  },
  plateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  plateChipIcon: { fontSize: 13 },
  plateChipText: { color: AMBER, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  viewChevron: { color: 'rgba(245,158,11,0.6)', fontSize: 22, fontWeight: '700' },
  acceptBtn: {
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 2,
    shadowColor: AMBER,
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  acceptBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.28)',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  continueBtnText: {
    color: '#93c5fd',
    fontSize: 13,
    fontWeight: '800',
  },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0B0F1A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '900',
  },
  pickField: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    marginBottom: 12,
  },
  pickLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  pickValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  formLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 8,
  },
  formInput: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
    marginBottom: 12,
  },
  formTextarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalBtn: {
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
  },
  pickWrap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  pickCard: {
    backgroundColor: '#0B0F1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    maxHeight: '80%',
  },
  acceptCard: {
    backgroundColor: '#0B0F1A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    width: '100%',
  },
  acceptContent: {
    padding: 16,
  },
  acceptTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  acceptInfoBox: {
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  acceptInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  acceptInfoLabel: {
    width: 70,
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '700',
  },
  acceptInfoValue: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  acceptActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalBtnSecondaryText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    fontWeight: '800',
  },
  plateHint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  plateInput: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingVertical: 13,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 14,
  },
  pickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pickHeaderTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  pickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  pickItemTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  pickItemSub: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    marginTop: 4,
  },
  // ===== 商用化改版新增样式 =====
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: AMBER,
    borderRadius: 13,
    height: 46,
    marginTop: 14,
    shadowColor: AMBER,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  createBtnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '900',
  },
  modalSubtitle: {
    color: 'rgba(245,158,11,0.85)',
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 4,
  },
  formSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 10,
  },
  formSectionBar: {
    width: 3.5,
    height: 15,
    borderRadius: 2,
    backgroundColor: AMBER,
    marginRight: 8,
  },
  formSectionTitle: {
    color: 'rgba(226,232,240,0.92)',
    fontSize: 14.5,
    fontWeight: '800',
  },
  requiredMark: {
    color: '#ef4444',
    fontWeight: '900',
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginBottom: 10,
  },
  selectRowFilled: {
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.06)',
  },
  selectAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(148,163,184,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAvatarFilled: {
    backgroundColor: 'rgba(245,158,11,0.18)',
  },
  selectAvatarText: {
    color: AMBER,
    fontSize: 16,
    fontWeight: '900',
  },
  selectRowLabel: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 11.5,
    fontWeight: '700',
    marginBottom: 3,
  },
  selectRowValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  selectRowPlaceholder: {
    color: 'rgba(148,163,184,0.55)',
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 13,
    marginBottom: 12,
  },
  inputRowIcon: {
    marginRight: 9,
  },
  inputRowField: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    paddingVertical: 12,
  },
  inputSuffix: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cardMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 7,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  cardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexBasis: '50%',
    paddingRight: 8,
  },
  cardMetaText: {
    color: 'rgba(203,213,225,0.88)',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  pickSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 12,
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 4,
  },
  pickSearchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14.5,
    paddingVertical: 10,
  },
  pickItemSelected: {
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  platePickBox: {
    marginBottom: 14,
  },
  platePickLabel: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  platePickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  plateChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.4)',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  plateChipBtnActive: {
    backgroundColor: AMBER,
    borderColor: AMBER,
  },
  plateChipBtnText: {
    color: AMBER,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  plateChipBtnTextActive: {
    color: '#111827',
  },
});
