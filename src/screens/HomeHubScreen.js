// HomeHubScreen — first thing the user sees after login.
// Three big tappable tiles, one per "mode" the app supports.
// Tapping a tile jumps into the existing stack for that area.
//
// The point: keep the user from being confronted with the full
// tab/screen surface area on launch. They pick the lens they
// want (Show Floor, Collection, Local LCS) and only see what's
// relevant to that lens until they come back here.
import React, { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useAuthStore } from '../store/authStore';
import { homeApi } from '../services/api';

// Tiers that include Show Floor access. Collector Pro does NOT —
// Show Floor is a $24.99 standalone upgrade. Stores get it bundled.
const SHOW_FLOOR_TIERS = new Set(['show_floor', 'store_starter', 'store_pro']);

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
];

// Banner — one row per pending state on the home screen. Tone
// drives the background tint (hot=urgent green/red, warm=yellow
// for incoming, cool=blue for informational).
const ActivityBanner = ({ iconName, iconColor, tone, title, sub, onPress }) => {
  const toneStyles = {
    hot:  { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.40)' },
    warm: { bg: 'rgba(232,197,71,0.10)', border: 'rgba(232,197,71,0.45)' },
    cool: { bg: 'rgba(96,165,250,0.10)', border: 'rgba(96,165,250,0.40)' },
  }[tone] || { bg: 'rgba(232,197,71,0.10)', border: 'rgba(232,197,71,0.45)' };
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.activityBanner, { backgroundColor: toneStyles.bg, borderColor: toneStyles.border }]}
    >
      <View style={[styles.activityIcon, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={iconName} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.activityTitle, { color: iconColor }]}>{title}</Text>
        <Text style={styles.activitySub}>{sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
};

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

  const offersReceivedCount   = pending?.offers_received?.length || 0;
  const listingOffersCount    = pending?.listing_offers_received?.length || 0;
  const ordersToShipCount     = pending?.orders_to_ship?.length || 0;
  const offersAcceptedCount   = pending?.offers_accepted_for_buyer?.length || 0;
  const ordersToConfirmCount  = pending?.orders_to_confirm?.length || 0;

  // Admins bypass tier gates (matches API middleware in
  // requireShowFloor / requirePro). Same for store-owner roles
  // since stores get Show Floor bundled.
  const isAdmin = user?.role === 'admin' || user?.is_admin === true;
  const hasShowFloor = isAdmin || SHOW_FLOOR_TIERS.has(user?.subscription_tier);

  const onTilePress = (tile) => {
    // Per-tile resolution. Show Floor is gated on tier — non-paying
    // users land on the upsell explainer instead of the live hub.
    let target;
    if (tile.key === 'show-floor') {
      target = hasShowFloor
        ? { tab: 'Profile', screen: 'ShowFloorHub' }
        : { tab: 'Profile', screen: 'ShowFloorUpsell' };
    } else if (tile.key === 'collection') {
      target = { tab: 'Binders' };
    } else if (tile.key === 'local-lcs') {
      target = { tab: 'LCS' };
    } else {
      return;
    }
    try {
      if (target.screen) navigation.navigate(target.tab, { screen: target.screen });
      else navigation.navigate(target.tab);
    } catch (e) {
      console.warn('[home] navigate failed', e?.message);
    }
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

        {/* Active-state banners. Each renders only when its bucket
            is non-zero. Order is by urgency: orders-to-ship first
            (you owe a buyer), then accepted offers (you owe payment),
            then incoming offers, then orders-to-confirm. */}
        {ordersToShipCount > 0 ? (
          <ActivityBanner
            iconName="cube"
            iconColor="#ef4444"
            tone="hot"
            title={`${ordersToShipCount} order${ordersToShipCount === 1 ? '' : 's'} to ship`}
            sub="You've been paid. Add tracking to keep the buyer's clock ticking."
            onPress={() => navigation.navigate('Profile', { screen: 'MyOrders' })}
          />
        ) : null}

        {offersAcceptedCount > 0 ? (
          <ActivityBanner
            iconName="checkmark-circle"
            iconColor="#4ade80"
            tone="hot"
            title={`${offersAcceptedCount} offer${offersAcceptedCount === 1 ? '' : 's'} accepted — your move`}
            sub="The other party said yes. Coordinate the trade."
            onPress={() => navigation.navigate('Profile', { screen: 'MyOffers' })}
          />
        ) : null}

        {offersReceivedCount > 0 ? (
          <ActivityBanner
            iconName="mail-unread"
            iconColor="#e8c547"
            tone="warm"
            title={`${offersReceivedCount} offer${offersReceivedCount === 1 ? '' : 's'} waiting on you`}
            sub="Trade-board offers you haven't responded to."
            onPress={() => navigation.navigate('Profile', { screen: 'MyOffers' })}
          />
        ) : null}

        {listingOffersCount > 0 ? (
          <ActivityBanner
            iconName="cash"
            iconColor="#e8c547"
            tone="warm"
            title={`${listingOffersCount} cash offer${listingOffersCount === 1 ? '' : 's'} on your listings`}
            sub="Marketplace buyers offered below ask. Counter, accept, or pass."
            onPress={() => navigation.navigate('Profile', { screen: 'MyOffers' })}
          />
        ) : null}

        {ordersToConfirmCount > 0 ? (
          <ActivityBanner
            iconName="archive"
            iconColor="#60a5fa"
            tone="cool"
            title={`${ordersToConfirmCount} order${ordersToConfirmCount === 1 ? '' : 's'} arrived`}
            sub="Confirm receipt to release the seller's funds."
            onPress={() => navigation.navigate('Profile', { screen: 'MyOrders' })}
          />
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
                <Text style={styles.tileSubtitle}>
                  {tile.key === 'show-floor' && !hasShowFloor
                    ? 'Tap to learn more'
                    : tile.subtitle}
                </Text>
              </View>
              {tile.key === 'show-floor' && !hasShowFloor ? (
                <View style={styles.upgradeChip}>
                  <Text style={styles.upgradeChipText}>UPGRADE</Text>
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              )}
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

  // Offer-activity banner — yellow by default for new incoming
  // offers, green when there's an acceptance to act on.
  activityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(232,197,71,0.10)',
    borderColor: 'rgba(232,197,71,0.45)',
    marginTop: -Spacing.xs,
  },
  activityBannerHot: {
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderColor: 'rgba(74,222,128,0.50)',
  },
  activityIcon: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  activityTitle: {
    color: '#e8c547',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  activitySub: {
    color: Colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
});
