import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Image, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi, catalogApi, ebayApi } from '../services/api';
import { Button, Input, StatusBadge, SectionHeader, LoadingScreen, Divider } from '../components/ui';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// Shared hook for eBay feature-flag + connection state. Cached in
// react-query so IntegrationsScreen and CardDetail share a single fetch.
// Returns undefined while loading — callers should gate on that.
const useEbayStatus = () => {
  const { data } = useQuery({
    queryKey: ['ebay', 'status'],
    queryFn: () => ebayApi.getStatus().then((r) => r.data),
    staleTime: 60_000,
  });
  return data;
};

// ============================================================
// Cascading catalog picker for registration.
//
// Pulls distinct values for the active dimension from
// /api/catalog/filter-values, narrowed by what's already picked.
// On a single-option response (e.g. only one manufacturer ships
// football 2025 inserts) it auto-advances so the user isn't
// tapping through rubber-stamp screens. An empty response at
// any step drops the user into manual entry, pre-filled.
// ============================================================
const CascadePicker = ({
  navigation, cascade, setCascade, cascadeDim, setCascadeDim,
  cascadeQuery, setCascadeQuery, cascadeOrder, cascadeLabel,
  onComplete, onManualFallback,
}) => {
  const currentIdx = cascadeOrder.indexOf(cascadeDim);

  const { data: options, isLoading } = useQuery({
    queryKey: ['catalog-filter', cascadeDim, cascade, cascadeQuery],
    queryFn: () =>
      catalogApi
        .filterValues({ dimension: cascadeDim, ...cascade, q: cascadeQuery || undefined, limit: 200 })
        .then((r) => r.data?.values || []),
    // Keep typeahead snappy but not thrash-y while the user types.
    staleTime: 10_000,
  });

  const OPTIONAL_DIMS = new Set(['subset_name', 'parallel']);

  // Auto-advance behavior:
  //  - Exactly one option (and no active typeahead) → pick it.
  //  - Zero options on an optional dim (subset / parallel) →
  //    skip silently. Lots of catalog rows have null subset or
  //    null parallel and the user shouldn't land on a dead-end
  //    empty list.
  //  - Zero options on a required dim → stay; user sees the
  //    "enter manually" fallback.
  React.useEffect(() => {
    if (cascadeQuery) return;
    if (!options) return;

    if (options.length === 1) {
      const only = options[0];
      if (cascade[cascadeDim] === only) return;
      const next = { ...cascade, [cascadeDim]: only };
      setCascade(next);
      const nextIdx = currentIdx + 1;
      if (nextIdx < cascadeOrder.length) {
        setCascadeDim(cascadeOrder[nextIdx]);
      } else {
        onComplete(next);
      }
      return;
    }

    if (options.length === 0 && OPTIONAL_DIMS.has(cascadeDim)) {
      const nextIdx = currentIdx + 1;
      if (nextIdx >= cascadeOrder.length) {
        onComplete(cascade);
        return;
      }
      setCascadeDim(cascadeOrder[nextIdx]);
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, cascadeQuery, cascadeDim]);

  const pick = (value) => {
    const next = { ...cascade, [cascadeDim]: value };
    setCascade(next);
    setCascadeQuery('');
    const nextIdx = currentIdx + 1;
    if (nextIdx >= cascadeOrder.length) {
      onComplete(next);
      return;
    }
    setCascadeDim(cascadeOrder[nextIdx]);
  };

  const skip = () => {
    // Some cards have no subset or parallel — let the user skip
    // these optional levels without picking anything.
    const nextIdx = currentIdx + 1;
    if (nextIdx >= cascadeOrder.length) {
      onComplete(cascade);
      return;
    }
    setCascadeDim(cascadeOrder[nextIdx]);
    setCascadeQuery('');
  };

  const stepBack = () => {
    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) {
      navigation.goBack();
      return;
    }
    // Drop the current pick and everything after it when stepping back.
    const cleared = { ...cascade };
    for (let i = prevIdx; i < cascadeOrder.length; i++) delete cleared[cascadeOrder[i]];
    setCascade(cleared);
    setCascadeDim(cascadeOrder[prevIdx]);
    setCascadeQuery('');
  };

  const isOptional = OPTIONAL_DIMS.has(cascadeDim);
  const picked = cascadeOrder.filter((d) => cascade[d] !== undefined);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={stepBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Register Card</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Breadcrumbs of what's been picked so far. */}
      {picked.length > 0 ? (
        <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
          <Text style={{ fontSize: 11, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
            {picked.map((d) => cascade[d]).join(' · ')}
          </Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
        <Text style={{ fontSize: 14, color: Colors.textMuted, marginBottom: 6 }}>
          Step {currentIdx + 1} of {cascadeOrder.length} — {cascadeLabel[cascadeDim]}
        </Text>
        <Input
          placeholder={`Search ${cascadeLabel[cascadeDim].toLowerCase()}...`}
          value={cascadeQuery}
          onChangeText={setCascadeQuery}
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={options || []}
        keyExtractor={(item, i) => String(item) + i}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.xxxl }}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.md }}>
              <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
                No matches for the filters so far.
              </Text>
              <TouchableOpacity onPress={onManualFallback}>
                <Text style={{ color: Colors.accent, fontWeight: '600' }}>
                  Enter this card manually →
                </Text>
              </TouchableOpacity>
            </View>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => pick(item)}
            style={{
              paddingVertical: Spacing.md,
              paddingHorizontal: Spacing.md,
              borderRadius: Radius.md,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.surface2,
              marginBottom: Spacing.xs,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ color: Colors.text, fontSize: 15, flexShrink: 1 }}>{String(item)}</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
      />

      {/* Skip button for optional dimensions (subset / parallel)
          + a manual-entry escape hatch that's always reachable. */}
      <View style={{ padding: Spacing.base, gap: Spacing.sm }}>
        {isOptional ? (
          <TouchableOpacity onPress={skip} style={{ alignItems: 'center', padding: Spacing.sm }}>
            <Text style={{ color: Colors.textMuted, fontSize: 14 }}>
              Skip {cascadeLabel[cascadeDim]} →
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onManualFallback}>
          <Text style={{ textAlign: 'center', color: Colors.textMuted, fontSize: 13 }}>
            Card not in catalog? Enter manually →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// REGISTER CARD
// ============================================================
export const RegisterCardScreen = ({ navigation, route }) => {
  const qrCode = route.params?.qrCode;
  const catalogId = route.params?.catalogId;
  const queryClient = useQueryClient();

  // Default to manual entry. Search-first was forcing collectors
  // through a catalog lookup even when they knew exactly what card
  // they had; and the catalog is sparsely populated so searches
  // mostly dead-ended. Search is still reachable as a helper via
  // the "Search existing catalog" link on the manual-entry screen.
  // Cascade is the primary register path now that the catalog has
  // real data. Manual entry stays reachable as a fallback for cards
  // not yet catalogued; legacy `search` is still used by QR + deep
  // link entries that already know a catalog_id.
  const [step, setStep] = useState(
    qrCode || catalogId ? 'search' : 'cascade'
  );

  // Cascade state — each level records the picked value, narrowing
  // the options for the next level. Order matters: each dimension
  // depends on the ones above.
  const CASCADE_ORDER = [
    'sport', 'year', 'manufacturer', 'set_name',
    'subset_name', 'player_name', 'card_number', 'parallel',
  ];
  const CASCADE_LABEL = {
    sport:         'Sport',
    year:          'Year',
    manufacturer:  'Manufacturer',
    set_name:      'Set',
    subset_name:   'Subset / Insert',
    player_name:   'Player',
    card_number:   'Card number',
    parallel:      'Parallel / variant',
  };
  const [cascade, setCascade] = useState({});
  const [cascadeDim, setCascadeDim] = useState('sport');
  const [cascadeQuery, setCascadeQuery] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [parallels, setParallels] = useState([]);

  // If a catalogId was passed, fetch and pre-select it
  const { data: preselectedCatalog } = useQuery({
    queryKey: ['catalog', catalogId],
    queryFn: () => catalogApi.get(catalogId).then((r) => r.data),
    enabled: !!catalogId && !selectedCatalog,
  });

  React.useEffect(() => {
    if (preselectedCatalog && !selectedCatalog) {
      setSelectedCatalog(preselectedCatalog);
      setStep('parallel');
    }
  }, [preselectedCatalog, selectedCatalog, setSelectedCatalog, setStep]);
  const [photos, setPhotos] = useState([]);
  const [form, setForm] = useState({
    grading_company: 'raw',
    condition: 'near_mint',
    cert_number: '',
    grade: '',
    status: 'nfs',
    asking_price: '',
    condition_notes: '',
    serial_number: '',
    purchase_price: '',
    personal_valuation: '',
    notes: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Manual-entry form — catalog fields (shared across all owners
  // of this card). The owned-card fields (condition, grade, cert,
  // photos, price) come on the next screen. Required server-side:
  // sport, player_name, year, manufacturer, set_name.
  const [manualForm, setManualForm] = useState({
    sport: 'baseball',
    player_name: '',
    year: '',
    manufacturer: '',
    set_name: '',
    subset_name: '',
    card_number: '',
    parallel: '',
    team: '',
    print_run: '',
    is_rookie: false,
    is_autograph: false,
    is_relic: false,
    is_one_of_one: false,
  });
  const setManual = (key) => (val) => setManualForm((f) => ({ ...f, [key]: val }));

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const searchCatalog = async (q) => {
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await catalogApi.search({ q, limit: 10 });
      setSearchResults(res.data?.cards || []);
    } catch {
      // search failed silently
    }
    setSearching(false);
  };

  // Photos captured in-app go into state with source='camera' — the
  // server can then mark the owned_card as camera-captured for
  // verification purposes. Gallery uploads are source='gallery'.
  // We track source per photo in a parallel array so order stays
  // aligned with photos[].
  const [photoSources, setPhotoSources] = useState([]);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera permission needed',
        'Open Settings → Card Shop → Permissions and enable Camera.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      cameraType: ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets?.length) {
      setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
      setPhotoSources((s) => [...s, ...result.assets.map(() => 'camera')]);
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets?.length) {
      setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
      setPhotoSources((s) => [...s, ...result.assets.map(() => 'gallery')]);
    }
  };

  // Primary entry point for the "Add" buttons. Puts camera first —
  // in-app captures are the verified path; gallery is a backup for
  // when the user only has existing photos (e.g. graded slab photos
  // from a grading service).
  const pickPhoto = () => {
    Alert.alert(
      'Add a photo',
      "In-app camera captures count as verified. Gallery uploads are allowed but can't be verified.",
      [
        { text: 'Take photo (recommended)', onPress: takePhoto },
        { text: 'Choose from gallery', onPress: pickFromGallery },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  // Fetch parallels when a base card is selected
  const fetchParallels = async (catalogId) => {
    try {
      const res = await catalogApi.parallels(catalogId);
      setParallels(res.data || []);
    } catch {
      setParallels([]);
    }
  };

  // Creates a new catalog entry from the manual-entry form, then
  // advances into the existing photo/details flow.
  const createCatalogMutation = useMutation({
    mutationFn: () => catalogApi.create({
      sport: manualForm.sport,
      player_name: manualForm.player_name.trim(),
      year: parseInt(manualForm.year, 10),
      manufacturer: manualForm.manufacturer.trim(),
      set_name: manualForm.set_name.trim(),
      subset_name: manualForm.subset_name.trim() || undefined,
      card_number: manualForm.card_number.trim() || undefined,
      parallel: manualForm.parallel.trim() || undefined,
      team: manualForm.team.trim() || undefined,
      print_run: manualForm.print_run ? parseInt(manualForm.print_run, 10) : undefined,
      is_rookie: manualForm.is_rookie,
      is_autograph: manualForm.is_autograph,
      is_relic: manualForm.is_relic,
      is_one_of_one: manualForm.is_one_of_one,
    }),
    onSuccess: (res) => {
      setSelectedCatalog(res.data);
      setParallels([]); // skip the "pick parallel" step for manual entries
      setStep('details');
    },
    onError: (err) => {
      Alert.alert('Could not create card', err.response?.data?.error || 'Please check all fields.');
    },
  });

  const goManualEntry = () => {
    // Pre-populate player_name from whatever the user typed in search.
    if (catalogSearch && !manualForm.player_name) {
      setManualForm((f) => ({ ...f, player_name: catalogSearch.trim() }));
    }
    setStep('manual_entry');
  };

  const registerMutation = useMutation({
    mutationFn: () => cardsApi.register({
      catalog_id: selectedCatalog.id,
      qr_insert_code: qrCode || undefined,
      grading_company: form.grading_company,
      condition: form.grading_company === 'raw' ? form.condition : undefined,
      cert_number: form.cert_number || undefined,
      grade: form.grade ? parseFloat(form.grade) : undefined,
      status: form.status,
      asking_price: form.asking_price ? parseFloat(form.asking_price) : undefined,
      serial_number: form.serial_number ? parseInt(form.serial_number) : undefined,
      purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
      personal_valuation: form.personal_valuation ? parseFloat(form.personal_valuation) : undefined,
      notes: form.notes || undefined,
      photo_urls: photos,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      navigation.replace('CardDetail', { cardId: res.data?.id });
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to register card');
    },
  });

  const CONDITIONS = ['poor','fair','good','very_good','excellent','near_mint','mint','gem_mint'];
  const STATUSES = [
    { key: 'nfs', label: 'NFS', desc: 'Not For Sale' },
    { key: 'nft', label: 'NFT', desc: 'Not For Trade' },
    { key: 'lets_talk', label: "Let's Talk", desc: 'Open to offers' },
  ];

  // Step 1: Search catalog
  if (step === 'search' || step === 'scan_or_search') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Register Card</Text>
          <View style={{ width: 22 }} />
        </View>

        {qrCode && (
          <View style={styles.qrBanner}>
            <Ionicons name="qr-code" size={16} color={Colors.accent} />
            <Text style={styles.qrBannerText}>QR Insert: {qrCode.substring(0, 8)}...</Text>
          </View>
        )}

        <View style={{ paddingHorizontal: Spacing.base }}>
          <Input
            label="Search the catalog (optional)"
            value={catalogSearch}
            onChangeText={(v) => {
              setCatalogSearch(v);
              searchCatalog(v);
            }}
            placeholder="Player name, set, year..."
            returnKeyType="search"
          />
          {/* Primary-path manual entry — always visible so users who
              know their card don't have to go through the search fake-out. */}
          <TouchableOpacity
            style={styles.createNewBtn}
            onPress={goManualEntry}
          >
            <Ionicons name="create-outline" size={18} color={Colors.accent} />
            <Text style={styles.createNewText}>Enter card details manually →</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl }}
          ListHeaderComponent={
            !searching && catalogSearch.length > 1 && searchResults.length === 0 ? (
              <TouchableOpacity
                style={styles.createNewBtn}
                onPress={goManualEntry}
              >
                <Ionicons name="add-circle" size={18} color={Colors.accent} />
                <Text style={styles.createNewText}>Card not found — enter it manually</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.catalogResult}
              onPress={() => { setSelectedCatalog(item); fetchParallels(item.id); setStep('parallel'); }}
            >
              <View style={styles.catalogResultImg}>
                {item.front_image_url
                  ? <Image source={{ uri: item.front_image_url }} style={{ width: 40, height: 56 }} resizeMode="contain" />
                  : <Text style={{ fontSize: 24 }}>🃏</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.catalogPlayer}>{item.player_name}</Text>
                <Text style={styles.catalogSet}>{item.year} {item.set_name}</Text>
                {item.parallel && <Text style={styles.catalogParallel}>{item.parallel}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      </SafeAreaView>
    );
  }

  // Step 1.5: Manual catalog entry — used when the card isn't in the
  // catalog, or when the user skips search entirely.
  // --- Cascade step: sport → year → mfr → set → subset → player → card# → parallel ---
  if (step === 'cascade') {
    return (
      <CascadePicker
        navigation={navigation}
        cascade={cascade}
        setCascade={setCascade}
        cascadeDim={cascadeDim}
        setCascadeDim={setCascadeDim}
        cascadeQuery={cascadeQuery}
        setCascadeQuery={setCascadeQuery}
        cascadeOrder={CASCADE_ORDER}
        cascadeLabel={CASCADE_LABEL}
        onComplete={async (filters) => {
          // Resolve to one catalog row and advance. If we find it,
          // jump straight to owned-card details. If the cascade
          // didn't uniquely identify a row (rare — a few edge cases
          // like identical cards in different regional editions),
          // fall through to catalog search pre-filtered by what we
          // picked so the user can confirm.
          try {
            const res = await catalogApi.search({
              sport: filters.sport,
              year: filters.year,
              manufacturer: filters.manufacturer,
              set_name: filters.set_name,
              player_name: filters.player_name,
              parallel: filters.parallel,
              limit: 5,
            });
            const hits = res.data?.cards || [];
            const exact = hits.find((c) =>
              (c.card_number || '') === (filters.card_number || '') &&
              (c.subset_name || '') === (filters.subset_name || ''),
            );
            const picked = exact || hits[0];
            if (picked) {
              setSelectedCatalog(picked);
              setStep('details');
              return;
            }
          } catch { /* fall through to manual entry if lookup fails */ }
          // No match — let the user finish with manual entry,
          // pre-populated from the cascade picks.
          setManualForm((f) => ({
            ...f,
            sport: filters.sport || f.sport,
            year: String(filters.year || ''),
            manufacturer: filters.manufacturer || '',
            set_name: filters.set_name || '',
            subset_name: filters.subset_name || '',
            player_name: filters.player_name || '',
            card_number: filters.card_number || '',
            parallel: filters.parallel || '',
          }));
          setStep('manual_entry');
        }}
        onManualFallback={() => setStep('manual_entry')}
      />
    );
  }

  if (step === 'manual_entry') {
    const canSubmit =
      manualForm.player_name.trim() &&
      manualForm.year &&
      manualForm.manufacturer.trim() &&
      manualForm.set_name.trim();
    const SPORTS = ['baseball', 'basketball', 'football', 'hockey', 'pokemon', 'mtg', 'yugioh', 'other'];
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Card Details</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: Spacing.xxxl }}>
          <Text style={[styles.catalogSet, { marginBottom: Spacing.xs }]}>
            Enter the card's info. You'll take photos on the next screen.
          </Text>
          <TouchableOpacity onPress={() => setStep('search')} style={{ marginBottom: Spacing.md }}>
            <Text style={{ fontSize: 13, color: Colors.accent }}>
              Search existing catalog instead →
            </Text>
          </TouchableOpacity>

          <Text style={styles.catalogSet}>Sport / hobby</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.md }}>
            {SPORTS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setManual('sport')(s)}
                style={{
                  paddingHorizontal: Spacing.md,
                  paddingVertical: Spacing.xs,
                  borderRadius: Radius.sm,
                  borderWidth: 1,
                  borderColor: manualForm.sport === s ? Colors.accent : Colors.border,
                  backgroundColor: manualForm.sport === s ? Colors.accent + '22' : 'transparent',
                }}
              >
                <Text style={{ color: manualForm.sport === s ? Colors.accent : Colors.textMuted, fontSize: 13, textTransform: 'capitalize' }}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input label="Player / subject *" value={manualForm.player_name} onChangeText={setManual('player_name')} placeholder="Mike Trout" />
          <Input label="Year *" value={manualForm.year} onChangeText={setManual('year')} placeholder="2024" keyboardType="number-pad" />
          <Input label="Manufacturer *" value={manualForm.manufacturer} onChangeText={setManual('manufacturer')} placeholder="Topps, Panini, Bowman..." />
          <Input label="Set name *" value={manualForm.set_name} onChangeText={setManual('set_name')} placeholder="Chrome, Mosaic, Prizm..." />
          <Input label="Subset / insert set" value={manualForm.subset_name} onChangeText={setManual('subset_name')} placeholder="Showtime Signatures, Silver Slugger..." />
          <Input label="Card number" value={manualForm.card_number} onChangeText={setManual('card_number')} placeholder="#150 / SOS-DBR" />
          <Input label="Parallel / variant" value={manualForm.parallel} onChangeText={setManual('parallel')} placeholder="Gold Refractor, Mosaic Blue..." />
          <Input label="Team" value={manualForm.team} onChangeText={setManual('team')} placeholder="New Orleans Saints (optional)" />
          <Input label="Print run" value={manualForm.print_run} onChangeText={setManual('print_run')} placeholder="25 (total cards in run — leave blank if unnumbered)" keyboardType="number-pad" />

          <Text style={[styles.catalogSet, { marginTop: Spacing.md, marginBottom: Spacing.xs }]}>Card features</Text>
          {[
            { key: 'is_rookie',      label: 'Rookie card' },
            { key: 'is_autograph',   label: 'On-card or sticker autograph' },
            { key: 'is_relic',       label: 'Memorabilia / relic (patch, jersey, bat)' },
            { key: 'is_one_of_one',  label: '1 of 1 (true one-off)' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setManual(opt.key)(!manualForm[opt.key])}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: Spacing.sm,
                paddingVertical: Spacing.xs,
              }}
            >
              <View style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: manualForm[opt.key] ? Colors.accent : Colors.border,
                backgroundColor: manualForm[opt.key] ? Colors.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {manualForm[opt.key] ? (
                  <Ionicons name="checkmark" size={14} color={Colors.bg || '#fff'} />
                ) : null}
              </View>
              <Text style={{ color: Colors.text, fontSize: 14 }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}

          <Text style={{
            marginTop: Spacing.md,
            fontSize: 12,
            color: Colors.textMuted,
            lineHeight: 18,
          }}>
            Next: grading, condition, serial number, photos, and your price.
          </Text>

          <Button
            title={createCatalogMutation.isPending ? 'Creating…' : 'Continue to photos →'}
            onPress={() => createCatalogMutation.mutate()}
            disabled={!canSubmit || createCatalogMutation.isPending}
            style={{ marginTop: Spacing.lg }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Step 2: Select Parallel
  if (step === 'parallel') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('search')}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Select Parallel</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={{ paddingHorizontal: Spacing.base, marginBottom: Spacing.md }}>
          <Text style={styles.catalogPlayer}>{selectedCatalog?.player_name}</Text>
          <Text style={styles.catalogSet}>{selectedCatalog?.year} {selectedCatalog?.set_name}</Text>
        </View>

        <FlatList
          data={parallels.length > 0 ? parallels : (selectedCatalog ? [selectedCatalog] : [])}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.catalogResult, selectedCatalog?.id === item.id && styles.statusBtnActive]}
              onPress={() => {
                setSelectedCatalog(item);
                // If card has print_run, go to serial number step
                if (item.print_run) {
                  setStep('serial');
                } else {
                  setStep('details');
                }
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Text style={styles.catalogPlayer}>
                    {item.parallel || 'Base'}
                  </Text>
                  {item.is_one_of_one && (
                    <View style={[styles.rookieTag, { backgroundColor: '#FFD700' + '22', borderColor: '#FFD700' }]}>
                      <Text style={[styles.rookieTagText, { color: '#FFD700' }]}>1/1</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.catalogSet}>
                  {item.print_run ? `/${item.print_run}` : 'Unlimited'}
                  {item.is_autograph ? ' - Auto' : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.createNewBtn}
              onPress={() => {
                // TODO: navigate to add custom parallel
              }}
            >
              <Ionicons name="add-circle" size={18} color={Colors.accent} />
              <Text style={styles.createNewText}>Add a parallel not listed here</Text>
            </TouchableOpacity>
          }
        />
      </SafeAreaView>
    );
  }

  // Step 3: Serial Number (if card has print_run)
  if (step === 'serial') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('parallel')}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Serial Number</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={{ padding: Spacing.base, gap: Spacing.md }}>
          <View style={styles.selectedCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.catalogPlayer}>{selectedCatalog?.player_name}</Text>
              <Text style={styles.catalogSet}>
                {selectedCatalog?.parallel || 'Base'} /{selectedCatalog?.print_run}
              </Text>
            </View>
          </View>

          <Text style={{ color: Colors.textMuted, fontSize: Typography.sm }}>
            Which copy do you have? (e.g. 14 of {selectedCatalog?.print_run})
          </Text>

          <Input
            label="Serial Number"
            value={form.serial_number}
            onChangeText={set('serial_number')}
            placeholder={`1-${selectedCatalog?.print_run || '?'}`}
            keyboardType="number-pad"
          />

          {form.serial_number && selectedCatalog?.print_run && (
            <View style={[styles.rookieTag, { alignSelf: 'flex-start' }]}>
              <Text style={styles.rookieTagText}>#{form.serial_number}/{selectedCatalog.print_run}</Text>
            </View>
          )}

          <Button
            title="Continue"
            onPress={() => setStep('details')}
            style={{ marginTop: Spacing.lg }}
          />

          <TouchableOpacity onPress={() => setStep('details')}>
            <Text style={{ color: Colors.textMuted, textAlign: 'center', fontSize: Typography.sm }}>
              Skip — I don't know the serial number
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Step 4: Grade/Condition + Personal Details
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => selectedCatalog?.print_run ? setStep('serial') : setStep('parallel')}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card Details</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 100 }}>
        {/* Selected card preview */}
        {!selectedCatalog ? <LoadingScreen /> : <View style={styles.selectedCard}>
          {selectedCatalog.front_image_url
            ? <Image source={{ uri: selectedCatalog.front_image_url }} style={{ width: 50, height: 70 }} resizeMode="contain" />
            : <Text style={{ fontSize: 28 }}>🃏</Text>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogPlayer}>{selectedCatalog.player_name}</Text>
            <Text style={styles.catalogSet}>{selectedCatalog.year} {selectedCatalog.set_name}</Text>
            {selectedCatalog.parallel && <Text style={styles.catalogParallel}>{selectedCatalog.parallel}</Text>}
            {form.serial_number && selectedCatalog.print_run && (
              <Text style={styles.catalogParallel}>#{form.serial_number}/{selectedCatalog.print_run}</Text>
            )}
            {selectedCatalog.is_one_of_one && (
              <View style={[styles.rookieTag, { backgroundColor: '#FFD700' + '22', borderColor: '#FFD700', marginTop: 4 }]}>
                <Text style={[styles.rookieTagText, { color: '#FFD700' }]}>1/1</Text>
              </View>
            )}
          </View>
        </View>}

        {/* Graded or raw */}
        <View>
          <SectionHeader title="Card Type" />
          <View style={styles.toggleRow}>
            {['raw', 'psa', 'bgs', 'sgc', 'csg', 'hga'].map((g) => (
              <TouchableOpacity
                key={g}
                style={[styles.toggleBtn, form.grading_company === g && styles.toggleBtnActive]}
                onPress={() => set('grading_company')(g)}
              >
                <Text style={[styles.toggleText, form.grading_company === g && styles.toggleTextActive]}>
                  {g.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Graded fields */}
        {form.grading_company !== 'raw' ? (
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 2 }}>
              <Input label="Cert Number" value={form.cert_number} onChangeText={set('cert_number')} placeholder="12345678" keyboardType="numeric" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Grade" value={form.grade} onChangeText={set('grade')} placeholder="9.5" keyboardType="decimal-pad" />
            </View>
          </View>
        ) : (
          <View>
            <SectionHeader title="Condition" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.condBtn, form.condition === c && styles.condBtnActive]}
                  onPress={() => set('condition')(c)}
                >
                  <Text style={[styles.condText, form.condition === c && styles.condTextActive]}>
                    {c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Status */}
        <View>
          <SectionHeader title="Availability" />
          <View style={styles.statusRow}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.statusBtn, form.status === s.key && styles.statusBtnActive]}
                onPress={() => set('status')(s.key)}
              >
                <Text style={[styles.statusBtnLabel, form.status === s.key && { color: Colors.accent }]}>{s.label}</Text>
                <Text style={styles.statusBtnDesc}>{s.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Price if lets_talk */}
        {form.status === 'lets_talk' && (
          <Input
            label="Asking Price (optional)"
            value={form.asking_price}
            onChangeText={set('asking_price')}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        )}

        {/* Personal Details (private) */}
        <View>
          <SectionHeader title="Personal Details (Private)" />
          <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
            These are never shown to other users.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Purchase Price"
                value={form.purchase_price}
                onChangeText={set('purchase_price')}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Your Valuation"
                value={form.personal_valuation}
                onChangeText={set('personal_valuation')}
                placeholder="0.00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <Input
            label="Notes"
            value={form.notes}
            onChangeText={set('notes')}
            placeholder="Personal notes about this card..."
            multiline
          />
        </View>

        {/* Photos */}
        <View>
          <SectionHeader title="Photos" action={{ label: '+ Add', onPress: pickPhoto }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
            <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto}>
              <Ionicons name="camera" size={24} color={Colors.textMuted} />
              <Text style={styles.photoAddText}>Add Photo</Text>
            </TouchableOpacity>
            {photos.map((uri, i) => (
              <View key={i} style={styles.photoThumb}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                {photoSources[i] === 'camera' ? (
                  <View style={{
                    position: 'absolute',
                    bottom: 4,
                    left: 4,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                  }}>
                    <Ionicons name="camera" size={10} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600' }}>
                      Verified
                    </Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => {
                    setPhotos((p) => p.filter((_, idx) => idx !== i));
                    setPhotoSources((s) => s.filter((_, idx) => idx !== i));
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {/* Submit */}
      <View style={styles.submitBar}>
        <Button
          title="Register Card"
          onPress={() => registerMutation.mutate()}
          loading={registerMutation.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// CARD DETAIL
// ============================================================
export const CardDetailScreen = ({ navigation, route }) => {
  const { cardId } = route.params;
  const queryClient = useQueryClient();
  const ebayStatus = useEbayStatus();
  const ebayEnabled = !!ebayStatus?.feature_enabled;
  const ebayConnected = !!ebayStatus?.connected;

  const { data: card, isLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => cardsApi.get(cardId).then((r) => r.data),
  });

  const { data: history } = useQuery({
    queryKey: ['card-history', cardId],
    queryFn: () => cardsApi.history(cardId).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => cardsApi.update(cardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Update failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => cardsApi.delete(cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert(
      err.response?.data?.code === 'chain_of_custody_locked'
        ? 'Locked in chain of custody'
        : err.response?.data?.code === 'active_listing'
          ? 'Withdraw the trade listing first'
          : 'Could not delete',
      err.response?.data?.error || 'Please try again.'
    ),
  });

  const confirmDelete = () => {
    Alert.alert(
      'Delete this card?',
      'Removes it from your collection. You can re-register it anytime. Cards that have transferred to another owner cannot be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  };

  if (isLoading || !card) return <LoadingScreen />;

  const STATUSES = [
    { key: 'nfs', label: 'NFS' },
    { key: 'nft', label: 'NFT' },
    { key: 'lets_talk', label: "Let's Talk" },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {card.player_name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
          <TouchableOpacity onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('InitiateTransfer', { cardId })}>
            <Ionicons name="swap-horizontal" size={22} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Card image */}
        <View style={styles.cardImageArea}>
          {card.front_image_url
            ? <Image source={{ uri: card.front_image_url }} style={styles.cardImage} resizeMode="contain" />
            : (
              <View style={styles.cardImagePlaceholder}>
                <Text style={{ fontSize: 60 }}>🃏</Text>
              </View>
            )
          }
        </View>

        <View style={{ padding: Spacing.base }}>
          {/* Title block */}
          <Text style={styles.detailPlayer}>{card.player_name}</Text>
          <Text style={styles.detailSet}>{card.year} {card.manufacturer} {card.set_name}</Text>
          {card.parallel && <Text style={styles.detailParallel}>{card.parallel}</Text>}

          {/* Badges row */}
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, flexWrap: 'wrap' }}>
            {card.is_one_of_one && (
              <View style={[styles.rookieTag, { backgroundColor: '#FFD700' + '22', borderColor: '#FFD700' }]}>
                <Text style={[styles.rookieTagText, { color: '#FFD700' }]}>1/1</Text>
              </View>
            )}
            {card.serial_number && card.print_run && (
              <View style={styles.rookieTag}>
                <Text style={styles.rookieTagText}>#{card.serial_number}/{card.print_run}</Text>
              </View>
            )}
            {card.is_rookie && (
              <View style={styles.rookieTag}>
                <Text style={styles.rookieTagText}>Rookie Card</Text>
              </View>
            )}
            {card.is_autograph && (
              <View style={[styles.rookieTag, { backgroundColor: '#9B59B6' + '22', borderColor: '#9B59B6' }]}>
                <Text style={[styles.rookieTagText, { color: '#9B59B6' }]}>Auto</Text>
              </View>
            )}
          </View>

          <Divider />

          {/* Grade or condition with cert link */}
          {card.grading_company && card.grading_company !== 'raw' ? (
            <View style={styles.gradeBlock}>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeCompany}>{card.grading_company.toUpperCase()}</Text>
                <Text style={styles.gradeNum}>{card.grade}</Text>
              </View>
              <View>
                <Text style={styles.certNum}>Cert #{card.cert_number}</Text>
                {card.cert_number && (
                  <TouchableOpacity
                    onPress={() => {
                      const certUrls = {
                        psa: `https://www.psacard.com/cert/${card.cert_number}`,
                        bgs: `https://www.beckett.com/grading/cert/${card.cert_number}`,
                        sgc: 'https://www.sgccard.com/certification-lookup',
                      };
                      const url = certUrls[card.grading_company];
                      if (url) {
                        // Open in-app browser
                        navigation.navigate('WebView', { url, title: `Verify on ${card.grading_company.toUpperCase()}` });
                      }
                    }}
                  >
                    <Text style={{ color: Colors.accent, fontSize: Typography.xs, marginTop: 2 }}>
                      Verify on {card.grading_company.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Condition</Text>
              <Text style={styles.infoValue}>{card.condition?.replace(/_/g, ' ')?.replace(/\b\w/g, l => l.toUpperCase()) || 'N/A'}</Text>
            </View>
          )}

          {/* Serial number */}
          {card.serial_number && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Serial Number</Text>
              <Text style={styles.infoValue}>
                #{card.serial_number}{card.print_run ? `/${card.print_run}` : ''}
              </Text>
            </View>
          )}

          {/* Transfer count */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ownership History</Text>
            <Text style={styles.infoValue}>{card.transfer_count ?? 0} transfer{card.transfer_count !== 1 ? 's' : ''}</Text>
          </View>

          <Divider />

          {/* Status controls */}
          <SectionHeader title="Availability" />
          <View style={styles.statusRow}>
            {STATUSES.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={[styles.statusBtn, card.status === s.key && styles.statusBtnActive]}
                onPress={() => updateMutation.mutate({ status: s.key })}
              >
                <Text style={[styles.statusBtnLabel, card.status === s.key && { color: Colors.accent }]}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Divider />

          {/* Transfer history */}
          {history && history.length > 0 && (
            <View>
              <SectionHeader title="Transfer History" />
              {history.map((t, i) => (
                <View key={t.id} style={styles.historyItem}>
                  <View style={styles.historyDot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyMethod}>{t.method?.replace(/_/g, ' ') || 'Transfer'}</Text>
                    <Text style={styles.historyDate}>
                      {t.completed_at ? new Date(t.completed_at).toLocaleDateString() : 'Pending'}
                      {t.sale_price ? ` · $${t.sale_price}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Transfer button */}
          <Button
            title="Transfer Ownership"
            onPress={() => navigation.navigate('InitiateTransfer', { cardId })}
            style={{ marginTop: Spacing.lg }}
          />

          {/* List on eBay — gated until the feature flag flips on.
              Integrations lives only in the Profile stack; if this screen
              is reached from another stack we surface a hint Alert. */}
          <View style={{ marginTop: Spacing.md }}>
            {!ebayEnabled ? (
              <View style={styles.ebayDisabled}>
                <Ionicons name="pricetags-outline" size={16} color={Colors.textMuted} />
                <Text style={styles.ebayDisabledText}>List on eBay</Text>
                <View style={styles.ebayComingSoon}>
                  <Text style={styles.ebayComingSoonText}>Coming Soon</Text>
                </View>
              </View>
            ) : (
              <Button
                title="List on eBay"
                variant="teal"
                onPress={() => {
                  if (!ebayConnected) {
                    try {
                      navigation.navigate('Integrations');
                    } catch (_e) {
                      Alert.alert(
                        'Connect eBay',
                        'Open Profile › Integrations to connect your eBay account first.'
                      );
                    }
                    return;
                  }
                  Alert.alert('Coming Soon', 'Listing flow coming soon.');
                }}
              />
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, flex: 1, textAlign: 'center' },
  qrBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent + '22', borderRadius: Radius.md,
    marginHorizontal: Spacing.base, padding: Spacing.sm, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.accent + '44',
  },
  qrBannerText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium },
  catalogResult: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  catalogResultImg: {
    width: 44, height: 60, borderRadius: 4,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  catalogPlayer: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  catalogSet: { color: Colors.textMuted, fontSize: Typography.sm },
  catalogParallel: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.medium, marginTop: 2 },
  createNewBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent + '40', padding: Spacing.md, marginBottom: Spacing.sm,
  },
  createNewText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium },
  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  toggleBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
  },
  toggleBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  toggleText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  toggleTextActive: { color: Colors.accent, fontWeight: Typography.bold },
  condBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
  },
  condBtnActive: { borderColor: Colors.accent2, backgroundColor: Colors.accent2 + '22' },
  condText: { color: Colors.textMuted, fontSize: Typography.xs },
  condTextActive: { color: Colors.accent2, fontWeight: Typography.semibold },
  statusRow: { flexDirection: 'row', gap: Spacing.sm },
  statusBtn: {
    flex: 1, padding: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center',
  },
  statusBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  statusBtnLabel: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  statusBtnDesc: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  photoAdd: {
    width: 80, height: 80, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddText: { color: Colors.textMuted, fontSize: Typography.xs },
  photoThumb: { position: 'relative' },
  photoRemove: { position: 'absolute', top: -6, right: -6 },
  submitBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base, backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
    flexDirection: 'row',
  },
  cardImageArea: {
    height: 280, backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  cardImage: { width: 200, height: 280 },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  detailPlayer: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.heavy, marginBottom: 2 },
  detailSet: { color: Colors.textMuted, fontSize: Typography.base },
  detailParallel: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium, marginTop: 2 },
  rookieTag: {
    alignSelf: 'flex-start', backgroundColor: Colors.accent + '22',
    borderWidth: 1, borderColor: Colors.accent, borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, marginTop: Spacing.sm,
  },
  rookieTagText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.bold },
  gradeBlock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.md },
  gradeBadge: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  gradeCompany: { color: Colors.bg, fontSize: Typography.xs, fontWeight: Typography.heavy, letterSpacing: 1 },
  gradeNum: { color: Colors.bg, fontSize: Typography.xxl, fontWeight: Typography.heavy, lineHeight: 32 },
  certNum: { color: Colors.textMuted, fontSize: Typography.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  infoLabel: { color: Colors.textMuted, fontSize: Typography.sm },
  infoValue: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  historyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
  historyDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent, marginTop: 5 },
  historyMethod: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium, textTransform: 'capitalize' },
  historyDate: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  ebayDisabled: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.sm, height: 48, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.lg, opacity: 0.8,
  },
  ebayDisabledText: { color: Colors.textMuted, fontSize: Typography.base, fontWeight: Typography.semibold },
  ebayComingSoon: {
    backgroundColor: Colors.accent4 + '22', borderWidth: 1, borderColor: Colors.accent4 + '66',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full,
  },
  ebayComingSoonText: { color: Colors.accent4, fontSize: Typography.xs, fontWeight: Typography.semibold },
});
