// Listing defaults — saved preferences applied to every new
// CreateTradeListing flow. Changing them here affects future
// listings only; in-flight listings keep whatever the user picked.
//
// Pairs with API GET/PUT /api/listing-defaults (migration 032).

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';

import { listingDefaultsApi } from '../services/api';
import { Button, LoadingScreen, ScreenHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const SHIPPING_OPTIONS = [
  { key: 'in_person', label: 'In person only' },
  { key: 'will_ship', label: 'Will ship' },
  { key: 'either', label: 'Either' },
];

const DEADLINE_OPTIONS = [
  { key: null, label: 'Open-ended' },
  { key: 24, label: '24 hours' },
  { key: 48, label: '48 hours' },
  { key: 168, label: '7 days' },
];

export const ListingDefaultsScreen = ({ navigation }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['listing-defaults'],
    queryFn: () => listingDefaultsApi.get().then((r) => r.data),
  });

  const [shippingPref, setShippingPref] = useState('either');
  const [acceptsBundles, setAcceptsBundles] = useState(false);
  const [timeLimitHours, setTimeLimitHours] = useState(null);

  useEffect(() => {
    if (!data?.defaults) return;
    const d = data.defaults;
    if (d.shipping_pref) setShippingPref(d.shipping_pref);
    if (typeof d.accepts_bundles === 'boolean') setAcceptsBundles(d.accepts_bundles);
    if (d.offer_time_limit_hours !== undefined) setTimeLimitHours(d.offer_time_limit_hours);
  }, [data]);

  const save = useMutation({
    mutationFn: () => listingDefaultsApi.save({
      shipping_pref: shippingPref,
      accepts_bundles: acceptsBundles,
      offer_time_limit_hours: timeLimitHours,
    }),
    onSuccess: () => {
      Alert.alert('Saved', 'Your listing defaults are updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => {
      Alert.alert('Error', err?.response?.data?.error || 'Could not save defaults.');
    },
  });

  if (isLoading) return <LoadingScreen message="Loading defaults..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Listing defaults"
        subtitle="Applied to new listings — change per-listing in Advanced"
      />

      <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
        <Text style={styles.label}>Shipping preference</Text>
        <View style={styles.row}>
          {SHIPPING_OPTIONS.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              active={shippingPref === opt.key}
              onPress={() => setShippingPref(opt.key)}
            />
          ))}
        </View>

        <Text style={styles.label}>Accept bundle offers?</Text>
        <View style={styles.row}>
          <Chip label="Yes" active={acceptsBundles} onPress={() => setAcceptsBundles(true)} />
          <Chip label="No" active={!acceptsBundles} onPress={() => setAcceptsBundles(false)} />
        </View>

        <Text style={styles.label}>Offer deadline</Text>
        <View style={styles.row}>
          {DEADLINE_OPTIONS.map((opt) => (
            <Chip
              key={String(opt.key)}
              label={opt.label}
              active={timeLimitHours === opt.key}
              onPress={() => setTimeLimitHours(opt.key)}
            />
          ))}
        </View>

        <Button
          title="Save defaults"
          onPress={() => save.mutate()}
          loading={save.isPending}
          style={{ marginTop: Spacing.xl }}
        />
        <Text style={styles.note}>
          These are starting points only. Every new listing flow has an "Advanced"
          section where you can change them per-listing without changing your defaults.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const Chip = ({ label, active, onPress }) => (
  <View style={{ marginRight: Spacing.sm, marginBottom: Spacing.sm }}>
    <Text
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      {label}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  label: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    overflow: 'hidden',
  },
  chipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surface2,
    color: Colors.accent,
  },
  note: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: Spacing.md,
    fontStyle: 'italic',
    lineHeight: 18,
  },
});
