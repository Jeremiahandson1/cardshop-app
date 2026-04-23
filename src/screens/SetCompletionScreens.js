import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { setsApi, wantListApi, catalogApi } from '../services/api';
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
              width: 36, height: 36, borderRadius: 18,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: Colors.accent,
            }}
            accessibilityLabel="Add a set"
          >
            <Ionicons name="add" size={22} color={Colors.bg} />
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
// BROWSE SETS — cascading picker (sport → year → manufacturer →
// set_name). Mirrors the RegisterCard cascade so collectors who
// already know the chain can drill in quickly. Every step has a
// "type to filter" search box and a manual-entry escape hatch
// for sets that haven't hit the catalog yet.
//
// At the final step, tapping a set subscribes immediately — no
// extra confirm — because that matches the "tap to add" flow
// people already know from Netflix / Letterboxd / etc. The
// subscribed set shows a checkmark and becomes un-tap-to-remove.
// ============================================================
const CASCADE_ORDER = ['sport', 'year', 'manufacturer', 'set_name'];
const CASCADE_LABEL = {
  sport:        'Sport',
  year:         'Year',
  manufacturer: 'Manufacturer',
  set_name:     'Set',
};

export const BrowseSetsScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [cascade, setCascade] = useState({});
  const [cascadeDim, setCascadeDim] = useState('sport');
  const [query, setQuery] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ manufacturer: '', year: '', set_name: '' });

  const currentIdx = CASCADE_ORDER.indexOf(cascadeDim);
  const picked = CASCADE_ORDER.filter((d) => cascade[d] !== undefined);

  // What values are available at this cascade level?
  const { data: options, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['sets-cascade', cascadeDim, cascade, query],
    queryFn: () =>
      catalogApi.filterValues({ dimension: cascadeDim, ...cascade, q: query || undefined, limit: 200 })
        .then((r) => r.data?.values || []),
    staleTime: 10_000,
    retry: 1,
    keepPreviousData: true,
  });

  // Cards already tracked (to show checkmarks and prevent dupes
  // at the terminal step).
  const { data: mineData } = useQuery({
    queryKey: ['sets-mine'],
    queryFn: () => setsApi.mine().then((r) => r.data),
  });
  const mineKeys = React.useMemo(() => {
    const s = new Set();
    for (const m of (mineData?.sets || [])) {
      s.add(`${m.manufacturer}|${m.year ?? ''}|${m.set_name}`);
    }
    return s;
  }, [mineData]);

  const subscribeMutation = useMutation({
    mutationFn: (payload) => setsApi.subscribe(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sets-mine'] });
    },
    onError: (err) => Alert.alert('Could not add set', err?.response?.data?.error || 'Please try again.'),
  });
  const unsubscribeMutation = useMutation({
    mutationFn: (payload) => setsApi.unsubscribe(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sets-mine'] }),
  });

  const pick = (value) => {
    const next = { ...cascade, [cascadeDim]: value };
    setCascade(next);
    setQuery('');
    if (currentIdx + 1 < CASCADE_ORDER.length) {
      setCascadeDim(CASCADE_ORDER[currentIdx + 1]);
    }
  };
  const stepBack = () => {
    if (currentIdx <= 0) {
      navigation.goBack();
      return;
    }
    const cleared = { ...cascade };
    for (let i = currentIdx - 1; i < CASCADE_ORDER.length; i++) delete cleared[CASCADE_ORDER[i]];
    setCascade(cleared);
    setCascadeDim(CASCADE_ORDER[currentIdx - 1]);
    setQuery('');
  };

  // Final step → tap subscribes immediately. Preserve item value
  // from the options list so year stays numeric.
  const handleSetPick = (setName) => {
    const payload = {
      manufacturer: cascade.manufacturer,
      year: cascade.year ? Number(cascade.year) : null,
      set_name: setName,
    };
    const key = `${payload.manufacturer}|${payload.year ?? ''}|${payload.set_name}`;
    if (mineKeys.has(key)) {
      unsubscribeMutation.mutate(payload);
    } else {
      subscribeMutation.mutate(payload);
    }
  };

  const submitManual = () => {
    const mf = manualForm.manufacturer.trim();
    const yr = manualForm.year.trim();
    const sn = manualForm.set_name.trim();
    if (!mf || !sn) {
      Alert.alert('Fill in manufacturer and set name at minimum.');
      return;
    }
    subscribeMutation.mutate(
      { manufacturer: mf, year: yr ? parseInt(yr, 10) : null, set_name: sn },
      {
        onSuccess: () => {
          setManualOpen(false);
          setManualForm({ manufacturer: '', year: '', set_name: '' });
          Alert.alert('Added', `Tracking ${sn}`);
        },
      }
    );
  };

  const isSetStep = cascadeDim === 'set_name';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <View style={styles.browseHeader}>
        <TouchableOpacity onPress={stepBack} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.browseHeaderTitle}>Add a Set</Text>
        <View style={{ width: 22 }} />
      </View>

      {picked.length > 0 ? (
        <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
          <Text style={{ fontSize: 11, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
            {picked.map((d) => cascade[d]).join(' · ')}
          </Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
        <Text style={{ fontSize: 14, color: Colors.textMuted, marginBottom: 6 }}>
          Step {currentIdx + 1} of {CASCADE_ORDER.length} — {CASCADE_LABEL[cascadeDim]}
        </Text>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: Colors.surface2, borderRadius: Radius.md,
          paddingHorizontal: 10, borderWidth: 1, borderColor: Colors.border,
        }}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${CASCADE_LABEL[cascadeDim].toLowerCase()}…`}
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            style={{ flex: 1, color: Colors.text, paddingVertical: 8 }}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FlatList
        data={options || []}
        keyExtractor={(item, i) => String(item) + i}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl }}
        ListEmptyComponent={
          isLoading || isFetching ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.sm }}>
              <Text style={{ color: Colors.textMuted }}>Loading…</Text>
            </View>
          ) : isError ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.md }}>
              <Text style={{ color: Colors.textMuted }}>Couldn't load options.</Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={{ color: Colors.accent, fontWeight: '600' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.md }}>
              <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
                Nothing matches this filter yet.
              </Text>
              <TouchableOpacity onPress={() => setManualOpen(true)}>
                <Text style={{ color: Colors.accent, fontWeight: '600' }}>
                  Add it manually →
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => {
          const isTracked = isSetStep
            && mineKeys.has(`${cascade.manufacturer}|${cascade.year ?? ''}|${item}`);
          return (
            <TouchableOpacity
              onPress={() => isSetStep ? handleSetPick(item) : pick(item)}
              style={[styles.cascadeRow, isTracked && { borderColor: Colors.accent }]}
            >
              <Text style={{ color: Colors.text, fontSize: 15, flex: 1 }}>{String(item)}</Text>
              {isSetStep ? (
                <Ionicons
                  name={isTracked ? 'checkmark-circle' : 'add-circle-outline'}
                  size={20}
                  color={isTracked ? Colors.accent : Colors.textMuted}
                />
              ) : (
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              )}
            </TouchableOpacity>
          );
        }}
      />

      <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
        <TouchableOpacity onPress={() => setManualOpen(true)}>
          <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 13 }}>
            Set not in our catalog? Add manually →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Manual-entry sheet — simple three-field form. We pass it
          straight to /sets/subscribe which validates that the triple
          exists in card_catalog (it may not, for brand-new releases
          before we've imported a checklist). If the server rejects,
          we surface that error so the collector knows the checklist
          still needs admin approval. */}
      {manualOpen ? (
        <View style={styles.manualOverlay}>
          <View style={styles.manualSheet}>
            <Text style={styles.manualTitle}>Add a set manually</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.md }}>
              If we don't have the checklist yet, the server will say so. You can submit it through admin import.
            </Text>
            <TextInput
              value={manualForm.manufacturer}
              onChangeText={(v) => setManualForm((f) => ({ ...f, manufacturer: v }))}
              placeholder="Manufacturer (e.g. Panini)"
              placeholderTextColor={Colors.textMuted}
              style={styles.manualInput}
              autoCapitalize="words"
            />
            <TextInput
              value={manualForm.year}
              onChangeText={(v) => setManualForm((f) => ({ ...f, year: v }))}
              placeholder="Year (e.g. 2025)"
              placeholderTextColor={Colors.textMuted}
              style={styles.manualInput}
              keyboardType="number-pad"
            />
            <TextInput
              value={manualForm.set_name}
              onChangeText={(v) => setManualForm((f) => ({ ...f, set_name: v }))}
              placeholder="Set name (e.g. Prizm)"
              placeholderTextColor={Colors.textMuted}
              style={styles.manualInput}
              autoCapitalize="words"
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
              <Button title="Cancel" variant="ghost" onPress={() => setManualOpen(false)} style={{ flex: 1 }} />
              <Button title="Add set" onPress={submitManual} loading={subscribeMutation.isPending} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      ) : null}
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
  browseHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  browseHeaderTitle: {
    color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold,
  },
  cascadeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2, marginBottom: Spacing.xs,
  },
  manualOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  manualSheet: {
    backgroundColor: Colors.bg, padding: Spacing.lg,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderWidth: 1, borderColor: Colors.border, borderBottomWidth: 0,
  },
  manualTitle: {
    color: Colors.text, fontSize: Typography.lg,
    fontWeight: Typography.semibold, marginBottom: 6,
  },
  manualInput: {
    color: Colors.text, backgroundColor: Colors.surface2,
    borderRadius: Radius.md, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
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
