import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi, adminApi } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  // When set, the app is acting as another user (admin support /
  // show-floor intake). { asUsername, adminUsername }. The real
  // admin tokens are stashed in SecureStore under _admin_*.
  impersonating: null,

  // Optimistic patch of the user object — used after a Pro
  // purchase clears StoreKit but before the RevenueCat webhook
  // round-trips back to set our DB tier. Caller passes the new
  // user shape (or partial); we shallow-merge so callers don't
  // have to reconstruct the whole object.
  setUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : patch })),

  // Refresh the current user from /auth/me. Use this after a
  // tier-flipping event (purchase, cancel) to converge with
  // server state. Failures are swallowed — the next render path
  // will eventually see the right tier.
  refreshUser: async () => {
    try {
      const res = await authApi.me();
      set({ user: res.data });
      return res.data;
    } catch {
      return null;
    }
  },

  // Called on app launch to restore session.
  // Only wipe tokens on a DEFINITIVE unauthenticated response (401).
  // Transient errors (cold-start timeout, 5xx, offline) must not log
  // the user out — that causes the "I was just signed in, why is the
  // app back at the login screen after I restart it" bug.
  initialize: async () => {
    let token;
    try {
      token = await SecureStore.getItemAsync('access_token');
    } catch {
      // Keystore read failure — assume not logged in this boot but
      // don't clobber any stored creds; next boot can retry.
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    // Survive a restart mid-impersonation: if the stash exists the
    // active token is the impersonated one, so me() returns the
    // impersonated user and we re-show the banner + Stop control.
    let imp = null;
    try {
      const raw = await SecureStore.getItemAsync('_impersonating');
      if (raw) imp = JSON.parse(raw);
    } catch { /* ignore */ }
    try {
      const res = await authApi.me();
      set({ user: res.data, isAuthenticated: true, isLoading: false, impersonating: imp });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        // Server says the token is invalid — legitimately logged out.
        await SecureStore.deleteItemAsync('access_token').catch((err) => console.warn('[auth] failed to clear access_token:', err?.message));
        await SecureStore.deleteItemAsync('refresh_token').catch((err) => console.warn('[auth] failed to clear refresh_token:', err?.message));
        await SecureStore.deleteItemAsync('_impersonating').catch(() => {});
        await SecureStore.deleteItemAsync('_admin_access_token').catch(() => {});
        await SecureStore.deleteItemAsync('_admin_refresh_token').catch(() => {});
        set({ user: null, isAuthenticated: false, isLoading: false, impersonating: null });
      } else {
        // Transient (network, 5xx, timeout). Keep tokens. Optimistically
        // treat the user as authenticated so they don't bounce to login
        // on every cold-start flake; subsequent requests will either
        // succeed or hit a real 401 and the interceptor will log out.
        set({ isAuthenticated: true, isLoading: false, impersonating: imp });
      }
    }
  },

  login: async (email, password, totpCode) => {
    const res = await authApi.login({
      email, password,
      ...(totpCode ? { totp_code: totpCode } : {}),
    });
    const { user, accessToken, refreshToken, deletion_cancelled } = res.data || {};
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    set({ user, isAuthenticated: true });
    // Return the full login payload so the caller can surface welcome-back
    // messaging when the server cancelled a pending deletion.
    return { user, deletion_cancelled: !!deletion_cancelled };
  },

  register: async (data) => {
    const res = await authApi.register(data);
    const { user, accessToken, refreshToken } = res.data || {};
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    // Nuke any impersonation stash too — never leak a prior
    // admin's tokens across a logout.
    await SecureStore.deleteItemAsync('_admin_access_token').catch(() => {});
    await SecureStore.deleteItemAsync('_admin_refresh_token').catch(() => {});
    await SecureStore.deleteItemAsync('_impersonating').catch(() => {});
    set({ user: null, isAuthenticated: false, isLoading: false, impersonating: null });
  },

  // Admin → act as another user. The API call runs FIRST while
  // still admin-authed; only on success do we stash the admin
  // tokens and swap the live tokens to the impersonated session.
  // So a failed call leaves the session completely untouched.
  // The api.js request interceptor reads access_token from
  // SecureStore on every request, so the swap takes effect
  // immediately with no app reload.
  impersonate: async (targetUserId) => {
    const me = get().user;
    if (me?.role !== 'admin') throw new Error('Admin only');
    if (get().impersonating) throw new Error('Already impersonating — stop first');

    const res = await adminApi.impersonate(targetUserId); // still admin-authed
    const { user: asUser, accessToken, refreshToken } = res.data || {};
    if (!asUser || !accessToken || !refreshToken) {
      throw new Error('Impersonation response malformed');
    }

    // Stash the real admin tokens, then swap.
    const adminAccess = await SecureStore.getItemAsync('access_token');
    const adminRefresh = await SecureStore.getItemAsync('refresh_token');
    if (adminAccess) await SecureStore.setItemAsync('_admin_access_token', adminAccess);
    if (adminRefresh) await SecureStore.setItemAsync('_admin_refresh_token', adminRefresh);

    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);

    const ctx = {
      asUsername: asUser.username || asUser.display_name || 'user',
      adminUsername: me.username || me.display_name || 'admin',
    };
    await SecureStore.setItemAsync('_impersonating', JSON.stringify(ctx));
    set({ user: asUser, isAuthenticated: true, impersonating: ctx });
    return asUser;
  },

  // Revert to the real admin session.
  stopImpersonating: async () => {
    const adminAccess = await SecureStore.getItemAsync('_admin_access_token');
    const adminRefresh = await SecureStore.getItemAsync('_admin_refresh_token');
    if (adminAccess && adminRefresh) {
      await SecureStore.setItemAsync('access_token', adminAccess);
      await SecureStore.setItemAsync('refresh_token', adminRefresh);
    }
    await SecureStore.deleteItemAsync('_admin_access_token').catch(() => {});
    await SecureStore.deleteItemAsync('_admin_refresh_token').catch(() => {});
    await SecureStore.deleteItemAsync('_impersonating').catch(() => {});
    set({ impersonating: null });
    // Re-resolve the admin user from the restored token. If this
    // flakes (network), we still cleared impersonation; the next
    // authed request runs as admin again.
    try {
      const res = await authApi.me();
      set({ user: res.data, isAuthenticated: true });
    } catch { /* keep restored tokens; user converges on next call */ }
  },

  updateUser: (updates) => {
    set((state) => ({ user: { ...state.user, ...updates } }));
  },
}));
