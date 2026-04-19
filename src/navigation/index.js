import React from 'react';
import { View, Platform } from 'react-native';
import Constants from 'expo-constants';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LCS_ENABLED = Constants.expoConfig?.extra?.LCS_ENABLED === true
  || Constants.expoConfig?.extra?.LCS_ENABLED === 'true';

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
import { SearchScreen } from '../screens/SearchScreen';
import {
  BinderListScreen, BinderEditorScreen, BinderCardPickerScreen,
  PublicBinderScreen, BinderCardDetailScreen, MakeOfferScreen,
  OffersListScreen, OfferDetailScreen, TransactionScreen,
  BinderAnalyticsScreen,
} from '../screens/BinderScreens';
import { DisputeListScreen, DisputeDetailScreen } from '../screens/DisputeScreens';
import { TrustProfileScreen } from '../screens/TrustProfileScreen';
import {
  LCSHomeScreen, LCSShopListScreen, LCSShopDetailScreen,
  LCSPostPriceScreen, LCSProductPickerScreen, LCSSubmitShopScreen,
  LCSPriceTrendScreen,
} from '../screens/LCSScreens';
import {
  TradeBoardScreen, TradeListingDetailScreen, CreateTradeListingScreen,
  TradeCardPickerScreen, MakeTradeOfferScreen, TradeOfferDetailScreen,
  TradeOffersListScreen,
} from '../screens/TradeBoardScreens';
import {
  TradeGroupsListScreen, CreateTradeGroupScreen, TradeGroupDetailScreen,
  TradeGroupManageScreen, JoinTradeGroupScreen,
} from '../screens/TradeGroupsScreens';
import { TradeCameraScreen } from '../screens/TradeCameraScreen';
import { SetsListScreen, SetCompletionScreen } from '../screens/SetCompletionScreens';

const CollectionStackNav = createNativeStackNavigator();
const BinderStackNav = createNativeStackNavigator();
const SearchStackNav = createNativeStackNavigator();
const TransferStackNav = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
const LCSStackNav = createNativeStackNavigator();
const TradeStackNav = createNativeStackNavigator();
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
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'unread'],
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
          paddingBottom: insets.bottom,
          height: (Platform.OS === 'ios' ? 88 : 62) + insets.bottom,
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
        name="Binders"
        component={BinderStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
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
        name="Search"
        component={SearchStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Trade"
        component={TradeStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
        }}
      />
      {LCS_ENABLED && (
        <Tab.Screen
          name="LCS"
          component={LCSStack}
          options={{
            tabBarLabel: 'Prices',
            tabBarIcon: ({ color, size }) => <Ionicons name="pricetag" size={size} color={color} />,
          }}
        />
      )}
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: Colors.accent3, fontSize: 10 },
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
    <CollectionStackNav.Screen name="PublicBinder" component={PublicBinderScreen} />
    <CollectionStackNav.Screen name="BinderCardDetail" component={BinderCardDetailScreen} />
    <CollectionStackNav.Screen name="MakeOffer" component={MakeOfferScreen} />
    <CollectionStackNav.Screen name="TrustProfile" component={TrustProfileScreen} />
  </CollectionStackNav.Navigator>
);

const BinderStack = () => (
  <BinderStackNav.Navigator screenOptions={screenOptions}>
    <BinderStackNav.Screen name="BinderList" component={BinderListScreen} />
    <BinderStackNav.Screen name="BinderEditor" component={BinderEditorScreen} />
    <BinderStackNav.Screen name="BinderCardPicker" component={BinderCardPickerScreen} />
    <BinderStackNav.Screen name="BinderAnalytics" component={BinderAnalyticsScreen} />
    <BinderStackNav.Screen name="PublicBinder" component={PublicBinderScreen} />
    <BinderStackNav.Screen name="BinderCardDetail" component={BinderCardDetailScreen} />
    <BinderStackNav.Screen name="MakeOffer" component={MakeOfferScreen} />
    <BinderStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    <BinderStackNav.Screen name="TrustProfile" component={TrustProfileScreen} />
  </BinderStackNav.Navigator>
);

const SearchStack = () => (
  <SearchStackNav.Navigator screenOptions={screenOptions}>
    <SearchStackNav.Screen name="SearchMain" component={SearchScreen} />
    <SearchStackNav.Screen name="BinderCardDetail" component={BinderCardDetailScreen} />
    <SearchStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    <SearchStackNav.Screen name="PublicBinder" component={PublicBinderScreen} />
    <SearchStackNav.Screen name="MakeOffer" component={MakeOfferScreen} />
    <SearchStackNav.Screen name="TrustProfile" component={TrustProfileScreen} />
    <SearchStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <SearchStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
  </SearchStackNav.Navigator>
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
    <ProfileStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <ProfileStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
    <ProfileStackNav.Screen name="OffersList" component={OffersListScreen} />
    <ProfileStackNav.Screen name="OfferDetail" component={OfferDetailScreen} />
    <ProfileStackNav.Screen name="Transaction" component={TransactionScreen} />
    <ProfileStackNav.Screen name="DisputeList" component={DisputeListScreen} />
    <ProfileStackNav.Screen name="DisputeDetail" component={DisputeDetailScreen} />
    <ProfileStackNav.Screen name="TrustProfile" component={TrustProfileScreen} />
    <ProfileStackNav.Screen name="BinderList" component={BinderListScreen} />
    <ProfileStackNav.Screen name="BinderEditor" component={BinderEditorScreen} />
    <ProfileStackNav.Screen name="BinderCardPicker" component={BinderCardPickerScreen} />
    <ProfileStackNav.Screen name="BinderAnalytics" component={BinderAnalyticsScreen} />
    <ProfileStackNav.Screen name="PublicBinder" component={PublicBinderScreen} />
    <ProfileStackNav.Screen name="BinderCardDetail" component={BinderCardDetailScreen} />
    <ProfileStackNav.Screen name="MakeOffer" component={MakeOfferScreen} />
  </ProfileStackNav.Navigator>
);

const LCSStack = () => (
  <LCSStackNav.Navigator screenOptions={screenOptions}>
    <LCSStackNav.Screen name="LCSHome" component={LCSHomeScreen} />
    <LCSStackNav.Screen name="LCSShopList" component={LCSShopListScreen} />
    <LCSStackNav.Screen name="LCSShopDetail" component={LCSShopDetailScreen} />
    <LCSStackNav.Screen name="LCSPostPrice" component={LCSPostPriceScreen} />
    <LCSStackNav.Screen name="LCSProductPicker" component={LCSProductPickerScreen} />
    <LCSStackNav.Screen name="LCSSubmitShop" component={LCSSubmitShopScreen} />
    <LCSStackNav.Screen name="LCSPriceTrend" component={LCSPriceTrendScreen} />
  </LCSStackNav.Navigator>
);

const TradeStack = () => (
  <TradeStackNav.Navigator screenOptions={screenOptions}>
    <TradeStackNav.Screen name="TradeBoardMain" component={TradeBoardScreen} />
    <TradeStackNav.Screen name="TradeListingDetail" component={TradeListingDetailScreen} />
    <TradeStackNav.Screen name="CreateTradeListing" component={CreateTradeListingScreen} />
    <TradeStackNav.Screen name="TradeCardPicker" component={TradeCardPickerScreen} />
    <TradeStackNav.Screen name="MakeTradeOffer" component={MakeTradeOfferScreen} />
    <TradeStackNav.Screen name="TradeOfferDetail" component={TradeOfferDetailScreen} />
    <TradeStackNav.Screen name="TradeOffersList" component={TradeOffersListScreen} />
    <TradeStackNav.Screen name="TradeGroupsList" component={TradeGroupsListScreen} />
    <TradeStackNav.Screen name="CreateTradeGroup" component={CreateTradeGroupScreen} />
    <TradeStackNav.Screen name="TradeGroupDetail" component={TradeGroupDetailScreen} />
    <TradeStackNav.Screen name="TradeGroupManage" component={TradeGroupManageScreen} />
    <TradeStackNav.Screen name="JoinTradeGroup" component={JoinTradeGroupScreen} />
    <TradeStackNav.Screen name="TradeCameraCapture" component={TradeCameraScreen} />
    <TradeStackNav.Screen name="SetsList" component={SetsListScreen} />
    <TradeStackNav.Screen name="SetCompletion" component={SetCompletionScreen} />
  </TradeStackNav.Navigator>
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
// DEEP LINKING CONFIG
// cardshop://join?token=XXX   → TradeGroups › JoinTradeGroup with token param
// cardshop://trade/<id>       → TradeListingDetail
// ============================================================
const linkingConfig = {
  prefixes: ['cardshop://', 'https://admin.twomiah.com'],
  config: {
    screens: {
      Trade: {
        screens: {
          JoinTradeGroup: 'join',
          TradeListingDetail: 'trade/:listingId',
          TradeBoardMain: 'trade',
        },
      },
    },
  },
};

// ============================================================
// ROOT NAVIGATOR
// ============================================================
export const RootNavigator = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <NavigationContainer linking={isAuthenticated ? linkingConfig : undefined}>
      {isAuthenticated ? <TabNavigator /> : <AuthStack />}
    </NavigationContainer>
  );
};
