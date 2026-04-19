// My Local LCS — box-price screens.
// Feature-gated from navigation via Constants.expoConfig.extra.LCS_ENABLED.
// Flow: Home (zip) → ShopList → ShopDetail → PostPrice (Product picker → Variant pick → $)

import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Image, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';

import { lcsApi } from '../services/api';
import { Button, Input, EmptyState, LoadingScreen, ScreenHeader, SectionHeader } from '../components/ui';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ============================================================
// LOCAL STATE — remember user's zip between screens
// ============================================================
const useLcsStore = create((set) => ({
  zip: '',
  radius: 100,
  setZip: (zip) => set({ zip }),
  setRadius: (radius) => set({ radius }),
}));

// ============================================================
// SHARED HELPERS
// ============================================================
const formatDistance = (miles) => {
  if (miles == null) return '';
  const n = parseFloat(miles);
  return n < 1 ? `${Math.round(n * 10) / 10} mi` : `${Math.round(n)} mi`;
};

const formatPrice = (n) => `$${parseFloat(n).toFixed(2)}`;

const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

// ============================================================
// 1. HOME — zip entry
// ============================================================
export const LCSHomeScreen = ({ navigation }) => {
  const { zip, setZip } = useLcsStore();
  const [input, setInput] = useState(zip);

  const go = () => {
    const clean = input.trim();
    if (!/^\d{5}$/.test(clean)) {
      Alert.alert('Enter a 5-digit ZIP', 'Example: 54701');
      return;
    }
    setZip(clean);
    navigation.navigate('LCSShopList');
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="My Local LCS" subtitle="Box prices near you" />
      <View style={styles.homeBody}>
        <Text style={styles.homeHint}>
          Enter your ZIP to see card shops within 100 miles and compare box prices.
        </Text>
        <Input
          placeholder="ZIP code"
          value={input}
          onChangeText={setInput}
          keyboardType="number-pad"
          maxLength={5}
          style={{ marginBottom: Spacing.base }}
        />
        <Button title="Find shops" onPress={go} />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// 2. SHOP LIST — shops within radius of ZIP
// ============================================================
export const LCSShopListScreen = ({ navigation }) => {
  const { zip, radius } = useLcsStore();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['lcs', 'shops', zip, radius],
    queryFn: () => lcsApi.shopsNearZip(zip, radius).then((r) => r.data),
    enabled: !!zip,
  });

  const shops = data?.shops || [];

  const renderShop = useCallback(({ item }) => (
    <TouchableOpacity
      style={styles.shopCard}
      onPress={() => navigation.navigate('LCSShopDetail', { shopId: item.id, shopName: item.name })}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.shopName}>{item.name}</Text>
        <Text style={styles.shopMeta} numberOfLines={1}>
          {[item.city, item.state].filter(Boolean).join(', ')}
        </Text>
        <Text style={styles.shopDistance}>{formatDistance(item.distance_miles)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={Colors.textMuted} />
    </TouchableOpacity>
  ), [navigation]);

  if (isLoading) return <LoadingScreen message="Finding card shops..." />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={`Shops near ${zip}`}
        subtitle={`Within ${radius} miles`}
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="location-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        )}
      />
      <FlatList
        data={shops}
        keyExtractor={(s) => s.id}
        renderItem={renderShop}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={shops.length ? styles.listPad : styles.flexCenter}
        ListEmptyComponent={
          <EmptyState
            icon="🏪"
            title="No shops found"
            message="Try a different ZIP or submit a shop we missed."
            action={{ label: 'Submit a shop', onPress: () => navigation.navigate('LCSSubmitShop') }}
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// 3. SHOP DETAIL — current prices at this shop
// ============================================================
export const LCSShopDetailScreen = ({ navigation, route }) => {
  const { shopId, shopName } = route.params;
  const qc = useQueryClient();

  const { data: shopData } = useQuery({
    queryKey: ['lcs', 'shop', shopId],
    queryFn: () => lcsApi.getShop(shopId).then((r) => r.data),
  });

  const { data: pricesData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['lcs', 'shop-prices', shopId],
    queryFn: () => lcsApi.shopPrices(shopId).then((r) => r.data),
  });

  const verifyMut = useMutation({
    mutationFn: ({ priceId, currently }) =>
      currently ? lcsApi.unverifyPrice(priceId) : lcsApi.verifyPrice(priceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lcs', 'shop-prices', shopId] }),
    onError: (e) => Alert.alert('Could not update verification', e.response?.data?.error || e.message),
  });

  const prices = pricesData?.prices || [];

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader
        title={shopData?.name || shopName}
        subtitle={[shopData?.city, shopData?.state].filter(Boolean).join(', ')}
      />
      <FlatList
        data={prices}
        keyExtractor={(p) => p.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={styles.listPad}
        renderItem={({ item }) => (
          <PriceRow
            price={item}
            onVerify={() => verifyMut.mutate({ priceId: item.id, currently: item.user_has_verified })}
            onTrend={() => navigation.navigate('LCSPriceTrend', {
              productId: item.product_id,
              variantId: item.variant_id,
              productName: item.product_name,
            })}
          />
        )}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.md }}>
            <Button
              title="Post a price"
              onPress={() => navigation.navigate('LCSPostPrice', { shopId, shopName: shopData?.name || shopName })}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="💲"
            title="No prices posted yet"
            message="Be the first to post a box price at this shop."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// Row renderer for a single price (used on shop + product views)
// ============================================================
const PriceRow = ({ price, onVerify, onTrend }) => (
  <View style={styles.priceRow}>
    {price.product_image_url ? (
      <Image source={{ uri: price.product_image_url }} style={styles.priceImg} />
    ) : (
      <View style={[styles.priceImg, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="cube-outline" size={24} color={Colors.textMuted} />
      </View>
    )}
    <View style={{ flex: 1, marginLeft: Spacing.md }}>
      <Text style={styles.priceProduct} numberOfLines={1}>{price.product_name}</Text>
      <Text style={styles.priceVariant}>{price.variant_name}</Text>
      <Text style={styles.priceMeta}>
        by {price.posted_by_username} · {timeAgo(price.posted_at)}
      </Text>
      {onTrend ? (
        <TouchableOpacity onPress={onTrend} style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="trending-up" size={12} color={Colors.accent} />
          <Text style={{ color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.semibold }}>
            Market trend
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={styles.priceValue}>{formatPrice(price.price)}</Text>
      <TouchableOpacity
        onPress={onVerify}
        disabled={price.is_own_post}
        style={[
          styles.verifyBtn,
          price.user_has_verified && styles.verifyBtnOn,
          price.is_own_post && { opacity: 0.4 },
        ]}
      >
        <Ionicons
          name={price.user_has_verified ? 'checkmark-circle' : 'checkmark-circle-outline'}
          size={16}
          color={price.user_has_verified ? Colors.bg : Colors.accent2}
        />
        <Text style={[
          styles.verifyText,
          price.user_has_verified && { color: Colors.bg },
        ]}>
          {price.verify_count}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ============================================================
// 4. POST PRICE — shop chosen; pick product → variant → enter price
// ============================================================
export const LCSPostPriceScreen = ({ navigation, route }) => {
  const { shopId, shopName } = route.params;
  const qc = useQueryClient();

  const [product, setProduct] = useState(null);
  const [variant, setVariant] = useState(null);
  const [priceText, setPriceText] = useState('');
  const [notes, setNotes] = useState('');

  const { data: productData } = useQuery({
    queryKey: ['lcs', 'product', product?.id],
    queryFn: () => lcsApi.getProduct(product.id).then((r) => r.data),
    enabled: !!product?.id,
  });

  const variants = productData?.variants || [];

  const postMut = useMutation({
    mutationFn: () => lcsApi.postPrice({
      shop_id: shopId,
      variant_id: variant.id,
      price: parseFloat(priceText),
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lcs', 'shop-prices', shopId] });
      navigation.goBack();
    },
    onError: (e) => Alert.alert('Could not post price', e.response?.data?.error || e.message),
  });

  const canSubmit = !!(product && variant && priceText && parseFloat(priceText) > 0);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Post a price" subtitle={shopName} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.formPad}>
          <SectionHeader title="Product" />
          <TouchableOpacity
            style={styles.picker}
            onPress={() => navigation.navigate('LCSProductPicker', {
              onPick: (p) => { setProduct(p); setVariant(null); },
            })}
          >
            {product ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                {product.image_url && (
                  <Image source={{ uri: product.image_url }} style={styles.pickerImg} />
                )}
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.pickerText} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.pickerSub}>{product.manufacturer} · {product.year || ''}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.pickerPlaceholder}>Choose a product…</Text>
            )}
            <Ionicons name="chevron-forward" size={22} color={Colors.textMuted} />
          </TouchableOpacity>

          {product && (
            <>
              <SectionHeader title="Variant" />
              <View style={styles.variantWrap}>
                {variants.length === 0 ? (
                  <Text style={styles.pickerSub}>No variants available for this product.</Text>
                ) : variants.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => setVariant(v)}
                    style={[styles.variantChip, variant?.id === v.id && styles.variantChipOn]}
                  >
                    <Text style={[styles.variantText, variant?.id === v.id && { color: Colors.bg }]}>
                      {v.variant_name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <SectionHeader title="Price" />
          <Input
            placeholder="Price (USD)"
            value={priceText}
            onChangeText={setPriceText}
            keyboardType="decimal-pad"
            style={{ marginBottom: Spacing.md }}
          />
          <Input
            placeholder="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{ minHeight: 60, marginBottom: Spacing.lg }}
          />

          <Button
            title={postMut.isPending ? 'Posting…' : 'Post price'}
            onPress={() => postMut.mutate()}
            disabled={!canSubmit || postMut.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================
// 5. PRODUCT PICKER — searchable list; returns pick via callback
// ============================================================
export const LCSProductPickerScreen = ({ navigation, route }) => {
  const onPick = route.params?.onPick;
  const [q, setQ] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['lcs', 'products', q],
    queryFn: () => lcsApi.searchProducts({ q, limit: 40 }).then((r) => r.data),
  });

  const products = data?.products || [];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Pick a product" />
      <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
        <Input
          placeholder="Search: Topps Chrome, Prismatic Evolutions…"
          value={q}
          onChangeText={setQ}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={products}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listPad}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.productRow}
            onPress={() => { onPick?.(item); navigation.goBack(); }}
          >
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.productImg} />
            ) : (
              <View style={[styles.productImg, { alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="cube-outline" size={24} color={Colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.productMeta}>
                {[item.manufacturer, item.year, item.sport_or_tcg].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          !isFetching && (
            <EmptyState icon="📦" title="No products" message="Try different keywords." />
          )
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// 6. SUBMIT SHOP — manual entry for missing shops
// ============================================================
export const LCSSubmitShopScreen = ({ navigation }) => {
  const [form, setForm] = useState({
    name: '', address_line1: '', city: '', state: '', zip: '',
    lat: '', lng: '', phone: '', website: '',
  });
  const qc = useQueryClient();

  const submitMut = useMutation({
    mutationFn: () => lcsApi.submitShop({
      name: form.name.trim(),
      address_line1: form.address_line1.trim() || undefined,
      city: form.city.trim() || undefined,
      state: form.state.trim() || undefined,
      zip: form.zip.trim() || undefined,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      phone: form.phone.trim() || undefined,
      website: form.website.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lcs', 'shops'] });
      Alert.alert('Submitted', 'Shop added to the directory.');
      navigation.goBack();
    },
    onError: (e) => Alert.alert('Could not submit', e.response?.data?.error || e.message),
  });

  const latLngValid = !isNaN(parseFloat(form.lat)) && !isNaN(parseFloat(form.lng));
  const canSubmit = form.name.trim().length >= 2 && latLngValid;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Submit a shop" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.formPad}>
          {[
            ['name', 'Shop name'],
            ['address_line1', 'Street address'],
            ['city', 'City'],
            ['state', 'State'],
            ['zip', 'ZIP'],
            ['lat', 'Latitude (e.g. 44.8113)'],
            ['lng', 'Longitude (e.g. -91.4985)'],
            ['phone', 'Phone (optional)'],
            ['website', 'Website (optional)'],
          ].map(([key, label]) => (
            <Input
              key={key}
              placeholder={label}
              value={form[key]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              keyboardType={['lat', 'lng', 'zip', 'phone'].includes(key) ? 'numbers-and-punctuation' : 'default'}
              autoCapitalize={['name', 'city', 'state'].includes(key) ? 'words' : 'none'}
              style={{ marginBottom: Spacing.md }}
            />
          ))}
          <Button
            title={submitMut.isPending ? 'Submitting…' : 'Submit shop'}
            onPress={() => submitMut.mutate()}
            disabled={!canSubmit || submitMut.isPending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  flexCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listPad: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxl },
  formPad: { padding: Spacing.base, paddingBottom: Spacing.xxxl },

  homeBody: { padding: Spacing.base, marginTop: Spacing.md },
  homeHint: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    marginBottom: Spacing.base,
    lineHeight: 22,
  },

  shopCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  shopName: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  shopMeta: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  shopDistance: { color: Colors.accent2, fontSize: Typography.xs, marginTop: 4 },

  priceRow: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceImg: {
    width: 56, height: 56, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2,
  },
  priceProduct: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  priceVariant: { color: Colors.accent2, fontSize: Typography.sm, marginTop: 2 },
  priceMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 4 },
  priceValue: {
    color: Colors.accent, fontSize: Typography.lg, fontWeight: Typography.bold,
  },
  verifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.accent2,
  },
  verifyBtnOn: { backgroundColor: Colors.accent2 },
  verifyText: {
    color: Colors.accent2, fontSize: Typography.xs,
    fontWeight: Typography.semibold, marginLeft: 4,
  },

  picker: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    minHeight: 72,
  },
  pickerImg: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  pickerText: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  pickerSub: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },
  pickerPlaceholder: { color: Colors.textMuted, fontSize: Typography.base, flex: 1 },

  variantWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  variantChip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  variantChipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  variantText: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },

  productRow: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  productImg: { width: 48, height: 48, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  productName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  productMeta: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: 2 },

  intentBadge: {},

  // Price trend screen
  trendSummary: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  trendStat: {
    flex: 1,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  trendStatLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  trendStatValue: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    marginTop: 4,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  trendBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surface2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trendBar: {
    height: '100%',
    backgroundColor: Colors.accent,
  },
  trendWeek: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    width: 72,
  },
  trendPrice: {
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    width: 70,
    textAlign: 'right',
  },
  trendDetail: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
});

// ============================================================
// 7. PRICE TREND — aggregate market view, intentionally no per-shop data
// Route params: { productId, variantId?, productName? }
// ============================================================
export const LCSPriceTrendScreen = ({ navigation, route }) => {
  const { productId, variantId, productName } = route.params || {};

  const { data, isLoading } = useQuery({
    queryKey: ['lcs-trend', productId, variantId],
    queryFn: () => lcsApi.productTrend(productId, { variant_id: variantId, weeks: 12 }).then((r) => r.data),
    enabled: !!productId,
  });

  if (isLoading || !data) return <LoadingScreen message="Loading market trend..." />;

  const series = data.series || [];
  const summary = data.summary;

  // Normalize bar widths against max avg in the range
  const maxAvg = series.reduce((max, s) => Math.max(max, parseFloat(s.avg) || 0), 0) || 1;

  const pctChange = summary?.pct_change;
  const trendDirection = pctChange == null
    ? 'flat'
    : pctChange > 2 ? 'up'
    : pctChange < -2 ? 'down'
    : 'flat';
  const trendColor = trendDirection === 'up'
    ? Colors.success
    : trendDirection === 'down' ? Colors.error : Colors.textMuted;
  const trendIcon = trendDirection === 'up'
    ? 'trending-up'
    : trendDirection === 'down' ? 'trending-down' : 'remove';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Market Trend"
        subtitle={productName || 'Aggregated across all shops'}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        {/* Summary tiles */}
        {summary ? (
          <View style={styles.trendSummary}>
            <View style={styles.trendStat}>
              <Text style={styles.trendStatLabel}>Now</Text>
              <Text style={styles.trendStatValue}>{formatPrice(summary.last)}</Text>
            </View>
            <View style={styles.trendStat}>
              <Text style={styles.trendStatLabel}>12 wks ago</Text>
              <Text style={styles.trendStatValue}>{formatPrice(summary.first)}</Text>
            </View>
            <View style={styles.trendStat}>
              <Text style={styles.trendStatLabel}>Change</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <Ionicons name={trendIcon} size={16} color={trendColor} />
                <Text style={[styles.trendStatValue, { color: trendColor, marginTop: 0 }]}>
                  {pctChange != null ? `${pctChange > 0 ? '+' : ''}${pctChange}%` : '—'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <SectionHeader title="Weekly (last 12 weeks)" />

        {series.length === 0 ? (
          <EmptyState
            icon="📉"
            title="Not enough data yet"
            message="We need a few posted prices before we can show a trend."
          />
        ) : (
          series.map((w, i) => {
            const avg = parseFloat(w.avg);
            const pct = maxAvg > 0 ? (avg / maxAvg) * 100 : 0;
            return (
              <View key={i} style={styles.trendRow}>
                <Text style={styles.trendWeek}>
                  {new Date(w.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.trendBarWrap}>
                    <View style={[styles.trendBar, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.trendDetail}>
                    {w.price_count} post{w.price_count === 1 ? '' : 's'} · {w.shop_count} shop{w.shop_count === 1 ? '' : 's'} · median {formatPrice(w.median)}
                  </Text>
                </View>
                <Text style={styles.trendPrice}>{formatPrice(avg)}</Text>
              </View>
            );
          })
        )}

        <Text style={[styles.trendDetail, { marginTop: Spacing.base, textAlign: 'center' }]}>
          Averaged across all reporting shops. Individual shops aren't identified in this view.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};
