// Contests list — the single "Contests" hub pill lands here. Shows
// every active/recent contest with the caller's own entry progress
// ("3 / 6 earned") so they're nudged to complete every way to win.
// Tapping a row opens ContestScreen, which renders the full per-action
// checklist and prize.
import React from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, Radius } from '../theme';
import { contestsApi } from '../services/api';

const STATUS_META = {
  open:    { label: 'OPEN', color: '#4ade80' },
  closed:  { label: 'DRAWING SOON', color: '#fbbf24' },
  drawn:   { label: 'WINNER DRAWN', color: '#60a5fa' },
  awarded: { label: 'AWARDED', color: '#a78bfa' },
};

const fmtClose = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
};

// Count the eligible ways to win from entry_rules ("per_*": true).
const waysFromRules = (rules) => {
  if (!rules || typeof rules !== 'object') return 0;
  return Object.keys(rules).filter((k) => k.startsWith('per_') && rules[k]).length;
};

const ContestRow = ({ contest, onPress }) => {
  const status = STATUS_META[contest.status] || null;
  const ways = waysFromRules(contest.entry_rules);
  // For the action-raffle model (one entry per source) the meaningful
  // progress is "earned / ways to win". Otherwise just show how many
  // entries they hold.
  const isActionRaffle = contest.one_entry_per_source_type && ways > 0;
  const mine = contest.my_entries || 0;
  const isOpen = contest.status === 'open';
  const allDone = isActionRaffle && mine >= ways;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(contest.slug)} style={S.row}>
      {contest.cover_image_url ? (
        <Image source={{ uri: contest.cover_image_url }} style={S.thumb} resizeMode="cover" />
      ) : (
        <View style={[S.thumb, S.thumbFallback]}>
          <Ionicons name="gift" size={26} color={Colors.accent} />
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={S.rowTop}>
          {status ? (
            <View style={[S.statusPill, { backgroundColor: status.color + '22', borderColor: status.color + '88' }]}>
              <Text style={[S.statusTxt, { color: status.color }]}>{status.label}</Text>
            </View>
          ) : null}
          {isOpen && contest.entry_window_end ? (
            <Text style={S.closeTxt}>Closes {fmtClose(contest.entry_window_end)}</Text>
          ) : null}
        </View>

        <Text style={S.title} numberOfLines={2}>{contest.title}</Text>
        <Text style={S.prize} numberOfLines={2}>
          {contest.prize_description || contest.banner_text || ''}
        </Text>

        {/* Progress nudge — only for live action-raffle contests */}
        {isOpen && isActionRaffle ? (
          <View style={S.progressWrap}>
            <View style={S.progressBarBg}>
              <View style={[S.progressBarFill, { width: `${Math.min(100, (mine / ways) * 100)}%`, backgroundColor: allDone ? '#4ade80' : Colors.accent }]} />
            </View>
            <Text style={[S.progressTxt, allDone ? { color: '#4ade80' } : null]}>
              {allDone ? `All ${ways} done!` : `${mine} / ${ways} entries`}
            </Text>
          </View>
        ) : null}

        {contest.winner_handle_snapshot ? (
          <Text style={S.winner}>Winner: @{contest.winner_handle_snapshot}</Text>
        ) : null}
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted || '#94a3b8'} />
    </TouchableOpacity>
  );
};

export const ContestsListScreen = ({ navigation }) => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contests-list'],
    queryFn: () => contestsApi.list(),
  });
  useFocusEffect(React.useCallback(() => { refetch(); }, [refetch]));

  const contests = Array.isArray(data) ? data : [];
  // Open first, then everything else; the API already sorts by window.
  const ordered = [
    ...contests.filter((c) => c.status === 'open'),
    ...contests.filter((c) => c.status !== 'open'),
  ];

  const openContest = (slug) => {
    if (slug) navigation.navigate('Contest', { slug });
  };

  return (
    <SafeAreaView style={S.safe} edges={['top']}>
      <View style={S.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12} style={S.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
          <Text style={S.backTxt}>Back</Text>
        </TouchableOpacity>
        <Text style={S.headerTitle}>Contests</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={S.center}><ActivityIndicator color={Colors.accent} /></View>
      ) : error ? (
        <Text style={S.msg}>Couldn't load contests. Pull down to retry.</Text>
      ) : ordered.length === 0 ? (
        <View style={S.center}>
          <Ionicons name="gift-outline" size={40} color={Colors.textMuted || '#94a3b8'} />
          <Text style={S.msg}>No contests right now. Check back soon!</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 60, gap: Spacing.md }}>
          <Text style={S.intro}>
            Free to enter. Earn an entry for each way to win — do them all to max out your odds.
          </Text>
          {ordered.map((c) => (
            <ContestRow key={c.id} contest={c} onPress={openContest} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const S = {
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 60 },
  backTxt: { color: Colors.text, fontSize: 15 },
  headerTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg },
  msg: { color: Colors.textMuted || '#94a3b8', textAlign: 'center', fontSize: 14 },
  intro: { color: Colors.textMuted || '#94a3b8', fontSize: 13, lineHeight: 18 },

  row: {
    flexDirection: 'row', gap: Spacing.md, alignItems: 'center',
    padding: Spacing.md, borderRadius: Radius.lg,
    backgroundColor: 'rgba(232,197,71,0.06)',
    borderWidth: 1, borderColor: 'rgba(232,197,71,0.35)',
  },
  thumb: { width: 56, height: 76, borderRadius: 6, backgroundColor: '#0f172a' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(232,197,71,0.12)' },

  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  statusTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  closeTxt: { color: Colors.textMuted || '#94a3b8', fontSize: 11, fontWeight: '600' },

  title: { color: Colors.text, fontSize: 15, fontWeight: '700', lineHeight: 19 },
  prize: { color: Colors.textMuted || '#94a3b8', fontSize: 12, marginTop: 2, lineHeight: 16 },

  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  progressBarBg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.10)', overflow: 'hidden' },
  progressBarFill: { height: 6, borderRadius: 3 },
  progressTxt: { color: Colors.accent, fontSize: 11, fontWeight: '700', minWidth: 64, textAlign: 'right' },

  winner: { color: '#60a5fa', fontSize: 12, fontWeight: '600', marginTop: 6 },
};
