// Cart + Checkout screens.
//
//   CartListScreen — all my active carts (one per seller)
//   CartDetailScreen — a single cart's items + checkout button
//   CheckoutScreen — shipping picker, payment picker, place order

import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  ScrollView, Alert, TextInput, RefreshControl, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { cartApi, checkoutApi, walletApi, addressesApi } from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// ============================================================
// CART LIST — all my active carts
// ============================================================
export const CartListScreen = ({ navigation }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['cart'],
    queryFn: () => cartApi.list(),
  });

  const carts = data?.carts || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Cart" />
      {isLoading ? (
        <LoadingScreen />
      ) : !carts.length ? (
        <EmptyState
          icon="🛒"
          title="Your cart is empty"
          message="Browse the marketplace and tap 'Add to cart' on any listing to bundle multiple cards from one seller."
          action={{ title: 'Browse marketplace', onPress: () => navigation.navigate('MarketplaceHome') }}
        />
      ) : (
        <FlatList
          data={carts}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={Colors.text} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.cartCard}
              onPress={() => navigation.navigate('CartDetail', { cartId: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cartSeller}>{item.seller_username}</Text>
                <Text style={styles.cartItems}>
                  {item.item_count} card{item.item_count === 1 ? '' : 's'}
                  {item.unavailable_count > 0 && (
                    <Text style={styles.cartUnavail}>  ·  {item.unavailable_count} unavailable</Text>
                  )}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.cartTotal}>{usd(item.subtotal_cents)}</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// CART DETAIL — one cart's items
// ============================================================
export const CartDetailScreen = ({ navigation, route }) => {
  const { cartId } = route.params;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['cart-detail', cartId],
    queryFn: () => cartApi.get(cartId),
  });

  const removeMut = useMutation({
    mutationFn: (listing_id) => cartApi.remove(listing_id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['cart-detail', cartId] });
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (!data) return <EmptyState icon="❌" title="Cart not found" />;

  const { cart, items, subtotal_cents, item_count, unavailable_count } = data;
  const activeItems = items.filter((i) => i.status === 'active');

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Your cart" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}>
        {unavailable_count > 0 && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              {unavailable_count} item(s) are no longer available — remove them to check out.
            </Text>
          </View>
        )}
        {items.map((item) => (
          <View key={item.listing_id} style={[styles.cartItem, item.status !== 'active' && styles.cartItemMuted]}>
            <Image
              source={{ uri: Array.isArray(item.photos) ? item.photos[0] : null }}
              style={styles.cartItemPhoto}
              resizeMode="cover"
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.year ? `${item.year} ` : ''}{item.set_name}
              </Text>
              {item.player_name && <Text style={styles.itemSub}>{item.player_name}</Text>}
              {item.condition && <Text style={styles.itemCondition}>{item.condition}{item.grade ? ` ${item.grade}` : ''}</Text>}
              {item.status !== 'active' && (
                <Text style={styles.itemUnavail}>No longer available</Text>
              )}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.itemPrice}>{usd(item.asking_price_cents)}</Text>
              <TouchableOpacity onPress={() => removeMut.mutate(item.listing_id)}>
                <Ionicons name="close-circle" size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={styles.subtotalBox}>
          <Text style={styles.subtotalLabel}>Subtotal · {item_count - unavailable_count} item(s)</Text>
          <Text style={styles.subtotalAmount}>{usd(subtotal_cents)}</Text>
        </View>
        <Text style={styles.subtotalNote}>Shipping, fees, and tax shown at checkout.</Text>
      </ScrollView>

      <View style={styles.ctaBar}>
        <Button
          title="Make offer"
          variant="ghost"
          onPress={() => navigation.navigate('MakeListingOffer', { cart_id: cartId })}
          disabled={!activeItems.length}
          style={{ flex: 1 }}
        />
        <Button
          title={`Check out · ${usd(subtotal_cents)}`}
          onPress={() => navigation.navigate('Checkout', { cart_id: cartId })}
          disabled={!activeItems.length}
          style={{ flex: 1.4 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// CHECKOUT — shipping picker, payment picker, place order
// ============================================================
export const CheckoutScreen = ({ navigation, route }) => {
  const { listing_id, cart_id } = route.params;
  const [shippingTier, setShippingTier] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('card');   // card | wallet
  const [shipTo, setShipTo] = useState({
    name: '', line1: '', line2: '', city: '', state: '', zip: '', country: 'US',
  });
  const [addressId, setAddressId] = useState(null);

  // Pull saved addresses; auto-fill default on first load.
  const { data: addressesData } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.list(),
  });
  const savedAddresses = addressesData?.addresses || [];

  useEffect(() => {
    if (!addressId && savedAddresses.length > 0) {
      const def = savedAddresses.find((a) => a.is_default) || savedAddresses[0];
      setAddressId(def.id);
      setShipTo({
        name: def.name, line1: def.line1, line2: def.line2 || '',
        city: def.city, state: def.state, zip: def.zip, country: def.country || 'US',
      });
    }
  }, [savedAddresses.length, addressId]);

  const pickAddress = (addr) => {
    setAddressId(addr.id);
    setShipTo({
      name: addr.name, line1: addr.line1, line2: addr.line2 || '',
      city: addr.city, state: addr.state, zip: addr.zip, country: addr.country || 'US',
    });
  };

  // Pull wallet balance to show pay-with-wallet option.
  const { data: wallet } = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: () => walletApi.summary(),
  });

  // Quote whenever picker state is complete enough to compute it.
  const { data: quote, refetch: refetchQuote, isFetching: quoting } = useQuery({
    queryKey: ['checkout-quote', listing_id, cart_id, shippingTier, paymentMethod],
    queryFn: () => checkoutApi.quote({
      listing_id, cart_id,
      shipping_tier: shippingTier,
      payment_method: paymentMethod,
    }),
    enabled: !!shippingTier,
  });

  const placeMut = useMutation({
    mutationFn: () => checkoutApi.place({
      listing_id, cart_id,
      shipping_tier: shippingTier,
      payment_method: paymentMethod,
      ship_to: shipTo,
    }),
    onSuccess: async (out) => {
      if (paymentMethod === 'wallet') {
        Alert.alert(
          'Order placed!',
          'Funds transferred from your wallet. The seller has 5 days to ship.',
          [{ text: 'OK', onPress: () => navigation.replace('OrderDetail', { id: out.order_id }) }],
        );
        return;
      }
      // Card flow: open Stripe Checkout in an in-app browser. Stripe
      // returns to cardshop://orders/success?order_id=X (deep link)
      // and the webhook handles status flipping server-side.
      if (!out.checkout_url) {
        Alert.alert('Checkout error', 'No payment URL returned.');
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(out.checkout_url);
      } catch (e) {
        // Fallback for devices without an in-app browser.
        try { await Linking.openURL(out.checkout_url); }
        catch { Alert.alert('Could not open checkout', e.message); return; }
      }
      // After the user returns we route to OrderDetail. The webhook may
      // not have fired yet so the screen will say "pending payment"
      // until checkout.session.completed lands.
      navigation.replace('OrderDetail', { id: out.order_id });
    },
    onError: (err) => Alert.alert('Checkout failed', err.response?.data?.error || err.message),
  });

  // Pull listing/cart to know which shipping tiers are offered.
  const subjectQ = useQuery({
    queryKey: listing_id ? ['listing', listing_id] : ['cart-detail', cart_id],
    queryFn: () => listing_id
      ? import('../services/api').then((m) => m.listingsApi.get(listing_id))
      : cartApi.get(cart_id),
  });

  const offeredTiers = useMemo(() => {
    if (listing_id && subjectQ.data?.shipping_options) {
      return subjectQ.data.shipping_options;
    }
    if (cart_id && subjectQ.data?.items) {
      // Intersect tiers across all items at max price per tier.
      const counts = new Map();
      const items = subjectQ.data.items.filter((i) => i.status === 'active');
      for (const item of items) {
        const seen = new Set();
        for (const o of (item.shipping_options || [])) {
          if (!o?.tier || seen.has(o.tier)) continue;
          seen.add(o.tier);
          const cur = counts.get(o.tier) || { count: 0, max_price: 0 };
          cur.count += 1;
          cur.max_price = Math.max(cur.max_price, o.price_cents || 0);
          counts.set(o.tier, cur);
        }
      }
      const out = [];
      for (const [tier, info] of counts.entries()) {
        if (info.count === items.length) out.push({ tier, price_cents: info.max_price });
      }
      return out;
    }
    return [];
  }, [listing_id, cart_id, subjectQ.data]);

  const subtotalCents = useMemo(() => {
    if (listing_id) return subjectQ.data?.asking_price_cents || 0;
    if (cart_id) return subjectQ.data?.subtotal_cents || 0;
    return 0;
  }, [listing_id, cart_id, subjectQ.data]);

  const requiresSignature = subtotalCents >= 20000;

  const addressComplete = shipTo.name && shipTo.line1 && shipTo.city && shipTo.state && shipTo.zip;
  const canPlace = !!shippingTier && addressComplete && !!quote && !placeMut.isPending && !quoting;

  if (subjectQ.isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Checkout" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 120 }}>
        {/* Subtotal */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{usd(subtotalCents)}</Text>
        </View>

        {/* Shipping picker */}
        <Text style={styles.sectionLabel}>SHIPPING</Text>
        {offeredTiers.length === 0 ? (
          <Text style={styles.noOptions}>No common shipping options for this purchase.</Text>
        ) : (
          offeredTiers.map((opt) => {
            const disabled = requiresSignature && opt.tier !== 'signature';
            return (
              <TouchableOpacity
                key={opt.tier}
                style={[
                  styles.shipOption,
                  shippingTier === opt.tier && styles.shipOptionActive,
                  disabled && { opacity: 0.4 },
                ]}
                onPress={() => !disabled && setShippingTier(opt.tier)}
                disabled={disabled}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shipName, shippingTier === opt.tier && { color: Colors.bg }]}>
                    {shipTierLabel(opt.tier)}
                  </Text>
                  {disabled && <Text style={styles.shipReason}>Required: signature for $200+ orders</Text>}
                </View>
                <Text style={[styles.shipPrice, shippingTier === opt.tier && { color: Colors.bg }]}>
                  {usd(opt.price_cents)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}

        {/* Address */}
        <Text style={styles.sectionLabel}>SHIP TO</Text>
        {savedAddresses.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
            {savedAddresses.map((a) => {
              const sel = addressId === a.id;
              return (
                <TouchableOpacity
                  key={a.id}
                  onPress={() => pickAddress(a)}
                  style={[styles.savedAddrChip, sel && styles.savedAddrChipActive]}
                >
                  <Text style={[styles.savedAddrLabel, sel && { color: Colors.bg }]}>
                    {a.label || (a.is_default ? 'Default' : a.zip)}
                  </Text>
                  <Text style={[styles.savedAddrCity, sel && { color: 'rgba(0,0,0,0.7)' }]}>
                    {a.city}, {a.state}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => navigation.navigate('AddressForm', {})}
              style={[styles.savedAddrChip, { borderStyle: 'dashed' }]}
            >
              <Text style={styles.savedAddrLabel}>+ New</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
        <AddressForm value={shipTo} onChange={(next) => { setShipTo(next); setAddressId(null); }} />

        {/* Payment */}
        <Text style={styles.sectionLabel}>PAYMENT</Text>
        <TouchableOpacity
          style={[styles.payOption, paymentMethod === 'card' && styles.payOptionActive]}
          onPress={() => setPaymentMethod('card')}
        >
          <Ionicons name="card-outline" size={20} color={paymentMethod === 'card' ? Colors.bg : Colors.text} />
          <Text style={[styles.payText, paymentMethod === 'card' && { color: Colors.bg }]}>Credit / debit card</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.payOption,
            paymentMethod === 'wallet' && styles.payOptionActive,
            (wallet?.balance?.available_cents || 0) < (quote?.gross_cents || 0) && { opacity: 0.5 },
          ]}
          onPress={() => setPaymentMethod('wallet')}
          disabled={(wallet?.balance?.available_cents || 0) < (quote?.gross_cents || subtotalCents)}
        >
          <Ionicons name="wallet-outline" size={20} color={paymentMethod === 'wallet' ? Colors.bg : Colors.text} />
          <Text style={[styles.payText, paymentMethod === 'wallet' && { color: Colors.bg }]}>
            Wallet · {usd(wallet?.balance?.available_cents || 0)} available
          </Text>
        </TouchableOpacity>

        {/* Quote breakdown */}
        {quote && (
          <View style={styles.quoteBox}>
            <FeeRow label="Card subtotal" value={usd(quote.card_subtotal_cents)} />
            <FeeRow label="Shipping" value={usd(quote.shipping_cents)} />
            {quote.tax_cents > 0 && <FeeRow label="Tax" value={usd(quote.tax_cents)} />}
            <FeeRow
              label={`Card Shop fee (${quote.rule_applied})`}
              value={usd(quote.total_seller_fee_cents)}
              hint="Cap: $1 + Stripe processing"
            />
            <View style={styles.quoteDivider} />
            <FeeRow label="You pay" value={usd(quote.gross_cents)} bold />
          </View>
        )}
      </ScrollView>

      <View style={styles.ctaBar}>
        <Button
          title={
            placeMut.isPending ? 'Placing…' :
            quoting ? 'Calculating…' :
            quote ? `Place order · ${usd(quote.gross_cents)}` : 'Pick a shipping option'
          }
          onPress={() => placeMut.mutate()}
          disabled={!canPlace}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

const FeeRow = ({ label, value, hint, bold }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }}>
    <View>
      <Text style={[styles.feeLabel, bold && { color: Colors.text, fontWeight: '600' }]}>{label}</Text>
      {hint && <Text style={styles.feeHint}>{hint}</Text>}
    </View>
    <Text style={[styles.feeValue, bold && { fontWeight: '700' }]}>{value}</Text>
  </View>
);

const AddressForm = ({ value, onChange }) => (
  <View style={{ gap: Spacing.xs }}>
    <TextInput
      style={styles.addrInput}
      placeholder="Full name"
      placeholderTextColor={Colors.textMuted}
      value={value.name}
      onChangeText={(name) => onChange({ ...value, name })}
    />
    <TextInput
      style={styles.addrInput}
      placeholder="Address line 1"
      placeholderTextColor={Colors.textMuted}
      value={value.line1}
      onChangeText={(line1) => onChange({ ...value, line1 })}
    />
    <TextInput
      style={styles.addrInput}
      placeholder="Address line 2 (optional)"
      placeholderTextColor={Colors.textMuted}
      value={value.line2}
      onChangeText={(line2) => onChange({ ...value, line2 })}
    />
    <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
      <TextInput
        style={[styles.addrInput, { flex: 2 }]}
        placeholder="City"
        placeholderTextColor={Colors.textMuted}
        value={value.city}
        onChangeText={(city) => onChange({ ...value, city })}
      />
      <TextInput
        style={[styles.addrInput, { flex: 1 }]}
        placeholder="State"
        placeholderTextColor={Colors.textMuted}
        value={value.state}
        onChangeText={(state) => onChange({ ...value, state })}
        autoCapitalize="characters"
        maxLength={2}
      />
      <TextInput
        style={[styles.addrInput, { flex: 1.2 }]}
        placeholder="ZIP"
        placeholderTextColor={Colors.textMuted}
        value={value.zip}
        onChangeText={(zip) => onChange({ ...value, zip })}
        keyboardType="number-pad"
      />
    </View>
  </View>
);

function shipTierLabel(t) {
  return ({
    pwe: 'Plain envelope (no tracking)',
    bmwt: 'Bubble mailer + tracking',
    signature: 'Signature required',
  })[t] || t;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  cartCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md, gap: Spacing.sm,
  },
  cartSeller: { color: Colors.text, fontWeight: '600' },
  cartItems: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },
  cartUnavail: { color: Colors.accent3 },
  cartTotal: { color: Colors.text, fontSize: 16, fontWeight: '700' },

  cartItem: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  cartItemMuted: { opacity: 0.5 },
  cartItemPhoto: { width: 60, height: 60, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  itemTitle: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  itemSub: { color: Colors.textMuted, fontSize: 11 },
  itemCondition: { color: Colors.textDim, fontSize: 10 },
  itemUnavail: { color: Colors.accent3, fontSize: 11, fontStyle: 'italic' },
  itemPrice: { color: Colors.text, fontWeight: '600' },

  warnBox: { backgroundColor: '#3a2820', padding: Spacing.sm, borderRadius: Radius.sm, marginBottom: Spacing.sm },
  warnText: { color: '#ffaa66', fontSize: 12 },

  subtotalBox: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingTop: Spacing.md, marginTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  subtotalLabel: { color: Colors.textMuted, fontSize: 14 },
  subtotalAmount: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  subtotalNote: { color: Colors.textDim, fontSize: 11, fontStyle: 'italic', marginTop: 4 },

  summaryBox: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    marginBottom: Spacing.md,
  },
  summaryLabel: { color: Colors.textMuted, fontSize: 13 },
  summaryValue: { color: Colors.text, fontSize: 18, fontWeight: '600' },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },

  shipOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs,
  },
  shipOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  shipName: { color: Colors.text, fontWeight: '500' },
  shipReason: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  shipPrice: { color: Colors.text, fontWeight: '600' },
  noOptions: { color: Colors.accent3, fontStyle: 'italic', textAlign: 'center', padding: Spacing.md },

  addrInput: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 15,
    padding: Spacing.sm, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },

  payOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.xs,
  },
  payOptionActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  payText: { color: Colors.text, fontSize: 14 },

  quoteBox: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    marginTop: Spacing.md,
  },
  quoteDivider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.xs },
  feeLabel: { color: Colors.textMuted, fontSize: 13 },
  feeHint: { color: Colors.textDim, fontSize: 10, fontStyle: 'italic' },
  feeValue: { color: Colors.text, fontSize: 13 },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },

  savedAddrChip: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm,
    minWidth: 110, borderWidth: 1, borderColor: Colors.border,
  },
  savedAddrChipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  savedAddrLabel: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  savedAddrCity: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
