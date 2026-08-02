import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

export const api = axios.create({
  baseURL: '/api/v1',
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string };
    }>('/api/v1/auth/refresh', { refreshToken });
    useAuthStore.getState().setAuth(data.accessToken, data.user, data.refreshToken);
    return data.accessToken;
  } catch {
    useAuthStore.getState().logout();
    return null;
  }
}

function isAuthPath(url?: string) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status !== 401 || !original || original._retry || isAuthPath(original.url)) {
      if (err.response?.status === 401 && isAuthPath(original?.url) === false && !useAuthStore.getState().refreshToken) {
        useAuthStore.getState().logout();
      }
      return Promise.reject(err);
    }

    original._retry = true;
    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => {
        refreshPromise = null;
      });
    }
    const accessToken = await refreshPromise;
    if (!accessToken) return Promise.reject(err);
    original.headers.Authorization = `Bearer ${accessToken}`;
    return api(original);
  },
);
