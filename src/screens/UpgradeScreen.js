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
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { billingApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import {
  isAvailable as rcAvailable,
  getCurrentOffering,
  getOfferingByIdentifier,
  purchasePackage,
  restorePurchases,
} from '../lib/revenuecat';

// Map a tier key to the RevenueCat offering identifier configured
// in the dashboard. Pro lives in the `default` (current) offering;
// Show Floor lives in a separate `show_floor` offering so we can
// have $rc_monthly + $rc_annual packages per tier without colliding
// on RC's one-package-per-type-per-offering rule.
const RC_OFFERING_FOR_TIER = {
  collector_pro: null,        // null = current/default
  show_floor:    'show_floor',
};

const TIER_DEFS = {
  collector_pro: {
    label: 'Collector Pro',
    fallbackPrice: '$9.99/mo',
    blurb: 'Power-user collection tools — search, alerts, unlimited binders.',
    features: [
      { icon: 'albums-outline',    title: 'Unlimited binders + sections',  desc: 'No cap on binders. Showcase, timed, and trade-board link types.' },
      { icon: 'pulse-outline',     title: 'Deal Radar',                    desc: 'Push alerts when a want-list card hits below market.' },
      { icon: 'sparkles-outline',  title: 'Live market view',              desc: 'Current ask median + ask-price history on every card. Sold-comp data integrating now.' },
      { icon: 'analytics-outline', title: 'Per-binder analytics',          desc: 'Views, offers, conversion — see which binders work.' },
      { icon: 'time-outline',      title: 'Sold-comp research links',      desc: 'eBay sold + 130 Point search pre-filtered on every card. One tap to verify.' },
    ],
  },
  show_floor: {
    label: 'Show Floor',
    fallbackPrice: '$24.99/mo',
    blurb: 'Everything in Collector Pro, plus the show-event experience.',
    features: [
      { icon: 'storefront-outline', title: 'Live booth at any show',        desc: 'Pick binders, set table number, go live. Buyers walk to your table.' },
      { icon: 'pricetag-outline',   title: 'Show prices set once',          desc: 'Each card\'s show-floor price auto-applies whenever you go live.' },
      { icon: 'qr-code-outline',    title: 'Stock-camera QR stickers',      desc: 'Any phone can scan your case — no app required for buyers.' },
      { icon: 'search-outline',     title: 'Buyer search across the floor', desc: 'Buyers search every live seller\'s inventory at the show in one place.' },
      { icon: 'sparkles-outline',   title: 'Includes everything in Pro',    desc: 'Binders, deal radar, analytics, full price history.' },
    ],
  },
};

export const UpgradeScreen = ({ navigation, route }) => {
  const qc = useQueryClient();
  const [opening, setOpening] = useState(false);
  const [offering, setOffering] = useState(null);
  const [offeringLoading, setOfferingLoading] = useState(true);
  // Picked tier — defaults to whatever the caller passed via route
  // params, then falls back to collector_pro. Most users land here
  // from the home picker's Show Floor upsell so respecting that
  // hint avoids an extra tap.
  const [selectedTier, setSelectedTier] = useState(
    route?.params?.tier === 'show_floor' ? 'show_floor' : 'collector_pro',
  );

  const { data: status, isLoading } = useQuery({
    queryKey: ['billing-status'],
    queryFn: () => billingApi.status().then((r) => r.data),
  });

  // Load the RevenueCat offering whenever the user toggles tiers.
  // Pro reads the current/default offering; Show Floor reads the
  // separate `show_floor` offering. Re-firing on tier change means
  // the price + product reflect the picked tier, not whichever
  // tier was selected on first mount.
  useEffect(() => {
    let cancelled = false;
    if (!rcAvailable()) {
      setOfferingLoading(false);
      return undefined;
    }
    setOfferingLoading(true);
    (async () => {
      const id = RC_OFFERING_FOR_TIER[selectedTier];
      const o = id ? await getOfferingByIdentifier(id) : await getCurrentOffering();
      if (!cancelled) {
        setOffering(o);
        setOfferingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTier]);

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
        // user lands on a paid feature, sees free state, and bounces.
        // We optimistically write the picked tier into auth so the
        // app reflects the entitlement now, then refetch billing
        // status a few times to converge with the webhook.
        const auth = useAuthStore.getState();
        if (auth?.user) {
          auth.setUser?.({ ...auth.user, subscription_tier: selectedTier });
        }
        // Stagger refetches: 1s, 4s, 10s. By the third hit the
        // webhook should have fired even on the slowest path.
        [1000, 4000, 10000].forEach((delay) => setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['billing-status'] });
          qc.invalidateQueries({ queryKey: ['me'] });
        }, delay));
        Alert.alert(
          `Welcome to ${TIER_DEFS[selectedTier].label} 🎉`,
          `Your subscription is active. ${TIER_DEFS[selectedTier].label} features are unlocked now.`,
        );
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
    // iOS / Android MUST go through StoreKit / Play Billing.
    // Apple guideline 3.1.1 forbids any non-IAP purchase path on
    // mobile, including a Stripe-hosted checkout fallback. If
    // RevenueCat doesn't have a package available we tell the
    // user to retry rather than silently routing them to Stripe.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      if (rcAvailable() && monthlyPkg) {
        startNativePurchase();
      } else {
        Alert.alert(
          'Subscription unavailable',
          'We could not load store products right now. Please close the app and try again, or contact support@twomiah.com if it keeps happening.',
        );
      }
      return;
    }
    // Web only — Stripe Checkout is the compliant path off-mobile.
    startStripeCheckout();
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
        <Text style={styles.headerTitle}>Plans & upgrade</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        {/* Tier toggle — Collector Pro vs Show Floor. Local LCS
            is always free and isn't represented here. Stores have
            their own dedicated onboarding flow elsewhere. */}
        <View style={styles.tierToggle}>
          {Object.entries(TIER_DEFS).map(([key, def]) => (
            <TouchableOpacity
              key={key}
              style={[styles.tierToggleBtn, selectedTier === key && styles.tierToggleBtnActive]}
              onPress={() => setSelectedTier(key)}
            >
              <Text style={[styles.tierToggleText, selectedTier === key && styles.tierToggleTextActive]}>
                {def.label}
              </Text>
              <Text style={[styles.tierToggleSub, selectedTier === key && styles.tierToggleSubActive]}>
                {selectedTier === key && !offeringLoading ? localPrice : def.fallbackPrice}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>{TIER_DEFS[selectedTier].label.toUpperCase()}</Text>
          </View>
          <Text style={styles.heroTitle}>{TIER_DEFS[selectedTier].blurb}</Text>
          <Text style={styles.heroSub}>
            Local LCS finder is always free for everyone. Trade groups and basic collection stay free too.
          </Text>
        </View>

        {TIER_DEFS[selectedTier].features.map((f) => (
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
        {isPro && status?.tier === selectedTier ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: Colors.success, fontWeight: Typography.semibold, marginBottom: 4 }}>
              You're on {TIER_DEFS[selectedTier].label} · Thank you
            </Text>
            {status?.current_period_end ? (
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs }}>
                Renews {new Date(status.current_period_end).toLocaleDateString()}
              </Text>
            ) : null}
          </View>
        ) : (
          <Button
            title={`Start ${TIER_DEFS[selectedTier].label} · ${selectedTier === 'collector_pro' ? localPrice : TIER_DEFS[selectedTier].fallbackPrice}`}
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
  tierToggle: {
    flexDirection: 'row', gap: Spacing.xs,
    padding: 4, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.lg,
  },
  tierToggleBtn: {
    flex: 1, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm, alignItems: 'center', gap: 2,
  },
  tierToggleBtnActive: { backgroundColor: Colors.accent },
  tierToggleText: { color: Colors.text, fontWeight: '700', fontSize: Typography.sm },
  tierToggleTextActive: { color: Colors.bg },
  tierToggleSub: { color: Colors.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
  tierToggleSubActive: { color: Colors.bg, opacity: 0.8 },
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
