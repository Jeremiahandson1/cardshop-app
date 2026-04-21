import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ------------------------------------------------------------
// Formatting helpers — keep presentation concerns out of the row.
// ------------------------------------------------------------
const fmtMoney = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(2)}` : '—';

const fmtPct = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
};

const fmtInt = (v) =>
  typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—';

const fmtRelative = (iso) => {
  if (!iso) return 'just now';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return 'recently';
  }
};

const CONFIDENCE_META = {
  high: { label: 'High confidence', color: Colors.success },
  medium: { label: 'Medium confidence', color: Colors.warning },
  low: { label: 'Low confidence', color: Colors.textMuted },
  insufficient: { label: 'Not enough data', color: Colors.textMuted },
};

// Render a label + value stat row; accepts an optional color override for the value.
const StatRow = ({ label, value, valueColor }) => (
  <View style={styles.statRow}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
  </View>
);

// Bottom-sheet style detail modal for a single intelligence row.
// Renders *only* what the backend returned — no derived numbers.
export const CardIntelDetail = ({ visible, row, onClose }) => {
  if (!row) return null;
  const per = row.per_source || {};
  const isGraded = row.grading_company && row.grade != null;
  const confMeta = CONFIDENCE_META[row.confidence] || CONFIDENCE_META.insufficient;

  const ebayTrend = per.ebay_trend_30d_pct;
  const trendColor =
    typeof ebayTrend === 'number'
      ? ebayTrend > 0
        ? Colors.success
        : ebayTrend < 0
          ? Colors.error
          : Colors.text
      : Colors.text;

  const popGrowth = per.pop_growth_90d_pct;
  const popColor =
    typeof popGrowth === 'number'
      ? popGrowth > 0
        ? Colors.warning // pop growth is pressure on price — surface as caution
        : Colors.success
      : Colors.text;

  const narrationLabel =
    row.narration_source === 'llm' ? 'AI-summarized' : 'Summary based on data';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Intelligence</Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            accessibilityLabel="Close"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.name}>{row.name || 'Unnamed card'}</Text>
          {isGraded && (
            <Text style={styles.grade}>
              {String(row.grading_company).toUpperCase()} {row.grade}
            </Text>
          )}

          <Text style={styles.valueLabel}>Blended value</Text>
          <Text style={styles.value}>{fmtMoney(row.blended_value_usd)}</Text>

          {row.context_line ? (
            <View style={styles.contextBox}>
              <Text style={styles.context}>{row.context_line}</Text>
              <Text style={styles.narrationTag}>{narrationLabel}</Text>
            </View>
          ) : null}

          <Text style={styles.sectionLabel}>Per-source</Text>
          <View style={styles.card}>
            <StatRow label="eBay value" value={fmtMoney(per.ebay)} />
            <View style={styles.divider} />
            <StatRow
              label="eBay 30d trend"
              value={fmtPct(ebayTrend)}
              valueColor={trendColor}
            />
            <View style={styles.divider} />
            <StatRow label="eBay 90d sales" value={fmtInt(per.ebay_sales_count_90d)} />
            {isGraded ? (
              <>
                <View style={styles.divider} />
                <StatRow
                  label="Pop growth 90d"
                  value={fmtPct(popGrowth)}
                  valueColor={popColor}
                />
              </>
            ) : null}
          </View>

          <Text style={styles.sectionLabel}>Signal</Text>
          <View style={styles.card}>
            <StatRow
              label="Confidence"
              value={confMeta.label}
              valueColor={confMeta.color}
            />
            <View style={styles.divider} />
            <StatRow label="Updated" value={fmtRelative(row.computed_at)} />
            {row.prompt_version ? (
              <>
                <View style={styles.divider} />
                <StatRow label="Prompt version" value={row.prompt_version} />
              </>
            ) : null}
          </View>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: Radius.full,
    backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  body: {
    padding: Spacing.base,
  },
  name: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    marginBottom: 2,
  },
  grade: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginBottom: Spacing.md,
    letterSpacing: 0.5,
  },
  valueLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.md,
  },
  value: {
    color: Colors.text,
    fontSize: Typography.xxl,
    fontWeight: Typography.heavy,
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  contextBox: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  context: {
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 21,
  },
  narrationTag: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  sectionLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  statLabel: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  statValue: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
});
