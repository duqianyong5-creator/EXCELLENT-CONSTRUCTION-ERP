import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// 开发时填写电脑的局域网 IP，生产时填写服务器地址
// 例如：http://192.168.1.100:3000
export const BASE_URL = 'http://10.196.16.146:3000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => Promise.reject(err.response?.data || err),
);

export const authApi = {
  login: (data: { identifier: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const tasksApi = {
  today: () => api.get('/tasks/today'),
  list: () => api.get('/tasks'),
  get: (id: string) => api.get(`/tasks/${id}`),
  start: (id: string) => api.post(`/tasks/${id}/start`),
  complete: (id: string, formData: FormData) =>
    api.post(`/tasks/${id}/complete`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
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
};

export const usersApi = {
  updateProfile: (data: { fullName?: string; phone?: string; language?: string }) =>
    api.patch('/users/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.patch('/users/change-password', data),
};

export default api;
