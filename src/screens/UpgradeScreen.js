// ============================================================
// Card Shop Pro — upgrade flow.
//
// On iOS/Android with RevenueCat configured: native StoreKit /
// Play Billing purchase via Purchases.purchasePackage(). RevenueCat
// webhooks the backend afterward, which flips
// users.subscription_tier so server-side gating just works.
//
// Fallback: when RevenueCat isn't available (web, dev without
// keys), keep the original Stripe Checkout flow via
// billingApi.checkout(). This is what runs in the dashboard's
// browser context.
//
// Apple/Google take 15-30% on IAP, but Apple requires StoreKit for
// digital subscriptions sold inside the app — there's no shortcut
// without the app getting rejected. Stripe stays for web users.
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { billingApi } from '../services/api';
import { Button, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import {
  isAvailable as rcAvailable,
  getCurrentOffering,
  purchasePackage,
  restorePurchases,
} from '../lib/revenuecat';

const FEATURES = [
  { icon: 'sparkles-outline', title: 'Collection Intelligence', desc: 'Blended values, trend + liquidity signals on every card.' },
  { icon: 'pulse-outline',     title: 'Deal Radar',              desc: 'Custom alerts when a card on your want list hits below market.' },
  { icon: 'albums-outline',    title: 'Unlimited binders',       desc: 'No cap on showcase binders, plus timed and show-floor link types.' },
  { icon: 'analytics-outline', title: 'Per-binder analytics',    desc: 'Views, offers, conversion — see which binders work.' },
  { icon: 'time-outline',      title: 'Price history',           desc: 'Full sold history on every card you own.' },
];

export const UpgradeScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [offering, setOffering] = useState(null);
  const [offeringLoading, setOfferingLoading] = useState(true);

  const { data: status, isLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => billingApi.status().then((r) => r.data),
  });

  // Load the RevenueCat offering on mount when we're on a native
  // platform with a key configured. We use this to display the real
  // store price (which can vary by region — App Store auto-localizes).
  useEffect(() => {
    let cancelled = false;
    if (!rcAvailable()) {
      setOfferingLoading(false);
      return undefined;
    }
    (async () => {
      const o = await getCurrentOffering();
      if (!cancelled) {
        setOffering(o);
        setOfferingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isLoading) return <LoadingScreen />;
  const isPro = status?.tier && status.tier !== 'free';
  const billingReady = !!status?.billing_configured;

  // Pick the monthly package — RevenueCat's standard package
  // identifier is '$rc_monthly'. Fall back to the first available.
  const monthlyPkg = offering?.availablePackages?.find((p) => p.identifier === '$rc_monthly')
    || offering?.monthly
    || offering?.availablePackages?.[0]
    || null;

  const localPrice = monthlyPkg?.product?.priceString || '$4.99/mo';

  // Native IAP path — used when RevenueCat is configured. This is
  // the App Store / Play Store flow Apple requires us to use.
  const startNativePurchase = async () => {
    if (!monthlyPkg) {
      Alert.alert('No subscription available', 'Could not load store products. Try again in a moment.');
      return;
    }
    setOpening(true);
    try {
      const res = await purchasePackage(monthlyPkg);
      if (res.ok) {
        // RevenueCat webhook → backend → DB tier flip can lag 1-15s
        // behind the StoreKit confirm. Without optimistic UI the
        // user lands on a Pro feature, sees free state, and bounces.
        // We invalidate auth-store so the user object reflects Pro
        // immediately, then re-fetch billing status from the server
        // a few times to converge with the webhook.
        const auth = useAuthStore.getState();
        if (auth?.user) {
          auth.setUser?.({ ...auth.user, subscription_tier: 'collector_pro' });
        }
        // Stagger refetches: 1s, 4s, 10s. By the third hit the
        // webhook should have fired even on the slowest path.
        [1000, 4000, 10000].forEach((delay) => setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['billing-status'] });
          qc.invalidateQueries({ queryKey: ['me'] });
        }, delay));
        Alert.alert('Welcome to Pro 🎉', 'Your subscription is active. Pro features are unlocked now.');
      } else if (res.reason !== 'cancelled') {
        Alert.alert('Purchase failed', res.reason || 'Try again.');
      }
    } finally {
      setOpening(false);
    }
  };

  // Stripe Checkout path — used on web or if RevenueCat isn't set up.
  const startStripeCheckout = async () => {
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
        // Should be unreachable in production — every prod build
        // has either RevenueCat (mobile path) or Stripe (web path)
        // wired. If the user lands here it's a server config gap;
        // route them to support, don't tease 'coming soon'.
        Alert.alert(
          'Subscriptions unavailable',
          'Hit a configuration issue on our end. Please email support@twomiah.com so we can get you set up.',
        );
      } else {
        Alert.alert('Could not open checkout', err?.response?.data?.error || err?.message || 'Try again.');
      }
    } finally {
      setOpening(false);
    }
  };

  const startCheckout = () => {
    if (rcAvailable() && monthlyPkg) {
      startNativePurchase();
    } else {
      startStripeCheckout();
    }
  };

  const handleRestore = async () => {
    setOpening(true);
    const res = await restorePurchases();
    setOpening(false);
    if (res.ok) {
      qc.invalidateQueries({ queryKey: ['billing-status'] });
      Alert.alert('Restored', 'Any active Pro entitlement on this Apple/Google ID is now linked.');
    } else if (res.reason !== 'cancelled') {
      Alert.alert('Could not restore', res.reason || 'Try again.');
    }
  };

  const showButton = !isPro;
  const buttonReady = rcAvailable() ? !!monthlyPkg : billingReady;

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
          <Text style={styles.heroTitle}>Power-user tools for serious collectors.</Text>
          <Text style={styles.heroSub}>
            The trade board, transfers, and basic collection stay free for everyone.
            Pro unlocks the data and the alerts.
          </Text>
          {!offeringLoading ? (
            <Text style={styles.priceLabel}>{localPrice}</Text>
          ) : null}
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

        {!buttonReady && !isPro ? (
          <View style={styles.comingSoon}>
            <Text style={styles.comingSoonTitle}>Pro launches soon.</Text>
            <Text style={styles.comingSoonBody}>
              We're validating demand with the free tier first. Your email's on the list.
            </Text>
          </View>
        ) : null}

        {/* Restore link — required by App Store guidelines for any
            app selling subscriptions. Reads receipts from the
            user's Apple ID and unlocks if they already paid. */}
        {rcAvailable() ? (
          <TouchableOpacity onPress={handleRestore} style={styles.restoreLink}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </TouchableOpacity>
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
            title={
              !buttonReady
                ? 'Notify me when Pro opens'
                : `Start Pro · ${localPrice}`
            }
            onPress={startCheckout}
            loading={opening}
            disabled={!buttonReady}
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
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  hero: {
    padding: Spacing.lg, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg, alignItems: 'flex-start',
  },
  heroBadge: {
    backgroundColor: Colors.accent, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: Radius.full, marginBottom: 12,
  },
  heroBadgeText: { color: Colors.bg, fontSize: 11, fontWeight: Typography.bold, letterSpacing: 1 },
  heroTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: 8 },
  heroSub: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 20 },
  priceLabel: {
    color: Colors.accent, fontSize: Typography.xl, fontWeight: Typography.bold,
    marginTop: Spacing.md,
  },
  featureRow: {
    flexDirection: 'row', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  featureTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  featureDesc: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2, lineHeight: 18 },
  comingSoon: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginTop: Spacing.lg,
  },
  comingSoonTitle: { color: Colors.text, fontWeight: Typography.semibold, marginBottom: 4 },
  comingSoonBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 20 },
  restoreLink: { alignItems: 'center', marginTop: Spacing.md, paddingVertical: Spacing.sm },
  restoreText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },
  submitBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: Spacing.base, backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});
