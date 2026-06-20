// SellHubScreen — the seller's command center, reached from the Home "Sell"
// tile. Gathers the whole storefront (listings, orders, offers, analytics,
// payouts, eBay sync, seller settings) that previously lived scattered in the
// Profile tab. Every row routes to an already-registered screen.
// The "orders to ship" badge uses the existing /api/home/pending; a richer
// snapshot (active/drafts/offers counts) is a follow-up needing a summary
// endpoint. See project_mobile_ia_redesign.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { homeApi } from '../services/api';

const PRIMARY = [
  { key: 'create', icon: 'add', label: 'List a card', nav: ['Profile', 'CreateListing'], main: true },
  { key: 'bulk', icon: 'layers-outline', label: 'Bulk list', nav: ['Profile', 'BulkListInventory'] },
  { key: 'ebay', icon: 'cloud-download-outline', label: 'Import eBay', nav: ['Profile', 'EbayCsvImport'] },
];

const SECTIONS = [
  {
    title: 'MANAGE',
    rows: [
      { key: 'listings', icon: 'pricetags', color: '#4ade80', label: 'My Listings', sub: 'Active · drafts · sold', nav: ['Profile', 'MyListings'] },
      { key: 'orders', icon: 'cube', color: '#60a5fa', label: 'Orders', sub: 'Ship & track', nav: ['Profile', 'MyOrders'], badge: 'ship' },
      { key: 'offers', icon: 'chatbubbles', color: '#a78bfa', label: 'Offers', sub: 'Respond to buyers', nav: ['Profile', 'MyOffers'] },
      { key: 'analytics', icon: 'stats-chart', color: '#e8c547', label: 'Seller analytics', sub: '30-day performance', nav: ['Profile', 'SellerAnalytics'] },
    ],
  },
  {
    title: 'MONEY & SYNC',
    rows: [
      { key: 'payouts', icon: 'wallet', color: '#4ade80', label: 'Payouts', sub: 'Balance & withdraw', nav: ['WalletTab'] },
      { key: 'ebaysync', icon: 'sync', color: '#60a5fa', label: 'eBay Sync', sub: 'Connection & cross-post', nav: ['Profile', 'Integrations'] },
    ],
  },
  {
    title: 'SELLER SETTINGS',
    rows: [
      { key: 'defaults', icon: 'options', color: '#9ca3af', label: 'Listing defaults', sub: 'Shipping & preferences', nav: ['Profile', 'ListingDefaults'] },
      { key: 'stickers', icon: 'pricetag', color: '#9ca3af', label: 'Order stickers', sub: 'QR sticker sheets', nav: ['Profile', 'OrderStickers'] },
    ],
  },
];

export const SellHubScreen = ({ navigation }) => {
  const { data: pending, refetch } = useQuery({
    queryKey: ['home-pending'],
    queryFn: () => homeApi.pending(),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));
  const toShip = pending?.counts?.marketplace_sales || 0;

  const go = (nav) => {
    try {
      if (nav.length === 1) navigation.navigate(nav[0]);
      else navigation.navigate(nav[0], { screen: nav[1] });
    } catch (e) {
      console.warn('[sell-hub] nav failed', e?.message);
    }
  };

  const badgeFor = (row) => (row.badge === 'ship' && toShip > 0 ? toShip : null);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Sell</Text>
        </View>

        {/* Primary actions */}
        <View style={styles.actionsRow}>
          {PRIMARY.map((a) => (
            <TouchableOpacity
              key={a.key}
              activeOpacity={0.85}
              onPress={() => go(a.nav)}
              style={[styles.action, a.main && styles.actionMain]}
            >
              <Ionicons name={a.icon} size={18} color={a.main ? Colors.bg : Colors.text} />
              <Text style={[styles.actionLabel, a.main && { color: Colors.bg }]}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.card}>
              {sec.rows.map((r, i) => {
                const badge = badgeFor(r);
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.row, i > 0 && styles.rowBorder]}
                    activeOpacity={0.7}
                    onPress={() => go(r.nav)}
                  >
                    <View style={[styles.iconBubble, { backgroundColor: r.color + '20' }]}>
                      <Ionicons name={r.icon} size={20} color={r.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowLabel}>{r.label}</Text>
                      {r.sub ? <Text style={styles.rowSub}>{r.sub}</Text> : null}
                    </View>
                    {badge ? (
                      <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>
                    ) : null}
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg, paddingBottom: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  back: { padding: 2 },
  title: { fontFamily: Typography.display, fontSize: 26, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },

  actionsRow: { flexDirection: 'row', gap: Spacing.sm },
  action: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  actionMain: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  actionLabel: { color: Colors.text, fontSize: 13, fontWeight: '700' },

  section: { gap: Spacing.xs },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: Colors.textMuted, marginLeft: 4 },
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  iconBubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: Colors.accent3 || '#ef4444',
    alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
