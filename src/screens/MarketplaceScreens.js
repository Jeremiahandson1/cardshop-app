// Marketplace browse + listing detail.
//
// Screens:
//   MarketplaceHomeScreen   — tabs: For You / Just Listed / Most Watched / Search
//   MarketplaceSearchScreen — text + filters
//   ListingDetailScreen     — public detail with Buy / Add to Cart / Watch
//   SavedSearchesScreen     — manage push alerts

import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  TextInput, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { marketplaceApi, listingsApi, cartApi } from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen, VerificationBadge } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

// ============================================================
// MARKETPLACE HOME
// ============================================================
export const MarketplaceHomeScreen = ({ navigation }) => {
  const [tab, setTab] = useState('feed');     // feed | just_listed | most_watched

  const fetchers = {
    feed: () => marketplaceApi.feed({ limit: 25 }),
    just_listed: () => marketplaceApi.justListed({ limit: 25 }),
    most_watched: () => marketplaceApi.mostWatched({ limit: 25 }),
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['marketplace-feed', tab],
    queryFn: fetchers[tab],
  });

  const listings = data?.listings || [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Marketplace</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MarketplaceSearch')}
            accessibilityLabel="Search the marketplace"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
              backgroundColor: Colors.surface2,
              borderWidth: 1, borderColor: Colors.border,
            }}
          >
            <Ionicons name="search" size={13} color={Colors.text} />
            <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700' }}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('SavedSearches')}
            accessibilityLabel="Saved searches and alerts"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
              backgroundColor: Colors.surface2,
              borderWidth: 1, borderColor: Colors.border,
            }}
          >
            <Ionicons name="notifications-outline" size={13} color={Colors.text} />
            <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700' }}>Alerts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('CartList')}
            accessibilityLabel="View your cart"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
              backgroundColor: Colors.surface2,
              borderWidth: 1, borderColor: Colors.border,
            }}
          >
            <Ionicons name="cart-outline" size={13} color={Colors.text} />
            <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700' }}>Cart</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton title="For You" active={tab === 'feed'} onPress={() => setTab('feed')} />
        <TabButton title="Just Listed" active={tab === 'just_listed'} onPress={() => setTab('just_listed')} />
        <TabButton title="Most Watched" active={tab === 'most_watched'} onPress={() => setTab('most_watched')} />
      </View>

      {isLoading ? (
        <LoadingScreen message="Loading listings…" />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.sm }}
          contentContainerStyle={{ gap: Spacing.sm, paddingBottom: 60, paddingTop: Spacing.sm }}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={Colors.text} />}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={
            tab === 'feed' ? (
              // 'For You' is personalization-driven — if it's empty,
              // user hasn't built want lists yet. Different ask from
              // the platform-wide "no listings exist" state.
              <EmptyState
                icon="✨"
                title="Personalize your feed"
                message="Add cards to your binders or want list and we'll surface listings that match."
              />
            ) : (
              <MarketplaceFirstListingState onListCard={() => navigation.navigate('Profile', { screen: 'CreateListing' })} />
            )
          }
        />
      )}
    </SafeAreaView>
  );
};

const TabButton = ({ title, active, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{title}</Text>
  </TouchableOpacity>
);

// Be-the-first invite shown when the marketplace has genuinely
// zero listings. Replaces a flat "Nothing here yet" so the screen
// reads as an opportunity instead of a dead end.
const MarketplaceFirstListingState = ({ onListCard }) => (
  <View style={{ padding: Spacing.lg, alignItems: 'center' }}>
    <View style={{
      width: '100%',
      maxWidth: 420,
      borderWidth: 1,
      borderColor: Colors.border,
      borderStyle: 'dashed',
      borderRadius: 14,
      padding: Spacing.lg,
      backgroundColor: Colors.surface,
      alignItems: 'center',
    }}>
      <Text style={{ fontSize: 44, marginBottom: 8 }}>🃏</Text>
      <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 6 }}>
        This marketplace starts with you.
      </Text>
      <Text style={{ color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 16 }}>
        Be the first card. Card Shop's marketplace is community-grown — every
        listing pulls in the next collector. Tag a card, list it, set your price.
      </Text>
      <TouchableOpacity
        onPress={onListCard}
        style={{
          backgroundColor: Colors.accent,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          borderRadius: 10,
          marginBottom: 4,
        }}
      >
        <Text style={{ color: Colors.bg, fontWeight: '700', fontSize: 15 }}>
          List the first card →
        </Text>
      </TouchableOpacity>
    </View>

    {/* Three value props anchored under the CTA */}
    <View style={{ marginTop: Spacing.lg, width: '100%', maxWidth: 420, gap: Spacing.sm }}>
      {[
        { icon: '🔗', title: 'Verified ownership only', body: 'Every listing tied to a real account + chain-of-custody.' },
        { icon: '💸', title: '$1 max platform fee', body: 'On a $500 card a 10%-fee marketplace takes $50. We cap at $1 + Stripe.' },
        { icon: '🛡️', title: 'Transfer-on-default protection', body: 'Seller goes dark past the 5-day window? We transfer the card to the buyer anyway.' },
      ].map((v) => (
        <View key={v.title} style={{
          backgroundColor: Colors.surface2,
          borderRadius: 10,
          padding: Spacing.sm,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.sm,
        }}>
          <Text style={{ fontSize: 20 }}>{v.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 }}>{v.title}</Text>
            <Text style={{ color: Colors.textMuted, fontSize: 12, lineHeight: 16 }}>{v.body}</Text>
          </View>
        </View>
      ))}
    </View>
  </View>
);

const ListingCard = ({ listing, onPress }) => {
  const photo = Array.isArray(listing.photos) ? listing.photos[0] : null;
  return (
    <TouchableOpacity style={styles.cardTile} onPress={onPress}>
      {photo ? (
        <Image source={{ uri: photo }} style={styles.cardPhoto} resizeMode="cover" />
      ) : (
        <View style={[styles.cardPhoto, styles.cardPhotoEmpty]}>
          <Ionicons name="image-outline" size={32} color={Colors.textDim} />
        </View>
      )}
      <View style={{ padding: Spacing.xs, gap: 2 }}>
        <Text style={styles.cardPrice} numberOfLines={1}>{usd(listing.asking_price_cents)}</Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {listing.year ? `${listing.year} ` : ''}{listing.set_name || 'Unknown set'}
        </Text>
        {listing.player_name ? (
          <Text style={styles.cardSubtext} numberOfLines={1}>{listing.player_name}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          {listing.verified_ownership && (
            <Ionicons name="shield-checkmark" size={11} color={Colors.accent2} />
          )}
          {listing.cert_verified && (
            <Ionicons name="ribbon" size={11} color={Colors.accent} />
          )}
          {listing.watch_count > 0 && (
            <>
              <Ionicons name="heart" size={11} color={Colors.textMuted} />
              <Text style={styles.cardWatchers}>{listing.watch_count}</Text>
            </>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ============================================================
// SEARCH SCREEN
// ============================================================
export const MarketplaceSearchScreen = ({ navigation }) => {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['marketplace-search', q, filters],
    queryFn: () => marketplaceApi.search({ q, ...filters, limit: 25 }),
    enabled: q.length > 1 || Object.keys(filters).length > 0,
  });

  const listings = data?.listings || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Search marketplace" />
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Player, set, parallel…"
          placeholderTextColor={Colors.textMuted}
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
          autoCapitalize="none"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: Spacing.md, gap: 8 }}>
        <FilterChip label="Verified only" active={filters.verified_only} onPress={() => setFilters((f) => ({ ...f, verified_only: !f.verified_only }))} />
        <FilterChip label="Slabbed" active={filters.condition === 'slabbed'} onPress={() => setFilters((f) => ({ ...f, condition: f.condition === 'slabbed' ? undefined : 'slabbed' }))} />
        <FilterChip label="Under $20" active={filters.max_price_cents === 2000} onPress={() => setFilters((f) => ({ ...f, max_price_cents: f.max_price_cents === 2000 ? undefined : 2000 }))} />
        <FilterChip label="$20-100" active={filters.min_price_cents === 2000 && filters.max_price_cents === 10000} onPress={() => setFilters((f) => ({ ...f, min_price_cents: 2000, max_price_cents: 10000 }))} />
        <FilterChip label="$100+" active={filters.min_price_cents === 10000 && !filters.max_price_cents} onPress={() => setFilters((f) => ({ ...f, min_price_cents: 10000, max_price_cents: undefined }))} />
      </ScrollView>

      {isLoading && q.length > 1 ? (
        <LoadingScreen message="Searching…" />
      ) : !data && q.length <= 1 ? (
        <EmptyState
          icon="🔎"
          title="Search for cards"
          message="Type a player name, set name, or parallel."
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          numColumns={2}
          columnWrapperStyle={{ gap: Spacing.sm, paddingHorizontal: Spacing.sm }}
          contentContainerStyle={{ gap: Spacing.sm, paddingBottom: 60, paddingTop: Spacing.sm }}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => navigation.navigate('ListingDetail', { id: item.id })}
            />
          )}
          ListEmptyComponent={<EmptyState icon="🤷" title="No matches" message="Try different keywords or fewer filters." />}
        />
      )}
    </SafeAreaView>
  );
};

const FilterChip = ({ label, active, onPress }) => (
  <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

// ============================================================
// LISTING DETAIL
// ============================================================
export const ListingDetailScreen = ({ navigation, route }) => {
  const { id } = route.params;
  const qc = useQueryClient();

  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.get(id),
  });

  const watchMut = useMutation({
    mutationFn: () => listing?.watching ? listingsApi.unwatch(id) : listingsApi.watch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['listing', id] }),
  });

  const addToCartMut = useMutation({
    mutationFn: () => cartApi.add(id),
    onSuccess: () => {
      Alert.alert('Added to cart', 'Tap the cart icon to check out.');
      qc.invalidateQueries({ queryKey: ['cart'] });
    },
    onError: (err) => Alert.alert('Add failed', err.response?.data?.error || err.message),
  });

  if (isLoading) return <LoadingScreen />;
  if (!listing) return <EmptyState icon="❌" title="Listing not found" />;

  const isOwner = listing.is_owner;
  const isActive = listing.status === 'active';
  const photos = Array.isArray(listing.photos) ? listing.photos : [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <ScrollView
          horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          style={{ height: 380 }}
        >
          {photos.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={{ width: 380, height: 380 }}
              resizeMode="cover"
            />
          ))}
          {photos.length === 0 && (
            <View style={[{ width: 380, height: 380 }, styles.cardPhotoEmpty]}>
              <Ionicons name="image-outline" size={48} color={Colors.textDim} />
            </View>
          )}
        </ScrollView>

        <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
          <Text style={styles.detailPrice}>{usd(listing.asking_price_cents)}</Text>
          <Text style={styles.detailTitle}>
            {listing.year ? `${listing.year} ` : ''}{listing.set_name}
            {listing.parallel ? ` · ${listing.parallel}` : ''}
          </Text>
          {listing.player_name && <Text style={styles.detailSubtitle}>{listing.player_name}{listing.card_number ? ` #${listing.card_number}` : ''}</Text>}

          <View style={styles.badgeRow}>
            {listing.verified_ownership && <Badge icon="shield-checkmark" color={Colors.accent2} text="Verified ownership" />}
            {listing.cert_verified && <Badge icon="ribbon" color={Colors.accent} text={`Verified ${listing.grading_company || 'cert'}`} />}
            {listing.stolen_check_passed && <Badge icon="checkmark-circle" color={Colors.accent2} text="Not stolen" />}
            {listing.condition && <Badge icon="information-circle" color={Colors.textMuted} text={listing.condition} />}
          </View>

          {listing.description && (
            <Text style={styles.detailDescription}>{listing.description}</Text>
          )}

          <View style={styles.sellerRow}>
            <Ionicons name="person-circle-outline" size={28} color={Colors.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.sellerName}>{listing.seller_username}</Text>
              {/* Review summary inline — '94% positive (23)' next to
                  the seller name. eBay-style trust signal that beats
                  a single trust_score float. */}
              {listing.seller_review_total > 0 ? (
                <Text style={styles.sellerTrust}>
                  {Math.round((listing.seller_review_positive / listing.seller_review_total) * 100)}% positive ({listing.seller_review_total})
                </Text>
              ) : listing.seller_trust_score ? (
                <Text style={styles.sellerTrust}>Trust score {Number(listing.seller_trust_score).toFixed(2)}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={() => watchMut.mutate()}
              accessibilityLabel={listing.watching ? 'Stop watching this listing' : 'Watch this listing'}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                backgroundColor: listing.watching ? Colors.accent3 + '22' : 'transparent',
                borderWidth: 1,
                borderColor: listing.watching ? Colors.accent3 + '66' : Colors.border,
              }}
            >
              <Ionicons
                name={listing.watching ? 'heart' : 'heart-outline'}
                size={14}
                color={listing.watching ? Colors.accent3 : Colors.textMuted}
              />
              <Text style={{
                color: listing.watching ? Colors.accent3 : Colors.textMuted,
                fontSize: 12,
                fontWeight: '700',
              }}>
                {listing.watching ? 'Watching' : 'Watch'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.shipLabel}>Ships via</Text>
          <View style={{ gap: 4 }}>
            {(listing.shipping_options || []).map((opt) => (
              <Text key={opt.tier} style={styles.shipRow}>
                {shipTierLabel(opt.tier)} — {usd(opt.price_cents)}
              </Text>
            ))}
          </View>
        </View>
      </ScrollView>

      {!isOwner && isActive && (
        <View style={styles.ctaBar}>
          {listing.accepts_offers && (
            <Button
              title="Offer"
              variant="ghost"
              onPress={() => navigation.navigate('MakeListingOffer', { listing_id: id })}
              style={{ flex: 1 }}
            />
          )}
          <Button
            title="Add to cart"
            variant="ghost"
            onPress={() => addToCartMut.mutate()}
            disabled={addToCartMut.isPending}
            style={{ flex: 1 }}
          />
          <Button
            title={`Buy ${usd(listing.asking_price_cents)}`}
            onPress={() => navigation.navigate('Checkout', { listing_id: id })}
            style={{ flex: 1.4 }}
          />
        </View>
      )}
      {isOwner && isActive && (
        <View style={styles.ctaBar}>
          <Button
            title="Cancel listing"
            variant="ghost"
            onPress={() => Alert.alert(
              'Cancel listing?',
              'This removes the listing from the marketplace.',
              [
                { text: 'Keep', style: 'cancel' },
                { text: 'Cancel listing', style: 'destructive', onPress: async () => {
                  try { await listingsApi.cancel(id); navigation.goBack(); }
                  catch (e) { Alert.alert('Failed', e.message); }
                }},
              ],
            )}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

function shipTierLabel(t) {
  return ({ pwe: 'Plain envelope (no tracking)', bmwt: 'Bubble mailer + tracking', signature: 'Signature required' })[t] || t;
}

const Badge = ({ icon, color, text }) => (
  <View style={[styles.badge, { borderColor: color }]}>
    <Ionicons name={icon} size={12} color={color} />
    <Text style={[styles.badgeText, { color }]}>{text}</Text>
  </View>
);

// ============================================================
// SAVED SEARCHES
// ============================================================
export const SavedSearchesScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['saved-searches'],
    queryFn: () => marketplaceApi.listSavedSearches(),
  });
  const deleteMut = useMutation({
    mutationFn: (id) => marketplaceApi.deleteSavedSearch(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-searches'] }),
  });

  const searches = data?.searches || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Saved searches" />
      {isLoading ? (
        <LoadingScreen />
      ) : !searches.length ? (
        <EmptyState
          icon="🔔"
          title="No saved searches"
          message="From any search, tap the bell icon to save it. We'll push you when matches list."
        />
      ) : (
        <FlatList
          data={searches}
          keyExtractor={(s) => s.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          renderItem={({ item }) => (
            <View style={styles.savedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.savedName}>{item.name || formatQuery(item)}</Text>
                <Text style={styles.savedSub}>
                  {item.match_count} match{item.match_count === 1 ? '' : 'es'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Remove saved search?',
                  '',
                  [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => deleteMut.mutate(item.id) }],
                )}
                accessibilityLabel="Remove this saved search"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                  backgroundColor: 'transparent',
                  borderWidth: 1, borderColor: Colors.accent3 + '66',
                }}
              >
                <Ionicons name="trash-outline" size={12} color={Colors.accent3} />
                <Text style={{ color: Colors.accent3, fontSize: 12, fontWeight: '700' }}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

function formatQuery(s) {
  const parts = [];
  if (s.q) parts.push(`"${s.q}"`);
  if (s.sport) parts.push(s.sport);
  if (s.year) parts.push(s.year);
  if (s.manufacturer) parts.push(s.manufacturer);
  if (s.parallel) parts.push(s.parallel);
  if (s.player_name) parts.push(s.player_name);
  return parts.join(' · ') || 'Saved search';
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: Colors.text },

  tabs: {
    flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderBottomWidth: 1, borderBottomColor: Colors.border, gap: Spacing.sm,
  },
  tab: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.surface },
  tabActive: { backgroundColor: Colors.accent },
  tabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  tabTextActive: { color: Colors.bg, fontWeight: '700' },

  cardTile: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md, overflow: 'hidden',
  },
  cardPhoto: { width: '100%', aspectRatio: 1, backgroundColor: Colors.surface2 },
  cardPhotoEmpty: { justifyContent: 'center', alignItems: 'center' },
  cardPrice: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  cardTitle: { color: Colors.textMuted, fontSize: 12 },
  cardSubtext: { color: Colors.textDim, fontSize: 11 },
  cardWatchers: { color: Colors.textMuted, fontSize: 10 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: Radius.md,
    margin: Spacing.md,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 16 },

  filterScroll: { maxHeight: 44, marginBottom: Spacing.xs },
  chip: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textMuted, fontSize: 12 },
  chipTextActive: { color: Colors.bg, fontWeight: '600' },

  detailPrice: { fontSize: 30, fontWeight: '700', color: Colors.text },
  detailTitle: { fontSize: 18, color: Colors.text },
  detailSubtitle: { fontSize: 14, color: Colors.textMuted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.xs },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1,
  },
  badgeText: { fontSize: 11 },
  detailDescription: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: Spacing.sm },
  sellerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.sm, backgroundColor: Colors.surface, borderRadius: Radius.md,
    marginTop: Spacing.sm,
  },
  sellerName: { color: Colors.text, fontWeight: '600' },
  sellerTrust: { color: Colors.textMuted, fontSize: 11 },
  shipLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1, marginTop: Spacing.md },
  shipRow: { color: Colors.text, fontSize: 13 },

  ctaBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: Spacing.sm,
    padding: Spacing.md, backgroundColor: Colors.surface,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },

  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
  },
  savedName: { color: Colors.text, fontWeight: '600' },
  savedSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
});
