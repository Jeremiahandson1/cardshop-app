// Cardholder review of stolen-card eBay match candidates (Theme F1).
//
// Reachable from a "possible match found" push notification. Shows
// eBay listing photo + cardholder's registered photos side-by-side
// with the match reasons. Cardholder confirms or dismisses; only
// they have intimate knowledge of their card's specific identity.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stolenMatchesApi } from '../services/api';
import { Button, LoadingScreen, EmptyState } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const StolenMatchReviewScreen = ({ navigation }) => {
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-stolen-matches'],
    queryFn: () => stolenMatchesApi.mine().then((r) => r.data),
  });

  const confirmMut = useMutation({
    mutationFn: ({ id, notes }) => stolenMatchesApi.ownerConfirm(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-stolen-matches'] });
      Alert.alert('Confirmed', 'We\'ll file a takedown report. You\'ll be notified when there\'s an update.');
    },
    onError: (e) => Alert.alert('Error', e.response?.data?.error || e.message),
  });

  const dismissMut = useMutation({
    mutationFn: ({ id, notes }) => stolenMatchesApi.ownerDismiss(id, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-stolen-matches'] }),
    onError: (e) => Alert.alert('Error', e.response?.data?.error || e.message),
  });

  if (isLoading) return <LoadingScreen />;

  const candidates = data?.candidates || [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Possible matches</Text>
        <View style={{ width: 22 }} />
      </View>

      {candidates.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matches awaiting review"
          message="When our system spots one of your stolen cards on eBay, you'll see it here."
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 }}>
          <Text style={styles.intro}>
            We may have spotted your stolen card on eBay. Compare carefully — you know this card best.
            If it's yours, we'll handle the takedown.
          </Text>

          {candidates.map((c) => (
            <Candidate
              key={c.id}
              c={c}
              onConfirm={(notes) => confirmMut.mutate({ id: c.id, notes })}
              onDismiss={(notes) => dismissMut.mutate({ id: c.id, notes })}
              loading={confirmMut.isPending || dismissMut.isPending}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const Candidate = ({ c, onConfirm, onDismiss, loading }) => {
  const myPhoto = c.image_front_url || c.catalog_image;
  const cardLabel = [c.year, c.set_name, c.player_name].filter(Boolean).join(' · ');
  const reasons = c.match_reason || {};
  const reasonChips = [];
  if (reasons.cert_match) reasonChips.push(`cert ${reasons.cert_match}`);
  if (reasons.serial_match) reasonChips.push(`serial ${reasons.serial_match}`);
  if (Array.isArray(reasons.keywords)) reasonChips.push(`${reasons.keywords.length}/4 keywords`);
  if (reasons.grade) reasonChips.push(`grader ${reasons.grade}`);

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{cardLabel}</Text>
      {(c.cert_number || c.serial_number) && (
        <Text style={styles.cardMeta}>
          {c.cert_number && `Cert #${c.cert_number}`}
          {c.cert_number && c.serial_number && ' · '}
          {c.serial_number && `/${c.serial_number}`}
          {c.grading_company && ` · ${c.grading_company.toUpperCase()} ${c.grade || ''}`}
        </Text>
      )}

      <View style={styles.compareRow}>
        <View style={styles.compareSide}>
          <Text style={styles.sideLabel}>Your card</Text>
          {myPhoto ? <Image source={{ uri: myPhoto }} style={styles.compareImage} resizeMode="contain" /> :
            <View style={[styles.compareImage, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
            </View>}
        </View>
        <View style={styles.compareSide}>
          <Text style={styles.sideLabel}>eBay listing</Text>
          {c.source_image_url ? <Image source={{ uri: c.source_image_url }} style={styles.compareImage} resizeMode="contain" /> :
            <View style={[styles.compareImage, { alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={28} color={Colors.textMuted} />
            </View>}
        </View>
      </View>

      <Text style={styles.listingTitle}>{c.source_title || 'Untitled listing'}</Text>
      <Text style={styles.listingMeta}>
        {c.source_price && `$${Number(c.source_price).toFixed(2)}`}
        {c.source_price && c.source_seller && ' · '}
        {c.source_seller && `seller @${c.source_seller}`}
      </Text>

      <View style={styles.reasonRow}>
        {reasonChips.map((r, i) => (
          <View key={i} style={styles.reasonChip}>
            <Text style={styles.reasonChipText}>{r}</Text>
          </View>
        ))}
        <View style={[styles.reasonChip, { backgroundColor: Colors.accent + '30' }]}>
          <Text style={[styles.reasonChipText, { color: Colors.accent }]}>
            confidence {(c.match_score * 100).toFixed(0)}%
          </Text>
        </View>
      </View>

      <TouchableOpacity onPress={() => Linking.openURL(c.source_url)} style={styles.viewListingBtn}>
        <Ionicons name="open-outline" size={14} color={Colors.accent} />
        <Text style={styles.viewListingText}>View on eBay</Text>
      </TouchableOpacity>

      <View style={styles.actionRow}>
        <Button
          title="Not mine"
          variant="secondary"
          onPress={() => Alert.alert(
            'Dismiss match?',
            'We won\'t pursue this listing.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Dismiss', onPress: () => onDismiss('') },
            ]
          )}
          disabled={loading}
          style={{ flex: 1 }}
        />
        <Button
          title="Yes, my card"
          onPress={() => Alert.alert(
            'Confirm this is your card?',
            'We\'ll file a takedown report and notify you when there\'s an update.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Confirm', onPress: () => onConfirm('') },
            ]
          )}
          loading={loading}
          style={{ flex: 1 }}
        />
      </View>
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

  intro: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19 },

  card: {
    backgroundColor: Colors.surface, borderColor: Colors.accent3, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.xs,
  },
  cardLabel: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  cardMeta: { color: Colors.textMuted, fontSize: Typography.xs },

  compareRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  compareSide: { flex: 1, gap: 4 },
  sideLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, textAlign: 'center' },
  compareImage: { aspectRatio: 0.72, borderRadius: Radius.sm, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border },

  listingTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold, marginTop: Spacing.sm },
  listingMeta: { color: Colors.textMuted, fontSize: Typography.xs },

  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: Spacing.xs },
  reasonChip: {
    backgroundColor: Colors.bg, borderColor: Colors.border, borderWidth: 1,
    borderRadius: Radius.sm, paddingHorizontal: 6, paddingVertical: 2,
  },
  reasonChipText: { color: Colors.textMuted, fontSize: 11 },

  viewListingBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    padding: 8, borderRadius: Radius.sm, marginTop: Spacing.xs,
    borderWidth: 1, borderColor: Colors.accent + '40', backgroundColor: Colors.accent + '10',
  },
  viewListingText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
});
