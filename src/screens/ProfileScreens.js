import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Alert, KeyboardAvoidingView, Platform, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { showMessage } from 'react-native-flash-message';
import * as Updates from 'expo-updates';
import { wantListApi, authApi, notificationsApi, API_BASE_URL } from '../services/api';
import { registerForPushNotificationsAsync } from '../services/pushRegistration';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../store/authStore';
import { Button, Input, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// PROFILE SCREEN
// ============================================================
// Pick the right icon + tap destination for a given notification
// type/data. Centralized here so the Profile banner and the full
// Notifications screen can agree on behavior. The destination
// defaults to the Notifications inbox if we don't recognize the type.
// Keep these destinations in sync with the OS push handler in
// services/pushRegistration.js — tapping an in-app notification row
// must land in the same place as tapping the OS push for the same
// type. If the type isn't here, the fall-through default navigates
// to 'Notifications' which is a silent no-op when the user is already
// on that screen ("tap does nothing" bug).
const tradeOfferDest = (n, nav) => n.data?.offer_id
  ? nav.navigate('Trade', { screen: 'TradeOfferDetail', params: { offerId: n.data.offer_id } })
  : nav.navigate('Notifications');
const listingOfferDest = (n, nav) => n.data?.offer_id
  ? nav.navigate('ListingOfferDetail', { id: n.data.offer_id })
  : nav.navigate('Notifications');
const transactionDest = (n, nav) => n.data?.cstx_id
  ? nav.navigate('Transaction', { transactionId: n.data.cstx_id })
  : nav.navigate('Notifications');

const NOTIFICATION_MAP = {
  message:           { icon: 'mail',              color: '#4ecdc4', dest: (n, nav) => n.data?.conversation_id ? nav.navigate('Conversation', { conversationId: n.data.conversation_id }) : nav.navigate('ConversationList') },
  transfer_request:  { icon: 'swap-horizontal',   color: '#e8c547', dest: (n, nav) => nav.navigate('Transfers') },
  transfer_complete: { icon: 'checkmark-circle',  color: '#4ade80', dest: (n, nav) => nav.navigate('Transfers') },
  want_list_match:   { icon: 'heart',             color: '#ff6b6b', dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('WantList') },
  inquiry:           { icon: 'chatbubble',        color: '#4ecdc4', dest: (n, nav) => nav.navigate('ConversationList') },
  dispute:           { icon: 'warning',           color: '#f87171', dest: (n, nav) => nav.navigate('DisputeList') },
  tracking_update:   { icon: 'cube',              color: '#60a5fa', dest: (n, nav) => nav.navigate('Transfers') },
  counter_claim:     { icon: 'git-compare',       color: '#f87171', dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },

  // Trade-board + binder offer family. All route to TradeOfferDetail
  // (the unified offers table covers both surfaces).
  trade_offer:                { icon: 'swap-horizontal', color: '#e8c547', dest: tradeOfferDest },
  trade_offer_countered:      { icon: 'swap-horizontal', color: '#e8c547', dest: tradeOfferDest },
  trade_offer_accepted:       { icon: 'checkmark-circle', color: '#4ade80', dest: tradeOfferDest },
  trade_offer_declined:       { icon: 'close-circle',    color: '#f87171', dest: tradeOfferDest },
  trade_offer_withdrawn:      { icon: 'close-circle',    color: Colors.textMuted, dest: tradeOfferDest },
  trade_offer_updated:        { icon: 'swap-horizontal', color: '#e8c547', dest: tradeOfferDest },
  binder_offer:               { icon: 'pricetag',        color: '#e8c547', dest: tradeOfferDest },
  binder_offer_countered:     { icon: 'pricetag',        color: '#e8c547', dest: tradeOfferDest },
  binder_offer_accepted:      { icon: 'checkmark-circle', color: '#4ade80', dest: tradeOfferDest },
  binder_offer_declined:      { icon: 'close-circle',    color: '#f87171', dest: tradeOfferDest },

  // Marketplace listing offer family — different detail screen.
  offer_received:             { icon: 'pricetag',         color: '#4ecdc4', dest: listingOfferDest },
  offer_countered:            { icon: 'pricetag',         color: '#4ecdc4', dest: listingOfferDest },
  offer_accepted:             { icon: 'checkmark-circle', color: '#4ade80', dest: listingOfferDest },
  offer_rejected:             { icon: 'close-circle',     color: '#f87171', dest: listingOfferDest },

  // Transfers / SLA / video-waiver / stalled-transfer — all land on
  // the CSTX transaction screen so the user can take the next action.
  sla_nudge_2d:               { icon: 'time',     color: '#e8c547', dest: transactionDest },
  sla_nudge_4d:               { icon: 'time',     color: '#f87171', dest: transactionDest },
  sla_overdue:                { icon: 'warning',  color: '#f87171', dest: transactionDest },
  video_waiver_proposed:      { icon: 'videocam', color: '#60a5fa', dest: transactionDest },
  stalled_transfer_report:    { icon: 'warning',  color: '#f87171', dest: transactionDest },
  stalled_transfer_response:  { icon: 'warning',  color: '#e8c547', dest: transactionDest },
  stalled_transfer_resolved:  { icon: 'checkmark-circle', color: '#4ade80', dest: transactionDest },

  // Show floor — followed seller went live, or your own session is
  // ending. Both land on the show floor hub (ShowFloorEvent when we
  // have a specific event slug).
  show_floor_live:            { icon: 'flash',    color: '#e8c547',
    dest: (n, nav) => nav.navigate('Profile', {
      screen: n.data?.event_slug ? 'ShowFloorEvent' : 'ShowFloorHub',
      params: n.data?.event_slug ? { slug: n.data.event_slug } : undefined,
    }),
  },
  show_floor_ending:          { icon: 'flash',    color: '#f87171', dest: (_, nav) => nav.navigate('ShowFloorHub') },

  // Marketplace order dispute / saved-search match / deal radar.
  order_dispute_opened:       { icon: 'warning',  color: '#f87171',
    dest: (n, nav) => n.data?.order_id ? nav.navigate('OrderDetail', { id: n.data.order_id }) : nav.navigate('Notifications'),
  },
  // Buyer's Stripe charge authorized — "you have a sale to ship".
  order_authorized:           { icon: 'cash',     color: '#4ade80',
    dest: (n, nav) => n.data?.order_id ? nav.navigate('OrderDetail', { id: n.data.order_id }) : nav.navigate('Notifications'),
  },
  saved_search_match:         { icon: 'search',   color: '#4ecdc4',
    dest: (n, nav) => n.data?.listing_id ? nav.navigate('ListingDetail', { id: n.data.listing_id }) : nav.navigate('Notifications'),
  },
  deal_radar_match:           { icon: 'flame',    color: '#ff6b6b', dest: (_, nav) => nav.navigate('DealRadarFeed') },

  // Stolen-card matches — admin escalations the cardholder reviews.
  stolen_match_for_review:    { icon: 'shield',   color: '#f87171', dest: (_, nav) => nav.navigate('StolenMatchReview') },
  stolen_match_pending:       { icon: 'shield',   color: '#e8c547', dest: (_, nav) => nav.navigate('Notifications') },

  // Generic deal lifecycle (trade complete, counterparty confirmed
  // receipt, meetup switched, shipped, etc.). Carries cstx_id in
  // data and routes to the Transaction screen — that's where the
  // review prompt and next-step UI live.
  binder_deal_update:         { icon: 'receipt',  color: Colors.accent, dest: transactionDest },

  // Card-traded-away — losing offerer notification when the listing
  // owner picked someone else.
  trade_listing_traded_away:  { icon: 'close-circle', color: Colors.textMuted, dest: (_, nav) => nav.navigate('Notifications') },

  // Transfers: 14-day-stuck cron ping (stuckSweep).
  transfer_stuck: { icon: 'time', color: '#f87171',
    dest: (n, nav) => n.data?.transfer_id ? nav.navigate('Transfers') : nav.navigate('Notifications') },

  // Social: new follower.
  binder_follow: { icon: 'people', color: '#4ecdc4',
    dest: (_, nav) => nav.navigate('Profile', { screen: 'TrustProfile' }) },

  // Counter-claim family. counter_claim (generic) already mapped above;
  // cert_counter_claim (new) routes to the same card; counter_claim_resolved
  // is the admin-resolution ping to either party.
  cert_counter_claim: { icon: 'shield', color: '#f87171',
    dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },
  counter_claim_resolved: { icon: 'shield-checkmark', color: '#4ade80',
    dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },

  // CSTX dispute (binder_transactions). Different from order_dispute_*
  // (marketplace).
  binder_dispute: { icon: 'warning', color: '#f87171',
    dest: (n, nav) => n.data?.cstx_id ? nav.navigate('Transaction', { transactionId: n.data.cstx_id }) : nav.navigate('DisputeList') },

  // Sticker reprint family.
  sticker_reprint_admin:      { icon: 'qr-code', color: '#e8c547', dest: (_, nav) => nav.navigate('Notifications') },
  sticker_reprint_admin_bulk: { icon: 'qr-code', color: '#e8c547', dest: (_, nav) => nav.navigate('Notifications') },
  sticker_reprint_shipped:    { icon: 'qr-code', color: '#4ade80', dest: (_, nav) => nav.navigate('Notifications') },

  // Stalled-transfer admin escalation (cron escalates 72h+ unactioned).
  stalled_transfer_admin_escalation: { icon: 'alert-circle', color: '#f87171', dest: (_, nav) => nav.navigate('Notifications') },

  // Stolen-match — admin saw the cardholder confirmed.
  stolen_match_owner_confirmed: { icon: 'shield', color: '#e8c547', dest: (_, nav) => nav.navigate('Notifications') },

  // Reprice sweep — owner-facing pricing notifications.
  reprice_applied: { icon: 'pricetag', color: '#4ade80',
    dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },
  reprice_suggest: { icon: 'pricetag', color: '#e8c547',
    dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },
  reprice_alert: { icon: 'trending-up', color: '#e8c547',
    dest: (n, nav) => n.data?.owned_card_id ? nav.navigate('CardDetail', { cardId: n.data.owned_card_id }) : nav.navigate('Notifications') },

  // Want-list match family — separate from the bare 'want_list_match'
  // already mapped. Land on WantList so the user can see what hit.
  want_list_binder_match: { icon: 'heart', color: '#ff6b6b', dest: (_, nav) => nav.navigate('WantList') },
  want_list_trade_match:  { icon: 'heart', color: '#ff6b6b', dest: (_, nav) => nav.navigate('WantList') },

  // Trade-board nudges (bump reminders, traded-away, group interest).
  trade_outside_group_interest: { icon: 'people', color: '#4ecdc4',
    dest: (n, nav) => n.data?.trade_listing_id ? nav.navigate('TradeListingDetail', { id: n.data.trade_listing_id }) : nav.navigate('Notifications') },
  trade_listing_bump_reminder_30: { icon: 'time', color: '#e8c547',
    dest: (n, nav) => n.data?.trade_listing_id ? nav.navigate('TradeListingDetail', { id: n.data.trade_listing_id }) : nav.navigate('Notifications') },
  trade_listing_bump_reminder_60: { icon: 'time', color: '#e8c547',
    dest: (n, nav) => n.data?.trade_listing_id ? nav.navigate('TradeListingDetail', { id: n.data.trade_listing_id }) : nav.navigate('Notifications') },
  trade_listing_auto_removed_90: { icon: 'trash', color: Colors.textMuted,
    dest: (n, nav) => n.data?.trade_listing_id ? nav.navigate('TradeListingDetail', { id: n.data.trade_listing_id }) : nav.navigate('Notifications') },
  trade_group_joined: { icon: 'people', color: '#4ade80',
    dest: (n, nav) => n.data?.trade_group_id ? nav.navigate('TradeGroupDetail', { id: n.data.trade_group_id }) : nav.navigate('TradeGroupsList') },

  // Transfer family (legacy) + the new transfer_cancelled type from
  // sweepUnilateralCancels.
  transfer_cancelled: { icon: 'close-circle', color: '#f87171', dest: (_, nav) => nav.navigate('Transfers') },

  // Marketing / admin announcement.
  announcement: { icon: 'megaphone', color: '#4ecdc4', dest: (_, nav) => nav.navigate('Notifications') },
};
const defaultNotifCfg = { icon: 'notifications', color: Colors.textMuted, dest: (_, nav) => nav.navigate('Notifications') };

export const ProfileScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const qc = useQueryClient();

  // Pull the 3 most recent unread notifications so we can show a
  // banner at the top of Profile explaining why the tab badge is
  // lit. Without this the user sees "Profile (1)" and has no clue
  // what the 1 refers to.
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-preview'],
    queryFn: () => notificationsApi.get({ unread_only: true, limit: 3 }).then((r) => r.data),
    refetchInterval: 30000,
  });
  const unreadNotifs = unreadData?.notifications || [];

  const markReadMut = useMutation({
    mutationFn: (ids) => notificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const tapNotification = (n) => {
    markReadMut.mutate([n.id]);
    const cfg = NOTIFICATION_MAP[n.type] || defaultNotifCfg;
    cfg.dest(n, navigation);
  };

  // Deep-link helper for the Admin + Store sections. These surfaces
  // are web-only right now, so we open the browser rather than
  // building 20 mobile screens that duplicate the dashboard. When a
  // given page is needed more ergonomically on the phone we'll build
  // a native version and swap the URL for a navigation() call.
  const openAdminUrl = (path) => {
    const url = `https://cardshopadmin.twomiah.com${path}`;
    Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  // Profile menu trim — was 28+ rows in 7 sections, which read as an
  // app directory rather than a profile. Reorganized into 3 high-
  // signal sections + a collapsible "More" for the long tail of
  // links that exist but aren't daily-use.
  const MENU = [
    {
      // Selling, collecting, orders, messages, show floor, wallet — all
      // moved to their hubs (Sell / My Collection / Show Floor) + the
      // bottom bar. Profile is now settings + a short tail of tools.
      section: 'Tools',
      items: [
        { icon: 'storefront-outline', label: 'Case Mode (per card)', onPress: () => navigation.navigate('CaseMode') },
        { icon: 'print-outline', label: 'Reprint my stickers', onPress: async () => {
          // Opens an HTML print sheet with new URL-format QRs for
          // every sticker the user has attached. Existing bare-code
          // stickers don't work in stock phone cameras; reprinting
          // these and swapping them on the cards migrates the
          // install. Auth via ?token= since browser tabs don't
          // carry the Authorization header.
          try {
            const token = await SecureStore.getItemAsync('access_token');
            if (!token) {
              Alert.alert('Sign in required', 'Please sign in again to load your sticker sheet.');
              return;
            }
            const url = `${API_BASE_URL}/api/qr/my-stickers/sheet?token=${encodeURIComponent(token)}`;
            const can = await Linking.canOpenURL(url);
            if (!can) {
              Alert.alert('Cannot open browser', 'Unable to open the print page on this device.');
              return;
            }
            await Linking.openURL(url);
          } catch (err) {
            Alert.alert('Failed to open', err?.message || 'unknown error');
          }
        } },
      ]
    },
    {
      // Settings — the things a profile screen is FOR. Everything
      // here changes how the account works, not what's in the
      // collection.
      section: 'Account',
      items: [
        { icon: 'person-circle-outline', label: 'Profile & brand', onPress: () => navigation.navigate('BrandProfile') },
        { icon: 'home-outline', label: 'Shipping addresses', onPress: () => navigation.navigate('Addresses') },
        { icon: 'mail-outline', label: 'Change Email', onPress: () => navigation.navigate('ChangeEmail') },
        { icon: 'lock-closed-outline', label: 'Security (2FA)', onPress: () => navigation.navigate('Security') },
        { icon: 'notifications-outline', label: 'Notifications', onPress: () => navigation.navigate('NotificationPreferences') },
        { icon: 'paper-plane-outline', label: 'Re-register push notifications', onPress: async () => {
          const r = await registerForPushNotificationsAsync();
          if (r?.ok) {
            Alert.alert('Push registered', 'Token sent to server. New offers + sales will push to this device.');
          } else if (r?.reason === 'permission_denied') {
            Alert.alert(
              'Notifications denied',
              'Open system Settings → Card Shop → Notifications and turn on Allow Notifications, then come back and tap this again.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          } else if (r?.reason === 'permission_undetermined') {
            Alert.alert('No permission yet', 'The OS prompt should appear next time. Force-quit and try again.');
          } else if (r?.reason === 'not_device') {
            Alert.alert('Simulator', 'Push notifications need a real device, not the simulator.');
          } else {
            Alert.alert('Push registration failed', `Reason: ${r?.reason || 'unknown'}\n${r?.error || ''}`);
          }
        } },
        { icon: 'card-outline', label: 'Manage subscription', onPress: () => navigation.navigate('SubscriptionManage') },
        { icon: 'sparkles-outline', label: 'Plans & upgrade', onPress: () => navigation.navigate('Upgrade') },
      ]
    },
    {
      // Long tail — exists, isn't deleted, but doesn't deserve a
      // top-level row. Tapping "More" opens a separate screen with
      // the full library + admin links.
      section: 'More',
      items: [
        { icon: 'shield-checkmark-outline', label: 'Trust Profile', onPress: () => navigation.navigate('TrustProfile', {}) },
        { icon: 'swap-horizontal-outline', label: 'Transfers & sales', onPress: () => navigation.navigate('Transfers') },
        { icon: 'warning-outline', label: 'Disputes', onPress: () => navigation.navigate('DisputeList') },
        { icon: 'shield-half-outline', label: 'Stolen-card match review', onPress: () => navigation.navigate('StolenMatchReview') },
        { icon: 'pulse-outline', label: 'Deal Radar', onPress: () => navigation.navigate('DealRadarSettings') },
        { icon: 'megaphone-outline', label: 'Send feedback', onPress: () => navigation.navigate('Feedback') },
        { icon: 'download-outline', label: 'Download My Data', onPress: () => navigation.navigate('DownloadData') },
        {
          icon: 'cloud-download-outline',
          label: 'Check for app updates',
          onPress: async () => {
            try {
              if (__DEV__) {
                Alert.alert('Dev build', 'OTA updates only apply to production/preview builds.');
                return;
              }
              const check = await Updates.checkForUpdateAsync();
              if (!check.isAvailable) {
                Alert.alert('Up to date', 'You\'re running the latest version.');
                return;
              }
              await Updates.fetchUpdateAsync();
              Alert.alert(
                'Update ready',
                'A new version downloaded. Restart now to apply?',
                [
                  { text: 'Later', style: 'cancel' },
                  { text: 'Restart now', onPress: () => Updates.reloadAsync() },
                ],
              );
            } catch (err) {
              Alert.alert('Update check failed', err?.message || 'Try again with a stronger connection.');
            }
          },
        },
        {
          icon: 'information-circle-outline',
          label: 'About / version',
          onPress: () => {
            const updateId = Updates.updateId || '(embedded)';
            const channel = Updates.channel || '(default)';
            const runtime = Updates.runtimeVersion || '(unset)';
            Alert.alert(
              'Card Shop',
              `Channel: ${channel}\nRuntime: ${runtime}\nBundle: ${String(updateId).slice(0, 8)}…\nNative build: 1.0.1`,
            );
          },
        },
      ]
    },
    ...(['store_owner', 'store_staff', 'admin'].includes(user?.role) ? [{
      section: 'Store',
      items: [
        { icon: 'add-circle-outline', label: 'Intake card (scan → tag)', onPress: () => navigation.navigate('StoreIntake') },
        { icon: 'search-outline', label: 'Cross-location inventory search', onPress: () => openAdminUrl('/inventory/search') },
        { icon: 'git-compare-outline', label: 'Transfer requests', onPress: () => openAdminUrl('/inventory/transfer-requests') },
        { icon: 'people-outline', label: 'Manage staff', onPress: () => openAdminUrl('/staff') },
        { icon: 'location-outline', label: 'Manage locations', onPress: () => openAdminUrl('/locations') },
        { icon: 'analytics-outline', label: 'Store analytics', onPress: () => openAdminUrl('/analytics') },
        { icon: 'qr-code-outline', label: 'QR batches', onPress: () => openAdminUrl('/qr') },
      ]
    }] : []),
    ...(user?.role === 'admin' ? [{
      section: 'Admin (platform-wide)',
      items: [
        { icon: 'shield-outline', label: 'Admin overview', onPress: () => openAdminUrl('/admin') },
        { icon: 'person-outline', label: 'Users', onPress: () => openAdminUrl('/admin/users') },
        { icon: 'people-circle-outline', label: 'Act as user (show intake)', onPress: () => navigation.navigate('ActAsUser') },
        { icon: 'pricetag-outline', label: 'Pro Tagging session', onPress: () => navigation.navigate('ProTagging') },
        { icon: 'clipboard-outline', label: 'Support tickets', onPress: () => openAdminUrl('/admin/tickets') },
        { icon: 'warning-outline', label: 'Stolen reports', onPress: () => openAdminUrl('/admin/stolen') },
        { icon: 'git-compare-outline', label: 'Counter-claims', onPress: () => openAdminUrl('/admin/counter-claims') },
        { icon: 'time-outline', label: 'Audit log', onPress: () => openAdminUrl('/admin/audit-log') },
      ]
    }] : []),
    {
      section: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & FAQ', onPress: () => Linking.openURL('mailto:support@twomiah.com?subject=Card%20Shop%20question') },
        { icon: 'trash-outline', label: 'Delete Account', onPress: () => navigation.navigate('DeleteAccount'), danger: true },
        { icon: 'log-out-outline', label: 'Sign Out', onPress: handleLogout, danger: true },
      ]
    }
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => navigation.navigate('BrandProfile')}
            activeOpacity={0.75}
          >
            {(user?.brand_logo_url || user?.avatar_url) ? (
              <Image
                source={{ uri: user.brand_logo_url || user.avatar_url }}
                style={{ width: '100%', height: '100%', borderRadius: 9999 }}
              />
            ) : (
              <Text style={styles.avatarText}>
                {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
              </Text>
            )}
          </TouchableOpacity>
          <Text style={styles.displayName}>{user?.display_name || user?.username}</Text>
          <Text style={styles.username}>@{user?.username}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.feedback_count || 0}</Text>
              <Text style={styles.statLabel}>Trades</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {user?.feedback_score ? parseFloat(user.feedback_score).toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={async () => {
                // Manual subscription refresh — closes the race
                // window where StoreKit confirmed but our DB row
                // hasn't caught the RevenueCat webhook yet. Long-
                // press / tap is intentionally on the Plan stat
                // because that's where the user looks for "am I
                // Pro yet?" verification.
                const refreshed = await useAuthStore.getState().refreshUser();
                if (refreshed) {
                  const tierLabel = (() => {
                    switch (refreshed.subscription_tier) {
                      case 'collector_pro':  return 'Collector Pro is active.';
                      case 'show_floor':     return 'Show Floor is active.';
                      case 'store_starter':  return 'Store plan is active.';
                      case 'store_pro':      return 'Store Pro is active.';
                      default:               return 'Still on free plan.';
                    }
                  })();
                  showMessage({
                    message: tierLabel,
                    type: 'info',
                    icon: 'info',
                    duration: 1800,
                  });
                }
              }}
            >
              <Text style={[styles.statValue, { color: Colors.accent }]}>
                {(() => {
                  switch (user?.subscription_tier) {
                    case 'collector_pro':  return 'Pro';
                    case 'show_floor':     return 'Show Floor';
                    case 'store_starter':  return 'Store';
                    case 'store_pro':      return 'Store Pro';
                    default:               return 'Free';
                  }
                })()}
              </Text>
              <Text style={styles.statLabel}>Plan</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Unread notification banner — explains what the tab
            badge is about and gives one-tap access. Each tap marks
            the notification read (so the badge clears) and navigates
            to the right screen. */}
        {unreadNotifs.length > 0 && (
          <View style={styles.notifBanner}>
            <View style={styles.notifBannerHeader}>
              <Text style={styles.notifBannerTitle}>
                {unreadNotifs.length} new {unreadNotifs.length === 1 ? 'notification' : 'notifications'}
              </Text>
              <TouchableOpacity
                onPress={() => markReadMut.mutate(unreadNotifs.map((n) => n.id))}
              >
                <Text style={styles.notifMarkAll}>Mark all read</Text>
              </TouchableOpacity>
            </View>
            {unreadNotifs.map((n) => {
              const cfg = NOTIFICATION_MAP[n.type] || defaultNotifCfg;
              return (
                <TouchableOpacity
                  key={n.id}
                  style={styles.notifRow}
                  onPress={() => tapNotification(n)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.notifIcon, { backgroundColor: cfg.color + '22', borderColor: cfg.color + '55' }]}>
                    <Ionicons name={cfg.icon} size={16} color={cfg.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.notifRowTitle} numberOfLines={1}>{n.title}</Text>
                    {n.body ? <Text style={styles.notifRowBody} numberOfLines={1}>{n.body}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.notifViewAll}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Text style={styles.notifViewAllText}>View all notifications →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Menu sections */}
        {MENU.map((section) => (
          <View key={section.section} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.section}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <View key={item.label}>
                  <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                    <View style={[styles.menuIcon, item.danger && { backgroundColor: Colors.error + '22' }]}>
                      <Ionicons name={item.icon} size={18} color={item.danger ? Colors.error : Colors.textMuted} />
                    </View>
                    <Text style={[styles.menuLabel, item.danger && { color: Colors.error }]}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {i < section.items.length - 1 && <View style={styles.menuDivider} />}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// WANT LIST SCREEN
// ============================================================
export const WantListScreen = ({ navigation }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['wantlist'],
    queryFn: () => wantListApi.get().then((r) => r.data),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => wantListApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wantlist'] }),
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to remove from want list'),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.simpleHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.simpleHeaderTitle}>Want List</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Discover')}
          accessibilityLabel="Add to want list"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: Colors.accent + '22',
            borderWidth: 1, borderColor: Colors.accent + '66',
          }}
        >
          <Ionicons name="add" size={14} color={Colors.accent} />
          <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>Add card</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={data || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <View style={styles.wantItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wantPlayer}>{item.player_name}</Text>
              <Text style={styles.wantSet}>{item.year} {item.set_name}</Text>
              <View style={styles.wantMeta}>
                {item.max_price && (
                  <Text style={styles.wantMetaText}>Max: ${item.max_price}</Text>
                )}
                {item.condition_min && (
                  <Text style={styles.wantMetaText}>
                    Min: {item.condition_min.replace(/_/g,' ')}
                  </Text>
                )}
                {item.graded_only && (
                  <View style={styles.gradedBadge}>
                    <Text style={styles.gradedBadgeText}>Graded Only</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => removeMutation.mutate(item.id)}
              style={styles.removeBtn}
            >
              <Ionicons name="heart" size={20} color={Colors.accent3} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="❤️"
            title="Want list is empty"
            message="Search for cards and tap Want to add them. You'll be notified when they become available."
            action={{ label: 'Search Cards', onPress: () => navigation.navigate('Discover') }}
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// CHANGE EMAIL
// ============================================================
// POSTs /auth/change-email with the new address + the user's current
// password. On success we refresh the local user (email_verified resets
// to false on the server, so the verify-nag banner will re-appear).
export const ChangeEmailScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const email = newEmail.toLowerCase().trim();
    if (!email) return setError('Enter the new email address');
    if (!currentPassword) return setError('Enter your current password');
    setError('');
    setLoading(true);
    try {
      const res = await authApi.changeEmail({ new_email: email, current_password: currentPassword });
      showMessage({
        message: res?.data?.message || 'Email updated — check your inbox to verify.',
        type: 'success',
      });
      updateUser({ email, email_verified: false });
      navigation.goBack();
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        (status === 401 ? 'Incorrect current password.' :
         status === 409 ? 'That email is already in use.' :
         'Could not change your email. Try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.simpleHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.simpleHeaderTitle}>Change Email</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.accountBlurb}>
            Current email: <Text style={{ color: Colors.text, fontWeight: Typography.semibold }}>{user?.email || '—'}</Text>
          </Text>
          <Text style={[styles.accountBlurb, { marginBottom: Spacing.md }]}>
            We'll send a verification link to the new address. You'll stay signed in.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{error}</Text>
            </View>
          ) : null}

          <Input
            label="New Email"
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Current Password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
          />

          <Button title="Update Email" onPress={handleSubmit} loading={loading} style={{ marginTop: Spacing.sm }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================
// DOWNLOAD MY DATA
// ============================================================
// GETs /auth/my-data (JSON) and writes it to cache via expo-file-system,
// then opens the native share sheet (pattern lifted from the CSV import/
// export screen). We intentionally don't use Linking.openURL — the axios
// client handles auth headers for us.
export const DownloadDataScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await authApi.downloadMyData();
      // axios returns the body as a string because we asked for responseType:'text'.
      // Re-pretty-print so the file is human-readable in the share target.
      let jsonText;
      if (typeof res.data === 'string') {
        try {
          jsonText = JSON.stringify(JSON.parse(res.data), null, 2);
        } catch {
          jsonText = res.data;
        }
      } else {
        jsonText = JSON.stringify(res.data, null, 2);
      }

      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
      const filename = `cardshop-my-data-${stamp}.json`;
      const uri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(uri, jsonText, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Saved', `Your data was saved to:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/json',
        dialogTitle: filename,
        UTI: 'public.json',
      });
    } catch (err) {
      Alert.alert(
        'Download failed',
        err?.response?.data?.error || err?.message || 'Could not download your data. Try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.simpleHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.simpleHeaderTitle}>Download My Data</Text>
        <View style={{ width: 22 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}>
        <View style={styles.infoCard}>
          <Ionicons name="document-text-outline" size={22} color={Colors.accent} />
          <Text style={styles.infoText}>
            Get a JSON export of your account, collection, trade activity, and feedback.
            We'll save it to your device and open the share sheet so you can email or
            store it wherever you like.
          </Text>
        </View>
        <Button
          title={loading ? 'Preparing...' : 'Download JSON'}
          onPress={handleDownload}
          loading={loading}
          icon={<Ionicons name="download-outline" size={18} color={Colors.bg} />}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// DELETE ACCOUNT (30-day grace)
// ============================================================
// Asks for the current password, POSTs /auth/request-delete, and on
// success updates the local user with scheduled_deletion_at so the
// persistent banner immediately appears on the main tab. Signing in
// during the grace window cancels the deletion server-side.
export const DeleteAccountScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [currentPassword, setCurrentPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceling, setCanceling] = useState(false);

  const scheduled = user?.scheduled_deletion_at;

  const handleDelete = async () => {
    if (!currentPassword) return setError('Enter your current password to continue.');
    setError('');
    Alert.alert(
      'Delete account?',
      "Your account will be scheduled for deletion in 30 days. Sign in anytime before then to cancel.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const res = await authApi.requestDelete(currentPassword);
              updateUser({ scheduled_deletion_at: res?.data?.scheduled_deletion_at });
              showMessage({
                message: 'Account scheduled for deletion. Sign in anytime to cancel.',
                type: 'success',
                duration: 4000,
              });
              navigation.goBack();
            } catch (err) {
              const status = err?.response?.status;
              setError(
                err?.response?.data?.error ||
                (status === 401 ? 'Incorrect current password.' : 'Could not schedule deletion. Try again.'),
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleCancel = async () => {
    setCanceling(true);
    try {
      await authApi.cancelDelete();
      updateUser({ scheduled_deletion_at: null });
      showMessage({ message: 'Pending deletion cancelled.', type: 'success' });
    } catch (err) {
      showMessage({
        message: err?.response?.data?.error || 'Could not cancel. Try again.',
        type: 'danger',
      });
    } finally {
      setCanceling(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.simpleHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.simpleHeaderTitle}>Delete Account</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">
          {scheduled ? (
            <View style={styles.dangerCard}>
              <Ionicons name="warning-outline" size={22} color={Colors.accent3} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.dangerTitle}>Deletion pending</Text>
                <Text style={styles.dangerText}>
                  Your account will be deleted on{' '}
                  {new Date(scheduled).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.
                  Sign in anytime before then — or tap below — to cancel.
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.infoCard}>
              <Ionicons name="information-circle-outline" size={22} color={Colors.warning} />
              <Text style={styles.infoText}>
                We hold your data for 30 days before permanent deletion. Sign in any
                time during that window to cancel. After 30 days, your account,
                collection, and trade history are erased and can't be recovered.
              </Text>
            </View>
          )}

          {scheduled ? (
            <Button
              title={canceling ? 'Cancelling...' : 'Cancel pending deletion'}
              onPress={handleCancel}
              loading={canceling}
              variant="secondary"
            />
          ) : (
            <>
              {error ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorBoxText}>{error}</Text>
                </View>
              ) : null}
              <Input
                label="Current Password"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                placeholder="••••••••"
                secureTextEntry
                autoComplete="password"
              />
              <Button
                title="Schedule deletion"
                onPress={handleDelete}
                loading={loading}
                variant="danger"
                style={{ marginTop: Spacing.sm }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  profileHeader: {
    alignItems: 'center', paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent + '22', borderWidth: 2, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  avatarText: { color: Colors.accent, fontSize: Typography.xxxl, fontWeight: Typography.heavy },
  displayName: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold },
  username: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg, gap: Spacing.xl,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold },
  statLabel: { color: Colors.textMuted, fontSize: Typography.xs },
  statDivider: { width: 1, height: 24, backgroundColor: Colors.border },

  notifBanner: {
    marginHorizontal: Spacing.base, marginTop: Spacing.md, marginBottom: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent + '55',
    overflow: 'hidden',
  },
  notifBannerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 6,
  },
  notifBannerTitle: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },
  notifMarkAll: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold },
  notifRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  notifIcon: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  notifRowTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  notifRowBody: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 1 },
  notifViewAll: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
    alignItems: 'center',
  },
  notifViewAllText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.semibold },

  menuSection: { paddingHorizontal: Spacing.base, marginBottom: Spacing.md },
  menuSectionTitle: {
    color: Colors.textMuted, fontSize: Typography.xs,
    fontWeight: Typography.semibold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  menuCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  menuIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, color: Colors.text, fontSize: Typography.base },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  simpleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  simpleHeaderTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  wantItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  wantPlayer: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  wantSet: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  wantMeta: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  wantMetaText: { color: Colors.textMuted, fontSize: Typography.xs },
  gradedBadge: {
    backgroundColor: Colors.accent + '22', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.accent + '60',
  },
  gradedBadgeText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.medium },
  removeBtn: { padding: Spacing.sm },
  accountBlurb: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19, marginBottom: Spacing.sm },
  errorBox: {
    backgroundColor: Colors.accent3 + '22',
    borderWidth: 1,
    borderColor: Colors.accent3,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorBoxText: { color: Colors.accent3, fontSize: Typography.sm },
  infoCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, color: Colors.text, fontSize: Typography.sm, lineHeight: 20 },
  dangerCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.accent3 + '18',
    borderWidth: 1,
    borderColor: Colors.accent3 + '66',
    borderRadius: Radius.md,
    padding: Spacing.base,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  dangerTitle: { color: Colors.accent3, fontSize: Typography.base, fontWeight: Typography.bold },
  dangerText: { color: Colors.text, fontSize: Typography.sm, lineHeight: 19 },
  brandRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  brandThumb: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  brandThumbImg: { width: '100%', height: '100%' },
  brandPlaceholder: { color: Colors.textMuted, fontSize: Typography.xs },
  brandLabel: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  brandHint: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4, lineHeight: 16 },
  brandActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  brandActionBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  brandActionText: { color: Colors.text, fontSize: Typography.xs, fontWeight: Typography.semibold },
  brandClearText: { color: Colors.textMuted, fontSize: Typography.xs },
});

// ============================================================
// BRAND / PROFILE EDITOR
// ============================================================
// One place for the things that appear on the user's public surfaces:
// display name, avatar (the face), and brand logo (the brand mark).
// avatar shows up on profile circles, messaging, trust profile.
// brand_logo wins on binder header, scan landing seller block, and
// show-floor banner; falls back to avatar_url server-side when unset.
export const BrandProfileScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [displayName, setDisplayName] = useState(user?.display_name || '');
  // null = not yet touched (keep existing). '' = explicit clear.
  // string starting with data: = pending base64 upload.
  // string starting with http = already-uploaded URL (no-op on save).
  const [avatar, setAvatar] = useState(user?.avatar_url || null);
  const [logo, setLogo] = useState(user?.brand_logo_url || null);
  const [saving, setSaving] = useState(false);

  const pickImage = async (which) => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo access to pick an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        // Square crop for both — avatars and brand logos display in a
        // circle/round mask on every surface, so non-square art gets
        // clipped at the corners. Forcing the crop step at pick time
        // means the user picks the framing, not us.
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const a = result.assets[0];
      const dataUrl = `data:image/jpeg;base64,${a.base64}`;
      if (which === 'avatar') setAvatar(dataUrl);
      else setLogo(dataUrl);
    } catch (err) {
      Alert.alert('Image picker failed', err?.message || 'Try again.');
    }
  };

  const clearImage = (which) => {
    if (which === 'avatar') setAvatar('');
    else setLogo('');
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { display_name: displayName.trim() || undefined };
      // Only send keys the user actually touched. State === null means
      // "untouched, leave alone." '' means explicit clear. data: / http
      // both pass through to the server (uploadIfBase64 short-circuits
      // on https URLs).
      if (avatar !== user?.avatar_url) body.avatar_url = avatar;
      if (logo !== user?.brand_logo_url) body.brand_logo_url = logo;
      await authApi.updateProfile(body);
      await refreshUser();
      showMessage({ message: 'Profile saved', type: 'success', duration: 1500 });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Save failed', err?.response?.data?.error || err?.message || 'Try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderRow = (which, value, label, hint) => {
    const hasImage = value && value !== '';
    return (
      <View style={styles.brandRow}>
        <TouchableOpacity style={styles.brandThumb} onPress={() => pickImage(which)} activeOpacity={0.75}>
          {hasImage
            ? <Image source={{ uri: value }} style={styles.brandThumbImg} />
            : <Text style={styles.brandPlaceholder}>Tap</Text>}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.brandLabel}>{label}</Text>
          <Text style={styles.brandHint}>{hint}</Text>
          <View style={styles.brandActions}>
            <TouchableOpacity style={styles.brandActionBtn} onPress={() => pickImage(which)}>
              <Text style={styles.brandActionText}>{hasImage ? 'Replace' : 'Choose image'}</Text>
            </TouchableOpacity>
            {hasImage ? (
              <TouchableOpacity style={styles.brandActionBtn} onPress={() => clearImage(which)}>
                <Text style={styles.brandClearText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.simpleHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.simpleHeaderTitle}>Profile & brand</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }} keyboardShouldPersistTaps="handled">
          <Text style={styles.accountBlurb}>
            Your avatar shows up on messages and your profile circle. Your brand
            logo shows on your binder header, every card you list, and the
            show-floor banner when you check in to a show.
          </Text>

          <Input
            label="Display name"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={user?.username || ''}
          />

          {renderRow('avatar', avatar, 'Avatar', 'Square JPG/PNG. Used in messaging and your profile circle.')}
          {renderRow('logo',   logo,   'Brand logo', 'Optional. Shows on binders, cards, and the show floor. Falls back to your avatar if not set.')}

          <Button
            title={saving ? 'Saving…' : 'Save'}
            onPress={handleSave}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};
