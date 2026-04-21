import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Linking,
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
});

export default IntegrationsScreen;
