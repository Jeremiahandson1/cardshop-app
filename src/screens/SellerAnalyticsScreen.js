// Seller analytics. One screen, four sections:
//   1. Lifetime stat grid
//   2. Last 30 days — sparkline of daily gross + summary
//   3. Conversion ratio (views / orders)
//   4. Top viewed listings (active)

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, Image, TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { listingsApi } from '../services/api';
import { ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Spacing, Radius, Typography } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;
const usdShort = (cents) => {
  const n = (cents || 0) / 100;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

const screenWidth = Dimensions.get('window').width;
const SPARK_HEIGHT = 80;

export const SellerAnalyticsScreen = ({ navigation }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['seller-analytics'],
    queryFn: () => listingsApi.myAnalytics(),
  });

  // Build a 30-day series from sparse daily rows. Pad missing days
  // with zero gross so the sparkline renders a continuous trend.
  const series = useMemo(() => {
    if (!data?.last_30_days?.daily) return [];
    const map = new Map();
    for (const row of data.last_30_days.daily) {
      map.set(String(row.day).slice(0, 10), row);
    }
    const out = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const hit = map.get(key);
      out.push({
        day: key,
        orders: hit?.orders || 0,
        gross_cents: hit?.gross_cents || 0,
      });
    }
    return out;
  }, [data]);

  if (isLoading) return <LoadingScreen />;
  if (!data) return <EmptyState icon="📊" title="No data yet" />;

  const { lifetime, last_30_days, top_viewed } = data;

  // Conversion proxy. recentViews is the sum of view_count on
  // listings touched in the last 30d. Orders is in last_30_days.
  const conversion = last_30_days.total_views > 0
    ? ((last_30_days.total_orders / last_30_days.total_views) * 100).toFixed(1)
    : '—';

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Analytics" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}>
        <Text style={styles.sectionLabel}>LIFETIME</Text>
        <View style={styles.grid}>
          <Stat label="Sold" value={lifetime.completed_orders} />
          <Stat label="Net earnings" value={usdShort(lifetime.lifetime_net_cents)} />
          <Stat label="Active" value={lifetime.active_listings} />
          <Stat label="Total views" value={shortNum(lifetime.total_views)} />
          <Stat label="Watchers" value={shortNum(lifetime.total_watches)} />
          <Stat
            label="Disputes"
            value={lifetime.disputed_orders}
            accent={lifetime.disputed_orders > 0}
          />
        </View>

        <Text style={styles.sectionLabel}>LAST 30 DAYS</Text>
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm }}>
            <View>
              <Text style={styles.metric}>{usd(last_30_days.total_gross_cents)}</Text>
              <Text style={styles.metricLabel}>Gross sales · {last_30_days.total_orders} orders</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.metric}>{conversion}%</Text>
              <Text style={styles.metricLabel}>View → order</Text>
            </View>
          </View>
          <Sparkline data={series.map((d) => d.gross_cents)} />
          <View style={styles.dayLabels}>
            <Text style={styles.dayLabel}>30d ago</Text>
            <Text style={styles.dayLabel}>today</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>TOP VIEWED LISTINGS</Text>
        {!top_viewed?.length ? (
          <View style={styles.card}>
            <Text style={styles.empty}>No active listings to show.</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {top_viewed.map((l, i) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.listingRow, i < top_viewed.length - 1 && styles.listingRowBorder]}
                onPress={() => navigation.navigate('ListingDetail', { id: l.id })}
              >
                <Image
                  source={{ uri: Array.isArray(l.photos) ? l.photos[0] : null }}
                  style={styles.thumb}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.listingTitle} numberOfLines={1}>
                    {l.year ? `${l.year} ` : ''}{l.set_name || 'Unknown set'}
                  </Text>
                  <Text style={styles.listingSub} numberOfLines={1}>
                    {l.player_name}{l.parallel ? ` · ${l.parallel}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.listingPrice}>{usd(l.asking_price_cents)}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    <Text style={styles.listingMeta}>👁 {l.view_count}</Text>
                    {l.watch_count > 0 && (
                      <Text style={styles.listingMeta}>🤍 {l.watch_count}</Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Stat = ({ label, value, accent }) => (
  <View style={styles.statBox}>
    <Text style={[styles.statValue, accent && { color: Colors.accent3 }]}>{value ?? '—'}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

// Tiny inline sparkline. Pure RN — no chart lib. Bars + a faint
// horizontal axis. Highlights any spike day so the seller can
// see "the 18th was a great day" at a glance.
const Sparkline = ({ data }) => {
  if (!data?.length) {
    return <View style={[styles.sparkContainer, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: Colors.textDim, fontSize: 12 }}>No activity yet</Text>
    </View>;
  }
  const max = Math.max(...data, 1);
  const barW = (screenWidth - Spacing.md * 4) / data.length;
  return (
    <View style={styles.sparkContainer}>
      <View style={styles.sparkAxis} />
      <View style={styles.sparkBars}>
        {data.map((v, i) => {
          const h = max > 0 ? Math.max(1, (v / max) * SPARK_HEIGHT) : 1;
          const isMax = v > 0 && v === max;
          return (
            <View
              key={i}
              style={{
                width: barW - 1,
                height: h,
                marginHorizontal: 0.5,
                backgroundColor: isMax ? Colors.accent : Colors.accent2,
                opacity: v > 0 ? (isMax ? 1 : 0.6) : 0.15,
                borderTopLeftRadius: 2, borderTopRightRadius: 2,
              }}
            />
          );
        })}
      </View>
    </View>
  );
};

function shortNum(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5,
    marginTop: Spacing.md, marginBottom: Spacing.xs,
  },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statBox: {
    flexBasis: '31%', flexGrow: 1,
    backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: Radius.md,
  },
  statValue: { color: Colors.text, fontSize: 20, fontWeight: '700' },
  statLabel: { color: Colors.textMuted, fontSize: 11, marginTop: 4, letterSpacing: 0.5 },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  metric: { fontSize: 24, fontWeight: '700', color: Colors.text },
  metricLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  sparkContainer: { height: SPARK_HEIGHT + 4, position: 'relative', marginTop: Spacing.sm },
  sparkAxis: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: 1, backgroundColor: Colors.border,
  },
  sparkBars: {
    flexDirection: 'row', alignItems: 'flex-end',
    height: SPARK_HEIGHT, paddingBottom: 1,
  },
  dayLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 4,
  },
  dayLabel: { color: Colors.textDim, fontSize: 10 },

  listingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  listingRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  thumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  listingTitle: { color: Colors.text, fontSize: 13 },
  listingSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  listingPrice: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  listingMeta: { color: Colors.textMuted, fontSize: 10 },

  empty: { color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },
});
