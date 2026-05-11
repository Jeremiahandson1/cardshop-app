// Wallet — marketplace Phase 2A.
//
// One screen with three layers:
//   1. Onboarding banner if Stripe Connect KYC isn't done
//   2. Balance card + Withdraw / Add Funds buttons
//   3. Ledger history (paginated)

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, Linking, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { walletApi } from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

export const WalletScreen = ({ navigation }) => {
  const qc = useQueryClient();

  const { data: summary, isLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: () => walletApi.summary(),
  });

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ['wallet-history'],
    queryFn: () => walletApi.history({ limit: 50 }),
  });

  const onboardMut = useMutation({
    mutationFn: () => walletApi.startOnboarding({
      return_url: 'cardshop://wallet/return',
      refresh_url: 'cardshop://wallet/refresh',
    }),
    onSuccess: async (out) => {
      if (out.url) {
        await WebBrowser.openBrowserAsync(out.url);
        // When user returns, refetch.
        setTimeout(() => qc.invalidateQueries({ queryKey: ['wallet-summary'] }), 1500);
      }
    },
    onError: (err) => Alert.alert('Onboarding failed', err.response?.data?.error || err.message),
  });

  const dashboardMut = useMutation({
    mutationFn: () => walletApi.openDashboard(),
    onSuccess: async (out) => {
      if (out.url) await WebBrowser.openBrowserAsync(out.url);
    },
    onError: (err) => Alert.alert('Could not open Stripe dashboard', err.response?.data?.error || err.message),
  });

  if (isLoading) return <LoadingScreen message="Loading wallet…" />;

  // Three states:
  //   1. Stripe not configured at all (deploy gap) — show graceful empty state
  //   2. Configured but user not onboarded — show CTA
  //   3. Onboarded — show balance + history
  const notConfigured = !summary?.configured;
  const notOnboarded = summary?.configured && !summary?.onboarded;

  const onRefresh = async () => {
    await Promise.all([refetchSummary(), refetchHistory()]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Wallet" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={Colors.text} />}
      >
        {notConfigured ? (
          <EmptyState
            icon="💸"
            title="Marketplace coming soon"
            message="Card Shop's marketplace is being rolled out. Check back soon."
          />
        ) : notOnboarded ? (
          <OnboardingCard
            status={summary?.connected_account_status}
            requirements={summary?.requirements_due}
            onStart={() => onboardMut.mutate()}
            loading={onboardMut.isPending}
          />
        ) : (
          <>
            <BalanceCard
              available={summary.balance.available_cents}
              pending={summary.balance.pending_cents}
              onWithdraw={() => navigation.navigate('Payout')}
              onTopup={() => navigation.navigate('Topup')}
              onDashboard={() => dashboardMut.mutate()}
              dashboardLoading={dashboardMut.isPending}
            />

            <Text style={styles.sectionLabel}>HISTORY</Text>
            {!history?.entries?.length ? (
              <EmptyState
                icon="📒"
                title="No activity yet"
                message="Sales, purchases, and payouts will show up here."
              />
            ) : (
              <View style={styles.historyCard}>
                {history.entries.map((e) => (
                  <LedgerRow key={e.id} entry={e} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const OnboardingCard = ({ status, requirements, onStart, loading }) => {
  // Stripe Connect Express has several intermediate states between
  // "never started" and "fully enabled." We render different copy
  // for each so the user isn't told to "Start verification" when
  // they already finished the form and Stripe is just reviewing.
  //
  //   'none'       — no Stripe account exists yet → start onboarding
  //   'disabled'   — Stripe is reviewing the submitted KYC form
  //                  (typical for 24h–3 business days post-submit)
  //   'pending'    — Stripe needs more info from the user
  //   'restricted' — Stripe restricted the account; needs attention
  //   'enabled'    — fully onboarded (this card shouldn't render then)
  const hasReqs = requirements?.length > 0;
  const isReview = status === 'disabled' && !hasReqs;
  const needsMoreInfo = status === 'pending' || hasReqs;
  const isRestricted = status === 'restricted';

  let title, body, ctaLabel, showCta;
  if (isReview) {
    title = "We're verifying your account";
    body = "Stripe is reviewing your information. Payments and payouts unlock automatically once they approve — usually within 24 hours, sometimes up to 3 business days. You'll get an email when it's done.";
    ctaLabel = null;
    showCta = false;
  } else if (needsMoreInfo) {
    title = 'A few more details needed';
    body = "Stripe needs additional information to finish verifying your account. Continue where you left off and they'll let you through.";
    ctaLabel = 'Continue verification';
    showCta = true;
  } else if (isRestricted) {
    title = 'Your account needs attention';
    body = 'Stripe placed a hold on your seller account. Open Stripe to see what they need and resolve it.';
    ctaLabel = 'Open Stripe';
    showCta = true;
  } else {
    title = 'Set up your wallet';
    body = "To sell on Card Shop, finish a quick verification with our payment partner Stripe. Takes about 3 minutes — they'll ask for an ID and bank info to send you payouts.";
    ctaLabel = loading ? 'Opening Stripe…' : 'Start verification';
    showCta = true;
  }

  return (
    <View style={styles.kycCard}>
      <Ionicons
        name={isReview ? 'time-outline' : isRestricted ? 'warning-outline' : 'card-outline'}
        size={36}
        color={Colors.accent}
        style={{ alignSelf: 'center' }}
      />
      <Text style={styles.kycTitle}>{title}</Text>
      <Text style={styles.kycBody}>{body}</Text>
      {status && status !== 'none' && !isReview && (
        <Text style={styles.kycStatus}>Status: {status}</Text>
      )}
      {hasReqs && (
        <Text style={styles.kycReqs}>Still needed: {requirements.join(', ')}</Text>
      )}
      {showCta && (
        <Button title={ctaLabel} onPress={onStart} disabled={loading} />
      )}
    </View>
  );
};

const BalanceCard = ({ available, pending, onWithdraw, onTopup, onDashboard, dashboardLoading }) => (
  <View style={styles.balanceCard}>
    <Text style={styles.balanceLabel}>Available balance</Text>
    <Text style={styles.balanceAmount}>{usd(available)}</Text>
    {pending > 0 && (
      <Text style={styles.balancePending}>+ {usd(pending)} pending</Text>
    )}
    <View style={styles.balanceActions}>
      <Button
        title="Withdraw"
        onPress={onWithdraw}
        disabled={available < 100}
        variant="primary"
        style={{ flex: 1 }}
      />
      <Button title="Add funds" onPress={onTopup} variant="ghost" style={{ flex: 1 }} />
    </View>
    <TouchableOpacity onPress={onDashboard} disabled={dashboardLoading} style={styles.dashboardLink}>
      {dashboardLoading
        ? <ActivityIndicator size="small" color={Colors.textMuted} />
        : <Text style={styles.dashboardText}>Tax forms & bank details ↗</Text>}
    </TouchableOpacity>
  </View>
);

const LedgerRow = ({ entry }) => {
  const isCredit = entry.direction === 'credit';
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons
          name={isCredit ? 'arrow-down-circle' : 'arrow-up-circle'}
          size={28}
          color={isCredit ? Colors.accent2 : Colors.accent3}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowDescription}>
          {entry.description || sourceLabel(entry.source)}
        </Text>
        <Text style={styles.rowSubtext}>{new Date(entry.created_at).toLocaleString()}</Text>
      </View>
      <Text style={[styles.rowAmount, { color: isCredit ? Colors.accent2 : Colors.accent3 }]}>
        {isCredit ? '+' : '−'}{usd(entry.amount_cents)}
      </Text>
    </View>
  );
};

function sourceLabel(s) {
  return ({
    sale: 'Sale',
    purchase: 'Purchase',
    payout: 'Withdrawal',
    topup: 'Added funds',
    refund: 'Refund',
    adjustment: 'Adjustment',
    platform_fee: 'Platform fee',
    stripe_fee: 'Processing fee',
  })[s] || s;
}

// ============================================================
// PAYOUT SCREEN
// ============================================================
export const PayoutScreen = ({ navigation }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('standard');
  const qc = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['wallet-summary'],
    queryFn: () => walletApi.summary(),
  });

  const payoutMut = useMutation({
    mutationFn: ({ cents, method }) => walletApi.payout({ amount_cents: cents, method }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet-summary'] });
      qc.invalidateQueries({ queryKey: ['wallet-history'] });
      Alert.alert('Withdrawal started',
        method === 'instant'
          ? 'Funds should arrive within 30 minutes.'
          : 'Funds typically arrive in 2-3 business days.');
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Withdraw failed', err.response?.data?.error || err.message),
  });

  const cents = Math.round(parseFloat(amount || '0') * 100);
  const valid = cents >= 100 && cents <= (summary?.balance?.available_cents || 0);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Withdraw" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.balanceMini}>
          <Text style={styles.miniLabel}>Available</Text>
          <Text style={styles.miniAmount}>{usd(summary?.balance?.available_cents || 0)}</Text>
        </View>

        <Text style={styles.label}>Amount (USD)</Text>
        <View style={styles.amountInput}>
          <Text style={styles.amountPrefix}>$</Text>
          <Text
            style={styles.amountText}
            numberOfLines={1}
          >{amount || '0.00'}</Text>
        </View>
        <NumPad value={amount} onChange={setAmount} />

        <Text style={styles.label}>Method</Text>
        <View style={styles.methodRow}>
          <MethodChoice
            active={method === 'standard'}
            onPress={() => setMethod('standard')}
            title="Standard"
            sub="Free · 2-3 business days"
          />
          <MethodChoice
            active={method === 'instant'}
            onPress={() => setMethod('instant')}
            title="Instant"
            sub="Stripe's $0.10 + 1.5% · ~30 min"
          />
        </View>

        <Button
          title={payoutMut.isPending ? 'Processing…' : `Withdraw ${usd(cents)}`}
          onPress={() => payoutMut.mutate({ cents, method })}
          disabled={!valid || payoutMut.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// TOPUP SCREEN
// ============================================================
export const TopupScreen = ({ navigation }) => {
  const [amount, setAmount] = useState('');
  const cents = Math.round(parseFloat(amount || '0') * 100);
  const stripeFee = Math.round(cents * 0.029) + 30;
  const net = cents - stripeFee;
  const valid = cents >= 500;

  const topupMut = useMutation({
    mutationFn: ({ cents }) => walletApi.topup({ amount_cents: cents }),
    onSuccess: async (out) => {
      if (!out.checkoutUrl) {
        Alert.alert('Top-up error', 'No checkout URL returned.');
        return;
      }
      try {
        await WebBrowser.openBrowserAsync(out.checkoutUrl);
      } catch (e) {
        try { await Linking.openURL(out.checkoutUrl); }
        catch { Alert.alert('Could not open checkout', e.message); return; }
      }
      // Refetch summary on return — webhook usually lands within seconds.
      setTimeout(() => navigation.goBack(), 800);
    },
    onError: (err) => Alert.alert('Top-up failed', err.response?.data?.error || err.message),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Add funds" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>Amount (USD)</Text>
        <View style={styles.amountInput}>
          <Text style={styles.amountPrefix}>$</Text>
          <Text style={styles.amountText}>{amount || '0.00'}</Text>
        </View>
        <NumPad value={amount} onChange={setAmount} />

        {valid && (
          <View style={styles.feePreview}>
            <Text style={styles.feeRow}>You pay: {usd(cents)}</Text>
            <Text style={styles.feeRow}>Stripe processing: −{usd(stripeFee)}</Text>
            <Text style={[styles.feeRow, styles.feeNet]}>Lands in wallet: {usd(net)}</Text>
          </View>
        )}

        <Button
          title={topupMut.isPending ? 'Creating…' : `Add ${usd(cents)}`}
          onPress={() => topupMut.mutate({ cents })}
          disabled={!valid || topupMut.isPending}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const MethodChoice = ({ active, onPress, title, sub }) => (
  <TouchableOpacity
    style={[styles.methodChoice, active && styles.methodChoiceActive]}
    onPress={onPress}
  >
    <Text style={[styles.methodTitle, active && { color: Colors.bg }]}>{title}</Text>
    <Text style={[styles.methodSub, active && { color: Colors.bg }]}>{sub}</Text>
  </TouchableOpacity>
);

const NumPad = ({ value, onChange }) => {
  const press = (k) => {
    if (k === '⌫') return onChange(value.slice(0, -1));
    if (k === '.' && value.includes('.')) return;
    if (k === '.' && value === '') return onChange('0.');
    onChange(value + k);
  };
  const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫'];
  return (
    <View style={styles.numpad}>
      {KEYS.map((k) => (
        <TouchableOpacity key={k} style={styles.numKey} onPress={() => press(k)}>
          <Text style={styles.numKeyText}>{k}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: 40 },

  kycCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
    gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  kycTitle: { ...Typography.h2, color: Colors.text, textAlign: 'center' },
  kycBody: { ...Typography.body, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md },
  kycStatus: { color: Colors.textDim, textAlign: 'center', fontSize: 13 },
  kycReqs: { color: Colors.accent3, textAlign: 'center', fontSize: 12, fontStyle: 'italic' },

  balanceCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg, padding: Spacing.lg,
    marginBottom: Spacing.lg, alignItems: 'center', gap: Spacing.sm,
  },
  balanceLabel: { color: Colors.textMuted, fontSize: 12, letterSpacing: 1 },
  balanceAmount: { fontSize: 42, fontWeight: '700', color: Colors.text },
  balancePending: { color: Colors.textMuted, fontSize: 13 },
  balanceActions: { flexDirection: 'row', gap: Spacing.sm, width: '100%', marginTop: Spacing.md },
  dashboardLink: { marginTop: Spacing.sm },
  dashboardText: { color: Colors.accent2, fontSize: 13 },

  sectionLabel: {
    color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  historyCard: { backgroundColor: Colors.surface, borderRadius: Radius.lg, overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowIcon: { width: 36, alignItems: 'center' },
  rowDescription: { color: Colors.text, fontSize: 14 },
  rowSubtext: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: '600' },

  balanceMini: {
    backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.md,
    marginBottom: Spacing.lg, alignItems: 'center',
  },
  miniLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1 },
  miniAmount: { ...Typography.h2, color: Colors.text, marginTop: 4 },

  label: { color: Colors.textMuted, fontSize: 12, letterSpacing: 1, marginBottom: Spacing.xs, marginTop: Spacing.md },
  amountInput: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
  },
  amountPrefix: { color: Colors.textMuted, fontSize: 28 },
  amountText: { color: Colors.text, fontSize: 32, fontWeight: '600' },

  numpad: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    marginTop: Spacing.md, marginBottom: Spacing.lg,
  },
  numKey: {
    width: '32%', height: 56, borderRadius: Radius.md, marginBottom: Spacing.xs,
    backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  numKeyText: { color: Colors.text, fontSize: 24 },

  methodRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  methodChoice: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  methodChoiceActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  methodTitle: { color: Colors.text, fontWeight: '600' },
  methodSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  feePreview: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    marginBottom: Spacing.md, gap: 4,
  },
  feeRow: { color: Colors.textMuted, fontSize: 13 },
  feeNet: { color: Colors.text, fontWeight: '600', marginTop: Spacing.xs },
});
