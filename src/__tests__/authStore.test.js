// Mock expo-secure-store before importing anything
jest.mock('expo-secure-store', () => {
  const store = {};
  return {
    getItemAsync: jest.fn((key) => Promise.resolve(store[key] || null)),
    setItemAsync: jest.fn((key, value) => { store[key] = value; return Promise.resolve(); }),
    deleteItemAsync: jest.fn((key) => { delete store[key]; return Promise.resolve(); }),
    _clear: () => Object.keys(store).forEach(k => delete store[k]),
  };
});

jest.mock('../services/api', () => ({
  authApi: {
    me: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
  },
}));

const SecureStore = require('expo-secure-store');
const { authApi } = require('../services/api');
const { useAuthStore } = require('../store/authStore');

beforeEach(() => {
  SecureStore._clear();
  jest.clearAllMocks();
  useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false });
});

describe('useAuthStore', () => {
  describe('initialize', () => {
    it('sets isLoading false when no token stored', async () => {
      await useAuthStore.getState().initialize();
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it('restores user session when token exists', async () => {
      SecureStore.getItemAsync.mockResolvedValue('valid-token');
      authApi.me.mockResolvedValue({ data: { id: '1', email: 'test@test.com' } });
      await useAuthStore.getState().initialize();
      expect(useAuthStore.getState().user).toEqual({ id: '1', email: 'test@test.com' });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('clears tokens on auth failure', async () => {
      SecureStore.getItemAsync.mockResolvedValue('expired-token');
      authApi.me.mockRejectedValue(new Error('unauthorized'));
      await useAuthStore.getState().initialize();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('login', () => {
    it('stores tokens and sets user', async () => {
      authApi.login.mockResolvedValue({
        data: {
          user: { id: '1', username: 'test' },
          accessToken: 'at',
          refreshToken: 'rt',
        },
      });
      const result = await useAuthStore.getState().login('test@test.com', 'pass');
      // login() now returns { user, deletion_cancelled } so the caller can
      // show a "welcome back — we cancelled deletion" toast when applicable.
      expect(result.user).toEqual({ id: '1', username: 'test' });
      expect(result.deletion_cancelled).toBe(false);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'at');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('refresh_token', 'rt');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('flags deletion_cancelled when the server cancelled a pending deletion', async () => {
      authApi.login.mockResolvedValue({
        data: {
          user: { id: '1', username: 'test' },
          accessToken: 'at',
          refreshToken: 'rt',
          deletion_cancelled: true,
        },
      });
      const result = await useAuthStore.getState().login('test@test.com', 'pass');
      expect(result.deletion_cancelled).toBe(true);
    });

    it('propagates errors', async () => {
      authApi.login.mockRejectedValue(new Error('Invalid credentials'));
      await expect(useAuthStore.getState().login('bad@test.com', 'wrong'))
        .rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('stores tokens and sets user', async () => {
      authApi.register.mockResolvedValue({
        data: {
          user: { id: '2', username: 'new' },
          accessToken: 'at2',
          refreshToken: 'rt2',
        },
      });
      const user = await useAuthStore.getState().register({ email: 'a@b.com' });
      expect(user).toEqual({ id: '2', username: 'new' });
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('access_token', 'at2');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears tokens and resets state', async () => {
      useAuthStore.setState({ user: { id: '1' }, isAuthenticated: true });
      await useAuthStore.getState().logout();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('refresh_token');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('updateUser', () => {
    it('merges updates into current user', () => {
      useAuthStore.setState({ user: { id: '1', username: 'old', email: 'a@b.com' } });
      useAuthStore.getState().updateUser({ username: 'new' });
      expect(useAuthStore.getState().user).toEqual({ id: '1', username: 'new', email: 'a@b.com' });
    });
  });
});
