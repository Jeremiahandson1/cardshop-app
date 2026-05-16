import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Linking, Image, Modal, FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { safetyApi, cardsApi } from '../services/api';
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
// Report a card stolen. Rebuilt: identifies the exact card (so
// serial/cert/photo flow into the public registry + the eBay
// image scanner), captures proof images (the registry is
// proof-gated — without proof an admin can't publish it), and
// collects structured incident data. Card identity is required:
// a linkless free-text report can't be matched or made public,
// which is the whole failure mode we're fixing.
const PROOF_MAX = 10;

export const ReportStolenScreen = ({ navigation, route }) => {
  const { tradeListingId, cardName, ownedCardId, ownedCard } = route.params || {};

  const [selectedCard, setSelectedCard] = useState(
    ownedCard || (ownedCardId ? { id: ownedCardId } : null),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cardSearch, setCardSearch] = useState('');

  const [proof, setProof] = useState([]); // array of data: URLs
  const [adding, setAdding] = useState(false);

  const [description, setDescription] = useState('');
  const [theftDate, setTheftDate] = useState('');
  const [theftLocation, setTheftLocation] = useState('');
  const [estValue, setEstValue] = useState('');
  const [tracking, setTracking] = useState('');
  const [policeCase, setPoliceCase] = useState('');
  const [contactInfo, setContactInfo] = useState('');

  const fromListing = !!tradeListingId;
  const cardChosen = fromListing || !!selectedCard;

  // Lazy-load the user's collection only when the picker opens.
  const { data: myCards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['stolen-card-picker'],
    queryFn: () => cardsApi.mine({ limit: 300 })
      .then((r) => r.data?.cards || r.data?.owned_cards || r.data || []),
    enabled: pickerOpen,
    staleTime: 60_000,
  });

  const cardTitle = (c) => [c?.year, c?.set_name, c?.player_name]
    .filter(Boolean).join(' ') || c?.card_name || 'Card';

  const filteredCards = !cardSearch.trim() ? myCards : myCards.filter((c) =>
    cardTitle(c).toLowerCase().includes(cardSearch.trim().toLowerCase())
    || String(c.cert_number || '').includes(cardSearch.trim()));

  async function addProof(useCamera) {
    if (proof.length >= PROOF_MAX) {
      Alert.alert('Limit reached', `Up to ${PROOF_MAX} images.`);
      return;
    }
    try {
      const perm = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow access to attach proof images.');
        return;
      }
      setAdding(true);
      const res = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;
      // Compress so a 10-image base64 payload stays sane.
      const m = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 1400 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (m.base64) setProof((p) => [...p, `data:image/jpeg;base64,${m.base64}`]);
    } catch (e) {
      Alert.alert('Could not add image', e.message || 'Try again.');
    } finally {
      setAdding(false);
    }
  }

  const submit = useMutation({
    mutationFn: () => safetyApi.reportStolen({
      trade_listing_id: tradeListingId || null,
      owned_card_id: !fromListing ? (selectedCard?.id || null) : null,
      description: description.trim(),
      proof_urls: proof,
      theft_date: theftDate.trim() || null,
      theft_location: theftLocation.trim() || null,
      estimated_value: estValue.trim() ? Number(estValue) : null,
      shipment_tracking: tracking.trim() || null,
      police_case_number: policeCase.trim() || null,
      contact_info: contactInfo.trim() || null,
    }),
    onSuccess: (res) => {
      const warn = res?.data?.proof_upload_failed;
      Alert.alert(
        'Report submitted',
        (warn
          ? 'Saved, but your proof images failed to upload — reply to the support email with them.\n\n'
          : '')
        + "Admins review within 48 hours. It only appears on the public registry once proof of acquisition is verified.",
      );
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert('Could not submit', err?.response?.data?.error || 'Try again.');
    },
  });

  const canSubmit = cardChosen && description.trim().length >= 10;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Report Stolen Card"
        subtitle={cardName || (selectedCard ? cardTitle(selectedCard) : 'Get it on the registry')}
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        <View style={styles.warningBox}>
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.warningText}>
            Genuine reports only — false reports can suspend your account. If urgent,
            also contact local police. This puts the card on the public registry and
            the eBay scanner once proof is verified.
          </Text>
        </View>

        {/* 1. Which card */}
        <SectionHeader title="Which card?" />
        {fromListing ? (
          <Text style={{ color: Colors.textMuted, marginBottom: Spacing.base }}>
            Reporting the listed card: {cardName || 'selected listing'}.
          </Text>
        ) : selectedCard ? (
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              padding: 12, backgroundColor: Colors.card, borderRadius: Radius.md,
              borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.base,
            }}
          >
            {(selectedCard.image_front_url || selectedCard.catalog_image) ? (
              <Image
                source={{ uri: selectedCard.image_front_url || selectedCard.catalog_image }}
                style={{ width: 46, height: 46, borderRadius: 6, backgroundColor: Colors.bg }}
              />
            ) : <Ionicons name="albums-outline" size={26} color={Colors.textMuted} />}
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontWeight: '700' }} numberOfLines={1}>
                {cardTitle(selectedCard)}
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
                {selectedCard.serial_number ? `#${selectedCard.serial_number} · ` : ''}
                {selectedCard.cert_number ? `cert ${selectedCard.cert_number} · ` : ''}
                Tap to change
              </Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => setPickerOpen(true)}
            style={{
              padding: 16, backgroundColor: Colors.card, borderRadius: Radius.md,
              borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
              alignItems: 'center', marginBottom: 8,
            }}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
            <Text style={{ color: Colors.accent, fontWeight: '700', marginTop: 4 }}>
              Pick the stolen card from your collection
            </Text>
          </TouchableOpacity>
        )}
        {!fromListing && (
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginBottom: Spacing.base }}>
            The card must be in your Card Shop collection — that's how its serial,
            cert, and photo get onto the registry and into the eBay scanner. Not
            added yet? Register it first, then report it.
          </Text>
        )}

        {/* 2. Proof */}
        <SectionHeader title="Proof of acquisition" />
        <Text style={{ color: Colors.textMuted, fontSize: 13, marginBottom: 10 }}>
          Required before it can go public. A receipt, the original eBay/marketplace
          order, a police report, or an insurance schedule. Photos of distinguishing
          marks help too.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {proof.map((uri, i) => (
            <View key={i} style={{ position: 'relative' }}>
              <Image source={{ uri }} style={{ width: 76, height: 76, borderRadius: 8, backgroundColor: Colors.card }} />
              <TouchableOpacity
                onPress={() => setProof((p) => p.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: -6, right: -6, backgroundColor: Colors.danger || '#ef4444',
                  width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        {proof.length < PROOF_MAX && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: Spacing.base }}>
            <Button title="Take photo" variant="secondary" onPress={() => addProof(true)} loading={adding} style={{ flex: 1 }} />
            <Button title="Upload" variant="secondary" onPress={() => addProof(false)} loading={adding} style={{ flex: 1 }} />
          </View>
        )}

        {/* 3. Incident */}
        <SectionHeader title="What happened?" />
        <Input
          label="Describe the theft"
          value={description}
          onChangeText={setDescription}
          placeholder="When, where, how it was taken, distinguishing marks, etc."
          multiline
          numberOfLines={5}
        />
        <Input
          label="Date stolen / last seen (YYYY-MM-DD)"
          value={theftDate}
          onChangeText={setTheftDate}
          placeholder="2026-05-10"
        />
        <Input
          label="Where (city / show / shipped from)"
          value={theftLocation}
          onChangeText={setTheftLocation}
          placeholder="e.g. National in Chicago, or 'in transit from OH'"
        />
        <Input
          label="If shipped — tracking number"
          value={tracking}
          onChangeText={setTracking}
          placeholder="Mail theft? Add the carrier tracking number"
        />
        <Input
          label="Estimated value (USD)"
          value={estValue}
          onChangeText={setEstValue}
          placeholder="Helps us triage and assists insurance"
          keyboardType="numeric"
        />
        <Input
          label="Police case number (if filed)"
          value={policeCase}
          onChangeText={setPoliceCase}
          placeholder="Optional — strongly speeds up verification"
        />
        <Input
          label="How we can reach you"
          value={contactInfo}
          onChangeText={setContactInfo}
          placeholder="Phone or email. Law enforcement may use this."
          multiline
          numberOfLines={2}
        />

        {!canSubmit && (
          <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 8 }}>
            {cardChosen ? 'Add at least a short description.' : 'Pick the stolen card first.'}
            {!proof.length ? ' Proof can be added now or emailed later, but it won\'t go public without it.' : ''}
          </Text>
        )}
        <Button
          title="Submit Report"
          variant="danger"
          onPress={() => submit.mutate()}
          loading={submit.isPending}
          disabled={!canSubmit}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>

      {/* My-cards picker */}
      <Modal visible={pickerOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPickerOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.border,
          }}>
            <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700' }}>Pick the stolen card</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <TextInput
            value={cardSearch}
            onChangeText={setCardSearch}
            placeholder="Search your collection..."
            placeholderTextColor={Colors.textMuted}
            style={{
              margin: Spacing.base, padding: 12, backgroundColor: Colors.card,
              color: Colors.text, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
            }}
          />
          {cardsLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={filteredCards}
              keyExtractor={(c) => String(c.id)}
              contentContainerStyle={{ padding: Spacing.base, paddingTop: 0 }}
              ListEmptyComponent={(
                <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 40 }}>
                  No cards found. Register the card in your collection first, then report it.
                </Text>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => { setSelectedCard(item); setPickerOpen(false); setCardSearch(''); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10,
                    borderBottomWidth: 1, borderBottomColor: Colors.border,
                  }}
                >
                  {(item.image_front_url || item.catalog_image) ? (
                    <Image source={{ uri: item.image_front_url || item.catalog_image }}
                      style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: Colors.card }} />
                  ) : <Ionicons name="albums-outline" size={24} color={Colors.textMuted} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontWeight: '600' }} numberOfLines={1}>{cardTitle(item)}</Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 12 }}>
                      {item.serial_number ? `#${item.serial_number} · ` : ''}
                      {item.cert_number ? `cert ${item.cert_number}` : (item.parallel || 'raw')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            />
          )}
        </SafeAreaView>
      </Modal>
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
