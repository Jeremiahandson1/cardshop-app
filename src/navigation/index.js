import React from 'react';
import { View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { useAuthStore } from '../store/authStore';
import { notificationsApi } from '../services/api';
import { Colors, Typography } from '../theme';

// Screens
import { LoginScreen, RegisterScreen } from '../screens/AuthScreens';
import { CollectionScreen } from '../screens/CollectionScreen';
import { RegisterCardScreen, CardDetailScreen } from '../screens/CardScreens';
import { QRScannerScreen } from '../screens/QRScannerScreen';
import { InitiateTransferScreen, TransfersScreen } from '../screens/TransferScreens';
import { DiscoverScreen, NotificationsScreen } from '../screens/DiscoverScreens';
import { ProfileScreen, WantListScreen } from '../screens/ProfileScreens';

const CollectionStackNav = createNativeStackNavigator();
const DiscoverStackNav = createNativeStackNavigator();
const TransferStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
const AuthStackNav = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: Colors.bg },
  animation: 'slide_from_right',
};

// ============================================================
// BOTTOM TAB NAVIGATOR
// ============================================================
const TabNavigator = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: notifData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.get({ unread_only: true, limit: 1 }).then((r) => r.data),
    enabled: isAuthenticated,
    refetchInterval: 30000, // poll every 30s
  });

  const unreadCount = notifData?.unread_count || 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          paddingTop: 6,
          height: Platform.OS === 'ios' ? 88 : 62,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: Typography.xs,
          fontWeight: Typography.semibold,
          marginBottom: Platform.OS === 'ios' ? 0 : 6,
        },
      }}
    >
      <Tab.Screen
        name="Collection"
        component={CollectionStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Discover"
        component={DiscoverStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Scan"
        component={QRScannerScreen}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: Colors.accent,
              alignItems: 'center', justifyContent: 'center',
              marginTop: -20,
              shadowColor: Colors.accent,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <Ionicons name="qr-code" size={24} color={Colors.bg} />
            </View>
          ),
          tabBarLabel: '',
        }}
      />
      <Tab.Screen
        name="Transfers"
        component={TransferStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.accent3, fontSize: 10 },
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tab.Navigator>
  );
};

// ============================================================
// STACK NAVIGATORS (nested in tabs)
// ============================================================
const CollectionStack = () => (
  <CollectionStackNav.Navigator screenOptions={screenOptions}>
    <CollectionStackNav.Screen name="CollectionMain" component={CollectionScreen} />
    <CollectionStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    <CollectionStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <CollectionStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
    <CollectionStackNav.Screen name="QRScanner" component={QRScannerScreen} />
  </CollectionStackNav.Navigator>
);

const DiscoverStack = () => (
  <DiscoverStackNav.Navigator screenOptions={screenOptions}>
    <DiscoverStackNav.Screen name="DiscoverMain" component={DiscoverScreen} />
    <DiscoverStackNav.Screen name="QRScanner" component={QRScannerScreen} />
    <DiscoverStackNav.Screen name="CardDetail" component={CardDetailScreen} />
  </DiscoverStackNav.Navigator>
);

const TransferStack = () => (
  <TransferStackNav.Navigator screenOptions={screenOptions}>
    <TransferStackNav.Screen name="TransfersMain" component={TransfersScreen} />
    <TransferStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
    <TransferStackNav.Screen name="CardDetail" component={CardDetailScreen} />
  </TransferStackNav.Navigator>
);

const ProfileStack = () => (
  <ProfileStackNav.Navigator screenOptions={screenOptions}>
    <ProfileStackNav.Screen name="ProfileMain" component={ProfileScreen} />
    <ProfileStackNav.Screen name="WantList" component={WantListScreen} />
    <ProfileStackNav.Screen name="Notifications" component={NotificationsScreen} />
    <ProfileStackNav.Screen name="Transfers" component={TransfersScreen} />
    <ProfileStackNav.Screen name="Discover" component={DiscoverScreen} />
    <ProfileStackNav.Screen name="QRScanner" component={QRScannerScreen} />
    <ProfileStackNav.Screen name="CardDetail" component={CardDetailScreen} />
  </ProfileStackNav.Navigator>
);

// ============================================================
// AUTH STACK
// ============================================================
const AuthStack = () => (
  <AuthStackNav.Navigator screenOptions={{ ...screenOptions, animation: 'fade' }}>
    <AuthStackNav.Screen name="Login" component={LoginScreen} />
    <AuthStackNav.Screen name="Register" component={RegisterScreen} />
  </AuthStackNav.Navigator>
);

// ============================================================
// ROOT NAVIGATOR
// ============================================================
export const RootNavigator = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer>
      {isAuthenticated ? <TabNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
};
