import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// Prefer EXPO_PUBLIC_API_URL (injected at build time by EAS profiles) so
// each build target (development/preview/production) can point at its own
// API. Falls back to the value in app.json, then localhost for dev.
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.API_URL ||
  'http://localhost:5000';

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

// Auto-refresh on 401 — but ONLY for endpoints that actually require a
// valid session. A 401 from /auth/login means "wrong password", not
// "token expired"; trying to refresh there throws away the server's
// error message. Same for /auth/refresh itself.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const is401 = error.response?.status === 401;
    if (!is401 || original._retry) return Promise.reject(error);

    const url = String(original.url || '');
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) return Promise.reject(error);

      const res = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefresh } = res.data || {};
      await SecureStore.setItemAsync('access_token', accessToken);
      await SecureStore.setItemAsync('refresh_token', newRefresh);

      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      // Cleanup must never steal the original error. Wrap it so a
      // SecureStore/logout failure doesn't turn a "session expired"
      // 401 into a generic "Login failed".
      try {
        await SecureStore.deleteItemAsync('access_token');
        await SecureStore.deleteItemAsync('refresh_token');
        const { useAuthStore } = require('../store/authStore');
        useAuthStore.getState().logout();
      } catch { /* cleanup best-effort */ }
      return Promise.reject(error);
    }
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

  // Self-serve auth flows (reset, verify, change-email, delete / cancel-delete).
  // /forgot-password always returns 200 (no enumeration). The emailed link lands
  // on the landing site — we intentionally don't build a receive-reset flow here.
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resendVerify: () => api.post('/auth/resend-verify'),
  changeEmail: ({ new_email, current_password }) =>
    api.post('/auth/change-email', { new_email, current_password }),
  requestDelete: (current_password) =>
    api.post('/auth/request-delete', { current_password }),
  cancelDelete: () => api.post('/auth/cancel-delete'),
  // Returns the user's data as a JSON attachment — caller writes it to disk
  // via expo-file-system and opens the share sheet (see ProfileScreens).
  downloadMyData: () => api.get('/auth/my-data', { responseType: 'text' }),
};

// ============================================================
// CATALOG
// ============================================================
export const catalogApi = {
  search: (params) => api.get('/catalog/search', { params }),
  get: (id) => api.get(`/catalog/${id}`),
  create: (data) => api.post('/catalog', data),
  priceHistory: (id, params) => api.get(`/catalog/${id}/price-history`, { params }),
  parallels: (id) => api.get(`/catalog/${id}/parallels`),
};

// ============================================================
// OWNED CARDS
// ============================================================
export const cardsApi = {
  mine: (params) => api.get('/cards/mine', { params }),
  get: (id) => api.get(`/cards/${id}`),
  getPrivate: (id) => api.get(`/cards/${id}/private`),
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
  comparison: () => api.get('/analytics/binders/comparison'),
  cardDetail: (linkToken, cardId) => api.get(`/b/binder/${linkToken}/card/${cardId}`),
  myCardPriceHistory: (params) => api.get('/analytics/my-cards/price-history', { params }),
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

// ============================================================
// TRADE GROUPS
// ============================================================
export const tradeGroupsApi = {
  create: (data) => api.post('/trade-groups', data),
  mine: () => api.get('/trade-groups/mine'),
  get: (id) => api.get(`/trade-groups/${id}`),
  update: (id, data) => api.patch(`/trade-groups/${id}`, data),
  remove: (id) => api.delete(`/trade-groups/${id}`),
  listInvites: (id) => api.get(`/trade-groups/${id}/invites`),
  createInvite: (id, data) => api.post(`/trade-groups/${id}/invites`, data),
  revokeInvite: (id, token) => api.delete(`/trade-groups/${id}/invites/${token}`),
  joinByToken: (token) => api.post('/trade-groups/join', { token }),
  removeMember: (id, userId) => api.delete(`/trade-groups/${id}/members/${userId}`),
};

// ============================================================
// TRADE LISTINGS
// ============================================================
// ============================================================
// SAFETY — block, report stolen, support tickets
// ============================================================
export const safetyApi = {
  blockUser: (user_id, reason) => api.post('/safety/blocks', { user_id, reason }),
  unblockUser: (userId) => api.delete(`/safety/blocks/${userId}`),
  listBlocks: () => api.get('/safety/blocks'),
  reportStolen: (data) => api.post('/safety/stolen-reports', data),
  submitSupportTicket: (data) => api.post('/safety/support', data),
};

// ============================================================
// PRICING (eBay sold comps)
// ============================================================
export const pricingApi = {
  ebay: (catalogId) => api.get('/pricing/ebay', { params: { catalog_id: catalogId } }),
};

// ============================================================
// SETS (catalog + set completion)
// ============================================================
export const setsApi = {
  list: () => api.get('/sets'),
  completion: (setCode) => api.get(`/sets/${setCode}/completion`),
  // Admin-only — returns 403 otherwise
  adminImport: (data) => api.post('/sets/admin/import', data),
  adminPending: (params) => api.get('/sets/admin/pending', { params }),
  adminApprove: (ids) => api.post('/sets/admin/approve', { ids }),
  adminReject: (ids) => api.post('/sets/admin/reject', { ids }),
};

export const tradeListingsApi = {
  create: (data) => api.post('/trade-listings', data),
  feed: (params) => api.get('/trade-listings', { params }),
  get: (id) => api.get(`/trade-listings/${id}`),
  update: (id, data) => api.patch(`/trade-listings/${id}`, data),
  bump: (id) => api.post(`/trade-listings/${id}/bump`),
  remove: (id) => api.delete(`/trade-listings/${id}`),
  // photo_front_base64 and photo_back_base64 are optional — if omitted, the
  // server re-runs verification against the photos already stored on the listing.
  verify: (id, data) => api.post(`/trade-listings/${id}/verify`, data),
};

// ============================================================
// TRADE OFFERS (uses the shared /offers endpoint with target_type='trade_listing')
// ============================================================
export const tradeOffersApi = {
  create: (data) => api.post('/offers', { target_type: 'trade_listing', ...data }),
  withdraw: (id) => api.delete(`/offers/${id}`),
};

// ============================================================
// COLLECTIONS (CSV import / export)
// ============================================================
// All three endpoints live under /collections — template is a plain GET,
// export streams back a CSV, import takes multipart/form-data with a single
// `file` field (.csv, max 10 MB / 10k rows). Auth headers are injected by
// the interceptor; for multipart we drop the default JSON Content-Type so
// axios/RN set the boundary for us.
export const collectionsApi = {
  template: () =>
    api.get('/collections/import/template', { responseType: 'text' }),
  export: ({ includePrices = false } = {}) =>
    api.get('/collections/export', {
      params: includePrices ? { include: 'prices' } : {},
      responseType: 'text',
    }),
  import: (file) => {
    // file: { uri, name, mimeType }
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name || 'collection.csv',
      type: file.mimeType || 'text/csv',
    });
    return api.post('/collections/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      transformRequest: (data) => data, // prevent axios from JSON-encoding FormData
    });
  },
};

// ============================================================
// PORTFOLIO INTELLIGENCE
// ============================================================
// Read-only blended-value + trend/liquidity/pop summaries for the
// authed user's owned cards. Backend owns the math and narration — the
// client just renders what it returns. See
// cardshop-api GET /api/collection/intelligence.
export const intelligenceApi = {
  list: ({ limit = 40, offset = 0, filter = 'all', grade } = {}) =>
    api.get('/collection/intelligence', {
      params: {
        limit,
        offset,
        filter,
        ...(grade != null && grade !== '' ? { grade } : {}),
      },
    }),
};

// ============================================================
// DEAL RADAR
// ============================================================
export const dealRadarApi = {
  getPreferences: () => api.get('/deal-radar/preferences'),
  updatePreferences: (partial) => api.patch('/deal-radar/preferences', partial),
  getFeed: ({ limit = 50 } = {}) =>
    api.get('/deal-radar/feed', { params: { limit } }),
  setStatus: (id, status) =>
    api.post(`/deal-radar/feed/${id}/action`, { status }),
};

// ============================================================
// MY LOCAL LCS
// ============================================================
export const lcsApi = {
  // shops
  shopsNearZip: (zip, radius = 100) =>
    api.get('/lcs/shops', { params: { zip, radius } }),
  getShop: (id) => api.get(`/lcs/shops/${id}`),
  submitShop: (data) => api.post('/lcs/shops', data),
  flagShop: (id) => api.post(`/lcs/shops/${id}/flag`),

  // products
  searchProducts: (params) => api.get('/lcs/products', { params }),
  getProduct: (id) => api.get(`/lcs/products/${id}`),
  submitProduct: (data) => api.post('/lcs/products', data),

  // prices
  shopPrices: (shopId) => api.get(`/lcs/shops/${shopId}/prices`),
  productPrices: (productId, params) =>
    api.get(`/lcs/products/${productId}/prices`, { params }),
  productTrend: (productId, params) =>
    api.get(`/lcs/products/${productId}/trend`, { params }),
  postPrice: (data) => api.post('/lcs/prices', data),
  removePrice: (id) => api.delete(`/lcs/prices/${id}`),
  verifyPrice: (id) => api.post(`/lcs/prices/${id}/verify`),
  unverifyPrice: (id) => api.delete(`/lcs/prices/${id}/verify`),
};

// ============================================================
// EBAY INTEGRATION (OAuth connect — gated behind feature flag)
// ============================================================
// GET /status returns { feature_enabled, connected, ebay_username,
// connected_at, env, on_waitlist }. POST /authorize returns the hosted
// eBay OAuth URL the client hands to a web-auth session; redirects land
// back on cardshop://ebay-connect?status=... — parse + refetch /status.
// POST /waitlist (flag off) and POST /disconnect (when connected) are
// simple no-body endpoints returning { ok: true }.
export const ebayApi = {
  getStatus: () => api.get('/connect/ebay/status'),
  joinWaitlist: () => api.post('/connect/ebay/waitlist'),
  authorize: () => api.post('/connect/ebay/authorize'),
  disconnect: () => api.post('/connect/ebay/disconnect'),
};

// ============================================================
// LCS ARBITRAGE
// ============================================================
// Returns { rows, zip_prefix, disclaimer } — backend already sorts rows
// by estimated_net_usd DESC. 403 with code: 'participation_required'
// means the user has not yet posted or verified a local price.
export const lcsArbitrageApi = {
  list: ({ zip }) =>
    api.get('/lcs-arbitrage', { params: { zip } }).then((r) => r.data),
};
