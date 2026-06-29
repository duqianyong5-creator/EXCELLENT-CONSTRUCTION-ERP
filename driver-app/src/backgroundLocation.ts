import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { gpsApi } from './api';

const BG_TASK = 'gps-bg-location';
const ACTIVE_KEY = 'gps_active_task_id';

// 后台定位任务：手机锁屏/App 切后台也会触发，持续上传 GPS。
TaskManager.defineTask(BG_TASK, async ({ data, error }: any) => {
  if (error) return;
  const loc = data?.locations?.[data.locations.length - 1];
  if (!loc) return;
  let taskId: string | null = null;
  try { taskId = await SecureStore.getItemAsync(ACTIVE_KEY); } catch { /* ignore */ }
  if (!taskId) return;
  try {
    await gpsApi.upload({
      taskId,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      speed: Math.max(0, (loc.coords.speed ?? 0) * 3.6),
      heading: loc.coords.heading ?? undefined,
      accuracy: loc.coords.accuracy ?? undefined,
    });
  } catch { /* 单次失败下一轮继续 */ }
});

// 启动后台定位。返回 true 表示后台服务已接管（前后台都会上报）；
// false 表示当前环境不支持后台定位（如 Expo Go），调用方应回退到前台定时上报。
export async function startBackgroundGps(taskId: string): Promise<boolean> {
  try { await SecureStore.setItemAsync(ACTIVE_KEY, taskId); } catch { /* ignore */ }

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  // 后台权限拿不到也不阻断（至少前台能上报）
  try { await Location.requestBackgroundPermissionsAsync(); } catch { /* ignore */ }

  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BG_TASK).catch(() => false);
    if (running) return true;
    await Location.startLocationUpdatesAsync(BG_TASK, {
      // High(GPS)在熄屏时仍持续更新；Balanced 会被安卓在熄屏/Doze 下大幅批处理导致掉点
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 0,
      deferredUpdatesInterval: 0, // 不批处理，定位立即下发
      activityType: Location.ActivityType.AutomotiveNavigation, // 车辆持续导航场景
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: '运输任务进行中',
        notificationBody: '正在上传 GPS 位置',
        killServiceOnDestroy: false, // App 被系统回收也尽量保活
      },
    });
    return true;
  } catch {
    // Expo Go / 不支持后台定位 → 让调用方回退前台
    return false;
  }
}

export async function stopBackgroundGps(): Promise<void> {
  try { await SecureStore.deleteItemAsync(ACTIVE_KEY); } catch { /* ignore */ }
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BG_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(BG_TASK);
  } catch { /* ignore */ }
}
