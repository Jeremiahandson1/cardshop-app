// Manage My Booth — the seller's command center while live at a
// show. Shows the active session header, live-card stats, and
// the cards currently on the floor with inline price edit + quick
// take-off-floor action. Distinct from CaseMode (which is the
// persistent any-time display-mode feature) — this screen only
// makes sense when the user has an active show check-in.
import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  TextInput, Alert, Image, RefreshControl, Share as RNShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showFloorApi, cardsApi, caseModeApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, LoadingScreen, EmptyState } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

function fmtMoney(n) {
  if (n == null) return null;
  return `$${Number(n).toFixed(2)}`;
}

function fmtTimeRemaining(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return 'ending';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export const ManageBoothScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const { data: meData, refetch: refetchMe } = useQuery({
    queryKey: ['show-floor-me'],
    queryFn: () => showFloorApi.me().then((r) => r.data),
  });
  const { data: cardsData, refetch: refetchCards, isLoading: cardsLoading } = useQuery({
    queryKey: ['my-cards-booth'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  // Tick a re-render every minute so the time-remaining label
  // stays fresh without manual refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const me = meData?.check_in;
  const allCards = cardsData?.cards || [];
  const liveCards = useMemo(
    () => allCards.filter((c) => c.display_mode_enabled),
    [allCards],
  );

  const totalLiveValue = useMemo(() => {
    return liveCards.reduce((s, c) => s + Number(c.display_asking_price || c.asking_price || 0), 0);
  }, [liveCards]);

  const checkOutMut = useMutation({
    mutationFn: () => showFloorApi.checkOut(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['show-floor-me'] });
      qc.invalidateQueries({ queryKey: ['my-cards-booth'] });
      Alert.alert('Booth closed', 'All cards taken off the floor.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (e) => Alert.alert('Could not close booth', e.response?.data?.error || e.message),
  });

  const takeOffMut = useMutation({
    mutationFn: (cardId) => caseModeApi.toggle(cardId, { enabled: false }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-cards-booth'] }),
    onError: (e) => Alert.alert('Could not update', e.response?.data?.error || e.message),
  });

  const updatePriceMut = useMutation({
    mutationFn: ({ cardId, price }) => caseModeApi.toggle(cardId, { enabled: true, asking_price: price }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-cards-booth'] }),
    onError: (e) => Alert.alert('Could not update price', e.response?.data?.error || e.message),
  });

  const shareBooth = async () => {
    if (!user?.username) return;
    const url = `https://cardshop.twomiah.com/show-floor/${user.username}`;
    try {
      await RNShare.share({
        message: `I'm live at ${me?.event_name || 'a show'} — ${liveCards.length} cards on the floor. ${url}`,
        url,
      });
    } catch {}
  };

  // No active session — redirect to check-in.
  if (!meData) return <LoadingScreen />;
  if (!me) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage my booth</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', padding: Spacing.lg }}>
          <EmptyState
            icon="storefront-outline"
            title="You're not live at a show"
            message="Check in to a show first, then come back here to manage your booth."
            action={{
              label: 'Check in to a show',
              onPress: () => navigation.replace('ShowFloorCheckIn'),
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>Manage my booth</Text>
        <TouchableOpacity onPress={shareBooth}>
          <Ionicons name="share-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={liveCards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <View>
            {/* Session card — event, table, time, stats */}
            <View style={styles.sessionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.liveDot} />
                <Text style={styles.liveLabel}>LIVE</Text>
                <Text style={styles.timeRemaining}>{fmtTimeRemaining(me.ends_at)}</Text>
              </View>
              <Text style={styles.eventName} numberOfLines={2}>{me.event_name}</Text>
              <Text style={styles.eventMeta}>
                {me.venue_name ? `${me.venue_name} · ` : ''}
                {me.table_number ? `Table ${me.table_number}` : ''}
              </Text>
              <View style={styles.statsRow}>
                <Stat label="Cards live" value={liveCards.length} />
                <Stat label="Floor value" value={fmtMoney(totalLiveValue) || '$0'} />
              </View>
              <View style={styles.actionRow}>
                <Button
                  title="Add cards"
                  variant="secondary"
                  onPress={() => navigation.navigate('CaseMode')}
                  style={{ flex: 1 }}
                />
                <Button
                  title="End early"
                  variant="ghost"
                  onPress={() => Alert.alert(
                    'Close booth?',
                    `Take all ${liveCards.length} cards off the floor and end the session.`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Close', style: 'destructive', onPress: () => checkOutMut.mutate() },
                    ],
                  )}
                  style={{ flex: 1 }}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>
              On the floor ({liveCards.length})
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BoothCardRow
            card={item}
            onTakeOff={() => takeOffMut.mutate(item.id)}
            onPriceChange={(price) => updatePriceMut.mutate({ cardId: item.id, price })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          cardsLoading ? null : (
            <View style={{ padding: Spacing.lg }}>
              <EmptyState
                icon="cube-outline"
                title="No cards on the floor"
                message="Add cards from your collection to make them visible to buyers walking by."
                action={{
                  label: 'Add cards',
                  onPress: () => navigation.navigate('CaseMode'),
                }}
              />
            </View>
          )
        }
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => { refetchMe(); refetchCards(); }}
            tintColor={Colors.text}
          />
        }
      />
    </SafeAreaView>
  );
};

const Stat = ({ label, value }) => (
  <View style={styles.statBlock}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const BoothCardRow = ({ card, onTakeOff, onPriceChange }) => {
  // Inline price edit. Local draft holds the raw input; commit on
  // blur if it's a valid number that differs from the saved price.
  const initial = card.display_asking_price ?? card.asking_price ?? '';
  const [draft, setDraft] = useState(initial !== '' && initial != null ? String(initial) : '');
  const [editing, setEditing] = useState(false);

  const commit = () => {
    setEditing(false);
    const parsed = draft.trim() ? Number(draft) : null;
    if (parsed === null || Number.isFinite(parsed)) {
      const baseline = card.display_asking_price ?? card.asking_price;
      if (parsed !== baseline) onPriceChange(parsed);
    } else {
      // bad input — reset to baseline
      const baseline = card.display_asking_price ?? card.asking_price;
      setDraft(baseline != null ? String(baseline) : '');
    }
  };

  const photo = card.image_front_url
    || (Array.isArray(card.photo_urls) ? card.photo_urls[0] : null)
    || card.front_image_url
    || null;
  const title = [card.year, card.set_name, card.player_name].filter(Boolean).join(' · ') || 'Card';
  const subtitle = [
    card.parallel,
    card.serial_number != null && card.print_run ? `${card.serial_number}/${card.print_run}` : null,
    card.condition,
  ].filter(Boolean).join(' · ');

  return (
    <View style={styles.cardRow}>
      {photo
        ? <Image source={{ uri: photo }} style={styles.cardImg} resizeMode="contain" />
        : <View style={[styles.cardImg, { backgroundColor: Colors.surface2 }]} />}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.cardSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Text style={styles.dollar}>$</Text>
          <TextInput
            style={styles.priceInput}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setEditing(true)}
            onBlur={commit}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={Colors.textMuted}
          />
          {editing ? (
            <TouchableOpacity onPress={commit} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => Alert.alert('Take off floor?', `${title} will no longer be visible to buyers.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take off', style: 'destructive', onPress: onTakeOff },
        ])}
        style={styles.takeOffBtn}
      >
        <Ionicons name="close-circle" size={26} color={Colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold,
    flex: 1, textAlign: 'center', marginHorizontal: Spacing.sm,
  },

  sessionCard: {
    margin: Spacing.base, padding: Spacing.lg,
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: 'rgba(232,197,71,0.45)', gap: Spacing.xs,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
  liveLabel: { color: '#ef4444', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  timeRemaining: { color: Colors.textMuted, fontSize: 12, marginLeft: 'auto' },
  eventName: {
    color: Colors.text, fontSize: 22, fontWeight: '700',
    fontFamily: Typography.display, marginTop: 4, letterSpacing: -0.3,
  },
  eventMeta: { color: Colors.textMuted, fontSize: 13 },
  statsRow: {
    flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md,
    paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  statBlock: { gap: 2 },
  statValue: {
    color: '#e8c547', fontSize: 20, fontWeight: '700',
    fontFamily: Typography.display, fontVariant: ['tabular-nums'],
  },
  statLabel: { color: Colors.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },

  sectionLabel: {
    color: Colors.textMuted, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
  },

  cardRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardImg: { width: 48, height: 66, borderRadius: 4, backgroundColor: Colors.surface2 },
  cardTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  cardSubtitle: { color: Colors.textMuted, fontSize: 12 },
  dollar: { color: '#e8c547', fontSize: 16, fontWeight: '700' },
  priceInput: {
    color: Colors.text, fontSize: 16, fontWeight: '600',
    fontVariant: ['tabular-nums'],
    paddingVertical: 0, minWidth: 60,
  },
  saveBtn: {
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: Colors.accent, borderRadius: 4,
  },
  saveBtnText: { color: Colors.bg, fontSize: 11, fontWeight: '700' },
  takeOffBtn: { padding: Spacing.xs },
});
