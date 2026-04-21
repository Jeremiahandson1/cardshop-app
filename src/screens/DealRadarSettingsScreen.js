import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  Alert, PanResponder, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showMessage } from 'react-native-flash-message';

import { dealRadarApi } from '../services/api';
import { Button } from '../components/ui';
import { LoadingScreen, SectionHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// DEAL RADAR SETTINGS
// ============================================================
const MIN_DISCOUNT_MIN = 0.05;
const MIN_DISCOUNT_MAX = 0.50;
const MIN_DISCOUNT_STEP = 0.01;

const PREFER_OPTIONS = [
  { key: 'raw', label: 'Raw' },
  { key: 'graded', label: 'Graded' },
  { key: 'either', label: 'Either' },
];

const INTERVAL_OPTIONS = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'quarterly', label: 'Every 15 min' },
];

export const DealRadarSettingsScreen = ({ navigation }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['deal-radar', 'preferences'],
    queryFn: () => dealRadarApi.getPreferences().then((r) => r.data),
  });

  // Local form state mirrored off server-provided prefs.
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (data && !form) {
      setForm({
        enabled: !!data.enabled,
        min_discount_pct: Number(data.min_discount_pct ?? 0.15),
        prefer_graded: data.prefer_graded || 'either',
        min_condition: data.min_condition || '',
        min_seller_feedback: Number(data.min_seller_feedback ?? 50),
        notify_interval: data.notify_interval || 'hourly',
      });
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: (partial) => dealRadarApi.updatePreferences(partial).then((r) => r.data),
    onSuccess: (next) => {
      queryClient.setQueryData(['deal-radar', 'preferences'], next);
      showMessage({
        message: 'Deal Radar preferences saved',
        type: 'success',
        icon: 'success',
      });
    },
    onError: (err) => {
      Alert.alert('Error', err?.response?.data?.error || 'Failed to save preferences');
    },
  });

  if (isLoading || !form) return <LoadingScreen message="Loading preferences..." />;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSave = () => {
    saveMutation.mutate({
      enabled: form.enabled,
      min_discount_pct: Number(form.min_discount_pct.toFixed(2)),
      prefer_graded: form.prefer_graded,
      min_seller_feedback: Math.max(0, Math.floor(Number(form.min_seller_feedback) || 0)),
      notify_interval: form.notify_interval,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Deal Radar</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('DealRadarFeed')}
          hitSlop={12}
        >
          <Ionicons name="list" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120, gap: Spacing.lg }}>
        {/* Master toggle */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Enable Deal Radar</Text>
              <Text style={styles.toggleSubtitle}>
                Get notified when listings on your want list drop under comps.
              </Text>
            </View>
            <Switch
              value={form.enabled}
              onValueChange={set('enabled')}
              trackColor={{ false: Colors.surface2, true: Colors.accent + '66' }}
              thumbColor={form.enabled ? Colors.accent : Colors.textMuted}
            />
          </View>
        </View>

        {/* Discount slider */}
        <View>
          <SectionHeader title="Minimum Discount" />
          <View style={styles.card}>
            <Text style={styles.sliderLabel}>
              Notify me when a listing is at least{' '}
              <Text style={styles.sliderValue}>
                {Math.round(form.min_discount_pct * 100)}%
              </Text>{' '}
              under comps.
            </Text>
            <DiscountSlider
              value={form.min_discount_pct}
              onChange={set('min_discount_pct')}
              min={MIN_DISCOUNT_MIN}
              max={MIN_DISCOUNT_MAX}
              step={MIN_DISCOUNT_STEP}
            />
            <View style={styles.sliderScale}>
              <Text style={styles.sliderScaleText}>5%</Text>
              <Text style={styles.sliderScaleText}>50%</Text>
            </View>
          </View>
        </View>

        {/* Prefer graded */}
        <View>
          <SectionHeader title="Card Type" />
          <View style={styles.segmentRow}>
            {PREFER_OPTIONS.map((opt) => {
              const active = form.prefer_graded === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  onPress={() => set('prefer_graded')(opt.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Min seller feedback stepper */}
        <View>
          <SectionHeader title="Minimum Seller Feedback" />
          <View style={styles.card}>
            <Text style={styles.toggleSubtitle}>
              Skip listings from sellers with fewer than this many feedbacks.
            </Text>
            <View style={styles.stepperRow}>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() =>
                  set('min_seller_feedback')(Math.max(0, Number(form.min_seller_feedback) - 10))
                }
              >
                <Ionicons name="remove" size={20} color={Colors.text} />
              </TouchableOpacity>
              <Text style={styles.stepperValue}>{form.min_seller_feedback}</Text>
              <TouchableOpacity
                style={styles.stepperBtn}
                onPress={() =>
                  set('min_seller_feedback')(Number(form.min_seller_feedback) + 10)
                }
              >
                <Ionicons name="add" size={20} color={Colors.text} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Notify interval */}
        <View>
          <SectionHeader title="Notification Frequency" />
          <View style={styles.card}>
            {INTERVAL_OPTIONS.map((opt, i) => {
              const active = form.notify_interval === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.radioRow}
                  onPress={() => set('notify_interval')(opt.key)}
                  activeOpacity={0.85}
                >
                  <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                    {active && <View style={styles.radioInner} />}
                  </View>
                  <Text style={styles.radioLabel}>{opt.label}</Text>
                  {i === 0 && <View style={{ flex: 1 }} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Button
          title="Save Preferences"
          onPress={handleSave}
          loading={saveMutation.isPending}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// DISCOUNT SLIDER — custom, no extra deps
// ============================================================
const DiscountSlider = ({ value, onChange, min, max, step }) => {
  const [width, setWidth] = useState(0);
  const ratio = useMemo(
    () => (width > 0 ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0),
    [value, min, max, width]
  );

  const snap = (pct) => {
    const raw = min + pct * (max - min);
    const steps = Math.round((raw - min) / step);
    const snapped = min + steps * step;
    return Math.max(min, Math.min(max, Number(snapped.toFixed(2))));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          if (!width) return;
          const x = evt.nativeEvent.locationX;
          onChange(snap(x / width));
        },
        onPanResponderMove: (evt) => {
          if (!width) return;
          const x = Math.max(0, Math.min(width, evt.nativeEvent.locationX));
          onChange(snap(x / width));
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, min, max, step]
  );

  return (
    <View
      style={sliderStyles.track}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      {...pan.panHandlers}
    >
      <View style={[sliderStyles.fill, { width: `${ratio * 100}%` }]} />
      <View
        style={[
          sliderStyles.thumb,
          { left: Math.max(0, ratio * width - 12) },
        ]}
      />
    </View>
  );
};

const sliderStyles = StyleSheet.create({
  track: {
    height: 32,
    justifyContent: 'center',
    marginVertical: Spacing.md,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 6,
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
    top: 4,
    ...Platform.select({
      android: { elevation: 3 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
    }),
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },

  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  toggleTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  toggleSubtitle: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 4, lineHeight: 18 },

  sliderLabel: { color: Colors.text, fontSize: Typography.base, lineHeight: 22 },
  sliderValue: { color: Colors.accent, fontWeight: Typography.bold },
  sliderScale: { flexDirection: 'row', justifyContent: 'space-between' },
  sliderScaleText: { color: Colors.textMuted, fontSize: Typography.xs },

  segmentRow: { flexDirection: 'row', gap: Spacing.sm },
  segmentBtn: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center',
  },
  segmentBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  segmentText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  segmentTextActive: { color: Colors.accent },

  stepperRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xl, marginTop: Spacing.md,
  },
  stepperBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperValue: {
    color: Colors.text, fontSize: Typography.xl,
    fontWeight: Typography.bold, minWidth: 60, textAlign: 'center',
  },

  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterActive: { borderColor: Colors.accent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  radioLabel: { color: Colors.text, fontSize: Typography.base },
});
