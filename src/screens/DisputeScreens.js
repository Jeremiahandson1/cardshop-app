import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Alert, RefreshControl
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cstxApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, EmptyState, LoadingScreen, SectionHeader, Divider } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// DISPUTE LIST SCREEN
// ============================================================
export const DisputeListScreen = ({ navigation }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-transactions', 'disputed'],
    queryFn: () => cstxApi.mine({ status: 'disputed' }).then((r) => r.data),
  });

  const disputes = data?.transactions || [];

  if (isLoading) return <LoadingScreen message="Loading disputes..." />;

  const getStatusColor = (resolution) => ({
    pending: Colors.warning,
    resolved_buyer: Colors.success,
    resolved_seller: Colors.success,
    escalated: Colors.accent3,
    appealed: Colors.info,
  }[resolution] || Colors.warning);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Disputes</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={disputes}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.disputeItem}
            onPress={() => navigation.navigate('DisputeDetail', { transactionId: item.id })}
          >
            <View style={[styles.disputeIcon, { backgroundColor: getStatusColor(item.dispute_resolution) + '22' }]}>
              <Ionicons name="warning" size={18} color={getStatusColor(item.dispute_resolution)} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.disputeTitle}>CSTX {item.cstx_id || item.id}</Text>
              <Text style={styles.disputeMeta}>
                {item.dispute_reason || 'Dispute filed'}
              </Text>
              <Text style={styles.disputeDate}>
                {item.disputed_at ? new Date(item.disputed_at).toLocaleDateString() : ''}
              </Text>
            </View>
            <View style={[styles.disputeStatusBadge, { borderColor: getStatusColor(item.dispute_resolution) }]}>
              <Text style={[styles.disputeStatusText, { color: getStatusColor(item.dispute_resolution) }]}>
                {item.dispute_resolution || 'Pending'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="🛡️"
            title="No active disputes"
            message="You have no open disputes. If you encounter an issue with a transaction, you can file a dispute from the transaction screen."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// DISPUTE DETAIL SCREEN
// ============================================================
export const DisputeDetailScreen = ({ navigation, route }) => {
  const { transactionId } = route.params;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState('');

  const { data: tx, isLoading } = useQuery({
    queryKey: ['transaction', transactionId],
    queryFn: () => cstxApi.get(transactionId).then((r) => r.data),
  });

  const disputeMutation = useMutation({
    mutationFn: (data) => cstxApi.dispute(transactionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', transactionId] });
      queryClient.invalidateQueries({ queryKey: ['my-transactions'] });
      Alert.alert('Dispute Filed', 'Your dispute has been submitted for review.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to file dispute'),
  });

  if (isLoading || !tx) return <LoadingScreen />;

  const isDisputed = tx.status === 'disputed';
  const dispute = tx.dispute || {};

  const DISPUTE_REASONS = [
    { key: 'item_not_received', label: 'Item Not Received' },
    { key: 'item_not_as_described', label: 'Item Not As Described' },
    { key: 'wrong_item', label: 'Wrong Item Received' },
    { key: 'damaged_in_transit', label: 'Damaged In Transit' },
    { key: 'payment_issue', label: 'Payment Issue' },
    { key: 'other', label: 'Other' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isDisputed ? 'Dispute Details' : 'Report Problem'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 100 }}>
        {/* Transaction info */}
        <View style={styles.txInfoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>CSTX ID</Text>
            <Text style={[styles.infoValue, { fontFamily: 'Courier' }]}>{tx.cstx_id || tx.id}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Amount</Text>
            <Text style={[styles.infoValue, { color: Colors.accent }]}>${tx.amount || '0'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{tx.status?.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {/* If already disputed, show details */}
        {isDisputed && (
          <>
            {/* Dispute info */}
            <View>
              <SectionHeader title="Dispute Information" />
              <View style={styles.disputeDetailCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reason</Text>
                  <Text style={styles.infoValue}>
                    {dispute.reason?.replace(/_/g, ' ')?.replace(/\b\w/g, (l) => l.toUpperCase()) || 'N/A'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Filed By</Text>
                  <Text style={styles.infoValue}>{dispute.filed_by_username || 'N/A'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Date Filed</Text>
                  <Text style={styles.infoValue}>
                    {dispute.created_at ? new Date(dispute.created_at).toLocaleDateString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Resolution</Text>
                  <Text style={[styles.infoValue, { color: Colors.warning }]}>
                    {dispute.resolution || 'Pending Review'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Evidence */}
            {dispute.evidence && (
              <View>
                <SectionHeader title="Evidence" />
                <View style={styles.evidenceCard}>
                  <Text style={styles.evidenceText}>{dispute.evidence}</Text>
                </View>
              </View>
            )}

            {/* Resolution details */}
            {dispute.resolution_details && (
              <View>
                <SectionHeader title="Resolution" />
                <View style={styles.resolutionCard}>
                  <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                  <Text style={styles.resolutionText}>{dispute.resolution_details}</Text>
                </View>
              </View>
            )}

            {/* Appeal flow isn't built yet. Hide the card entirely
                rather than showing a 'Coming soon' button — users
                with an unsatisfying resolution shouldn't see a
                false promise. They can email support@twomiah.com
                directly while we build the in-app flow. */}
          </>
        )}

        {/* File new dispute form */}
        {!isDisputed && (
          <>
            <View>
              <SectionHeader title="Reason" />
              <View style={styles.reasonGrid}>
                {DISPUTE_REASONS.map((r) => (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.reasonBtn, reason === r.key && styles.reasonBtnActive]}
                    onPress={() => setReason(r.key)}
                  >
                    <Text style={[styles.reasonBtnText, reason === r.key && styles.reasonBtnTextActive]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <Input
              label="Evidence / Description"
              value={evidence}
              onChangeText={setEvidence}
              placeholder="Describe the issue in detail. Include any relevant information..."
              multiline
              numberOfLines={5}
            />

            <View style={styles.warningBox}>
              <Ionicons name="alert-circle" size={16} color={Colors.warning} />
              <Text style={styles.warningText}>
                Filing a false dispute may result in account restrictions. Please provide accurate information.
              </Text>
            </View>

            <Button
              title="File Dispute"
              variant="danger"
              onPress={() => {
                if (!reason) {
                  Alert.alert('Required', 'Please select a reason for the dispute.');
                  return;
                }
                Alert.alert('File Dispute', 'Are you sure you want to file a dispute?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'File Dispute',
                    style: 'destructive',
                    onPress: () => disputeMutation.mutate({
                      reason,
                      evidence: evidence.trim() || undefined,
                    }),
                  },
                ]);
              }}
              loading={disputeMutation.isPending}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, flex: 1, textAlign: 'center' },

  // Dispute list
  disputeItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  disputeIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  disputeTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold, fontFamily: 'Courier' },
  disputeMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  disputeDate: { color: Colors.textDim, fontSize: Typography.xs, marginTop: 1 },
  disputeStatusBadge: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  disputeStatusText: { fontSize: Typography.xs, fontWeight: Typography.semibold, textTransform: 'capitalize' },

  // Detail
  txInfoCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  infoLabel: { color: Colors.textMuted, fontSize: Typography.sm },
  infoValue: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  disputeDetailCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  evidenceCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  evidenceText: { color: Colors.text, fontSize: Typography.sm, lineHeight: 20 },
  resolutionCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.success + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.success + '40', padding: Spacing.md,
  },
  resolutionText: { color: Colors.text, fontSize: Typography.sm, lineHeight: 20, flex: 1 },
  appealCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.info + '40', padding: Spacing.xl,
    alignItems: 'center',
  },
  appealTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold, marginTop: Spacing.sm },
  appealDesc: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', marginTop: Spacing.xs },

  // File dispute form
  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  reasonBtnActive: { borderColor: Colors.accent3, backgroundColor: Colors.accent3 + '15' },
  reasonBtnText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  reasonBtnTextActive: { color: Colors.accent3, fontWeight: Typography.semibold },
  warningBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.warning + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.warning + '40', padding: Spacing.md,
  },
  warningText: { color: Colors.textMuted, fontSize: Typography.sm, flex: 1, lineHeight: 18 },
});
