import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transfersApi, cardsApi, safetyApi } from '../services/api';
import { ChainOfCustody } from '../components/ChainOfCustody';
import { useAuthStore } from '../store/authStore';
import { Button, Input, LoadingScreen, LogoMark } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const InitiateTransferScreen = ({ navigation, route }) => {
  const { cardId } = route.params;
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [recipientUsername, setRecipientUsername] = useState('');
  const [price, setPrice] = useState('');
  // Only one transfer method is wired up today (username), but the
  // JSX still has the picker scaffold + `method === 'standard'`
  // checks. Without this state the screen throws "Property 'method'
  // does not exist" the moment it renders.
  const [method, setMethod] = useState('standard');

  const { data: card } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => cardsApi.get(cardId).then((r) => r.data),
  });

  // Trust flags on the recipient. Look up after the user types a
  // username; debounce a tick so we don't spam on every keystroke.
  const trimmedRecipient = recipientUsername.trim();
  const { data: trustFlags } = useQuery({
    queryKey: ['trust-flags', trimmedRecipient],
    queryFn: () => safetyApi.trustFlags(trimmedRecipient).then((r) => r.data),
    enabled: trimmedRecipient.length >= 3,
    retry: false,
  });

  const transferMutation = useMutation({
    mutationFn: (data) => transfersApi.initiate(data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['my-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      // Skip the modal-tap intermission — the card-detail screen we
      // bounce back to renders a "Transfer in progress · waiting for
      // X" banner the moment the refetch lands, which is the same
      // confirmation the alert used to provide. One less tap, no
      // perceived lag.
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'Transfer failed');
    },
  });

  // QR transfer: create a single-use offer, then show the QR for the
  // buyer to scan in person. Ownership only flips when they claim it.
  const qrMutation = useMutation({
    mutationFn: (data) => transfersApi.createQrOffer(data).then((r) => r.data),
    onSuccess: (offer) => {
      navigation.navigate('ShowTransferQR', {
        cardId,
        offer,
        cardName: card.player_name,
        cardSub: `${card.year || ''} ${card.set_name || ''}`.trim(),
      });
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'Could not create the QR code');
    },
  });

  const handleGenerateQr = () => {
    const numericPrice = price ? parseFloat(price) : undefined;
    qrMutation.mutate({ owned_card_id: cardId, sale_price: numericPrice });
  };

  const handleStandardTransfer = () => {
    if (!recipientUsername.trim()) {
      Alert.alert('Required', 'Please enter the recipient username');
      return;
    }
    const numericPrice = price ? parseFloat(price) : undefined;
    const payload = {
      owned_card_id: cardId,
      to_username: recipientUsername.trim(),
      method: 'in_person',
      sale_price: numericPrice,
    };

    // Video gate disclaimer (Theme E2). For $200+ shipped transfers,
    // both parties have to record video; the user needs to know
    // before initiating.
    if (numericPrice && numericPrice >= 200) {
      Alert.alert(
        'Heads up — videos required at $200+',
        `This transfer is $${numericPrice.toFixed(0)}. Both you and the recipient will need to record pack-out and unpack videos. You can't open a dispute without yours.\n\nContinue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => transferMutation.mutate(payload) },
        ]
      );
      return;
    }
    transferMutation.mutate(payload);
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
        {/* Card preview — prefer the owner's uploaded photo, then
            the catalog stock image, fall back to the logo only when
            neither exists. Same priority as CardDetailScreen so the
            transfer screen feels like a continuation of the card view. */}
        {(() => {
          const ownPhotos = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
          const thumb = ownPhotos[0] || card.own_image_front || card.front_image_url || null;
          return (
            <View style={styles.cardPreview}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.cardThumb} resizeMode="cover" />
              ) : (
                <LogoMark size={40} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{card.player_name}</Text>
                <Text style={styles.cardSub}>{card.year} {card.set_name}</Text>
              </View>
              <Ionicons name="swap-horizontal" size={20} color={Colors.accent} />
            </View>
          );
        })()}

        {/* Chain of custody — see the card's history before handing it off */}
        <ChainOfCustody cardId={cardId} navigation={navigation} style={{ marginBottom: Spacing.md }} />

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

            <TouchableOpacity
              style={[styles.methodBtn, method === 'qr' && styles.methodBtnActive]}
              onPress={() => setMethod('qr')}
            >
              <Ionicons name="qr-code" size={20} color={method === 'qr' ? Colors.accent : Colors.textMuted} />
              <Text style={[styles.methodLabel, method === 'qr' && { color: Colors.accent }]}>QR code</Text>
              <Text style={styles.methodDesc}>Buyer scans in person</Text>
            </TouchableOpacity>
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
            {/* Bad-actor flag warning (Theme E5) */}
            {trustFlags?.flag_count_recent_90d > 0 && (
              <View style={{
                backgroundColor: Colors.accent3 + '20',
                borderColor: Colors.accent3, borderWidth: 1,
                borderRadius: Radius.md, padding: Spacing.sm,
                marginVertical: Spacing.sm,
              }}>
                <Text style={{ color: Colors.accent3, fontWeight: Typography.bold, fontSize: Typography.sm }}>
                  ⚠ Caution — flagged user
                </Text>
                <Text style={{ color: Colors.text, fontSize: Typography.xs, marginTop: 4, lineHeight: 17 }}>
                  This recipient has {trustFlags.flag_count_recent_90d} unresolved issue
                  {trustFlags.flag_count_recent_90d === 1 ? '' : 's'} in the last 90 days
                  {Object.keys(trustFlags.reason_counts || {}).length > 0
                    ? ` (${Object.keys(trustFlags.reason_counts).join(', ').replace(/_/g, ' ')})`
                    : ''}. Proceed with caution.
                </Text>
              </View>
            )}
            <Button
              title="Send Transfer Request"
              onPress={handleStandardTransfer}
              loading={transferMutation.isPending}
            />
          </View>
        )}

        {/* QR method — generate a code the buyer scans in person */}
        {method === 'qr' && (
          <View style={{ gap: Spacing.sm }}>
            <Button
              title="Generate Transfer QR"
              onPress={handleGenerateQr}
              loading={qrMutation.isPending}
            />
            <Text style={styles.methodDesc}>
              The buyer scans the code with their Card Shop app to receive this card in person. Set a price above first if it's a sale.
            </Text>
          </View>
        )}

        {/* Important note */}
        <View style={styles.noteBox}>
          <Ionicons name="information-circle" size={16} color={Colors.info} />
          <Text style={styles.noteText}>
            The recipient must accept the transfer. Ownership does not change until they confirm.
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
  // Off-platform sales/trades (cards exited to a non-member) — they're
  // not transfers, so we pull them separately and show them in history.
  const { data: disposedCards } = useQuery({
    queryKey: ['my-disposed'],
    // /cards/mine returns { cards, total } — pull the array.
    queryFn: () => cardsApi.mine({ disposed: 'true', limit: 50 }).then((r) => r.data.cards || []),
  });

  const queryClient = useQueryClient();

  const invalidateRelated = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ['my-cards'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const acceptMutation = useMutation({
    mutationFn: (id) => transfersApi.accept(id),
    onSuccess: invalidateRelated,
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to accept transfer'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => transfersApi.cancel(id),
    onSuccess: invalidateRelated,
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to cancel transfer'),
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: (id) => transfersApi.confirmDelivery(id),
    onSuccess: invalidateRelated,
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to confirm delivery'),
  });

  if (isLoading) return <LoadingScreen />;

  const pending = (transfers || []).filter((t) => ['pending_acceptance','pending_delivery'].includes(t.status));
  const history = (transfers || []).filter((t) => ['completed', 'cancelled', 'disputed'].includes(t.status));

  const TransferItem = ({ t }) => (
    <TouchableOpacity
      style={styles.transferItem}
      activeOpacity={0.7}
      onPress={() => t.owned_card_id && navigation.navigate('CardChain', { cardId: t.owned_card_id })}
    >
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
          {t.direction === 'sent' ? `Sent → @${t.to_username || 'unknown'}` : `Received ← @${t.from_username || 'unknown'}`} · {t.method?.replace(/_/g,' ') || 'Transfer'}
          {t.sale_price ? ` · $${t.sale_price}` : ''}
        </Text>
        <Text style={styles.transferDate}>{t.initiated_at ? new Date(t.initiated_at).toLocaleDateString() : ''}</Text>
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
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  const DisposedItem = ({ c }) => (
    <TouchableOpacity
      style={styles.transferItem}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('CardChain', { cardId: c.id })}
    >
      <View style={styles.transferDir}>
        <Ionicons name="exit-outline" size={16} color={Colors.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.transferCard}>{c.player_name} {c.year} {c.set_name}</Text>
        <Text style={styles.transferMeta}>
          {(c.disposed_method === 'traded' ? 'Traded' : 'Sold')} off-platform → {c.disposed_to_name || 'outside party'}
          {c.disposed_price ? ` · $${c.disposed_price}` : ''}
        </Text>
        <Text style={styles.transferDate}>{c.disposed_at ? new Date(c.disposed_at).toLocaleDateString() : ''}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
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
        {(history.length > 0 || (disposedCards || []).length > 0) && (
          <View>
            <Text style={[styles.sectionLabel, { marginTop: Spacing.md }]}>HISTORY</Text>
            {history.map((t) => <TransferItem key={t.id} t={t} />)}
            {(disposedCards || []).map((c) => <DisposedItem key={`d-${c.id}`} c={c} />)}
          </View>
        )}
        {!pending.length && !history.length && !(disposedCards || []).length && (
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

// ============================================================
// SHOW TRANSFER QR (seller) — display the code, wait for the buyer
// ============================================================
export const ShowTransferQRScreen = ({ navigation, route }) => {
  const { cardId, offer, cardName, cardSub } = route.params;
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000)));

  // Poll the offer so the seller sees it flip to "claimed" the moment
  // the buyer confirms. Stop polling once it's settled.
  const { data: status } = useQuery({
    queryKey: ['qr-offer', offer.token],
    queryFn: () => transfersApi.getQrOffer(offer.token).then((r) => r.data),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && s !== 'pending' ? false : 4000;
    },
  });

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(id);
  }, [offer.expires_at]);

  const claimed = status?.status === 'claimed';
  const dead = status?.status === 'expired' || status?.status === 'cancelled' || secondsLeft <= 0;

  useEffect(() => {
    if (claimed) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
  }, [claimed]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.popToTop()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transfer QR</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.lg, alignItems: 'center' }}>
        <Text style={styles.cardName}>{cardName}</Text>
        {!!cardSub && <Text style={styles.cardSub}>{cardSub}</Text>}
        {cardId ? <ChainOfCustody cardId={cardId} navigation={navigation} style={{ alignSelf: 'stretch' }} /> : null}

        {claimed ? (
          <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: 40 }}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.accent2} />
            <Text style={{ color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold }}>Transferred</Text>
            <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
              This card was claimed and is no longer in your collection.
            </Text>
            <Button title="Done" onPress={() => navigation.popToTop()} />
          </View>
        ) : dead ? (
          <View style={{ alignItems: 'center', gap: Spacing.md, paddingVertical: 40 }}>
            <Ionicons name="time-outline" size={64} color={Colors.textMuted} />
            <Text style={{ color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold }}>QR expired</Text>
            <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>Go back and generate a fresh code.</Text>
            <Button title="Back" onPress={() => navigation.goBack()} />
          </View>
        ) : (
          <>
            <View style={{ backgroundColor: '#fff', padding: Spacing.lg, borderRadius: Radius.md }}>
              <Image source={{ uri: offer.qr_data_url }} style={{ width: 260, height: 260 }} resizeMode="contain" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={{ color: Colors.textMuted }}>
                Waiting for the buyer to scan · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
              </Text>
            </View>
            <View style={styles.noteBox}>
              <Ionicons name="information-circle" size={16} color={Colors.info} />
              <Text style={styles.noteText}>
                Have the buyer open Card Shop, tap Scan, and scan this code. Ownership transfers only after they confirm.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// CLAIM TRANSFER (buyer) — confirm and receive the card
// ============================================================
export const ClaimTransferScreen = ({ navigation, route }) => {
  const { token } = route.params;
  const queryClient = useQueryClient();

  const { data: offer, isLoading } = useQuery({
    queryKey: ['qr-offer', token],
    queryFn: () => transfersApi.getQrOffer(token).then((r) => r.data),
    retry: false,
  });

  const claimMutation = useMutation({
    mutationFn: () => transfersApi.claimQrOffer(token).then((r) => r.data),
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      queryClient.invalidateQueries({ queryKey: ['my-transfers'] });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Alert.alert('Card received', 'This card is now in your collection.', [
        { text: 'View card', onPress: () => navigation.navigate('CardDetail', { cardId: res.owned_card_id }) },
      ]);
    },
    onError: (err) => Alert.alert('Could not claim', err.response?.data?.error || 'Try again, or ask the seller for a new code.'),
  });

  if (isLoading) return <LoadingScreen />;

  if (!offer) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Receive Card</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ alignItems: 'center', paddingTop: 80, gap: Spacing.md }}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.textMuted} />
          <Text style={{ color: Colors.text, fontSize: Typography.lg }}>QR not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const c = offer.card || {};
  const blockedMsg = offer.is_own_card ? 'This is your own card.'
    : offer.status === 'expired' ? 'This QR has expired — ask the seller for a new one.'
    : offer.status === 'claimed' ? 'This card was already claimed.'
    : offer.status === 'cancelled' ? 'This QR was cancelled.'
    : !offer.claimable ? 'This card can’t be transferred right now.'
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receive Card</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.lg }}>
        <View style={styles.cardPreview}>
          {c.image ? (
            <Image source={{ uri: c.image }} style={styles.cardThumb} resizeMode="cover" />
          ) : (
            <LogoMark size={40} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName}>{c.player_name || 'Card'}</Text>
            <Text style={styles.cardSub}>{[c.year, c.set_name].filter(Boolean).join(' ')}</Text>
            {!!c.serial_number && <Text style={styles.cardSub}>#{c.serial_number}</Text>}
          </View>
          <Ionicons name="arrow-down" size={20} color={Colors.accent2} />
        </View>

        {c.owned_card_id ? <ChainOfCustody cardId={c.owned_card_id} navigation={navigation} /> : null}

        <Text style={{ color: Colors.text, fontSize: Typography.base, textAlign: 'center' }}>
          From <Text style={{ fontWeight: Typography.bold }}>@{offer.seller_username}</Text>
          {offer.sale_price ? ` for $${offer.sale_price}` : ' (no charge)'}
        </Text>

        {blockedMsg ? (
          <View style={[styles.noteBox, { borderColor: Colors.accent3 + '60', backgroundColor: Colors.accent3 + '15' }]}>
            <Ionicons name="warning" size={16} color={Colors.accent3} />
            <Text style={styles.noteText}>{blockedMsg}</Text>
          </View>
        ) : (
          <Button
            title={offer.sale_price ? `Accept & receive — $${offer.sale_price}` : 'Accept & receive'}
            onPress={() => claimMutation.mutate()}
            loading={claimMutation.isPending}
          />
        )}

        <View style={styles.noteBox}>
          <Ionicons name="information-circle" size={16} color={Colors.info} />
          <Text style={styles.noteText}>
            Accepting transfers this card into your collection and records it on the chain of custody. Money changes hands in person.
          </Text>
        </View>
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
  cardThumb: {
    width: 38, height: 54,
    borderRadius: 4,
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
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
