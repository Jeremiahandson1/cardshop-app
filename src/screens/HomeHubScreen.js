// HomeHubScreen — first thing the user sees after login.
// Three big tappable tiles, one per "mode" the app supports.
// Tapping a tile jumps into the existing stack for that area.
//
// The point: keep the user from being confronted with the full
// tab/screen surface area on launch. They pick the lens they
// want (Show Floor, Collection, Local LCS) and only see what's
// relevant to that lens until they come back here.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { useAuthStore } from '../store/authStore';

const TILES = [
  {
    key: 'show-floor',
    icon: 'flash',
    iconColor: '#e8c547',
    title: 'Show Floor',
    subtitle: 'Live now — sell at a show or shop a show',
    bg: 'rgba(232,197,71,0.10)',
    border: 'rgba(232,197,71,0.45)',
    target: { tab: 'Profile', screen: 'ShowFloorHub' },
  },
  {
    key: 'collection',
    icon: 'albums',
    iconColor: '#7dd3fc',
    title: 'My Collection',
    subtitle: 'Binders, want list, trade, marketplace',
    bg: 'rgba(125,211,252,0.10)',
    border: 'rgba(125,211,252,0.40)',
    target: { tab: 'Binders' },
  },
  {
    key: 'local-lcs',
    icon: 'location',
    iconColor: '#86efac',
    title: 'My Local LCS',
    subtitle: 'Card shops near you',
    bg: 'rgba(134,239,172,0.10)',
    border: 'rgba(134,239,172,0.40)',
    target: { tab: 'LCS' },
  },
];

export const HomeHubScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const onTilePress = (target) => {
    try {
      if (target.screen) {
        navigation.navigate(target.tab, { screen: target.screen });
      } else {
        navigation.navigate(target.tab);
      }
    } catch (e) {
      console.warn('[home] navigate failed', e?.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            {greeting}{user?.display_name || user?.username ? `, ${user.display_name || user.username}` : ''}
          </Text>
          <Text style={styles.subtitle}>What are you here to do?</Text>
        </View>

        <View style={styles.tileGrid}>
          {TILES.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              activeOpacity={0.8}
              style={[styles.tile, { backgroundColor: tile.bg, borderColor: tile.border }]}
              onPress={() => onTilePress(tile.target)}
            >
              <View style={[styles.iconBubble, { backgroundColor: tile.iconColor + '20' }]}>
                <Ionicons name={tile.icon} size={32} color={tile.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tileTitle}>{tile.title}</Text>
                <Text style={styles.tileSubtitle}>{tile.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.profileLink}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <Ionicons name="person-outline" size={18} color={Colors.textMuted} />
          <Text style={styles.profileLinkText}>Profile & settings</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  header: { paddingTop: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.xs },
  greeting: {
    fontFamily: Typography.display,
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  tileGrid: { gap: Spacing.md },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: {
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  tileSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  profileLinkText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
