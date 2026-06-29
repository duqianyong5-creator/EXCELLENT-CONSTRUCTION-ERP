import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const DEFAULT_BASE_URL = 'http://192.168.1.113:3000';

export async function getBaseUrl(): Promise<string> {
  try {
    const saved = await SecureStore.getItemAsync('server_ip');
    if (!saved) return DEFAULT_BASE_URL;
    const s = saved.trim();
    if (!s) return DEFAULT_BASE_URL;
    if (/^https?:\/\//i.test(s)) return s;
    if (s.includes(':')) return `http://${s}`;
    return `http://${s}:3000`;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

export function clearBaseUrlCache() {
}

const api = axios.create({
  baseURL: DEFAULT_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const baseUrl = await getBaseUrl();
  config.baseURL = baseUrl;
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err),
);

export const authApi = {
  login: (data: { identifier: string; password: string }) =>
    api.post('/auth/login', data),
  register: (data: {
    username: string;
    email: string;
    fullName: string;
    phone?: string;
    role: string;
    password: string;
  }) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const tasksApi = {
  today: () => api.get('/tasks/today'),
  list: () => api.get('/tasks'),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  assign: (id: string, driverId: string) => api.patch(`/tasks/${id}/assign`, { driverId }),
  start: (id: string, vehiclePlate?: string) =>
    api.post(`/tasks/${id}/start`, vehiclePlate ? { vehiclePlate } : {}),
  complete: (id: string, formData: FormData) =>
    api.post(`/tasks/${id}/complete`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  cancel: (id: string) => api.patch(`/tasks/${id}/cancel`),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

export const gpsApi = {
  upload: (data: {
    taskId: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading?: number;
    accuracy?: number;
  }) => api.post('/gps/upload', data),
  positions: () => api.get('/gps/positions'),
  driverPosition: (driverId: string) => api.get(`/gps/driver/${driverId}/position`),
};

export const usersApi = {
  drivers: () => api.get('/users/drivers'),
  clients: () => api.get('/users/clients'),
  updateProfile: (data: { fullName?: string; phone?: string; email?: string; language?: string }) =>
    api.patch('/users/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.patch('/users/change-password', data),
};

export const workRecordsApi = {
  byTask: (taskId: string) => api.get(`/work-records/task/${taskId}`),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const announcementsApi = {
  feed: () => api.get('/announcements/feed'),
};

export default api;
