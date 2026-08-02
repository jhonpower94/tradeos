import { api } from './client';

export { api };

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (email: string, password: string) =>
    api.post('/auth/register', { email, password }).then((r) => r.data),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }).then((r) => r.data),
  logout: (refreshToken?: string | null) =>
    api.post('/auth/logout', { refreshToken: refreshToken ?? undefined }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

export const settingsApi = {
  get: () => api.get('/settings').then((r) => r.data),
  update: (body: unknown) => api.patch('/settings', body).then((r) => r.data),
  setBinance: (body: unknown) => api.put('/settings/binance', body).then((r) => r.data),
  testBinance: () => api.post('/settings/binance/test').then((r) => r.data),
};

export const marketApi = {
  symbols: () => api.get('/market/symbols').then((r) => r.data),
  ticker: (symbol: string) => api.get(`/market/ticker/${symbol}`).then((r) => r.data),
  candles: (symbol: string, interval: string, limit = 500) =>
    api.get('/market/candles', { params: { symbol, interval, limit } }).then((r) => r.data),
};

export const scannerApi = {
  opportunities: (params?: Record<string, unknown>) =>
    api.get('/scanner/opportunities', { params }).then((r) => r.data),
  status: () => api.get('/scanner/status').then((r) => r.data),
  start: () => api.post('/scanner/start').then((r) => r.data),
  stop: () => api.post('/scanner/stop').then((r) => r.data),
};

export const signalsApi = {
  list: (params?: { view?: 'ranked' | 'history'; minConfidence?: number }) =>
    api.get('/signals', { params }).then((r) => r.data),
  approve: (id: string) => api.post(`/signals/${id}/approve`, {}).then((r) => r.data),
  reject: (id: string) => api.post(`/signals/${id}/reject`, {}).then((r) => r.data),
};

export const tradesApi = {
  list: () => api.get('/trades').then((r) => r.data),
  close: (id: string) => api.post(`/trades/${id}/close`).then((r) => r.data),
};

export const positionsApi = {
  list: () => api.get('/positions').then((r) => r.data),
  context: () => api.get('/positions/context').then((r) => r.data),
  getContext: (id: string) => api.get(`/positions/${id}/context`).then((r) => r.data),
};

export const portfolioApi = {
  summary: () => api.get('/portfolio/summary').then((r) => r.data),
  deposit: (amount: number, note?: string) =>
    api.post('/portfolio/paper/deposit', { amount, note }).then((r) => r.data),
  withdraw: (amount: number, note?: string) =>
    api.post('/portfolio/paper/withdraw', { amount, note }).then((r) => r.data),
  ledger: () => api.get('/portfolio/paper/ledger').then((r) => r.data),
};

export const journalApi = {
  list: () => api.get('/journal').then((r) => r.data),
};

export const analyticsApi = {
  overview: () => api.get('/analytics/overview').then((r) => r.data),
};

export const backtestApi = {
  run: (body: unknown) => api.post('/backtest', body).then((r) => r.data),
  list: () => api.get('/backtest').then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get('/notifications').then((r) => r.data),
  test: () => api.post('/notifications/test').then((r) => r.data),
};
