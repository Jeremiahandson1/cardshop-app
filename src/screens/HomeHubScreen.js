// HomeHubScreen — first thing the user sees after login.
// Five big tappable tiles, one per "mode" the app supports.
// Tapping a tile jumps into the existing stack for that area.
//
// The point: keep the user from being confronted with the full
// tab/screen surface area on launch. They pick the lens they
// want (Show Floor / Collection / Local LCS / Trade Offers /
// Marketplace Sales) and only see what's relevant to that lens
// until they come back here. Trade-offers + marketplace tiles
// surface a live count so the user knows at a glance whether
// anything needs attention.
import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Linking, Platform, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useAuthStore } from '../store/authStore';
import { homeApi, contestsApi } from '../services/api';
import { getPushPermissionStatus, registerForPushNotificationsAsync } from '../services/pushRegistration';

// Tiers that include Show Floor access. Collector Pro does NOT —
// Show Floor is a $24.99 standalone upgrade. Stores get it bundled.
const SHOW_FLOOR_TIERS = new Set(['show_floor', 'store_starter', 'store_pro']);

// Static tile metadata — count subtitles get filled in at render
// time from /api/home/pending. Order is the visual order on screen.
const TILES = [
  {
    key: 'show-floor',
    icon: 'flash',
    iconColor: '#e8c547',
    title: 'Show Floor',
    subtitle: 'Live now — sell at a show or shop a show',
    bg: 'rgba(232,197,71,0.10)',
    border: 'rgba(232,197,71,0.45)',
    // Target picked at render time based on user tier.
    requires: 'show_floor',
  },
  {
    key: 'collection',
    icon: 'albums',
    iconColor: '#7dd3fc',
    title: 'My Collection',
    subtitle: 'Binders, want list, trade, marketplace',
    bg: 'rgba(125,211,252,0.10)',
    border: 'rgba(125,211,252,0.40)',
    target: { tab: 'Binders' },
  },
  {
    key: 'local-lcs',
    icon: 'location',
    iconColor: '#86efac',
    title: 'My Local LCS',
    subtitle: 'Card shops near you',
    bg: 'rgba(134,239,172,0.10)',
    border: 'rgba(134,239,172,0.40)',
    target: { tab: 'LCS' },
  },
  {
    key: 'trade-offers',
    icon: 'swap-horizontal',
    iconColor: '#a78bfa',
    title: 'Active Trade Offers',
    bg: 'rgba(167,139,250,0.10)',
    border: 'rgba(167,139,250,0.45)',
    // Pin the kind filter to 'trade' and hide the chip rail entirely
    // — coming from this tile, the user has signaled they only care
    // about trade offers, so the All/Marketplace/Binder chips would
    // just be visual noise.
    target: { tab: 'Profile', screen: 'MyOffers', params: { initialKindFilter: 'trade', lockKind: true } },
    // subtitle is computed at render from counts.active_trade_offers
  },
  {
    key: 'marketplace',
    icon: 'cart',
    iconColor: '#4ade80',
    title: 'Marketplace',
    bg: 'rgba(74,222,128,0.10)',
    border: 'rgba(74,222,128,0.45)',
    // Routing is resolved at tap time (see onTilePress): if the user
    // has pending sales we send them to MyOrders so they can ship;
    // otherwise we send them to the public browse. Tile target left
    // here as the no-count default so the static fallback in
    // onTilePress doesn't have to special-case it.
    target: { tab: 'Profile', screen: 'MarketplaceHome' },
  },
];

// Single-banner layout: full-width row with icon/card, title,
// pitch text, and the CTA. Used when exactly one contest is
// flagged for the home banner.
const SingleBanner = ({ contest, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={() => onPress(contest.slug)}
    style={{
      flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
      padding: Spacing.md,
      borderRadius: Radius.lg,
      borderWidth: 1,
      backgroundColor: 'rgba(232,197,71,0.14)',
      borderColor: 'rgba(232,197,71,0.55)',
      marginBottom: Spacing.md,
    }}
  >
    {contest.prize_card?.front_image_url ? (
      <Image
        source={{ uri: contest.prize_card.front_image_url }}
        style={{ width: 42, height: 58, borderRadius: 4, backgroundColor: '#0f172a' }}
        resizeMode="contain"
      />
    ) : (
      <Ionicons name="gift" size={22} color="#e8c547" />
    )}
    <View style={{ flex: 1 }}>
      <Text style={{ color: '#e8c547', fontSize: 14, fontWeight: '700' }}>
        {contest.title}
      </Text>
      <Text style={{ color: Colors.text, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
        {contest.banner_text || contest.prize_description || contest.prize_card?.title || ''}
      </Text>
    </View>
    <Text style={{ color: '#e8c547', fontSize: 12, fontWeight: '600' }}>
      {contest.banner_cta_text || 'See contest'} →
    </Text>
  </TouchableOpacity>
);

// Split-banner layout: card image + contest title only. flex:1 in
// a flexWrap row puts two side-by-side; a third wraps to its own
// row. No pitch text since the box is too narrow to read it.
const SplitBanner = ({ contest, onPress }) => (
  <TouchableOpacity
    activeOpacity={0.85}
    onPress={() => onPress(contest.slug)}
    style={{
      flexBasis: '48%', flexGrow: 1,
      padding: Spacing.sm,
      borderRadius: Radius.lg,
      borderWidth: 1,
      backgroundColor: 'rgba(232,197,71,0.14)',
      borderColor: 'rgba(232,197,71,0.55)',
      flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    }}
  >
    {contest.prize_card?.front_image_url ? (
      <Image
        source={{ uri: contest.prize_card.front_image_url }}
        style={{ width: 38, height: 52, borderRadius: 4, backgroundColor: '#0f172a' }}
        resizeMode="contain"
      />
    ) : (
      <View style={{ width: 38, height: 52, borderRadius: 4, backgroundColor: 'rgba(232,197,71,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="gift" size={20} color="#e8c547" />
      </View>
    )}
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={{ color: '#e8c547', fontSize: 12, fontWeight: '700' }} numberOfLines={2}>
        {contest.title}
      </Text>
    </View>
  </TouchableOpacity>
);

export const HomeHubScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  // Pull the consolidated 'pending state' snapshot. Banners on the
  // home screen are keyed on real state (pending offers, paid-not-
  // shipped orders, etc.), NOT unread notifications — notifications
  // get marked read on tap but the underlying pending state stays
  // until the user actually does something. Refetches on focus so
  // accepting / shipping elsewhere clears the banner immediately.
  const { data: pending, refetch: refetchPending } = useQuery({
    queryKey: ['home-pending'],
    queryFn: () => homeApi.pending(),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetchPending(); }, [refetchPending]));

  // Active contest banners — empty array when none flagged. Admins
  // can flip show_banner on multiple contests; the home screen
  // renders them side-by-side (split layout) when more than one is
  // live. Refetch on focus so toggle-on/off propagates without a
  // pull-to-refresh.
  const { data: contestBanners, refetch: refetchBanners } = useQuery({
    queryKey: ['home-contest-banners'],
    queryFn: () => contestsApi.banners(),
    staleTime: 60000,
  });
  useFocusEffect(React.useCallback(() => { refetchBanners(); }, [refetchBanners]));
  const openContest = (slug) => {
    if (!slug) return;
    try {
      navigation.navigate('Home', { screen: 'Contest', params: { slug } });
    } catch (e) {
      // Should never trip in production — HomeStack registers Contest
      // explicitly. Fall back to the web page only if the nav stack
      // is somehow misconfigured.
      console.warn('[home] contest nav failed, falling back to web:', e?.message);
      const url = `https://cardshop.twomiah.com/contests/${slug}`;
      Linking.openURL(url).catch(() => {});
    }
  };

  const tradeOffersCount    = pending?.counts?.active_trade_offers || 0;
  const marketplaceCount    = pending?.counts?.marketplace_sales   || 0;

  // Push permission watcher — fires a yellow banner if the user
  // doesn't have notifications enabled (otherwise no trade-offer or
  // sale pushes ever land). Re-checks when the app comes back from
  // background (in case they just toggled notifications on in
  // Settings).
  const [pushStatus, setPushStatus] = useState('granted'); // optimistic default
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

  // Admins bypass tier gates (matches API middleware in
  // requireShowFloor / requirePro). Same for store-owner roles
  // since stores get Show Floor bundled.
  const isAdmin = user?.role === 'admin' || user?.is_admin === true;
  const hasShowFloor = isAdmin || SHOW_FLOOR_TIERS.has(user?.subscription_tier);

  const onTilePress = (tile) => {
    let target;
    if (tile.key === 'show-floor') {
      // ShowFloorHub is the buyer-friendly chooser ("I'm selling" vs
      // "Shop a show"). Always send everyone there — the per-side
      // gate lives inside the hub now, so buyers can scan a show
      // without having to go through the seller upsell page first.
      // Previously, non-paying users got dumped on the upsell
      // explainer with no way to even browse — making "shop the
      // show floor" effectively hidden inside Profile.
      target = { tab: 'Profile', screen: 'ShowFloorHub' };
    } else if (tile.key === 'collection') {
      target = { tab: 'Binders' };
    } else if (tile.key === 'local-lcs') {
      target = { tab: 'LCS' };
    } else if (tile.key === 'marketplace') {
      // Always route to MarketplaceHome — consistency across accounts
      // beats the power-shortcut to MyOrders, especially now that
      // MarketplaceHome surfaces a "X to ship" banner up top for
      // sellers with pending sales (and has a permanent Orders pill).
      target = tile.target;
    } else if (tile.target) {
      // trade-offers and other tiles ship with explicit targets
      // in the static metadata — no per-key branching needed.
      target = tile.target;
    } else {
      return;
    }
    try {
      if (target.screen) {
        navigation.navigate(target.tab, {
          screen: target.screen,
          params: target.params,
        });
      } else {
        navigation.navigate(target.tab);
      }
    } catch (e) {
      console.warn('[home] navigate failed', e?.message);
    }
  };

  // Build the per-tile subtitle. Static tiles use their declared
  // subtitle; the two count-driven tiles inject the live count.
  const subtitleFor = (tile) => {
    if (tile.key === 'trade-offers') {
      return tradeOffersCount === 0
        ? '0 active trades'
        : `${tradeOffersCount} active trade${tradeOffersCount === 1 ? '' : 's'}`;
    }
    if (tile.key === 'marketplace') {
      return marketplaceCount === 0
        ? 'Browse — every listing flows through the chain'
        : `${marketplaceCount} sale${marketplaceCount === 1 ? '' : 's'} pending · tap to ship`;
    }
    return tile.subtitle;
  };

  // Tier label for the badge. Free users get a subtle "Free" pill
  // that doubles as an upgrade nudge. Admins get an "Admin" pill.
  const tierBadge = (() => {
    if (isAdmin) return { label: 'Admin', color: '#a78bfa' };
    const tier = user?.subscription_tier;
    if (tier === 'show_floor')    return { label: 'Show Floor', color: '#4ade80' };
    if (tier === 'collector_pro') return { label: 'Pro', color: '#e8c547' };
    if (tier === 'store_pro' || tier === 'store_starter') return { label: 'Store', color: '#60a5fa' };
    return { label: 'Free', color: '#9ca3af' };
  })();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={styles.greeting}>
              {greeting}{user?.display_name || user?.username ? `, ${user.display_name || user.username}` : ''}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Profile', { screen: 'Upgrade' })}
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
          <Text style={styles.subtitle}>What are you here to do?</Text>
        </View>

        {/* Active contest banner — admin toggles per-contest in the
            dashboard /admin/contests page. Taps open the public
            contest landing on the collector site. */}
        {Array.isArray(contestBanners) && contestBanners.length > 0 ? (
          contestBanners.length === 1 ? (
            // Single banner: full-width layout with title + pitch text + CTA.
            <SingleBanner contest={contestBanners[0]} onPress={openContest} />
          ) : (
            // Multiple banners: split row, each compact (card image +
            // contest title only). Falls to a new row if 3+.
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md, flexWrap: 'wrap' }}>
              {contestBanners.map((b) => (
                <SplitBanner key={b.id} contest={b} onPress={openContest} />
              ))}
            </View>
          )
        ) : null}

        {/* Push-permission warning — without notifications enabled,
            no trade-offer / sale push ever lands. Tapping fires the
            re-prompt (works on first attempt) or opens system
            Settings (works after a 'denied' state). */}
        {pushOff ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={async () => {
              if (pushStatus === 'undetermined') {
                const r = await registerForPushNotificationsAsync();
                if (r?.ok) setPushStatus('granted');
                else setPushStatus('denied');
              } else {
                // 'denied' state — system won't re-prompt, must go
                // through Settings. Linking.openSettings deep-links
                // straight to this app's notification page.
                Linking.openSettings();
              }
            }}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
              padding: Spacing.md,
              borderRadius: Radius.lg,
              borderWidth: 1,
              backgroundColor: 'rgba(232,197,71,0.10)',
              borderColor: 'rgba(232,197,71,0.45)',
              marginBottom: Spacing.md,
            }}
          >
            <Ionicons name="notifications-off" size={22} color="#e8c547" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#e8c547', fontWeight: '700', fontSize: 14 }}>
                Notifications are off
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 2 }}>
                You won't get pushes for trade offers or sales until you enable them. Tap here.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.tileGrid}>
          {TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              activeOpacity={0.8}
              style={[styles.tile, { backgroundColor: tile.bg, borderColor: tile.border }]}
              onPress={() => onTilePress(tile)}
            >
              <View style={[styles.iconBubble, { backgroundColor: tile.iconColor + '20' }]}>
                <Ionicons name={tile.icon} size={32} color={tile.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>{tile.title}</Text>
                <Text style={styles.tileSubtitle}>{subtitleFor(tile)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.profileLinkText}>Profile & settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.xs },
  greeting: {
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  tileGrid: { gap: Spacing.md },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  tileSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  profileLinkText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  upgradeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(232,197,71,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(232,197,71,0.50)',
  },
  upgradeChipText: {
    color: '#e8c547',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
