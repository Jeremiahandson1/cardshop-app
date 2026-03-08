import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { catalogApi, wantListApi, notificationsApi } from '../services/api';
import { CardTile, EmptyState, LoadingScreen, Button } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { formatDistanceToNow } from 'date-fns';

// ============================================================
// DISCOVER / SEARCH SCREEN
// ============================================================
export const DiscoverScreen = ({ navigation }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const queryClient = useQueryClient();

  const search = async (q) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await catalogApi.search({ q, limit: 30 });
      setResults(res.data?.cards || []);
    } catch {
      // search failed silently
    }
    setSearching(false);
  };

  const wantMutation = useMutation({
    mutationFn: (catalog_id) => wantListApi.add({ catalog_id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wantlist'] }),
  });

  const SPORTS = ['Baseball', 'Basketball', 'Football', 'Hockey', 'Pokemon', 'MTG'];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchText}
            value={query}
            onChangeText={(v) => { setQuery(v); search(v); }}
            placeholder="Search cards, players, sets..."
            placeholderTextColor={Colors.textMuted}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); }}>
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity style={styles.scanBtn} onPress={() => navigation.navigate('QRScanner', { mode: 'lookup' })}>
          <Ionicons name="qr-code" size={20} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      {!query ? (
        // Browse by sport
        <FlatList
          data={SPORTS}
          keyExtractor={(item) => item}
          numColumns={2}
          contentContainerStyle={styles.sportGrid}
          ListHeaderComponent={
            <Text style={styles.browseTitle}>Browse by Sport</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.sportTile}
              onPress={() => {
                setQuery(item);
                search(item);
              }}
            >
              <Text style={styles.sportEmoji}>
                {({ Baseball: '⚾', Basketball: '🏀', Football: '🏈', Hockey: '🏒', Pokemon: '⚡', MTG: '🧙' })[item] || '🃏'}
              </Text>
              <Text style={styles.sportLabel}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => navigation.navigate('RegisterCard', { catalogId: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.resultPlayer}>{item.player_name}</Text>
                <Text style={styles.resultSet}>{item.year} {item.set_name} {item.parallel || ''}</Text>
                <Text style={styles.resultMeta}>{item.manufacturer} · {item.sport}</Text>
              </View>
              <View style={styles.resultActions}>
                <TouchableOpacity
                  style={styles.wantBtn}
                  onPress={() => wantMutation.mutate(item.id)}
                >
                  <Ionicons name="heart-outline" size={16} color={Colors.accent3} />
                  <Text style={styles.wantText}>Want</Text>
                </TouchableOpacity>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            !searching ? (
              <EmptyState
                icon="🔍"
                title="No results"
                message="Try a different search or add this card to the catalog"
                action={{
                  label: 'Add to Catalog',
                  onPress: () => {}
                }}
              />
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// NOTIFICATIONS SCREEN
// ============================================================
export const NotificationsScreen = ({ navigation }) => {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['notifications', 'all'],
    queryFn: () => notificationsApi.get({ limit: 50 }).then((r) => r.data),
  });

  const markReadMutation = useMutation({
    mutationFn: (ids) => notificationsApi.markRead(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const iconMap = {
    transfer_request: { icon: 'swap-horizontal', color: Colors.accent },
    transfer_complete: { icon: 'checkmark-circle', color: Colors.success },
    want_list_match: { icon: 'heart', color: Colors.accent3 },
    inquiry: { icon: 'chatbubble', color: Colors.accent2 },
    dispute: { icon: 'warning', color: Colors.error },
    tracking_update: { icon: 'cube', color: Colors.info },
    message: { icon: 'mail', color: Colors.accent2 },
  };
  const getIcon = (type) => iconMap[type] || { icon: 'notifications', color: Colors.textMuted };

  const handleTap = (notification) => {
    markReadMutation.mutate([notification.id]);
    const notifData = notification.data || {};
    if (notifData.transfer_id) navigation.navigate('Transfers');
    else if (notifData.owned_card_id) navigation.navigate('CardDetail', { cardId: notifData.owned_card_id });
  };

  if (isLoading) return <LoadingScreen />;

  const notifications = data?.notifications || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.notifHeader}>
        <Text style={styles.notifTitle}>Notifications</Text>
        {notifications.some((n) => !n.is_read) && (
          <TouchableOpacity onPress={() => markReadMutation.mutate(notifications.filter((n) => !n.is_read).map((n) => n.id))}>
            <Text style={styles.markAllRead}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />}
        contentContainerStyle={{ paddingBottom: 80 }}
        renderItem={({ item }) => {
          const ico = getIcon(item.type);
          return (
            <TouchableOpacity
              style={[styles.notifItem, !item.is_read && styles.notifItemUnread]}
              onPress={() => handleTap(item)}
            >
              <View style={[styles.notifIcon, { backgroundColor: ico.color + '22' }]}>
                <Ionicons name={ico.icon} size={18} color={ico.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.notifItemTitle}>{item.title}</Text>
                {item.body && <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>}
                <Text style={styles.notifTime}>
                  {item.created_at ? formatDistanceToNow(new Date(item.created_at), { addSuffix: true }) : ''}
                </Text>
              </View>
              {!item.is_read && <View style={styles.unreadDot} />}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="🔔" title="All caught up" message="You have no notifications" />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  searchText: { flex: 1, paddingVertical: Spacing.md, color: Colors.text, fontSize: Typography.base },
  scanBtn: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  browseTitle: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.md, paddingHorizontal: Spacing.base },
  sportGrid: { padding: Spacing.base, paddingBottom: 80, gap: Spacing.sm },
  sportTile: {
    flex: 1, aspectRatio: 1.5, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    margin: Spacing.xs,
  },
  sportEmoji: { fontSize: 28 },
  sportLabel: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  resultItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  resultPlayer: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  resultSet: { color: Colors.textMuted, fontSize: Typography.sm },
  resultMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  wantBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accent3 + '80',
  },
  wantText: { color: Colors.accent3, fontSize: Typography.xs, fontWeight: Typography.semibold },
  notifHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  notifTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.heavy },
  markAllRead: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium },
  notifItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  notifItemUnread: { backgroundColor: Colors.surface },
  notifIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  notifItemTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  notifBody: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, lineHeight: 16 },
  notifTime: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, marginTop: 4 },
});
