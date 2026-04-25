// "Manage subscription" = one-shot deep link to the Stripe Customer
// Portal. Portal handles payment method, cancel, invoice history —
// everything mobile otherwise can't do directly because Stripe-hosted
// UI is the compliant path.
//
// When Stripe isn't live (STRIPE_SECRET_KEY unset) or the user has
// no stripe_customer_id yet, we show a friendly explanation and a
// link to Pricing instead of a broken button.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { billingApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const SubscriptionManageScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);

  const openPortal = async () => {
    setLoading(true);
    try {
      const res = await billingApi.portalUrl();
      const url = res.data?.url;
      if (!url) throw new Error('No URL returned');
      Linking.openURL(url);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'billing_not_configured') {
        Alert.alert('Billing not enabled yet', 'We\'ll email you when paid subscriptions go live.');
      } else if (code === 'no_stripe_customer') {
        Alert.alert('No subscription yet', 'You haven\'t started a Pro subscription yet. Open Pricing to upgrade.');
      } else {
        Alert.alert('Could not open portal', err?.response?.data?.error || err?.message || 'Try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const tier = user?.subscription_tier || 'free';
  const isPro = tier !== 'free';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Manage subscription"
        subtitle={isPro ? `Current plan: ${tier}` : 'Current plan: Free'}
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.card}>
          <Ionicons name="card" size={28} color={Colors.accent} style={{ marginBottom: Spacing.sm }} />
          <Text style={styles.title}>Subscription & billing</Text>
          <Text style={styles.body}>
            {isPro
              ? 'Update your payment method, download invoices, or cancel from Stripe\'s secure portal. Changes take effect immediately.'
              : 'You\'re on the Free plan. Upgrade to Card Shop Pro ($4.99/mo) to unlock Collection Intelligence, Deal Radar, unlimited binders, and price history on your cards.'}
          </Text>

          {isPro ? (
            <Button
              title={loading ? 'Opening…' : 'Open billing portal'}
              onPress={openPortal}
              disabled={loading}
              style={{ marginTop: Spacing.lg }}
            />
          ) : (
            <Button
              title="View pricing"
              onPress={() => Linking.openURL('https://cardshop.twomiah.com/pricing')}
              style={{ marginTop: Spacing.lg }}
            />
          )}
        </View>

        {isPro ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>What you can do in the portal</Text>
            <InfoRow icon="card-outline" text="Update payment method" />
            <InfoRow icon="receipt-outline" text="Download invoices" />
            <InfoRow icon="refresh-outline" text="Switch between monthly plans" />
            <InfoRow icon="pause-circle-outline" text="Cancel or pause — effective immediately" />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const InfoRow = ({ icon, text }) => (
  <View style={styles.infoRow}>
    <Ionicons name={icon} size={16} color={Colors.textMuted} />
    <Text style={styles.infoText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pad: { padding: Spacing.base },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    marginBottom: Spacing.base,
  },
  title: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: Spacing.xs },
  body: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 20 },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
  },
  infoTitle: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  infoText: { color: Colors.text, fontSize: Typography.sm },
});
