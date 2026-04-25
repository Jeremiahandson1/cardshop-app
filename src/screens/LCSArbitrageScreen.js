// LCS Arbitrage — buy-local / sell-online (and vice versa) opportunities.
// Reads GET /api/lcs-arbitrage?zip=XXXXX; the backend owns the math,
// narration, sorting, and disclaimer. This screen only renders.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

import { lcsArbitrageApi } from '../services/api';
import {
  Button, Input, EmptyState, ScreenHeader,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// HELPERS
// ============================================================
const ARROW = '\u2192';        // →
const MDASH = '\u2014';        // —
const MIDDOT = '\u00B7';       // ·
const ELLIPSIS = '\u2026';     // …

const formatUsd = (n) => {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `$${v.toFixed(2)}`;
};

const formatWholeUsd = (n) => {
  const v = parseFloat(n);
  if (Number.isNaN(v)) return '—';
  return `$${Math.round(v)}`;
};

const DIRECTION_META = {
  buy_local_sell_online: {
    label: `Buy local ${ARROW} sell online`,
    color: Colors.success,
    icon: 'arrow-up',
  },
  buy_online_sell_local: {
    label: `Buy online ${ARROW} sell local`,
    color: Colors.accent,
    icon: 'arrow-down',
  },
};

const CONFIDENCE_COLOR = {
  high: Colors.success,
  medium: Colors.warning,
  low: Colors.textMuted,
};

// ============================================================
// SCREEN
// ============================================================
export const LCSArbitrageScreen = ({ navigation, route }) => {
  // Pre-fill from route param (passed in from LCSHome) or empty.
  const initialZip = route?.params?.zip || '';
  const [input, setInput] = useState(initialZip);
  const [zip, setZip] = useState(initialZip);
  const [inlineError, setInlineError] = useState('');

  const query = useQuery({
    queryKey: ['lcs-arbitrage', zip],
    queryFn: () => lcsArbitrageApi.list({ zip }),
    enabled: !!zip,
    retry: false,
  });

  const onFindDeals = useCallback(() => {
    const clean = input.trim();
    if (!/^\d{3,10}$/.test(clean)) {
      setInlineError('Enter 3-10 digits, e.g. 54701');
      return;
    }
    setInlineError('');
    setZip(clean);
  }, [input]);

  // Detect 403 participation_required
  const errStatus = query.error?.response?.status;
  const errData = query.error?.response?.data;
  const errCode = errData?.code;
  const is403Participation = errStatus === 403 && errCode === 'participation_required';
  const is400 = errStatus === 400;

  // Surface a 400 as an inline error on the input.
  useEffect(() => {
    if (is400) {
      setInlineError(errData?.error || 'Pass ?zip= as 3-10 digits');
    }
  }, [is400, errData]);

  const data = query.data;
  const rows = data?.rows || [];
  const disclaimer = data?.disclaimer
    || 'Estimate based on reported prices. Verify before acting.';
  // Server returns `access.trial_days_left` while the new-user grace
  // window is still open. Surface a soft countdown so trial users
  // contribute before the gate kicks in.
  const trialDaysLeft = data?.access?.trial_days_left;

  const renderRow = useCallback(({ item }) => (
    <ArbitrageRow
      row={item}
      onPress={() => {
        // Navigate to the market trend for this variant — the existing
        // screen accepts { productId, variantId, productName }. We don't
        // have the product_id here, but passing variant_id still lets
        // the detail view resolve it.
        navigation.navigate('LCSPriceTrend', {
          productId: item.product_id || item.variant_id,
          variantId: item.variant_id,
          productName: `${item.product_name} ${MDASH} ${item.variant_name}`,
        });
      }}
    />
  ), [navigation]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title="Deals near you"
        subtitle="Local shops pricing boxes below the going online rate"
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />

      {/* Zip entry */}
      <View style={styles.zipBar}>
        <View style={{ flex: 1 }}>
          <Input
            placeholder="54701"
            value={input}
            onChangeText={(v) => { setInput(v); if (inlineError) setInlineError(''); }}
            keyboardType="number-pad"
            maxLength={10}
            error={inlineError || undefined}
            style={{ marginBottom: 0 }}
          />
        </View>
        <Button
          title="Find deals"
          onPress={onFindDeals}
          style={{ marginLeft: Spacing.sm, minWidth: 120, height: 48 }}
        />
      </View>

      {/* Body */}
      {query.isLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.hint}>{`Scanning deals near ${zip}${ELLIPSIS}`}</Text>
        </View>
      ) : is403Participation ? (
        <ParticipationLock
          message={errData?.error}
          onConfirmPrice={() => navigation.navigate('LCSHome', { unlock: 'confirm' })}
          onPostPrice={() => navigation.navigate('LCSHome', { unlock: 'post' })}
        />
      ) : query.isError && !is400 ? (
        <EmptyState
          icon="⚠️"
          title="Couldn't load deals"
          message={errData?.error || query.error?.message || 'Try again in a moment.'}
        />
      ) : !zip ? (
        <View style={styles.hintWrap}>
          <Text style={styles.hint}>
            Enter your ZIP to see which local shops near you are pricing sealed
            boxes below the typical online rate.
            {'\n'}Numbers only. We use the first 3 digits to find your region.
          </Text>
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No deals matching right now"
          message={`No local shops in your area are below the online rate right now. Check back tomorrow ${MDASH} the scan runs nightly.`}
        />
      ) : (
        <>
          {typeof trialDaysLeft === 'number' && trialDaysLeft > 0 ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('LCSHome', { unlock: 'confirm' })}
              activeOpacity={0.85}
              style={styles.trialBanner}
            >
              <Ionicons name="time-outline" size={16} color={Colors.accent} />
              <Text style={styles.trialBannerText}>
                {trialDaysLeft === 1
                  ? 'Last day of your free Deals trial'
                  : `${trialDaysLeft} days left in your free Deals trial`}
                {' '}— confirm one box price to keep access for 90 days.
              </Text>
            </TouchableOpacity>
          ) : null}
          <FlatList
            data={rows}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            contentContainerStyle={styles.listPad}
            onRefresh={query.refetch}
            refreshing={query.isRefetching}
          />
        </>
      )}

      {/* Sticky footer disclaimer — only while results are showing */}
      {!!zip && rows.length > 0 && (
        <View style={styles.footer}>
          <Ionicons name="information-circle-outline" size={14} color={Colors.textMuted} />
          <Text style={styles.footerText}>{disclaimer}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

// ============================================================
// ROW
// ============================================================
const ArbitrageRow = ({ row, onPress }) => {
  const dir = DIRECTION_META[row.direction] || DIRECTION_META.buy_local_sell_online;
  const confColor = CONFIDENCE_COLOR[row.confidence] || Colors.textMuted;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.topLine}>
        {row.image_url ? (
          <Image source={{ uri: row.image_url }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="cube-outline" size={24} color={Colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1, marginLeft: Spacing.md }}>
          <Text style={styles.title} numberOfLines={2}>
            {row.variant_name
              ? `${row.product_name} ${MDASH} ${row.variant_name}`
              : row.product_name}
          </Text>
          <View style={[styles.directionChip, { borderColor: dir.color }]}>
            <Ionicons name={dir.icon} size={11} color={dir.color} />
            <Text style={[styles.directionText, { color: dir.color }]}>{dir.label}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.netLabel}>Est. net</Text>
          <Text style={styles.netValue}>{formatWholeUsd(row.estimated_net_usd)}</Text>
        </View>
      </View>

      {!!row.narrative && (
        <Text style={styles.narrative} numberOfLines={3}>
          {row.narrative}
        </Text>
      )}

      <View style={styles.metaLine}>
        <Text style={styles.metaText} numberOfLines={1}>
          {`LCS avg ${formatUsd(row.lcs_avg_usd)} ${MIDDOT} eBay median ${formatUsd(row.ebay_median_30d_usd)} ${MIDDOT} ${row.lcs_sample_size} verif${row.lcs_sample_size === 1 ? 'y' : 'ies'}`}
        </Text>
        <View style={styles.confidenceDot}>
          <View style={[styles.dot, { backgroundColor: confColor }]} />
          <Text style={[styles.metaText, { color: confColor }]}>
            {String(row.confidence || 'low')}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ============================================================
// PARTICIPATION LOCK
//
// The arbitrage data only exists because users contribute LCS box
// prices. Reading the data without ever contributing is the freerider
// pattern; the 90-day rolling gate flips the incentive so the readers
// are also the contributors. Server returns 403 with code
// 'participation_required' — see lcs-arbitrage.js on the API side.
//
// UX guardrails for first-time users:
//   - Confirm path is the lower-friction entry. Surface it first.
//   - Be explicit about what the unlock costs (one action) and how
//     long it lasts (90 days). Without that, the lock reads like a
//     paywall and users bounce.
// ============================================================
const ParticipationLock = ({ message, onConfirmPrice, onPostPrice }) => (
  <View style={styles.lockCard}>
    <View style={styles.lockIconWrap}>
      <Ionicons name="lock-closed" size={28} color={Colors.accent} />
    </View>
    <Text style={styles.lockTitle}>Unlock with one contribution</Text>
    <Text style={styles.lockBody}>
      {message
        || 'Deals near you is built from prices collectors share. Confirm or post one box price at a local shop and we unlock arbitrage for the next 90 days.'}
    </Text>

    <View style={styles.lockBullets}>
      <View style={styles.lockBulletRow}>
        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
        <Text style={styles.lockBulletText}>Confirming an existing price takes 5 seconds</Text>
      </View>
      <View style={styles.lockBulletRow}>
        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
        <Text style={styles.lockBulletText}>One contribution unlocks for 90 days</Text>
      </View>
      <View style={styles.lockBulletRow}>
        <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
        <Text style={styles.lockBulletText}>Free — not a subscription</Text>
      </View>
    </View>

    <Button
      title="Confirm a price (fastest)"
      onPress={onConfirmPrice}
      style={{ marginTop: Spacing.lg, alignSelf: 'stretch' }}
    />
    <TouchableOpacity onPress={onPostPrice} style={styles.lockSecondary}>
      <Text style={styles.lockSecondaryText}>Or post a new price →</Text>
    </TouchableOpacity>
  </View>
);

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.base },
  hintWrap: { padding: Spacing.base },
  hint: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    lineHeight: 22,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  listPad: { paddingHorizontal: Spacing.base, paddingBottom: 120 },

  zipBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
  },

  row: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topLine: { flexDirection: 'row', alignItems: 'center' },
  thumb: {
    width: 56, height: 56, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  title: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    marginBottom: 6,
  },
  directionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
    gap: 4,
  },
  directionText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.3,
  },
  netLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  netValue: {
    color: Colors.accent,
    fontSize: Typography.xl,
    fontWeight: Typography.heavy,
    marginTop: 2,
  },

  narrative: {
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },

  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  metaText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    flexShrink: 1,
  },
  confidenceDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },

  footer: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    flex: 1,
    lineHeight: 16,
  },

  lockCard: {
    margin: Spacing.base,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  lockIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  lockTitle: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  lockBody: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  lockBullets: {
    alignSelf: 'stretch',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.sm,
  },
  lockBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lockBulletText: {
    color: Colors.text,
    fontSize: Typography.sm,
    flex: 1,
  },
  lockSecondary: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignSelf: 'center',
  },
  lockSecondaryText: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  trialBannerText: {
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 18,
    flex: 1,
  },
});
