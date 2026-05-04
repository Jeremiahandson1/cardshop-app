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
// FAQ — common questions, especially around CoC, video gate, SLA.
// Inline accordion: tap to expand. Static content; no API needed.
// ============================================================
const FAQ_ITEMS = [
  {
    q: 'How does the chain of custody work?',
    a: 'Every transfer of every card is signed and timestamped. When you receive a card, that becomes a new link in its chain. The chain stays with the card across owners — so 5 transfers from now, the new owner can still see who had it before. Tap "View chain of custody" on any card detail.',
  },
  {
    q: "What's the $200 video rule?",
    a: 'For any shipment of $200 or more, both parties record a short video — the seller a "pack-out" before sealing the package, the buyer an "unpack" before opening it. Without your own video, you can\'t open a dispute on that side of the deal. Your video protects you, not the other party — they have their own.',
  },
  {
    q: 'Can we waive the video requirement?',
    a: 'Yes. Both parties can affirmatively opt out (long trade history, established trust, etc). Both have to waive — one party can\'t force it. If you waive, dispute resolution falls back to the chain-of-custody record only.',
  },
  {
    q: 'How long does the seller have to ship?',
    a: '5 days. We send reminders on day 2 and day 4. After day 5 the seller is marked overdue. After day 6 the buyer can file a "stalled transfer" report. After day 9 admin reviews — and if the seller has clearly abandoned the deal, we transfer the card to the buyer using our chain-of-custody record.',
  },
  {
    q: 'Why does the app not auto-track packages?',
    a: 'We deliberately don\'t integrate with carrier tracking. Carrier scans can be faked or delayed; pack-out/unpack videos can\'t. The video is the trust mechanism, not the carrier scan. You can paste a tracking number and we\'ll link out to the carrier site, but it\'s informational.',
  },
  {
    q: 'What if my card is reported stolen?',
    a: "If admin confirms a stolen-card report and you've supplied proof of acquisition (on-platform purchase, receipt, police case number, or insurance schedule), it appears on the public stolen registry at cardshop.twomiah.com/stolen and our cron job scans eBay hourly looking for it. Match candidates land in admin review, then you confirm or dismiss.",
  },
  {
    q: 'How do I go live at a card show?',
    a: 'Profile → Show Floor — live now → Check in. Pick the event from the catalog (or type a custom one), set your table number, and choose which binders go live. Followers get a push, and your cards appear in everyone\'s "Live now" feed at that event.',
  },
  {
    q: 'What\'s the difference between Free and Collector Pro?',
    a: 'Free works for cataloging, scanning, and viewing chains. Collector Pro unlocks Case Mode (per-card show floor), Show Floor check-ins, unlimited binders/cards, and analytics. Manage your subscription from Profile → Manage subscription.',
  },
];

const FaqList = () => {
  const [open, setOpen] = useState(null);
  return (
    <View>
      {FAQ_ITEMS.map((item, i) => {
        const expanded = open === i;
        return (
          <TouchableOpacity
            key={i}
            style={styles.faqRow}
            onPress={() => setOpen(expanded ? null : i)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Ionicons
                name={expanded ? 'chevron-down' : 'chevron-forward'}
                size={16}
                color={Colors.accent}
                style={{ marginTop: 2 }}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.faqQ}>{item.q}</Text>
                {expanded && <Text style={styles.faqA}>{item.a}</Text>}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

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

        <SectionHeader title="Frequently asked" />
        <FaqList />

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
  faqRow: {
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 6,
  },
  faqQ: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold, lineHeight: 20 },
  faqA: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 20, marginTop: 8 },

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
