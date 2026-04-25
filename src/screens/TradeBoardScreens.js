import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Modal, Alert, Image,
  TextInput, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  tradeListingsApi, tradeGroupsApi, tradeOffersApi,
  cardsApi, offersApi, pricingApi, safetyApi,
} from '../services/api';
import { getDeviceLocation, getZipFromCoords } from '../services/deviceLocation';
import { Linking } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { analytics, Events } from '../services/analytics';

const SAFETY_CHECKLIST_SEEN_KEY = 'seen_first_trade_safety_checklist';
import { useAuthStore } from '../store/authStore';
import {
  Button, Input, EmptyState, LoadingScreen,
  ScreenHeader, SectionHeader, Divider, CardTile,
  VerificationBadge,
} from '../components/ui';
import { FairnessPanel } from '../components/FairnessPanel';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

const { width } = Dimensions.get('window');

// ============================================================
// HELPERS
// ============================================================

const formatCardTitle = (listing) => {
  const parts = [];
  if (listing.year) parts.push(listing.year);
  if (listing.set_name) parts.push(listing.set_name);
  if (listing.player_name) parts.push(listing.player_name);
  return parts.join(' · ') || 'Card';
};

const shippingIcon = (pref) => ({
  in_person: { icon: 'people-outline', label: 'In person only' },
  will_ship: { icon: 'cube-outline', label: 'Will ship' },
  either: { icon: 'swap-horizontal-outline', label: 'In person or ship' },
}[pref] || { icon: 'help-outline', label: 'Unknown' });

// Advisory verification badge. Shown on listing cards + detail.
// `verified` = AI confirmed, `unverified` = could not confirm (default),
// `failed` = AI flagged mismatch, `pending` = waiting on AI check.
export const VerifiedBadge = ({ status, size = 'sm' }) => {
  if (!status) return null;
  const config = {
    verified:   { icon: 'checkmark-circle', color: Colors.success, label: 'Verified' },
    unverified: { icon: 'help-circle',      color: Colors.warning, label: 'Unverified' },
    failed:     { icon: 'alert-circle',     color: Colors.error,   label: 'Flagged' },
    pending:    { icon: 'time',             color: Colors.textMuted, label: 'Checking…' },
  }[status];
  if (!config) return null;
  const fontSize = size === 'lg' ? Typography.sm : Typography.xs;
  const iconSize = size === 'lg' ? 16 : 12;
  return (
    <View style={[verifiedBadgeStyles.badge, { borderColor: config.color }]}>
      <Ionicons name={config.icon} size={iconSize} color={config.color} />
      <Text style={[verifiedBadgeStyles.text, { color: config.color, fontSize }]}>
        {config.label}
      </Text>
    </View>
  );
};

const verifiedBadgeStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontWeight: Typography.semibold,
    letterSpacing: 0.3,
  },
});

// ============================================================
// FEED SCREEN (main Trade Board landing)
// ============================================================
export const TradeBoardScreen = ({ navigation, route }) => {
  // Allow callers (e.g. TradeGroupDetailScreen's "view this group's
  // listings" button) to seed the board with a pre-selected scope.
  const initialScope = route?.params?.scope || 'all';
  const initialGroupId = route?.params?.groupId || null;
  const [scope, setScope] = useState(initialScope);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nearbyLocation, setNearbyLocation] = useState(null); // { latitude, longitude }
  const [distanceMiles, setDistanceMiles] = useState(50);

  // Debounce search input so we don't fire a new request on every
  // keystroke. Queryfn still runs eventually, but the TextInput
  // keeps focus because we're not changing the queryKey mid-typing.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: groupsData } = useQuery({
    queryKey: ['my-trade-groups'],
    queryFn: () => tradeGroupsApi.mine().then((r) => r.data),
  });
  const myGroups = groupsData?.groups || [];

  const queryParams = useMemo(() => {
    const p = { limit: 50 };
    if (scope === 'global') p.scope = 'global';
    if (scope === 'group' && groupId) { p.scope = 'group'; p.group_id = groupId; }
    if (scope === 'nearby' && nearbyLocation) {
      p.scope = 'nearby';
      p.lat = nearbyLocation.latitude;
      p.lng = nearbyLocation.longitude;
      p.distance_miles = distanceMiles;
    }
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [scope, groupId, debouncedSearch, nearbyLocation, distanceMiles]);

  const enableNearby = async () => {
    const loc = await getDeviceLocation();
    if (!loc) {
      Alert.alert(
        'Location needed',
        'Nearby requires location permission. Enable it in your device settings and try again.',
      );
      return;
    }
    setNearbyLocation(loc);
    setScope('nearby');
    setGroupId(null);
  };

  // The public feed deliberately hides the viewer's own listings
  // (you don't need to "discover" your own card). The "Mine" tab
  // hits a separate /mine endpoint so users can verify their
  // lets_talk cards are actually on the board.
  const isMine = scope === 'mine';
  const {
    data, isLoading, refetch, isFetching, isError, error,
  } = useQuery({
    queryKey: isMine ? ['trade-listings', 'mine'] : ['trade-listings', 'feed', queryParams],
    queryFn: () => (isMine
      ? tradeListingsApi.mine().then((r) => r.data)
      : tradeListingsApi.feed(queryParams).then((r) => r.data)
    ),
    // Graceful degradation: one fast retry, don't blow up if the
    // API is rate-limited or mid-deploy — we show a retry tile
    // instead of an empty feed indistinguishable from "no results".
    // placeholderData=keepPreviousData keeps the old results visible
    // while a new query (e.g. search typing) is in flight — critical
    // so we don't remount the SafeAreaView and drop keyboard focus.
    retry: 1,
    placeholderData: keepPreviousData,
  });

  const listings = data?.listings || [];

  // Only show the full-screen loader on the very first load (no data
  // yet). After that we keep the tree mounted so the TextInput keeps
  // focus while search queries fire in the background.
  if (isLoading && !data) return <LoadingScreen message="Loading the trade board..." />;

  const renderListing = ({ item }) => (
    <TouchableOpacity
      style={styles.listingCard}
      onPress={() => navigation.navigate('TradeListingDetail', { listingId: item.id })}
      activeOpacity={0.85}
    >
      <View style={styles.listingPhotoWrap}>
        {item.photo_front_url ? (
          <Image source={{ uri: item.photo_front_url }} style={styles.listingPhoto} resizeMode="cover" />
        ) : Array.isArray(item.photos) && item.photos[0] ? (
          <Image source={{ uri: item.photos[0] }} style={styles.listingPhoto} resizeMode="cover" />
        ) : (
          <View style={[styles.listingPhoto, styles.listingPhotoEmpty]}>
            <Ionicons name="image-outline" size={28} color={Colors.textDim} />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text numberOfLines={1} style={[styles.listingTitle, { flex: 1 }]}>{formatCardTitle(item)}</Text>
          <VerifiedBadge status={item.verification_status} />
        </View>
        {/* Cert-claim verification badge — only shows when the
            underlying card is graded. Separate signal from the
            listing photo verification above. */}
        {item.cert_verification_status ? (
          <View style={{ marginTop: 4 }}>
            <VerificationBadge status={item.cert_verification_status} size="sm" />
          </View>
        ) : null}
        {/* Trust nudge — drives buyers to ask for in-hand proof
            before committing to an unverified or disputed claim. */}
        {item.cert_verification_status === 'claimed_unverified' ? (
          <Text style={{ color: Colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: 3 }}>
            Not photo-verified — ask to see it in hand.
          </Text>
        ) : null}
        {item.cert_verification_status === 'disputed' ? (
          <Text style={{ color: Colors.error, fontSize: 11, fontWeight: '600', marginTop: 3 }}>
            Counter-claim open — hold off until resolved.
          </Text>
        ) : null}
        {item.parallel ? (
          <Text numberOfLines={1} style={styles.listingParallel}>{item.parallel}</Text>
        ) : null}

        <View style={styles.listingMetaRow}>
          <View style={styles.listingChip}>
            <Ionicons name={shippingIcon(item.shipping_pref).icon} size={12} color={Colors.textMuted} />
            <Text style={styles.listingChipText}>{shippingIcon(item.shipping_pref).label}</Text>
          </View>
          {item.location_zip ? (
            <View style={styles.listingChip}>
              <Ionicons name="location-outline" size={12} color={Colors.textMuted} />
              <Text style={styles.listingChipText}>{item.location_zip}</Text>
            </View>
          ) : null}
        </View>

        {item.looking_for_text ? (
          <Text numberOfLines={2} style={styles.listingLookingFor}>
            <Text style={styles.listingLookingForLabel}>Looking for: </Text>
            {item.looking_for_text}
          </Text>
        ) : null}

        <View style={styles.listingOwnerRow}>
          {item.owner_avatar_url ? (
            <Image source={{ uri: item.owner_avatar_url }} style={styles.listingOwnerAvatar} />
          ) : (
            <View style={[styles.listingOwnerAvatar, { backgroundColor: Colors.surface3 }]} />
          )}
          <Text style={styles.listingOwnerName} numberOfLines={1}>
            {item.owner_display_name || 'Trader'}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Trade Board"
        subtitle="List cards. Find trades. Meet up off-platform."
        right={
          <View style={{ flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('TradeOffersList')}
              style={styles.headerIconButton}
              accessibilityLabel="My trade offers"
            >
              <Ionicons name="mail-outline" size={18} color={Colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateTradeListing')}
              style={styles.newListingButton}
              accessibilityLabel="New listing"
            >
              <Ionicons name="add" size={18} color={Colors.bg} />
            </TouchableOpacity>
          </View>
        }
      />

      {/* Scope tabs — horizontal scroll so nothing gets cut off on
          narrow phones (5 tabs + "Groups (N)" easily overflows).
          flexGrow:0 prevents the ScrollView from eating the feed's
          vertical space. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.scopeTabs}
      >
        <ScopeTab label="All" active={scope === 'all'} onPress={() => { setScope('all'); setGroupId(null); }} />
        <ScopeTab label="Global" active={scope === 'global'} onPress={() => { setScope('global'); setGroupId(null); }} />
        <ScopeTab label="Nearby" active={scope === 'nearby'} onPress={enableNearby} />
        <ScopeTab label="Mine" active={scope === 'mine'} onPress={() => { setScope('mine'); setGroupId(null); }} />
        <ScopeTab
          label={`Groups${myGroups.length ? ` (${myGroups.length})` : ''}`}
          active={scope === 'group'}
          onPress={() => navigation.navigate('TradeGroupsList')}
        />
      </ScrollView>

      {/* Nearby filter bar */}
      {scope === 'nearby' && nearbyLocation ? (
        <View style={styles.groupFilterBar}>
          <Text style={styles.groupFilterText}>
            Within {distanceMiles} mi of your location
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
            {[25, 50, 100, 250].map((m) => (
              <TouchableOpacity key={m} onPress={() => setDistanceMiles(m)}>
                <Text
                  style={{
                    color: distanceMiles === m ? Colors.accent : Colors.textMuted,
                    fontSize: Typography.xs,
                    fontWeight: Typography.semibold,
                  }}
                >
                  {m}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {scope === 'group' && groupId ? (
        <View style={styles.groupFilterBar}>
          <Text style={styles.groupFilterText}>
            Viewing: {myGroups.find((g) => g.id === groupId)?.name}
          </Text>
          <TouchableOpacity onPress={() => { setScope('all'); setGroupId(null); }}>
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search cards or what people want..."
          placeholderTextColor={Colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        renderItem={renderListing}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 80 }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          isError ? (
            <EmptyState
              icon="⚠️"
              title="Couldn't load the trade board"
              message={
                // Surface the server's error string when there is one
                // (4xx with a body), then status code for 5xx, finally
                // fall back to a connection hint for true network errors.
                error?.response?.data?.error
                  || (error?.response?.status
                    ? `API returned ${error.response.status}. Try again in a moment.`
                    : "The API didn't respond. Check your connection and retry.")
              }
              action={<Button title="Retry" onPress={() => refetch()} />}
            />
          ) : (
            <EmptyState
              icon="🔍"
              title="No listings yet"
              message={
                scope === 'group'
                  ? 'No one in this group has posted a card yet.'
                  : 'Be the first to list a card for trade.'
              }
              action={
                <Button
                  title="List a card"
                  onPress={() => navigation.navigate('CreateTradeListing')}
                />
              }
            />
          )
        }
      />
    </SafeAreaView>
  );
};

const ScopeTab = ({ label, active, onPress }) => (
  <TouchableOpacity style={[styles.scopeTab, active && styles.scopeTabActive]} onPress={onPress}>
    <Text style={[styles.scopeTabText, active && styles.scopeTabTextActive]}>{label}</Text>
  </TouchableOpacity>
);

// ============================================================
// LISTING DETAIL SCREEN
// ============================================================
export const TradeListingDetailScreen = ({ navigation, route }) => {
  const { listingId } = route.params;
  const qc = useQueryClient();

  const { data: listing, isLoading, refetch } = useQuery({
    queryKey: ['trade-listing', listingId],
    queryFn: () => tradeListingsApi.get(listingId).then((r) => r.data),
  });

  const { data: offersData } = useQuery({
    queryKey: ['trade-listing-offers', listingId],
    queryFn: () => offersApi.mine({
      target_type: 'trade_listing',
      trade_listing_id: listingId,
      direction: 'received',
    }).then((r) => r.data),
    enabled: !!listing?.is_owner,
  });

  const bumpMutation = useMutation({
    mutationFn: () => tradeListingsApi.bump(listingId),
    onSuccess: () => {
      Alert.alert('Bumped', 'Your listing is freshly dated. The 90-day auto-removal clock just reset.');
      qc.invalidateQueries({ queryKey: ['trade-listing', listingId] });
    },
    onError: (err) => {
      Alert.alert(
        'Could not bump',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => tradeListingsApi.remove(listingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trade-listings'] });
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert(
        'Could not remove listing',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  if (isLoading || !listing) return <LoadingScreen message="Loading listing..." />;

  const isOwner = listing.is_owner;
  const shipping = shippingIcon(listing.shipping_pref);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Trade Listing"
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        {/* Photos — front + back from verification flow, fallback to owned_card photos */}
        {(listing.photo_front_url || listing.photo_back_url) ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
            {listing.photo_front_url ? (
              <Image source={{ uri: listing.photo_front_url }} style={styles.detailPhoto} resizeMode="contain" />
            ) : null}
            {listing.photo_back_url ? (
              <Image source={{ uri: listing.photo_back_url }} style={styles.detailPhoto} resizeMode="contain" />
            ) : null}
          </ScrollView>
        ) : Array.isArray(listing.photos) && listing.photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.base }}>
            {listing.photos.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.detailPhoto} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={[styles.detailPhoto, styles.listingPhotoEmpty, { marginBottom: Spacing.base }]}>
            <Ionicons name="image-outline" size={48} color={Colors.textDim} />
          </View>
        )}

        {/* Verification badge + any AI-detected condition notes */}
        <View style={{ marginBottom: Spacing.sm }}>
          <VerifiedBadge status={listing.verification_status} size="lg" />
          {listing.verification_notes ? (
            <Text style={styles.verificationNotes}>{listing.verification_notes}</Text>
          ) : null}
        </View>

        {/* Card title */}
        <Text style={styles.detailTitle}>{formatCardTitle(listing)}</Text>
        {listing.parallel ? <Text style={styles.detailParallel}>{listing.parallel}</Text> : null}
        {listing.card_number ? (
          <Text style={styles.detailMeta}>#{listing.card_number}</Text>
        ) : null}

        <Divider style={{ marginVertical: Spacing.base }} />

        {/* Owner identity (minimal — no link to profile per design decision) */}
        <View style={styles.detailOwnerRow}>
          {listing.owner_avatar_url ? (
            <Image source={{ uri: listing.owner_avatar_url }} style={styles.detailOwnerAvatar} />
          ) : (
            <View style={[styles.detailOwnerAvatar, { backgroundColor: Colors.surface3 }]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.detailOwnerName}>{listing.owner_display_name}</Text>
            {listing.location_zip ? (
              <Text style={styles.detailOwnerMeta}>{listing.location_zip}</Text>
            ) : null}
          </View>
        </View>

        {/* Listing meta */}
        <View style={[styles.detailChipRow, { marginTop: Spacing.base }]}>
          <View style={styles.detailChip}>
            <Ionicons name={shipping.icon} size={14} color={Colors.accent} />
            <Text style={styles.detailChipText}>{shipping.label}</Text>
          </View>
          {listing.accepts_bundles ? (
            <View style={styles.detailChip}>
              <Ionicons name="layers-outline" size={14} color={Colors.accent2} />
              <Text style={styles.detailChipText}>Accepts bundles</Text>
            </View>
          ) : null}
        </View>

        {/* Looking for */}
        {listing.looking_for_text ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionLabel}>Looking for</Text>
            <Text style={styles.detailBody}>{listing.looking_for_text}</Text>
          </View>
        ) : null}

        {/* Recent sold comps from eBay */}
        {listing.catalog_id ? <EbayCompsSection catalogId={listing.catalog_id} /> : null}

        {/* Non-owner actions: report stolen */}
        {!isOwner ? (
          <TouchableOpacity
            onPress={() => navigation.navigate('ReportStolen', {
              tradeListingId: listingId,
              cardName: formatCardTitle(listing),
            })}
            style={{ marginTop: Spacing.md, alignSelf: 'center', padding: Spacing.sm }}
          >
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs }}>
              🚩 Report stolen card
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Offer button or owner actions */}
        {!isOwner ? (
          <Button
            title="Make a trade offer"
            onPress={() => navigation.navigate('MakeTradeOffer', { listingId })}
            style={{ marginTop: Spacing.lg }}
          />
        ) : (
          <>
            <SectionHeader title={`Incoming offers (${offersData?.total ?? 0})`} />
            {(offersData?.offers || []).map((offer) => (
              <TouchableOpacity
                key={offer.id}
                style={styles.offerRow}
                onPress={() => navigation.navigate('TradeOfferDetail', { offerId: offer.id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.offerRowName}>{offer.other_party_name}</Text>
                  <Text style={styles.offerRowStatus}>
                    {offer.status === 'pending' ? 'Pending your response' : offer.status}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ))}
            {!offersData?.offers?.length && (
              <Text style={styles.offerRowEmpty}>No offers yet.</Text>
            )}

            <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
              <Button
                title="Bump listing"
                variant="secondary"
                onPress={() => bumpMutation.mutate()}
                loading={bumpMutation.isPending}
                style={{ flex: 1 }}
              />
              <Button
                title="Remove"
                variant="danger"
                onPress={() => Alert.alert(
                  'Remove listing?',
                  'This takes it off the board. You can list the card again later.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate() },
                  ],
                )}
                style={{ flex: 1 }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// EBAY SOLD COMPS — shown on listing detail
// ============================================================
const EbayCompsSection = ({ catalogId }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ebay-comps', catalogId],
    queryFn: () => pricingApi.ebay(catalogId).then((r) => r.data),
    staleTime: 60 * 60 * 1000, // 1 hour client-side, 24h server-side
  });

  if (isLoading) {
    return (
      <View style={styles.detailSection}>
        <Text style={styles.detailSectionLabel}>Recent sold comps (eBay)</Text>
        <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.sm }} />
      </View>
    );
  }

  if (isError || !data?.ok) {
    return null; // advisory only — silently hide if pricing unavailable
  }

  const comps = data.comps || [];
  if (!comps.length) {
    return (
      <View style={styles.detailSection}>
        <Text style={styles.detailSectionLabel}>Recent sold comps (eBay)</Text>
        <Text style={styles.detailBody}>No recent sales found for this card.</Text>
      </View>
    );
  }

  return (
    <View style={styles.detailSection}>
      <Text style={styles.detailSectionLabel}>Recent sold comps (eBay)</Text>
      {data.summary ? (
        <View style={styles.compsSummary}>
          <CompStat label="Median" value={`$${(data.summary.median ?? 0).toFixed(2)}`} />
          <CompStat label="Avg" value={`$${(data.summary.average ?? 0).toFixed(2)}`} />
          <CompStat
            label="Range"
            value={`$${(data.summary.min ?? 0).toFixed(0)}–$${(data.summary.max ?? 0).toFixed(0)}`}
          />
        </View>
      ) : null}
      <View style={{ marginTop: Spacing.sm }}>
        {comps.slice(0, 6).map((c, i) => (
          <TouchableOpacity
            key={i}
            style={styles.compRow}
            onPress={() => c.url && Linking.openURL(c.url)}
          >
            <Text style={styles.compPrice}>${c.price_usd?.toFixed(2)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.compTitle} numberOfLines={1}>{c.title}</Text>
              <Text style={styles.compMeta}>
                {c.sold_at ? new Date(c.sold_at).toLocaleDateString() : ''}
                {c.condition ? ` · ${c.condition}` : ''}
              </Text>
            </View>
            <Ionicons name="open-outline" size={14} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.compsFooter}>
        Data from eBay completed listings. Tap a row to view on eBay.
        Card Shop may earn a commission from eBay purchases made through these links.
      </Text>
    </View>
  );
};

const CompStat = ({ label, value }) => (
  <View style={styles.compStat}>
    <Text style={styles.compStatLabel}>{label}</Text>
    <Text style={styles.compStatValue}>{value}</Text>
  </View>
);

// ============================================================
// CREATE LISTING — multi-step flow
// ============================================================
export const CreateTradeListingScreen = ({ navigation, route }) => {
  const preselectedCardId = route.params?.ownedCardId;
  const qc = useQueryClient();

  const [step, setStep] = useState(preselectedCardId ? 2 : 1);
  const [ownedCardId, setOwnedCardId] = useState(preselectedCardId || null);
  const [visibility, setVisibility] = useState([]); // array of { scope_type, group_id }
  const [shippingPref, setShippingPref] = useState('either');
  const [acceptsBundles, setAcceptsBundles] = useState(false);
  const [lookingFor, setLookingFor] = useState('');
  const [timeLimitHours, setTimeLimitHours] = useState(null);
  const [photos, setPhotos] = useState({ front: null, back: null, video: null }); // data URLs

  const { data: groupsData } = useQuery({
    queryKey: ['my-trade-groups'],
    queryFn: () => tradeGroupsApi.mine().then((r) => r.data),
  });
  const myGroups = groupsData?.groups || [];

  // After creating the listing, fire-and-forget the AI verification so
  // the badge populates. User doesn't wait on the result.
  const runVerification = async (listingId) => {
    try {
      await tradeListingsApi.verify?.(listingId, {
        photo_front_base64: photos.front,
        photo_back_base64: photos.back,
      });
      qc.invalidateQueries({ queryKey: ['trade-listing', listingId] });
      qc.invalidateQueries({ queryKey: ['trade-listings'] });
    } catch {
      // Verification is advisory — silent failure is fine.
    }
  };

  const createMutation = useMutation({
    mutationFn: (payload) => tradeListingsApi.create(payload),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['trade-listings'] });
      const newId = r?.data?.id;
      analytics.track(Events.LISTING_CREATED, {
        has_video: !!photos.video,
        has_photos: !!(photos.front && photos.back),
        visibility_scopes: visibility.map((v) => v.scope_type),
      });
      if (newId && (photos.front || photos.back)) {
        runVerification(newId);
      }
      Alert.alert('Listed!', 'Your card is on the trade board. Verification runs in the background.');
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert('Could not create listing', err?.response?.data?.error || 'Please try again.');
    },
  });

  const canSubmit = ownedCardId && visibility.length > 0 && photos.front && photos.back;

  const submit = async () => {
    // Snapshot device location for distance filtering. Silent best-effort —
    // if permission is denied, we just submit without lat/lng.
    const loc = await getDeviceLocation();
    const zip = loc ? await getZipFromCoords(loc.latitude, loc.longitude) : null;

    createMutation.mutate({
      owned_card_id: ownedCardId,
      visibility,
      shipping_pref: shippingPref,
      accepts_bundles: acceptsBundles,
      looking_for_text: lookingFor.trim() || null,
      offer_time_limit_hours: timeLimitHours,
      photo_front_url: photos.front,
      photo_back_url: photos.back,
      video_url: photos.video || null,
      location_lat: loc?.latitude || null,
      location_lng: loc?.longitude || null,
      location_zip: zip || null,
    });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="List a Card"
        subtitle="Step-by-step trade board listing"
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        {/* Step 1: pick card */}
        <StepBlock n={1} title="Pick a card from your collection" done={!!ownedCardId}>
          {ownedCardId ? (
            <TouchableOpacity
              style={styles.pickedCardRow}
              onPress={() => setOwnedCardId(null)}
            >
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.pickedCardText}>Card selected</Text>
              <Text style={styles.pickedCardChange}>Change</Text>
            </TouchableOpacity>
          ) : (
            <Button
              title="Choose card"
              variant="secondary"
              onPress={() => navigation.navigate('TradeCardPicker', {
                onPick: (id) => { setOwnedCardId(id); setStep(2); },
              })}
            />
          )}
        </StepBlock>

        {/* Step 2: visibility (REQUIRED) */}
        <StepBlock n={2} title="Who sees this listing?" subtitle="Required. You pick every time." done={visibility.length > 0}>
          <VisibilityPicker
            visibility={visibility}
            setVisibility={setVisibility}
            groups={myGroups}
          />
        </StepBlock>

        {/* Step 3: shipping preference */}
        <StepBlock n={3} title="Shipping preference" done>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
            <ChoiceChip label="In person only" active={shippingPref === 'in_person'} onPress={() => setShippingPref('in_person')} />
            <ChoiceChip label="Will ship" active={shippingPref === 'will_ship'} onPress={() => setShippingPref('will_ship')} />
            <ChoiceChip label="Either" active={shippingPref === 'either'} onPress={() => setShippingPref('either')} />
          </View>
        </StepBlock>

        {/* Step 4: bundles */}
        <StepBlock n={4} title="Accept bundle offers?" subtitle="Let people bundle multiple cards into one offer.">
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <ChoiceChip label="Yes" active={acceptsBundles} onPress={() => setAcceptsBundles(true)} />
            <ChoiceChip label="No" active={!acceptsBundles} onPress={() => setAcceptsBundles(false)} />
          </View>
        </StepBlock>

        {/* Step 5: looking for */}
        <StepBlock n={5} title="What are you looking for?" subtitle="Optional. Free-text hint for offerers.">
          <Input
            value={lookingFor}
            onChangeText={setLookingFor}
            placeholder="e.g. Any rookie cards, vintage holos, anything Packers..."
            multiline
            numberOfLines={3}
          />
        </StepBlock>

        {/* Step 6: time limit */}
        <StepBlock n={6} title="Offer deadline" subtitle="Optional. Leave open-ended or pick a limit.">
          <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
            <ChoiceChip label="24 hours" active={timeLimitHours === 24} onPress={() => setTimeLimitHours(24)} />
            <ChoiceChip label="48 hours" active={timeLimitHours === 48} onPress={() => setTimeLimitHours(48)} />
            <ChoiceChip label="7 days" active={timeLimitHours === 168} onPress={() => setTimeLimitHours(168)} />
            <ChoiceChip label="Open-ended" active={timeLimitHours === null} onPress={() => setTimeLimitHours(null)} />
          </View>
        </StepBlock>

        {/* Step 7: photos (required — front + back, AI-verified advisory) */}
        <StepBlock
          n={7}
          title="Capture front + back"
          subtitle="Required. In-app camera ensures fresh photos; AI flags obvious mismatches."
          done={!!(photos.front && photos.back)}
        >
          <View style={styles.photoPair}>
            <TouchableOpacity
              style={[styles.photoThumb, !photos.front && styles.photoThumbEmpty]}
              onPress={() => navigation.navigate('TradeCameraCapture', {
                onComplete: (p) => setPhotos({ front: p.front, back: p.back, video: p.video || null }),
              })}
              activeOpacity={0.85}
            >
              {photos.front ? (
                <Image source={{ uri: photos.front }} style={{ flex: 1, borderRadius: Radius.md }} resizeMode="cover" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />
                  <Text style={styles.photoThumbLabel}>Front</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.photoThumb, !photos.back && styles.photoThumbEmpty]}
              onPress={() => navigation.navigate('TradeCameraCapture', {
                onComplete: (p) => setPhotos({ front: p.front, back: p.back, video: p.video || null }),
              })}
              activeOpacity={0.85}
            >
              {photos.back ? (
                <Image source={{ uri: photos.back }} style={{ flex: 1, borderRadius: Radius.md }} resizeMode="cover" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color={Colors.textMuted} />
                  <Text style={styles.photoThumbLabel}>Back</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {photos.front && photos.back ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('TradeCameraCapture', {
                onComplete: (p) => setPhotos({ front: p.front, back: p.back, video: p.video || null }),
              })}
              style={{ alignSelf: 'flex-start', marginTop: Spacing.sm }}
            >
              <Text style={{ color: Colors.accent, fontWeight: Typography.semibold }}>
                Retake photos
              </Text>
            </TouchableOpacity>
          ) : null}
        </StepBlock>

        <Button
          title="Post listing"
          onPress={submit}
          disabled={!canSubmit}
          loading={createMutation.isPending}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// CARD PICKER (reuses cardsApi.mine())
// ============================================================
export const TradeCardPickerScreen = ({ navigation, route }) => {
  const onPick = route.params?.onPick;

  const { data, isLoading } = useQuery({
    queryKey: ['my-cards-for-trade'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  const cards = (data?.cards || []).filter((c) => c.status !== 'nft' && c.status !== 'pending_transfer');

  if (isLoading) return <LoadingScreen message="Loading your cards..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Pick a card"
        subtitle={`${cards.length} eligible cards`}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <FlatList
        data={cards}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: Spacing.base }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.pickRow}
            onPress={() => { onPick?.(item.id); navigation.goBack(); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.pickRowTitle} numberOfLines={1}>
                {item.player_name || 'Card'} {item.year ? `· ${item.year}` : ''}
              </Text>
              <Text style={styles.pickRowSub} numberOfLines={1}>
                {item.set_name || ''} {item.parallel ? `· ${item.parallel}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="🗂️"
            title="No eligible cards"
            message="Register a card first, or mark an existing one as not 'NFT' (not for trade)."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// MAKE TRADE OFFER
// ============================================================
export const MakeTradeOfferScreen = ({ navigation, route }) => {
  const { listingId, editOfferId } = route.params;
  const isEditing = !!editOfferId;
  const qc = useQueryClient();
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [message, setMessage] = useState('');
  const [cashAmount, setCashAmount] = useState('');

  // In edit mode, load the existing offer and pre-fill the form so
  // the user can swap cards / adjust cash instead of starting over.
  const { data: existingOffer } = useQuery({
    queryKey: ['offer-detail', editOfferId],
    queryFn: () => offersApi.get(editOfferId).then((r) => r.data),
    enabled: isEditing,
  });

  useEffect(() => {
    if (!existingOffer) return;
    const cardIds = Array.isArray(existingOffer.trade_card_ids)
      ? existingOffer.trade_card_ids : [];
    setSelectedCardIds(cardIds);
    if (existingOffer.offer_amount) setCashAmount(String(existingOffer.offer_amount));
  }, [existingOffer]);

  const { data: listing } = useQuery({
    queryKey: ['trade-listing', listingId],
    queryFn: () => tradeListingsApi.get(listingId).then((r) => r.data),
  });

  const { data: myCardsData, isLoading } = useQuery({
    queryKey: ['my-cards-for-offer'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  const eligibleCards = (myCardsData?.cards || []).filter(
    (c) => c.status !== 'nft' && c.status !== 'pending_transfer'
  );

  const createOffer = useMutation({
    mutationFn: () => {
      const cash = parseFloat(cashAmount);
      const cashVal = Number.isFinite(cash) && cash > 0 ? cash : undefined;
      if (isEditing) {
        return tradeOffersApi.edit(editOfferId, {
          trade_card_ids: selectedCardIds,
          offer_amount: cashVal ?? null,
          message: message.trim() || undefined,
        });
      }
      return tradeOffersApi.create({
        trade_listing_id: listingId,
        trade_card_ids: selectedCardIds,
        message: message.trim() || undefined,
        offer_amount: cashVal,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trade-listings'] });
      qc.invalidateQueries({ queryKey: ['trade-offers-mine'] });
      if (isEditing) qc.invalidateQueries({ queryKey: ['offer-detail', editOfferId] });
      analytics.track(isEditing ? Events.OFFER_UPDATED : Events.OFFER_SENT, {
        cards_offered: selectedCardIds.length,
        has_message: !!message.trim(),
      });
      Alert.alert(
        isEditing ? 'Offer updated' : 'Offer sent',
        isEditing
          ? 'The recipient has been notified that your terms changed.'
          : 'You will be notified if it is accepted, declined, or countered.'
      );
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert(
        isEditing ? 'Could not update offer' : 'Could not send offer',
        err?.response?.data?.error || 'Please try again.'
      );
    },
  });

  const toggleCard = (id) => {
    if (selectedCardIds.includes(id)) {
      setSelectedCardIds(selectedCardIds.filter((x) => x !== id));
    } else if (!listing?.accepts_bundles && selectedCardIds.length >= 1) {
      Alert.alert('One card only', 'This listing does not accept bundles — pick one card at a time.');
    } else {
      setSelectedCardIds([...selectedCardIds, id]);
    }
  };

  if (isLoading) return <LoadingScreen message="Loading your cards..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title={isEditing ? 'Edit offer' : 'Make offer'}
        subtitle={listing ? formatCardTitle(listing) : ''}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 120 }}>
        <SectionHeader title={`Select ${listing?.accepts_bundles ? 'cards' : 'a card'} to offer`} />

        {eligibleCards.map((card) => {
          const selected = selectedCardIds.includes(card.id);
          return (
            <TouchableOpacity
              key={card.id}
              style={[styles.offerCardRow, selected && styles.offerCardRowSelected]}
              onPress={() => toggleCard(card.id)}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? Colors.accent : Colors.textMuted}
              />
              <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                <Text style={styles.pickRowTitle} numberOfLines={1}>
                  {card.player_name || 'Card'} {card.year ? `· ${card.year}` : ''}
                </Text>
                <Text style={styles.pickRowSub} numberOfLines={1}>
                  {card.set_name || ''} {card.parallel ? `· ${card.parallel}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

        <SectionHeader title="Cash on top (optional)" />
        <Input
          value={cashAmount}
          onChangeText={setCashAmount}
          placeholder="e.g. 20"
          keyboardType="decimal-pad"
        />
        <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginTop: -Spacing.sm, marginBottom: Spacing.md, fontStyle: 'italic' }}>
          Off-platform IOU — cash, Venmo, Zelle at the meetup. Card Shop doesn't process payments.
        </Text>

        <SectionHeader title="Add a note (optional)" />
        <Input
          value={message}
          onChangeText={setMessage}
          placeholder="Anything else to share?"
          multiline
          numberOfLines={3}
        />

        <Button
          title={isEditing ? 'Save changes' : 'Send offer'}
          onPress={() => createOffer.mutate()}
          loading={createOffer.isPending}
          disabled={!selectedCardIds.length}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// TRADE OFFER DETAIL — with accept/decline/counter and thread
// ============================================================
export const TradeOfferDetailScreen = ({ navigation, route }) => {
  const { offerId } = route.params;
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterNote, setCounterNote] = useState('');
  const [valueGap, setValueGap] = useState('');

  const { data: offer, isLoading } = useQuery({
    queryKey: ['offer-detail', offerId],
    queryFn: () => offersApi.get(offerId).then((r) => r.data),
  });

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['offer-detail', offerId] });
    qc.invalidateQueries({ queryKey: ['trade-listing-offers'] });
    qc.invalidateQueries({ queryKey: ['trade-offers-mine'] });
  };

  const accept = useMutation({
    mutationFn: () => offersApi.accept(offerId),
    onSuccess: () => {
      analytics.track(Events.OFFER_ACCEPTED, { offer_id: offerId });
      refetchAll();
      Alert.alert('Accepted', 'Trade accepted. Arrange the meetup or shipping off-platform.');
    },
    onError: (err) => {
      Alert.alert(
        'Could not accept',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  // On first-ever Accept, show the safety checklist first. After user
  // acknowledges it, mark the flag set and run the actual accept.
  const handleAccept = async () => {
    try {
      const seen = await SecureStore.getItemAsync(SAFETY_CHECKLIST_SEEN_KEY);
      if (seen === 'true') {
        accept.mutate();
        return;
      }
    } catch {
      // SecureStore unavailable → proceed without gating, safety is best-effort
      accept.mutate();
      return;
    }
    navigation.navigate('FirstTradeSafetyScreen', {
      onAcknowledge: async () => {
        try {
          await SecureStore.setItemAsync(SAFETY_CHECKLIST_SEEN_KEY, 'true');
        } catch {}
        accept.mutate();
      },
    });
  };

  const decline = useMutation({
    mutationFn: () => offersApi.decline(offerId),
    onSuccess: () => {
      analytics.track(Events.OFFER_DECLINED, { offer_id: offerId });
      refetchAll();
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert(
        'Could not decline',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  // Confirm before declining — without this the button feels too easy
  // to mistap, and worse: if the mutation silently failed before the
  // onError above, users would tap repeatedly with no feedback.
  const confirmDecline = () => {
    Alert.alert(
      'Decline this offer?',
      'The other user will be notified. You can\'t undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Decline', style: 'destructive', onPress: () => decline.mutate() },
      ],
    );
  };

  const withdraw = useMutation({
    mutationFn: () => tradeOffersApi.withdraw(offerId),
    onSuccess: () => {
      refetchAll();
      navigation.goBack();
    },
    onError: (err) => {
      Alert.alert(
        'Could not withdraw',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  const counter = useMutation({
    mutationFn: () => offersApi.counter(offerId, {
      counter_note: counterNote.trim() || null,
      value_gap_usd: valueGap ? parseFloat(valueGap) : null,
    }),
    onSuccess: () => {
      analytics.track(Events.OFFER_COUNTERED, {
        offer_id: offerId,
        has_value_gap: !!valueGap,
      });
      setCounterOpen(false);
      setCounterNote('');
      setValueGap('');
      refetchAll();
    },
    onError: (err) => {
      Alert.alert(
        'Could not send counter',
        err?.response?.data?.error || err?.message || 'Try again in a moment.',
      );
    },
  });

  if (isLoading || !offer) return <LoadingScreen message="Loading offer..." />;

  const amIRecipient = offer.recipient_user_id === user?.id;
  const amISender = offer.sender_user_id === user?.id;
  const canRespond = ['pending', 'countered'].includes(offer.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Trade Offer"
        subtitle={offer.tl_card_name ? `On ${offer.tl_card_name}` : null}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        <View style={styles.statusBanner}>
          <Text style={styles.statusBannerText}>
            Status: <Text style={{ fontWeight: Typography.bold }}>{offer.status}</Text>
          </Text>
        </View>

        {/* Offered cards summary + optional cash boot */}
        <View style={styles.offerTerms}>
          <Text style={styles.offerTermsLabel}>Offer</Text>
          <Text style={styles.offerTermsLine}>
            {Array.isArray(offer.trade_card_ids) && offer.trade_card_ids.length
              ? `${offer.trade_card_ids.length} card${offer.trade_card_ids.length === 1 ? '' : 's'}`
              : 'No cards'}
            {offer.offer_amount && Number(offer.offer_amount) > 0
              ? ` + $${Number(offer.offer_amount).toFixed(2)} cash`
              : ''}
          </Text>
          {offer.offer_amount && Number(offer.offer_amount) > 0 ? (
            <Text style={styles.offerTermsSub}>
              Cash handled off-platform at the meetup (Venmo, Zelle, in person).
            </Text>
          ) : null}
        </View>

        {/* Trust card for the other party */}
        <View style={styles.trustCard}>
          <Text style={styles.trustCardLabel}>Other party</Text>
          <Text style={styles.trustCardName}>
            {amIRecipient ? offer.sender_name : offer.recipient_name}
          </Text>
        </View>

        {/* Thread */}
        <SectionHeader title="Thread" />
        {(offer.thread || []).map((t, i) => (
          <View key={i} style={styles.threadItem}>
            <Text style={styles.threadAuthor}>
              {t.user_id === user?.id ? 'You' : 'Them'}
            </Text>
            <Text style={styles.threadMessage}>{t.message}</Text>
            {t.counter ? (
              <View style={styles.threadCounter}>
                {t.counter.counter_note ? (
                  <Text style={styles.threadCounterText}>Note: {t.counter.counter_note}</Text>
                ) : null}
                {t.counter.value_gap_usd ? (
                  <Text style={styles.threadCounterText}>
                    Looking for ~${t.counter.value_gap_usd} more in value
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
        {!offer.thread?.length && <Text style={styles.threadEmpty}>No messages.</Text>}

        {/* Trade Fairness Scoring — rendered for any active party. Hides
            itself on 409/403. Rate-limited (429) shows a compact notice but
            still lets the user act. */}
        {canRespond && (amIRecipient || amISender) ? (
          <View style={{ marginTop: Spacing.base }}>
            <FairnessPanel
              offerId={offerId}
              onSeedCounterNote={(text) => {
                setCounterNote(text);
                setCounterOpen(true);
              }}
            />
          </View>
        ) : null}

        {/* Actions */}
        {canRespond && amIRecipient ? (
          <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
            <Button title="Accept" onPress={handleAccept} loading={accept.isPending} />
            <Button
              title="Counter"
              variant="secondary"
              onPress={() => setCounterOpen(true)}
            />
            <Button
              title="Decline"
              variant="danger"
              onPress={confirmDecline}
              loading={decline.isPending}
            />
          </View>
        ) : null}

        {/* Sender actions — edit (only while pending) + withdraw. Edit
            reuses MakeTradeOffer in 'edit' mode so the same UI drives
            both create and update. */}
        {canRespond && amISender ? (
          <View style={{ gap: Spacing.sm, marginTop: Spacing.lg }}>
            {offer.status === 'pending' ? (
              <Button
                title="Edit offer"
                variant="secondary"
                onPress={() => navigation.navigate('MakeTradeOffer', {
                  listingId: offer.trade_listing_id,
                  editOfferId: offer.id,
                })}
              />
            ) : null}
            <Button
              title="Withdraw offer"
              variant="danger"
              onPress={() => withdraw.mutate()}
              loading={withdraw.isPending}
            />
          </View>
        ) : null}

        {/* Block user — always available (can't block yourself) */}
        {offer.sender_user_id !== user?.id || offer.recipient_user_id !== user?.id ? (
          <TouchableOpacity
            onPress={() => {
              const otherId = amIRecipient ? offer.sender_user_id : offer.recipient_user_id;
              const otherName = amIRecipient ? offer.sender_name : offer.recipient_name;
              Alert.alert(
                'Block this user?',
                `${otherName} won't be able to see your listings or send you offers. You won't see theirs either. You can unblock later in Profile → Help & Safety.`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Block',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await safetyApi.blockUser(otherId, 'Blocked from offer thread');
                        Alert.alert('Blocked', `${otherName} has been blocked.`);
                        navigation.goBack();
                      } catch (err) {
                        Alert.alert('Could not block', err?.response?.data?.error || 'Try again.');
                      }
                    },
                  },
                ],
              );
            }}
            style={{ marginTop: Spacing.lg, alignSelf: 'center', padding: Spacing.sm }}
          >
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs }}>
              🚫 Block this user
            </Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Counter modal */}
      <Modal visible={counterOpen} transparent animationType="slide" onRequestClose={() => setCounterOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Counter offer</Text>
            <Text style={styles.modalSubtitle}>
              Share what you're looking for. The other party sees this note.
            </Text>

            <Input
              label="Note (e.g. 'looking for something closer to a Gold parallel')"
              value={counterNote}
              onChangeText={setCounterNote}
              placeholder="What would make this work for you?"
              multiline
              numberOfLines={3}
            />

            <Input
              label="Value gap (optional, USD)"
              value={valueGap}
              onChangeText={setValueGap}
              placeholder="20"
              keyboardType="numeric"
            />

            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setCounterOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Send counter"
                onPress={() => counter.mutate()}
                loading={counter.isPending}
                disabled={!counterNote.trim() && !valueGap}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ============================================================
// TRADE OFFERS INBOX
// ============================================================
export const TradeOffersListScreen = ({ navigation }) => {
  const [direction, setDirection] = useState('received');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['trade-offers-mine', direction],
    queryFn: () => offersApi.mine({
      target_type: 'trade_listing',
      direction,
      limit: 50,
    }).then((r) => r.data),
  });

  const offers = data?.offers || [];

  if (isLoading) return <LoadingScreen message="Loading offers..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader title="Trade Offers" />

      <View style={styles.scopeTabs}>
        <ScopeTab label="Received" active={direction === 'received'} onPress={() => setDirection('received')} />
        <ScopeTab label="Sent" active={direction === 'sent'} onPress={() => setDirection('sent')} />
      </View>

      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: Spacing.base }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.offerRow}
            onPress={() => navigation.navigate('TradeOfferDetail', { offerId: item.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.offerRowName}>
                {item.tl_card_name || 'Trade offer'}
              </Text>
              <Text style={styles.offerRowStatus}>
                {item.direction === 'sent' ? 'to' : 'from'} {item.other_party_name} · {item.status}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="📩"
            title="No offers yet"
            message={direction === 'received' ? 'No one has offered on your listings.' : 'You have not sent any offers.'}
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// SHARED UI BITS
// ============================================================

const StepBlock = ({ n, title, subtitle, done, children }) => (
  <View style={styles.step}>
    <View style={styles.stepHeader}>
      <View style={[styles.stepBadge, done && styles.stepBadgeDone]}>
        {done ? (
          <Ionicons name="checkmark" size={12} color={Colors.bg} />
        ) : (
          <Text style={styles.stepBadgeText}>{n}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepTitle}>{title}</Text>
        {subtitle ? <Text style={styles.stepSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
    <View style={styles.stepBody}>{children}</View>
  </View>
);

const ChoiceChip = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.choiceChip, active && styles.choiceChipActive]}
    onPress={onPress}
  >
    <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{label}</Text>
  </TouchableOpacity>
);

const VisibilityPicker = ({ visibility, setVisibility, groups }) => {
  const hasGlobal = visibility.some((v) => v.scope_type === 'global');
  const selectedGroupIds = new Set(
    visibility.filter((v) => v.scope_type === 'group').map((v) => v.group_id)
  );

  const toggleGlobal = () => {
    if (hasGlobal) {
      setVisibility(visibility.filter((v) => v.scope_type !== 'global'));
    } else {
      setVisibility([...visibility, { scope_type: 'global' }]);
    }
  };

  const toggleGroup = (id) => {
    if (selectedGroupIds.has(id)) {
      setVisibility(visibility.filter((v) => !(v.scope_type === 'group' && v.group_id === id)));
    } else {
      setVisibility([...visibility, { scope_type: 'group', group_id: id }]);
    }
  };

  return (
    <View>
      <TouchableOpacity style={styles.visibilityRow} onPress={toggleGlobal}>
        <Ionicons
          name={hasGlobal ? 'checkbox' : 'square-outline'}
          size={22}
          color={hasGlobal ? Colors.accent : Colors.textMuted}
        />
        <View style={{ flex: 1, marginLeft: Spacing.sm }}>
          <Text style={styles.visibilityTitle}>Global</Text>
          <Text style={styles.visibilitySub}>Everyone on the trade board can see this listing.</Text>
        </View>
      </TouchableOpacity>

      {groups.length ? (
        <>
          <Text style={[styles.visibilitySub, { marginTop: Spacing.base, marginBottom: Spacing.sm }]}>
            Your groups
          </Text>
          {groups.map((g) => {
            const selected = selectedGroupIds.has(g.id);
            return (
              <TouchableOpacity key={g.id} style={styles.visibilityRow} onPress={() => toggleGroup(g.id)}>
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={selected ? Colors.accent : Colors.textMuted}
                />
                <View style={{ flex: 1, marginLeft: Spacing.sm }}>
                  <Text style={styles.visibilityTitle}>{g.name}</Text>
                  <Text style={styles.visibilitySub}>{g.member_count} member{g.member_count === 1 ? '' : 's'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </>
      ) : (
        <Text style={[styles.visibilitySub, { marginTop: Spacing.base }]}>
          No groups yet. Create or join a trade group to share listings privately.
        </Text>
      )}
    </View>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  newListingButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  headerIconButton: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  scopeTabs: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  scopeTab: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scopeTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  scopeTabText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  scopeTabTextActive: {
    color: Colors.bg,
  },
  groupFilterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surface2,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.md,
  },
  groupFilterText: {
    color: Colors.text,
    fontSize: Typography.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 40,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.base,
  },

  // Feed listing card
  listingCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  listingPhotoWrap: {
    width: 80, height: 110,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
  },
  listingPhoto: { width: '100%', height: '100%' },
  listingPhotoEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingTitle: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  listingParallel: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    marginTop: 2,
  },
  listingMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  listingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  listingChipText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  listingLookingFor: {
    color: Colors.text,
    fontSize: Typography.sm,
    marginTop: 6,
  },
  listingLookingForLabel: {
    color: Colors.accent,
    fontWeight: Typography.semibold,
  },
  listingOwnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  listingOwnerAvatar: {
    width: 18, height: 18, borderRadius: 9,
  },
  listingOwnerName: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },

  // Detail
  detailPhoto: {
    width: width - Spacing.base * 2,
    height: 360,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
    marginRight: Spacing.sm,
  },
  detailTitle: {
    color: Colors.text,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
  },
  detailParallel: {
    color: Colors.accent,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
    marginTop: 4,
  },
  detailMeta: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  detailOwnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailOwnerAvatar: {
    width: 40, height: 40, borderRadius: 20,
  },
  detailOwnerName: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  detailOwnerMeta: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  detailChipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailChipText: {
    color: Colors.text,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  detailSection: {
    marginTop: Spacing.lg,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  detailSectionLabel: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    letterSpacing: 0.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  detailBody: {
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 20,
  },
  verificationNotes: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 6,
    lineHeight: 18,
  },
  photoPair: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  photoThumb: {
    flex: 1,
    aspectRatio: 0.72,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface2,
  },
  photoThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  photoThumbLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 4,
  },

  // eBay comps section
  compsSummary: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  compStat: {
    flex: 1,
    padding: Spacing.sm,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  compStatLabel: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  compStatValue: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    marginTop: 2,
  },
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  compPrice: {
    color: Colors.accent,
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    minWidth: 70,
  },
  compTitle: {
    color: Colors.text,
    fontSize: Typography.sm,
  },
  compMeta: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  compsFooter: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },

  // Offer rows
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  offerRowName: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  offerRowStatus: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  offerRowEmpty: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    padding: Spacing.base,
    textAlign: 'center',
  },
  offerCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  offerCardRowSelected: {
    borderColor: Colors.accent,
  },

  // Create flow
  step: {
    marginBottom: Spacing.xl,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stepBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepBadgeDone: {
    backgroundColor: Colors.success,
  },
  stepBadgeText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
  },
  stepTitle: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  stepSubtitle: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  stepBody: {
    marginLeft: 32,
  },
  pickedCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  pickedCardText: { color: Colors.text, flex: 1 },
  pickedCardChange: { color: Colors.accent, fontWeight: Typography.semibold },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickRowTitle: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  pickRowSub: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
  choiceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  choiceChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  choiceChipText: {
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
  },
  choiceChipTextActive: {
    color: Colors.bg,
    fontWeight: Typography.bold,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    marginVertical: 2,
  },
  visibilityTitle: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  visibilitySub: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },

  // Offer detail / thread
  statusBanner: {
    padding: Spacing.sm,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    marginBottom: Spacing.base,
  },
  statusBannerText: {
    color: Colors.text,
    fontSize: Typography.sm,
  },
  offerTerms: {
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  offerTermsLabel: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  offerTermsLine: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  offerTermsSub: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    fontStyle: 'italic',
    marginTop: 4,
  },
  trustCard: {
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
  },
  trustCardLabel: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  trustCardName: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.semibold,
  },
  threadItem: {
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    marginBottom: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  threadAuthor: {
    color: Colors.accent,
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    marginBottom: 4,
  },
  threadMessage: {
    color: Colors.text,
    fontSize: Typography.sm,
  },
  threadCounter: {
    marginTop: Spacing.xs,
    padding: Spacing.xs,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.sm,
  },
  threadCounterText: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  threadEmpty: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    textAlign: 'center',
    padding: Spacing.base,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    marginBottom: 4,
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginBottom: Spacing.base,
  },
});
