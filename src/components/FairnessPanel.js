/**
 * FairnessPanel — Trade Fairness Scoring UI.
 *
 * Mounts above the Accept/Counter/Decline row on the offer-detail screen and
 * calls POST /api/trades/:offerId/fairness to render the scored trade.
 *
 * Pure render surface: all numbers come from the backend. Do NOT derive new
 * fairness numbers here — just format + display what the server returned.
 *
 * Backend shapes handled:
 *   - { status: 'insufficient_data' }  → quiet one-liner, no chip.
 *   - { status: 'scored', facts, narration, narration_source, prompt_version }
 *   - 409 offer resolved → hide entirely (return null).
 *   - 403 not a party    → hide entirely.
 *   - 429 daily limit    → compact notice; Accept/Counter/Decline stay usable.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { analytics } from '../services/analytics';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const FAIRNESS_UI_VERSION = '1.0.0';

// ------------------------------------------------------------------
// Static maps — flag labels. "Helps" are intentionally empty for now;
// the backend only emits hurt-flags as of prompt_version 1.0.0.
// ------------------------------------------------------------------
const HURT_FLAG_LABELS = {
  thin_liquidity: 'Thin sales history',
  raw_no_condition_data: 'Raw card, no condition data',
  high_pop_growth: 'Graded pop is growing fast',
  lcs_ebay_divergence: 'Local shop vs eBay prices disagree',
  stale_comps: 'Comps are stale',
};

// ------------------------------------------------------------------
// Verdict → chip color. Backend emits one of:
//   favorable | slight_favorable | fair | slight_unfavorable | unfavorable
// ------------------------------------------------------------------
const verdictStyle = (verdict) => {
  switch (verdict) {
    case 'favorable':
      return { bg: 'rgba(74,222,128,0.18)', fg: Colors.success, border: Colors.success };
    case 'slight_favorable':
      return { bg: 'rgba(74,222,128,0.10)', fg: Colors.success, border: 'rgba(74,222,128,0.5)' };
    case 'fair':
      return { bg: Colors.surface2, fg: Colors.text, border: Colors.border };
    case 'slight_unfavorable':
      return { bg: 'rgba(248,113,113,0.10)', fg: Colors.error, border: 'rgba(248,113,113,0.5)' };
    case 'unfavorable':
      return { bg: 'rgba(248,113,113,0.18)', fg: Colors.error, border: Colors.error };
    default:
      return { bg: Colors.surface2, fg: Colors.textMuted, border: Colors.border };
  }
};

const prettyVerdict = (v) => {
  if (!v) return '—';
  return v
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
};

// "+$12", "−$5", "$0". Uses a real minus sign for the negative so it lines up
// visually with the plus.
const formatGap = (gap) => {
  const n = Number(gap);
  if (!Number.isFinite(n)) return '';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const formatted = abs >= 100 ? abs.toFixed(0) : abs.toFixed(2).replace(/\.?0+$/, '');
  if (n > 0) return `+$${formatted}`;
  return `\u2212$${formatted}`;
};

const formatUsd = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n >= 100 ? n.toFixed(0) : n.toFixed(2).replace(/\.?0+$/, '')}`;
};

// ------------------------------------------------------------------
// Small skeleton — a few pulsing bars. Keeps this file dependency-free.
// ------------------------------------------------------------------
const Skeleton = () => (
  <View style={styles.panel}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
      <View style={[styles.skelBar, { width: 96, height: 26 }]} />
      <View style={[styles.skelBar, { flex: 1, height: 16 }]} />
    </View>
    <View style={[styles.skelBar, { height: 14, marginTop: Spacing.md, width: '90%' }]} />
    <View style={[styles.skelBar, { height: 14, marginTop: 6, width: '70%' }]} />
    <ActivityIndicator color={Colors.textMuted} style={{ marginTop: Spacing.md }} />
  </View>
);

// ------------------------------------------------------------------
// Collapsible side ("Your Side" / "Their Side").
// ------------------------------------------------------------------
const SideSection = ({ title, items, notesByCardId }) => {
  const [open, setOpen] = useState(false);
  const count = items?.length || 0;
  if (!count) return null;

  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setOpen((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.sectionTitle}>
          {title} <Text style={styles.sectionCount}>({count})</Text>
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={Colors.textMuted}
        />
      </TouchableOpacity>
      {open && (
        <View style={{ marginTop: Spacing.sm, gap: Spacing.sm }}>
          {items.map((it) => {
            const note = notesByCardId?.[it.card_id];
            return (
              <View key={it.card_id} style={styles.cardRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {it.name || 'Card'}
                  </Text>
                  {note ? (
                    <Text style={styles.cardNote}>{note}</Text>
                  ) : null}
                </View>
                <Text style={styles.cardValue}>{formatUsd(it.blended_value_usd)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

// ------------------------------------------------------------------
// Main panel.
// ------------------------------------------------------------------
export const FairnessPanel = ({ offerId, onSeedCounterNote }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      setRateLimited(false);
      setHidden(false);
      setData(null);
      try {
        const res = await api.post(`/trades/${offerId}/fairness`);
        if (cancelled) return;
        setData(res.data);

        // Analytics — only when scored.
        if (res.data?.status === 'scored') {
          try {
            analytics.track('fairness_viewed', {
              offer_id: offerId,
              ui_version: FAIRNESS_UI_VERSION,
              backend_prompt_version: res.data.prompt_version,
              narration_source: res.data.narration_source,
              verdict: res.data.facts?.summary_facts?.momentum_adjusted_verdict,
            });
          } catch {
            console.log('[fairness_viewed]', {
              offer_id: offerId,
              ui_version: FAIRNESS_UI_VERSION,
              backend_prompt_version: res.data.prompt_version,
              narration_source: res.data.narration_source,
              verdict: res.data.facts?.summary_facts?.momentum_adjusted_verdict,
            });
          }
        }
      } catch (e) {
        if (cancelled) return;
        const status = e?.response?.status;
        if (status === 409 || status === 403) {
          setHidden(true);
        } else if (status === 429) {
          setRateLimited(true);
        } else {
          setError(e?.response?.data?.error || 'Could not load fairness score');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (offerId) run();
    return () => {
      cancelled = true;
    };
  }, [offerId]);

  // Build card_id → note maps once per data change.
  const givingNotes = useMemo(() => {
    const map = {};
    (data?.narration?.giving_notes || []).forEach((n) => {
      if (n?.card_id) map[n.card_id] = n.note;
    });
    return map;
  }, [data]);

  const receivingNotes = useMemo(() => {
    const map = {};
    (data?.narration?.receiving_notes || []).forEach((n) => {
      if (n?.card_id) map[n.card_id] = n.note;
    });
    return map;
  }, [data]);

  if (hidden) return null;
  if (loading) return <Skeleton />;

  if (rateLimited) {
    return (
      <View style={[styles.panel, styles.panelCompact]}>
        <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.compactText}>
          Fairness limit reached — try again tomorrow.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.panel, styles.panelCompact]}>
        <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
        <Text style={styles.compactText}>{error}</Text>
      </View>
    );
  }

  if (data?.status === 'insufficient_data') {
    return (
      <View style={[styles.panel, styles.panelCompact]}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} />
        <Text style={styles.compactText}>
          Not enough market data to score this trade.
        </Text>
      </View>
    );
  }

  if (data?.status !== 'scored') return null;

  const sf = data.facts?.summary_facts || {};
  const verdict = sf.momentum_adjusted_verdict || sf.comp_verdict;
  const vStyle = verdictStyle(verdict);
  const gap = formatGap(sf.gap_usd);

  const hurtFlags = (sf.fired_flags || [])
    .map((f) => ({ flag: f, label: HURT_FLAG_LABELS[f] }))
    .filter((f) => !!f.label);

  const questions = data.facts?.questions || [];

  return (
    <View style={styles.panel}>
      {/* Header: chip + label */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.chip,
            { backgroundColor: vStyle.bg, borderColor: vStyle.border },
          ]}
        >
          <Text style={[styles.chipText, { color: vStyle.fg }]}>
            {prettyVerdict(verdict)}
            {gap ? `  ${gap}` : ''}
          </Text>
        </View>
        <Text style={styles.headerLabel}>Trade Fairness</Text>
      </View>

      {/* Summary sentence */}
      {data.narration?.summary ? (
        <Text style={styles.summary}>{data.narration.summary}</Text>
      ) : null}

      {/* Collapsible per-side sections */}
      <SideSection
        title="Your Side"
        items={data.facts?.giving}
        notesByCardId={givingNotes}
      />
      <SideSection
        title="Their Side"
        items={data.facts?.receiving}
        notesByCardId={receivingNotes}
      />

      {/* What Hurts */}
      {hurtFlags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Hurts</Text>
          <View style={styles.chipWrap}>
            {hurtFlags.map((f) => (
              <View key={f.flag} style={styles.flagChipHurt}>
                <Text style={styles.flagChipHurtText}>{f.label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Questions to Ask — tap to seed counter-offer note */}
      {questions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Questions to Ask</Text>
          <View style={styles.chipWrap}>
            {questions.map((q, i) => (
              <TouchableOpacity
                key={`${q.flag || 'q'}-${i}`}
                style={styles.questionChip}
                activeOpacity={0.75}
                onPress={() => onSeedCounterNote?.(q.text)}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={13}
                  color={Colors.accent}
                />
                <Text style={styles.questionChipText}>{q.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Source pill — tiny, unobtrusive */}
      {data.narration_source ? (
        <Text style={styles.sourceText}>
          {data.narration_source === 'llm' ? 'AI narration' : 'Rule-based narration'}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.base,
  },
  panelCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  compactText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    flex: 1,
  },
  skelBar: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  headerLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    letterSpacing: 0.3,
  },

  summary: {
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 21,
    marginBottom: Spacing.sm,
  },

  section: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sectionCount: {
    color: Colors.textMuted,
    fontWeight: Typography.regular,
  },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
  },
  cardName: {
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  cardNote: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  cardValue: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },

  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  flagChipHurt: {
    backgroundColor: 'rgba(248,113,113,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.4)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  flagChipHurtText: {
    color: Colors.error,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  questionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  questionChipText: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },

  sourceText: {
    color: Colors.textDim,
    fontSize: Typography.xs,
    marginTop: Spacing.md,
    textAlign: 'right',
  },
});

export default FairnessPanel;
