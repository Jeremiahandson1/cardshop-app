// HomeHubScreen — first thing the user sees after login.
//
// Launcher + dashboard. Two layers, distinct jobs:
//   - "Needs you" strip: live action items (orders to ship, trade offers)
//     — the fastest path to "what do I do right now".
//   - Four job tiles (2x2): My Collection · Sell · Show Floor · My Local LCS.
// Notifications + Messages are header icons (🔔 / ✉️), not tiles. The bottom
// bar carries the everywhere-tools. See project_mobile_ia_redesign.
//
// Tiles route to where each area currently lives, so this screen is safe to
// ship ahead of the bar/hub work.
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useAuthStore } from '../store/authStore';
import { homeApi, contestsApi, notificationsApi, showFloorApi, listingsApi } from '../services/api';
import { getPushPermissionStatus, registerForPushNotificationsAsync } from '../services/pushRegistration';

const LCS_ENABLED = Constants.expoConfig?.extra?.LCS_ENABLED === true
  || Constants.expoConfig?.extra?.LCS_ENABLED === 'true';

// The four job tiles (visual order). Each routes to where that area lives
// today; the dedicated hubs (Sell, Collection landings) come next.
const TILES = [
  {
    key: 'collection',
    icon: 'albums',
    iconColor: '#7dd3fc',
    title: 'My Collection',
    subtitle: 'Binders · cards · trades',
    bg: 'rgba(125,211,252,0.10)',
    border: 'rgba(125,211,252,0.40)',
  },
  {
    key: 'marketplace',
    icon: 'cart',
    iconColor: '#5eead4',
    title: 'Shop',
    subtitle: 'Buy cards from other sellers',
    bg: 'rgba(94,234,212,0.10)',
    border: 'rgba(94,234,212,0.40)',
  },
  {
    key: 'sell',
    icon: 'pricetags',
    iconColor: '#4ade80',
    title: 'Sell',
    subtitle: 'Listings · orders · payouts',
    bg: 'rgba(74,222,128,0.10)',
    border: 'rgba(74,222,128,0.45)',
  },
  {
    key: 'show-floor',
    icon: 'flash',
    iconColor: '#e8c547',
    title: 'Show Floor',
    subtitle: 'Sell or shop at a show',
    bg: 'rgba(232,197,71,0.10)',
    border: 'rgba(232,197,71,0.45)',
  },
  {
    key: 'local-lcs',
    icon: 'location',
    iconColor: '#86efac',
    title: 'My Local LCS',
    subtitle: 'Card shops near you',
    bg: 'rgba(134,239,172,0.10)',
    border: 'rgba(134,239,172,0.40)',
    lcs: true, // hidden when LCS feature flag is off
  },
];

export const HomeHubScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  // Consolidated 'pending state' snapshot — drives the "Needs you" strip.
  // Refetches on focus so acting elsewhere clears items immediately.
  const { data: pending, refetch: refetchPending } = useQuery({
    queryKey: ['home-pending'],
    queryFn: () => homeApi.pending(),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetchPending(); }, [refetchPending]));

  // Unread notifications — drives the 🔔 header badge.
  const { data: notifData, refetch: refetchNotif } = useQuery({
    queryKey: ['home-unread'],
    queryFn: () => notificationsApi.get({ unread_only: true, limit: 1 }).then((r) => r.data),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetchNotif(); }, [refetchNotif]));
  const unreadCount = notifData?.unread_count || 0;

  // Show Floor live session — drives the "● LIVE" banner when checked in.
  const { data: sfData, refetch: refetchSf } = useQuery({
    queryKey: ['home-show-floor-me'],
    queryFn: () => showFloorApi.me().then((r) => r.data),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetchSf(); }, [refetchSf]));
  const liveSession = sfData?.check_in || null;

  // Seller summary — drives the "drafts to publish" action item.
  const { data: sellSummary, refetch: refetchSell } = useQuery({
    queryKey: ['home-sell-summary'],
    queryFn: () => listingsApi.sellSummary(),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetchSell(); }, [refetchSell]));
  const draftsCount = sellSummary?.drafts || 0;

  // Active contests — drives the single "Contests" hub pill. We fetch
  // the full list (not just banner-flagged ones) so the pill appears
  // whenever a contest is live, and can nudge the user with their own
  // progress toward maxing out their entries.
  const { data: contestList, refetch: refetchContests } = useQuery({
    queryKey: ['home-contests'],
    queryFn: () => contestsApi.list(),
    staleTime: 60000,
  });
  useFocusEffect(React.useCallback(() => { refetchContests(); }, [refetchContests]));
  const openContests = Array.isArray(contestList) ? contestList.filter((c) => c.status === 'open') : [];
  const goToContests = () => {
    try { navigation.navigate('ContestsList'); }
    catch (e) { console.warn('[home] contests nav failed', e?.message); }
  };

  // Pill subtitle: a single live contest nudges entry progress; multiple
  // just shows the count.
  const contestPillSub = (() => {
    if (openContests.length === 0) return null;
    if (openContests.length === 1) {
      const c = openContests[0];
      const rules = c.entry_rules && typeof c.entry_rules === 'object' ? c.entry_rules : {};
      const ways = Object.keys(rules).filter((k) => k.startsWith('per_') && rules[k]).length;
      const mine = c.my_entries || 0;
      if (c.one_entry_per_source_type && ways > 0) {
        return mine >= ways
          ? 'All entries earned — you’re in! 🎉'
          : `${mine} / ${ways} entries earned — tap to finish`;
      }
      return 'Free to enter — tap for details';
    }
    return `${openContests.length} live giveaways · tap to enter`;
  })();

  const tradeOffersCount = pending?.counts?.active_trade_offers || 0;
  const marketplaceCount = pending?.counts?.marketplace_sales || 0;

  // Push permission watcher — warns if notifications are off.
  const [pushStatus, setPushStatus] = useState('granted');
  React.useEffect(() => {
    let mounted = true;
    const check = async () => {
      const s = await getPushPermissionStatus();
      if (mounted) setPushStatus(s);
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => { mounted = false; sub.remove(); };
  }, []);
  useFocusEffect(React.useCallback(() => {
    getPushPermissionStatus().then(setPushStatus);
  }, []));
  const pushOff = pushStatus === 'denied' || pushStatus === 'undetermined';

  const isAdmin = user?.role === 'admin' || user?.is_admin === true;

  const safeNav = (tab, screen, params) => {
    try {
      if (screen) navigation.navigate(tab, { screen, params });
      else navigation.navigate(tab);
    } catch (e) {
      console.warn('[home] navigate failed', e?.message);
    }
  };

  const onTilePress = (tile) => {
    switch (tile.key) {
      case 'collection':
        try { navigation.navigate('MyCollectionHub'); }
        catch (e) { console.warn('[home] navigate failed', e?.message); }
        return undefined;
      case 'sell':
        try { navigation.navigate('SellHub'); }
        catch (e) { console.warn('[home] navigate failed', e?.message); }
        return undefined;
      case 'marketplace': return safeNav('Profile', 'MarketplaceHome');
      case 'show-floor': return safeNav('Profile', 'ShowFloorHub');
      case 'local-lcs': return safeNav('LCS');
      default: return undefined;
    }
  };

  const tiles = TILES.filter((t) => !t.lcs || LCS_ENABLED);

  // "Needs you" — actionable items only. Hidden entirely when nothing waits.
  const needs = [];
  if (draftsCount > 0) {
    needs.push({
      key: 'drafts', icon: 'pricetags-outline', color: '#4ade80',
      label: `${draftsCount} draft${draftsCount === 1 ? '' : 's'} to publish`,
      onPress: () => safeNav('Profile', 'MyListings'),
    });
  }
  if (marketplaceCount > 0) {
    needs.push({
      key: 'ship', icon: 'cube-outline', color: '#4ade80',
      label: `${marketplaceCount} order${marketplaceCount === 1 ? '' : 's'} to ship`,
      onPress: () => safeNav('Profile', 'MyOrders'),
    });
  }
  if (tradeOffersCount > 0) {
    needs.push({
      key: 'trades', icon: 'swap-horizontal', color: '#a78bfa',
      label: `${tradeOffersCount} trade offer${tradeOffersCount === 1 ? '' : 's'} waiting`,
      onPress: () => safeNav('Profile', 'MyOffers', { initialKindFilter: 'trade', lockKind: true }),
    });
  }

  const tierBadge = (() => {
    if (isAdmin) return { label: 'Admin', color: '#a78bfa' };
    const tier = user?.subscription_tier;
    if (tier === 'show_floor') return { label: 'Show Floor', color: '#4ade80' };
    if (tier === 'collector_pro') return { label: 'Pro', color: '#e8c547' };
    if (tier === 'store_pro' || tier === 'store_starter') return { label: 'Store', color: '#60a5fa' };
    return { label: 'Free', color: '#9ca3af' };
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Header: greeting + tier badge, with Notifications + Messages icons */}
        <View style={styles.header}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.greeting} numberOfLines={1}>
              {greeting}{user?.display_name || user?.username ? `, ${user.display_name || user.username}` : ''}
            </Text>
            <TouchableOpacity
              onPress={() => safeNav('Profile', 'Upgrade')}
              style={{
                paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
                backgroundColor: tierBadge.color + '22',
                borderWidth: 1, borderColor: tierBadge.color + '88',
              }}
            >
              <Text style={{ color: tierBadge.color, fontSize: 11, fontWeight: '700', letterSpacing: 0.4 }}>
                {tierBadge.label.toUpperCase()}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => safeNav('Profile', 'ConversationList')} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="mail-outline" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => safeNav('Profile', 'Notifications')} style={styles.iconBtn} activeOpacity={0.7}>
              <Ionicons name="notifications-outline" size={22} color={Colors.text} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Show Floor LIVE — only when checked in at a show */}
        {liveSession ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => safeNav('Profile', 'ManageBooth')}
            style={styles.liveBanner}
          >
            <View style={styles.liveDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.liveTitle}>● LIVE at a show</Text>
              <Text style={styles.liveSub} numberOfLines={1}>
                {[liveSession.event_name || liveSession.venue_name, liveSession.table_number ? `Table ${liveSession.table_number}` : null].filter(Boolean).join(' · ') || 'Tap to manage your booth'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#4ade80" />
          </TouchableOpacity>
        ) : null}

        {/* Contests — single pill into the contests list */}
        {openContests.length > 0 ? (
          <TouchableOpacity activeOpacity={0.85} onPress={goToContests} style={styles.contestPill}>
            <View style={styles.contestIconBubble}>
              <Ionicons name="gift" size={22} color="#e8c547" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contestPillTitle}>Contests</Text>
              {contestPillSub ? (
                <Text style={styles.contestPillSub} numberOfLines={1}>{contestPillSub}</Text>
              ) : null}
            </View>
            <Text style={styles.contestPillCta}>Enter →</Text>
          </TouchableOpacity>
        ) : null}

        {/* Push-permission warning */}
        {pushOff ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              if (pushStatus === 'undetermined') {
                const r = await registerForPushNotificationsAsync();
                setPushStatus(r?.ok ? 'granted' : 'denied');
              } else {
                Linking.openSettings();
              }
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
              padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
              backgroundColor: 'rgba(232,197,71,0.10)', borderColor: 'rgba(232,197,71,0.45)',
              marginBottom: Spacing.md,
            }}
          >
            <Ionicons name="notifications-off" size={22} color="#e8c547" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#e8c547', fontWeight: '700', fontSize: 14 }}>Notifications are off</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>
                You won't get pushes for trade offers or sales until you enable them. Tap here.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        {/* NEEDS YOU — actionable items, only when something's waiting */}
        {needs.length > 0 && (
          <View style={styles.needsCard}>
            <Text style={styles.needsTitle}>NEEDS YOU</Text>
            {needs.map((n) => (
              <TouchableOpacity key={n.key} style={styles.needsRow} activeOpacity={0.7} onPress={n.onPress}>
                <Ionicons name={n.icon} size={18} color={n.color} />
                <Text style={styles.needsLabel}>{n.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Job tiles — 2x2 grid */}
        <View style={styles.tileGrid}>
          {tiles.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              activeOpacity={0.8}
              style={[styles.tile, { backgroundColor: tile.bg, borderColor: tile.border }]}
              onPress={() => onTilePress(tile)}
            >
              <View style={[styles.iconBubble, { backgroundColor: tile.iconColor + '20' }]}>
                <Ionicons name={tile.icon} size={28} color={tile.iconColor} />
              </View>
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={styles.tileSubtitle} numberOfLines={2}>{tile.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: {
    paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
  },
  greeting: {
    fontFamily: Typography.display, fontSize: 24, fontWeight: '700',
    color: Colors.text, letterSpacing: -0.5,
  },
  headerIcons: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { padding: 6 },
  badge: {
    position: 'absolute', top: 0, right: 0,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
    backgroundColor: Colors.accent3 || '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },

  liveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
    backgroundColor: 'rgba(74,222,128,0.10)', borderColor: 'rgba(74,222,128,0.5)',
  },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80' },
  liveTitle: { color: '#4ade80', fontWeight: '800', fontSize: 14 },
  liveSub: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },

  contestPill: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg, borderWidth: 1,
    backgroundColor: 'rgba(232,197,71,0.14)', borderColor: 'rgba(232,197,71,0.55)',
  },
  contestIconBubble: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(232,197,71,0.20)',
  },
  contestPillTitle: { color: '#e8c547', fontSize: 15, fontWeight: '800' },
  contestPillSub: { color: Colors.text, fontSize: 12, marginTop: 2 },
  contestPillCta: { color: '#e8c547', fontSize: 13, fontWeight: '700' },

  needsCard: {
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface, padding: Spacing.md, gap: 4,
  },
  needsTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
    color: Colors.textMuted, marginBottom: 4,
  },
  needsRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 8,
  },
  needsLabel: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },

  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  tile: {
    flexBasis: '47%', flexGrow: 1,
    minHeight: 120,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: 6,
    justifyContent: 'flex-start',
  },
  iconBubble: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: {
    fontFamily: Typography.display, fontSize: 18, fontWeight: '700',
    color: Colors.text,
  },
  tileSubtitle: { fontSize: 12, color: Colors.textMuted, lineHeight: 16 },
});
