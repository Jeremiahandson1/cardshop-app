import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FlashMessage from 'react-native-flash-message';

import { RootNavigator } from './src/navigation';
import { useAuthStore } from './src/store/authStore';
import { LoadingScreen } from './src/components/ui';
import { Colors } from './src/theme';
import { registerForPushNotificationsAsync } from './src/services/pushRegistration';

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
  }, [initialize]);

  // Once authenticated, register for push notifications. Safe to call repeatedly.
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotificationsAsync();
    }
  }, [isAuthenticated]);

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
