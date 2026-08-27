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
  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }).then((r) => r.data),
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }).then((r) => r.data),
  mfaSetup: () => api.post('/auth/mfa/setup').then((r) => r.data),
  mfaEnable: (code: string) => api.post('/auth/mfa/enable', { code }).then((r) => r.data),
  mfaDisable: (password: string, code: string) =>
    api.post('/auth/mfa/disable', { password, code }).then((r) => r.data),
  mfaVerify: (mfaToken: string, code: string) =>
    api.post('/auth/mfa/verify', { mfaToken, code }).then((r) => r.data),
};

export const subscriptionApi = {
  status: () => api.get('/subscription/status').then((r) => r.data),
  plans: () => api.get('/subscription/plans').then((r) => r.data),
  createInvoice: (body: { planId: string; network: string }) =>
    api.post('/subscription/invoices', body).then((r) => r.data),
  submitTx: (id: string, txHash: string) =>
    api.post(`/subscription/invoices/${id}/submit-tx`, { txHash }).then((r) => r.data),
  myInvoices: () => api.get('/subscription/invoices/mine').then((r) => r.data),
};

export const adminApi = {
  overview: () => api.get('/admin/overview').then((r) => r.data),
  listUsers: (params?: Record<string, unknown>) =>
    api.get('/admin/users', { params }).then((r) => r.data),
  patchUser: (id: string, body: unknown) =>
    api.patch(`/admin/users/${id}`, body).then((r) => r.data),
  getSubscriptionSettings: () =>
    api.get('/admin/subscription/settings').then((r) => r.data),
  updateSubscriptionSettings: (body: unknown) =>
    api.put('/admin/subscription/settings', body).then((r) => r.data),
  listInvoices: (params?: { status?: string }) =>
    api.get('/admin/subscription/invoices', { params }).then((r) => r.data),
  confirmInvoice: (id: string, body?: { txHash?: string }) =>
    api.post(`/admin/subscription/invoices/${id}/confirm`, body ?? {}).then((r) => r.data),
  rejectInvoice: (id: string, body?: { note?: string }) =>
    api.post(`/admin/subscription/invoices/${id}/reject`, body ?? {}).then((r) => r.data),
  grantSubscription: (userId: string, body: { days: number; planId?: string }) =>
    api.patch(`/admin/users/${userId}`, { grantDays: body.days }).then((r) => r.data),
  revokeSubscription: (userId: string) =>
    api.patch(`/admin/users/${userId}`, { revokeSubscription: true }).then((r) => r.data),
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
  copy: (id: string, body?: { orderType?: string; limitPrice?: number }) =>
    api.post(`/trades/${id}/copy`, body ?? {}).then((r) => r.data),
};

export const positionsApi = {
  list: () => api.get('/positions').then((r) => r.data),
  context: () => api.get('/positions/context').then((r) => r.data),
  getContext: (id: string) => api.get(`/positions/${id}/context`).then((r) => r.data),
  update: (
    id: string,
    body: { stopLoss?: number; takeProfit?: number; trailingStopPct?: number },
  ) => api.patch(`/positions/${id}`, body).then((r) => r.data),
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
  vapidPublicKey: () =>
    api.get('/notifications/push/vapid-public-key').then((r) => r.data as { publicKey: string }),
  pushSubscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    api.post('/notifications/push/subscribe', body).then((r) => r.data),
  pushUnsubscribe: (endpoint: string) =>
    api.delete('/notifications/push/subscribe', { data: { endpoint } }).then((r) => r.data),
};
