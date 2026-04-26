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

// Loud warning when a production build somehow ends up pointing at
// localhost — typically means EXPO_PUBLIC_API_URL is missing from the
// EAS profile AND app.json's extra.API_URL was emptied. Without this
// the entire app silently 404s and looks like a backend outage.
if (!__DEV__ && API_URL.includes('localhost')) {
  console.error(
    '[api] PRODUCTION BUILD POINTING AT LOCALHOST. ' +
    'EXPO_PUBLIC_API_URL or app.json extra.API_URL must be set.',
  );
}

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Inject access token on every request.
// SecureStore can throw on some Android devices (keystore edge cases).
// If it does, the request MUST still go out — otherwise a broken
// keystore means a user can't even log in to fix it. Guard with
// try/catch so the request proceeds without auth if needed.
api.interceptors.request.use(async (config) => {
  try {
    const token = await SecureStore.getItemAsync('access_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (err) {
    console.warn('SecureStore read failed; request proceeds unauth:', err?.message);
  }
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
  // Live active-listing asks on eBay, plus links to research sold
  // prices on third-party tools (we don't host sold comps).
  marketAsks: (id) => api.get(`/catalog/${id}/market-asks`),
  create: (data) => api.post('/catalog', data),
  priceHistory: (id, params) => api.get(`/catalog/${id}/price-history`, { params }),
  parallels: (id) => api.get(`/catalog/${id}/parallels`),
  // Browse-by-set endpoints, used after the manufacturer-checklist
  // importer fills card_catalog. Distinct (mfr, year, set) + full
  // card list for a specific set.
  listSets: (params) => api.get('/catalog/sets', { params }),
  setCards: (params) => api.get('/catalog/sets/cards', { params }),
  // Cascading registration — returns distinct values for one
  // dimension filtered by any of the others.
  // Example: filterValues({ dimension: 'set_name', sport: 'football', year: 2025, manufacturer: 'Panini' })
  //   → { values: ['Prizm', 'Mosaic', ...] }
  filterValues: (params) => api.get('/catalog/filter-values', { params }),
  // POST a base64 card photo, get ranked catalog candidates.
  // Returns 503 + code='ocr_not_configured' when GOOGLE_VISION_API_KEY
  // isn't set on the API — the Scan button stays visible but
  // raises an alert explaining it's coming soon.
  ocrSuggest: (image_base64) => api.post('/catalog/ocr-suggest', { image_base64 }, { timeout: 30_000 }),
  // Cert lookup for graded slabs. Always returns already_claimed
  // status regardless of whether PSA is configured; slab metadata
  // + images populate only when PSA_API_TOKEN is set upstream.
  certLookup: ({ company, cert_number }) =>
    api.post('/catalog/cert-lookup', { company, cert_number }),
};

// ============================================================
// OWNED CARDS
// ============================================================
export const cardsApi = {
  mine: (params) => api.get('/cards/mine', { params }),
  get: (id) => api.get(`/cards/${id}`),
  getPrivate: (id) => api.get(`/cards/${id}/private`),
  // Register/update may include base64 photos — each image is
  // 200-500 KB, then uploaded to Cloudinary server-side. Give the
  // request a generous timeout so Cloudinary has time to ingest on
  // slow connections instead of failing fast.
  register: (data) => api.post('/cards', data, { timeout: 90_000 }),
  update: (id, data) => api.patch(`/cards/${id}`, data, { timeout: 90_000 }),
  delete: (id) => api.delete(`/cards/${id}`),
  history: (id) => api.get(`/cards/${id}/history`),
  // "This is actually my card, not theirs." Files a counter-claim
  // on a graded cert. Only useful for non-owners viewing a card.
  counterClaim: (id, { reason, evidence_url } = {}) =>
    api.post(`/cards/${id}/counter-claim`, { reason, evidence_url }),
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
// TWO-FACTOR AUTH — mirrors the dashboard's /security page.
// ============================================================
// Notification preferences — granular per-category opt out across
// push / email / in_app channels. Server merges partial PATCH
// updates into the user's JSONB.
export const notificationPrefsApi = {
  get: () => api.get('/notification-prefs'),
  update: (updates) => api.patch('/notification-prefs', { updates }),
};

export const twoFactorApi = {
  status: () => api.get('/auth/2fa/status'),
  setup: () => api.post('/auth/2fa/setup'),
  verify: (code) => api.post('/auth/2fa/verify', { code }),
  disable: (password, code) => api.post('/auth/2fa/disable', { password, code }),
  regenerateBackupCodes: (password) =>
    api.post('/auth/2fa/backup-codes/regenerate', { password }),
};

// Sticker reprints — owner requests a replacement QR sticker.
// Fee is $2/single. Old sticker superseded at request time.
export const stickerReprintApi = {
  request: (cardId, data) => api.post(`/cards/${cardId}/reprint-request`, data),
};

// ============================================================
// STORE INVENTORY — for store_staff + store_owner roles only.
// Back-end gates every call by role + store_staff membership.
// ============================================================
export const storeInventoryApi = {
  myLocations: () => api.get('/store-inventory/my-locations'),
  search: (params) => api.get('/store-inventory/search', { params }),
  getCard: (id) => api.get(`/store-inventory/card/${id}`),
  transferRequests: (params) =>
    api.get('/store-inventory/transfer-requests', { params }),
  createTransferRequest: (data) =>
    api.post('/store-inventory/transfer-requests', data),
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
// SUPPORT / FEEDBACK
// ============================================================
// Sends to the existing /api/safety/support endpoint which lands
// rows in support_tickets. Admins see these in the dashboard.
export const supportApi = {
  file: ({ subject, body, category, context_data, contact_email }) =>
    api.post('/safety/support', {
      subject, body, category, context_data, contact_email,
    }),
};

// ============================================================
// BILLING (Card Shop Pro — dormant until Stripe env vars set)
// ============================================================
// status() always returns successfully with tier='free' if billing
// isn't configured. checkout() returns 503 billing_not_configured
// so the app can hide the Upgrade CTA instead of hard-erroring.
export const billingApi = {
  status: () => api.get('/billing/status'),
  checkout: ({ successUrl, cancelUrl } = {}) =>
    api.post('/billing/checkout', { successUrl, cancelUrl }),
  // Stripe Customer Portal — short-lived URL we open in the
  // system browser for payment/cancel/invoice management.
  portalUrl: () => api.post('/billing/portal'),
};

// ============================================================
// MESSAGES
// ============================================================
// Card-scoped in-app chat. Every message persists for dispute
// resolution (no edit / delete). Send goes through /messages
// which find-or-creates a conversation keyed on the two users +
// optional owned_card_id.
export const messagesApi = {
  conversations: () => api.get('/messages/conversations'),
  thread: (conversationId) => api.get(`/messages/conversations/${conversationId}`),
  // Back-compat alias used by a couple of older callers; prefer
  // .thread() for new code.
  getMessages: (id) => api.get(`/messages/conversations/${id}`),
  send: ({ to_user_id, to_username, owned_card_id, body }) =>
    api.post('/messages', { to_user_id, to_username, owned_card_id, body }),
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
  // Browse every set in the catalog (with ?q= typeahead and a
  // `subscribed` flag per row). Use mine() for the Sets tab's
  // default view; list() is for the Add/Browse screen.
  list: (params) => api.get('/sets', { params }),
  mine: () => api.get('/sets/mine'),
  subscribe: ({ manufacturer, year, set_name }) =>
    api.post('/sets/subscribe', { manufacturer, year, set_name }),
  unsubscribe: ({ manufacturer, year, set_name }) =>
    api.delete('/sets/subscribe', { data: { manufacturer, year, set_name } }),
  completion: (setCode) => api.get(`/sets/${setCode}/completion`),
  // Admin-only — returns 403 otherwise
  adminImport: (data) => api.post('/sets/admin/import', data),
  adminPending: (params) => api.get('/sets/admin/pending', { params }),
  adminApprove: (ids) => api.post('/sets/admin/approve', { ids }),
  adminReject: (ids) => api.post('/sets/admin/reject', { ids }),
};

export const listingDefaultsApi = {
  // GET → { defaults }, PUT → save merged defaults. See migration 032
  // and src/routes/listing-defaults.js.
  get: () => api.get('/listing-defaults'),
  save: (data) => api.put('/listing-defaults', data),
};

export const tradeListingsApi = {
  create: (data) => api.post('/trade-listings', data),
  feed: (params) => api.get('/trade-listings', { params }),
  // Returns the viewer's own listings (active + withdrawn). The
  // public feed intentionally hides these.
  mine: () => api.get('/trade-listings/mine'),
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
  // Edit a pending offer you sent — swap cards, change cash, update
  // message. Backend refuses once status !== 'pending'.
  edit: (id, data) => api.patch(`/offers/${id}`, data),
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
  // Wipes the caller's snapshots + scoped eBay cache so the next
  // list() call rebuilds every row from fresh comps. Used after
  // a provider cred swap (sandbox → production) or when the user
  // wants to force-rebuild intelligence.
  refresh: () => api.post('/collection/intelligence/refresh'),
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
