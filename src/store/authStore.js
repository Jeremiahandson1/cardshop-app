import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '../services/api';

export const useAuthStore = create((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  // Called on app launch to restore session
  initialize: async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      if (!token) {
        set({ isLoading: false, isAuthenticated: false });
        return;
      }
      const res = await authApi.me();
      set({ user: res.data, isAuthenticated: true, isLoading: false });
    } catch {
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user, accessToken, refreshToken } = res.data;
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    set({ user, isAuthenticated: true });
    return user;
  },

  register: async (data) => {
    const res = await authApi.register(data);
    const { user, accessToken, refreshToken } = res.data;
    await SecureStore.setItemAsync('access_token', accessToken);
    await SecureStore.setItemAsync('refresh_token', refreshToken);
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    set((state) => ({ user: { ...state.user, ...updates } }));
  },
}));
