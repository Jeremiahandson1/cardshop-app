import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { intelligenceApi } from '../services/api';
import { CardIntelDetail } from '../components/CardIntelDetail';
import { EmptyState } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const PAGE_SIZE = 40;

// Filter keys map 1:1 to the backend `filter` query param.
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'rising', label: 'Rising' },
  { key: 'cooling', label: 'Cooling' },
  { key: 'listable', label: 'Listable' },
  { key: 'thin', label: 'Thin' },
];

// Chip config for the action flag. `null` is handled separately (no chip rendered
// inline — we render the "Not enough data" pill so users see *why* no action
// is suggested instead of an empty gap).
const ACTION_CONFIG = {
  consider_listing: { label: 'List now', bg: Colors.success + '22', fg: Colors.success, border: Colors.success },
  hold_or_list_high: { label: 'Riding high', bg: Colors.accent + '22', fg: Colors.accent, border: Colors.accent },
  hold_thin_market: { label: 'Hold — thin market', bg: Colors.surface3, fg: Colors.textMuted, border: Colors.border },
  hold: { label: 'Hold', bg: Colors.surface3, fg: Colors.textMuted, border: Colors.border },
};

// Confidence buckets where we should *not* render an action chip per the spec.
const LOW_CONFIDENCE = new Set(['low', 'insufficient']);

const TREND_META = {
  rising: { arrow: '↑', color: Colors.success },
  cooling: { arrow: '↓', color: Colors.error },
  flat: { arrow: '→', color: Colors.textMuted },
  unknown: { arrow: '', color: Colors.textMuted },
};

const fmtMoney = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';

// ------------------------------------------------------------
// Row
// ------------------------------------------------------------
const IntelRow = React.memo(({ row, onPress }) => {
  const trend = TREND_META[row.trend_class] || TREND_META.unknown;
  const isLowConf = LOW_CONFIDENCE.has(row.confidence);
  const actionCfg = !isLowConf && row.action_flag ? ACTION_CONFIG[row.action_flag] : null;

  // Spec: when action_flag is null, show "not enough data" instead of an action.
  const showNotEnoughData = !actionCfg;

  return (
    <TouchableOpacity style={styles.row} onPress={() => onPress(row)} activeOpacity={0.75}>
      <View style={styles.rowLeft}>
        <Text style={styles.name} numberOfLines={2}>{row.name || 'Unnamed card'}</Text>
        <View style={styles.valueRow}>
          <Text style={styles.value}>{fmtMoney(row.blended_value_usd)}</Text>
          {trend.arrow ? (
            <Text style={[styles.trend, { color: trend.color }]}>{trend.arrow}</Text>
          ) : null}
        </View>
        {row.context_line ? (
          <Text style={styles.context} numberOfLines={2}>{row.context_line}</Text>
        ) : null}
      </View>

      <View style={styles.rowRight}>
        {showNotEnoughData ? (
          <View style={[styles.chip, styles.chipMuted]}>
            <Text style={[styles.chipText, { color: Colors.textDim }]}>Not enough data</Text>
          </View>
        ) : (
          <View
            style={[
              styles.chip,
              { backgroundColor: actionCfg.bg, borderColor: actionCfg.border },
            ]}
          >
            <Text style={[styles.chipText, { color: actionCfg.fg }]}>{actionCfg.label}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ------------------------------------------------------------
// Screen
// ------------------------------------------------------------
export const CollectionIntelligenceView = () => {
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [selected, setSelected] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Guard against overlapping fetches. Without this a re-render
  // mid-flight can fire a second request on top of the first;
  // each failure used to surface its own Alert modal, producing
  // the stacking/flickering "seizure" the user reported.
  const inFlightRef = useRef(false);

  // Force-rebuild all snapshots from scratch. Wipes the user's
  // cached intelligence rows + scoped eBay cache entries so the
  // next list() call pulls fresh comps. Used after a provider-
  // side change (e.g. eBay sandbox → production) where cached
  // rows are locked in "insufficient" and won't refresh on their
  // own until TTL expires.
  const rebuild = useCallback(async () => {
    try {
      setRebuilding(true);
      setErrorMsg(null);
      await intelligenceApi.refresh();
      await fetchPage({ reset: true, currentFilter: activeFilterRef.current });
    } catch (err) {
      setErrorMsg(err?.response?.data?.error || err?.message || 'Rebuild failed — try again.');
    } finally {
      setRebuilding(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prevent stale responses from overwriting fresher ones when the filter
  // changes mid-flight. We tag each in-flight request with the filter it
  // belongs to and drop it on arrival if the filter has since changed.
  const activeFilterRef = useRef('all');

  const fetchPage = useCallback(
    async ({ reset = false, currentFilter }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      const useFilter = currentFilter ?? activeFilterRef.current;
      const nextOffset = reset ? 0 : offset;

      try {
        const res = await intelligenceApi.list({
          limit: PAGE_SIZE,
          offset: nextOffset,
          filter: useFilter,
        });

        // Discard stale response if user changed filter mid-flight.
        if (useFilter !== activeFilterRef.current) return;

        const payload = res?.data || {};
        const incoming = Array.isArray(payload.rows) ? payload.rows : [];

        setTotal(typeof payload.total === 'number' ? payload.total : incoming.length);
        setErrorMsg(null);

        if (reset) {
          setRows(incoming);
          setOffset(incoming.length);
        } else {
          // Dedupe by owned_card_id — pagination can produce dupes if rows
          // shift between requests.
          setRows((prev) => {
            const seen = new Set(prev.map((r) => r.owned_card_id));
            const merged = [...prev];
            for (const r of incoming) {
              if (!seen.has(r.owned_card_id)) {
                seen.add(r.owned_card_id);
                merged.push(r);
              }
            }
            return merged;
          });
          setOffset(nextOffset + incoming.length);
        }
      } catch (err) {
        const isPro = err?.response?.status === 402
          && err?.response?.data?.code === 'pro_required';
        if (isPro) {
          setErrorMsg('PRO_REQUIRED');
        } else {
          const msg =
            err?.response?.status === 429
              ? 'Too many requests — wait a minute and try again.'
              : err?.response?.data?.message ||
                err?.response?.data?.error ||
                err?.message ||
                'Could not load intelligence.';
          setErrorMsg(msg);
        }
      } finally {
        inFlightRef.current = false;
      }
    },
    [offset],
  );

  // Initial + filter change — reset pagination.
  useEffect(() => {
    activeFilterRef.current = filter;
    setLoading(true);
    setOffset(0);
    fetchPage({ reset: true, currentFilter: filter }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage({ reset: true, currentFilter: activeFilterRef.current });
    setRefreshing(false);
  }, [fetchPage]);

  const onEndReached = useCallback(async () => {
    if (loadingMore || loading) return;
    if (rows.length >= total) return;
    setLoadingMore(true);
    await fetchPage({ reset: false, currentFilter: activeFilterRef.current });
    setLoadingMore(false);
  }, [fetchPage, loadingMore, loading, rows.length, total]);

  const keyExtractor = useCallback((item) => String(item.owned_card_id), []);
  const renderItem = useCallback(
    ({ item }) => <IntelRow row={item} onPress={setSelected} />,
    [],
  );

  const listFooter = useMemo(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={Colors.accent} size="small" />
      </View>
    );
  }, [loadingMore]);

  // Count how many cards currently have insufficient data so we
  // can prompt for a rebuild when most/all cards are empty —
  // usually means cached snapshots landed before comps data was
  // available and are stuck until TTL.
  const insufficientCount = useMemo(
    () => rows.filter((r) => r.confidence === 'insufficient').length,
    [rows]
  );
  const needsRebuild = rows.length > 0 && insufficientCount === rows.length;

  return (
    <View style={styles.container}>
      {/* Error banner — replaces the old stacking Alert.alert so
          repeated failures don't pile up modals. Dismissable, and
          cleared on any successful fetch. */}
      {/* Pro gate — 402 from the backend means collector_pro required.
          Swaps the whole intelligence surface for an upgrade prompt
          instead of showing the empty "no cards" state (which would
          make free users think their collection is blank). */}
      {errorMsg === 'PRO_REQUIRED' ? (
        <View style={styles.proGate}>
          <Text style={styles.proGateTitle}>Intelligence is a Pro feature</Text>
          <Text style={styles.proGateBody}>
            Blended values, trend signals, and listable/thin-market flags
            across your whole collection. Updated continuously from live
            eBay comps.
          </Text>
          <View style={{ height: 12 }} />
          <Text style={styles.proGateCta}>Upgrade in Profile → Card Shop Pro</Text>
        </View>
      ) : errorMsg ? (
        <View style={styles.errorBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.errorTitle}>Intelligence unavailable</Text>
            <Text style={styles.errorBody}>{errorMsg}</Text>
          </View>
          <TouchableOpacity onPress={() => setErrorMsg(null)} hitSlop={8}>
            <Text style={styles.errorDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Rebuild banner — only surfaces when every visible row is
          "insufficient" (data arrived after the cache was filled). */}
      {needsRebuild ? (
        <TouchableOpacity
          onPress={rebuild}
          disabled={rebuilding}
          style={styles.rebuildBanner}
          activeOpacity={0.85}
        >
          <Text style={styles.rebuildTitle}>
            {rebuilding ? 'Rebuilding intelligence…' : 'No comps on record yet'}
          </Text>
          <Text style={styles.rebuildBody}>
            {rebuilding
              ? 'Hitting eBay for fresh sold data.'
              : 'Tap to rebuild snapshots from live comps. First run can take 30–60s.'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Filter chips */}
      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(item) => item.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* List */}
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={Colors.accent} size="large" />
          <Text style={styles.loadingText}>Crunching the numbers...</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            errorMsg ? null : (
              <EmptyState
                icon="📊"
                title="No intelligence yet"
                message={
                  filter === 'all'
                    ? 'Register cards to start seeing blended values and trend signals.'
                    : 'No cards match this filter. Try another one.'
                }
              />
            )
          }
        />
      )}

      <CardIntelDetail
        visible={!!selected}
        row={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  filterList: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  filterChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '22',
  },
  filterText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
  },
  filterTextActive: {
    color: Colors.accent,
    fontWeight: Typography.semibold,
  },

  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  separator: { height: Spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  rowLeft: { flex: 1, minWidth: 0 },
  rowRight: { alignItems: 'flex-end' },

  name: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 4,
  },
  value: {
    color: Colors.accent,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  trend: {
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  context: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 4,
    lineHeight: 18,
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    maxWidth: 140,
  },
  chipMuted: {
    backgroundColor: Colors.surface2,
    borderColor: Colors.border,
  },
  chipText: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.3,
    textAlign: 'center',
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
    marginTop: Spacing.md,
    fontSize: Typography.base,
  },
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },

  rebuildBanner: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.accent + '15',
    borderWidth: 1,
    borderColor: Colors.accent + '55',
  },
  proGate: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent + '55',
    alignItems: 'center',
  },
  proGateTitle: {
    color: Colors.accent,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  proGateBody: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  proGateCta: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.error + '15',
    borderWidth: 1,
    borderColor: Colors.error + '55',
  },
  errorTitle: {
    color: Colors.error,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginBottom: 2,
  },
  errorBody: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  errorDismiss: {
    color: Colors.error,
    fontSize: 16,
    fontWeight: Typography.semibold,
    paddingLeft: 4,
  },
  rebuildTitle: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginBottom: 2,
  },
  rebuildBody: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
});
