import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Image, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { searchApi } from '../services/api';
import { EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

const { width } = Dimensions.get('window');

const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price_low', label: 'Price: Low' },
  { key: 'price_high', label: 'Price: High' },
  { key: 'recent', label: 'Recent' },
];

const IntentBadge = ({ signal }) => {
  const config = {
    sell: { label: 'Sell', color: Colors.accent },
    trade: { label: 'Trade', color: Colors.accent2 },
    sell_or_trade: { label: 'Sell/Trade', color: Colors.info },
    showcase: { label: 'Showcase', color: Colors.accent4 },
    nfs: { label: 'NFS', color: Colors.textMuted },
  }[signal] || { label: signal || 'NFS', color: Colors.textMuted };

  return (
    <View style={[styles.intentBadge, { borderColor: config.color }]}>
      <Text style={[styles.intentText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

export const SearchScreen = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [showSort, setShowSort] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['search', query, sortBy],
    queryFn: () => searchApi.search({ q: query, sort: sortBy, limit: 50 }).then((r) => r.data),
    enabled: query.trim().length >= 2,
  });

  const results = data?.results || [];

  const renderResult = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => {
        if (item.source === 'binder') {
          navigation.navigate('BinderCardDetail', {
            card: item,
            binder: { id: item.binder_id, owner: item.owner },
            linkToken: item.link_token,
          });
        } else {
          navigation.navigate('CardDetail', { cardId: item.id });
        }
      }}
      activeOpacity={0.85}
    >
      <View style={styles.resultImg}>
        {item.front_image_url
          ? <Image source={{ uri: item.front_image_url }} style={{ width: 50, height: 70 }} resizeMode="contain" />
          : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24 }}>🃏</Text></View>
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.resultPlayer} numberOfLines={1}>{item.player_name}</Text>
        <Text style={styles.resultSet} numberOfLines={1}>{item.year} {item.set_name}</Text>

        {/* Grade */}
        {item.grading_company && item.grading_company !== 'raw' && (
          <Text style={styles.resultGrade}>
            {item.grading_company.toUpperCase()} {item.grade}
          </Text>
        )}

        {/* Binder context */}
        {item.binder_name && (
          <View style={styles.binderContext}>
            <Ionicons name="book-outline" size={10} color={Colors.textMuted} />
            <Text style={styles.binderContextText} numberOfLines={1}>
              In: {item.binder_name}{item.section_name ? ` > ${item.section_name}` : ''}
            </Text>
          </View>
        )}

        {/* Badges row */}
        <View style={styles.badgesRow}>
          {item.intent_signal && <IntentBadge signal={item.intent_signal} />}
          {item.show_floor_active && (
            <View style={[styles.liveBadge]}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>Live</Text>
            </View>
          )}
          {item.want_list_match && (
            <View style={styles.wantBadge}>
              <Ionicons name="heart" size={8} color={Colors.accent3} />
              <Text style={styles.wantBadgeText}>Want</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.resultRight}>
        {item.asking_price && (
          <Text style={styles.resultPrice}>${item.asking_price}</Text>
        )}
        {item.owner && (
          <View style={styles.sellerInfo}>
            <Ionicons name="shield-checkmark" size={10} color={Colors.accent2} />
            <Text style={styles.sellerTrust}>{item.owner.trust_score || 'N/A'}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  ), [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchHeader}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search cards, binders, players..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.sortToggle}
          onPress={() => setShowSort(!showSort)}
        >
          <Ionicons name="funnel-outline" size={18} color={showSort ? Colors.accent : Colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Sort options */}
      {showSort && (
        <View style={styles.sortBar}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.sortChip, sortBy === opt.key && styles.sortChipActive]}
              onPress={() => setSortBy(opt.key)}
            >
              <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Loading indicator */}
      {(isLoading || isFetching) && query.trim().length >= 2 && (
        <View style={styles.loadingBar}>
          <View style={styles.loadingBarInner} />
        </View>
      )}

      {/* Results */}
      <FlatList
        data={results}
        renderItem={renderResult}
        keyExtractor={(item) => `${item.source}-${item.id}`}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          query.trim().length < 2 ? (
            <View style={styles.searchPrompt}>
              <Ionicons name="search" size={48} color={Colors.surface3} />
              <Text style={styles.searchPromptTitle}>Search the marketplace</Text>
              <Text style={styles.searchPromptDesc}>
                Find cards across binders and store listings. Search by player name, set, year, or team.
              </Text>
            </View>
          ) : !isLoading ? (
            <EmptyState
              icon="🔍"
              title="No results found"
              message={`No cards match "${query}". Try a different search term.`}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  searchHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: Typography.base,
  },
  sortToggle: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sortBar: {
    flexDirection: 'row', paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm, gap: Spacing.sm, flexWrap: 'wrap',
  },
  sortChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
  },
  sortChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  sortChipText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium },
  sortChipTextActive: { color: Colors.accent, fontWeight: Typography.semibold },
  loadingBar: {
    height: 2, backgroundColor: Colors.surface2,
    marginHorizontal: Spacing.base, borderRadius: 1, overflow: 'hidden',
  },
  loadingBarInner: {
    width: '30%', height: '100%', backgroundColor: Colors.accent, borderRadius: 1,
  },
  resultCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  resultImg: {
    width: 54, height: 74, borderRadius: 4,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  resultPlayer: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  resultSet: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 1 },
  resultGrade: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.medium, marginTop: 2 },
  binderContext: {
    flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3,
  },
  binderContextText: { color: Colors.textDim, fontSize: Typography.xs },
  badgesRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs, flexWrap: 'wrap', alignItems: 'center' },
  intentBadge: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start',
  },
  intentText: { fontSize: 9, fontWeight: Typography.semibold },
  liveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: Colors.accent3 + '22', borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: Colors.accent3 + '40',
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.accent3 },
  liveText: { color: Colors.accent3, fontSize: 9, fontWeight: Typography.bold },
  wantBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: Colors.accent3 + '15', borderRadius: Radius.full,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 1, borderColor: Colors.accent3 + '30',
  },
  wantBadgeText: { color: Colors.accent3, fontSize: 9, fontWeight: Typography.semibold },
  resultRight: { alignItems: 'flex-end', gap: 4 },
  resultPrice: { color: Colors.accent, fontSize: Typography.base, fontWeight: Typography.bold },
  sellerInfo: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerTrust: { color: Colors.accent2, fontSize: Typography.xs },
  searchPrompt: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: Spacing.xxxl, paddingTop: 80,
  },
  searchPromptTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginTop: Spacing.lg },
  searchPromptDesc: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
});
