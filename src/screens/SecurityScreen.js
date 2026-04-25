// Security settings — 2FA (TOTP) management on mobile.
// Mirrors the dashboard /security page surface for parity.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Image, Share, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';

import { twoFactorApi } from '../services/api';
import { Button, Input, ScreenHeader, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const SecurityScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [setupData, setSetupData] = useState(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: () => twoFactorApi.status().then((r) => r.data),
  });

  const setupMut = useMutation({
    mutationFn: () => twoFactorApi.setup().then((r) => r.data),
    onSuccess: (data) => setSetupData(data),
    onError: (err) => Alert.alert('Setup failed', err?.response?.data?.error || err?.message),
  });
  const verifyMut = useMutation({
    mutationFn: () => twoFactorApi.verify(verifyCode).then((r) => r.data),
    onSuccess: (data) => {
      setBackupCodes(data.backup_codes);
      setSetupData(null);
      setVerifyCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
    },
    onError: (err) => Alert.alert('Wrong code', err?.response?.data?.error || err?.message),
  });
  const disableMut = useMutation({
    mutationFn: () => twoFactorApi.disable(disablePassword, disableCode).then((r) => r.data),
    onSuccess: () => {
      setShowDisable(false);
      setDisablePassword('');
      setDisableCode('');
      qc.invalidateQueries({ queryKey: ['2fa-status'] });
      Alert.alert('2FA disabled', 'Your account no longer requires a 2FA code to sign in.');
    },
    onError: (err) => Alert.alert('Disable failed', err?.response?.data?.error || err?.message),
  });

  const copySecret = async () => {
    if (!setupData?.secret) return;
    await Clipboard.setStringAsync(setupData.secret);
    Alert.alert('Copied', 'Secret copied to clipboard.');
  };
  const copyBackupCodes = async () => {
    if (!backupCodes) return;
    await Clipboard.setStringAsync(backupCodes.join('\n'));
    Alert.alert('Copied', 'Backup codes copied.');
  };
  const shareBackupCodes = async () => {
    if (!backupCodes) return;
    await Share.share({
      message: `Card Shop 2FA backup codes (keep private):\n\n${backupCodes.join('\n')}`,
    });
  };

  if (isLoading) return <LoadingScreen />;

  const enabled = !!status?.enabled;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Security"
        subtitle="Two-factor authentication"
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />

      <ScrollView contentContainerStyle={styles.pad}>
        {/* Status card */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons
              name={enabled ? 'shield-checkmark' : 'shield-outline'}
              size={32}
              color={enabled ? Colors.success : Colors.textMuted}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.cardTitle}>
                2FA is {enabled ? 'ON' : 'off'}
              </Text>
              <Text style={styles.cardBody}>
                {enabled
                  ? `Each sign-in needs a 6-digit code from your authenticator app. ${status.backup_codes_remaining || 0} backup codes remaining.`
                  : 'Recommended for admins, store owners, and anyone with Pro. Works with Google Authenticator, Authy, 1Password, etc.'}
              </Text>
            </View>
          </View>
          {!enabled && !setupData ? (
            <Button
              title="Enable 2FA"
              onPress={() => setupMut.mutate()}
              loading={setupMut.isPending}
              style={{ marginTop: Spacing.md }}
            />
          ) : null}
          {enabled ? (
            <Button
              title="Disable 2FA"
              variant="danger"
              onPress={() => setShowDisable(true)}
              style={{ marginTop: Spacing.md }}
            />
          ) : null}
        </View>

        {/* Setup step: QR + verify */}
        {setupData && !enabled ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Step 1 — Scan with your authenticator app</Text>
            <View style={{ alignItems: 'center', marginVertical: Spacing.md }}>
              <Image source={{ uri: setupData.qr_data_url }} style={styles.qr} />
            </View>
            <TouchableOpacity onPress={copySecret}>
              <Text style={styles.codeBox}>{setupData.secret}</Text>
              <Text style={styles.muted}>
                Can't scan? Tap the code above to copy it and paste into the app.
              </Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>
              Step 2 — Enter the 6-digit code
            </Text>
            <Input
              placeholder="123456"
              value={verifyCode}
              onChangeText={(v) => setVerifyCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => { setSetupData(null); setVerifyCode(''); }}
              />
              <Button
                title="Verify & enable"
                style={{ flex: 1 }}
                onPress={() => verifyMut.mutate()}
                loading={verifyMut.isPending}
                disabled={verifyCode.length !== 6}
              />
            </View>
          </View>
        ) : null}

        {/* Backup codes after successful enable */}
        {backupCodes ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Save these backup codes</Text>
            <Text style={styles.muted}>
              Each code works once. Use one if you lose access to your authenticator app.
            </Text>
            <View style={styles.backupGrid}>
              {backupCodes.map((c) => (
                <Text key={c} style={styles.backupCode}>{c}</Text>
              ))}
            </View>
            <View style={styles.warnBox}>
              <Ionicons name="warning" size={14} color={Colors.warning} />
              <Text style={styles.warnText}>
                These codes will NOT be shown again. Screenshot them or paste them in a password manager now.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
              <Button title="Copy all" variant="secondary" style={{ flex: 1 }} onPress={copyBackupCodes} />
              <Button title="Share" variant="secondary" style={{ flex: 1 }} onPress={shareBackupCodes} />
            </View>
            <Button
              title="I saved them"
              onPress={() => setBackupCodes(null)}
              style={{ marginTop: Spacing.sm }}
            />
          </View>
        ) : null}

        {/* Disable confirm */}
        {showDisable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Disable 2FA</Text>
            <Text style={styles.muted}>
              Confirm with your current password + a code. This removes 2FA protection from the account.
            </Text>
            <Input
              placeholder="Current password"
              value={disablePassword}
              onChangeText={setDisablePassword}
              secureTextEntry
            />
            <Input
              placeholder="6-digit code or backup code"
              value={disableCode}
              onChangeText={setDisableCode}
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                style={{ flex: 1 }}
                onPress={() => { setShowDisable(false); setDisablePassword(''); setDisableCode(''); }}
              />
              <Button
                title="Disable"
                variant="danger"
                style={{ flex: 1 }}
                onPress={() => disableMut.mutate()}
                loading={disableMut.isPending}
                disabled={!disablePassword || !disableCode}
              />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.base,
  },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  cardBody: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 4, lineHeight: 20 },
  sectionTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold, marginBottom: Spacing.xs },
  qr: { width: 220, height: 220, backgroundColor: '#fff', borderRadius: Radius.md, padding: 8 },
  codeBox: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: Colors.text,
    fontSize: Typography.base,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 4,
  },
  muted: { color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.md, lineHeight: 16 },
  backupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: Spacing.md },
  backupCode: {
    width: '48%',
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 10,
    textAlign: 'center',
    color: Colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
    fontSize: Typography.sm,
  },
  warnBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.warning + '15',
    borderColor: Colors.warning + '55',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  warnText: { color: Colors.warning, fontSize: Typography.xs, flex: 1, lineHeight: 16 },
});
