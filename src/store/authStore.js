import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

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
    try {
      const res = await authApi.me();
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401) {
        // Server says the token is invalid — legitimately logged out.
        await SecureStore.deleteItemAsync('access_token').catch((err) => console.warn('[auth] failed to clear access_token:', err?.message));
        await SecureStore.deleteItemAsync('refresh_token').catch((err) => console.warn('[auth] failed to clear refresh_token:', err?.message));
        set({ user: null, isAuthenticated: false, isLoading: false });
      } else {
        // Transient (network, 5xx, timeout). Keep tokens. Optimistically
        // treat the user as authenticated so they don't bounce to login
        // on every cold-start flake; subsequent requests will either
        // succeed or hit a real 401 and the interceptor will log out.
        set({ isAuthenticated: true, isLoading: false });
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
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  updateUser: (updates) => {
    set((state) => ({ user: { ...state.user, ...updates } }));
  },
}));
