// Owner-only sticker reprint request. Reached from CardDetail via
// "Request new sticker" button (only rendered when the viewing user
// is the current owner).
//
// Flow: pick a reason + capture shipping address → submit. Old
// sticker is immediately superseded on the server; admin queue
// handles physical fulfillment. Fee is $2 for a single reprint,
// recorded for charge once Stripe is enabled.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { stickerReprintApi } from '../services/api';
import { Button, Input, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const REASONS = [
  { key: 'damaged',           label: 'Damaged',         desc: 'Torn, bent, scratched beyond scan' },
  { key: 'lost',              label: 'Lost',            desc: 'Sticker missing / fell off' },
  { key: 'peeled',            label: 'Peeled off',      desc: 'Came off the sleeve / top loader' },
  { key: 'label_failure',     label: 'Print failure',   desc: 'Faded, blurry, or unscannable' },
  { key: 'transfer_received', label: 'Received via transfer', desc: 'Just got it, sticker is in bad shape' },
  { key: 'other',             label: 'Other',           desc: 'Explain in notes below' },
];

const FEE_CENTS = 200;

export const RequestReprintScreen = ({ navigation, route }) => {
  const { cardId, cardTitle } = route.params;
  const qc = useQueryClient();

  const [reason, setReason] = useState('damaged');
  const [reasonNote, setReasonNote] = useState('');
  const [ship, setShip] = useState({
    name: '', line1: '', line2: '', city: '', state: '', zip: '',
  });

  const submitMut = useMutation({
    mutationFn: () => stickerReprintApi.request(cardId, {
      reason,
      reason_note: reasonNote.trim() || undefined,
      ship_name: ship.name.trim(),
      ship_line1: ship.line1.trim(),
      ship_line2: ship.line2.trim() || undefined,
      ship_city: ship.city.trim(),
      ship_state: ship.state.trim(),
      ship_zip: ship.zip.trim(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['card', cardId] });
      Alert.alert(
        'Reprint requested',
        'The old sticker is deactivated. You\'ll get a notification when the replacement ships. Your card stays recorded in the ledger — no ownership change.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err) => {
      Alert.alert(
        'Could not submit',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  const canSubmit = !submitMut.isPending
    && ship.name.trim() && ship.line1.trim() && ship.city.trim()
    && ship.state.trim() && ship.zip.trim()
    && (reason !== 'other' || reasonNote.trim().length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Request new sticker"
        subtitle={cardTitle}
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />

      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>How this works</Text>
          <Text style={styles.infoBody}>
            Your old sticker is deactivated the moment you submit this. If someone scans it, they'll see
            "outdated — a replacement was issued." Your card record stays intact — ownership and history don't change.
            We print the new sticker, ship it to you, and you apply it to your top loader. Fee: ${(FEE_CENTS / 100).toFixed(2)}.
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Reason</Text>
        {REASONS.map((r) => (
          <TouchableOpacity
            key={r.key}
            style={[styles.reasonRow, reason === r.key && styles.reasonRowOn]}
            onPress={() => setReason(r.key)}
          >
            <Ionicons
              name={reason === r.key ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={reason === r.key ? Colors.accent : Colors.textMuted}
            />
            <View style={{ marginLeft: Spacing.sm, flex: 1 }}>
              <Text style={styles.reasonLabel}>{r.label}</Text>
              <Text style={styles.reasonDesc}>{r.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {reason === 'other' ? (
          <Input
            placeholder="Tell us what happened"
            value={reasonNote}
            onChangeText={setReasonNote}
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
          />
        ) : null}

        <Text style={styles.sectionLabel}>Ship replacement to</Text>
        <Input placeholder="Full name" value={ship.name} onChangeText={(v) => setShip((s) => ({ ...s, name: v }))} autoCapitalize="words" />
        <Input placeholder="Street address" value={ship.line1} onChangeText={(v) => setShip((s) => ({ ...s, line1: v }))} />
        <Input placeholder="Apartment / suite (optional)" value={ship.line2} onChangeText={(v) => setShip((s) => ({ ...s, line2: v }))} />
        <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
          <View style={{ flex: 2 }}>
            <Input placeholder="City" value={ship.city} onChangeText={(v) => setShip((s) => ({ ...s, city: v }))} autoCapitalize="words" />
          </View>
          <View style={{ flex: 1 }}>
            <Input placeholder="State" value={ship.state} onChangeText={(v) => setShip((s) => ({ ...s, state: v }))} autoCapitalize="characters" />
          </View>
          <View style={{ flex: 1 }}>
            <Input placeholder="ZIP" value={ship.zip} onChangeText={(v) => setShip((s) => ({ ...s, zip: v }))} keyboardType="number-pad" />
          </View>
        </View>

        <Button
          title={submitMut.isPending ? 'Submitting…' : `Submit — $${(FEE_CENTS / 100).toFixed(2)}`}
          onPress={() => submitMut.mutate()}
          disabled={!canSubmit}
          style={{ marginTop: Spacing.lg }}
        />
        <Text style={styles.disclaimer}>
          Fee recorded now; charged once billing is live on your account. Fraud-pattern detection may flag this
          request for admin review (3+ reprints on the same card, new-transfer abuse, etc.).
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  infoBox: {
    backgroundColor: Colors.accent + '15',
    borderColor: Colors.accent + '55',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoTitle: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold, marginBottom: 4 },
  infoBody: { color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 18 },
  sectionLabel: {
    color: Colors.textMuted, fontSize: Typography.xs,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: Spacing.md, marginBottom: Spacing.xs, fontWeight: Typography.semibold,
  },
  reasonRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.md, marginBottom: Spacing.xs,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  reasonRowOn: { borderColor: Colors.accent },
  reasonLabel: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  reasonDesc: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  disclaimer: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: Spacing.md,
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
