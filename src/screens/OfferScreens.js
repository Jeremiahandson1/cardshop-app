// Marketplace Offers — Phase 2B (M-J).
//
// Screens:
//   MakeListingOfferScreen — modal: pick an amount, send.
//                            Used for both single listings (route.params.listing_id)
//                            and cart bundles (route.params.cart_id).
//   MyOffersScreen        — sent/received tabs, both buyer and seller roles.
//   OfferDetailScreen     — single offer with negotiation history +
//                            counter/accept/reject/withdraw + checkout-from-accepted.
//
// Naming: this file's "offer" is a marketplace bid (listing_offers
// table). It's distinct from the existing "Offers" screens for the
// Trade Board / binder offers. Two separate domains, two separate
// flows.

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ScrollView, Alert, TextInput, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import {
  listingOffersApi, listingsApi, cartApi, checkoutApi, walletApi,
  offersApi,
} from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// ============================================================
// MAKE OFFER (modal-style)
// ============================================================
export const MakeListingOfferScreen = ({ navigation, route }) => {
  const { listing_id, cart_id } = route.params;
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  // Pull subject so we can show context + the asking price the buyer is
  // counter-anchoring against.
  const subject = useQuery({
    queryKey: listing_id ? ['listing', listing_id] : ['cart-detail', cart_id],
    queryFn: () => listing_id ? listingsApi.get(listing_id) : cartApi.get(cart_id),
  });

  const askingPrice = listing_id
    ? (subject.data?.asking_price_cents || 0)
    : (subject.data?.subtotal_cents || 0);

  const minOffer = listing_id ? (subject.data?.min_offer_cents || null) : null;

  const cents = Math.round(parseFloat(amount || '0') * 100);
  const valid =
    cents >= 100 &&
    cents <= askingPrice &&
    (!minOffer || cents >= minOffer);

  const openMut = useMutation({
    mutationFn: () =>
      listingOffersApi.open({
        listing_id, cart_id,
        amount_cents: cents,
        message: message.trim() || undefined,
      }),
    onSuccess: (out) => {
      Alert.alert(
        'Offer sent',
        'The seller has 48 hours to respond. We\'ll push you when they do.',
        [{ text: 'OK', onPress: () => navigation.replace('ListingOfferDetail', { id: out.offer.id }) }],
      );
    },
    onError: (err) => {
      const data = err.response?.data;
      if (data?.error === 'open_offer_exists' && data.offer_id) {
        Alert.alert(
          'You already have an open offer',
          'You can only have one negotiation going on this at a time.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'View it', onPress: () => navigation.replace('ListingOfferDetail', { id: data.offer_id }) },
          ],
        );
        return;
      }
      Alert.alert('Offer failed', data?.error || err.message);
    },
  });

  if (subject.isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={listing_id ? 'Make offer' : 'Offer on cart bundle'} />
      <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Asking</Text>
          <Text style={styles.summaryValue}>{usd(askingPrice)}</Text>
          {minOffer && (
            <Text style={styles.summaryNote}>Seller will entertain offers ≥ {usd(minOffer)}</Text>
          )}
        </View>

        <Text style={styles.label}>Your offer</Text>
        <TextInput
          style={styles.priceInput}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={Colors.textMuted}
        />
        {cents > askingPrice && (
          <Text style={styles.warn}>Offers can't exceed asking. Tap Buy to pay full price.</Text>
        )}
        {minOffer && cents > 0 && cents < minOffer && (
          <Text style={styles.warn}>Below the seller's minimum offer of {usd(minOffer)}.</Text>
        )}

        <Text style={styles.label}>Message (optional)</Text>
        <TextInput
          style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
          value={message}
          onChangeText={setMessage}
          multiline
          placeholder="Anything that might help — bundle context, condition notes, deadline…"
          placeholderTextColor={Colors.textMuted}
        />

        <View style={styles.helpBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.helpText}>
            Offers expire 48 hours after the last reply. If accepted, you have 24 hours to check out at the agreed price.
          </Text>
        </View>

        <Button
          title={openMut.isPending ? 'Sending…' : `Send offer · ${usd(cents)}`}
          onPress={() => openMut.mutate()}
          disabled={!valid || openMut.isPending}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// MY OFFERS — list with role tabs
// ============================================================
// Unified offers inbox. Pulls from THREE sources at once:
//   1. listing_offers — cash offers on marketplace listings
//   2. offers (target_type='trade_listing') — card-for-card trades
//   3. offers (target_type='binder')        — legacy binder offers
//
// One screen, one list, one place to look. Filter chips at the top
// scope to a single source when needed; default 'All' shows the
// merged + chronologically-sorted union. Tapping a row routes to
// the type-specific detail screen (each kind keeps its own UI
// because the actions differ — checkout-from-accepted on listings
// vs accept-trade-cards on trades vs binder counter-flow).

const KIND_META = {
  marketplace: { label: 'Marketplace', icon: 'cart-outline',         color: '#4ade80' },
  trade:       { label: 'Trade',       icon: 'swap-horizontal',      color: '#60a5fa' },
  binder:      { label: 'Binder',      icon: 'book-outline',         color: '#a78bfa' },
};
const KIND_ORDER = ['all', 'marketplace', 'trade', 'binder'];

export const MyOffersScreen = ({ navigation, route }) => {
  // When opened from the home tile "Active Trade Offers", the route
  // arrives with initialKindFilter='trade' + lockKind=true so the
  // chip rail is hidden and the list filters to trade offers only.
  // Direct nav from Profile → Offers gets the full unified inbox.
  const initialKindFilter = route?.params?.initialKindFilter || 'all';
  const lockKind = !!route?.params?.lockKind;
  const [direction, setDirection] = useState('received');
  const [kindFilter, setKindFilter] = useState(initialKindFilter);

  // Marketplace listing-offers. role=buyer for sent, seller for
  // received — naming inversion baked into the existing endpoint.
  const mpQ = useQuery({
    queryKey: ['unified-offers-mp', direction],
    queryFn: () => listingOffersApi.list({ role: direction === 'sent' ? 'buyer' : 'seller' }),
  });

  // Trade-board + binder offers come from the same endpoint, just
  // different target_type values. Pull both in one call (no filter)
  // so we don't double the network round-trips.
  const tbQ = useQuery({
    queryKey: ['unified-offers-tb', direction],
    queryFn: () => offersApi.mine({ direction, limit: 100 }).then((r) => r.data),
  });

  const isLoading = mpQ.isLoading || tbQ.isLoading;
  const isFetching = mpQ.isFetching || tbQ.isFetching;
  const refetch = () => Promise.all([mpQ.refetch(), tbQ.refetch()]);

  // Normalize each source into a common row shape so the renderer
  // doesn't have to branch on every field.
  const rows = useMemo(() => {
    const all = [];
    for (const o of (mpQ.data?.offers || [])) {
      all.push({
        id: `mp-${o.id}`,
        rawId: o.id,
        kind: 'marketplace',
        title: o.cart_id ? 'Bundle offer' : 'Listing offer',
        subtitle: statusLabel(o.status),
        amount: o.amount_cents != null ? usd(o.amount_cents) : null,
        status: o.status,
        updatedAt: o.updated_at || o.created_at,
        expiresAt: o.expires_at,
      });
    }
    for (const o of (tbQ.data?.offers || [])) {
      const isTrade = o.target_type === 'trade_listing';
      all.push({
        id: `tb-${o.id}`,
        rawId: o.id,
        kind: isTrade ? 'trade' : 'binder',
        title: isTrade
          ? (o.tl_card_name || 'Trade offer')
          : (o.binder_name || 'Binder offer'),
        subtitle: `${o.direction === 'sent' ? 'to' : 'from'} ${o.other_party_name || 'user'} · ${o.status}`,
        amount: o.offer_amount ? `$${o.offer_amount}` : null,
        status: o.status,
        updatedAt: o.updated_at || o.created_at,
      });
    }
    all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    if (kindFilter !== 'all') return all.filter((r) => r.kind === kindFilter);
    return all;
  }, [mpQ.data, tbQ.data, kindFilter]);

  // Type-aware navigation: each kind has its own detail screen
  // because the actions surface there differ enough that one
  // unified detail would be a worse UX than three.
  const openRow = (row) => {
    if (row.kind === 'marketplace') return navigation.navigate('ListingOfferDetail', { id: row.rawId });
    if (row.kind === 'trade')       return navigation.navigate('TradeOfferDetail',   { offerId: row.rawId });
    if (row.kind === 'binder')      return navigation.navigate('OfferDetail',        { offerId: row.rawId });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={lockKind && kindFilter === 'trade' ? 'Trade Offers' : 'Offers'} />
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, direction === 'received' && styles.tabActive]} onPress={() => setDirection('received')}>
          <Text style={[styles.tabText, direction === 'received' && styles.tabTextActive]}>Received</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, direction === 'sent' && styles.tabActive]} onPress={() => setDirection('sent')}>
          <Text style={[styles.tabText, direction === 'sent' && styles.tabTextActive]}>Sent</Text>
        </TouchableOpacity>
      </View>

      {/* Kind filter chips — All / Marketplace / Trade / Binder.
          Hidden when arriving from a tile that already pinned the
          filter (e.g. home → Active Trade Offers), since the chips
          would just be visual noise the user has to ignore. */}
      {!lockKind ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.sm, gap: 8 }}
        >
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const active = kindFilter === k;
            const label = k === 'all' ? 'All' : meta.label;
            return (
              <TouchableOpacity
                key={k}
                onPress={() => setKindFilter(k)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? Colors.accent : Colors.border,
                  backgroundColor: active ? 'rgba(232,197,71,0.12)' : 'transparent',
                }}
              >
                <Text style={{ color: active ? Colors.accent : Colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <LoadingScreen />
      ) : !rows.length ? (
        <EmptyState
          icon="💬"
          title={direction === 'sent' ? 'No offers sent' : 'No offers received'}
          message={direction === 'sent'
            ? 'When you offer on a listing, trade card, or binder, it\'ll show up here.'
            : 'When someone offers on your listings, trade cards, or binders, they\'ll show up here.'}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={Colors.text} />}
          renderItem={({ item }) => {
            const meta = KIND_META[item.kind];
            return (
              <TouchableOpacity style={styles.offerRow} onPress={() => openRow(item)}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: `${meta.color}22`,
                  alignItems: 'center', justifyContent: 'center',
                  marginRight: Spacing.md,
                }}>
                  <Ionicons name={meta.icon} size={18} color={meta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerStatus}>{item.title}</Text>
                  <Text style={styles.offerSub}>
                    {meta.label} · {item.subtitle}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {item.amount && <Text style={styles.offerAmount}>{item.amount}</Text>}
                  {item.expiresAt && ['open', 'countered', 'accepted'].includes(item.status) && (
                    <Text style={styles.offerExpires}>
                      {timeUntil(item.expiresAt)} left
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
};

function statusLabel(s) {
  return ({
    open:       '⏳ Open',
    countered:  '↩️ Countered',
    accepted:   '✅ Accepted — check out',
    rejected:   '❌ Rejected',
    withdrawn:  '↪️ Withdrawn',
    expired:    '⌛ Expired',
    completed:  '🎉 Completed',
  })[s] || s;
}

function timeUntil(dateStr) {
  const ms = new Date(dateStr).getTime() - Date.now();
  if (ms <= 0) return 'expired';
  const hours = Math.floor(ms / 3600 / 1000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d`;
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(ms / 60000))}m`;
}

// ============================================================
// OFFER DETAIL — counter/accept/reject/withdraw + checkout
// ============================================================
export const ListingOfferDetailScreen = ({ navigation, route }) => {
  const { id } = route.params;
  const qc = useQueryClient();
  const [counterAmount, setCounterAmount] = useState('');
  const [showCounter, setShowCounter] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['offer', id],
    queryFn: () => listingOffersApi.get(id),
  });

  const acceptMut = useMutation({
    mutationFn: () => listingOffersApi.accept(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer', id] });
      qc.invalidateQueries({ queryKey: ['offers'] });
      Alert.alert('Accepted', 'The buyer has 24 hours to check out at the agreed price.');
    },
    onError: (err) => Alert.alert('Accept failed', err.response?.data?.error || err.message),
  });

  const counterMut = useMutation({
    mutationFn: (cents) => listingOffersApi.counter(id, cents),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer', id] });
      qc.invalidateQueries({ queryKey: ['offers'] });
      setCounterAmount('');
      setShowCounter(false);
    },
    onError: (err) => Alert.alert('Counter failed', err.response?.data?.error || err.message),
  });

  const rejectMut = useMutation({
    mutationFn: () => listingOffersApi.reject(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer', id] });
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });

  const withdrawMut = useMutation({
    mutationFn: () => listingOffersApi.withdraw(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offer', id] });
      qc.invalidateQueries({ queryKey: ['offers'] });
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (!data?.offer) return <EmptyState icon="❌" title="Offer not found" />;

  const offer = data.offer;
  const items = data.items || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Offer" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>
        <View style={styles.statusBox}>
          <Text style={styles.statusBig}>{statusLabel(offer.status)}</Text>
          <Text style={styles.statusAmount}>{usd(offer.amount_cents)}</Text>
          {['open', 'countered', 'accepted'].includes(offer.status) && (
            <Text style={styles.statusExpires}>
              Expires {new Date(offer.expires_at).toLocaleString()}
            </Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>{items.length === 1 ? 'CARD' : 'BUNDLE'}</Text>
        <View style={styles.itemsBox}>
          {items.map((it) => (
            <View key={it.listing_id} style={styles.itemRow}>
              <Image source={{ uri: Array.isArray(it.photos) ? it.photos[0] : null }} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {it.year ? `${it.year} ` : ''}{it.set_name}
                </Text>
                {it.player_name && <Text style={styles.itemSub}>{it.player_name}</Text>}
              </View>
              <Text style={styles.itemPrice}>{usd(it.card_price_cents)}</Text>
            </View>
          ))}
        </View>

        {offer.message && (
          <>
            <Text style={styles.sectionLabel}>MESSAGE</Text>
            <View style={styles.messageBox}>
              <Text style={styles.messageText}>{offer.message}</Text>
            </View>
          </>
        )}

        {offer.last_counter_amount_cents && (
          <>
            <Text style={styles.sectionLabel}>HISTORY</Text>
            <View style={styles.historyRow}>
              <Text style={styles.historyText}>
                Counter at {usd(offer.last_counter_amount_cents)} ·
                {' '}
                {new Date(offer.last_counter_at).toLocaleString()}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Action bar — buttons depend on status + role. */}
      <ActionBar
        offer={offer}
        navigation={navigation}
        showCounter={showCounter}
        setShowCounter={setShowCounter}
        counterAmount={counterAmount}
        setCounterAmount={setCounterAmount}
        onAccept={() => Alert.alert(
          'Accept offer?',
          `Accepting ${usd(offer.amount_cents)} kicks off a 24h checkout window.`,
          [{ text: 'Cancel' }, { text: 'Accept', onPress: () => acceptMut.mutate() }],
        )}
        onCounter={(cents) => counterMut.mutate(cents)}
        onReject={() => Alert.alert(
          'Reject offer?',
          'The buyer will be notified.',
          [{ text: 'Cancel' }, { text: 'Reject', style: 'destructive', onPress: () => rejectMut.mutate() }],
        )}
        onWithdraw={() => Alert.alert(
          'Withdraw offer?',
          'The seller will see it as withdrawn.',
          [{ text: 'Cancel' }, { text: 'Withdraw', style: 'destructive', onPress: () => withdrawMut.mutate() }],
        )}
        loading={acceptMut.isPending || counterMut.isPending || rejectMut.isPending || withdrawMut.isPending}
      />
    </SafeAreaView>
  );
};

// Action bar at the bottom of OfferDetail. The semantics are:
//   - 'open' or 'countered': the OTHER party can accept, counter, or reject;
//      the current party who last moved can only WITHDRAW (buyer) or wait.
//   - 'accepted': the BUYER must check out within 24h.
//   - terminal states: no actions, just status display.
const ActionBar = ({
  offer, navigation, showCounter, setShowCounter, counterAmount, setCounterAmount,
  onAccept, onCounter, onReject, onWithdraw, loading,
}) => {
  // We can't tell from offer alone if WE are buyer or seller without a
  // "me" hook — comparing IDs against the auth store. Use the buyer_id
  // / seller_id fields as the truth (the API returns them on the offer).
  const { useAuthStore } = require('../store/authStore');
  const meId = useAuthStore((s) => s.user?.id);
  const isBuyer = meId === offer.buyer_id;
  const isSeller = meId === offer.seller_id;

  // Whose move is it? If last_counter_by is set, that party just acted
  // and the OTHER party is on the clock. Otherwise the buyer made an
  // open offer and the seller is on the clock.
  const lastActor = offer.last_counter_by || offer.buyer_id;
  const myMove = meId !== lastActor;

  if (offer.status === 'accepted') {
    if (!isBuyer) {
      return (
        <View style={styles.ctaBar}>
          <View style={styles.bannerInfo}>
            <Ionicons name="time-outline" size={18} color={Colors.accent} />
            <Text style={styles.bannerText}>Buyer has 24 hours to check out.</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.ctaBar}>
        <Button
          title={`Check out · ${usd(offer.amount_cents)}`}
          onPress={() => navigation.navigate('Checkout', { offer_id: offer.id })}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  if (!['open', 'countered'].includes(offer.status)) {
    // Terminal: rejected, withdrawn, expired, completed. No actions.
    return null;
  }

  const cents = Math.round(parseFloat(counterAmount || '0') * 100);
  const validCounter = cents >= 100 && cents !== offer.amount_cents;

  if (showCounter) {
    return (
      <View style={[styles.ctaBar, { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text style={{ color: Colors.textMuted, fontSize: 13 }}>$</Text>
          <TextInput
            style={[styles.input, { flex: 1, fontSize: 18 }]}
            value={counterAmount}
            onChangeText={setCounterAmount}
            keyboardType="decimal-pad"
            placeholder="Your counter"
            placeholderTextColor={Colors.textMuted}
            autoFocus
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => { setShowCounter(false); setCounterAmount(''); }}
            style={{ flex: 1 }}
          />
          <Button
            title="Send counter"
            onPress={() => onCounter(cents)}
            disabled={!validCounter || loading}
            style={{ flex: 1.5 }}
          />
        </View>
      </View>
    );
  }

  if (myMove) {
    return (
      <View style={styles.ctaBar}>
        <Button title="Reject" variant="ghost" onPress={onReject} disabled={loading || !isSeller}
                style={{ flex: 1, opacity: isSeller ? 1 : 0.4 }} />
        <Button title="Counter" variant="ghost" onPress={() => setShowCounter(true)} disabled={loading}
                style={{ flex: 1 }} />
        <Button title="Accept" onPress={onAccept} disabled={loading} style={{ flex: 1.3 }} />
      </View>
    );
  }

  // Waiting on the other side. The buyer can withdraw; the seller waits.
  return (
    <View style={styles.ctaBar}>
      <View style={[styles.bannerInfo, { flex: 1 }]}>
        <Ionicons name="hourglass-outline" size={18} color={Colors.textMuted} />
        <Text style={styles.bannerText}>
          Waiting on {isBuyer ? 'seller' : 'buyer'}.
        </Text>
      </View>
      {isBuyer && (
        <Button title="Withdraw" variant="ghost" onPress={onWithdraw} disabled={loading} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  summaryBox: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    alignItems: 'center', gap: 4, marginBottom: Spacing.md,
  },
  summaryLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1 },
  summaryValue: { color: Colors.text, fontSize: 28, fontWeight: '700' },
  summaryNote: { color: Colors.textDim, fontSize: 12 },

  label: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  priceInput: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 28, fontWeight: '600',
    padding: Spacing.md, borderRadius: Radius.md, textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 15,
    padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
  },
  warn: { color: Colors.accent3, fontSize: 12, marginTop: 4 },

  helpBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    padding: Spacing.sm, marginTop: Spacing.md,
  },
  helpText: { flex: 1, color: Colors.textMuted, fontSize: 12, lineHeight: 17 },

  tabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm,
  },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.bg, fontWeight: '700' },

  offerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
  },
  offerStatus: { color: Colors.text, fontWeight: '500' },
  offerSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  offerAmount: { color: Colors.text, fontWeight: '700', fontSize: 16 },
  offerExpires: { color: Colors.textMuted, fontSize: 10, marginTop: 2 },

  statusBox: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    alignItems: 'center', gap: 4, marginBottom: Spacing.md,
  },
  statusBig: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  statusAmount: { color: Colors.text, fontSize: 32, fontWeight: '700' },
  statusExpires: { color: Colors.textMuted, fontSize: 12 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  itemsBox: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  thumb: { width: 50, height: 50, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  itemName: { color: Colors.text, fontSize: 13 },
  itemSub: { color: Colors.textMuted, fontSize: 11 },
  itemPrice: { color: Colors.text, fontWeight: '600' },

  messageBox: { backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md },
  messageText: { color: Colors.text, fontSize: 14, lineHeight: 20 },

  historyRow: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
  },
  historyText: { color: Colors.textMuted, fontSize: 13 },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  bannerInfo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerText: { color: Colors.textMuted, fontSize: 13 },
});
