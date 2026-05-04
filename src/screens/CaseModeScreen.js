// Case Mode (Theme C) — collector mini-storefront for shows & meets.
// Pick cards to put in your case, set show-floor prices, optionally
// bulk-enable for a 48h session. QR codes on the case let buyers
// scan and see price + trade prefs without you pulling cards out.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Switch, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi, caseModeApi } from '../services/api';
import { Button, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const CaseModeScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-cards-case-mode'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  const cards = data?.cards || [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, body }) => caseModeApi.toggle(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-cards-case-mode'] }),
    onError: (e) => Alert.alert('Could not update', e.response?.data?.error || e.message),
  });

  const startSessionMutation = useMutation({
    mutationFn: (ids) => caseModeApi.startSession(ids, 48),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-cards-case-mode'] });
      Alert.alert('Show session started',
        `${res.data.enabled_count} cards live until ${new Date(res.data.expires_at).toLocaleString()}.`);
    },
  });

  const endSessionMutation = useMutation({
    mutationFn: () => caseModeApi.endSession(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['my-cards-case-mode'] });
      Alert.alert('Show session ended', `${res.data.disabled_count} cards taken off display.`);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      const t = `${c.player_name || ''} ${c.year || ''} ${c.set_name || ''} ${c.parallel || ''}`.toLowerCase();
      return t.includes(q);
    });
  }, [cards, search]);

  const activeCount = cards.filter((c) => c.display_mode_enabled).length;

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Case Mode</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.intro}>
        <Text style={styles.introTitle}>Run a mini-storefront at shows</Text>
        <Text style={styles.introBody}>
          Toggle a card on, set a show price, and put a Card Shop QR sticker on the front of your case.
          Buyers scan and see your price + trade prefs without you pulling the card out.
        </Text>
        <Text style={styles.activeCount}>
          {activeCount} {activeCount === 1 ? 'card' : 'cards'} currently in display mode
        </Text>
      </View>

      <View style={styles.sessionRow}>
        <Button
          title="Start 48h show session for all cards"
          variant="secondary"
          onPress={() => Alert.alert(
            'Start show session?',
            `Enable display mode on all ${cards.length} of your cards for 48 hours. They'll auto-disable after that.`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Start', onPress: () => startSessionMutation.mutate(cards.map((c) => c.id)) },
            ]
          )}
          style={{ flex: 1 }}
        />
      </View>
      {activeCount > 0 && (
        <View style={[styles.sessionRow, { paddingTop: 0 }]}>
          <Button
            title="End show session — take all off display"
            variant="ghost"
            onPress={() => Alert.alert('End session?', 'Disable display mode on all your cards now.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'End', style: 'destructive', onPress: () => endSessionMutation.mutate() },
            ])}
            style={{ flex: 1 }}
          />
        </View>
      )}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search your cards..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <CaseRow
            card={item}
            onToggle={(enabled, askingPrice, tradePrefs) => toggleMutation.mutate({
              id: item.id,
              body: {
                enabled,
                asking_price: askingPrice ? Number(askingPrice) : null,
                trade_prefs: tradePrefs || null,
              },
            })}
          />
        )}
        ListEmptyComponent={() => (
          <Text style={{ textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.xl }}>
            No cards match your search.
          </Text>
        )}
      />
    </SafeAreaView>
  );
};

const CaseRow = ({ card, onToggle }) => {
  const [enabled, setEnabled] = useState(!!card.display_mode_enabled);
  const [price, setPrice] = useState(card.display_asking_price?.toString() || card.asking_price?.toString() || '');
  const [tradePrefs, setTradePrefs] = useState(card.display_trade_prefs || '');
  const [expanded, setExpanded] = useState(!!card.display_mode_enabled);

  const title = [card.year, card.set_name, card.player_name].filter(Boolean).join(' · ') || 'Card';

  return (
    <View style={[styles.row, enabled && styles.rowActive]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {card.parallel ? `${card.parallel} · ` : ''}{card.condition || ''}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={(v) => {
          setEnabled(v);
          setExpanded(v);
          if (!v) onToggle(false, null, null);
        }}
      />
      {expanded && enabled && (
        <View style={styles.expandedSection}>
          <Text style={styles.fieldLabel}>Show floor price</Text>
          <TextInput
            style={styles.fieldInput}
            value={price}
            onChangeText={setPrice}
            placeholder="$ — leave blank for trade-only"
            placeholderTextColor={Colors.textMuted}
            keyboardType="decimal-pad"
          />
          <Text style={styles.fieldLabel}>Trade prefs (optional)</Text>
          <TextInput
            style={[styles.fieldInput, { minHeight: 60 }]}
            value={tradePrefs}
            onChangeText={setTradePrefs}
            placeholder="e.g. Looking for Pokemon Charizards, no offers under book"
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          <Button
            title="Save and put on display"
            onPress={() => onToggle(true, price, tradePrefs)}
            style={{ marginTop: Spacing.xs }}
          />
        </View>
      )}
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
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },

  intro: { padding: Spacing.base, gap: Spacing.xs },
  introTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold },
  introBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19 },
  activeCount: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold, marginTop: Spacing.xs },

  sessionRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    margin: Spacing.base, paddingHorizontal: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, paddingVertical: Spacing.sm, fontSize: Typography.base },

  row: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  rowActive: { borderColor: Colors.accent },
  rowTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  rowMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },

  expandedSection: { width: '100%', marginTop: Spacing.sm, gap: 4 },
  fieldLabel: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: Spacing.xs },
  fieldInput: {
    backgroundColor: Colors.bg, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm, paddingVertical: 8,
    fontSize: Typography.base,
  },
});
