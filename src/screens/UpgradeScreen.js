// ============================================================
// Card Shop Pro — upgrade flow.
//
// Opens a Stripe-hosted Checkout URL via Linking.openURL. We
// intentionally don't implement native in-app payment (would need
// Apple/Google 15-30% cut on IAP). Stripe Checkout in a browser
// keeps ~97% of revenue.
//
// While Stripe isn't configured (STRIPE_SECRET_KEY unset on the
// API), the screen shows a "coming soon" state so the button is
// visible as a future promise without hard-erroring today.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../services/api';
import { Button, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const FEATURES = [
  { icon: 'sparkles-outline', title: 'Portfolio Intelligence', desc: 'Blended values, trend + liquidity signals on every card.' },
  { icon: 'albums-outline',    title: 'Unlimited binders',      desc: 'No cap on showcase binders or cards per binder.' },
  { icon: 'scan-outline',      title: 'Fast bulk intake',       desc: 'Priority queue for photo verification + catalog matching.' },
  { icon: 'pulse-outline',     title: 'Deal Radar',             desc: 'Custom alerts when a card in your want list hits the board.' },
  { icon: 'analytics-outline', title: 'Deeper comp history',    desc: 'Full sold history from our premium providers (when subscribed).' },
];

export const UpgradeScreen = ({ navigation }) => {
  const [opening, setOpening] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => billingApi.status().then((r) => r.data),
  });

  if (isLoading) return <LoadingScreen />;
  const isPro = status?.tier && status.tier !== 'free';
  const billingReady = !!status?.billing_configured;

  const startCheckout = async () => {
    try {
      setOpening(true);
      const res = await billingApi.checkout({
        successUrl: 'cardshop://profile?billing=success',
        cancelUrl:  'cardshop://profile?billing=cancel',
      });
      const url = res.data?.url;
      if (!url) throw new Error('Stripe did not return a checkout URL.');
      await Linking.openURL(url);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'billing_not_configured') {
        Alert.alert('Coming soon', "Pro isn't live yet. We'll email you when it opens.");
      } else {
        Alert.alert('Could not open checkout', err?.response?.data?.error || err?.message || 'Try again.');
      }
    } finally {
      setOpening(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card Shop Pro</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>PRO</Text>
          </View>
          <Text style={styles.heroTitle}>Everything in Card Shop, plus the serious-collector tools.</Text>
          <Text style={styles.heroSub}>
            The trade board and basic collection tracking stay free for everyone. Pro is for when you want the data.
          </Text>
        </View>

        {FEATURES.map((f) => (
          <View key={f.title} style={styles.featureRow}>
            <Ionicons name={f.icon} size={22} color={Colors.accent} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureDesc}>{f.desc}</Text>
            </View>
          </View>
        ))}

        {!billingReady ? (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonTitle}>Pro launches soon.</Text>
            <Text style={styles.comingSoonBody}>
              We're validating demand with the free tier first. Want to be in the first wave? Your email is already on the list.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.submitBar}>
        {isPro ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: Colors.success, fontWeight: Typography.semibold, marginBottom: 4 }}>
              You're on Pro · Thank you
            </Text>
            {status?.current_period_end ? (
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs }}>
                Renews {new Date(status.current_period_end).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        ) : (
          <Button
            title={billingReady ? 'Start Pro' : 'Notify me when Pro opens'}
            onPress={startCheckout}
            loading={opening}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: {
    color: Colors.text, fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  hero: {
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg,
    alignItems: 'flex-start',
  },
  heroBadge: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: Radius.full,
    marginBottom: 12,
  },
  heroBadgeText: {
    color: Colors.bg, fontSize: 11, fontWeight: '800', letterSpacing: 1.5,
  },
  heroTitle: {
    color: Colors.text, fontSize: 22,
    fontWeight: Typography.semibold,
    marginBottom: 8, lineHeight: 28,
  },
  heroSub: {
    color: Colors.textMuted, fontSize: 14, lineHeight: 20,
  },

  featureRow: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  featureTitle: {
    color: Colors.text, fontSize: 15,
    fontWeight: Typography.semibold, marginBottom: 3,
  },
  featureDesc: {
    color: Colors.textMuted, fontSize: 13, lineHeight: 18,
  },

  comingSoon: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: Colors.accent + '15',
    borderWidth: 1, borderColor: Colors.accent + '55',
    borderRadius: Radius.md,
  },
  comingSoonTitle: {
    color: Colors.accent, fontWeight: Typography.semibold,
    fontSize: 14, marginBottom: 4,
  },
  comingSoonBody: {
    color: Colors.textMuted, fontSize: 13, lineHeight: 18,
  },

  submitBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: Spacing.base,
    backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});
