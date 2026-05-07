// "What is Show Floor?" — shown when a user without the Show Floor
// tier taps the Show Floor tile on the home picker. Explains the
// feature in their own terms and offers an upgrade CTA.
//
// Free + Collector Pro users land here. Users on Show Floor /
// Store Starter / Store Pro skip this and go straight to the
// ShowFloorHub.
import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button } from '../components/ui';

const FEATURES = [
  {
    icon: 'storefront',
    title: 'Set up your booth in seconds',
    body: 'Pick which binders go live for the show. Cards flip to display mode automatically — buyers can see your asking price the moment they walk by.',
  },
  {
    icon: 'pricetag',
    title: 'Show prices set once, used every show',
    body: 'Bump (or drop) any card\'s show-floor price one time. It auto-applies whenever you go live. No re-pricing every weekend.',
  },
  {
    icon: 'qr-code',
    title: 'Stickers any phone can scan',
    body: 'Print URL-format QR stickers from your phone or browser. Buyers point a stock camera at the case and see your full card info — no app required.',
  },
  {
    icon: 'search',
    title: 'Buyers search the whole floor',
    body: 'Anyone at the show can search every live seller\'s inventory in one place. They walk straight to your table. No flipping through every binder at every booth.',
  },
  {
    icon: 'flash',
    title: 'Auto-listing when the show ends',
    body: 'Optionally roll your live cards into permanent marketplace listings the moment your session ends. Sell the rest of your stock to remote buyers.',
  },
];

export const ShowFloorUpsellScreen = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Show Floor</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="flash" size={48} color="#e8c547" />
          </View>
          <Text style={styles.heroTitle}>Run a card-show booth from your phone</Text>
          <Text style={styles.heroBody}>
            Show Floor turns your collection into a live storefront for the weekend. Sellers go live, buyers walk the floor in your app. No paper, no cash math, no "what was that price again?"
          </Text>
        </View>

        <View style={{ gap: Spacing.md }}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <View style={styles.featureIcon}>
                <Ionicons name={f.icon} size={22} color="#e8c547" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.priceBlock}>
          <Text style={styles.price}>$14.99/mo</Text>
          <Text style={styles.priceSub}>Includes everything in Collector Pro.</Text>
        </View>

        <Button
          title="Upgrade to Show Floor"
          onPress={() => navigation.navigate('Upgrade')}
          style={{ marginTop: Spacing.md }}
        />
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.maybeLater}>
          <Text style={styles.maybeLaterText}>Maybe later</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: {
    color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold,
    flex: 1, textAlign: 'center', marginHorizontal: Spacing.sm,
  },
  scroll: { padding: Spacing.base, paddingBottom: Spacing.xxl, gap: Spacing.lg },
  hero: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.md },
  heroIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(232,197,71,0.12)',
    borderWidth: 1, borderColor: 'rgba(232,197,71,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: Typography.display, fontSize: 26, fontWeight: '700',
    color: Colors.text, textAlign: 'center', letterSpacing: -0.5,
    paddingHorizontal: Spacing.md,
  },
  heroBody: {
    fontSize: 15, color: Colors.textMuted, lineHeight: 22,
    textAlign: 'center', paddingHorizontal: Spacing.sm,
  },
  feature: {
    flexDirection: 'row', gap: Spacing.md,
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  featureIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(232,197,71,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  featureBody: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  priceBlock: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 4 },
  price: {
    fontFamily: Typography.display, fontSize: 36, fontWeight: '800',
    color: '#e8c547', letterSpacing: -1,
  },
  priceSub: { fontSize: 13, color: Colors.textMuted },
  maybeLater: {
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm,
  },
  maybeLaterText: { color: Colors.textMuted, fontSize: 14 },
});
