// Show Floor (Phase 1.5).
//
// Three screens:
//   ShowFloorHubScreen      — entry point with tabs:
//                             "Live now" feed + "Your check-in" + "By event"
//   ShowFloorCheckInScreen  — declare event/venue/table/end time
//   ShowFloorEventScreen    — single event view: collectors + browseable inventory

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  TextInput, Alert, Image, RefreshControl, Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showFloorApi, cardsApi, bindersApi, showEventsApi, caseModeApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, LoadingScreen, EmptyState } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// HUB
// ============================================================

export const ShowFloorHubScreen = ({ navigation }) => {
  const [tab, setTab] = useState('events'); // 'events' | 'live'
  const [stateFilter, setStateFilter] = useState(''); // '' = nationwide
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['show-floor-me'],
    queryFn: () => showFloorApi.me().then((r) => r.data),
  });

  const { data: liveData, isLoading: liveLoading, refetch: refetchLive } = useQuery({
    queryKey: ['show-floor-live', stateFilter],
    queryFn: () => showFloorApi.live(stateFilter ? { state: stateFilter } : {}).then((r) => r.data),
  });

  const { data: myLiveCards } = useQuery({
    queryKey: ['my-live-cards', meData?.check_in?.id],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
    enabled: !!meData?.check_in,
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

  // Cards already in display mode — what's actually live for the
  // active session. We use this for the inline "X cards live"
  // counter and the toggle list.
  const liveCardCount = useMemo(() => {
    if (!myLiveCards?.cards) return 0;
    return myLiveCards.cards.filter((c) => c.display_mode_enabled).length;
  }, [myLiveCards]);

  const shareSession = async () => {
    if (!user?.username) return;
    const url = `https://cardshop.twomiah.com/show-floor/${user.username}`;
    try {
      await RNShare.share({
        message: `I'm live at ${me?.event_name} on Card Shop — ${url}`,
        url,
      });
    } catch {}
  };

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
            <Text style={[styles.meMeta, { color: Colors.accent, fontWeight: Typography.semibold, marginTop: 4 }]}>
              {liveCardCount} card{liveCardCount === 1 ? '' : 's'} on the floor
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm, flexWrap: 'wrap' }}>
              <Button
                title="View my session"
                variant="secondary"
                onPress={() => navigation.navigate('ShowFloorUser', { username: user?.username })}
                style={{ flex: 1, minWidth: 120 }}
              />
              <Button
                title="Manage cards"
                variant="secondary"
                onPress={() => navigation.navigate('CaseMode')}
                style={{ flex: 1, minWidth: 120 }}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.xs }}>
              <Button
                title="Share session"
                variant="ghost"
                onPress={shareSession}
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

      {/* Geo filter — empty = everywhere */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Show:</Text>
        <TouchableOpacity
          style={[styles.filterChip, !stateFilter && styles.filterChipOn]}
          onPress={() => setStateFilter('')}
        >
          <Text style={[styles.filterChipText, !stateFilter && styles.filterChipTextOn]}>Everywhere</Text>
        </TouchableOpacity>
        <TextInput
          style={[styles.filterChip, { paddingHorizontal: 10, paddingVertical: 6, minWidth: 80, color: Colors.text }]}
          value={stateFilter}
          onChangeText={(v) => setStateFilter(v.toUpperCase().slice(0, 2))}
          placeholder="State (e.g. MA)"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="characters"
          maxLength={2}
        />
      </View>

      <View style={styles.tabs}>
        {[
          { k: 'events', l: 'By event' },
          { k: 'live', l: 'All collectors' },
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

// Hours quick-presets for the check-in length
const HOUR_PRESETS = [
  { label: '4h',         hours: 4 },
  { label: 'Today (12h)', hours: 12 },
  { label: 'Weekend (48h)', hours: 48 },
  { label: '4 days',     hours: 96 },
];

export const ShowFloorCheckInScreen = ({ navigation }) => {
  const qc = useQueryClient();
  // Catalog event picker — null means "type a custom event"
  const [pickedEvent, setPickedEvent] = useState(null);
  const [eventQuery, setEventQuery] = useState('');
  const [eventNameCustom, setEventNameCustom] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [venueName, setVenueName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [hours, setHours] = useState(48);
  const [mode, setMode] = useState('binders');
  const [selectedBinderIds, setSelectedBinderIds] = useState([]);

  // Autocomplete query — debounce to avoid spamming
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(eventQuery), 250); return () => clearTimeout(t); }, [eventQuery]);

  const { data: eventSuggestions } = useQuery({
    queryKey: ['show-events-suggest', debouncedQ],
    queryFn: () => showEventsApi.list({ q: debouncedQ || undefined, upcoming: true, limit: 10 }).then((r) => r.data),
    enabled: !pickedEvent && debouncedQ.length >= 2,
  });

  const { data: bindersData } = useQuery({
    queryKey: ['my-binders-check-in'],
    queryFn: () => bindersApi.list().then((r) => r.data),
  });
  const binders = bindersData?.binders || [];

  const { data: cardsData } = useQuery({
    queryKey: ['my-cards-show-floor'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  const toggleBinder = (id) => {
    setSelectedBinderIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  // Card count preview based on selected mode + selected binders
  const previewCount = useMemo(() => {
    if (mode === 'all') return cardsData?.cards?.length || 0;
    if (mode === 'binders') {
      // We don't have card_count on binder rows in all responses; if
      // missing, sum from cards filtered by binder. Otherwise use the
      // server-side count.
      return binders
        .filter((b) => selectedBinderIds.includes(b.id))
        .reduce((s, b) => s + (b.card_count || 0), 0);
    }
    return 0;
  }, [mode, cardsData, binders, selectedBinderIds]);

  const checkInMut = useMutation({
    mutationFn: () => showFloorApi.checkIn({
      show_event_id: pickedEvent?.id,
      event_name: pickedEvent ? undefined : eventNameCustom.trim(),
      venue_name: !pickedEvent && venueName.trim() ? venueName.trim() : undefined,
      venue_city: !pickedEvent && city.trim() ? city.trim() : undefined,
      venue_state: !pickedEvent && state.trim() ? state.trim() : undefined,
      table_number: tableNumber.trim() || undefined,
      hours,
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

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Tell collectors where you are. Followers get a push.
        </Text>

        {/* Event picker — autocomplete from catalog, fallback to custom */}
        {pickedEvent ? (
          <View style={[styles.binderRow, styles.binderRowSelected, { marginBottom: Spacing.sm }]}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.binderName}>{pickedEvent.name}</Text>
              <Text style={styles.binderMeta}>
                {[pickedEvent.city, pickedEvent.state].filter(Boolean).join(', ') || pickedEvent.venue_name || ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setPickedEvent(null); setEventQuery(''); }}>
              <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Input
              label="Event"
              value={eventQuery}
              onChangeText={(t) => { setEventQuery(t); setEventNameCustom(t); }}
              placeholder="Start typing — NSCC, Strongsville..."
              autoCapitalize="words"
            />
            {Array.isArray(eventSuggestions?.events) && eventSuggestions.events.length > 0 && (
              <View style={{ marginTop: -8, marginBottom: Spacing.sm, gap: 4 }}>
                {eventSuggestions.events.slice(0, 8).map((e) => (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.suggestRow}
                    onPress={() => {
                      setPickedEvent(e);
                      setEventQuery(e.name);
                      setVenueName(e.venue_name || '');
                      setCity(e.city || '');
                      setState(e.state || '');
                    }}
                  >
                    <Ionicons name="calendar-outline" size={16} color={Colors.accent} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestName}>{e.name}</Text>
                      <Text style={styles.suggestMeta}>
                        {[e.city, e.state].filter(Boolean).join(', ')}
                        {e.starts_on ? ` · ${new Date(e.starts_on).toLocaleDateString()}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {/* If user types something unique and we want to allow it as freeform */}
            {debouncedQ.length >= 2 && eventSuggestions?.events?.length === 0 && (
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginTop: -8, marginBottom: Spacing.sm }}>
                No catalog match — we'll create this as a custom event.
              </Text>
            )}
          </>
        )}

        {/* Venue/city/state only shown when typing a custom event */}
        {!pickedEvent && (
          <>
            <Input label="Venue (optional)" value={venueName} onChangeText={setVenueName} placeholder="Boston Convention Center" />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 2 }}>
                <Input label="City" value={city} onChangeText={setCity} placeholder="Boston" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="State" value={state} onChangeText={setState} placeholder="MA" autoCapitalize="characters" />
              </View>
            </View>
          </>
        )}

        <Input
          label="Table / booth (optional)"
          value={tableNumber}
          onChangeText={setTableNumber}
          placeholder="12B"
        />

        <Text style={[styles.label, { marginTop: 4 }]}>Session length</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.sm, flexWrap: 'wrap' }}>
          {HOUR_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.hours}
              style={[styles.tab, hours === p.hours && styles.tabActive]}
              onPress={() => setHours(p.hours)}
            >
              <Text style={[styles.tabText, hours === p.hours && styles.tabTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

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

        {/* Live count preview */}
        {mode !== 'none' && (
          <View style={{ marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.accent + '15', borderColor: Colors.accent + '40', borderWidth: 1 }}>
            <Text style={{ color: Colors.accent, fontWeight: Typography.semibold, fontSize: Typography.sm }}>
              {previewCount} card{previewCount === 1 ? '' : 's'} will go live when you check in
            </Text>
          </View>
        )}

        <Button
          title="Check in"
          onPress={() => {
            if (!pickedEvent && !eventNameCustom.trim()) {
              return Alert.alert('Required', 'Pick an event or type a name.');
            }
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
                <TouchableOpacity
                  style={styles.cardRow}
                  onPress={() => navigation.navigate('CardDetail', { cardId: item.id })}
                >
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
                    <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 4 }} />
                  </View>
                </TouchableOpacity>
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
          <TouchableOpacity
            style={styles.cardRow}
            onPress={() => navigation.navigate('CardDetail', { cardId: item.id })}
          >
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
              <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} style={{ marginTop: 4 }} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <EmptyState icon="storefront-outline" title="No cards on the floor" message={`@${user?.username || 'user'} doesn't have cards in display mode.`} />
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

  // Geo filter on Hub
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.base, marginBottom: Spacing.xs },
  filterLabel: { color: Colors.textMuted, fontSize: Typography.xs },
  filterChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  filterChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  filterChipText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold },
  filterChipTextOn: { color: Colors.bg },

  // Event autocomplete suggestions
  suggestRow: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    padding: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  suggestName: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  suggestMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  label: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, marginBottom: 4 },

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
