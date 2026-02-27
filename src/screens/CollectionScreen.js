import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, TextInput, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { cardsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { CardTile, EmptyState, LoadingScreen, ScreenHeader, Button } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');
const COLUMN_GAP = Spacing.sm;
const CARD_WIDTH = (width - Spacing.base * 2 - COLUMN_GAP) / 2;

const STATUS_FILTERS = [
  { key: null, label: 'All' },
  { key: 'nft', label: 'NFT' },
  { key: 'lets_talk', label: "Let's Talk" },
  { key: 'listed', label: 'Listed' },
  { key: 'nfs', label: 'NFS' },
];

export const CollectionScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [statusFilter, setStatusFilter] = useState(null);
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-cards', statusFilter],
    queryFn: () => cardsApi.mine({ status: statusFilter, limit: 100 }).then((r) => r.data),
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

  if (isLoading) return <LoadingScreen message="Loading your collection..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="My Collection"
        subtitle={`${cards.length} card${cards.length !== 1 ? 's' : ''}`}
        right={
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => navigation.navigate('RegisterCard')}
          >
            <Ionicons name="add" size={22} color={Colors.bg} />
          </TouchableOpacity>
        }
      />

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
        keyExtractor={(item) => item.id}
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
});
