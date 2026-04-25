// Granular notification preferences. Per category, three channel
// switches: push / email / in_app.
//
// PATCH /api/notification-prefs accepts a partial { updates: { cat:
// { channel: bool, ... } } } object — server merges into stored
// JSONB so we never have to send the whole tree.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { notificationPrefsApi } from '../services/api';
import { ScreenHeader, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const CHANNEL_LABELS = {
  push:   { icon: 'phone-portrait-outline', label: 'Push' },
  email:  { icon: 'mail-outline',           label: 'Email' },
  in_app: { icon: 'notifications-outline',  label: 'In-app' },
};

export const NotificationPreferencesScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [pendingUpdates, setPendingUpdates] = useState({});

  const { data, isLoading } = useQuery({
    queryKey: ['notification-prefs'],
    queryFn: () => notificationPrefsApi.get().then((r) => r.data),
  });

  const updateMut = useMutation({
    mutationFn: (updates) => notificationPrefsApi.update(updates).then((r) => r.data),
    onSuccess: (next) => {
      qc.setQueryData(['notification-prefs'], next);
      setPendingUpdates({});
    },
    onError: (err) => Alert.alert('Could not save', err?.response?.data?.error || err?.message),
  });

  if (isLoading) return <LoadingScreen />;

  const categories = data?.categories || [];
  const prefs = data?.prefs || {};

  // Merge any in-flight pending toggles into the displayed state so
  // the switch flips immediately (optimistic). Failures revert.
  const display = (catKey, channel) => {
    const pending = pendingUpdates?.[catKey]?.[channel];
    if (pending !== undefined) return pending;
    return !!prefs?.[catKey]?.[channel];
  };

  const toggle = (catKey, channel) => {
    const next = !display(catKey, channel);
    const update = { [catKey]: { [channel]: next } };
    setPendingUpdates((p) => ({
      ...p,
      [catKey]: { ...(p[catKey] || {}), [channel]: next },
    }));
    updateMut.mutate(update);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title="Notifications"
        subtitle="Per-category routing for push, email, in-app"
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.legendRow}>
          <Text style={styles.legendCat} />
          {Object.entries(CHANNEL_LABELS).map(([key, cfg]) => (
            <View key={key} style={styles.legendChannel}>
              <Ionicons name={cfg.icon} size={14} color={Colors.textMuted} />
              <Text style={styles.legendChannelText}>{cfg.label}</Text>
            </View>
          ))}
        </View>

        {categories.map((c) => (
          <View key={c.key} style={styles.row}>
            <View style={{ flex: 1, paddingRight: Spacing.sm }}>
              <Text style={styles.catLabel}>{c.label}</Text>
              <Text style={styles.catDesc}>{c.desc}</Text>
            </View>
            {Object.keys(CHANNEL_LABELS).map((ch) => (
              <View key={ch} style={styles.switchCell}>
                <Switch
                  value={display(c.key, ch)}
                  onValueChange={() => toggle(c.key, ch)}
                  trackColor={{ true: Colors.accent, false: Colors.surface3 }}
                  thumbColor={Colors.text}
                />
              </View>
            ))}
          </View>
        ))}

        <Text style={styles.footnote}>
          Changes save automatically. Marketing is off by default — flip it on if
          you want occasional product updates.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  legendRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  legendCat: { flex: 1 },
  legendChannel: {
    width: 60, alignItems: 'center', justifyContent: 'flex-end', gap: 2,
  },
  legendChannelText: {
    fontSize: 10, color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  catLabel: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  catDesc: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, lineHeight: 16 },
  switchCell: { width: 60, alignItems: 'center' },
  footnote: {
    color: Colors.textMuted, fontSize: Typography.xs,
    fontStyle: 'italic', marginTop: Spacing.lg, lineHeight: 18,
  },
});
