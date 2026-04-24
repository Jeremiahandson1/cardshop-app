import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  RefreshControl, Linking, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { showMessage } from 'react-native-flash-message';

import { dealRadarApi } from '../services/api';
import { Button, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// DEAL RADAR FEED
// ============================================================
const STATUS_BORDER = {
  new: Colors.accent,
  seen: Colors.border,
  bought: Colors.success,
  ignored: Colors.textDim,
};

const cardTitle = (row) => {
  const parts = [row.year, row.set_name, row.player_name].filter(Boolean);
  return parts.join(' ');
};

export const DealRadarFeedScreen = ({ navigation }) => {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['deal-radar', 'feed'],
    queryFn: () => dealRadarApi.getFeed({ limit: 50 }).then((r) => r.data),
    retry: false,
  });

  // 402 → Pro upsell (see DealRadarSettingsScreen for the matching copy).
  const proRequired = error?.response?.status === 402
    && error?.response?.data?.code === 'pro_required';
  if (proRequired) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md }}>
          <Ionicons name="pulse" size={56} color={Colors.accent} />
          <Text style={{ color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, textAlign: 'center' }}>
            Deal Radar is a Pro feature
          </Text>
          <Text style={{ color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center', lineHeight: 22 }}>
            Get alerts when cards on your want list drop below the 30-day median on eBay.
          </Text>
          <Button
            title="Upgrade to Card Shop Pro"
            onPress={() => navigation.navigate('Upgrade')}
            style={{ alignSelf: 'stretch', marginTop: Spacing.md }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const actionMutation = useMutation({
    mutationFn: ({ id, status }) => dealRadarApi.setStatus(id, status).then((r) => r.data),
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['deal-radar', 'feed'] });
      const prev = queryClient.getQueryData(['deal-radar', 'feed']);
      queryClient.setQueryData(['deal-radar', 'feed'], (old) => {
        if (!old) return old;
        return {
          ...old,
          rows: (old.rows || []).map((r) =>
            r.id === id ? { ...r, status } : r
          ),
        };
      });
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['deal-radar', 'feed'], ctx.prev);
      Alert.alert('Error', err?.response?.data?.error || 'Failed to update');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);

  const openListing = useCallback(async (row) => {
    // Mark 'seen' implicitly when tapping through (only if still 'new').
    if (row.status === 'new') {
      actionMutation.mutate({ id: row.id, status: 'seen' });
    }
    try {
      const supported = await Linking.canOpenURL(row.listing_url);
      if (!supported) throw new Error('Cannot open URL');
      await Linking.openURL(row.listing_url);
    } catch {
      Alert.alert('Error', 'Could not open listing');
    }
  }, [actionMutation]);

  const promptAction = (row) => {
    Alert.alert(
      cardTitle(row) || 'Listing',
      row.listing_title,
      [
        {
          text: 'Mark as Bought',
          onPress: () => {
            actionMutation.mutate({ id: row.id, status: 'bought' });
            showMessage({ message: 'Marked as bought', type: 'success' });
          },
        },
        {
          text: 'Ignore',
          onPress: () => {
            actionMutation.mutate({ id: row.id, status: 'ignored' });
            showMessage({ message: 'Listing ignored', type: 'default' });
          },
        },
        {
          text: 'Dismiss',
          onPress: () => {
            actionMutation.mutate({ id: row.id, status: 'seen' });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  if (isLoading) return <LoadingScreen message="Loading deals..." />;

  const rows = data?.rows || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deal Radar</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('DealRadarSettings')}
          hitSlop={12}
        >
          <Ionicons name="settings-outline" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={
          rows.length === 0
            ? { flexGrow: 1 }
            : { padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 }
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
        renderItem={({ item }) => (
          <DealRow
            row={item}
            onPress={() => openListing(item)}
            onLongPress={() => promptAction(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="📡"
            title="No deals yet"
            message="Add cards to your want list and enable Deal Radar to start getting notified when listings drop below comps."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// DEAL ROW
// ============================================================
const DealRow = ({ row, onPress, onLongPress }) => {
  const borderColor = STATUS_BORDER[row.status] || Colors.border;
  const discountPct = Math.round(Number(row.discount_pct) * 100);
  const now = Date.now();
  const endsAtMs = row.ends_at ? new Date(row.ends_at).getTime() : null;
  const timeLeft =
    endsAtMs && endsAtMs > now
      ? formatDistanceToNow(new Date(row.ends_at), { addSuffix: false })
      : null;
  const name = cardTitle(row);

  return (
    <TouchableOpacity
      style={[rowStyles.container, { borderColor, borderWidth: row.status === 'new' ? 2 : 1 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      delayLongPress={350}
    >
      {/* Thumbnail */}
      <View style={rowStyles.thumbWrap}>
        {row.listing_image_url ? (
          <Image source={{ uri: row.listing_image_url }} style={rowStyles.thumb} resizeMode="cover" />
        ) : (
          <View style={[rowStyles.thumb, rowStyles.thumbPlaceholder]}>
            <Text style={{ fontSize: 22 }}>🃏</Text>
          </View>
        )}
        {row.status === 'new' && <View style={rowStyles.newDot} />}
      </View>

      {/* Body */}
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={rowStyles.title} numberOfLines={2}>{row.listing_title}</Text>
        {!!name && <Text style={rowStyles.cardName} numberOfLines={1}>{name}</Text>}

        <View style={rowStyles.priceRow}>
          <Text style={rowStyles.price}>
            ${Number(row.listing_price_usd).toFixed(2)}
          </Text>
          <View style={rowStyles.discountBadge}>
            <Text style={rowStyles.discountText}>{discountPct}% under comps</Text>
          </View>
        </View>

        {!!row.notify_copy && (
          <Text style={rowStyles.subtitle} numberOfLines={2}>{row.notify_copy}</Text>
        )}

        <View style={rowStyles.metaRow}>
          {timeLeft && (
            <View style={rowStyles.timeBadge}>
              <Ionicons name="time-outline" size={11} color={Colors.warning} />
              <Text style={rowStyles.timeText}>{timeLeft} left</Text>
            </View>
          )}
          {typeof row.seller_feedback === 'number' && (
            <Text style={rowStyles.metaText}>
              {row.seller_feedback} feedback
            </Text>
          )}
          {row.status !== 'new' && (
            <Text style={[rowStyles.statusText, { color: STATUS_BORDER[row.status] || Colors.textMuted }]}>
              {row.status.toUpperCase()}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 72, height: 96, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
  },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  newDot: {
    position: 'absolute', top: -4, right: -4,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.accent,
    borderWidth: 2, borderColor: Colors.surface,
  },

  title: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold, lineHeight: 18 },
  cardName: { color: Colors.textMuted, fontSize: Typography.xs },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  price: { color: Colors.accent, fontSize: Typography.md, fontWeight: Typography.bold },
  discountBadge: {
    backgroundColor: Colors.success + '22',
    borderColor: Colors.success + '60',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  discountText: { color: Colors.success, fontSize: Typography.xs, fontWeight: Typography.bold },

  subtitle: { color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 16, marginTop: 2 },

  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: 4, flexWrap: 'wrap',
  },
  timeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.warning + '18',
    borderWidth: 1, borderColor: Colors.warning + '50',
    borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 1,
  },
  timeText: { color: Colors.warning, fontSize: Typography.xs, fontWeight: Typography.semibold },
  metaText: { color: Colors.textMuted, fontSize: Typography.xs },
  statusText: { fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.5 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
});
