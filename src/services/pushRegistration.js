import { Platform, Linking } from 'react-native';
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

/**
 * Wires up a listener so tapping a notification can deep-link into the app.
 * Returns an unsubscribe function.
 *
 * Expected payload shapes (set by the server-side dispatcher):
 *   - { type: 'deal_radar_match', listing_url, listing_id }  → open feed, then listing_url
 *
 * `navigationRef` is optional — when provided, we navigate in-app to the
 * Deal Radar feed before handing the user off to the external listing.
 */
export function registerNotificationResponseHandler(navigationRef) {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    try {
      const data = response?.notification?.request?.content?.data || {};
      if (data?.type === 'deal_radar_match') {
        // Navigate to the Deal Radar feed inside the app.
        if (navigationRef?.current?.isReady?.()) {
          navigationRef.current.navigate('Profile', { screen: 'DealRadarFeed' });
        }
        // Open the external listing URL if supplied.
        if (data.listing_url) {
          Linking.openURL(String(data.listing_url)).catch((err) => {
            console.warn('Failed to open listing_url from push', err?.message);
          });
        }
      }
    } catch (err) {
      console.warn('notification response handler error', err?.message);
    }
  });
  return () => sub.remove();
}
