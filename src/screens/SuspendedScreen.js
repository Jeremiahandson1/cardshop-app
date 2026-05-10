// SuspendedScreen — shown when a user logs in to a suspended
// account. Surfaces the suspension reason + lets the user file
// one written appeal. The appeal_token (1h-scoped JWT) is passed
// in via route params from the login screen's 403 handler.
//
// Once the appeal is filed, suspension_appeal_status flips to
// 'pending' on the backend; admin reviews via the dashboard.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Button, Input } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { API_BASE_URL } from '../services/api';

const REASON_LABELS = {
  vault_fraud: 'Verified vault fraud',
  three_strikes: 'Three or more strikes within six months',
  identity_fraud: 'Identity fraud',
  stolen_card_listing: 'Listing a stolen card',
  cert_misrepresentation: 'Cert misrepresentation',
  verified_user_report: 'Verified user complaint',
};

export const SuspendedScreen = ({ navigation, route }) => {
  const {
    appeal_token,
    suspended_reason,
    appeal_status,
  } = route.params || {};

  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(appeal_status === 'pending');

  const valid = message.trim().length >= 30 && message.trim().length <= 2000;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await axios.post(`${API_BASE_URL}/api/auth/suspension-appeal`, {
        appeal_token,
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      Alert.alert(
        'Could not submit',
        err?.response?.data?.error || err?.message || 'Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed" size={56} color={Colors.accent3} />
        </View>
        <Text style={styles.title}>Account suspended</Text>
        {suspended_reason ? (
          <Text style={styles.reason}>
            {REASON_LABELS[suspended_reason] || String(suspended_reason).replace(/_/g, ' ')}
          </Text>
        ) : null}

        {submitted ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={28} color={Colors.success} />
            <Text style={styles.successTitle}>Appeal submitted</Text>
            <Text style={styles.successBody}>
              An admin will review and respond by email. You can't file another
              appeal until this one is resolved.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.body}>
              You can no longer log in or transact on Card Shop. If you believe
              this was issued in error, file a written appeal below. An admin
              will review and respond by email.
            </Text>
            <Text style={styles.label}>Your appeal (30–2000 chars)</Text>
            <Input
              value={message}
              onChangeText={setMessage}
              placeholder="What's the context an admin should see? Specific deal IDs, dates, the other party's username if applicable, anything that supports your case."
              multiline
              numberOfLines={8}
              maxLength={2000}
              style={{ minHeight: 160, textAlignVertical: 'top' }}
            />
            <Text style={styles.charCount}>
              {message.trim().length} / 2000
              {message.trim().length < 30 ? ` (need ${30 - message.trim().length} more)` : ''}
            </Text>

            <Button
              title={submitting ? 'Submitting…' : 'Submit appeal'}
              onPress={submit}
              disabled={!valid || submitting}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}

        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  iconWrap: {
    alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Typography.display, fontSize: 28, fontWeight: '700',
    color: Colors.text, textAlign: 'center', marginBottom: 6,
  },
  reason: {
    color: Colors.accent3, fontSize: 14, textAlign: 'center',
    fontWeight: '600', marginBottom: Spacing.lg,
  },
  body: {
    color: Colors.textMuted, fontSize: 14, lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  label: {
    color: Colors.textMuted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
  },
  charCount: {
    color: Colors.textMuted, fontSize: 12, marginTop: 4,
    textAlign: 'right',
  },
  successCard: {
    alignItems: 'center', padding: Spacing.lg,
    backgroundColor: 'rgba(74,222,128,0.10)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.40)',
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  successTitle: {
    color: Colors.success, fontSize: 18, fontWeight: '700',
    marginTop: Spacing.sm, marginBottom: 4,
  },
  successBody: {
    color: Colors.textMuted, fontSize: 13, lineHeight: 18,
    textAlign: 'center',
  },
  back: {
    alignItems: 'center', marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  backText: { color: Colors.accent, fontSize: 14, fontWeight: '600' },
});

export default SuspendedScreen;
