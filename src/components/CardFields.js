import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input, SectionHeader } from './ui';
import { Colors, Spacing, Radius, Typography } from '../theme';

/**
 * CardFields — the shared listing/detail fields used by BOTH the register
 * details step and the edit-card screen, so they stay identical and we
 * declutter once instead of in three places.
 *
 * The caller owns form state and passes:
 *   form  — the form object (for_sale, for_trade, asking_price, condition,
 *           serial_number, public_notes, purchase_price, personal_valuation,
 *           notes, and optionally grading_company on the register flow)
 *   set   — curried setter: set('field')(value)
 *   card  — context for conditional fields: { grading_company, print_run }
 *
 * Deliberately NOT here:
 *   - show-floor price (display_asking_price) — lives in Case Mode / Manage
 *     Booth (PATCH /cards/:id/display-mode), not the everyday edit screen.
 *   - photos, grading picker, catalog match, acquisition, video, binder —
 *     those are create-only / screen-specific and stay on their screens.
 *
 * Layout, top-to-bottom: (1) Price & availability, (2) the card
 * (condition + serial), (3) public notes, (4) Private details (collapsed).
 */

export const CONDITIONS = [
  { key: 'gem_mint', label: 'Gem Mint', ebay: 'Graded — Gem Mint',
    desc: 'Perfect centering, sharp corners, no printing defects visible under magnification.' },
  { key: 'mint', label: 'Mint', ebay: 'Mint or Mint 9',
    desc: 'Near-perfect centering (55/45+), sharp corners, clean surface. One very minor flaw acceptable.' },
  { key: 'near_mint', label: 'Near Mint', ebay: 'Near Mint–Mint or NM 8',
    desc: 'Slight off-centering, minor corner wear, light surface scratches at an angle. No creases.' },
  { key: 'excellent', label: 'Excellent', ebay: 'Excellent',
    desc: 'Mild corner rounding, minor edge wear. Image still sharp, no creases.' },
  { key: 'very_good', label: 'Very Good', ebay: 'Very Good',
    desc: 'Noticeable corner wear and edge fuzz. May have a single very light crease.' },
  { key: 'good', label: 'Good', ebay: 'Good',
    desc: 'Rounded corners, visible creases, surface scratches. Image intact.' },
  { key: 'fair', label: 'Fair', ebay: 'Fair',
    desc: 'Heavy wear, multiple creases, possible minor tears. Image recognizable.' },
  { key: 'poor', label: 'Poor', ebay: 'Poor',
    desc: 'Major damage — tears, water damage, stains, writing, pin-holes.' },
];

export const CardFields = ({ form, set, card = {}, showCondition = true }) => {
  const [conditionDescFor, setConditionDescFor] = useState(null);
  const [showPrivate, setShowPrivate] = useState(false);

  // Effective grade: register flow keeps it on the form; edit reads the
  // card. Condition only applies to raw cards.
  const grading = form.grading_company ?? card.grading_company;
  const isRaw = !grading || grading === 'raw';

  return (
    <View style={{ gap: Spacing.lg }}>
      {/* 1 — PRICE & AVAILABILITY (the common reason people are here) */}
      <View>
        <SectionHeader title="Price & availability" />
        <View style={styles.statusRow}>
          <TouchableOpacity
            style={[styles.statusBtn, form.for_sale && styles.statusBtnActive]}
            onPress={() => set('for_sale')(!form.for_sale)}
          >
            <Text style={[styles.statusBtnLabel, form.for_sale && { color: Colors.accent }]}>
              {form.for_sale ? '✓ For sale' : 'For sale'}
            </Text>
            <Text style={styles.statusBtnDesc}>Buyers can make cash offers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statusBtn, form.for_trade && styles.statusBtnActive]}
            onPress={() => set('for_trade')(!form.for_trade)}
          >
            <Text style={[styles.statusBtnLabel, form.for_trade && { color: Colors.accent }]}>
              {form.for_trade ? '✓ For trade' : 'For trade'}
            </Text>
            <Text style={styles.statusBtnDesc}>Lists it on the trade board</Text>
          </TouchableOpacity>
        </View>
        {form.for_sale ? (
          <View style={{ marginTop: Spacing.sm }}>
            <Input
              label="Asking price"
              value={form.asking_price}
              onChangeText={set('asking_price')}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
        ) : null}
      </View>

      {/* 2 — THE CARD: condition (raw only) + serial (numbered only).
          showCondition=false when the host screen renders its own condition
          (e.g. the register flow couples it to the grade picker). */}
      {showCondition && isRaw ? (
        <View>
          <SectionHeader title="Condition (eBay scale)" />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -Spacing.base }}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}
          >
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.key}
                style={[styles.condBtn, form.condition === c.key && styles.condBtnActive]}
                onPress={() => { set('condition')(c.key); setConditionDescFor(c.key); }}
              >
                <Text style={[styles.condText, form.condition === c.key && styles.condTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {conditionDescFor ? (() => {
            const picked = CONDITIONS.find((c) => c.key === conditionDescFor);
            if (!picked) return null;
            return (
              <View style={styles.condDesc}>
                <Text style={{ color: Colors.text, fontWeight: '700', marginBottom: 2 }}>{picked.label}</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 6 }}>
                  eBay equivalent: {picked.ebay}
                </Text>
                <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 18 }}>{picked.desc}</Text>
              </View>
            );
          })() : null}
        </View>
      ) : null}

      {card.print_run ? (
        <Input
          label={`Your copy (1-${card.print_run})`}
          value={form.serial_number}
          onChangeText={set('serial_number')}
          placeholder={`e.g. 7 of ${card.print_run}`}
          keyboardType="number-pad"
        />
      ) : null}

      {/* 3 — PUBLIC NOTES */}
      <View>
        <SectionHeader title="Public notes" />
        <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
          Shown to anyone viewing the card.
        </Text>
        <Input
          value={form.public_notes}
          onChangeText={set('public_notes')}
          placeholder="Notes visible to everyone..."
          multiline
        />
      </View>

      {/* 4 — PRIVATE DETAILS (collapsed by default — out of the way) */}
      <View>
        <TouchableOpacity style={styles.drawerHead} onPress={() => setShowPrivate((v) => !v)}>
          <Text style={styles.drawerTitle}>Private details</Text>
          <Ionicons
            name={showPrivate ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textMuted}
          />
        </TouchableOpacity>
        {showPrivate ? (
          <View style={{ marginTop: Spacing.sm }}>
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
              Never shown to anyone else.
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Input label="Purchase price" value={form.purchase_price} onChangeText={set('purchase_price')} placeholder="0.00" keyboardType="decimal-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Input label="Your valuation" value={form.personal_valuation} onChangeText={set('personal_valuation')} placeholder="0.00" keyboardType="decimal-pad" />
              </View>
            </View>
            <Input label="Private notes" value={form.notes} onChangeText={set('notes')} placeholder="Only you can see these..." multiline />
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', gap: Spacing.sm },
  statusBtn: {
    flex: 1, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  statusBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '18' },
  statusBtnLabel: { color: Colors.text, fontWeight: '700', marginBottom: 2 },
  statusBtnDesc: { color: Colors.textMuted, fontSize: 12 },
  condBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  condBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '18' },
  condText: { color: Colors.textMuted, fontWeight: '600' },
  condTextActive: { color: Colors.accent, fontWeight: '700' },
  condDesc: {
    marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  drawerHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  drawerTitle: { color: Colors.text, fontWeight: '700', fontSize: Typography.md },
});

export default CardFields;
