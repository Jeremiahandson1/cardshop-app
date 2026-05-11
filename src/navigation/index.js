import React, { useEffect, useRef, useState } from 'react';
import { View, Platform } from 'react-native';
import Constants from 'expo-constants';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { registerNotificationResponseHandler } from '../services/pushRegistration';
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
import { LoginScreen, RegisterScreen, ForgotPasswordScreen } from '../screens/AuthScreens';
import { SuspendedScreen } from '../screens/SuspendedScreen';
import { HomeHubScreen } from '../screens/HomeHubScreen';
import { CollectionScreen } from '../screens/CollectionScreen';
import { CollectionImportExportScreen } from '../screens/CollectionImportExportScreen';
import { RegisterCardScreen, CardDetailScreen, EditCardScreen } from '../screens/CardScreens';
import { StoreIntakeScreen } from '../screens/StoreIntakeScreen';
import { RequestReprintScreen } from '../screens/RequestReprintScreen';
import { OrderStickersScreen } from '../screens/OrderStickersScreen';
import { OnboardingScreen, OnboardingOverlay, ONBOARDING_SEEN_KEY } from '../screens/OnboardingScreen';
import { ListingDefaultsScreen } from '../screens/ListingDefaultsScreen';
import * as SecureStore from 'expo-secure-store';
import { SecurityScreen } from '../screens/SecurityScreen';
import { SubscriptionManageScreen } from '../screens/SubscriptionManageScreen';
import { NotificationPreferencesScreen } from '../screens/NotificationPreferencesScreen';
import { ConversationListScreen, ConversationScreen } from '../screens/MessagesScreens';
import { UpgradeScreen } from '../screens/UpgradeScreen';
import { FeedbackScreen } from '../screens/FeedbackScreen';
import { QRScannerScreen } from '../screens/QRScannerScreen';
import { InitiateTransferScreen, TransfersScreen } from '../screens/TransferScreens';
import { DiscoverScreen, NotificationsScreen } from '../screens/DiscoverScreens';
import {
  ProfileScreen, WantListScreen,
  ChangeEmailScreen, DownloadDataScreen, DeleteAccountScreen,
} from '../screens/ProfileScreens';
import { ProTaggingScreen } from '../screens/ProTaggingScreen';
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
import { LCSArbitrageScreen } from '../screens/LCSArbitrageScreen';
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
import { TransferVideoScreen } from '../screens/TransferVideoScreen';
import { StalledTransferReportScreen } from '../screens/StalledTransferReportScreen';
import { CaseModeScreen } from '../screens/CaseModeScreen';
import { CardChainScreen } from '../screens/CardChainScreen';
import { StolenMatchReviewScreen } from '../screens/StolenMatchReviewScreen';
import {
  ShowFloorHubScreen, ShowFloorCheckInScreen, ShowFloorEventScreen, ShowFloorUserScreen, ShowFloorShopScreen,
} from '../screens/ShowFloorScreens';
import { ManageBoothScreen } from '../screens/ManageBoothScreen';
import { ShowFloorUpsellScreen } from '../screens/ShowFloorUpsellScreen';
import { SetsListScreen, SetCompletionScreen, BrowseSetsScreen } from '../screens/SetCompletionScreens';
import { HelpScreen, ReportStolenScreen, FirstTradeSafetyScreen } from '../screens/HelpScreens';
import { DealRadarSettingsScreen } from '../screens/DealRadarSettingsScreen';
import { DealRadarFeedScreen } from '../screens/DealRadarFeedScreen';
import { IntegrationsScreen } from '../screens/IntegrationsScreen';
import { WalletScreen, PayoutScreen, TopupScreen } from '../screens/WalletScreen';
import {
  MarketplaceHomeScreen, MarketplaceSearchScreen, ListingDetailScreen, SavedSearchesScreen,
} from '../screens/MarketplaceScreens';
import { CartListScreen, CartDetailScreen, CheckoutScreen } from '../screens/CartScreens';
import {
  MyListingsScreen, CreateListingScreen, MyOrdersScreen,
  OrderDetailScreen, FileOrderDisputeScreen,
} from '../screens/SellerScreens';
import {
  MakeListingOfferScreen, MyOffersScreen, ListingOfferDetailScreen,
} from '../screens/OfferScreens';
import {
  BulkListInventoryScreen, EbayCsvImportScreen, DraftsReviewScreen,
} from '../screens/BootstrapScreens';
import { SellerAnalyticsScreen } from '../screens/SellerAnalyticsScreen';
import { AddressesScreen, AddressFormScreen } from '../screens/AddressesScreens';

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

// Tab-press listener factory. By default, tapping a tab in the bottom
// bar restores that tab's last nested-stack state — so if a Home tile
// previously deep-linked you into Profile/MyOrders, the next time you
// tap the Profile tab you land on MyOrders, not the Profile root.
// That feels broken: users expect tab-bar taps to behave like Twitter
// or Instagram and always go to the tab's home screen.
//
// This listener resets the tab's nested stack to its initial route on
// every tap, regardless of focus state. The deep-link from a Home tile
// still works because that path goes through `navigation.navigate(...)`
// which sets the nested route directly, not through a tab-bar tap.
function resetOnTabPress(tabName, initialRouteName) {
  return ({ navigation }) => ({
    tabPress: (e) => {
      const tabState = navigation.getState().routes.find((r) => r.name === tabName)?.state;
      if (tabState && tabState.index > 0) {
        e.preventDefault();
        navigation.dispatch({
          ...CommonActions.reset({
            index: 0,
            routes: [{ name: initialRouteName }],
          }),
          target: tabState.key,
        });
        navigation.navigate(tabName);
      }
    },
  });
}

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
      initialRouteName="Home"
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
      {/* Home is the mode picker — three tiles for Show Floor /
          Collection / Local LCS. First thing the user sees on
          launch so they pick their lens before being confronted
          with the full surface area. */}
      <Tab.Screen
        name="Home"
        component={HomeHubScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      {/* Binders is THE home for cards. Every card auto-files into
          a Default binder (migration 033), so there's no separate
          "Collection" — the binders ARE the collection.
          CollectionStack screens (CardDetail, RegisterCard, etc.)
          are still mounted inside BinderStack so card flows that
          push into stack work the same way. */}
      <Tab.Screen
        name="Binders"
        component={BinderStack}
        options={{
          tabBarLabel: 'Collection',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
        }}
        listeners={resetOnTabPress('Binders', 'BinderList')}
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
      {/* The Search tab was a top-level tab that duplicated Trade
          Board search and Binder browsing — three different search
          UIs over the same data. Removed to keep the bottom bar
          focused; the Trade Board's search field now covers the
          discovery use case. SearchStack and SearchScreen still
          exist and are reachable from a sub-stack push if we want
          to deep-link in later. */}
      <Tab.Screen
        name="Trade"
        component={TradeStack}
        options={{
          tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} />,
        }}
        listeners={resetOnTabPress('Trade', 'TradeBoardMain')}
      />
      {LCS_ENABLED && (
        <Tab.Screen
          name="LCS"
          component={LCSStack}
          options={{
            tabBarLabel: 'LCS',
            tabBarIcon: ({ color, size }) => <Ionicons name="storefront" size={size} color={color} />,
          }}
          listeners={resetOnTabPress('LCS', 'LCSHome')}
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
        listeners={resetOnTabPress('Profile', 'ProfileMain')}
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
    <CollectionStackNav.Screen name="CollectionImportExport" component={CollectionImportExportScreen} />
    <CollectionStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    <CollectionStackNav.Screen name="CardChain" component={CardChainScreen} />
    <CollectionStackNav.Screen name="EditCard" component={EditCardScreen} />
    <CollectionStackNav.Screen name="ConversationList" component={ConversationListScreen} />
    <CollectionStackNav.Screen name="Conversation" component={ConversationScreen} />
    <CollectionStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <CollectionStackNav.Screen name="StoreIntake" component={StoreIntakeScreen} />
    <CollectionStackNav.Screen name="RequestReprint" component={RequestReprintScreen} />
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
    <BinderStackNav.Screen name="CardChain" component={CardChainScreen} />
    <BinderStackNav.Screen name="EditCard" component={EditCardScreen} />
    <BinderStackNav.Screen name="Conversation" component={ConversationScreen} />
    <BinderStackNav.Screen name="TrustProfile" component={TrustProfileScreen} />
    {/* Card-add + transfer flows used to live in CollectionStack
        only. Now that Binders is the home tab, mount them here so
        scanning a card / registering it / kicking off a transfer
        works inside the binders stack without crossing tabs. */}
    <BinderStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <BinderStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
    <BinderStackNav.Screen name="QRScanner" component={QRScannerScreen} />
    <BinderStackNav.Screen name="StoreIntake" component={StoreIntakeScreen} />
    <BinderStackNav.Screen name="RequestReprint" component={RequestReprintScreen} />
    <BinderStackNav.Screen name="ConversationList" component={ConversationListScreen} />
    <BinderStackNav.Screen name="CollectionImportExport" component={CollectionImportExportScreen} />
  </BinderStackNav.Navigator>
);

const SearchStack = () => (
  <SearchStackNav.Navigator screenOptions={screenOptions}>
    <SearchStackNav.Screen name="SearchMain" component={SearchScreen} />
    <SearchStackNav.Screen name="BinderCardDetail" component={BinderCardDetailScreen} />
    <SearchStackNav.Screen name="CardDetail" component={CardDetailScreen} />
    <SearchStackNav.Screen name="EditCard" component={EditCardScreen} />
    <SearchStackNav.Screen name="Conversation" component={ConversationScreen} />
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
    <TransferStackNav.Screen name="EditCard" component={EditCardScreen} />
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
    <ProfileStackNav.Screen name="EditCard" component={EditCardScreen} />
    <ProfileStackNav.Screen name="ConversationList" component={ConversationListScreen} />
    <ProfileStackNav.Screen name="Conversation" component={ConversationScreen} />
    <ProfileStackNav.Screen name="RegisterCard" component={RegisterCardScreen} />
    <ProfileStackNav.Screen name="InitiateTransfer" component={InitiateTransferScreen} />
    <ProfileStackNav.Screen name="OffersList" component={OffersListScreen} />
    <ProfileStackNav.Screen name="OfferDetail" component={OfferDetailScreen} />
    <ProfileStackNav.Screen name="Transaction" component={TransactionScreen} />
    <ProfileStackNav.Screen name="TransferVideo" component={TransferVideoScreen} />
    <ProfileStackNav.Screen name="StalledTransferReport" component={StalledTransferReportScreen} />
    <ProfileStackNav.Screen name="CaseMode" component={CaseModeScreen} />
    <ProfileStackNav.Screen name="CardChain" component={CardChainScreen} />
    <ProfileStackNav.Screen name="StolenMatchReview" component={StolenMatchReviewScreen} />
    <ProfileStackNav.Screen name="ShowFloorHub" component={ShowFloorHubScreen} />
    <ProfileStackNav.Screen name="ShowFloorCheckIn" component={ShowFloorCheckInScreen} />
    <ProfileStackNav.Screen name="ShowFloorEvent" component={ShowFloorEventScreen} />
    <ProfileStackNav.Screen name="ShowFloorUser" component={ShowFloorUserScreen} />
    <ProfileStackNav.Screen name="ShowFloorShop" component={ShowFloorShopScreen} />
    <ProfileStackNav.Screen name="ManageBooth" component={ManageBoothScreen} />
    <ProfileStackNav.Screen name="ShowFloorUpsell" component={ShowFloorUpsellScreen} />
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
    <ProfileStackNav.Screen name="Help" component={HelpScreen} />
    <ProfileStackNav.Screen name="DealRadarSettings" component={DealRadarSettingsScreen} />
    <ProfileStackNav.Screen name="DealRadarFeed" component={DealRadarFeedScreen} />
    <ProfileStackNav.Screen name="Integrations" component={IntegrationsScreen} />
    <ProfileStackNav.Screen name="ChangeEmail" component={ChangeEmailScreen} />
    <ProfileStackNav.Screen name="DownloadData" component={DownloadDataScreen} />
    <ProfileStackNav.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    <ProfileStackNav.Screen name="Upgrade" component={UpgradeScreen} />
    <ProfileStackNav.Screen name="Feedback" component={FeedbackScreen} />
    <ProfileStackNav.Screen name="StoreIntake" component={StoreIntakeScreen} />
    <ProfileStackNav.Screen name="RequestReprint" component={RequestReprintScreen} />
    <ProfileStackNav.Screen name="OrderStickers" component={OrderStickersScreen} />
    <ProfileStackNav.Screen name="Onboarding" component={OnboardingScreen} options={{ presentation: 'modal' }} />
    <ProfileStackNav.Screen name="ListingDefaults" component={ListingDefaultsScreen} />
    <ProfileStackNav.Screen name="Security" component={SecurityScreen} />
    <ProfileStackNav.Screen name="SubscriptionManage" component={SubscriptionManageScreen} />
    <ProfileStackNav.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
    <ProfileStackNav.Screen name="TradeOffersList" component={TradeOffersListScreen} />
    <ProfileStackNav.Screen name="TradeOfferDetail" component={TradeOfferDetailScreen} />
    {/* FirstTradeSafety gated the very first Accept tap; it was only
        registered in TradeStack, so accepts from Profile (push deep
        link, offers inbox) silently no-op'd. */}
    <ProfileStackNav.Screen name="FirstTradeSafety" component={FirstTradeSafetyScreen} />
    <ProfileStackNav.Screen name="SetsList" component={SetsListScreen} />
    <ProfileStackNav.Screen name="BrowseSets" component={BrowseSetsScreen} />
    <ProfileStackNav.Screen name="SetCompletion" component={SetCompletionScreen} />

    {/* Marketplace Phase 2A */}
    <ProfileStackNav.Screen name="Wallet" component={WalletScreen} />
    <ProfileStackNav.Screen name="Payout" component={PayoutScreen} />
    <ProfileStackNav.Screen name="Topup" component={TopupScreen} />
    <ProfileStackNav.Screen name="MarketplaceHome" component={MarketplaceHomeScreen} />
    <ProfileStackNav.Screen name="MarketplaceSearch" component={MarketplaceSearchScreen} />
    <ProfileStackNav.Screen name="ListingDetail" component={ListingDetailScreen} />
    <ProfileStackNav.Screen name="SavedSearches" component={SavedSearchesScreen} />
    <ProfileStackNav.Screen name="CartList" component={CartListScreen} />
    <ProfileStackNav.Screen name="CartDetail" component={CartDetailScreen} />
    <ProfileStackNav.Screen name="Checkout" component={CheckoutScreen} />
    <ProfileStackNav.Screen name="MyListings" component={MyListingsScreen} />
    <ProfileStackNav.Screen name="CreateListing" component={CreateListingScreen} />
    <ProfileStackNav.Screen name="MyOrders" component={MyOrdersScreen} />
    <ProfileStackNav.Screen name="OrderDetail" component={OrderDetailScreen} />
    <ProfileStackNav.Screen name="FileOrderDispute" component={FileOrderDisputeScreen} />
    <ProfileStackNav.Screen name="MakeListingOffer" component={MakeListingOfferScreen} options={{ presentation: 'modal' }} />
    <ProfileStackNav.Screen name="MyOffers" component={MyOffersScreen} />
    <ProfileStackNav.Screen name="ListingOfferDetail" component={ListingOfferDetailScreen} />
    <ProfileStackNav.Screen name="BulkListInventory" component={BulkListInventoryScreen} />
    <ProfileStackNav.Screen name="EbayCsvImport" component={EbayCsvImportScreen} />
    <ProfileStackNav.Screen name="DraftsReview" component={DraftsReviewScreen} />
    <ProfileStackNav.Screen name="SellerAnalytics" component={SellerAnalyticsScreen} />
    <ProfileStackNav.Screen name="Addresses" component={AddressesScreen} />
    <ProfileStackNav.Screen name="AddressForm" component={AddressFormScreen} options={{ presentation: 'modal' }} />
    <ProfileStackNav.Screen name="ProTagging" component={ProTaggingScreen} />
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
    <LCSStackNav.Screen name="LCSArbitrage" component={LCSArbitrageScreen} />
  </LCSStackNav.Navigator>
);

const TradeStack = () => (
  <TradeStackNav.Navigator screenOptions={screenOptions} initialRouteName="TradeBoardMain">
    {/* TradeBoardMain is the public everyone-feed and the default
        Trade tab entry. The old nearby/proximity sort was removed
        (GPS matching was unreliable + privacy noise) — search +
        scope filters cover discovery now. Trade Groups remain
        available as a secondary surface for private circles. */}
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
    <TradeStackNav.Screen name="BrowseSets" component={BrowseSetsScreen} />
    <TradeStackNav.Screen name="SetCompletion" component={SetCompletionScreen} />
    <TradeStackNav.Screen name="Help" component={HelpScreen} />
    <TradeStackNav.Screen name="ReportStolen" component={ReportStolenScreen} />
    <TradeStackNav.Screen name="FirstTradeSafety" component={FirstTradeSafetyScreen} />
    {/* CardDetail registered in this stack so trade offer rows can
        navigate into full card inspection without leaving the Trade tab. */}
    <TradeStackNav.Screen name="CardDetail" component={CardDetailScreen} />
  </TradeStackNav.Navigator>
);

// ============================================================
// AUTH STACK
// ============================================================
const AuthStack = () => (
  <AuthStackNav.Navigator screenOptions={{ ...screenOptions, animation: 'fade' }}>
    <AuthStackNav.Screen name="Login" component={LoginScreen} />
    <AuthStackNav.Screen name="Register" component={RegisterScreen} />
    <AuthStackNav.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <AuthStackNav.Screen name="Suspended" component={SuspendedScreen} />
  </AuthStackNav.Navigator>
);

// ============================================================
// DEEP LINKING CONFIG
// cardshop://join?token=XXX   → TradeGroups › JoinTradeGroup with token param
// cardshop://trade/<id>       → TradeListingDetail
// ============================================================
const linkingConfig = {
  prefixes: ['cardshop://', 'https://cardshopadmin.twomiah.com'],
  config: {
    screens: {
      Trade: {
        screens: {
          JoinTradeGroup: 'join',
          TradeListingDetail: 'trade/:listingId',
          TradeBoardMain: 'trade',
        },
      },
      Profile: {
        screens: {
          DealRadarFeed: 'deal-radar',
          DealRadarSettings: 'deal-radar/settings',
        },
      },
    },
  },
};

// ============================================================
// ROOT NAVIGATOR
// ============================================================
import { navigationRef } from '../lib/navigationRef';

export const RootNavigator = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Onboarding is a top-level Modal overlay, NOT a stack screen.
  // Stack-screen onboarding lived in Profile and persisted in
  // that tab's history — switching tabs and coming back showed
  // it again. Driving it from state here means it appears once,
  // dismisses cleanly, and never comes back.
  const [onboardingVisible, setOnboardingVisible] = useState(false);

  // Wire the notification-response handler once we have a nav container.
  // Handles deal_radar_match pushes → deep link to DealRadarFeed + open listing.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const unsubscribe = registerNotificationResponseHandler(navigationRef);
    return unsubscribe;
  }, [isAuthenticated]);

  // Read the seen-flag once after sign-in. If unset, surface the
  // overlay. The overlay itself flips the flag on first show so
  // a crashed app or background-kill mid-onboarding still counts
  // as "seen" — better than nagging the user.
  useEffect(() => {
    if (!isAuthenticated) {
      setOnboardingVisible(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const seen = await SecureStore.getItemAsync(ONBOARDING_SEEN_KEY);
        if (!cancelled && seen !== '1') setOnboardingVisible(true);
      } catch (err) {
        // SecureStore failure is non-fatal; default to NOT showing
        // the modal so a keystore problem doesn't block the user.
        console.warn('[onboarding] SecureStore read failed:', err?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={isAuthenticated ? linkingConfig : undefined}
    >
      {isAuthenticated ? <TabNavigator /> : <AuthStack />}
      <OnboardingOverlay
        visible={onboardingVisible && isAuthenticated}
        onDone={() => setOnboardingVisible(false)}
      />
    </NavigationContainer>
  );
};
