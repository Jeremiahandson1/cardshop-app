// Order stickers — tier allowance + by-the-sheet Stripe checkout.
// Mirrors cardshop-dashboard's StickersPage so the two surfaces stay
// in lockstep. Stripe Checkout opens in the system browser; the
// webhook on the API side creates the sticker_orders row, so this
// screen only needs to refresh after the user returns.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { stickerOrdersApi } from '../services/api';
import { Button, Input, LoadingScreen, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => cents == null ? '—' : `$${(Number(cents) / 100).toFixed(2)}`;

export const OrderStickersScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sticker-orders'],
    queryFn: () => stickerOrdersApi.list().then((r) => r.data),
  });
  const { data: pricing } = useQuery({
    queryKey: ['sticker-pricing'],
    queryFn: () => stickerOrdersApi.pricing().then((r) => r.data),
  });

  // Shared ship-to state. Reused by both claim and buy paths so the
  // user doesn't re-type their address mid-flow.
  const [shipName, setShipName] = useState('');
  const [shipLine1, setShipLine1] = useState('');
  const [shipLine2, setShipLine2] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipPostal, setShipPostal] = useState('');
  const [sheets, setSheets] = useState(1);

  const claimMut = useMutation({
    mutationFn: (payload) => stickerOrdersApi.claimAllowance(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sticker-orders'] });
      Alert.alert(
        'Sheet claimed',
        "Heading to the print queue. We'll ship in 3-5 business days.",
        [{ text: 'OK' }],
      );
    },
    onError: (err) => Alert.alert(
      'Could not claim',
      err?.response?.data?.error || 'Try again in a moment.',
    ),
  });

  const buyMut = useMutation({
    mutationFn: ({ sheets, ship }) => stickerOrdersApi.buyCheckout(sheets, ship),
    onSuccess: async ({ data: out }) => {
      if (!out?.url) {
        Alert.alert('Could not start checkout', 'Stripe did not return a URL.');
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(out.url);
      } catch {}
      // The webhook writes the sticker_orders row, so just refresh
      // the order list whenever the user comes back to the app.
      refetch();
    },
    onError: (err) => Alert.alert(
      'Could not start checkout',
      err?.response?.data?.error || 'Try again in a moment.',
    ),
  });

  if (isLoading) return <LoadingScreen message="Loading sticker orders..." />;

  const allowance = data?.allowance;
  const orders = data?.orders || [];
  const pricePerSheet = pricing?.price_cents_per_sheet ?? 1500;
  const stickersPerSheet = pricing?.stickers_per_sheet ?? 117;
  const buyTotalCents = sheets * pricePerSheet;
  const buyTotalStickers = sheets * stickersPerSheet;

  const validShip = () =>
    shipName.trim() && shipLine1.trim() && shipCity.trim() &&
    shipState.trim() && shipPostal.trim();

  const shipPayload = () => ({
    name: shipName.trim(),
    line1: shipLine1.trim(),
    line2: shipLine2.trim() || undefined,
    city: shipCity.trim(),
    state: shipState.trim(),
    postal: shipPostal.trim(),
    country: 'US',
  });

  // The API's claim endpoint expects flat ship_* keys; the buy
  // endpoint expects a nested { ship: { name, line1, ... } } object.
  const claimShipPayload = () => ({
    ship_name: shipName.trim(),
    ship_line1: shipLine1.trim(),
    ship_line2: shipLine2.trim() || null,
    ship_city: shipCity.trim(),
    ship_state: shipState.trim(),
    ship_postal: shipPostal.trim(),
  });

  const onClaim = () => {
    if (!validShip()) {
      Alert.alert('Address required', 'Fill in name + street + city + state + ZIP so we can ship.');
      return;
    }
    claimMut.mutate(claimShipPayload());
  };

  const onBuy = () => {
    if (!validShip()) {
      Alert.alert('Address required', 'Fill in name + street + city + state + ZIP so we can ship.');
      return;
    }
    buyMut.mutate({ sheets, ship: shipPayload() });
  };

  const incSheets = (n) => setSheets((v) => Math.max(1, Math.min(100, v + n)));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Order stickers"
        subtitle={`${stickersPerSheet} stickers / sheet · $${(pricePerSheet / 100).toFixed(0)}/sheet`}
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>

        {/* Tier allowance — claim flow when entitled and unclaimed. */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Your monthly allowance</Text>
          {allowance?.monthly_sheets > 0 ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
                <Text style={styles.bigNumber}>
                  {allowance.available_sheets} / {allowance.monthly_sheets} sheets
                </Text>
                <Text style={styles.panelMeta}>
                  ({allowance.available_stickers?.toLocaleString() || 0} stickers this month)
                </Text>
              </View>
              {allowance.used_this_month ? (
                <Text style={[styles.panelBody, { marginTop: 8 }]}>
                  Already claimed this month. The next allowance resets on the 1st.
                </Text>
              ) : (
                <Button
                  title={`Claim my ${allowance.available_sheets} free sheet${allowance.available_sheets > 1 ? 's' : ''}`}
                  onPress={onClaim}
                  loading={claimMut.isPending}
                  style={{ marginTop: Spacing.md }}
                />
              )}
            </>
          ) : (
            <Text style={styles.panelBody}>
              Your plan ({allowance?.tier || 'free'}) doesn't include a free monthly allowance.
              Show Floor includes 1 sheet/month; store plans include 3 sheets/month per store.
              You can still buy by the sheet below.
            </Text>
          )}
        </View>

        {/* Buy more sheets — Stripe Checkout. */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Buy more sheets</Text>

          <Text style={styles.fieldLabel}>How many sheets?</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, sheets <= 1 && styles.stepBtnDisabled]}
              onPress={() => incSheets(-1)}
              disabled={sheets <= 1}
            >
              <Ionicons name="remove" size={20} color={sheets <= 1 ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
            <View style={styles.stepValue}><Text style={styles.stepValueText}>{sheets}</Text></View>
            <TouchableOpacity
              style={[styles.stepBtn, sheets >= 100 && styles.stepBtnDisabled]}
              onPress={() => incSheets(1)}
              disabled={sheets >= 100}
            >
              <Ionicons name="add" size={20} color={sheets >= 100 ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>
          </View>
          <Text style={styles.panelMeta}>
            {sheets} × {stickersPerSheet} = <Text style={{ fontWeight: '700', color: Colors.text }}>{buyTotalStickers.toLocaleString()} stickers</Text> · total <Text style={{ fontWeight: '700', color: Colors.text }}>{usd(buyTotalCents)}</Text>
          </Text>

          <Button
            title={`Buy ${sheets} sheet${sheets > 1 ? 's' : ''} — ${usd(buyTotalCents)}`}
            onPress={onBuy}
            loading={buyMut.isPending}
            style={{ marginTop: Spacing.md }}
          />
        </View>

        {/* Ship to — shared by claim + buy. */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Ship to</Text>
          <Input placeholder="Full name" value={shipName} onChangeText={setShipName} />
          <Input placeholder="Street address" value={shipLine1} onChangeText={setShipLine1} />
          <Input placeholder="Apt / suite (optional)" value={shipLine2} onChangeText={setShipLine2} />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 2 }}>
              <Input placeholder="City" value={shipCity} onChangeText={setShipCity} />
            </View>
            <View style={{ flex: 1 }}>
              <Input placeholder="State" value={shipState} onChangeText={setShipState} maxLength={3} />
            </View>
          </View>
          <Input placeholder="ZIP" value={shipPostal} onChangeText={setShipPostal} keyboardType="number-pad" />
        </View>

        {orders.length ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recent orders</Text>
            {orders.slice(0, 10).map((o) => (
              <View key={o.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyLabel}>
                    {o.qty} stickers · {o.pack_type === 'sheet' ? 'paid' : 'allowance'}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {new Date(o.created_at).toLocaleDateString()} · {o.status}
                    {o.paid_amount_cents ? ` · ${usd(o.paid_amount_cents)}` : ''}
                    {o.tracking_number ? ` · ${o.tracking_number}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  panel: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  panelTitle: {
    color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold,
    marginBottom: Spacing.sm,
  },
  panelBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 19 },
  panelMeta: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 4 },
  bigNumber: {
    color: Colors.text, fontSize: 22, fontWeight: Typography.bold, letterSpacing: -0.5,
  },
  fieldLabel: {
    color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.xs, marginTop: 4,
  },
  stepper: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  stepBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.4 },
  stepValue: {
    minWidth: 56, paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2, alignItems: 'center',
  },
  stepValueText: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.bold },
  historyRow: {
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  historyLabel: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  historyMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
});
