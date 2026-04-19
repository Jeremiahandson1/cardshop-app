import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from './api';

// How tokens get delivered when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Ask for permission, fetch an Expo push token, and register it with the API.
 * Safe to call repeatedly — the backend upserts on token uniqueness.
 * Silently no-ops on simulators / unsupported environments.
 */
export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
      || Constants.easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp.data;
    if (!token) return null;

    await api.post('/push-tokens/register', {
      token,
      platform: Platform.OS,
      device_name: Device.modelName || undefined,
    });

    return token;
  } catch (err) {
    console.warn('push registration failed', err.message);
    return null;
  }
}
