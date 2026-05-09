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
  TextInput, Alert, Image, RefreshControl, Share as RNShare, Linking,
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
  // Two-mode hub: "I'm selling at a show" vs "I'm shopping a show".
  // Picking either lands the user in a focused flow. No tabs, no
  // state filter, no nationwide collector feed — those live one
  // tap away on the "Browse" link if needed.
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['show-floor-me'],
    queryFn: () => showFloorApi.me().then((r) => r.data),
  });

  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ['show-floor-live', ''],
    queryFn: () => showFloorApi.live({}).then((r) => r.data),
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

      {/* Top card: compact check-in status. The action buttons
          previously here (View, Manage, Share, Check out) all moved
          into ManageBooth — the "Manage my booth" tile below is the
          single primary CTA when live. */}
      {me ? (
        <View style={styles.meCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={styles.liveDot} />
            <Text style={styles.meLive}>You're live at {me.event_name}</Text>
          </View>
          <Text style={styles.meMeta}>
            {me.table_number ? `Table ${me.table_number} · ` : ''}
            {liveCardCount} card{liveCardCount === 1 ? '' : 's'} on the floor
          </Text>
        </View>
      ) : null}

      {/* Two big tiles: sell vs shop. Selling tile changes wording
          when the user is already checked in (manage booth). Shop
          tile always opens to the event picker. */}
      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md }}>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.actionTile, { backgroundColor: 'rgba(232,197,71,0.10)', borderColor: 'rgba(232,197,71,0.45)' }]}
          onPress={() => {
            if (me) navigation.navigate('ManageBooth');
            else navigation.navigate('ShowFloorCheckIn');
          }}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(232,197,71,0.20)' }]}>
            <Ionicons name="storefront" size={28} color="#e8c547" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>
              {me ? 'Manage my booth' : "I'm selling at a show"}
            </Text>
            <Text style={styles.actionSubtitle}>
              {me ? 'Edit prices, swap cards on/off the floor' : 'Pick binders, set table number, go live'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.actionTile, { backgroundColor: 'rgba(125,211,252,0.10)', borderColor: 'rgba(125,211,252,0.40)' }]}
          onPress={() => navigation.navigate('ShowFloorShop')}
        >
          <View style={[styles.actionIcon, { backgroundColor: 'rgba(125,211,252,0.20)' }]}>
            <Ionicons name="search" size={28} color="#7dd3fc" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionTitle}>Shop a show</Text>
            <Text style={styles.actionSubtitle}>
              Search every seller's inventory at this show
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        {/* Optional secondary affordance — see who else is live */}
        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, paddingVertical: Spacing.md, marginTop: Spacing.xs }}
          onPress={() => navigation.navigate('ShowFloorShop')}
        >
          <Ionicons name="people-outline" size={16} color={Colors.textMuted} />
          <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
            Browse all live sellers ({checkIns.length})
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  // M-H carryover: when the show ends, automatically convert live
  // cards into permanent marketplace listings.
  const [convertToListings, setConvertToListings] = useState(false);
  const [carryoverShipping, setCarryoverShipping] = useState('bmwt');

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

  const SHIPPING_DEFAULTS = {
    pwe: { tier: 'pwe', price_cents: 105 },
    bmwt: { tier: 'bmwt', price_cents: 450 },
    signature: { tier: 'signature', price_cents: 950 },
  };

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
      convert_to_listings: convertToListings,
      carryover_shipping_options: convertToListings
        ? [SHIPPING_DEFAULTS[carryoverShipping]]
        : undefined,
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

        {/* M-H carryover: convert live cards to permanent listings on
            session end. Only meaningful if cards/binders are going live. */}
        {mode !== 'none' && (
          <View style={carryoverStyles.box}>
            <TouchableOpacity
              style={carryoverStyles.row}
              onPress={() => setConvertToListings(!convertToListings)}
            >
              <View style={[carryoverStyles.checkbox, convertToListings && carryoverStyles.checkboxOn]}>
                {convertToListings && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={carryoverStyles.label}>Stay listed after the show</Text>
                <Text style={carryoverStyles.hint}>
                  When the session ends, live cards (with prices set) become permanent marketplace listings.
                </Text>
              </View>
            </TouchableOpacity>
            {convertToListings && (
              <View style={carryoverStyles.shipRow}>
                <Text style={carryoverStyles.shipLabel}>Default shipping:</Text>
                {[
                  { tier: 'pwe', label: 'PWE' },
                  { tier: 'bmwt', label: 'BMWT' },
                  { tier: 'signature', label: 'Signature' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.tier}
                    style={[
                      carryoverStyles.shipChip,
                      carryoverShipping === opt.tier && carryoverStyles.shipChipActive,
                    ]}
                    onPress={() => setCarryoverShipping(opt.tier)}
                  >
                    <Text style={[
                      carryoverStyles.shipChipText,
                      carryoverShipping === opt.tier && { color: Colors.bg, fontWeight: '700' },
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
  // New seller/shopper hub tiles
  actionTile: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.lg, borderRadius: Radius.lg, borderWidth: 1,
  },
  actionIcon: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  actionTitle: {
    fontFamily: Typography.display, fontSize: 18, fontWeight: '700',
    color: Colors.text, marginBottom: 2,
  },
  actionSubtitle: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
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

// Local styles for the M-H carryover toggle on ShowFloorCheckInScreen.
// Kept separate so the main `styles` block stays focused on layout.
const carryoverStyles = StyleSheet.create({
  box: {
    marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  label: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  hint: { color: Colors.textMuted, fontSize: 11, marginTop: 2, lineHeight: 15 },
  shipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: Spacing.sm, paddingLeft: 30, flexWrap: 'wrap',
  },
  shipLabel: { color: Colors.textMuted, fontSize: 11 },
  shipChip: {
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },
  shipChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  shipChipText: { color: Colors.textMuted, fontSize: 11 },
});

// ============================================================
// SHOP A SHOW — buyer-side screen. Two states:
//   1. No event picked yet → list active events to choose from
//   2. Event picked        → search inventory across all sellers
//      at that event, with each card showing the table number to
//      walk to.
// ============================================================
export const ShowFloorShopScreen = ({ navigation }) => {
  const [pickedEvent, setPickedEvent] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(t); }, [search]);

  const { data: liveData, isLoading: liveLoading, error: liveError } = useQuery({
    queryKey: ['show-floor-live-shop'],
    queryFn: () => showFloorApi.live({}).then((r) => r.data),
  });
  // Pull the upcoming-event catalog so we can show shows that
  // exist on the calendar even when zero sellers have checked
  // in yet. A buyer arriving early at the National shouldn't
  // see "No active shows" when 200 sellers are an hour away.
  const { data: upcomingData, isLoading: upcomingLoading, error: upcomingError, refetch: refetchUpcoming } = useQuery({
    queryKey: ['show-events-upcoming'],
    queryFn: () => showEventsApi.list({ upcoming: true, limit: 500 }).then((r) => r.data),
  });
  const eventGroups = useMemo(() => {
    const map = {};
    for (const ci of (liveData?.check_ins || [])) {
      const k = ci.event_slug || ci.event_name;
      if (!map[k]) map[k] = { slug: ci.event_slug, name: ci.event_name, city: ci.venue_city, state: ci.venue_state, sellers: 0, total_cards: 0, isLive: true };
      map[k].sellers++;
      map[k].total_cards += ci.live_card_count || 0;
    }
    return Object.values(map);
  }, [liveData]);
  // Upcoming events from the catalog, deduped against any event
  // already showing in the live list (so we don't double-render
  // the same show in both sections).
  const upcomingGroups = useMemo(() => {
    const liveSlugs = new Set(eventGroups.map((g) => g.slug).filter(Boolean));
    return (upcomingData?.events || [])
      .filter((e) => !liveSlugs.has(e.slug))
      .map((e) => ({
        slug: e.slug,
        name: e.name,
        city: e.city,
        state: e.state,
        venue_name: e.venue_name,
        starts_on: e.starts_on,
        is_major: !!e.is_major,
        sellers: 0,
        total_cards: 0,
        isLive: false,
      }));
  }, [upcomingData, eventGroups]);

  // Picker search — filters live + upcoming by name OR city.
  // Case-insensitive, debounced for low keystroke noise.
  const [pickerSearch, setPickerSearch] = useState('');
  const [debouncedPickerSearch, setDebouncedPickerSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedPickerSearch(pickerSearch.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [pickerSearch]);

  const matchesSearch = (e) => {
    if (!debouncedPickerSearch) return true;
    const hay = `${e.name || ''} ${e.city || ''} ${e.state || ''} ${e.venue_name || ''}`.toLowerCase();
    return hay.includes(debouncedPickerSearch);
  };

  // Major upcoming shows surface above the state-sorted list so
  // big regionals + the National don't get buried alphabetically.
  const filteredLive = useMemo(() => eventGroups.filter(matchesSearch), [eventGroups, debouncedPickerSearch]);
  const filteredUpcoming = useMemo(() => upcomingGroups.filter(matchesSearch), [upcomingGroups, debouncedPickerSearch]);
  const majorUpcoming = useMemo(() => filteredUpcoming.filter((e) => e.is_major), [filteredUpcoming]);
  const otherUpcomingByState = useMemo(() => {
    const map = {};
    for (const e of filteredUpcoming.filter((x) => !x.is_major)) {
      const key = e.state || '—';
      if (!map[key]) map[key] = [];
      map[key].push(e);
    }
    // Sorted by state code so AK, AL, AR... cluster together.
    return Object.keys(map).sort().map((state) => ({ state, events: map[state] }));
  }, [filteredUpcoming]);

  const { data: inventoryData, isLoading: invLoading } = useQuery({
    queryKey: ['show-floor-shop-inventory', pickedEvent?.slug, debouncedSearch],
    queryFn: () => showFloorApi.eventInventory(pickedEvent.slug, { search: debouncedSearch || undefined, limit: 100 }).then((r) => r.data),
    enabled: !!pickedEvent?.slug,
  });

  // Pull the catalog row for the picked event so we know if a
  // venue map PDF is attached. Cheap call; the picker only fires
  // it once per event the buyer drills into.
  const { data: eventDetails } = useQuery({
    queryKey: ['show-event-details', pickedEvent?.slug],
    queryFn: () => showEventsApi.getBySlug(pickedEvent.slug).then((r) => r.data),
    enabled: !!pickedEvent?.slug,
  });

  if (!pickedEvent) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shop a show</Text>
          <View style={{ width: 22 }} />
        </View>
        <Text style={[styles.intro, { paddingHorizontal: Spacing.base, paddingTop: Spacing.base }]}>
          Pick the show you're at. We'll search every live seller's inventory.
        </Text>

        {/* Search bar — filters live + upcoming + major + state
            buckets simultaneously by show name OR city. */}
        <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.xs }}>
          <Input
            value={pickerSearch}
            onChangeText={setPickerSearch}
            placeholder="Search shows by name or city"
            autoCapitalize="words"
          />
        </View>

        {/* Don't gate the entire render on liveLoading — if the
            live-shows query is slow or errors, the upcoming-events
            list (which is what 95% of users actually want) was
            hidden behind a spinner forever. Render as soon as
            either query has data; the section bars are conditional
            anyway, so a slow live-shows query just delays the "Live
            now" header. */}
        {liveLoading && upcomingLoading ? <LoadingScreen /> : (
          <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingTop: 0 }}>
            {/* Surface query errors instead of silently degrading
                to "No shows scheduled". A 401 or network drop here
                used to look identical to a real empty calendar. */}
            {(liveError || upcomingError) && (
              <View style={{
                backgroundColor: 'rgba(239,68,68,0.1)',
                borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
                borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md,
              }}>
                <Text style={{ color: '#fca5a5', fontWeight: Typography.bold, marginBottom: 4 }}>
                  Couldn't load shows
                </Text>
                <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
                  {(upcomingError?.response?.data?.error) || (liveError?.response?.data?.error) || upcomingError?.message || liveError?.message || 'Network error'}
                </Text>
                <TouchableOpacity
                  onPress={refetchUpcoming}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: Colors.accent }}
                >
                  <Text style={{ color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.bold }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Live now — sellers actively checked in. */}
            {filteredLive.length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success }} />
                  <Text style={{ color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Live now
                  </Text>
                </View>
                {filteredLive.map((item) => (
                  <TouchableOpacity
                    key={item.slug || item.name}
                    onPress={() => setPickedEvent(item)}
                    style={[styles.eventCard, { marginBottom: Spacing.sm }]}
                  >
                    <Text style={styles.eventName}>{item.name}</Text>
                    <Text style={styles.eventMeta}>
                      {item.city ? `${item.city}, ${item.state || ''} · ` : ''}
                      {item.sellers} seller{item.sellers === 1 ? '' : 's'} · {item.total_cards} card{item.total_cards === 1 ? '' : 's'} live
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            {/* Major shows — surfaced above state buckets so the
                National + big regionals don't get buried. */}
            {majorUpcoming.length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, marginTop: filteredLive.length > 0 ? Spacing.xl : 0 }}>
                  <Ionicons name="star" size={14} color={Colors.accent} />
                  <Text style={{ color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Major shows
                  </Text>
                </View>
                {majorUpcoming.map((item) => (
                  <TouchableOpacity
                    key={item.slug || item.name}
                    onPress={() => setPickedEvent(item)}
                    style={[styles.eventCard, { marginBottom: Spacing.sm, borderColor: Colors.accent }]}
                  >
                    <Text style={styles.eventName}>{item.name}</Text>
                    <Text style={styles.eventMeta}>
                      {item.city ? `${item.city}${item.state ? ', ' + item.state : ''} · ` : ''}
                      {item.starts_on ? new Date(item.starts_on).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                      {' · '}
                      <Text style={{ color: Colors.textMuted }}>0 sellers live yet</Text>
                    </Text>
                  </TouchableOpacity>
                ))}
              </>
            ) : null}

            {/* Other upcoming — grouped by state, alphabetical. */}
            {otherUpcomingByState.length > 0 ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm, marginTop: (filteredLive.length > 0 || majorUpcoming.length > 0) ? Spacing.xl : 0 }}>
                  <Ionicons name="calendar-outline" size={14} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.bold, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Upcoming by state
                  </Text>
                </View>
                {otherUpcomingByState.map(({ state, events }) => (
                  <View key={state} style={{ marginBottom: Spacing.md }}>
                    <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 1, marginBottom: Spacing.xs }}>
                      {state}
                    </Text>
                    {events.map((item) => (
                      <TouchableOpacity
                        key={item.slug || item.name}
                        onPress={() => setPickedEvent(item)}
                        style={[styles.eventCard, { marginBottom: Spacing.xs, opacity: 0.85 }]}
                      >
                        <Text style={styles.eventName}>{item.name}</Text>
                        <Text style={styles.eventMeta}>
                          {item.city ? `${item.city} · ` : ''}
                          {item.starts_on ? new Date(item.starts_on).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </>
            ) : null}

            {/* Empty state only fires when both queries have RESOLVED
                with no rows. While upcoming is still in flight, show
                a tighter loading hint so the user doesn't think the
                calendar is empty. */}
            {filteredLive.length === 0 && majorUpcoming.length === 0 && otherUpcomingByState.length === 0 ? (
              upcomingLoading ? (
                <View style={{ paddingVertical: Spacing.xl, alignItems: 'center' }}>
                  <Text style={{ color: Colors.textMuted }}>Loading upcoming shows…</Text>
                </View>
              ) : !liveError && !upcomingError ? (
                <EmptyState
                  icon={pickerSearch ? 'search-outline' : 'calendar-outline'}
                  title={pickerSearch ? 'No shows match' : 'No shows scheduled'}
                  message={pickerSearch
                    ? 'Try a different name or city.'
                    : "When sellers go live at a show, or shows are added to the calendar, they'll appear here."}
                />
              ) : null
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  const inventory = inventoryData?.cards || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setPickedEvent(null)}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{pickedEvent.name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ padding: Spacing.base, paddingBottom: Spacing.sm }}>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search by player, set, or parallel"
          autoCapitalize="words"
        />
        {eventDetails?.map_pdf_url ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(eventDetails.map_pdf_url)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
              gap: Spacing.xs, marginTop: Spacing.sm, paddingVertical: Spacing.sm,
              borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.md,
            }}
          >
            <Ionicons name="map" size={16} color={Colors.accent} />
            <Text style={{ color: Colors.accent, fontWeight: Typography.semibold }}>
              View venue map
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {invLoading ? <LoadingScreen /> : (
        <FlatList
          data={inventory}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: Spacing.base, paddingTop: 0, paddingBottom: 80 }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          renderItem={({ item }) => {
            const img = item.image_front_url || (Array.isArray(item.photo_urls) ? item.photo_urls[0] : null) || item.catalog_image;
            return (
              <TouchableOpacity
                onPress={() => navigation.navigate('ShowFloorUser', { username: item.owner_username })}
                style={styles.userCard}
              >
                {img ? (
                  <Image source={{ uri: img }} style={{ width: 44, height: 60, borderRadius: 4, backgroundColor: Colors.surface2 }} resizeMode="contain" />
                ) : (
                  <View style={{ width: 44, height: 60, borderRadius: 4, backgroundColor: Colors.surface2 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName} numberOfLines={1}>
                    {item.player_name || '(unnamed)'}
                  </Text>
                  <Text style={styles.userMeta} numberOfLines={1}>
                    {[item.year, item.set_name, item.parallel].filter(Boolean).join(' · ')}
                    {item.card_number ? ` · #${item.card_number}` : ''}
                  </Text>
                  <Text style={styles.userCardCount}>
                    @{item.owner_username}
                    {item.owner_table ? ` · table ${item.owner_table}` : ''}
                    {item.display_asking_price ? ` · $${Number(item.display_asking_price).toFixed(2)}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={() => (
            <EmptyState
              icon="search-outline"
              title={search ? 'No matches' : 'No live cards yet'}
              message={search ? 'Try a different player or set.' : 'Sellers haven\'t put any cards on the floor yet.'}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};
