import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { wantListApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// PROFILE SCREEN
// ============================================================
export const ProfileScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const MENU = [
    {
      section: 'Account',
      items: [
        { icon: 'person-outline', label: 'Edit Profile', onPress: () => {} },
        { icon: 'shield-checkmark-outline', label: 'Trust Profile', onPress: () => navigation.navigate('TrustProfile', {}) },
        { icon: 'star-outline', label: 'Feedback & Ratings', onPress: () => {} },
        { icon: 'heart-outline', label: 'Want List', onPress: () => navigation.navigate('WantList') },
        { icon: 'swap-horizontal-outline', label: 'Transfer History', onPress: () => navigation.navigate('Transfers') },
      ]
    },
    {
      section: 'Binders & Offers',
      items: [
        { icon: 'book-outline', label: 'My Binders', onPress: () => navigation.navigate('BinderList') },
        { icon: 'chatbox-ellipses-outline', label: 'Offers', onPress: () => navigation.navigate('OffersList') },
        { icon: 'receipt-outline', label: 'Transactions', onPress: () => navigation.navigate('Transaction', { transactionId: null }) },
        { icon: 'warning-outline', label: 'Disputes', onPress: () => navigation.navigate('DisputeList') },
      ]
    },
    {
      section: 'Tools',
      items: [
        { icon: 'qr-code-outline', label: 'Scan QR Code', onPress: () => navigation.navigate('QRScanner') },
        { icon: 'radio-outline', label: 'Receive via NFC', onPress: () => {} },
        { icon: 'chatbubbles-outline', label: 'Messages', onPress: () => {} },
      ]
    },
    ...(user?.role === 'store_owner' ? [{
      section: 'Store',
      items: [
        { icon: 'storefront-outline', label: 'My Store Dashboard', onPress: () => {} },
        { icon: 'add-circle-outline', label: 'Create Store', onPress: () => {} },
      ]
    }] : []),
    {
      section: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & FAQ', onPress: () => {} },
        { icon: 'log-out-outline', label: 'Sign Out', onPress: handleLogout, danger: true },
      ]
    }
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Profile header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.display_name?.[0]?.toUpperCase() || user?.username?.[0]?.toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={styles.displayName}>{user?.display_name || user?.username}</Text>
          <Text style={styles.username}>@{user?.username}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user?.feedback_count || 0}</Text>
              <Text style={styles.statLabel}>Trades</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {user?.feedback_score ? parseFloat(user.feedback_score).toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: Colors.accent }]}>
                {user?.subscription_tier === 'free' ? 'Free' : 'Pro'}
              </Text>
              <Text style={styles.statLabel}>Plan</Text>
            </View>
          </View>
        </View>

        {/* Menu sections */}
        {MENU.map((section) => (
          <View key={section.section} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.section}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, i) => (
                <View key={item.label}>
                  <TouchableOpacity style={styles.menuItem} onPress={item.onPress}>
                    <View style={[styles.menuIcon, item.danger && { backgroundColor: Colors.error + '22' }]}>
                      <Ionicons name={item.icon} size={18} color={item.danger ? Colors.error : Colors.textMuted} />
                    </View>
                    <Text style={[styles.menuLabel, item.danger && { color: Colors.error }]}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                  {i < section.items.length - 1 && <View style={styles.menuDivider} />}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// WANT LIST SCREEN
// ============================================================
export const WantListScreen = ({ navigation }) => {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['wantlist'],
    queryFn: () => wantListApi.get().then((r) => r.data),
  });

  const removeMutation = useMutation({
    mutationFn: (id) => wantListApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wantlist'] }),
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to remove from want list'),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.simpleHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.simpleHeaderTitle}>Want List</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Discover')}>
          <Ionicons name="add" size={22} color={Colors.accent} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={data || []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}
        renderItem={({ item }) => (
          <View style={styles.wantItem}>
            <View style={{ flex: 1 }}>
              <Text style={styles.wantPlayer}>{item.player_name}</Text>
              <Text style={styles.wantSet}>{item.year} {item.set_name}</Text>
              <View style={styles.wantMeta}>
                {item.max_price && (
                  <Text style={styles.wantMetaText}>Max: ${item.max_price}</Text>
                )}
                {item.condition_min && (
                  <Text style={styles.wantMetaText}>
                    Min: {item.condition_min.replace(/_/g,' ')}
                  </Text>
                )}
                {item.graded_only && (
                  <View style={styles.gradedBadge}>
                    <Text style={styles.gradedBadgeText}>Graded Only</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => removeMutation.mutate(item.id)}
              style={styles.removeBtn}
            >
              <Ionicons name="heart" size={20} color={Colors.accent3} />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="❤️"
            title="Want list is empty"
            message="Search for cards and tap Want to add them. You'll be notified when they become available."
            action={{ label: 'Search Cards', onPress: () => navigation.navigate('Discover') }}
          />
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  profileHeader: {
    alignItems: 'center', paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.base,
  },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: Colors.accent + '22', borderWidth: 2, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  avatarText: { color: Colors.accent, fontSize: Typography.xxxl, fontWeight: Typography.heavy },
  displayName: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold },
  username: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    marginTop: Spacing.lg, gap: Spacing.xl,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold },
  statLabel: { color: Colors.textMuted, fontSize: Typography.xs },
  statDivider: { width: 1, height: 24, backgroundColor: Colors.border },
  menuSection: { paddingHorizontal: Spacing.base, marginBottom: Spacing.md },
  menuSectionTitle: {
    color: Colors.textMuted, fontSize: Typography.xs,
    fontWeight: Typography.semibold, letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  menuCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  menuIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { flex: 1, color: Colors.text, fontSize: Typography.base },
  menuDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },
  simpleHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  simpleHeaderTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  wantItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  wantPlayer: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  wantSet: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  wantMeta: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: 'wrap', alignItems: 'center' },
  wantMetaText: { color: Colors.textMuted, fontSize: Typography.xs },
  gradedBadge: {
    backgroundColor: Colors.accent + '22', borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 2,
    borderWidth: 1, borderColor: Colors.accent + '60',
  },
  gradedBadgeText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.medium },
  removeBtn: { padding: Spacing.sm },
});
