import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err.response?.data || err);
  },
);

export const authApi = {
  login: (data: { identifier: string; password: string }) =>
    api.post('/auth/login', data),
  register: (data: any) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
};

export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  pending: () => api.get('/users/pending'),
  drivers: () => api.get('/users/drivers'),
  clients: () => api.get('/users/clients'),
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  approve: (id: string) => api.patch(`/users/${id}/approve`),
  reject: (id: string) => api.patch(`/users/${id}/reject`),
  disable: (id: string) => api.patch(`/users/${id}/disable`),
  enable: (id: string) => api.patch(`/users/${id}/enable`),
  updateRole: (id: string, role: string) => api.patch(`/users/${id}/role`, { role }),
  delete: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, newPassword: string) => api.patch(`/users/${id}/reset-password`, { newPassword }),
  updateProfile: (data: any) => api.patch('/users/profile', data),
  changePassword: (data: any) => api.patch('/users/change-password', data),
};

export const tasksApi = {
  list: () => api.get('/tasks'),
  today: () => api.get('/tasks/today'),
  stats: () => api.get('/tasks/stats'),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  assign: (id: string, driverId: string) => api.patch(`/tasks/${id}/assign`, { driverId }),
  start: (id: string) => api.post(`/tasks/${id}/start`),
  complete: (id: string, formData: FormData) =>
    api.post(`/tasks/${id}/complete`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  cancel: (id: string) => api.patch(`/tasks/${id}/cancel`),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

export const gpsApi = {
  upload: (data: any) => api.post('/gps/upload', data),
  track: (taskId: string) => api.get(`/gps/track/${taskId}`),
  positions: () => api.get('/gps/positions'),
  driverPosition: (driverId: string) => api.get(`/gps/driver/${driverId}/position`),
};

export const driverPresenceApi = {
  online: () => api.get('/driver-presence/online'),
};

export const workRecordsApi = {
  list: () => api.get('/work-records'),
  byTask: (taskId: string) => api.get(`/work-records/task/${taskId}`),
  get: (id: string) => api.get(`/work-records/${id}`),
  delete: (id: string) => api.delete(`/work-records/${id}`),
};

export const adjustmentsApi = {
  add: (data: any) => api.post('/adjustments', data),
  setFinal: (data: any) => api.post('/adjustments/set-final', data),
  logs: (params?: any) => api.get('/adjustments/logs', { params }),
};

export const anomaliesApi = {
  list: () => api.get('/anomalies'),
  unresolved: () => api.get('/anomalies/unresolved'),
  resolve: (id: string) => api.patch(`/anomalies/${id}/resolve`),
  ignore: (id: string) => api.patch(`/anomalies/${id}/ignore`),
  snooze: (id: string, minutes: number) => api.patch(`/anomalies/${id}/snooze`, { minutes }),
};

export const announcementsApi = {
  list: () => api.get('/announcements'),
  feed: () => api.get('/announcements/feed'),
  create: (data: { title: string; content: string; targetRole: string }) => api.post('/announcements', data),
  setActive: (id: string, active: boolean) => api.patch(`/announcements/${id}/active`, { active }),
  delete: (id: string) => api.delete(`/announcements/${id}`),
};

export const systemSettingsApi = {
  get: () => api.get('/system-settings'),
  update: (data: Record<string, string>) => api.put('/system-settings', data),
  clearData: (password: string) => api.post('/system-settings/clear-data', { password }),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const operationLogsApi = {
  list: (params?: { limit?: number }) => api.get('/operation-logs', { params }),
};

export default api;
