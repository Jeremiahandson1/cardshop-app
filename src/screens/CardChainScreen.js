// Card chain-of-custody timeline screen (Theme B).
// "The chain for every card." Brand-facing — every transfer, stolen flag,
// grading event laid out in a vertical timeline. Anonymized to
// usernames; no PII. The most polished screen in the app should
// live here because it's the differentiator's storefront.

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { cardChainApi } from '../services/api';
import { LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

export const CardChainScreen = ({ navigation, route }) => {
  const { cardId } = route.params || {};

  const { data, isLoading } = useQuery({
    queryKey: ['card-chain', cardId],
    queryFn: () => cardChainApi.get(cardId).then((r) => r.data),
  });

  if (isLoading || !data) return <LoadingScreen />;

  const { card, current_owner, chain_length, events } = data;

  const sharePage = async () => {
    try {
      await Share.share({
        message: `${card.title} on Card Shop — chain of ${chain_length} owners. https://cardshop.twomiah.com/card/${card.id}`,
        url: `https://cardshop.twomiah.com/card/${card.id}`,
      });
    } catch {}
  };

  const fmt = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chain of custody</Text>
        <TouchableOpacity
          onPress={sharePage}
          accessibilityLabel="Share this card's chain of custody"
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 4,
            paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
            backgroundColor: Colors.accent + '22',
            borderWidth: 1, borderColor: Colors.accent + '66',
          }}
        >
          <Ionicons name="share-outline" size={14} color={Colors.accent} />
          <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>Share</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* HERO */}
        <View style={styles.hero}>
          {card.hero_image ? (
            <Image source={{ uri: card.hero_image }} style={styles.heroImage} resizeMode="contain" />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={36} color={Colors.textMuted} />
            </View>
          )}
          <Text style={styles.heroTitle}>{card.title}</Text>
          <Text style={styles.heroMeta}>
            {card.manufacturer ? `${card.manufacturer} · ` : ''}
            {card.card_number ? `#${card.card_number}` : ''}
            {card.parallel ? ` · ${card.parallel}` : ''}
            {card.serial_number ? ` · /${card.serial_number}` : ''}
          </Text>
          {card.grading_company && (
            <View style={styles.gradeBadge}>
              <Text style={styles.gradeBadgeText}>
                {card.grading_company.toUpperCase()} {card.grade}
                {card.cert_number ? ` · #${card.cert_number}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* CHAIN HEADER */}
        <View style={styles.chainHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.chainCount}>{chain_length}</Text>
            <Text style={styles.chainCountLabel}>{chain_length === 1 ? 'link in chain' : 'links in chain'}</Text>
          </View>
          {current_owner ? (
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.ownerLabel}>Current owner</Text>
              <Text style={styles.ownerName}>@{current_owner.username}</Text>
            </View>
          ) : null}
        </View>

        {card.reported_stolen && (
          <View style={styles.stolenBanner}>
            <Ionicons name="alert-circle" size={20} color={Colors.accent3} />
            <Text style={styles.stolenText}>
              <Text style={{ fontWeight: 'bold' }}>Reported stolen.</Text>{' '}
              This card has a confirmed stolen-card report. Don't transact off-platform.
            </Text>
          </View>
        )}

        {/* TIMELINE */}
        <View style={styles.timeline}>
          {events.map((e, i) => (
            <View key={i} style={styles.event}>
              <View style={styles.eventGutter}>
                <View style={[
                  styles.eventDot,
                  e.kind === 'stolen_report' && styles.eventDotAlert,
                  e.self_reported && { backgroundColor: Colors.textMuted, borderColor: Colors.textMuted },
                ]}
                />
                {i < events.length - 1 && <View style={styles.eventLine} />}
              </View>
              <View style={styles.eventBody}>
                <Text style={styles.eventTitle}>{e.title}</Text>
                {e.self_reported && (
                  <View style={{
                    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
                    backgroundColor: Colors.textMuted + '22', borderColor: Colors.textMuted + '66',
                    borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginVertical: 4,
                  }}
                  >
                    <Ionicons name="information-circle-outline" size={11} color={Colors.textMuted} />
                    <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}>
                      SELF-REPORTED · NOT VERIFIED BY CARD SHOP
                    </Text>
                  </View>
                )}
                {e.detail && <Text style={styles.eventDetail}>{e.detail}</Text>}
                {e.evidence_url && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                    <Image source={{ uri: e.evidence_url }} style={styles.photo} resizeMode="cover" />
                  </ScrollView>
                )}
                <Text style={styles.eventDate}>{fmt(e.at)}</Text>
                {Array.isArray(e.photos) && e.photos.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                    {e.photos.map((url, j) => (
                      <Image key={j} source={{ uri: url }} style={styles.photo} resizeMode="cover" />
                    ))}
                  </ScrollView>
                )}
                {(e.packout_video || e.unpack_video) && (
                  <View style={styles.videoBadgeRow}>
                    {e.packout_video && (
                      <View style={styles.videoBadge}><Ionicons name="videocam" size={11} color={Colors.accent} /><Text style={styles.videoBadgeText}>pack-out video</Text></View>
                    )}
                    {e.unpack_video && (
                      <View style={styles.videoBadge}><Ionicons name="videocam" size={11} color={Colors.accent} /><Text style={styles.videoBadgeText}>unpack video</Text></View>
                    )}
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footnote}>
          Every event in this chain is signed and timestamped. Card Shop does not edit chain history.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },

  hero: { padding: Spacing.base, alignItems: 'center', gap: 6 },
  heroImage: { width: '70%', aspectRatio: 0.72, borderRadius: Radius.md, backgroundColor: Colors.surface },
  heroTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, marginTop: Spacing.sm, textAlign: 'center' },
  heroMeta: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center' },
  gradeBadge: {
    backgroundColor: Colors.accent + '22', borderColor: Colors.accent, borderWidth: 1,
    borderRadius: Radius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginTop: Spacing.xs,
  },
  gradeBadgeText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.bold, letterSpacing: 0.5 },

  chainHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chainCount: { color: Colors.accent, fontSize: 32, fontWeight: Typography.bold, lineHeight: 34 },
  chainCountLabel: { color: Colors.textMuted, fontSize: Typography.xs, textTransform: 'uppercase', letterSpacing: 1 },
  ownerLabel: { color: Colors.textMuted, fontSize: Typography.xs },
  ownerName: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, marginTop: 2 },

  stolenBanner: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.accent3 + '20', borderColor: Colors.accent3, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.md, margin: Spacing.base,
  },
  stolenText: { color: Colors.accent3, fontSize: Typography.sm, lineHeight: 19, flex: 1 },

  timeline: { padding: Spacing.base, gap: 0 },
  event: { flexDirection: 'row', gap: Spacing.sm },
  eventGutter: { width: 16, alignItems: 'center', paddingTop: 4 },
  eventDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.accent, borderWidth: 2, borderColor: Colors.bg },
  eventDotAlert: { backgroundColor: Colors.accent3 },
  eventLine: { width: 2, flex: 1, backgroundColor: Colors.border, marginTop: 2 },
  eventBody: { flex: 1, paddingBottom: Spacing.lg },
  eventTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  eventDetail: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  eventDate: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4 },
  photoStrip: { marginTop: Spacing.xs },
  photo: { width: 80, height: 80, borderRadius: Radius.sm, marginRight: 6, backgroundColor: Colors.surface },
  videoBadgeRow: { flexDirection: 'row', gap: 6, marginTop: Spacing.xs },
  videoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.sm },
  videoBadgeText: { color: Colors.accent, fontSize: 11, fontWeight: Typography.semibold },

  footnote: {
    color: Colors.textMuted, fontSize: Typography.xs, textAlign: 'center',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, fontStyle: 'italic',
  },
});
