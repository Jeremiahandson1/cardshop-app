import 'react-native-gesture-handler';
import React, { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlashMessage, { showMessage } from 'react-native-flash-message';
import * as Updates from 'expo-updates';

// Global JS error handler — surfaces the message in an Alert so we
// can capture the actual error when something crashes mid-flow.
// Without this the user sees the red screen / hard crash with no
// useful info to share. Logs to console too so a tethered Mac
// session picks it up via adb logcat / Console.app.
if (typeof ErrorUtils !== 'undefined' && ErrorUtils.setGlobalHandler) {
  const origHandler = ErrorUtils.getGlobalHandler && ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((err, isFatal) => {
    try {
      console.error('[global]', isFatal ? 'FATAL' : 'non-fatal', err?.message, err?.stack);
      Alert.alert(
        isFatal ? 'App error (fatal)' : 'App error',
        `${err?.message || 'Unknown error'}\n\n${(err?.stack || '').split('\n').slice(0, 6).join('\n')}`,
      );
    } catch {}
    if (origHandler) origHandler(err, isFatal);
  });
}

import { RootNavigator } from './src/navigation';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import ImpersonationBanner from './src/components/ImpersonationBanner';
import { useAuthStore } from './src/store/authStore';
import { LoadingScreen } from './src/components/ui';
import { Colors } from './src/theme';
import { registerForPushNotificationsAsync } from './src/services/pushRegistration';
import { initAnalytics, analytics } from './src/services/analytics';
import {
  configureRevenueCat,
  linkRevenueCatUser,
  unlinkRevenueCatUser,
} from './src/lib/revenuecat';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 60 * 2,
      refetchOnWindowFocus: false,
    },
  },
});

const AppInner = () => {
  const initialize = useAuthStore((s) => s.initialize);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // OTA update handler — runs on launch + every time the app
  // returns to foreground. Aggressive about checking but
  // non-disruptive about applying: never reloads mid-session,
  // just downloads + queues for next cold start. User can also
  // tap "Install update" if they want to apply immediately.
  const otaCheckingRef = useRef(false);
  const checkAndFetchUpdate = async ({ reloadIfReady = false } = {}) => {
    if (otaCheckingRef.current) return;
    if (__DEV__) return;
    otaCheckingRef.current = true;
    try {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return;
      await Updates.fetchUpdateAsync();
      // Surface a banner so the user knows an update is queued.
      // If they pulled into the app moments ago and we just
      // finished downloading, offer immediate apply via Alert.
      if (reloadIfReady) {
        await Updates.reloadAsync();
      } else {
        showMessage({
          message: 'Update ready',
          description: 'A new version downloaded. Restart the app to apply, or it will load automatically next time you open Card Shop.',
          type: 'success',
          duration: 6000,
          autoHide: true,
        });
      }
    } catch (err) {
      console.warn('[ota] check failed:', err?.message || err);
    } finally {
      otaCheckingRef.current = false;
    }
  };

  useEffect(() => {
    initialize();
    initAnalytics();
    configureRevenueCat();
    // Initial OTA check on cold start. Apply immediately on cold
    // start since user just opened the app and won't lose state.
    checkAndFetchUpdate({ reloadIfReady: true });

    // Re-check every time the app comes back to foreground. Catches
    // the case where the user backgrounds the app for a while, we
    // ship an OTA, they return — they shouldn't have to force-close.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkAndFetchUpdate({ reloadIfReady: false });
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialize]);

  // Once authenticated, register for push + identify to analytics +
  // alias the RevenueCat anonymous purchaser to our user_id so the
  // server-side webhook can map purchases back to a Card Shop user.
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotificationsAsync();
      if (user?.id) {
        analytics.identify(user.id, {
          email: user.email,
          username: user.username,
        });
        linkRevenueCatUser(user.id);
      }
    } else {
      analytics.reset();
      unlinkRevenueCatUser();
    }
  }, [isAuthenticated, user?.id]);

  if (isLoading) return <LoadingScreen message="Card Shop by Twomiah" />;

  return (
    <>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <RootNavigator />
      <ImpersonationBanner />
      <FlashMessage position="top" />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
