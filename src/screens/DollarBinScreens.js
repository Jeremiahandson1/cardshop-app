// Buyer-side dollar-bin shopping (Theme M-L).
//   BrowseDollarBinsScreen — opted-in bins, with search / Following / price chips
//   DollarBinDetailScreen  — a bin's active listings; add to cart, then the
//                            existing cart → "Make offer" lot flow takes over.
//
// A dollar bin is a regular binder the owner opted into the browse. Its
// shoppable items are its cards that have an active marketplace listing,
// so we add real listing_ids to the cart and reuse cart + lot offers.

import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, TextInput,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { marketplaceApi, cartApi, followsApi } from '../services/api';
import { Colors } from '../theme';

const usd = (cents) => `$${((cents || 0) / 100).toFixed(2)}`;

const PRICE_CHIPS = [
  { label: 'All', value: null },
  { label: '$1', value: 1 },
  { label: 'Under $5', value: 5 },
  { label: 'Under $20', value: 20 },
];

const chipStyle = (active) => ({
  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 8,
  backgroundColor: active ? Colors.accent : Colors.surface2,
  borderWidth: 1, borderColor: active ? Colors.accent : Colors.border,
});
const chipText = (active) => ({ color: active ? '#0a0a0f' : Colors.text, fontSize: 13, fontWeight: '700' });

const BackButton = ({ navigation }) => (
  <TouchableOpacity
    onPress={() => navigation.goBack()}
    accessibilityLabel="Go back"
    style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
  >
    <Ionicons name="chevron-back" size={22} color={Colors.text} />
    <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600' }}>Back</Text>
  </TouchableOpacity>
);

// ============================================================
// BROWSE — list of opted-in dollar bins
// ============================================================
export const BrowseDollarBinsScreen = ({ navigation }) => {
  const [q, setQ] = useState('');
  const [maxPrice, setMaxPrice] = useState(null);
  const [following, setFollowing] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dollar-bins', q, maxPrice, following],
    queryFn: () => marketplaceApi.dollarBins({
      ...(q ? { q } : {}),
      ...(maxPrice ? { max_price: maxPrice } : {}),
      ...(following ? { following: true } : {}),
    }),
  });
  const bins = data?.bins || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
        <BackButton navigation={navigation} />
        <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '800' }}>Dollar Bins</Text>
      </View>

      <View style={{ paddingHorizontal: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10 }}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search bins by name or seller"
            placeholderTextColor={Colors.textDim}
            style={{ flex: 1, color: Colors.text, paddingVertical: 10, paddingHorizontal: 8 }}
            returnKeyType="search"
          />
          {q ? (
            <TouchableOpacity onPress={() => setQ('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', rowGap: 8 }}>
          {PRICE_CHIPS.map((c) => (
            <TouchableOpacity key={c.label} style={chipStyle(maxPrice === c.value)} onPress={() => setMaxPrice(c.value)}>
              <Text style={chipText(maxPrice === c.value)}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={chipStyle(following)} onPress={() => setFollowing((f) => !f)}>
            <Text style={chipText(following)}>★ Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
      ) : (
        <FlatList
          data={bins}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={<Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 40 }}>No dollar bins match.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('DollarBinDetail', {
                binderId: item.id, name: item.name,
                ownerUserId: item.owner_user_id, ownerUsername: item.owner_username,
                isFollowing: item.is_following,
              })}
              style={{ backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14 }}
            >
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800' }} numberOfLines={1}>{item.name}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 2 }}>@{item.owner_username}{item.is_following ? ' · ★ following' : ''}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: Colors.text, fontSize: 13 }}>{item.for_sale_count} cards for sale</Text>
                <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>
                  {usd(item.min_price_cents)}{item.max_price_cents !== item.min_price_cents ? `–${usd(item.max_price_cents)}` : ''}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// DETAIL — a bin's listings; add to cart → existing lot-offer flow
// ============================================================
export const DollarBinDetailScreen = ({ navigation, route }) => {
  const { binderId, name, ownerUserId } = route.params || {};
  const [maxPrice, setMaxPrice] = useState(null);
  const [added, setAdded] = useState({});
  const [isFollowing, setIsFollowing] = useState(!!route.params?.isFollowing);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dollar-bin-cards', binderId, maxPrice],
    queryFn: () => marketplaceApi.dollarBinCards(binderId, { ...(maxPrice ? { max_price: maxPrice } : {}) }),
  });
  const listings = data?.listings || [];
  const ownerName = data?.binder?.owner_username || route.params?.ownerUsername;

  const addMut = useMutation({
    mutationFn: (listingId) => cartApi.add(listingId),
    onSuccess: (_r, listingId) => setAdded((a) => ({ ...a, [listingId]: true })),
    onError: (e) => Alert.alert('Could not add', e?.response?.data?.error || 'Try again.'),
  });

  const toggleFollow = async () => {
    try {
      if (isFollowing) { await followsApi.unfollow(ownerUserId); setIsFollowing(false); }
      else { await followsApi.follow(ownerUserId); setIsFollowing(true); }
    } catch (e) {
      Alert.alert('Follow failed', e?.response?.data?.error || 'Try again.');
    }
  };

  const addedCount = Object.keys(added).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 }}>
        <BackButton navigation={navigation} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{name || 'Dollar bin'}</Text>
          {ownerName ? <Text style={{ color: Colors.textMuted, fontSize: 12 }}>@{ownerName}</Text> : null}
        </View>
        {ownerUserId ? (
          <TouchableOpacity
            onPress={toggleFollow}
            accessibilityLabel={isFollowing ? 'Unfollow seller' : 'Follow seller'}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: isFollowing ? Colors.surface2 : Colors.accent, borderWidth: 1, borderColor: isFollowing ? Colors.border : Colors.accent }}
          >
            <Ionicons name={isFollowing ? 'star' : 'star-outline'} size={14} color={isFollowing ? Colors.accent : '#0a0a0f'} />
            <Text style={{ color: isFollowing ? Colors.text : '#0a0a0f', fontSize: 13, fontWeight: '700' }}>{isFollowing ? 'Following' : 'Follow'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 14, marginBottom: 6, flexWrap: 'wrap', rowGap: 8 }}>
        {PRICE_CHIPS.map((c) => (
          <TouchableOpacity key={c.label} style={chipStyle(maxPrice === c.value)} onPress={() => setMaxPrice(c.value)}>
            <Text style={chipText(maxPrice === c.value)}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={Colors.accent} />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.listing_id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10, paddingHorizontal: 14 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 90 }}
          refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />}
          ListEmptyComponent={<Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 40 }}>No cards in this price range.</Text>}
          renderItem={({ item }) => {
            const isAdded = !!added[item.listing_id];
            const photo = Array.isArray(item.photos) ? item.photos[0] : null;
            return (
              <View style={{ flex: 1, backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                {photo ? (
                  <Image source={{ uri: photo }} style={{ width: '100%', height: 150, backgroundColor: Colors.surface2 }} resizeMode="contain" />
                ) : (
                  <View style={{ width: '100%', height: 150, backgroundColor: Colors.surface2 }} />
                )}
                <View style={{ padding: 8 }}>
                  <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{item.player_name || '—'}</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                    {[item.year, item.set_name, item.parallel].filter(Boolean).join(' ')}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <Text style={{ color: Colors.accent, fontSize: 14, fontWeight: '800' }}>{usd(item.asking_price_cents)}</Text>
                    <TouchableOpacity
                      disabled={isAdded || addMut.isPending}
                      onPress={() => addMut.mutate(item.listing_id)}
                      accessibilityLabel={isAdded ? 'Added to cart' : 'Add to cart'}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: isAdded ? Colors.surface2 : Colors.accent }}
                    >
                      <Ionicons name={isAdded ? 'checkmark' : 'cart'} size={12} color={isAdded ? Colors.success : '#0a0a0f'} />
                      <Text style={{ color: isAdded ? Colors.success : '#0a0a0f', fontSize: 11, fontWeight: '700' }}>{isAdded ? 'Added' : 'Add'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {addedCount > 0 ? (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 18 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('CartList')}
            accessibilityLabel="Go to cart to make a lot offer"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.accent, borderRadius: 12, paddingVertical: 14 }}
          >
            <Ionicons name="cart" size={18} color="#0a0a0f" />
            <Text style={{ color: '#0a0a0f', fontSize: 15, fontWeight: '800' }}>Go to cart ({addedCount}) — make a lot offer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
};
