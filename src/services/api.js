import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.API_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject access token on every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefresh } = res.data || {};

        await SecureStore.setItemAsync('access_token', accessToken);
        await SecureStore.setItemAsync('refresh_token', newRefresh);

        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        const { useAuthStore } = require('../store/authStore');
        useAuthStore.getState().logout();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

// ============================================================
// AUTH
// ============================================================
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  updateProfile: (data) => api.patch('/auth/me', data),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ============================================================
// CATALOG
// ============================================================
export const catalogApi = {
  search: (params) => api.get('/catalog/search', { params }),
  get: (id) => api.get(`/catalog/${id}`),
  create: (data) => api.post('/catalog', data),
  priceHistory: (id) => api.get(`/catalog/${id}/price-history`),
};

// ============================================================
// OWNED CARDS
// ============================================================
export const cardsApi = {
  mine: (params) => api.get('/cards/mine', { params }),
  get: (id) => api.get(`/cards/${id}`),
  register: (data) => api.post('/cards', data),
  update: (id, data) => api.patch(`/cards/${id}`, data),
  history: (id) => api.get(`/cards/${id}/history`),
};

// ============================================================
// TRANSFERS
// ============================================================
export const transfersApi = {
  initiate: (data) => api.post('/transfers', data),
  nfc: (data) => api.post('/transfers/nfc', data),
  accept: (id) => api.post(`/transfers/${id}/accept`),
  addTracking: (id, data) => api.post(`/transfers/${id}/add-tracking`, data),
  confirmDelivery: (id) => api.post(`/transfers/${id}/confirm-delivery`),
  cancel: (id) => api.post(`/transfers/${id}/cancel`),
  mine: (params) => api.get('/transfers/mine', { params }),
};

// ============================================================
// QR
// ============================================================
export const qrApi = {
  lookup: (code) => api.get(`/qr/${code}`),
  generateBatch: (data) => api.post('/qr/generate-batch', data),
};

// ============================================================
// WANT LIST
// ============================================================
export const wantListApi = {
  get: () => api.get('/wantlist'),
  add: (data) => api.post('/wantlist', data),
  remove: (id) => api.delete(`/wantlist/${id}`),
};

// ============================================================
// MESSAGES
// ============================================================
export const messagesApi = {
  conversations: () => api.get('/messages/conversations'),
  getMessages: (id) => api.get(`/messages/conversations/${id}`),
  send: (data) => api.post('/messages', data),
};

// ============================================================
// NOTIFICATIONS
// ============================================================
export const notificationsApi = {
  get: (params) => api.get('/notifications', { params }),
  markRead: (ids) => api.post('/notifications/mark-read', { ids }),
};

// ============================================================
// STORES
// ============================================================
export const storesApi = {
  create: (data) => api.post('/stores', data),
  inventory: (id, params) => api.get(`/stores/${id}/inventory`, { params }),
  stats: (id) => api.get(`/stores/${id}/stats`),
  addLocation: (id, data) => api.post(`/stores/${id}/locations`, data),
  addStaff: (id, data) => api.post(`/stores/${id}/staff`, data),
};

// ============================================================
// FEEDBACK
// ============================================================
export const feedbackApi = {
  leave: (data) => api.post('/feedback', data),
  forUser: (username) => api.get(`/feedback/user/${username}`),
};

// ============================================================
// BINDERS
// ============================================================
export const bindersApi = {
  list: () => api.get('/binders'),
  create: (data) => api.post('/binders', data),
  get: (id) => api.get(`/binders/${id}`),
  update: (id, data) => api.patch(`/binders/${id}`, data),
  archive: (id) => api.delete(`/binders/${id}`),
  addSection: (id, data) => api.post(`/binders/${id}/sections`, data),
  updateSection: (id, sectionId, data) => api.patch(`/binders/${id}/sections/${sectionId}`, data),
  deleteSection: (id, sectionId) => api.delete(`/binders/${id}/sections/${sectionId}`),
  addCards: (id, data) => api.post(`/binders/${id}/cards`, data),
  updateCard: (id, cardId, data) => api.patch(`/binders/${id}/cards/${cardId}`, data),
  removeCard: (id, cardId) => api.delete(`/binders/${id}/cards/${cardId}`),
  activateShowFloor: (id, data) => api.post(`/binders/${id}/show-floor`, data),
  endShowFloor: (id) => api.post(`/binders/${id}/show-floor/end`),
  getPublic: (linkToken) => api.get(`/b/binder/${linkToken}`),
  getPublicSection: (linkToken) => api.get(`/b/binder/section/${linkToken}`),
  analytics: (id) => api.get(`/analytics/binders/${id}/analytics`),
};

// ============================================================
// OFFERS
// ============================================================
export const offersApi = {
  create: (data) => api.post('/offers', data),
  mine: (params) => api.get('/offers/mine', { params }),
  get: (id) => api.get(`/offers/${id}`),
  counter: (id, data) => api.post(`/offers/${id}/counter`, data),
  accept: (id) => api.post(`/offers/${id}/accept`),
  decline: (id) => api.post(`/offers/${id}/decline`),
  message: (id, data) => api.post(`/offers/${id}/message`, data),
};

// ============================================================
// TRANSACTIONS (CSTX)
// ============================================================
export const cstxApi = {
  mine: (params) => api.get('/transactions/mine', { params }),
  get: (id) => api.get(`/transactions/${id}`),
  submitPayment: (id, data) => api.post(`/transactions/${id}/submit-payment`, data),
  confirmPayment: (id) => api.post(`/transactions/${id}/confirm-payment`),
  addTracking: (id, data) => api.post(`/transactions/${id}/add-tracking`, data),
  confirmDelivery: (id) => api.post(`/transactions/${id}/confirm-delivery`),
  dispute: (id, data) => api.post(`/transactions/${id}/dispute`, data),
};

// ============================================================
// FOLLOWS
// ============================================================
export const followsApi = {
  follow: (userId) => api.post(`/follows/${userId}/follow`),
  unfollow: (userId) => api.delete(`/follows/${userId}/follow`),
  count: () => api.get('/follows/followers/count'),
  following: () => api.get('/follows/following'),
};

// ============================================================
// SEARCH
// ============================================================
export const searchApi = {
  search: (params) => api.get('/search', { params }),
};
