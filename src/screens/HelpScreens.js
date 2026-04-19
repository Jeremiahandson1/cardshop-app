import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { safetyApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Button, Input, ScreenHeader, SectionHeader,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// HELP / SUPPORT SCREEN
// First stop for anything wrong — bug report, account issue, safety
// concern. Creates a support ticket on the backend.
// ============================================================
export const HelpScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email || '');

  const submitMutation = useMutation({
    mutationFn: () => safetyApi.submitSupportTicket({
      contact_email: contactEmail,
      subject: subject.trim(),
      body: body.trim(),
      category,
      context_data: {
        user_id: user?.id,
        app: 'cardshop-mobile',
        screen: 'HelpScreen',
      },
    }),
    onSuccess: () => {
      Alert.alert(
        'Ticket submitted',
        "We'll reply to the email address you provided. Usually within 48 hours."
      );
      setSubject('');
      setBody('');
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert('Could not submit', err?.response?.data?.error || 'Try again.');
    },
  });

  const CATEGORIES = [
    { key: 'bug', label: '🐛 Bug' },
    { key: 'account', label: '👤 Account' },
    { key: 'trade_issue', label: '🔄 Trade issue' },
    { key: 'safety', label: '🛡️ Safety' },
    { key: 'other', label: '📨 Other' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Help & Support"
        subtitle="We'll get back to you"
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        <SectionHeader title="Quick links" />

        <TouchableOpacity
          style={styles.quickRow}
          onPress={() => Linking.openURL('mailto:support@twomiah.com')}
        >
          <Ionicons name="mail-outline" size={20} color={Colors.accent} />
          <Text style={styles.quickText}>support@twomiah.com</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
        </TouchableOpacity>

        <SectionHeader title="Or file a ticket" />

        <Text style={styles.helperText}>Pick a category</Text>
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.catChip, category === c.key && styles.catChipActive]}
              onPress={() => setCategory(c.key)}
            >
              <Text style={[styles.catText, category === c.key && styles.catTextActive]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Reply-to email"
          value={contactEmail}
          onChangeText={setContactEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
        />

        <Input
          label="Subject"
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary"
        />

        <Input
          label="What's going on?"
          value={body}
          onChangeText={setBody}
          placeholder="Details, steps to reproduce, screenshots (describe in text for now)..."
          multiline
          numberOfLines={6}
        />

        <Button
          title="Submit"
          onPress={() => submitMutation.mutate()}
          loading={submitMutation.isPending}
          disabled={!subject.trim() || !body.trim() || !contactEmail}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// REPORT STOLEN CARD — standalone screen accessed from listing detail
// ============================================================
export const ReportStolenScreen = ({ navigation, route }) => {
  const { tradeListingId, cardName } = route.params || {};
  const [description, setDescription] = useState('');
  const [policeCase, setPoliceCase] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const submit = useMutation({
    mutationFn: () => safetyApi.reportStolen({
      trade_listing_id: tradeListingId,
      description: description.trim(),
      police_case_number: policeCase.trim() || null,
      contact_info: contactInfo.trim() || null,
    }),
    onSuccess: () => {
      Alert.alert(
        'Report submitted',
        "Our admins will review within 48 hours. If you filed a police report, they may contact you."
      );
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert('Could not submit', err?.response?.data?.error || 'Try again.');
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Report Stolen Card"
        subtitle={cardName || 'Help us stop the listing'}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.warningText}>
            Use this only for genuine stolen-card reports. False reports may result in
            account suspension. If this is urgent, also contact local police.
          </Text>
        </View>

        <Input
          label="What happened?"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the theft: when, where, distinguishing marks on the card, etc."
          multiline
          numberOfLines={6}
        />

        <Input
          label="Police case number (if filed)"
          value={policeCase}
          onChangeText={setPoliceCase}
          placeholder="Optional but helps us move faster"
        />

        <Input
          label="How we can reach you"
          value={contactInfo}
          onChangeText={setContactInfo}
          placeholder="Phone, email, or preferred method. Law enforcement may use this."
          multiline
          numberOfLines={2}
        />

        <Button
          title="Submit Report"
          variant="danger"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!description.trim() || description.trim().length < 10}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// FIRST TRADE SAFETY CHECKLIST — shown before first accepted trade
// ============================================================
export const FirstTradeSafetyScreen = ({ navigation, route }) => {
  const { onAcknowledge } = route.params || {};
  const [checked, setChecked] = useState({});
  const items = [
    'Meet at a local card shop or public place (never a private residence)',
    'For high-value trades, bring a friend or meet at a police station safe-exchange zone',
    'If you\'re under 18, a parent or guardian must be present',
    'Use tracked shipping if you ship — never mail a card without tracking',
    'Never share passwords, full bank info, or government ID',
    'Report suspicious behavior via the Help & Support screen',
  ];
  const allChecked = items.every((_, i) => checked[i]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader title="Trade Safety" subtitle="First-time trade checklist" />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        <Text style={styles.intro}>
          Before you coordinate this trade, take a second to agree to these safety basics.
          Twomiah is a meeting place — we don't arbitrate in-person or shipping problems.
        </Text>

        {items.map((item, i) => (
          <TouchableOpacity
            key={i}
            style={styles.checklistRow}
            onPress={() => setChecked((c) => ({ ...c, [i]: !c[i] }))}
          >
            <Ionicons
              name={checked[i] ? 'checkbox' : 'square-outline'}
              size={22}
              color={checked[i] ? Colors.accent : Colors.textMuted}
            />
            <Text style={styles.checklistText}>{item}</Text>
          </TouchableOpacity>
        ))}

        <Button
          title="I understand — continue"
          onPress={() => {
            onAcknowledge?.();
            navigation.goBack();
          }}
          disabled={!allChecked}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  helperText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginBottom: Spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.base,
  },
  catChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  catChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  catText: {
    color: Colors.text,
    fontSize: Typography.sm,
  },
  catTextActive: {
    color: Colors.bg,
    fontWeight: Typography.bold,
  },
  warningBox: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: Spacing.base,
  },
  warningText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 20,
  },
  intro: {
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  checklistText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 22,
  },
});
