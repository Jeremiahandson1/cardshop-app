// Show Floor (Phase 1.5).
//
// Three screens:
//   ShowFloorHubScreen      — entry point with tabs:
//                             "Live now" feed + "Your check-in" + "By event"
//   ShowFloorCheckInScreen  — declare event/venue/table/end time
//   ShowFloorEventScreen    — single event view: collectors + browseable inventory

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  TextInput, Alert, Image, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showFloorApi, cardsApi, bindersApi } from '../services/api';
import { Button, Input, LoadingScreen, EmptyState } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// HUB
// ============================================================

export const ShowFloorHubScreen = ({ navigation }) => {
  const [tab, setTab] = useState('live'); // 'live' | 'mine'
  const qc = useQueryClient();

  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['show-floor-me'],
    queryFn: () => showFloorApi.me().then((r) => r.data),
  });

  const { data: liveData, isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ['show-floor-live'],
    queryFn: () => showFloorApi.live().then((r) => r.data),
  });

  const checkOutMut = useMutation({
    mutationFn: () => showFloorApi.checkOut(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show-floor-me'] });
      qc.invalidateQueries({ queryKey: ['show-floor-live'] });
      Alert.alert('Checked out', 'Your show floor session has ended.');
    },
  });

  const me = meData?.check_in;
  const checkIns = liveData?.check_ins || [];

  // Group active check-ins by event_slug for the "By event" view
  const eventGroups = useMemo(() => {
    const map = {};
    for (const ci of checkIns) {
      const k = ci.event_slug || ci.event_name;
      if (!map[k]) {
        map[k] = { slug: ci.event_slug, name: ci.event_name, city: ci.venue_city, state: ci.venue_state, count: 0, total_cards: 0 };
      }
      map[k].count++;
      map[k].total_cards += ci.live_card_count || 0;
    }
    return Object.values(map);
  }, [checkIns]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Show Floor</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Top card: my check-in status */}
      <View style={styles.meCard}>
        {me ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={styles.liveDot} />
              <Text style={styles.meLive}>You're live at {me.event_name}</Text>
            </View>
            <Text style={styles.meMeta}>
              {me.venue_name ? `${me.venue_name} · ` : ''}
              {me.table_number ? `Table ${me.table_number} · ` : ''}
              ends {new Date(me.ends_at).toLocaleString()}
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm }}>
              <Button
                title="View my session"
                variant="secondary"
                onPress={() => navigation.navigate('ShowFloorEvent', { slug: me.event_slug })}
                style={{ flex: 1 }}
              />
              <Button
                title="Check out"
                variant="ghost"
                onPress={() => Alert.alert('End session?', 'Take all your cards off the floor.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End', style: 'destructive', onPress: () => checkOutMut.mutate() },
                ])}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.meIdle}>You're not at a show right now.</Text>
            <Button
              title="Check in to a show"
              onPress={() => navigation.navigate('ShowFloorCheckIn')}
              style={{ marginTop: Spacing.sm }}
            />
          </>
        )}
      </View>

      <View style={styles.tabs}>
        {[
          { k: 'live', l: 'Live now' },
          { k: 'events', l: 'By event' },
        ].map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.tab, tab === t.k && styles.tabActive]}
            onPress={() => setTab(t.k)}
          >
            <Text style={[styles.tabText, tab === t.k && styles.tabTextActive]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'live' ? (
        liveLoading ? <LoadingScreen /> : (
          <FlatList
            data={checkIns}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => navigation.navigate('ShowFloorUser', { username: item.username })}
                style={styles.userCard}
              >
                <View style={styles.avatarFallback}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={{ color: Colors.text, fontWeight: 'bold' }}>
                      {(item.display_name || item.username || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>@{item.username}</Text>
                  <Text style={styles.userMeta} numberOfLines={1}>
                    {item.event_name}
                    {item.table_number ? ` · table ${item.table_number}` : ''}
                  </Text>
                  <Text style={styles.userCardCount}>{item.live_card_count} live card{item.live_card_count === 1 ? '' : 's'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={() => (
              <EmptyState icon="storefront-outline" title="Nobody's live right now" message="When collectors check in to shows, they'll appear here." />
            )}
            refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetchLive(); refetchMe(); }} />}
          />
        )
      ) : (
        <FlatList
          data={eventGroups}
          keyExtractor={(e) => e.slug || e.name}
          contentContainerStyle={{ padding: Spacing.base }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('ShowFloorEvent', { slug: item.slug })}
              style={styles.eventCard}
            >
              <Text style={styles.eventName}>{item.name}</Text>
              <Text style={styles.eventMeta}>
                {item.city ? `${item.city}, ${item.state || ''}` : ''}
                {item.city ? ' · ' : ''}
                {item.count} collector{item.count === 1 ? '' : 's'} · {item.total_cards} card{item.total_cards === 1 ? '' : 's'} live
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <EmptyState icon="calendar-outline" title="No active events" message="Check back during a show." />
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// CHECK-IN SCREEN
// ============================================================

export const ShowFloorCheckInScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [eventName, setEventName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [hours, setHours] = useState('48');
  // Three modes: 'binders' (pick which binders), 'all' (all cards), 'none' (just check in)
  const [mode, setMode] = useState('binders');
  const [selectedBinderIds, setSelectedBinderIds] = useState([]);

  const { data: bindersData } = useQuery({
    queryKey: ['my-binders-check-in'],
    queryFn: () => bindersApi.list().then((r) => r.data),
  });
  const binders = bindersData?.binders || [];

  const { data: cardsData } = useQuery({
    queryKey: ['my-cards-show-floor'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
    enabled: mode === 'all',
  });

  const toggleBinder = (id) => {
    setSelectedBinderIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const checkInMut = useMutation({
    mutationFn: () => showFloorApi.checkIn({
      event_name: eventName.trim(),
      venue_name: venueName.trim() || undefined,
      venue_city: city.trim() || undefined,
      venue_state: state.trim() || undefined,
      table_number: tableNumber.trim() || undefined,
      hours: parseInt(hours, 10) || 48,
      go_live_binder_ids: mode === 'binders' && selectedBinderIds.length ? selectedBinderIds : undefined,
      go_live_card_ids: mode === 'all' ? (cardsData?.cards || []).map((c) => c.id) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show-floor-me'] });
      qc.invalidateQueries({ queryKey: ['show-floor-live'] });
      qc.invalidateQueries({ queryKey: ['my-cards-case-mode'] });
      Alert.alert('You\'re live!', 'Your followers have been notified.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Could not check in', e.response?.data?.error || e.message),
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Check in</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}>
        <Text style={styles.intro}>
          Tell collectors where you are. Followers get a push, and your check-in shows up in
          everyone's "Live now" feed at this event.
        </Text>

        <Input
          label="Event name *"
          value={eventName}
          onChangeText={setEventName}
          placeholder="NSCC 2026 Boston"
        />
        <Input
          label="Venue (optional)"
          value={venueName}
          onChangeText={setVenueName}
          placeholder="Boston Convention Center"
        />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 2 }}>
            <Input label="City" value={city} onChangeText={setCity} placeholder="Boston" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="State" value={state} onChangeText={setState} placeholder="MA" autoCapitalize="characters" />
          </View>
        </View>
        <Input
          label="Table / booth (optional)"
          value={tableNumber}
          onChangeText={setTableNumber}
          placeholder="12B"
        />
        <Input
          label="Session length (hours)"
          value={hours}
          onChangeText={setHours}
          keyboardType="number-pad"
        />

        <Text style={[styles.intro, { marginTop: Spacing.md, marginBottom: Spacing.xs, fontWeight: Typography.bold, color: Colors.text }]}>
          What's on the show floor?
        </Text>

        <View style={{ flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm }}>
          {[
            { k: 'binders', l: 'Pick binders' },
            { k: 'all',     l: 'All my cards' },
            { k: 'none',    l: 'Just check in' },
          ].map((m) => (
            <TouchableOpacity
              key={m.k}
              style={[styles.tab, mode === m.k && styles.tabActive]}
              onPress={() => setMode(m.k)}
            >
              <Text style={[styles.tabText, mode === m.k && styles.tabTextActive]}>{m.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'binders' && (
          <View style={{ gap: 4 }}>
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 4 }}>
              Tap to select which binders you're bringing. Every card in those binders goes live.
            </Text>
            {binders.length === 0 && (
              <Text style={{ color: Colors.textMuted, fontStyle: 'italic', fontSize: Typography.sm }}>
                You don't have any binders yet.
              </Text>
            )}
            {binders.map((b) => {
              const selected = selectedBinderIds.includes(b.id);
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.binderRow, selected && styles.binderRowSelected]}
                  onPress={() => toggleBinder(b.id)}
                >
                  <Ionicons
                    name={selected ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={selected ? Colors.accent : Colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.binderName}>{b.name}</Text>
                    <Text style={styles.binderMeta}>
                      {b.card_count != null ? `${b.card_count} cards` : ''}
                      {b.is_public ? ' · public' : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {selectedBinderIds.length > 0 && (
              <Text style={{ color: Colors.accent, fontSize: Typography.sm, marginTop: 4, fontWeight: Typography.semibold }}>
                {selectedBinderIds.length} binder{selectedBinderIds.length === 1 ? '' : 's'} selected
              </Text>
            )}
          </View>
        )}

        {mode === 'all' && (
          <View style={[styles.binderRow, styles.binderRowSelected]}>
            <Ionicons name="library" size={20} color={Colors.accent} />
            <Text style={[styles.binderName, { flex: 1 }]}>
              All {cardsData?.cards?.length || 0} of your cards
            </Text>
          </View>
        )}

        {mode === 'none' && (
          <View style={[styles.binderRow]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.textMuted} />
            <Text style={[styles.binderMeta, { flex: 1 }]}>
              Just check in — nothing on the show floor yet. You can mark binders or cards live later.
            </Text>
          </View>
        )}

        <Button
          title="Check in"
          onPress={() => {
            if (!eventName.trim()) return Alert.alert('Required', 'Event name is required.');
            if (mode === 'binders' && selectedBinderIds.length === 0) {
              Alert.alert(
                'No binders selected',
                'Pick at least one binder, choose "All my cards", or switch to "Just check in".',
              );
              return;
            }
            checkInMut.mutate();
          }}
          loading={checkInMut.isPending}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// EVENT SCREEN — collectors + inventory at one event
// ============================================================

export const ShowFloorEventScreen = ({ navigation, route }) => {
  const { slug } = route.params || {};
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('cards'); // 'cards' | 'collectors'

  const { data: eventData, isLoading: eventLoading } = useQuery({
    queryKey: ['show-floor-event', slug],
    queryFn: () => showFloorApi.event(slug).then((r) => r.data),
    enabled: !!slug,
  });

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: ['show-floor-event-inv', slug, search],
    queryFn: () => showFloorApi.eventInventory(slug, { search: search || undefined, limit: 200 }).then((r) => r.data),
    enabled: !!slug,
  });

  if (eventLoading) return <LoadingScreen />;
  const event = eventData?.event;
  const collectors = eventData?.collectors || [];
  const cards = invData?.cards || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{event?.name || 'Event'}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.eventHeader}>
        <Text style={styles.eventHeaderText}>
          {event?.venue ? `${event.venue} · ` : ''}
          {event?.city ? `${event.city}, ${event.state || ''}` : ''}
        </Text>
        <Text style={styles.eventHeaderStats}>
          {eventData?.collector_count} collector{eventData?.collector_count === 1 ? '' : 's'} · {eventData?.total_live_cards} card{eventData?.total_live_cards === 1 ? '' : 's'} live
        </Text>
      </View>

      <View style={styles.tabs}>
        {[
          { k: 'cards', l: 'Cards' },
          { k: 'collectors', l: 'Collectors' },
        ].map((t) => (
          <TouchableOpacity
            key={t.k}
            style={[styles.tab, tab === t.k && styles.tabActive]}
            onPress={() => setTab(t.k)}
          >
            <Text style={[styles.tabText, tab === t.k && styles.tabTextActive]}>{t.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'cards' ? (
        <>
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Player, set, parallel..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          {invLoading ? <LoadingScreen /> : (
            <FlatList
              data={cards}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
              renderItem={({ item }) => (
                <View style={styles.cardRow}>
                  {item.image_front_url || item.catalog_image ? (
                    <Image source={{ uri: item.image_front_url || item.catalog_image }} style={styles.cardThumb} resizeMode="contain" />
                  ) : (
                    <View style={styles.cardThumb}><Ionicons name="image-outline" size={20} color={Colors.textMuted} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.year} {item.set_name} {item.player_name}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {item.parallel ? `${item.parallel} · ` : ''}
                      {item.card_number ? `#${item.card_number}` : ''}
                      {item.serial_number ? ` /${item.serial_number}` : ''}
                    </Text>
                    <Text style={styles.cardSeller}>
                      @{item.owner_username}
                      {item.owner_table ? ` · table ${item.owner_table}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    {item.display_asking_price && (
                      <Text style={styles.cardPrice}>${Number(item.display_asking_price).toFixed(0)}</Text>
                    )}
                    {item.display_trade_only && (
                      <Text style={styles.tradeOnly}>trade only</Text>
                    )}
                  </View>
                </View>
              )}
              ListEmptyComponent={() => (
                <EmptyState icon="search" title="Nothing matches" message="Try a different search or browse collectors." />
              )}
            />
          )}
        </>
      ) : (
        <FlatList
          data={collectors}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('ShowFloorUser', { username: item.username })}
              style={styles.userCard}
            >
              <View style={styles.avatarFallback}>
                {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} /> : (
                  <Text style={{ color: Colors.text, fontWeight: 'bold' }}>{(item.display_name || item.username || '?').slice(0, 1).toUpperCase()}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>@{item.username}</Text>
                <Text style={styles.userMeta}>
                  {item.table_number ? `Table ${item.table_number} · ` : ''}
                  {item.live_card_count} card{item.live_card_count === 1 ? '' : 's'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// USER SHOW FLOOR — single collector's session
// ============================================================

export const ShowFloorUserScreen = ({ navigation, route }) => {
  const { username } = route.params || {};

  const { data, isLoading } = useQuery({
    queryKey: ['show-floor-user', username],
    queryFn: () => showFloorApi.user(username).then((r) => r.data),
    enabled: !!username,
  });

  if (isLoading || !data) return <LoadingScreen />;
  const { user, check_in, cards } = data;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>@{user.username}</Text>
        <View style={{ width: 22 }} />
      </View>

      {check_in ? (
        <View style={styles.eventHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.liveDot} />
            <Text style={styles.eventHeaderText}>Live at {check_in.event_name}</Text>
          </View>
          <Text style={styles.eventHeaderStats}>
            {check_in.venue_name ? `${check_in.venue_name} · ` : ''}
            {check_in.table_number ? `Table ${check_in.table_number} · ` : ''}
            ends {new Date(check_in.ends_at).toLocaleString()}
          </Text>
        </View>
      ) : (
        <View style={styles.eventHeader}>
          <Text style={styles.eventHeaderText}>Not at a show right now.</Text>
        </View>
      )}

      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <View style={styles.cardRow}>
            {item.image_front_url || item.catalog_image ? (
              <Image source={{ uri: item.image_front_url || item.catalog_image }} style={styles.cardThumb} resizeMode="contain" />
            ) : (
              <View style={styles.cardThumb}><Ionicons name="image-outline" size={20} color={Colors.textMuted} /></View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.year} {item.set_name} {item.player_name}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {item.parallel ? `${item.parallel} · ` : ''}
                {item.card_number ? `#${item.card_number}` : ''}
                {item.serial_number ? ` /${item.serial_number}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.display_asking_price && (
                <Text style={styles.cardPrice}>${Number(item.display_asking_price).toFixed(0)}</Text>
              )}
              {item.display_trade_only && (
                <Text style={styles.tradeOnly}>trade only</Text>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={() => (
          <EmptyState icon="storefront-outline" title="No cards on the floor" message="@{user.username} doesn't have cards in display mode." />
        )}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, flex: 1, textAlign: 'center' },
  intro: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19, marginBottom: Spacing.sm },

  meCard: {
    backgroundColor: Colors.surface, margin: Spacing.base,
    borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  meLive: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  meIdle: { color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center' },
  meMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4 },

  tabs: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.sm, marginBottom: Spacing.xs },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  tabTextActive: { color: Colors.bg },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  avatarFallback: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  userName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  userMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  userCardCount: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.semibold, marginTop: 2 },

  eventCard: {
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  eventName: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  eventMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4 },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.sm, marginTop: Spacing.sm },
  toggleOn: {},
  toggleText: { color: Colors.text, fontSize: Typography.sm, flex: 1 },

  binderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  binderRowSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '10' },
  binderName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  binderMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },

  eventHeader: { padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border },
  eventHeaderText: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  eventHeaderStats: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    margin: Spacing.base, paddingHorizontal: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, paddingVertical: Spacing.sm, fontSize: Typography.base },

  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  cardThumb: { width: 50, height: 70, borderRadius: 4, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  cardMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  cardSeller: { color: Colors.accent, fontSize: Typography.xs, marginTop: 4 },
  cardPrice: { color: Colors.accent, fontSize: Typography.md, fontWeight: Typography.bold },
  tradeOnly: { color: Colors.textMuted, fontSize: 10, fontStyle: 'italic' },
});
