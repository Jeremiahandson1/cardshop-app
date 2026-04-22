import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, TextInput, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { cardsApi } from '../services/api';
import { CardTile, EmptyState, LoadingScreen, ScreenHeader, Button, AccountBanners } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { CollectionIntelligenceView } from './CollectionIntelligenceView';

const { width } = Dimensions.get('window'); // Note: static at module load, use useWindowDimensions for responsive
const COLUMN_GAP = Spacing.sm;
const CARD_WIDTH = (width - Spacing.base * 2 - COLUMN_GAP) / 2;

const STATUS_FILTERS = [
  { key: null, label: 'All' },
  { key: 'nft', label: 'NFT' },
  { key: 'lets_talk', label: "Let's Talk" },
  { key: 'listed', label: 'Listed' },
  { key: 'nfs', label: 'NFS' },
];

// Top-of-screen view selector. 'cards' keeps the existing grid; 'intel' swaps in
// the read-only portfolio intelligence feed sourced from the backend.
const VIEW_MODES = [
  { key: 'cards', label: 'Cards' },
  { key: 'intel', label: 'Intelligence' },
];

export const CollectionScreen = ({ navigation }) => {
  const [viewMode, setViewMode] = useState('cards');
  const [statusFilter, setStatusFilter] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-cards', statusFilter],
    queryFn: () => cardsApi.mine({ status: statusFilter, limit: 100 }).then((r) => r.data),
    // Only fetch owned-cards when the Cards view is visible — avoids a pointless
    // request when the user is on the Intelligence tab.
    enabled: viewMode === 'cards',
  });

  const cards = data?.cards || [];

  const filtered = search.trim()
    ? cards.filter((c) =>
        c.player_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.set_name?.toLowerCase().includes(search.toLowerCase())
      )
    : cards;

  const renderCard = useCallback(({ item, index }) => (
    <CardTile
      card={item}
      onPress={() => navigation.navigate('CardDetail', { cardId: item.id })}
      style={{
        width: CARD_WIDTH,
        marginLeft: index % 2 === 0 ? 0 : COLUMN_GAP,
        marginBottom: COLUMN_GAP,
      }}
    />
  ), [navigation]);

  // Only show the initial loading screen for the Cards view — the Intelligence
  // view manages its own loading state and shouldn't be blocked by the owned-
  // cards query (which is disabled while on that tab anyway).
  if (viewMode === 'cards' && isLoading) return <LoadingScreen message="Loading your collection..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="My Collection"
        subtitle={
          viewMode === 'cards'
            ? `${cards.length} card${cards.length !== 1 ? 's' : ''}`
            : 'Portfolio intelligence'
        }
        right={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => navigation.navigate('CollectionImportExport')}
              accessibilityLabel="Import / Export CSV"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="swap-vertical" size={18} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => navigation.navigate('RegisterCard')}
              accessibilityLabel="Register a card"
            >
              <Ionicons name="add" size={22} color={Colors.bg} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Account-level nags (email-verify / scheduled-deletion) */}
      <AccountBanners />

      {/* View toggle — Cards vs Intelligence */}
      <View style={styles.viewToggle}>
        {VIEW_MODES.map((m) => {
          const active = viewMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.viewToggleBtn, active && styles.viewToggleBtnActive]}
              onPress={() => setViewMode(m.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {viewMode === 'intel' ? (
        <CollectionIntelligenceView />
      ) : (
        <>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search your collection..."
          placeholderTextColor={Colors.textMuted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status filters */}
      <FlatList
        horizontal
        data={STATUS_FILTERS}
        keyExtractor={(item) => item.key || 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filterChip, statusFilter === item.key && styles.filterChipActive]}
            onPress={() => setStatusFilter(item.key)}
          >
            <Text style={[styles.filterText, statusFilter === item.key && styles.filterTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Cards grid */}
      <FlatList
        data={filtered}
        renderItem={renderCard}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🃏"
            title={search ? 'No matches found' : 'No cards yet'}
            message={search ? 'Try a different search term' : 'Tap + to register your first card'}
            action={!search ? { label: 'Register a Card', onPress: () => navigation.navigate('RegisterCard') } : null}
          />
        }
      />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  addBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md, marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { marginRight: Spacing.sm },
  searchInput: {
    flex: 1, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: Typography.base,
  },
  filterList: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  filterChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '22',
  },
  filterText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  filterTextActive: { color: Colors.accent, fontWeight: Typography.semibold },
  grid: { padding: Spacing.base, flexGrow: 1 },
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 3,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: Radius.full,
  },
  viewToggleBtnActive: {
    backgroundColor: Colors.accent,
  },
  viewToggleText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    letterSpacing: 0.3,
  },
  viewToggleTextActive: {
    color: Colors.bg,
  },
});
