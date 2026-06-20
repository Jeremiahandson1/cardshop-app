import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Linking, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { showMessage } from 'react-native-flash-message';

import { ebayApi } from '../services/api';
import { Button, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// expo-web-browser is optional — if it isn't installed we fall back to
// Linking.openURL so the deep-link listener can still close the loop.
let WebBrowser = null;
try {
  // eslint-disable-next-line global-require
  WebBrowser = require('expo-web-browser');
} catch (_e) {
  WebBrowser = null;
}

const REDIRECT_SCHEME = 'cardshop://ebay-connect';

const parseRedirectStatus = (url) => {
  if (!url || typeof url !== 'string') return null;
  const qIdx = url.indexOf('?');
  if (qIdx < 0) return null;
  const query = url.slice(qIdx + 1);
  const params = {};
  query.split('&').forEach((pair) => {
    if (!pair) return;
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return params;
};

const STATUS_COPY = {
  connected: { message: 'eBay connected', type: 'success' },
  denied: { message: 'You denied the eBay connection.', type: 'danger' },
  invalid_request: { message: 'Invalid request from eBay. Please try again.', type: 'danger' },
  state_invalid: { message: 'Connection expired. Please try again.', type: 'danger' },
  exchange_failed: { message: 'eBay token exchange failed. Please try again.', type: 'danger' },
};

const showRedirectToast = (params) => {
  if (!params || !params.status) return;
  const cfg = STATUS_COPY[params.status];
  if (cfg) {
    showMessage({ message: cfg.message, type: cfg.type });
  } else {
    showMessage({ message: `eBay: ${params.status}`, type: 'danger' });
  }
};

// ============================================================
// INTEGRATIONS SCREEN
// ============================================================
export const IntegrationsScreen = ({ navigation }) => {
  const queryClient = useQueryClient();

  const { data: status, isLoading, refetch } = useQuery({
    queryKey: ['ebay', 'status'],
    queryFn: () => ebayApi.getStatus().then((r) => r.data),
  });

  const refetchStatus = () =>
    queryClient.invalidateQueries({ queryKey: ['ebay', 'status'] });

  // ---------- Deep-link listener for OAuth redirect ----------
  // Some platforms/versions of expo-web-browser don't auto-resolve the
  // redirect — this listener is the safety net. Refetch on ANY redirect.
  const subRef = useRef(null);
  useEffect(() => {
    const handler = ({ url }) => {
      if (!url || !url.startsWith('cardshop://ebay-connect')) return;
      const params = parseRedirectStatus(url);
      showRedirectToast(params);
      refetchStatus();
    };
    subRef.current = Linking.addEventListener('url', handler);
    return () => {
      if (subRef.current && typeof subRef.current.remove === 'function') {
        subRef.current.remove();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Mutations ----------
  const waitlistMutation = useMutation({
    mutationFn: () => ebayApi.joinWaitlist().then((r) => r.data),
    onSuccess: () => {
      showMessage({ message: "You're on the list.", type: 'success' });
      refetchStatus();
    },
    onError: (err) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to join waitlist');
    },
  });

  const authorizeMutation = useMutation({
    mutationFn: () => ebayApi.authorize().then((r) => r.data),
    onSuccess: async (data) => {
      const url = data?.authorize_url;
      if (!url) {
        Alert.alert('Error', 'No authorization URL returned.');
        return;
      }
      try {
        if (WebBrowser && typeof WebBrowser.openAuthSessionAsync === 'function') {
          const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_SCHEME);
          if (result?.type === 'success' && result.url) {
            const params = parseRedirectStatus(result.url);
            showRedirectToast(params);
            refetchStatus();
          } else {
            // dismiss/cancel — still refetch in case the listener fired
            refetchStatus();
          }
        } else {
          // No expo-web-browser available — fall back; the Linking listener
          // will handle the redirect back into the app.
          await Linking.openURL(url);
        }
      } catch (e) {
        Alert.alert('Error', 'Could not open eBay authorization.');
      }
    },
    onError: (err) => {
      const body = err?.response?.data;
      if (err?.response?.status === 503 && body?.status === 'feature_not_yet_available') {
        Alert.alert('Coming Soon', 'eBay Connect is not yet available. Join the waitlist to be notified.');
        refetchStatus();
        return;
      }
      Alert.alert('Error', body?.error || 'Failed to start eBay connection');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => ebayApi.disconnect().then((r) => r.data),
    onSuccess: () => {
      showMessage({ message: 'Disconnected from eBay', type: 'default' });
      refetchStatus();
    },
    onError: (err) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to disconnect');
    },
  });

  // ---------- Sync: summary, import, cross-post ----------
  const connectedNow = !!status?.connected;
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ['ebay', 'summary'],
    queryFn: () => ebayApi.summary().then((r) => r.data),
    enabled: connectedNow,
  });
  const counts = summary?.counts || {};
  const writeEnabled = !!status?.feature_enabled || !!summary?.listing_write_enabled;

  const [jobId, setJobId] = useState(null);
  const [job, setJob] = useState(null);
  const jobTimer = useRef(null);

  const importMutation = useMutation({
    mutationFn: () => ebayApi.importStart().then((r) => r.data),
    onSuccess: (data) => {
      setJobId(data.job_id);
      showMessage({ message: data.already_running ? 'Import already running' : 'Import started', type: 'success' });
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.error || 'Could not start import'),
  });

  const [publicUsername, setPublicUsername] = useState('');
  const publicImportMutation = useMutation({
    mutationFn: () => ebayApi.importPublicStart(publicUsername.trim()).then((r) => r.data),
    onSuccess: (data) => {
      setJobId(data.job_id);
      showMessage({ message: `Importing from @${data.username || publicUsername}…`, type: 'success' });
    },
    onError: (err) => Alert.alert('Error', err?.response?.data?.error || 'Could not start import'),
  });

  useEffect(() => {
    if (!jobId) return undefined;
    const tick = async () => {
      try {
        const data = await ebayApi.importJob(jobId).then((r) => r.data.job);
        setJob(data);
        if (['committed', 'failed'].includes(data.status)) {
          clearInterval(jobTimer.current);
          refetchSummary();
        }
      } catch (_) { /* keep polling */ }
    };
    tick();
    jobTimer.current = setInterval(tick, 3000);
    return () => clearInterval(jobTimer.current);
  }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [maxDollars, setMaxDollars] = useState('');
  const [crossposting, setCrossposting] = useState(false);

  const excludeMutation = useMutation({
    mutationFn: (cents) => ebayApi.syncSettings({ enabled: false, min_price_cents: cents }).then((r) => r.data),
    onSuccess: (d) => { showMessage({ message: `Excluded ${d.updated} listing(s)`, type: 'success' }); refetchSummary(); },
    onError: () => Alert.alert('Error', 'Could not update sync settings'),
  });

  const runCrosspost = async () => {
    setCrossposting(true);
    try {
      const maxCents = maxDollars ? Math.round(Number(maxDollars) * 100) : undefined;
      let guard = 0; let posted = 0; let failed = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        guard += 1;
        const r = await ebayApi.crosspost({ all: true, max_price_cents: maxCents, batch_size: 25 }).then((x) => x.data);
        posted += r.posted; failed += r.failed;
        if (r.remaining <= 0 || r.processed === 0 || guard > 400) break;
      }
      showMessage({ message: `Cross-post done: ${posted} listed${failed ? `, ${failed} failed` : ''}`, type: 'success' });
      refetchSummary();
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Cross-post failed');
    } finally {
      setCrossposting(false);
    }
  };

  if (isLoading) return <LoadingScreen message="Loading integrations..." />;

  const connected = !!status?.connected;
  const featureEnabled = !!status?.feature_enabled;
  const onWaitlist = !!status?.on_waitlist;
  const env = status?.env;

  // ---------- Sub-copy helpers ----------
  let connectedAgo = null;
  if (connected && status?.connected_at) {
    try {
      connectedAgo = formatDistanceToNow(new Date(status.connected_at), { addSuffix: true });
    } catch (_) {
      connectedAgo = null;
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Integrations</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}>
        {/* eBay card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.logoBubble}>
              <Ionicons name="pricetags-outline" size={20} color={Colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Text style={styles.serviceName}>eBay</Text>
                {!featureEnabled && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Coming Soon</Text>
                  </View>
                )}
                {featureEnabled && connected && (
                  <View style={styles.connectedBadge}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedBadgeText}>Connected</Text>
                  </View>
                )}
                {featureEnabled && env === 'sandbox' && (
                  <View style={styles.sandboxBadge}>
                    <Text style={styles.sandboxBadgeText}>Sandbox</Text>
                  </View>
                )}
              </View>
              <Text style={styles.subLine}>
                {connected
                  ? `Connected as @${status?.ebay_username || 'ebay_user'}`
                  : featureEnabled
                    ? 'Not connected'
                    : 'Sell cards directly to eBay from your Card Shop listings. Launching soon.'}
              </Text>
              {connected && connectedAgo && (
                <Text style={styles.metaLine}>Connected {connectedAgo}</Text>
              )}
            </View>
          </View>

          {/* Actions */}
          <View style={{ marginTop: Spacing.base }}>
            {!featureEnabled && !onWaitlist && (
              <Button
                title="Join Waitlist"
                onPress={() => waitlistMutation.mutate()}
                loading={waitlistMutation.isPending}
              />
            )}
            {!featureEnabled && onWaitlist && (
              <View style={styles.waitlistChip}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={styles.waitlistChipText}>On Waitlist</Text>
              </View>
            )}

            {featureEnabled && !connected && (
              <Button
                title="Connect eBay"
                onPress={() => authorizeMutation.mutate()}
                loading={authorizeMutation.isPending}
              />
            )}

            {featureEnabled && connected && (
              <Button
                title="Disconnect"
                variant="secondary"
                onPress={() =>
                  Alert.alert(
                    'Disconnect eBay?',
                    'You will need to reconnect before listing cards to eBay.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Disconnect',
                        style: 'destructive',
                        onPress: () => disconnectMutation.mutate(),
                      },
                    ]
                  )
                }
                loading={disconnectMutation.isPending}
              />
            )}
          </View>
        </View>

        {/* Quick import — no eBay login required (public listings) */}
        <View style={[styles.card, { marginTop: Spacing.base }]}>
          <Text style={styles.serviceName}>Quick import — no login</Text>
          <Text style={styles.subLine}>
            Have a public eBay store? Enter the username and we'll pull the listings into your
            inventory as drafts. No account connection needed.
          </Text>
          <View style={styles.priceRow}>
            <TextInput
              style={styles.priceInput}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="eBay username"
              placeholderTextColor={Colors.textDim}
              value={publicUsername}
              onChangeText={setPublicUsername}
            />
            <TouchableOpacity
              style={[styles.smallBtn, !publicUsername.trim() && { opacity: 0.5 }]}
              disabled={!publicUsername.trim() || publicImportMutation.isPending}
              onPress={() => publicImportMutation.mutate()}
            >
              <Text style={styles.smallBtnText}>{publicImportMutation.isPending ? '…' : 'Import'}</Text>
            </TouchableOpacity>
          </View>

          {job && ['running', 'committing'].includes(job.status) && (
            <View style={styles.progressRow}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.metaLine}>
                Importing… {job.imported} in · {job.matched} matched · {job.low_confidence} to review
              </Text>
            </View>
          )}
          {job && job.status === 'committed' && (
            <Text style={[styles.metaLine, { color: Colors.success, marginTop: Spacing.sm }]}>
              ✓ Imported {job.imported} cards ({job.listings_created} drafts). {job.low_confidence} need review.
            </Text>
          )}
        </View>

        {/* Sync tools — only once connected */}
        {connected && (
          <>
            <View style={[styles.card, { marginTop: Spacing.base }]}>
              <Text style={styles.serviceName}>Import from eBay</Text>
              <Text style={styles.subLine}>
                Pulls your active eBay listings — prices, condition, and photos — into your
                inventory as drafts. Nothing publishes until you review them.
              </Text>

              {job && ['running', 'committing'].includes(job.status) && (
                <View style={styles.progressRow}>
                  <ActivityIndicator color={Colors.accent} />
                  <Text style={styles.metaLine}>
                    Importing… {job.imported} in · {job.matched} matched · {job.low_confidence} to review
                  </Text>
                </View>
              )}
              {job && job.status === 'committed' && (
                <Text style={[styles.metaLine, { color: Colors.success, marginTop: Spacing.sm }]}>
                  ✓ Imported {job.imported} cards ({job.listings_created} drafts). {job.low_confidence} need review.
                </Text>
              )}
              {job && job.status === 'failed' && (
                <Text style={[styles.metaLine, { color: Colors.error, marginTop: Spacing.sm }]}>
                  Import failed: {job.error || 'unknown error'}
                </Text>
              )}

              <View style={{ marginTop: Spacing.base }}>
                <Button
                  title="Import my eBay listings"
                  onPress={() => importMutation.mutate()}
                  loading={importMutation.isPending}
                  disabled={job && ['running', 'committing'].includes(job.status)}
                />
              </View>
            </View>

            <View style={[styles.card, { marginTop: Spacing.base }]}>
              <Text style={styles.serviceName}>Cross-post to eBay</Text>
              <Text style={styles.subLine}>
                {(counts.crosspost_pending || 0)} active card(s) ready to list on eBay ·
                {' '}{(counts.sync_excluded || 0)} excluded.
              </Text>

              {!writeEnabled && (
                <Text style={[styles.metaLine, { color: Colors.warning, marginTop: Spacing.sm }]}>
                  Listing to eBay is turned off server-side. Import and sync still work.
                </Text>
              )}

              <Text style={[styles.metaLine, { marginTop: Spacing.base }]}>Keep cards over this price OFF eBay</Text>
              <View style={styles.priceRow}>
                <Text style={styles.dollar}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="numeric"
                  placeholder="200"
                  placeholderTextColor={Colors.textDim}
                  value={maxDollars}
                  onChangeText={setMaxDollars}
                />
                <TouchableOpacity
                  style={[styles.smallBtn, !maxDollars && { opacity: 0.5 }]}
                  disabled={!maxDollars || excludeMutation.isPending}
                  onPress={() => excludeMutation.mutate(Math.round(Number(maxDollars) * 100))}
                >
                  <Text style={styles.smallBtnText}>Exclude</Text>
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: Spacing.base }}>
                <Button
                  title={crossposting ? 'Posting…' : `Cross-post ${counts.crosspost_pending || 0} to eBay`}
                  onPress={runCrosspost}
                  loading={crossposting}
                  disabled={!writeEnabled || !counts.crosspost_pending}
                />
              </View>
            </View>
          </>
        )}

        <Text style={styles.footnote}>
          We never see or store your eBay password. Connections use eBay's
          official OAuth and can be revoked at any time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.base,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  logoBubble: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.accent + '22',
    alignItems: 'center', justifyContent: 'center',
  },
  serviceName: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  subLine: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 4, lineHeight: 20 },
  metaLine: { color: Colors.textDim, fontSize: Typography.xs, marginTop: 2 },
  comingSoonBadge: {
    backgroundColor: Colors.accent4 + '22', borderWidth: 1, borderColor: Colors.accent4 + '66',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  comingSoonText: { color: Colors.accent4, fontSize: Typography.xs, fontWeight: Typography.semibold },
  connectedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.success + '22', borderWidth: 1, borderColor: Colors.success + '66',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  connectedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.success },
  connectedBadgeText: { color: Colors.success, fontSize: Typography.xs, fontWeight: Typography.semibold },
  sandboxBadge: {
    backgroundColor: Colors.warning + '22', borderWidth: 1, borderColor: Colors.warning + '66',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  sandboxBadgeText: { color: Colors.warning, fontSize: Typography.xs, fontWeight: Typography.semibold },
  waitlistChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.success + '15', borderWidth: 1, borderColor: Colors.success + '55',
    borderRadius: Radius.md, paddingVertical: Spacing.md, opacity: 0.9,
  },
  waitlistChipText: { color: Colors.success, fontSize: Typography.base, fontWeight: Typography.semibold },
  footnote: {
    color: Colors.textDim, fontSize: Typography.xs,
    marginTop: Spacing.lg, textAlign: 'center', lineHeight: 18,
  },
  progressRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md,
  },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs,
  },
  dollar: { color: Colors.textMuted, fontSize: Typography.base },
  priceInput: {
    flex: 1, backgroundColor: Colors.bg, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: Typography.base,
  },
  smallBtn: {
    backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent + '66',
    borderRadius: Radius.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  smallBtnText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },
});

export default IntegrationsScreen;
