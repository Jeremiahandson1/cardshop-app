// First-run onboarding — 3 swipeable cards covering the core
// loops a new user can do in the app. Rendered as a top-level
// Modal overlay (NOT a stack screen) so:
//   - It can't accidentally persist in any tab's history
//   - Skip + Get started are guaranteed to dismiss it
//   - Tab switching never re-surfaces it
//   - Navigation state restoration can't bring it back
//
// Driven by state in RootNavigator; SecureStore flag persists
// across launches. Set the flag immediately on mount (defensive)
// AND on finish so any failure path still dismisses for good.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions, FlatList, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { Button } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const ONBOARDING_SEEN_KEY = 'cs_onboarding_seen_v1';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CARDS = [
  {
    key: 'scan',
    icon: 'qr-code',
    title: 'Tag your cards',
    body: 'Stick a Card Shop QR on a card and every transfer, scan, and ownership change is logged forever. Pro includes 25 stickers a month.',
  },
  {
    key: 'trade',
    icon: 'swap-horizontal',
    title: 'List for trade',
    body: 'Post a card to the Trade Board. Choose who sees it — public, your trade groups, or both. Get private offers; nobody sees what others bid.',
  },
  {
    key: 'lcs',
    icon: 'pricetag',
    title: 'Know the local price',
    body: 'See what local card shops are charging for sealed boxes near you. Crowdsourced, real prices, not sticker prices.',
  },
];

// New API: <OnboardingOverlay visible={...} onDone={...} />
// Old <OnboardingScreen /> still exported below for back-compat
// but is unused once the modal overlay is wired in RootNavigator.
export const OnboardingOverlay = ({ visible, onDone }) => {
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  // Defensive flag-set on first show — if anything goes wrong
  // mid-onboarding (force-close, JS error, navigation reset),
  // the user has still been counted as having "seen" the
  // onboarding and won't get re-prompted next launch.
  useEffect(() => {
    if (!visible) return;
    SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1').catch(() => {});
  }, [visible]);

  const finish = async () => {
    try { await SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1'); } catch {}
    onDone?.();
  };

  const next = () => {
    if (index < CARDS.length - 1) {
      const nextIdx = index + 1;
      setIndex(nextIdx);
      listRef.current?.scrollToIndex({ index: nextIdx, animated: true });
    } else {
      finish();
    }
  };

  const renderCard = ({ item }) => (
    <View style={[styles.card, { width: SCREEN_WIDTH }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={item.icon} size={48} color={Colors.accent} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );

  const onScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / SCREEN_WIDTH);
    if (i !== index) setIndex(i);
  };

  return (
    <Modal
      visible={!!visible}
      animationType="fade"
      onRequestClose={finish}
      // Hardware back on Android calls onRequestClose; we treat
      // it as Skip so the modal can never get stuck.
    >
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={finish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={CARDS}
          keyExtractor={(c) => c.key}
          renderItem={renderCard}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, i) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * i, index: i })}
        />

        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index ? styles.dotActive : null]}
            />
          ))}
        </View>

        <View style={styles.bottomBar}>
          <Button
            title={index === CARDS.length - 1 ? 'Get started' : 'Next'}
            onPress={next}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
};

// Legacy stack-screen wrapper, no-op — the navigation registration
// stays put for now in case any deep link references it. Visit
// just dismisses immediately.
export const OnboardingScreen = ({ navigation }) => {
  useEffect(() => {
    SecureStore.setItemAsync(ONBOARDING_SEEN_KEY, '1').catch(() => {});
    navigation.goBack();
  }, [navigation]);
  return null;
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  skipBtn: { padding: Spacing.sm },
  skipText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  card: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surface2,
    borderWidth: 1, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: 28,
    fontWeight: Typography.heavy,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  body: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: Spacing.lg,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.surface3,
  },
  dotActive: { backgroundColor: Colors.accent, width: 24 },
  bottomBar: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.lg,
  },
});
