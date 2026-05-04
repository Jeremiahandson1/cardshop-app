// Buyer-files-stalled-report screen (Theme E5).
// Reachable from a CSTX detail screen when the deal is past the
// 5-day shipping SLA and the seller hasn't progressed.
//
// Flow:
//   - Form: reason text
//   - Submit → POST /api/stalled-transfers
//   - Server enforces the 6-day eligibility window; we show a clear
//     error message if too early.

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '../components/ui';
import { stalledTransfersApi } from '../services/api';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const StalledTransferReportScreen = ({ navigation, route }) => {
  const { transactionId, transferId } = route.params || {};
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => stalledTransfersApi.file({
      cstx_id: transactionId,
      transfer_id: transferId,
      reason: reason.trim(),
    }),
    onSuccess: () => {
      Alert.alert(
        'Report filed',
        'The seller has 72 hours to respond before this goes to admin review. If admin agrees the seller has abandoned the deal, we will transfer the card to you using our chain-of-custody record.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (e) => {
      const data = e.response?.data;
      if (data?.eligible_at) {
        const date = new Date(data.eligible_at).toLocaleDateString();
        Alert.alert('Too early', `Sellers have 5 days to ship. You can file this report on ${date}.`);
      } else {
        Alert.alert('Could not file report', data?.error || e.message);
      }
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Report stalled transfer</Text>
        <Text style={styles.body}>
          Sellers must ship within <Text style={styles.bold}>5 days</Text>. If the
          seller missed the deadline and isn't responding, you can file this
          report. The seller has 72 hours to respond before admin review.
        </Text>

        <View style={styles.calloutGreen}>
          <Text style={styles.calloutTitle}>What happens next</Text>
          <Text style={styles.calloutBody}>
            • Seller is notified — 72h to respond or ship{'\n'}
            • If unresolved, admin reviews the chain (offer, payment, audit){'\n'}
            • If seller has abandoned: <Text style={styles.bold}>we transfer the card to you</Text>{'\n'}
            • Seller is flagged on their public trust profile
          </Text>
        </View>

        <Input
          label="Why are you reporting this?"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. Seller hasn't shipped, no response to messages for 4 days..."
          multiline
          numberOfLines={4}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
        />

        <Button
          title="File report"
          onPress={() => {
            if (reason.trim().length < 10) {
              Alert.alert('More detail required', 'Please describe what happened in at least a sentence.');
              return;
            }
            mutation.mutate();
          }}
          loading={mutation.isPending}
          style={{ marginTop: Spacing.lg }}
        />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={{ marginTop: Spacing.sm }}
        />

        <Text style={styles.fineprint}>
          Filing a false report can result in your account being flagged and your
          chain-of-custody history annotated. We have receipts on every action.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  scrollContent: { padding: Spacing.base, paddingBottom: Spacing.xxl },
  title: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, marginBottom: Spacing.sm },
  body: { color: Colors.textMuted, fontSize: Typography.base, lineHeight: 22, marginBottom: Spacing.lg },
  bold: { fontWeight: Typography.bold, color: Colors.text },

  calloutGreen: {
    backgroundColor: Colors.surface, borderColor: Colors.success, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.base, marginBottom: Spacing.lg,
  },
  calloutTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold, marginBottom: Spacing.xs },
  calloutBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 20 },

  fineprint: {
    color: Colors.textMuted, fontSize: Typography.xs, lineHeight: 16,
    marginTop: Spacing.lg, fontStyle: 'italic', textAlign: 'center',
  },
});
