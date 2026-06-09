// Native contest detail. Reads /api/contests/:slug, renders the
// prize card, the per-action entry checklist for the caller, and
// (for top-count contests) the anonymous leader stat.
//
// Replaces the previous "open the collector site in a WebView"
// hop from HomeHubScreen so users get a real in-app screen with
// the checklist tailored to them.
import React from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, Radius } from '../theme';
import { contestsApi } from '../services/api';

// Friendly label, hint, and Ionicon name keyed by the source_type
// the API returns. Adding a new action source means: add the source
// type to migration 141's CHECK, add the rule key to RULE_KEY_BY_SOURCE
// in routes/contests.js, AND add a row here so the checklist renders
// it instead of silently dropping it.
const SOURCE_META = {
  live_photo_card: {
    label: 'Add a card with live front + back photos',
    hint: 'Scan a card in-app with both faces captured — gives it the green in-hand tier.',
    icon: 'camera',
  },
  trade_board: {
    label: 'Post a card to the Trade Board',
    hint: 'Open a card → For Trade. The listing goes to the global trade board.',
    icon: 'swap-horizontal',
  },
  marketplace: {
    label: 'List a card on the Marketplace',
    hint: 'Open a card → Sell on Marketplace. Needs photos and payouts set up.',
    icon: 'storefront',
  },
  lcs_price: {
    label: 'Enter a local card-shop box price',
    hint: 'My Local LCS → pick a shop → submit a current box price.',
    icon: 'pricetag',
  },
  referral: {
    label: 'Invite a friend (signup + email verified)',
    hint: 'Share your username. The entry fires when they confirm their email.',
    icon: 'person-add',
  },
  referral_qualified: {
    label: 'Invite a friend who registers a card',
    hint: 'Friend signs up with your username, verifies email, AND adds a card. Each qualifying friend = 1 entry.',
    icon: 'people',
  },
  register: {
    label: 'Register a card on Card Shop',
    hint: 'Any new card in your collection counts.',
    icon: 'add-circle',
  },
  cstx: {
    label: 'Complete a Card Shop transaction (CSTX)',
    hint: 'Finish a trade or sale through the chain.',
    icon: 'checkmark-done-circle',
  },
};

// The rule keys on entry_rules JSON in DB ("per_live_photo_card", etc.)
// map 1:1 to source_types by stripping the "per_" prefix. Easiest way
// to iterate the eligible sources for this contest.
const sourcesFromRules = (rules) => {
  if (!rules || typeof rules !== 'object') return [];
  const out = [];
  for (const key of Object.keys(rules)) {
    if (rules[key] && key.startsWith('per_')) {
      out.push(key.slice(4));
    }
  }
  return out;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  } catch { return iso; }
};

// Hobby-convention numbering line. "#13 · 15/25" reads as "card 13
// in the checklist, this is copy 15 of 25." Previously rendered
// "#13 · /15" with no separator distinguishing the individual serial
// from a parallel population, which collectors misread as a print
// run of 15.
function formatPrizeNumbering(card) {
  if (!card) return '';
  const parts = [];
  if (card.card_number) parts.push(`#${card.card_number}`);
  if (card.is_one_of_one) parts.push('1/1');
  else if (card.serial_number && card.print_run) parts.push(`${card.serial_number}/${card.print_run}`);
  else if (card.serial_number) parts.push(`Serial ${card.serial_number}`);
  else if (card.print_run) parts.push(`/${card.print_run}`);
  return parts.join('  ·  ');
}

export const ContestScreen = ({ route, navigation }) => {
  const slug = route?.params?.slug;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contest', slug],
    queryFn: () => contestsApi.get(slug),
    enabled: !!slug,
  });

  // Refresh on focus — entries accrue from other surfaces (scan,
  // trade board, etc.) so users coming back to this screen expect
  // their count to be up to date without a pull-to-refresh.
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));

  if (!slug) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title="Contest" />
        <Text style={S.error}>No contest specified.</Text>
      </SafeAreaView>
    );
  }
  if (isLoading) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title="Contest" />
        <View style={S.center}><ActivityIndicator color={Colors.accent} /></View>
      </SafeAreaView>
    );
  }
  if (error || !data?.contest) {
    return (
      <SafeAreaView style={S.safe} edges={['top']}>
        <Header onBack={() => navigation.goBack()} title="Contest" />
        <Text style={S.error}>Couldn't load this contest. Pull down to retry.</Text>
      </SafeAreaView>
    );
  }

  const c = data.contest;
  const myBySource = data.my_entries_by_source || {};
  const sources = sourcesFromRules(c.entry_rules);
  const isTopCount = c.winner_selection === 'top_count';
  const myEntries = data.my_entries || 0;
  const leaderEntries = data.leader_entry_count || 0;

  const openRules = () => {
    if (c.rules_url) Linking.openURL(c.rules_url).catch(() => {});
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <Header onBack={() => navigation.goBack()} title={c.title} />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60 }}>

        {/* Prize hero */}
        {c.prize_card?.front_image_url ? (
          <View style={S.prizeCard}>
            <Image
              source={{ uri: c.prize_card.front_image_url }}
              style={S.prizeImg}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <Text style={S.prizeKicker}>Prize</Text>
              <Text style={S.prizeTitle}>{c.prize_card.title}</Text>
              <Text style={S.prizeMeta}>{formatPrizeNumbering(c.prize_card)}</Text>
              {(c.prize_card.grading_company || c.prize_card.is_rookie || c.prize_card.is_autograph) ? (
                <View style={S.badgeRow}>
                  {c.prize_card.grading_company ? (
                    <View style={S.badge}>
                      <Text style={S.badgeTxt}>
                        {String(c.prize_card.grading_company).toUpperCase()} {c.prize_card.grade || ''}
                      </Text>
                    </View>
                  ) : null}
                  {c.prize_card.is_rookie ? <View style={S.badge}><Text style={S.badgeTxt}>RC</Text></View> : null}
                  {c.prize_card.is_autograph ? <View style={S.badge}><Text style={S.badgeTxt}>AUTO</Text></View> : null}
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={S.prizeCardNoCard}>
            <Ionicons name="gift" size={28} color={Colors.accent} />
            <Text style={S.prizeTitle}>{c.prize_description}</Text>
          </View>
        )}

        {/* Window */}
        <View style={S.row}>
          <View style={S.statBox}>
            <Text style={S.statLabel}>Closes</Text>
            <Text style={S.statValue}>{fmtDate(c.entry_window_end)}</Text>
          </View>
          <View style={S.statBox}>
            <Text style={S.statLabel}>Total entries</Text>
            <Text style={S.statValue}>{(data.entry_count || 0).toLocaleString()}</Text>
          </View>
        </View>

        {/* Top-count leader stat (number only, no username) */}
        {isTopCount ? (
          <View style={S.leaderBox}>
            <View style={{ flex: 1 }}>
              <Text style={S.leaderLabel}>Current leader</Text>
              <Text style={S.leaderValue}>
                {leaderEntries} verified referral{leaderEntries === 1 ? '' : 's'}
              </Text>
            </View>
            <View style={S.leaderDivider} />
            <View style={{ flex: 1 }}>
              <Text style={S.leaderLabel}>You have</Text>
              <Text style={[S.leaderValue, { color: myEntries >= leaderEntries && myEntries > 0 ? '#4ade80' : Colors.text }]}>
                {myEntries}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Per-source entry checklist */}
        <Text style={S.sectionTitle}>
          {isTopCount ? 'How to earn referrals' : `Your entries (${myEntries} / ${c.max_entries_per_user})`}
        </Text>
        {!isTopCount && c.one_entry_per_source_type ? (
          <Text style={S.sectionHint}>One entry per action. Do all five to max out.</Text>
        ) : null}

        {sources.length === 0 ? (
          <Text style={S.error}>This contest's entry rules aren't set yet.</Text>
        ) : sources.map((src) => {
          const meta = SOURCE_META[src] || { label: src, hint: '', icon: 'ellipse' };
          const earned = (myBySource[src] || 0) > 0;
          return (
            <View key={src} style={[S.checkRow, earned ? S.checkRowEarned : null]}>
              <View style={[S.checkIcon, earned ? S.checkIconEarned : null]}>
                {earned
                  ? <Ionicons name="checkmark" size={18} color="#0f172a" />
                  : <Ionicons name={meta.icon} size={18} color={Colors.muted || '#94a3b8'} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[S.checkLabel, earned ? { color: '#4ade80' } : null]}>
                  {meta.label}
                </Text>
                <Text style={S.checkHint}>{meta.hint}</Text>
                {isTopCount && earned && myBySource[src] > 1 ? (
                  <Text style={S.checkCount}>{myBySource[src]} earned</Text>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Rules link */}
        {c.rules_url ? (
          <TouchableOpacity onPress={openRules} style={S.rulesBtn} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={16} color={Colors.accent} />
            <Text style={S.rulesTxt}>Read the official rules</Text>
            <Ionicons name="open-outline" size={14} color={Colors.accent} />
          </TouchableOpacity>
        ) : null}

        <Text style={S.disclaimer}>
          No purchase necessary. US residents 18+. Void where prohibited.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const Header = ({ onBack, title }) => (
  <View style={S.header}>
    <TouchableOpacity onPress={onBack} hitSlop={12} style={S.backBtn}>
      <Ionicons name="chevron-back" size={22} color={Colors.text} />
      <Text style={S.backTxt}>Back</Text>
    </TouchableOpacity>
    <Text style={S.headerTitle} numberOfLines={1}>{title}</Text>
    <View style={{ width: 60 }} />
  </View>
);

const S = {
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backTxt: { color: Colors.text, fontSize: 15 },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center', marginHorizontal: 8 },

  center: { padding: Spacing.lg, alignItems: 'center' },
  error: { color: '#fca5a5', textAlign: 'center', padding: Spacing.lg, fontSize: 14 },

  prizeCard: {
    flexDirection: 'row', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: 'rgba(232,197,71,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,197,71,0.4)',
    marginBottom: Spacing.md,
  },
  prizeCardNoCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: 'rgba(232,197,71,0.08)',
    borderWidth: 1, borderColor: 'rgba(232,197,71,0.4)',
    marginBottom: Spacing.md,
  },
  prizeImg: { width: 92, height: 128, borderRadius: 6, backgroundColor: '#0f172a' },
  prizeKicker: { color: Colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  prizeTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', marginTop: 4, lineHeight: 21 },
  prizeMeta: { color: Colors.muted || '#94a3b8', fontSize: 12, marginTop: 4 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(232,197,71,0.16)', borderWidth: 1, borderColor: 'rgba(232,197,71,0.5)' },
  badgeTxt: { color: Colors.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  row: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statBox: { flex: 1, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  statLabel: { color: Colors.muted || '#94a3b8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  statValue: { color: Colors.text, fontSize: 15, fontWeight: '700', marginTop: 4 },

  leaderBox: {
    flexDirection: 'row',
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 1, borderColor: 'rgba(251,191,36,0.4)',
    marginBottom: Spacing.md,
  },
  leaderLabel: { color: '#fbbf24', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  leaderValue: { color: Colors.text, fontSize: 20, fontWeight: '700', marginTop: 4 },
  leaderDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: Spacing.md },

  sectionTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', marginTop: Spacing.sm, marginBottom: 4 },
  sectionHint: { color: Colors.muted || '#94a3b8', fontSize: 12, marginBottom: Spacing.sm },

  checkRow: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start',
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 8,
  },
  checkRowEarned: { backgroundColor: 'rgba(74,222,128,0.06)', borderColor: 'rgba(74,222,128,0.4)' },
  checkIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },
  checkIconEarned: { backgroundColor: '#4ade80' },
  checkLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  checkHint: { color: Colors.muted || '#94a3b8', fontSize: 12, marginTop: 4, lineHeight: 17 },
  checkCount: { color: '#4ade80', fontSize: 11, fontWeight: '700', marginTop: 4 },

  rulesBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', padding: Spacing.md, marginTop: Spacing.md,
  },
  rulesTxt: { color: Colors.accent, fontSize: 13, fontWeight: '600' },
  disclaimer: { color: Colors.muted || '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },
};
