// Marketplace bootstrap screens — Phase 2B (M-H).
//
// Three entry points for getting cards onto the marketplace fast:
//   - BulkListInventoryScreen — pick a price source, hit "List N cards"
//   - EbayCsvImportScreen     — paste an eBay CSV, drafts created
//   - DraftsReviewScreen       — review imported drafts, bulk publish
//
// Driven by the existing /api/marketplace/bootstrap/* endpoints +
// /api/listings/mine/publish-drafts. Mobile UI only; no new schema.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Alert, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  marketplaceBootstrapApi, listingsApi,
} from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Spacing, Radius, Typography } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// ============================================================
// BULK LIST INVENTORY
// ============================================================
export const BulkListInventoryScreen = ({ navigation }) => {
  const [priceSource, setPriceSource] = useState('display');
  const [purchaseMultiplier, setPurchaseMultiplier] = useState('2.5');
  const [fixedPrice, setFixedPrice] = useState('5.00');
  const [shippingTier, setShippingTier] = useState('bmwt');
  const [onlyInCase, setOnlyInCase] = useState(true);

  const SHIPPING = {
    pwe: { tier: 'pwe', price_cents: 105 },
    bmwt: { tier: 'bmwt', price_cents: 450 },
    signature: { tier: 'signature', price_cents: 950 },
  };

  const runMut = useMutation({
    mutationFn: () => marketplaceBootstrapApi.fromInventory({
      price_source: priceSource,
      purchase_multiplier: priceSource === 'purchase_x'
        ? parseFloat(purchaseMultiplier) : undefined,
      fixed_price_cents: priceSource === 'fixed'
        ? Math.round(parseFloat(fixedPrice) * 100) : undefined,
      shipping_options: [SHIPPING[shippingTier]],
      only_in_case: onlyInCase,
      limit: 200,
    }),
    onSuccess: (out) => {
      Alert.alert(
        'Done',
        `Created ${out.created} listing(s) from ${out.eligible} eligible cards. ${out.skipped} skipped.`,
        [{ text: 'OK', onPress: () => navigation.navigate('MyListings') }],
      );
    },
    onError: (err) => Alert.alert('Bulk list failed', err.response?.data?.error || err.message),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Bulk list inventory" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}>
        <Text style={styles.help}>
          Turn cards in your collection into marketplace listings in one tap.
          Already-listed cards are skipped automatically.
        </Text>

        <Text style={styles.label}>PRICE SOURCE</Text>
        <Choice
          active={priceSource === 'display'}
          title="Case Mode prices"
          sub="Use display_asking_price set on each card."
          onPress={() => setPriceSource('display')}
        />
        <Choice
          active={priceSource === 'purchase_x'}
          title="Multiplier on cost"
          sub="List at N× what you paid."
          onPress={() => setPriceSource('purchase_x')}
        />
        {priceSource === 'purchase_x' && (
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>Multiplier:</Text>
            <TextInput
              style={styles.miniInput}
              value={purchaseMultiplier}
              onChangeText={setPurchaseMultiplier}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>×</Text>
          </View>
        )}
        <Choice
          active={priceSource === 'fixed'}
          title="Fixed price each"
          sub="Same price across all eligible cards."
          onPress={() => setPriceSource('fixed')}
        />
        {priceSource === 'fixed' && (
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>$</Text>
            <TextInput
              style={styles.miniInput}
              value={fixedPrice}
              onChangeText={setFixedPrice}
              keyboardType="decimal-pad"
            />
            <Text style={styles.inputLabel}>per card</Text>
          </View>
        )}

        <Text style={styles.label}>SHIPPING (default for all)</Text>
        <View style={{ gap: 6 }}>
          {Object.values(SHIPPING).map((opt) => (
            <Choice
              key={opt.tier}
              active={shippingTier === opt.tier}
              title={shipTierLabel(opt.tier)}
              sub={`${usd(opt.price_cents)} buyer-paid`}
              onPress={() => setShippingTier(opt.tier)}
            />
          ))}
        </View>

        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggle, onlyInCase && styles.toggleOn]}
            onPress={() => setOnlyInCase(!onlyInCase)}
          >
            {onlyInCase && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
          </TouchableOpacity>
          <Text style={styles.toggleLabel}>Only cards already in Case Mode</Text>
        </View>
        <Text style={styles.toggleHint}>
          Skip cards you haven't priced yet. Recommended for the first run.
        </Text>

        <Button
          title={runMut.isPending ? 'Listing…' : 'List eligible inventory'}
          onPress={() => runMut.mutate()}
          disabled={runMut.isPending}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// EBAY CSV IMPORT
// ============================================================
export const EbayCsvImportScreen = ({ navigation }) => {
  const [csv, setCsv] = useState('');
  const [shippingTier, setShippingTier] = useState('bmwt');

  const SHIPPING = {
    pwe: { tier: 'pwe', price_cents: 105 },
    bmwt: { tier: 'bmwt', price_cents: 450 },
    signature: { tier: 'signature', price_cents: 950 },
  };

  const importMut = useMutation({
    mutationFn: () => marketplaceBootstrapApi.ebayCsv({
      csv,
      shipping_options: [SHIPPING[shippingTier]],
    }),
    onSuccess: (out) => {
      Alert.alert(
        'Drafts created',
        `${out.drafted} drafts from ${out.rows} rows. ${out.skipped} skipped. Review and publish next.`,
        [{ text: 'Review drafts', onPress: () => navigation.replace('DraftsReview') }],
      );
    },
    onError: (err) => Alert.alert('Import failed', err.response?.data?.error || err.message),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Import from eBay" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}>
        <Text style={styles.help}>
          Paste your eBay Seller Hub CSV here. We create draft listings you'll review and publish in one tap.
        </Text>

        <Text style={styles.label}>SHIPPING DEFAULT</Text>
        <View style={{ gap: 6 }}>
          {Object.values(SHIPPING).map((opt) => (
            <Choice
              key={opt.tier}
              active={shippingTier === opt.tier}
              title={shipTierLabel(opt.tier)}
              sub={`${usd(opt.price_cents)}`}
              onPress={() => setShippingTier(opt.tier)}
            />
          ))}
        </View>

        <Text style={styles.label}>CSV CONTENT</Text>
        <TextInput
          style={[styles.input, { height: 200, textAlignVertical: 'top', fontFamily: 'monospace' }]}
          value={csv}
          onChangeText={setCsv}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Title,Price,Quantity,Condition,Photo URL,Item ID&#10;2024 Topps Chrome RC,25.00,1,Near Mint,https://...,1234567890"
          placeholderTextColor={Colors.textMuted}
        />
        <Text style={styles.hint}>
          Required columns: Title, Price. Optional: Quantity, Condition, Photo URL, Item ID.
        </Text>

        <Button
          title={importMut.isPending ? 'Importing…' : 'Import to drafts'}
          onPress={() => importMut.mutate()}
          disabled={!csv.trim() || importMut.isPending}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// DRAFTS REVIEW + BULK PUBLISH
// ============================================================
export const DraftsReviewScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(new Set());

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-listings'],
    queryFn: () => listingsApi.mine(),
  });

  const drafts = (data?.listings || []).filter((l) => l.status === 'draft');

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === drafts.length) setSelected(new Set());
    else setSelected(new Set(drafts.map((d) => d.id)));
  };

  const publishMut = useMutation({
    mutationFn: () => listingsApi.publishDrafts(
      selected.size === 0 ? null : Array.from(selected),
    ),
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ['my-listings'] });
      const failed = out.results?.filter((r) => r.status === 'failed') || [];
      Alert.alert(
        out.published > 0 ? 'Published' : 'Done',
        `${out.published} live · ${out.failed} failed`
          + (failed.length
            ? '\n\n' + failed.slice(0, 5).map((r) => {
              const codes = r.errors?.map((e) => e.code) || [r.error];
              return `· ${codes.join(', ')}`;
            }).join('\n')
            : ''),
        [{ text: 'OK', onPress: () => {
          setSelected(new Set());
          if (out.published > 0) navigation.replace('MyListings');
        }}],
      );
    },
    onError: (err) => Alert.alert('Publish failed', err.response?.data?.error || err.message),
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Review drafts"
        right={drafts.length > 0 && (
          <TouchableOpacity onPress={toggleAll}>
            <Text style={styles.headerAction}>
              {selected.size === drafts.length ? 'None' : 'All'}
            </Text>
          </TouchableOpacity>
        )}
      />
      {!drafts.length ? (
        <EmptyState
          icon="📝"
          title="No drafts to review"
          message="Imported listings land here for review before going live."
          action={{ title: 'Import from eBay', onPress: () => navigation.navigate('EbayCsvImport') }}
        />
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(d) => d.id}
          contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100, gap: Spacing.xs }}
          renderItem={({ item }) => {
            const photo = Array.isArray(item.photos) ? item.photos[0] : null;
            const isSel = selected.has(item.id);
            return (
              <TouchableOpacity style={styles.draftRow} onPress={() => toggle(item.id)}>
                <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                  {isSel && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
                </View>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { justifyContent: 'center', alignItems: 'center' }]}>
                    <Ionicons name="image-outline" size={20} color={Colors.textDim} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.draftPrice}>{usd(item.asking_price_cents)}</Text>
                  <Text style={styles.draftSub} numberOfLines={2}>
                    {item.condition || '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {drafts.length > 0 && (
        <View style={styles.ctaBar}>
          <Button
            title={
              publishMut.isPending ? 'Publishing…' :
              selected.size === 0
                ? `Publish all ${drafts.length}`
                : `Publish ${selected.size}`
            }
            onPress={() => publishMut.mutate()}
            disabled={publishMut.isPending}
            style={{ flex: 1 }}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

// ============================================================
// SHARED
// ============================================================
const Choice = ({ active, title, sub, onPress }) => (
  <TouchableOpacity
    style={[styles.choice, active && styles.choiceActive]}
    onPress={onPress}
  >
    <View style={[styles.radio, active && styles.radioOn]}>
      {active && <View style={styles.radioDot} />}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={[styles.choiceTitle, active && { color: Colors.bg }]}>{title}</Text>
      <Text style={[styles.choiceSub, active && { color: 'rgba(0,0,0,0.7)' }]}>{sub}</Text>
    </View>
  </TouchableOpacity>
);

function shipTierLabel(t) {
  return ({
    pwe: 'Plain envelope',
    bmwt: 'Bubble mailer + tracking',
    signature: 'Signature required',
  })[t] || t;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  help: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: Spacing.md },
  label: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  hint: { color: Colors.textDim, fontSize: 11, fontStyle: 'italic', marginTop: 4 },
  headerAction: { color: Colors.accent, fontSize: 13, fontWeight: '600' },

  choice: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    marginBottom: 4,
  },
  choiceActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  choiceTitle: { color: Colors.text, fontWeight: '500' },
  choiceSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: Colors.border, justifyContent: 'center', alignItems: 'center' },
  radioOn: { borderColor: Colors.bg },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.bg },

  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    marginLeft: 36, marginBottom: 6, marginTop: -2,
  },
  inputLabel: { color: Colors.textMuted, fontSize: 13 },
  miniInput: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 15,
    padding: 8, borderRadius: 6, minWidth: 70, textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 13,
    padding: Spacing.sm, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  toggle: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  toggleOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleLabel: { color: Colors.text, fontSize: 14 },
  toggleHint: { color: Colors.textMuted, fontSize: 11, marginLeft: 36, marginTop: 2 },

  draftRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radius.md,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  thumb: { width: 50, height: 50, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  draftPrice: { color: Colors.text, fontWeight: '600' },
  draftSub: { color: Colors.textMuted, fontSize: 12, marginTop: 2 },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
});
