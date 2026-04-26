import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlashMessage from 'react-native-flash-message';

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

  useEffect(() => {
    initialize();
    initAnalytics();
    // Bootstrap RevenueCat once on app launch — safe no-op when no
    // platform key is configured (web, dev without keys).
    configureRevenueCat();
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
      <FlashMessage position="top" />
    </>
  );
};

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
