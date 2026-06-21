// MyCollectionHubScreen — the collector side, reached from the Home
// "My Collection" tile. A launcher that gathers everything you do WITH your
// cards: hold (binders), grow (shop / trade / want list / sets), and tools.
// Every row routes to an already-registered screen. See
// project_mobile_ia_redesign.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { cardsApi } from '../services/api';

// Each row's `nav` is the navigation target:
//   ['TabName']                          -> switch to that tab
//   ['TabName', 'ScreenName']            -> tab, nested screen
//   ['TabName', { screen, params }]      -> tab, nested screen + params
const SECTIONS = [
  {
    title: 'YOUR CARDS',
    rows: [
      { key: 'binders', icon: 'albums', color: '#7dd3fc', label: 'Binders', sub: 'Your collection', nav: ['Binders'] },
      { key: 'add', icon: 'add-circle', color: '#4ade80', label: 'Add a card', sub: 'Search the catalog, enter manually, or scan a sticker', nav: ['Binders', { screen: 'RegisterCard' }] },
    ],
  },
  {
    title: 'GROW IT',
    rows: [
      { key: 'shop', icon: 'cart', color: '#4ade80', label: 'Shop the market', sub: 'Buy from other sellers', nav: ['Profile', 'MarketplaceHome'] },
      { key: 'trades', icon: 'swap-horizontal', color: '#a78bfa', label: 'Trades', sub: 'Trade card-for-card', nav: ['Trade'] },
      { key: 'wantlist', icon: 'heart', color: '#f87171', label: 'Want list', sub: "Cards you're hunting", nav: ['Profile', 'WantList'] },
      { key: 'sets', icon: 'grid', color: '#e8c547', label: 'Set completion', sub: 'Track sets you collect', nav: ['Profile', 'SetsList'] },
      { key: 'dealradar', icon: 'pulse', color: '#fbbf24', label: 'Deal Radar', sub: 'Underpriced cards near comps', nav: ['Profile', 'DealRadarSettings'] },
    ],
  },
  {
    title: 'TOOLS',
    rows: [
      { key: 'import', icon: 'swap-vertical', color: '#9ca3af', label: 'Import / export', sub: 'CSV', nav: ['Binders', { screen: 'CollectionImportExport' }] },
    ],
  },
];

export const MyCollectionHubScreen = ({ navigation }) => {
  const { data: summary, refetch } = useQuery({
    queryKey: ['collection-summary'],
    queryFn: () => cardsApi.collectionSummary(),
    staleTime: 30000,
  });
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));
  const s = summary || {};

  const go = (nav) => {
    try {
      if (nav.length === 1) navigation.navigate(nav[0]);
      else if (typeof nav[1] === 'string') navigation.navigate(nav[0], { screen: nav[1] });
      else navigation.navigate(nav[0], nav[1]);
    } catch (e) {
      console.warn('[collection-hub] nav failed', e?.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>My Collection</Text>
        </View>
        <Text style={styles.snapshot}>
          {(s.cards || 0)} cards · {(s.listed || 0)} listed · {(s.want_list || 0)} on want list
        </Text>

        {SECTIONS.map((sec) => (
          <View key={sec.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{sec.title}</Text>
            <View style={styles.card}>
              {sec.rows.map((r, i) => (
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
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              ))}
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
  snapshot: { color: Colors.textMuted, fontSize: 13, marginLeft: 2, marginTop: -2, marginBottom: 2 },
  section: { gap: Spacing.xs },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, color: Colors.textMuted, marginLeft: 4 },
  card: { borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowBorder: { borderTopWidth: 1, borderTopColor: Colors.border },
  iconBubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: Colors.textMuted, fontSize: 12, marginTop: 1 },
});
