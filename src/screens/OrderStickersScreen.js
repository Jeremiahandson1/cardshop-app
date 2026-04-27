// Order Stickers — Pro members can claim 25 free per month, anyone
// can buy paid packs at $5/$15/$40. Pro allowance is gated by the
// API; pack orders go through Stripe (web flow for now; native IAP
// can't sell physical goods so paid packs always pass through the
// browser).
//
// v1 keeps the form simple: pick a pack, fill in shipping, submit.
// Pro Allowance is offered as the default option when available.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { stickerOrdersApi } from '../services/api';
import { Button, Input, LoadingScreen, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// Paid packs are gated until the Stripe checkout flow is wired
// — listing them with a "coming soon" alert is a tease. Only the
// Pro allowance is offered for now; users who want more should
// wait for the paid checkout flow (or email support).
const PACKS = [
  { key: 'pro_allowance', label: 'Pro allowance — 25 stickers',  price: 'Included',   note: 'Free for active Pro members, once per calendar month.' },
];

export const OrderStickersScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['sticker-orders'],
    queryFn: () => stickerOrdersApi.list().then((r) => r.data),
  });

  const [pack, setPack] = useState(null);
  const [shipName, setShipName] = useState('');
  const [shipLine1, setShipLine1] = useState('');
  const [shipLine2, setShipLine2] = useState('');
  const [shipCity, setShipCity] = useState('');
  const [shipState, setShipState] = useState('');
  const [shipPostal, setShipPostal] = useState('');

  const createOrder = useMutation({
    mutationFn: (payload) => stickerOrdersApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sticker-orders'] });
      Alert.alert(
        'Order placed',
        "We'll print + ship within 3-5 business days. You'll get an email when it's on the way.",
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || 'Try again in a moment.';
      Alert.alert('Could not place order', msg);
    },
  });

  if (isLoading) return <LoadingScreen message="Loading sticker orders..." />;

  const allowance = data?.allowance;
  const orders = data?.orders || [];

  // Default-select Pro allowance when it's available, otherwise the
  // smallest paid pack.
  if (!pack) {
    if (allowance?.is_pro && !allowance.used_this_month) setPack('pro_allowance');
    else setPack('pack_25');
  }

  const submit = () => {
    if (!pack) return;
    if (!shipName.trim() || !shipLine1.trim() || !shipCity.trim() || !shipState.trim() || !shipPostal.trim()) {
      Alert.alert('Address required', 'Fill in name + street + city + state + postal code so we can ship the stickers.');
      return;
    }
    if (pack !== 'pro_allowance') {
      // Paid pack: in v1 we don't have native checkout. Bounce to
      // a Stripe Payment Link in the browser; user comes back when
      // payment lands and the webhook sets stripe_charge_id.
      // Until that's wired we show a heads-up so we don't take
      // money we can't fulfill.
      Alert.alert(
        'Paid pack — coming soon',
        "We're finishing the checkout flow this week. Email support@twomiah.com if you'd like to be notified when it opens.",
      );
      return;
    }
    createOrder.mutate({
      pack_type: pack,
      ship_name: shipName.trim(),
      ship_line1: shipLine1.trim(),
      ship_line2: shipLine2.trim() || null,
      ship_city: shipCity.trim(),
      ship_state: shipState.trim(),
      ship_postal: shipPostal.trim(),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Order stickers"
        subtitle="Card Shop QR stickers — print + ship from us"
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        {allowance?.is_pro ? (
          <View style={styles.allowanceCard}>
            <Ionicons name="sparkles" size={18} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.allowanceTitle}>Pro allowance</Text>
              <Text style={styles.allowanceBody}>
                {allowance.used_this_month
                  ? "You've claimed this month's 25 free stickers. Buy a pack for more."
                  : '25 free stickers available this month — included with Pro.'}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.allowanceCard}>
            <Ionicons name="information-circle" size={18} color={Colors.textMuted} />
            <Text style={styles.allowanceBody}>
              Get 25 free stickers / month with Card Shop Pro. Or buy a paid pack below.
            </Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Pick a pack</Text>
        {PACKS.map((p) => {
          const disabled = p.key === 'pro_allowance' && (!allowance?.is_pro || allowance.used_this_month);
          const selected = pack === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => !disabled && setPack(p.key)}
              activeOpacity={disabled ? 1 : 0.85}
              style={[
                styles.packRow,
                selected ? styles.packRowSelected : null,
                disabled ? styles.packRowDisabled : null,
              ]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={selected ? Colors.accent : Colors.textMuted}
              />
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={[styles.packLabel, disabled ? { color: Colors.textMuted } : null]}>{p.label}</Text>
                <Text style={styles.packNote}>{p.note}</Text>
              </View>
              <Text style={[styles.packPrice, disabled ? { color: Colors.textMuted } : null]}>{p.price}</Text>
            </TouchableOpacity>
          );
        })}

        <Text style={{
          color: Colors.textMuted, fontSize: 12, marginTop: Spacing.sm,
          fontStyle: 'italic',
        }}>
          Larger packs are coming soon \u2014 email support@twomiah.com to be notified.
        </Text>

        <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Ship to</Text>
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

        <Button
          title={pack === 'pro_allowance' ? 'Claim 25 free stickers' : 'Continue to payment'}
          onPress={submit}
          loading={createOrder.isPending}
          style={{ marginTop: Spacing.lg }}
        />

        {orders.length ? (
          <View style={{ marginTop: Spacing.xl }}>
            <Text style={styles.sectionLabel}>Your orders</Text>
            {orders.slice(0, 10).map((o) => (
              <View key={o.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyLabel}>{o.qty} stickers · {o.pack_type.replace('_', ' ')}</Text>
                  <Text style={styles.historyMeta}>
                    {new Date(o.created_at).toLocaleDateString()} · {o.status}
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
  allowanceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  allowanceTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold, marginBottom: 2 },
  allowanceBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18 },
  sectionLabel: {
    color: Colors.textMuted, fontSize: Typography.xs,
    fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginBottom: Spacing.sm,
  },
  packRowSelected: { borderColor: Colors.accent, backgroundColor: Colors.surface2 },
  packRowDisabled: { opacity: 0.5 },
  packLabel: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  packNote: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, lineHeight: 16 },
  packPrice: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.bold, marginLeft: Spacing.sm },
  historyRow: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  historyLabel: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  historyMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
});
