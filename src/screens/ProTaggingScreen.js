// ProTaggingScreen — admin-only flow for tagging a shop's inventory.
//
// Flow:
//   1. Admin opens the screen — sees current active session (if any),
//      list of recent past sessions, and "Start new session" button
//   2. Tap "Start" → search stores → tap a store → confirm → session
//      starts on the server, banner appears here + on Home
//   3. Admin uses the existing RegisterCard flow elsewhere; every
//      card scanned during the session links via tagging_session_id
//   4. Tap "End session" → totals freeze, session moves to history
//
// Admins-only — gated by user.role === 'admin'. Non-admins
// shouldn't reach this screen via nav, but we double-check anyway.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, TextInput, ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taggingSessionsApi, adminStoresApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Button, ScreenHeader, EmptyState, LoadingScreen, Divider,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

export const ProTaggingScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const isAdmin = user?.role === 'admin';

  const activeQ = useQuery({
    queryKey: ['tagging-active'],
    queryFn: () => taggingSessionsApi.active(),
    enabled: isAdmin,
    refetchInterval: 15000, // 15s — keeps card count fresh while tagging
  });

  const recentQ = useQuery({
    queryKey: ['tagging-recent'],
    queryFn: () => taggingSessionsApi.list({ days: 90, limit: 30 }),
    enabled: isAdmin,
  });

  const endMut = useMutation({
    mutationFn: (id) => taggingSessionsApi.end(id),
    onSuccess: (sess) => {
      qc.invalidateQueries({ queryKey: ['tagging-active'] });
      qc.invalidateQueries({ queryKey: ['tagging-recent'] });
      Alert.alert(
        'Session ended',
        `${sess.cards_count} card${sess.cards_count === 1 ? '' : 's'} tagged · ${usd(sess.retail_total_cents)} retail value`,
      );
    },
    onError: (err) => Alert.alert('Could not end', err?.response?.data?.error || err?.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id) => taggingSessionsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tagging-active'] });
      qc.invalidateQueries({ queryKey: ['tagging-recent'] });
    },
    onError: (err) => Alert.alert('Could not cancel', err?.response?.data?.error || err?.message),
  });

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Pro Tagging" />
        <EmptyState
          icon="🔒"
          title="Admin only"
          message="Pro Tagging sessions are an internal tool for the Card Shop team."
        />
      </SafeAreaView>
    );
  }

  const active = activeQ.data?.session;
  const sessions = recentQ.data?.sessions || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Pro Tagging" />

      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        refreshControl={
          <RefreshControl
            refreshing={activeQ.isFetching || recentQ.isFetching}
            onRefresh={() => { activeQ.refetch(); recentQ.refetch(); }}
            tintColor={Colors.accent}
          />
        }
        ListHeaderComponent={
          <View>
            {/* Active session card */}
            {active ? (
              <View style={styles.activeCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.xs }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' }} />
                  <Text style={styles.activeLabel}>SESSION ACTIVE</Text>
                </View>
                <Text style={styles.activeStore}>{active.store_name}</Text>
                {active.location_name && (
                  <Text style={styles.activeLocation}>
                    {active.location_name}{active.location_city ? ` · ${active.location_city}, ${active.location_state || ''}` : ''}
                  </Text>
                )}
                <View style={styles.activeStats}>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>{active.cards_count}</Text>
                    <Text style={styles.statLabel}>Cards tagged</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statValue}>
                      {usd(
                        active.cards_count <= 1000
                          ? active.cards_count * 300
                          : 1000 * 300 + (active.cards_count - 1000) * 200
                      )}
                    </Text>
                    <Text style={styles.statLabel}>Retail value</Text>
                  </View>
                </View>
                <Text style={styles.activeHint}>
                  Open the camera scanner from the Add Card flow. Every card you register will be linked to this session.
                </Text>
                <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                  <Button
                    title="End session"
                    onPress={() => Alert.alert(
                      'End session?',
                      `${active.cards_count} card${active.cards_count === 1 ? '' : 's'} will be locked in.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'End', style: 'destructive', onPress: () => endMut.mutate(active.id) },
                      ],
                    )}
                    loading={endMut.isPending}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Cancel"
                    variant="ghost"
                    onPress={() => Alert.alert(
                      'Cancel session?',
                      'Cards already tagged will keep their session_id but the session will be marked discarded.',
                      [
                        { text: 'Keep going', style: 'cancel' },
                        { text: 'Discard', style: 'destructive', onPress: () => cancelMut.mutate(active.id) },
                      ],
                    )}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.idleCard}>
                <Ionicons name="pricetag-outline" size={32} color={Colors.accent} />
                <Text style={styles.idleTitle}>No active session</Text>
                <Text style={styles.idleSub}>
                  Start a session before you tag cards at a shop. Each card you scan during the session will be tracked for billing + audit.
                </Text>
                <Button
                  title="Start new session"
                  onPress={() => setPickerOpen(true)}
                  style={{ marginTop: Spacing.md }}
                />
              </View>
            )}

            <Divider />
            <Text style={styles.sectionLabel}>RECENT SESSIONS</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.sessionRow}
            onPress={() => navigation.navigate('TaggingSessionDetail', { sessionId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.sessionStore}>{item.store_name}</Text>
              <Text style={styles.sessionMeta}>
                {item.location_name ? `${item.location_name} · ` : ''}
                {new Date(item.started_at).toLocaleDateString()}
                {' · '}
                {item.status}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.sessionCount}>{item.cards_count || 0} cards</Text>
              <Text style={styles.sessionValue}>{usd(item.retail_total_cents)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          recentQ.isLoading ? null : (
            <Text style={styles.emptyText}>No sessions yet.</Text>
          )
        }
      />

      <StorePickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPicked={() => {
          setPickerOpen(false);
          qc.invalidateQueries({ queryKey: ['tagging-active'] });
          qc.invalidateQueries({ queryKey: ['tagging-recent'] });
        }}
      />
    </SafeAreaView>
  );
};

// Inline modal to keep this self-contained — separate StorePicker
// route would require nav plumbing for one screen used in one place.
const StorePickerModal = ({ visible, onClose, onPicked }) => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const storesQ = useQuery({
    queryKey: ['admin-stores-pick', debounced],
    queryFn: () => adminStoresApi.list({ q: debounced || undefined, limit: 30 }),
    enabled: visible,
  });

  const startMut = useMutation({
    mutationFn: ({ store_id, store_location_id }) =>
      taggingSessionsApi.start({ store_id, store_location_id }),
    onSuccess: () => {
      onPicked();
    },
    onError: (err) => Alert.alert('Could not start', err?.response?.data?.error || err?.message),
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Pick a store</Text>
          <View style={{ width: 60 }} />
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, slug, or owner"
          placeholderTextColor={Colors.textMuted}
          style={styles.modalSearch}
          autoFocus
        />
        {storesQ.isLoading ? (
          <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
        ) : (
          <FlatList
            data={storesQ.data?.stores || []}
            keyExtractor={(s) => s.id}
            contentContainerStyle={{ padding: Spacing.base }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.storeRow}
                onPress={() => Alert.alert(
                  `Start session at ${item.name}?`,
                  'You\'ll be the only admin tagging here. Cards you scan during the session will be linked.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Start',
                      onPress: () => startMut.mutate({ store_id: item.id }),
                    },
                  ],
                )}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.storeName}>{item.name}</Text>
                  <Text style={styles.storeMeta}>
                    @{item.owner_username} · {item.location_count} location{item.location_count === 1 ? '' : 's'} · {item.card_count} cards
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>{debounced ? 'No matches' : 'Type to search'}</Text>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  activeCard: {
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.40)',
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  activeLabel: {
    color: '#4ade80',
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
  },
  activeStore: {
    color: Colors.text,
    fontSize: 22, fontWeight: '700',
    marginTop: 4,
  },
  activeLocation: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  activeStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  statBox: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.accent,
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  activeHint: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: Spacing.md,
    lineHeight: 18,
  },
  idleCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  idleTitle: {
    color: Colors.text,
    fontSize: 18, fontWeight: '600',
    marginTop: Spacing.sm,
  },
  idleSub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sessionStore: {
    color: Colors.text,
    fontSize: 14, fontWeight: '600',
  },
  sessionMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  sessionCount: {
    color: Colors.text,
    fontSize: 14, fontWeight: '600',
  },
  sessionValue: {
    color: Colors.accent,
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    color: Colors.textMuted,
    textAlign: 'center',
    padding: Spacing.xl,
    fontStyle: 'italic',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalCancel: { color: Colors.accent, fontSize: 15, width: 60 },
  modalTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  modalSearch: {
    marginHorizontal: Spacing.base, marginVertical: Spacing.sm,
    backgroundColor: Colors.surface, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, padding: Spacing.md,
    fontSize: 15,
  },
  storeRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  storeName: {
    color: Colors.text,
    fontSize: 15, fontWeight: '600',
  },
  storeMeta: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});

export default ProTaggingScreen;
