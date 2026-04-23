import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setsApi, wantListApi } from '../services/api';
import {
  Button, EmptyState, LoadingScreen, ScreenHeader, SectionHeader, Divider,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// SETS LIST — the caller's subscribed sets. Defaults to the
// "My Sets" view; an "+ Add Set" action opens the browse /
// search screen where users can subscribe to any set in the
// catalog they actually collect.
// ============================================================
const SetCard = ({ item, onPress }) => (
  <TouchableOpacity style={styles.setCard} onPress={onPress} activeOpacity={0.85}>
    <View style={{ flex: 1 }}>
      <Text style={styles.setName} numberOfLines={1}>
        {item.year ? `${item.year} ` : ''}{item.set_name}
      </Text>
      <Text style={styles.setMeta}>
        {item.manufacturer ? `${item.manufacturer} · ` : ''}
        {item.owned_cards} / {item.total_cards} cards
      </Text>
      <View style={styles.progressBarBg}>
        <View
          style={[
            styles.progressBarFill,
            { width: `${Math.max(0, Math.min(100, item.percent_complete))}%` },
          ]}
        />
      </View>
      <Text style={styles.percentLabel}>{item.percent_complete}% complete</Text>
    </View>
    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
  </TouchableOpacity>
);

export const SetsListScreen = ({ navigation }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['sets-mine'],
    queryFn: () => setsApi.mine().then((r) => r.data),
  });

  const sets = data?.sets || [];

  if (isLoading) return <LoadingScreen message="Loading your sets..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="My Sets"
        subtitle="Sets you're tracking — completion updates automatically."
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('BrowseSets')}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 6,
              borderRadius: Radius.full, backgroundColor: Colors.accent,
            }}
          >
            <Ionicons name="add" size={16} color={Colors.bg} />
            <Text style={{ color: Colors.bg, fontWeight: Typography.semibold, fontSize: Typography.xs }}>
              Add set
            </Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={sets}
        keyExtractor={(s) => s.set_code}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        renderItem={({ item }) => (
          <SetCard
            item={item}
            onPress={() => navigation.navigate('SetCompletion', { setCode: item.set_code })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="📋"
            title="No sets tracked yet"
            message="Tap “Add set” to pick the releases you actually collect. Completion % updates as you register cards."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// BROWSE SETS — pick from the full catalog, subscribe/unsubscribe
// inline. Typeahead search against /api/sets?q=.
// ============================================================
export const BrowseSetsScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ['sets-browse', debounced],
    queryFn: () => setsApi.list({ q: debounced || undefined, limit: 200 }).then((r) => r.data),
  });

  const subscribeMutation = useMutation({
    mutationFn: (payload) => setsApi.subscribe(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sets-mine'] });
      qc.invalidateQueries({ queryKey: ['sets-browse'] });
    },
    onError: (err) => Alert.alert('Could not add set', err?.response?.data?.error || 'Please try again.'),
  });
  const unsubscribeMutation = useMutation({
    mutationFn: (payload) => setsApi.unsubscribe(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sets-mine'] });
      qc.invalidateQueries({ queryKey: ['sets-browse'] });
    },
  });

  const sets = data?.sets || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Add a Set"
        subtitle="Search the catalog, tap the star to track any set."
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
        padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border,
      }}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by set name or manufacturer…"
          placeholderTextColor={Colors.textMuted}
          style={{
            flex: 1, color: Colors.text, fontSize: 15,
            paddingVertical: 8,
          }}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={sets}
        keyExtractor={(s) => s.set_code}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.xs }} />}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              icon="🔍"
              title={debounced ? `No sets match “${debounced}”` : 'Type to search'}
              message={debounced ? 'Try a different manufacturer or year.' : 'Every Panini, Topps, Pokemon, Magic, and Yu-Gi-Oh release we’ve imported is searchable here.'}
            />
          )
        }
        renderItem={({ item }) => {
          const payload = { manufacturer: item.manufacturer, year: item.year, set_name: item.set_name };
          const isPending =
            (subscribeMutation.isPending && subscribeMutation.variables?.set_name === item.set_name) ||
            (unsubscribeMutation.isPending && unsubscribeMutation.variables?.set_name === item.set_name);
          return (
            <View style={styles.browseRow}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('SetCompletion', { setCode: item.set_code })}
                activeOpacity={0.85}
              >
                <Text style={styles.browseName} numberOfLines={1}>
                  {item.year ? `${item.year} ` : ''}{item.set_name}
                </Text>
                <Text style={styles.browseMeta} numberOfLines={1}>
                  {item.manufacturer} · {item.total_cards} cards
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isPending}
                onPress={() =>
                  item.subscribed
                    ? unsubscribeMutation.mutate(payload)
                    : subscribeMutation.mutate(payload)
                }
                style={[
                  styles.browseToggle,
                  item.subscribed && { backgroundColor: Colors.accent, borderColor: Colors.accent },
                  isPending && { opacity: 0.5 },
                ]}
              >
                <Ionicons
                  name={item.subscribed ? 'star' : 'star-outline'}
                  size={16}
                  color={item.subscribed ? Colors.bg : Colors.accent}
                />
                <Text style={[
                  styles.browseToggleText,
                  item.subscribed && { color: Colors.bg },
                ]}>
                  {item.subscribed ? 'Tracking' : 'Track'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
};

// ============================================================
// SET COMPLETION — grid/list view of a set with per-card state
// ============================================================
export const SetCompletionScreen = ({ navigation, route }) => {
  const { setCode } = route.params;
  const qc = useQueryClient();
  const [filter, setFilter] = useState('all'); // 'all' | 'owned' | 'wanted' | 'needed'

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['set-completion', setCode],
    queryFn: () => setsApi.completion(setCode).then((r) => r.data),
  });

  const addWantMutation = useMutation({
    mutationFn: (catalogId) => wantListApi.add({ catalog_id: catalogId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['set-completion', setCode] });
    },
    onError: (err) => {
      Alert.alert('Could not add to want list', err?.response?.data?.error || 'Please try again.');
    },
  });

  const filteredCards = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.cards;
    return data.cards.filter((c) => c.state === filter);
  }, [data, filter]);

  if (isLoading || !data) return <LoadingScreen message="Loading set..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title={data.set_name ? `${data.year || ''} ${data.set_name}`.trim() : setCode}
        subtitle={
          data.manufacturer
            ? `${data.manufacturer} · ${data.owned}/${data.total} owned · ${data.percent_complete}% complete`
            : `${data.owned}/${data.total} owned · ${data.percent_complete}% complete`
        }
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      {/* Progress + counts */}
      <View style={styles.statsRow}>
        <Stat label="Owned" count={data.owned} color={Colors.success} />
        <Stat label="Wanted" count={data.wanted} color={Colors.accent} />
        <Stat label="Needed" count={data.needed} color={Colors.textMuted} />
      </View>
      <View style={{ paddingHorizontal: Spacing.base }}>
        <View style={styles.progressBarBg}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.max(0, Math.min(100, data.percent_complete))}%` },
            ]}
          />
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterTabs}>
        <FilterTab label="All" count={data.total} active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterTab label="Owned" count={data.owned} active={filter === 'owned'} onPress={() => setFilter('owned')} />
        <FilterTab label="Wanted" count={data.wanted} active={filter === 'wanted'} onPress={() => setFilter('wanted')} />
        <FilterTab label="Needed" count={data.needed} active={filter === 'needed'} onPress={() => setFilter('needed')} />
      </View>

      <FlatList
        data={filteredCards}
        keyExtractor={(c) => c.catalog_id}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        renderItem={({ item }) => (
          <View style={styles.cardRow}>
            <StateDot state={item.state} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardRowTitle} numberOfLines={1}>
                {item.card_number ? `#${item.card_number} · ` : ''}{item.player_name}
                {item.is_rookie ? ' · RC' : ''}
              </Text>
              {item.parallel ? (
                <Text style={styles.cardRowParallel} numberOfLines={1}>
                  {item.parallel}
                  {item.serial_max ? ` /${item.serial_max}` : ''}
                  {item.box_type ? ` · ${item.box_type} exclusive` : ''}
                </Text>
              ) : null}
            </View>
            {item.state === 'needed' ? (
              <TouchableOpacity
                onPress={() => addWantMutation.mutate(item.catalog_id)}
                style={styles.actionButton}
              >
                <Ionicons name="heart-outline" size={18} color={Colors.accent} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="📦"
            title="Nothing in this filter"
            message="Try a different filter."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// helpers
// ============================================================

const Stat = ({ label, count, color }) => (
  <View style={styles.stat}>
    <Text style={[styles.statCount, { color }]}>{count}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const FilterTab = ({ label, count, active, onPress }) => (
  <TouchableOpacity
    style={[styles.filterTab, active && styles.filterTabActive]}
    onPress={onPress}
  >
    <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
      {label} ({count})
    </Text>
  </TouchableOpacity>
);

const StateDot = ({ state }) => {
  const color = {
    owned: Colors.success,
    wanted: Colors.accent,
    needed: Colors.textMuted,
  }[state] || Colors.textMuted;
  return <View style={[styles.stateDot, { backgroundColor: color }]} />;
};

const styles = StyleSheet.create({
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  setName: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  setMeta: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: Colors.surface2,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  percentLabel: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    marginTop: 4,
  },
  browseRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: 10, paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  browseName: {
    color: Colors.text, fontSize: 15, fontWeight: Typography.semibold,
  },
  browseMeta: {
    color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2,
  },
  browseToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accent,
  },
  browseToggleText: {
    color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.semibold,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  stat: { alignItems: 'center' },
  statCount: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterTabText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  filterTabTextActive: {
    color: Colors.bg,
  },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.sm,
  },
  cardRowTitle: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
  },
  cardRowParallel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  stateDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  actionButton: {
    padding: 8,
  },
});
