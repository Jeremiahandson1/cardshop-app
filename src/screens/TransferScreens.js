import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import NfcManager, { NfcTech } from 'react-native-nfc-manager';
import { useMutation, useQuery } from '@tanstack/react-query';
import { transfersApi, cardsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const InitiateTransferScreen = ({ navigation, route }) => {
  const { cardId } = route.params;
  const user = useAuthStore((s) => s.user);

  const [method, setMethod] = useState('standard'); // 'standard' | 'nfc'
  const [recipientUsername, setRecipientUsername] = useState('');
  const [price, setPrice] = useState('');
  const [nfcReady, setNfcReady] = useState(false);
  const [nfcScanning, setNfcScanning] = useState(false);

  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => cardsApi.get(cardId).then((r) => r.data),
  });

  // Check NFC availability
  useEffect(() => {
    NfcManager.isSupported().then((supported) => {
      if (supported) {
        NfcManager.start().then(() => setNfcReady(true)).catch(() => {});
      }
    });
    return () => { NfcManager.cancelTechnologyRequest().catch(() => {}); };
  }, []);

  const transferMutation = useMutation({
    mutationFn: (data) => transfersApi.initiate(data),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Transfer Initiated',
        'The recipient will be notified and needs to accept the transfer.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'Transfer failed');
    },
  });

  const nfcMutation = useMutation({
    mutationFn: (data) => transfersApi.nfc(data),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Transfer Complete!', 'Card ownership transferred via NFC.', [
        { text: 'Done', onPress: () => navigation.goBack() }
      ]);
      NfcManager.cancelTechnologyRequest().catch(() => {});
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'NFC transfer failed');
      setNfcScanning(false);
      NfcManager.cancelTechnologyRequest().catch(() => {});
    },
  });

  const startNFCScan = async () => {
    setNfcScanning(true);
    try {
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      
      // Read user ID from the NFC tag written by the other person's app
      const userId = tag?.ndefMessage?.[0]?.payload
        ? String.fromCharCode(...tag.ndefMessage[0].payload).replace('\u0000', '').replace('\x02en', '')
        : null;

      if (!userId) {
        Alert.alert('Error', 'Could not read user info from NFC tag');
        setNfcScanning(false);
        return;
      }

      // Complete the transfer
      nfcMutation.mutate({
        owned_card_id: cardId,
        to_user_id: userId,
        sale_price: price ? parseFloat(price) : undefined,
        nfc_session_id: `nfc-${Date.now()}`,
      });
    } catch (err) {
      if (err.message !== 'cancelled') {
        Alert.alert('NFC Error', 'Could not complete NFC transfer. Make sure both phones support NFC.');
      }
      setNfcScanning(false);
    }
  };

  const handleStandardTransfer = () => {
    if (!recipientUsername.trim()) {
      Alert.alert('Required', 'Please enter the recipient username');
      return;
    }
    transferMutation.mutate({
      owned_card_id: cardId,
      to_username: recipientUsername.trim(),
      method: 'in_person',
      sale_price: price ? parseFloat(price) : undefined,
    });
  };

  if (!card) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer Card</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.lg, paddingBottom: 100 }}>
        {/* Card preview */}
        <View style={styles.cardPreview}>
          <Text style={{ fontSize: 28 }}>🃏</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{card.player_name}</Text>
            <Text style={styles.cardSub}>{card.year} {card.set_name}</Text>
          </View>
          <Ionicons name="swap-horizontal" size={20} color={Colors.accent} />
        </View>

        {/* Method selector */}
        <View>
          <Text style={styles.sectionLabel}>TRANSFER METHOD</Text>
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodBtn, method === 'standard' && styles.methodBtnActive]}
              onPress={() => setMethod('standard')}
            >
              <Ionicons name="person" size={20} color={method === 'standard' ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.methodLabel, method === 'standard' && { color: Colors.accent }]}>Username</Text>
              <Text style={styles.methodDesc}>Enter their username</Text>
            </TouchableOpacity>

            {nfcReady && (
              <TouchableOpacity
                style={[styles.methodBtn, method === 'nfc' && styles.methodBtnActive]}
                onPress={() => setMethod('nfc')}
              >
                <Ionicons name="radio" size={20} color={method === 'nfc' ? Colors.accent2 : Colors.textMuted} />
                <Text style={[styles.methodLabel, method === 'nfc' && { color: Colors.accent2 }]}>NFC Tap</Text>
                <Text style={styles.methodDesc}>Touch phones together</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Sale price */}
        <Input
          label="Sale Price (optional — leave blank for trade/gift)"
          value={price}
          onChangeText={setPrice}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        {/* Method-specific UI */}
        {method === 'standard' && (
          <View>
            <Input
              label="Recipient Username"
              value={recipientUsername}
              onChangeText={setRecipientUsername}
              placeholder="their_username"
              autoCapitalize="none"
            />
            <Button
              title="Send Transfer Request"
              onPress={handleStandardTransfer}
              loading={transferMutation.isPending}
            />
          </View>
        )}

        {method === 'nfc' && (
          <View style={styles.nfcArea}>
            {nfcScanning ? (
              <View style={styles.nfcScanning}>
                <ActivityIndicator size="large" color={Colors.accent2} />
                <Text style={styles.nfcScanningText}>Waiting for NFC tap...</Text>
                <Text style={styles.nfcScanningHint}>Hold phones back-to-back</Text>
                <TouchableOpacity
                  style={styles.cancelNfc}
                  onPress={() => {
                    NfcManager.cancelTechnologyRequest().catch(() => {});
                    setNfcScanning(false);
                  }}
                >
                  <Text style={{ color: Colors.textMuted }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nfcReady}>
                <View style={styles.nfcIcon}>
                  <Ionicons name="radio" size={40} color={Colors.accent2} />
                </View>
                <Text style={styles.nfcTitle}>NFC Transfer</Text>
                <Text style={styles.nfcDesc}>
                  Both parties need to have the app open. The recipient goes to their profile and taps "Receive via NFC". Then touch phones back-to-back.
                </Text>
                <Button
                  title="Start NFC Scan"
                  variant="teal"
                  onPress={startNFCScan}
                  style={{ marginTop: Spacing.lg }}
                />
              </View>
            )}
          </View>
        )}

        {/* Important note */}
        <View style={styles.noteBox}>
          <Ionicons name="information-circle" size={16} color={Colors.info} />
          <Text style={styles.noteText}>
            {method === 'nfc'
              ? 'NFC transfers complete instantly when both parties confirm.'
              : 'The recipient must accept the transfer. Ownership does not change until they confirm.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// PENDING TRANSFERS SCREEN
// ============================================================
export const TransfersScreen = ({ navigation }) => {
  const { data: transfers, isLoading, refetch } = useQuery({
    queryKey: ['my-transfers'],
    queryFn: () => transfersApi.mine({ limit: 50 }).then((r) => r.data),
  });

  const acceptMutation = useMutation({
    mutationFn: (id) => transfersApi.accept(id),
    onSuccess: () => refetch(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => transfersApi.cancel(id),
    onSuccess: () => refetch(),
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: (id) => transfersApi.confirmDelivery(id),
    onSuccess: () => refetch(),
  });

  if (isLoading) return <LoadingScreen />;

  const pending = (transfers || []).filter((t) => ['pending_acceptance','pending_delivery'].includes(t.status));
  const history = (transfers || []).filter((t) => ['completed', 'cancelled', 'disputed'].includes(t.status));

  const TransferItem = ({ t }) => (
    <View style={styles.transferItem}>
      <View style={styles.transferDir}>
        <Ionicons
          name={t.direction === 'sent' ? 'arrow-up' : 'arrow-down'}
          size={16}
          color={t.direction === 'sent' ? Colors.accent3 : Colors.accent2}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.transferCard}>{t.player_name} {t.year} {t.set_name}</Text>
        <Text style={styles.transferMeta}>
          {t.direction === 'sent' ? 'Sent' : 'Received'} · {t.method?.replace(/_/g,' ') || t.method}
          {t.sale_price ? ` · $${t.sale_price}` : ''}
        </Text>
        <Text style={styles.transferDate}>{new Date(t.initiated_at).toLocaleDateString()}</Text>
      </View>
      {t.status === 'pending_acceptance' && t.direction === 'received' && (
        <View style={{ gap: Spacing.sm }}>
          <TouchableOpacity
            style={styles.acceptBtn}
            onPress={() => acceptMutation.mutate(t.id)}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => cancelMutation.mutate(t.id)}>
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, textAlign: 'center' }}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
      {t.status === 'pending_delivery' && t.direction === 'received' && (
        <TouchableOpacity
          style={[styles.acceptBtn, { backgroundColor: Colors.accent2 + '22', borderColor: Colors.accent2 }]}
          onPress={() => Alert.alert('Confirm Delivery', 'Mark this transfer as delivered?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm', onPress: () => confirmDeliveryMutation.mutate(t.id) },
          ])}
        >
          <Text style={[styles.acceptText, { color: Colors.accent2 }]}>Confirm</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.md }}>
        <Text style={styles.pageTitle}>Transfers</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}>
        {pending.length > 0 && (
          <View>
            <Text style={styles.sectionLabel}>PENDING</Text>
            {pending.map((t) => <TransferItem key={t.id} t={t} />)}
          </View>
        )}
        {history.length > 0 && (
          <View>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>HISTORY</Text>
            {history.map((t) => <TransferItem key={t.id} t={t} />)}
          </View>
        )}
        {!pending.length && !history.length && (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Text style={{ fontSize: 40, marginBottom: Spacing.md }}>↔️</Text>
            <Text style={{ color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold }}>No transfers yet</Text>
            <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm }}>Your transfer history will appear here</Text>
          </View>
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
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  pageTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.heavy },
  cardPreview: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  cardName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  cardSub: { color: Colors.textMuted, fontSize: Typography.sm },
  sectionLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.sm },
  methodRow: { flexDirection: 'row', gap: Spacing.sm },
  methodBtn: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center', gap: 4,
  },
  methodBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  methodLabel: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  methodDesc: { color: Colors.textMuted, fontSize: Typography.xs, textAlign: 'center' },
  nfcArea: { backgroundColor: Colors.surface, borderRadius: Radius.xl, borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl },
  nfcScanning: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.xl },
  nfcScanningText: { color: Colors.accent2, fontSize: Typography.lg, fontWeight: Typography.semibold },
  nfcScanningHint: { color: Colors.textMuted, fontSize: Typography.sm },
  cancelNfc: { marginTop: Spacing.md },
  nfcReady: { alignItems: 'center' },
  nfcIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent2 + '22', borderWidth: 1, borderColor: Colors.accent2,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  nfcTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: Spacing.sm },
  nfcDesc: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', lineHeight: 20 },
  noteBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.info + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.info + '40', padding: Spacing.md,
  },
  noteText: { color: Colors.textMuted, fontSize: Typography.sm, flex: 1, lineHeight: 18 },
  transferItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  transferDir: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  transferCard: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  transferMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, textTransform: 'capitalize' },
  transferDate: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 1 },
  acceptBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accent + '22',
  },
  acceptText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.bold },
});
