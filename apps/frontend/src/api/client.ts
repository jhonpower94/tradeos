import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/authStore';

export const api = axios.create({
  baseURL: '/api/v1',
});

let refreshPromise: Promise<string | null> | null = null;

function isAuthPath(url?: string) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/register') ||
    url.includes('/auth/refresh') ||
    url.includes('/auth/logout')
  );
}

function jwtExpiresAtMs(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

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

function ensureFreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  if (isAuthPath(config.url)) return config;

  let token = useAuthStore.getState().token;
  if (!token) return config;

  const exp = jwtExpiresAtMs(token);
  // Refresh ~60s before expiry so polling never sends a dead JWT.
  if (exp != null && exp - Date.now() < 60_000) {
    const refreshed = await ensureFreshAccessToken();
    if (refreshed) token = refreshed;
  }

  config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status !== 401 || !original || original._retry || isAuthPath(original.url)) {
      if (
        err.response?.status === 401 &&
        isAuthPath(original?.url) === false &&
        !useAuthStore.getState().refreshToken
      ) {
        useAuthStore.getState().logout();
      }
      return Promise.reject(err);
    }

    original._retry = true;
    const accessToken = await ensureFreshAccessToken();
    if (!accessToken) return Promise.reject(err);
    original.headers.Authorization = `Bearer ${accessToken}`;
    return api(original);
  },
);
