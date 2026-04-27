// "Manage subscription" — platform-aware compliance screen.
//
// iOS: subscriptions purchased through StoreKit MUST be managed
//      via Apple's Settings app. Linking to Stripe's portal is
//      a direct App Review rejection (Guideline 3.1.1).
// Android: same rule, but via Play Store's subscription page.
// Web (future): Stripe Customer Portal is the right path.
//
// We detect the platform and show the right CTA. The Stripe
// portal path is deliberately hidden on iOS/Android.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useAuthStore } from '../store/authStore';
import { Button, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// Platform-specific subscription management URLs. Apple and
// Google both expose deep-links that drop the user into the
// right settings page for their account, no app-side billing
// needed.
const APPLE_MANAGE_SUBS = 'https://apps.apple.com/account/subscriptions';
const PLAY_MANAGE_SUBS = 'https://play.google.com/store/account/subscriptions';

export const SubscriptionManageScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [loading, setLoading] = useState(false);

  const openSubscriptionSettings = async () => {
    setLoading(true);
    try {
      const url = Platform.OS === 'ios' ? APPLE_MANAGE_SUBS : PLAY_MANAGE_SUBS;
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert(
        'Could not open settings',
        Platform.OS === 'ios'
          ? 'Open Settings \u203A Apple ID \u203A Subscriptions on your device.'
          : 'Open the Play Store app \u203A Menu \u203A Subscriptions.',
      );
    } finally {
      setLoading(false);
    }
  };

  const tier = user?.subscription_tier || 'free';
  const isPro = tier !== 'free';
  const platformName = Platform.OS === 'ios' ? 'Apple' : 'Google Play';

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
              ? `Update payment method, see your renewal date, or cancel through ${platformName}. Changes take effect immediately.`
              : 'You\u2019re on the Free plan. Upgrade to Card Shop Pro ($9.99/mo or $99/yr) to unlock 25 vinyl QR stickers monthly, Collection Intelligence, Deal Radar, and unlimited binders.'}
          </Text>

          {isPro ? (
            <Button
              title={loading ? 'Opening\u2026' : `Manage in ${platformName} Settings`}
              onPress={openSubscriptionSettings}
              disabled={loading}
              style={{ marginTop: Spacing.lg }}
            />
          ) : (
            <Button
              title="See Pro features"
              onPress={() => navigation.navigate('Upgrade')}
              style={{ marginTop: Spacing.lg }}
            />
          )}
        </View>

        {isPro ? (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>What you can do in {platformName} Settings</Text>
            <InfoRow icon="card-outline" text="Update payment method" />
            <InfoRow icon="refresh-outline" text="Switch between monthly and annual" />
            <InfoRow icon="pause-circle-outline" text="Cancel \u2014 effective at the end of the period" />
            <InfoRow icon="receipt-outline" text="See receipts and renewal date" />
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
