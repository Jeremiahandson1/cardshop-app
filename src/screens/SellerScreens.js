// Seller-side marketplace screens.
//
//   MyListingsScreen      — seller's own listings (all statuses)
//   CreateListingScreen   — multi-step wizard: pick card → photos → price → ship → publish
//   MyOrdersScreen        — orders where I'm seller OR buyer
//   OrderDetailScreen     — one order's lifecycle + ship action

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ScrollView,
  Alert, TextInput, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listingsApi, ordersApi, shippingApi, cardsApi, bindersApi,
} from '../services/api';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as SecureStore from 'expo-secure-store';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// ============================================================
// MY LISTINGS
// ============================================================
export const MyListingsScreen = ({ navigation }) => {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-listings'],
    queryFn: () => listingsApi.mine(),
  });
  const listings = data?.listings || [];
  const draftCount = listings.filter((l) => l.status === 'draft').length;

  const showBulkMenu = () => {
    Alert.alert(
      'Add listings',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Single listing', onPress: () => navigation.navigate('CreateListing') },
        { text: 'Bulk-list inventory', onPress: () => navigation.navigate('BulkListInventory') },
        { text: 'Import from eBay', onPress: () => navigation.navigate('EbayCsvImport') },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="My listings"
        right={
          <TouchableOpacity onPress={showBulkMenu}>
            <Ionicons name="add-circle" size={28} color={Colors.accent} />
          </TouchableOpacity>
        }
      />
      {draftCount > 0 && (
        <TouchableOpacity
          style={localStyles.draftBanner}
          onPress={() => navigation.navigate('DraftsReview')}
        >
          <Ionicons name="document-text-outline" size={18} color={Colors.accent} />
          <Text style={localStyles.draftBannerText}>
            {draftCount} draft listing(s) waiting for review
          </Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
        </TouchableOpacity>
      )}
      {isLoading ? (
        <LoadingScreen />
      ) : !listings.length ? (
        <EmptyState
          icon="🪧"
          title="No listings yet"
          message="List a card you own, bulk-list your inventory, or import from eBay."
          action={{ title: 'List a card', onPress: showBulkMenu }}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.listingRow}
              onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
            >
              <Image
                source={{ uri: Array.isArray(item.photos) ? item.photos[0] : null }}
                style={styles.thumb}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.listingPrice}>{usd(item.asking_price_cents)}</Text>
                <Text style={styles.listingStatus}>
                  {statusLabel(item.status)}
                  {item.view_count > 0 && ` · ${item.view_count} views`}
                  {item.watch_count > 0 && ` · ${item.watch_count} watching`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

function statusLabel(s) {
  return ({
    draft: '📝 Draft', active: '✅ Active', sold: '💰 Sold',
    cancelled: 'Cancelled', flagged: '⚠️ Flagged', removed: '🚫 Removed',
  })[s] || s;
}

// ============================================================
// CREATE LISTING — wizard
// ============================================================
export const CreateListingScreen = ({ navigation, route }) => {
  // Pre-filled when launched from a card detail screen.
  const initialOwnedCardId = route.params?.owned_card_id;
  const initialCatalogId = route.params?.card_catalog_id;

  const [step, setStep] = useState(initialOwnedCardId ? 1 : 0);   // 0 = pick card, 1 = photos+price, 2 = shipping, 3 = review
  const [ownedCardId, setOwnedCardId] = useState(initialOwnedCardId || null);
  const [cardCatalogId, setCardCatalogId] = useState(initialCatalogId || null);
  const [photos, setPhotos] = useState([]);
  const [askingPrice, setAskingPrice] = useState('');
  const [condition, setCondition] = useState(null);
  const [grade, setGrade] = useState('');
  const [gradingCompany, setGradingCompany] = useState(null);
  const [description, setDescription] = useState('');
  const [shippingOptions, setShippingOptions] = useState([]);
  const [acceptsOffers, setAcceptsOffers] = useState(false);

  // Pull user's owned cards as the source for "pick card" step.
  const { data: cardsData } = useQuery({
    queryKey: ['my-cards-for-listing'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
    enabled: step === 0,
  });

  const createMut = useMutation({
    mutationFn: () => listingsApi.create({
      owned_card_id: ownedCardId,
      card_catalog_id: cardCatalogId,
      asking_price_cents: Math.round(parseFloat(askingPrice) * 100),
      photos,
      condition,
      grading_company: gradingCompany,
      grade: grade || undefined,
      description: description || undefined,
      shipping_options: shippingOptions,
      accepts_offers: acceptsOffers,
    }),
    onSuccess: (out) => {
      Alert.alert(
        'Listed!',
        out.warnings?.length
          ? `Note: ${out.warnings.map((w) => w.message).join(' · ')}`
          : 'Your listing is live on the marketplace.',
        [{ text: 'OK', onPress: () => navigation.replace('ListingDetail', { id: out.listing.id }) }],
      );
    },
    onError: (err) => {
      const data = err.response?.data;
      const msg = data?.errors
        ? data.errors.map((e) => e.message).join('\n')
        : data?.error || err.message;
      Alert.alert('Listing rejected', msg);
    },
  });

  const cards = cardsData?.cards || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={['Pick a card', 'Photos & price', 'Shipping', 'Review'][step]} />
      <View style={styles.stepDots}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i <= step && styles.dotActive]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.md, paddingBottom: 100 }}>
        {step === 0 && (
          <>
            <Text style={styles.help}>Pick the card you want to list. Listings backed by your chain
            get a "Verified ownership" badge buyers can see.</Text>
            {!cards.length && <EmptyState icon="🃏" title="No cards yet" message="Add a card to your collection first." />}
            {cards.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.cardPickRow}
                onPress={() => {
                  setOwnedCardId(c.id);
                  setCardCatalogId(c.card_catalog_id);
                  setStep(1);
                }}
              >
                <Image source={{ uri: c.front_image_url }} style={styles.thumb} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardPickTitle} numberOfLines={2}>
                    {c.year ? `${c.year} ` : ''}{c.set_name}
                    {c.parallel ? ` · ${c.parallel}` : ''}
                  </Text>
                  <Text style={styles.cardPickSub}>{c.player_name}{c.card_number ? ` #${c.card_number}` : ''}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.label}>Photos (front + back required, 4 for $200+)</Text>
            <PhotoPicker photos={photos} onChange={setPhotos} />

            <Text style={styles.label}>Asking price (USD)</Text>
            <TextInput
              style={styles.priceInput}
              value={askingPrice}
              onChangeText={setAskingPrice}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.label}>Condition</Text>
            <View style={styles.chipRow}>
              {['mint','near_mint','excellent','vg','good','fair','poor','slabbed'].map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, condition === c && styles.chipActive]}
                  onPress={() => setCondition(c)}
                >
                  <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>
                    {c.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {condition === 'slabbed' && (
              <>
                <Text style={styles.label}>Grading company</Text>
                <View style={styles.chipRow}>
                  {['PSA','BGS','SGC','CSG','HGA'].map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, gradingCompany === c && styles.chipActive]}
                      onPress={() => setGradingCompany(c)}
                    >
                      <Text style={[styles.chipText, gradingCompany === c && styles.chipTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.label}>Grade</Text>
                <TextInput
                  style={styles.input}
                  value={grade}
                  onChangeText={setGrade}
                  placeholder="e.g. 10 or 9.5"
                  placeholderTextColor={Colors.textMuted}
                />
              </>
            )}

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              multiline
              placeholder="Anything about the card the buyer should know"
              placeholderTextColor={Colors.textMuted}
            />

            <Button
              title="Next"
              onPress={() => setStep(2)}
              disabled={!photos.length || photos.length < 2 || !askingPrice || !condition}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.help}>
              Pick which shipping options you'll accept. Buyer chooses from these
              at checkout. $200+ orders require signature shipping.
            </Text>
            <ShipOptionsPicker value={shippingOptions} onChange={setShippingOptions} highValue={parseFloat(askingPrice) >= 200} />

            <View style={[styles.row, { marginTop: Spacing.md }]}>
              <TouchableOpacity
                style={[styles.toggle, acceptsOffers && styles.toggleOn]}
                onPress={() => setAcceptsOffers(!acceptsOffers)}
              >
                {acceptsOffers && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
              </TouchableOpacity>
              <Text style={styles.toggleLabel}>Accept offers below asking</Text>
            </View>

            <Button
              title="Review"
              onPress={() => setStep(3)}
              disabled={!shippingOptions.length}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.label}>Review your listing</Text>
            <View style={styles.reviewBox}>
              <Text style={styles.reviewItem}>Price: {askingPrice ? usd(Math.round(parseFloat(askingPrice) * 100)) : '—'}</Text>
              <Text style={styles.reviewItem}>Photos: {photos.length}</Text>
              <Text style={styles.reviewItem}>Condition: {condition || '—'}</Text>
              {condition === 'slabbed' && <Text style={styles.reviewItem}>Grade: {gradingCompany} {grade}</Text>}
              <Text style={styles.reviewItem}>Shipping: {shippingOptions.map((o) => o.tier).join(', ')}</Text>
              <Text style={styles.reviewItem}>Offers: {acceptsOffers ? 'Yes' : 'No'}</Text>
            </View>
            <Button
              title={createMut.isPending ? 'Publishing…' : 'Publish listing'}
              onPress={() => createMut.mutate()}
              disabled={createMut.isPending}
              style={{ marginTop: Spacing.md }}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// Photo picker — opens the device camera or photo library, captures a
// base64 data URL, and appends it to the photos array. Backend
// (uploadIfBase64) detects the data: prefix and uploads to Cloudinary.
const PhotoPicker = ({ photos, onChange }) => {
  const addFromCamera = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Camera permission needed', 'Enable camera access in Settings to capture listing photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        base64: true,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
      onChange([...photos, dataUrl]);
    } catch (e) {
      Alert.alert('Camera error', e.message);
    }
  };

  const addFromLibrary = async () => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Photo library access needed', 'Enable photo access in Settings to attach existing pictures.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.7,
        base64: true,
        allowsEditing: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;
      const dataUrl = `data:image/jpeg;base64,${result.assets[0].base64}`;
      onChange([...photos, dataUrl]);
    } catch (e) {
      Alert.alert('Photo library error', e.message);
    }
  };

  const openPicker = () => {
    Alert.alert(
      'Add photo',
      photos.length === 0
        ? 'Front of card first — back of card next.'
        : photos.length === 1
        ? 'Now the back of the card.'
        : 'Add another angle (corners, edges, slab label).',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take photo', onPress: addFromCamera },
        { text: 'Choose from library', onPress: addFromLibrary },
      ],
    );
  };

  return (
    <View style={styles.photoGrid}>
      {photos.map((urlOrDataUrl, i) => (
        <View key={i} style={styles.photoTile}>
          <Image source={{ uri: urlOrDataUrl }} style={{ width: '100%', height: '100%' }} />
          <TouchableOpacity
            style={styles.photoRemove}
            onPress={() => onChange(photos.filter((_, idx) => idx !== i))}
          >
            <Ionicons name="close-circle" size={20} color={Colors.accent3} />
          </TouchableOpacity>
          {i === 0 && (
            <View style={styles.photoCoverPill}>
              <Text style={styles.photoCoverPillText}>COVER</Text>
            </View>
          )}
        </View>
      ))}
      {photos.length < 8 && (
        <TouchableOpacity
          style={[styles.photoTile, styles.photoAdd]}
          onPress={openPicker}
        >
          <Ionicons name="camera" size={28} color={Colors.textMuted} />
          <Text style={styles.photoAddText}>
            {photos.length === 0 ? 'Front' : photos.length === 1 ? 'Back' : 'More'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const ShipOptionsPicker = ({ value, onChange, highValue }) => {
  const tiers = [
    { tier: 'pwe', name: 'Plain envelope', defaultPrice: 105, note: 'No tracking. <$20 cards.' },
    { tier: 'bmwt', name: 'Bubble mailer + tracking', defaultPrice: 450, note: 'For $20-200 cards.' },
    { tier: 'signature', name: 'Signature required', defaultPrice: 950, note: 'Required for $200+.' },
  ];
  const toggle = (tier) => {
    const exists = value.find((v) => v.tier === tier.tier);
    if (exists) onChange(value.filter((v) => v.tier !== tier.tier));
    else onChange([...value, { tier: tier.tier, price_cents: tier.defaultPrice }]);
  };
  return (
    <View style={{ gap: Spacing.xs }}>
      {tiers.map((t) => {
        const sel = value.find((v) => v.tier === t.tier);
        const disabled = highValue && t.tier !== 'signature' && !sel;   // can still toggle off
        return (
          <TouchableOpacity
            key={t.tier}
            style={[styles.shipPick, sel && styles.shipPickActive]}
            onPress={() => toggle(t)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.shipPickName, sel && { color: Colors.bg }]}>{t.name}</Text>
              <Text style={[styles.shipPickNote, sel && { color: Colors.bg }]}>{t.note}</Text>
            </View>
            <Text style={[styles.shipPickPrice, sel && { color: Colors.bg }]}>
              {usd(t.defaultPrice)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

// ============================================================
// MY ORDERS
// ============================================================
export const MyOrdersScreen = ({ navigation }) => {
  const [role, setRole] = useState('buyer');
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['my-orders', role],
    queryFn: () => ordersApi.list({ role }),
  });
  const orders = data?.orders || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Orders" />
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, role === 'buyer' && styles.tabActive]} onPress={() => setRole('buyer')}>
          <Text style={[styles.tabText, role === 'buyer' && styles.tabTextActive]}>Bought</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, role === 'seller' && styles.tabActive]} onPress={() => setRole('seller')}>
          <Text style={[styles.tabText, role === 'seller' && styles.tabTextActive]}>Sold</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? <LoadingScreen /> : !orders.length ? (
        <EmptyState icon="📦" title="No orders" message={role === 'buyer' ? 'Your purchases show up here.' : 'Your sales show up here.'} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.orderRow}
              onPress={() => navigation.navigate('OrderDetail', { id: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.orderStatus}>{orderStatusLabel(item.status)}</Text>
                <Text style={styles.orderSub}>
                  {item.item_count} item{item.item_count === 1 ? '' : 's'} · {new Date(item.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.orderTotal}>{usd(item.buyer_total_cents)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

function orderStatusLabel(s) {
  return ({
    pending: '⏳ Pending payment',
    authorized: '✅ Paid — awaiting ship',
    captured: '📦 Awaiting ship',
    shipped: '🚚 Shipped',
    in_transit: '🚚 In transit',
    delivered: '📬 Delivered — 7-day hold',
    complete: '✅ Complete',
    disputed: '⚠️ Disputed',
    refunded: '↩️ Refunded',
    cancelled: '❌ Cancelled',
  })[s] || s;
}

// ============================================================
// ORDER DETAIL
// ============================================================
export const OrderDetailScreen = ({ navigation, route }) => {
  const { id } = route.params;
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
  });

  const buyLabelMut = useMutation({
    mutationFn: () => shippingApi.buyLabel(id),
    onSuccess: (out) => {
      Alert.alert('Label generated', `Tracking: ${out.tracking_number}`);
      if (out.label_url) Linking.openURL(out.label_url);
      qc.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: (err) => Alert.alert('Label failed', err.response?.data?.error || err.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => ordersApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      Alert.alert('Cancelled');
    },
    onError: (err) => Alert.alert('Cancel failed', err.response?.data?.error || err.message),
  });

  if (isLoading) return <LoadingScreen />;
  if (!data?.order) return <EmptyState icon="❌" title="Order not found" />;

  const { order, items } = data;
  const isSeller = !!order.seller_id;     // page is shown for both — UI branches below

  // Download + share the PDF receipt. Auth required, so we fetch
  // with the Bearer token, write to a temp file, then open the
  // share sheet. Same pattern existing screens use for CSV export.
  const downloadReceipt = async () => {
    try {
      const token = await SecureStore.getItemAsync('access_token');
      const url = ordersApi.receiptUrl(id);
      const filename = `cardshop-receipt-${id.slice(0, 8)}.pdf`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const result = await FileSystem.downloadAsync(url, dest, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (result.status !== 200) {
        Alert.alert('Receipt failed', `HTTP ${result.status}`);
        return;
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Card Shop receipt',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Receipt saved to ${result.uri}`);
      }
    } catch (e) {
      Alert.alert('Receipt error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Order" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
        <View style={styles.statusBox}>
          <Text style={styles.statusBig}>{orderStatusLabel(order.status)}</Text>
          {order.delivered_at && order.released_at && (
            <Text style={styles.statusNote}>
              Funds release {new Date(order.released_at).toLocaleDateString()}
            </Text>
          )}
        </View>

        <Text style={styles.sectionLabel}>ITEMS</Text>
        <View style={styles.box}>
          {items.map((i) => (
            <View key={i.listing_id} style={styles.itemRow}>
              <Image source={{ uri: Array.isArray(i.photos) ? i.photos[0] : null }} style={styles.thumbSm} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {i.year ? `${i.year} ` : ''}{i.set_name}
                </Text>
                <Text style={styles.itemSub}>{i.player_name}</Text>
              </View>
              <Text style={styles.itemPrice}>{usd(i.card_price_cents)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>BREAKDOWN</Text>
        <View style={styles.box}>
          <Row label="Card subtotal" value={usd(order.card_subtotal_cents)} />
          <Row label="Shipping" value={usd(order.shipping_cents)} />
          {order.sales_tax_cents > 0 && <Row label="Tax" value={usd(order.sales_tax_cents)} />}
          <Row label="Card Shop fee" value={usd(order.total_seller_fee_cents)} />
          <View style={styles.divider} />
          <Row label="Total" value={usd(order.buyer_total_cents)} bold />
        </View>

        {/* Seller actions */}
        {['authorized', 'captured'].includes(order.status) && (
          <Button
            title={buyLabelMut.isPending ? 'Generating…' : 'Generate shipping label'}
            onPress={() => buyLabelMut.mutate()}
            disabled={buyLabelMut.isPending}
            style={{ marginTop: Spacing.md }}
          />
        )}
        {['shipped', 'in_transit', 'delivered'].includes(order.status) && (
          <Button
            title="View shipping label"
            variant="ghost"
            onPress={async () => {
              const lbl = await shippingApi.getLabel(id).catch(() => null);
              if (lbl?.label_url) Linking.openURL(lbl.label_url);
              else Alert.alert('No label available');
            }}
            style={{ marginTop: Spacing.md }}
          />
        )}

        {/* Buyer actions */}
        {order.status === 'delivered' && (
          <Button
            title="File a dispute"
            variant="ghost"
            onPress={() => navigation.navigate('FileOrderDispute', { order_id: order.id })}
            style={{ marginTop: Spacing.md }}
          />
        )}

        {/* Receipt — available once captured */}
        {!['pending', 'authorized', 'cancelled'].includes(order.status) && (
          <Button
            title="Download receipt (PDF)"
            variant="ghost"
            onPress={downloadReceipt}
            style={{ marginTop: Spacing.sm }}
          />
        )}

        {/* Either party can cancel pending */}
        {['pending', 'authorized'].includes(order.status) && (
          <Button
            title="Cancel order"
            variant="ghost"
            onPress={() => Alert.alert('Cancel order?', '', [
              { text: 'Keep' },
              { text: 'Cancel order', style: 'destructive', onPress: () => cancelMut.mutate() },
            ])}
            style={{ marginTop: Spacing.sm }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const Row = ({ label, value, bold }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 }}>
    <Text style={[styles.rowLabel, bold && { color: Colors.text, fontWeight: '700' }]}>{label}</Text>
    <Text style={[styles.rowValue, bold && { fontWeight: '700' }]}>{value}</Text>
  </View>
);

// ============================================================
// FILE ORDER DISPUTE
// ============================================================
export const FileOrderDisputeScreen = ({ navigation, route }) => {
  const { order_id } = route.params;
  const [reason, setReason] = useState(null);
  const [detail, setDetail] = useState('');
  const fileMut = useMutation({
    mutationFn: () => import('../services/api').then((m) => m.orderDisputesApi.file({
      order_id, reason, reason_detail: detail,
    })),
    onSuccess: () => {
      Alert.alert('Dispute filed', 'The seller has 5 days to respond.');
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Filing failed', err.response?.data?.error || err.message),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="File a dispute" />
      <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
        <Text style={styles.help}>Pick what went wrong. The seller will see your evidence and respond within 5 days.</Text>
        {[
          ['never_arrived', 'Never arrived'],
          ['damaged', 'Arrived damaged'],
          ['not_as_described', 'Not as described'],
          ['wrong_card', 'Wrong card sent'],
          ['counterfeit', 'Counterfeit / fake'],
          ['other', 'Other'],
        ].map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, reason === k && styles.chipActive, { marginBottom: 6 }]}
            onPress={() => setReason(k)}
          >
            <Text style={[styles.chipText, reason === k && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
          value={detail}
          onChangeText={setDetail}
          multiline
          placeholder="What happened? Add photos by replying with evidence after filing."
          placeholderTextColor={Colors.textMuted}
        />
        <Button
          title={fileMut.isPending ? 'Filing…' : 'File dispute'}
          onPress={() => fileMut.mutate()}
          disabled={!reason || fileMut.isPending}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// Local styles specific to MyListings (banner). Kept separate to
// avoid bloating the shared `styles` block below.
const localStyles = StyleSheet.create({
  draftBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3a2820',
    paddingVertical: 10, paddingHorizontal: 14,
    marginHorizontal: Spacing.md, marginTop: Spacing.sm,
    borderRadius: Radius.md,
  },
  draftBannerText: { flex: 1, color: '#ffaa66', fontSize: 13 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  stepDots: {
    flexDirection: 'row', gap: 6, padding: Spacing.sm, justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.surface2 },
  dotActive: { backgroundColor: Colors.accent },

  help: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: Spacing.md },
  label: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  input: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 15,
    padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.border,
  },
  priceInput: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 28, fontWeight: '600',
    padding: Spacing.md, borderRadius: Radius.md, textAlign: 'center',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textMuted, fontSize: 12 },
  chipTextActive: { color: Colors.bg, fontWeight: '600' },

  cardPickRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radius.md,
    marginBottom: Spacing.xs,
  },
  cardPickTitle: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  cardPickSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  thumb: { width: 50, height: 50, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },
  thumbSm: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surface2 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.md },
  photoTile: { width: 90, height: 90, borderRadius: Radius.sm, backgroundColor: Colors.surface, position: 'relative', overflow: 'hidden' },
  photoAdd: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', gap: 4 },
  photoAddText: { color: Colors.textMuted, fontSize: 11 },
  photoRemove: { position: 'absolute', top: 2, right: 2 },
  photoCoverPill: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  photoCoverPillText: { color: Colors.text, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  shipPick: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  shipPickActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  shipPickName: { color: Colors.text, fontWeight: '500' },
  shipPickNote: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  shipPickPrice: { color: Colors.text, fontWeight: '600' },

  toggle: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  toggleOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleLabel: { color: Colors.text, marginLeft: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },

  reviewBox: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md, gap: 4,
  },
  reviewItem: { color: Colors.text, fontSize: 14 },

  listingRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radius.md,
  },
  listingPrice: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  listingStatus: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  tabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm,
  },
  tab: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.bg, fontWeight: '700' },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
  },
  orderStatus: { color: Colors.text, fontWeight: '500' },
  orderSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  orderTotal: { color: Colors.text, fontWeight: '700' },

  statusBox: {
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
    alignItems: 'center', gap: 4, marginBottom: Spacing.md,
  },
  statusBig: { color: Colors.text, fontSize: 18, fontWeight: '600' },
  statusNote: { color: Colors.textMuted, fontSize: 12 },

  sectionLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1.5, marginTop: Spacing.md, marginBottom: Spacing.xs },
  box: { backgroundColor: Colors.surface, borderRadius: Radius.md, padding: Spacing.sm },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  itemName: { color: Colors.text, fontSize: 13 },
  itemSub: { color: Colors.textMuted, fontSize: 11 },
  itemPrice: { color: Colors.text, fontWeight: '600' },

  rowLabel: { color: Colors.textMuted, fontSize: 13 },
  rowValue: { color: Colors.text, fontSize: 13 },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
});
