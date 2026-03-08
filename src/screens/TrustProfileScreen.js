import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { feedbackApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { LoadingScreen, SectionHeader, Divider } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const TrustProfileScreen = ({ navigation, route }) => {
  const username = route.params?.username;
  const user = useAuthStore((s) => s.user);
  const displayUsername = username || user?.username;

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', displayUsername],
    queryFn: () => feedbackApi.forUser(displayUsername).then((r) => r.data),
    enabled: !!displayUsername,
  });

  if (isLoading) return <LoadingScreen message="Loading trust profile..." />;

  const profile = data || {};
  const stats = profile.stats || {};
  const flags = profile.flags || [];

  const StatCard = ({ icon, label, value, color }) => (
    <View style={styles.statCard}>
      <View style={[styles.statIconBox, { backgroundColor: (color || Colors.accent) + '22' }]}>
        <Ionicons name={icon} size={20} color={color || Colors.accent} />
      </View>
      <Text style={[styles.statValue, color && { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const getFlagColor = (type) => ({
    no_show: Colors.warning,
    slow_payment: Colors.warning,
    misrepresentation: Colors.accent3,
    non_delivery: Colors.accent3,
    dispute: Colors.accent3,
    positive: Colors.success,
  }[type] || Colors.textMuted);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trust Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 }}>
        {/* User header */}
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {profile.display_name?.[0]?.toUpperCase() || displayUsername?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.displayName}>{profile.display_name || displayUsername}</Text>
          <Text style={styles.usernameText}>@{displayUsername}</Text>

          {/* Trust score */}
          <View style={styles.trustScoreCard}>
            <Ionicons name="shield-checkmark" size={24} color={Colors.accent2} />
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.trustScoreValue}>
                {profile.trust_score || stats.trust_score || 'N/A'}
              </Text>
              <Text style={styles.trustScoreLabel}>Trust Score</Text>
            </View>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <StatCard
            icon="checkmark-done"
            label="Verified Deals"
            value={stats.verified_deals || 0}
            color={Colors.success}
          />
          <StatCard
            icon="swap-horizontal"
            label="Trades"
            value={stats.trades_completed || 0}
            color={Colors.accent2}
          />
          <StatCard
            icon="time-outline"
            label="Avg Response"
            value={stats.avg_response_time || 'N/A'}
            color={Colors.info}
          />
          <StatCard
            icon="cube-outline"
            label="Confirmed Shipments"
            value={stats.confirmed_shipments || 0}
            color={Colors.accent}
          />
        </View>

        <Divider />

        {/* Unresolved deals */}
        <View style={styles.unresolvedCard}>
          <View style={styles.unresolvedRow}>
            <Ionicons name="alert-circle" size={18} color={Colors.warning} />
            <Text style={styles.unresolvedLabel}>Unresolved Deals</Text>
            <Text style={[styles.unresolvedValue, (stats.unresolved_deals || 0) > 0 && { color: Colors.warning }]}>
              {stats.unresolved_deals || 0}
            </Text>
          </View>
        </View>

        {/* Flags */}
        <View>
          <SectionHeader title="Flags" />
          {flags.length === 0 ? (
            <View style={styles.noFlagsCard}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
              <Text style={styles.noFlagsText}>No flags on this account</Text>
            </View>
          ) : (
            flags.map((flag, i) => (
              <View key={flag.id || i} style={styles.flagItem}>
                <View style={[styles.flagDot, { backgroundColor: getFlagColor(flag.type) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.flagType, { color: getFlagColor(flag.type) }]}>
                    {flag.type?.replace(/_/g, ' ')?.replace(/\b\w/g, (l) => l.toUpperCase())}
                  </Text>
                  {flag.description && (
                    <Text style={styles.flagDesc}>{flag.description}</Text>
                  )}
                  <Text style={styles.flagDate}>
                    {flag.created_at ? new Date(flag.created_at).toLocaleDateString() : ''}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Divider />

        {/* Feedback history */}
        <View>
          <SectionHeader title="Recent Feedback" />
          {(profile.feedback || []).length === 0 ? (
            <View style={styles.noFlagsCard}>
              <Text style={styles.noFlagsText}>No feedback yet</Text>
            </View>
          ) : (
            (profile.feedback || []).slice(0, 10).map((fb, i) => (
              <View key={fb.id || i} style={styles.feedbackItem}>
                <View style={styles.feedbackStars}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Ionicons
                      key={star}
                      name={star <= fb.rating ? 'star' : 'star-outline'}
                      size={12}
                      color={Colors.accent}
                    />
                  ))}
                </View>
                {fb.comment && (
                  <Text style={styles.feedbackComment}>{fb.comment}</Text>
                )}
                <Text style={styles.feedbackMeta}>
                  {fb.from_username} · {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, flex: 1, textAlign: 'center' },

  // User header
  userHeader: { alignItems: 'center', paddingVertical: Spacing.lg },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent + '22', borderWidth: 2, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  avatarText: { color: Colors.accent, fontSize: Typography.xxl, fontWeight: Typography.heavy },
  displayName: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold },
  usernameText: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  trustScoreCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.accent2 + '40', padding: Spacing.md,
    paddingHorizontal: Spacing.xl, marginTop: Spacing.lg,
  },
  trustScoreValue: { color: Colors.accent2, fontSize: Typography.xl, fontWeight: Typography.heavy },
  trustScoreLabel: { color: Colors.textMuted, fontSize: Typography.xs },

  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    alignItems: 'center', gap: Spacing.xs,
  },
  statIconBox: {
    width: 36, height: 36, borderRadius: Radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.heavy },
  statLabel: { color: Colors.textMuted, fontSize: Typography.xs, textAlign: 'center' },

  // Unresolved
  unresolvedCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  unresolvedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  unresolvedLabel: { flex: 1, color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  unresolvedValue: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.heavy },

  // Flags
  noFlagsCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md, justifyContent: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl,
  },
  noFlagsText: { color: Colors.textMuted, fontSize: Typography.sm },
  flagItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  flagDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  flagType: { fontSize: Typography.sm, fontWeight: Typography.semibold, textTransform: 'capitalize' },
  flagDesc: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, lineHeight: 16 },
  flagDate: { color: Colors.textDim, fontSize: Typography.xs, marginTop: 2 },

  // Feedback
  feedbackItem: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  feedbackStars: { flexDirection: 'row', gap: 2, marginBottom: 4 },
  feedbackComment: { color: Colors.text, fontSize: Typography.sm, lineHeight: 18, marginBottom: 4 },
  feedbackMeta: { color: Colors.textDim, fontSize: Typography.xs },
});
