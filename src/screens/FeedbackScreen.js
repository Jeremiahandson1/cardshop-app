// ============================================================
// In-app feedback / bug report.
//
// Lives on the Profile stack. Simple form: category picker,
// short subject, free-form body. POSTs to /api/safety/support
// which writes into support_tickets — admin sees it in the
// existing admin ticket queue.
//
// We auto-attach some device context (app version, platform,
// the user's id/email) so bug reports don't need the tester to
// recite them.
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supportApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const CATEGORIES = [
  { key: 'bug',          label: 'Bug',            icon: 'bug-outline' },
  { key: 'trade_issue',  label: 'Trade problem',  icon: 'swap-horizontal-outline' },
  { key: 'account',      label: 'Account',        icon: 'person-circle-outline' },
  { key: 'safety',       label: 'Safety',         icon: 'shield-outline' },
  { key: 'other',        label: 'Other',          icon: 'chatbox-outline' },
];

export const FeedbackScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState('bug');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = subject.trim().length >= 3 && body.trim().length >= 10;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await supportApi.file({
        contact_email: user?.email || 'unknown@unknown',
        subject: subject.trim().slice(0, 200),
        body: body.trim().slice(0, 10000),
        category,
        context_data: {
          platform: Platform.OS,
          os_version: Platform.Version,
          app_version: Constants.expoConfig?.version || Constants.manifest?.version || 'unknown',
          update_id: Constants.expoConfig?.extra?.eas?.updateId
                     || Constants.manifest?.extra?.eas?.updateId
                     || null,
          user_id: user?.id || null,
          username: user?.username || null,
        },
      });
      Alert.alert(
        'Thanks',
        "Got it — I'll see this in the admin queue. You can keep using the app; we may reply by email if we need more detail.",
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err) {
      Alert.alert('Could not send', err?.response?.data?.error || err?.message || 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Send feedback</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        <Text style={styles.intro}>
          Found a bug? Something confusing? Reply here — it lands in the admin queue
          and I'll read it. Honest is more useful than polite.
        </Text>

        <Text style={styles.sectionLabel}>What's this about?</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => setCategory(c.key)}
                style={[styles.categoryChip, active && styles.categoryChipActive]}
              >
                <Ionicons
                  name={c.icon}
                  size={14}
                  color={active ? Colors.bg : Colors.textMuted}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.categoryText, active && styles.categoryTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Input
          label="Short summary"
          value={subject}
          onChangeText={setSubject}
          placeholder='e.g. "Cert lookup crashed on a BGS 9"'
          maxLength={200}
        />
        <Input
          label="What happened?"
          value={body}
          onChangeText={setBody}
          placeholder="What you were doing, what you expected, what actually happened. Screenshots help — email them later if you want."
          multiline
          numberOfLines={6}
          maxLength={10000}
          style={{ height: 160, textAlignVertical: 'top' }}
        />

        <Text style={styles.hint}>
          We auto-attach your account and the app version so you don't have to.
        </Text>
      </ScrollView>

      <View style={styles.submitBar}>
        <Button
          title="Send feedback"
          onPress={submit}
          loading={submitting}
          disabled={!canSubmit}
          style={{ flex: 1 }}
        />
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
  intro: {
    color: Colors.textMuted, fontSize: 14, lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    color: Colors.textMuted, fontSize: Typography.xs,
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },
  categoryRow: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: Spacing.sm, marginBottom: Spacing.lg,
  },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface2,
  },
  categoryChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  categoryText: {
    color: Colors.textMuted, fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  categoryTextActive: {
    color: Colors.bg,
  },
  hint: {
    color: Colors.textMuted, fontSize: 11, fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  submitBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: Spacing.base,
    backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});
