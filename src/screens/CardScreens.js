import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Image, Alert, ActivityIndicator, Modal, Dimensions, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as ImageManipulator from 'expo-image-manipulator';
import { showMessage } from 'react-native-flash-message';
// Expo SDK 55 moved the classic readAsStringAsync API to
// expo-file-system/legacy; the default export is now a
// File/Directory class API with no readAsStringAsync. Importing
// from /legacy keeps the base64-conversion flow working without
// pulling in the new class-based surface.
import * as FileSystem from 'expo-file-system/legacy';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi, catalogApi, ebayApi, bindersApi, moveCardToBinder, setCardIntent } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Button, Input, StatusBadge, SectionHeader, LoadingScreen, Divider, VerificationBadge } from '../components/ui';
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
  navigation, cascade, setCascade, cascadeDim, setCascadeDim, onAddNewToSet,
  cascadeQuery, setCascadeQuery, cascadeOrder, cascadeLabel,
  onComplete, onManualFallback, onScan, onCertEntry, scanDebug,
}) => {
  const currentIdx = cascadeOrder.indexOf(cascadeDim);

  // Year is generated locally, not queried from the catalog. The
  // catalog is sparse for vintage years (we don't have 1952 Topps
  // seeded yet) — querying would clip the dropdown to "years that
  // happen to be in the DB," which prevents users from registering
  // a 1962 Mantle or a 1989 Upper Deck Griffey rookie. Sports
  // cards started in the 1880s but tobacco era is rare; 1940 is a
  // reasonable floor that covers Bowman / Topps / Leaf vintage.
  const { data: yearOptions } = useQuery({
    queryKey: ['cascade-years', cascadeQuery],
    enabled: cascadeDim === 'year',
    queryFn: () => {
      const now = new Date().getFullYear();
      const all = [];
      for (let y = now + 1; y >= 1940; y--) all.push(String(y));
      const q = (cascadeQuery || '').trim();
      return q ? all.filter((y) => y.includes(q)) : all;
    },
  });

  const { data: catalogOptions, isLoading: catalogLoading, isFetching: catalogFetching, isError, refetch } = useQuery({
    queryKey: ['catalog-filter', cascadeDim, cascade, cascadeQuery],
    enabled: cascadeDim !== 'year',
    queryFn: () =>
      catalogApi
        .filterValues({ dimension: cascadeDim, ...cascade, q: cascadeQuery || undefined, limit: 200 })
        .then((r) => r.data?.values || []),
    // Keep typeahead snappy but not thrash-y while the user types.
    staleTime: 10_000,
    // Distinct-over-1.7M-rows can take several seconds cold. Fail
    // fast on error so the user sees a retry button instead of
    // waiting through exponential backoff thinking nothing is
    // happening. Keep previous data visible during refetch so the
    // UI doesn't flash empty between steps.
    retry: 1,
    keepPreviousData: true,
  });

  const options = cascadeDim === 'year' ? yearOptions : catalogOptions;
  const isLoading = cascadeDim === 'year' ? false : catalogLoading;
  const isFetching = cascadeDim === 'year' ? false : catalogFetching;

  // Enriched rows for the parallel step — includes print_run so
  // the picker can show "Gold /10" instead of just "Gold". Only
  // fires when the user actually reaches the parallel step.
  const { data: parallelRows } = useQuery({
    queryKey: ['catalog-parallel-rows', cascade, cascadeQuery],
    enabled: cascadeDim === 'parallel',
    queryFn: () =>
      catalogApi.search({
        sport: cascade.sport,
        year: cascade.year,
        manufacturer: cascade.manufacturer,
        set_name: cascade.set_name,
        player_name: cascade.player_name,
        q: cascadeQuery || undefined,
        limit: 50,
      }).then((r) => {
        const rows = r.data?.cards || [];
        // Keep only rows matching the user's subset + card_number
        // picks so we don't list unrelated parallels of the same
        // player from other inserts. Both fields are optional in
        // the cascade so null === "don't filter".
        return rows.filter((c) =>
          (!cascade.subset_name || c.subset_name === cascade.subset_name) &&
          (!cascade.card_number || (c.card_number || '') === cascade.card_number)
        );
      }),
    staleTime: 10_000,
  });

  const OPTIONAL_DIMS = new Set(['subset_name', 'parallel']);
  // Identity dims define WHICH card this is. Auto-advancing past
  // them (when the catalog has only one entry seeded for the set)
  // hides the "this is a different player" choice from the user
  // and silently merges new cards into the existing catalog row.
  // Always require an explicit tap or typed entry on these.
  const IDENTITY_DIMS = new Set(['player_name', 'card_number']);

  // Auto-advance behavior:
  //  - Exactly one option (and no active typeahead) → pick it,
  //    EXCEPT on identity dims (player_name, card_number) where
  //    we always require explicit confirmation so the user can
  //    add a new card to a sparsely-seeded set.
  //  - Zero options on an optional dim (subset / parallel) →
  //    skip silently. Lots of catalog rows have null subset or
  //    null parallel and the user shouldn't land on a dead-end
  //    empty list.
  //  - Zero options on a required dim → stay; user sees the
  //    "enter manually" fallback.
  React.useEffect(() => {
    if (cascadeQuery) return;
    if (!options) return;

    if (options.length === 1 && !IDENTITY_DIMS.has(cascadeDim)) {
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
        {onScan ? (
          <TouchableOpacity onPress={onScan} accessibilityLabel="Scan card">
            <Ionicons name="scan-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      {/* Breadcrumbs of what's been picked so far. */}
      {picked.length > 0 ? (
        <View style={{ paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm }}>
          <Text style={{ fontSize: 11, color: Colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>
            {picked.map((d) => cascade[d]).join(' · ')}
          </Text>
        </View>
      ) : null}

      {scanDebug ? (
        <View style={{ marginHorizontal: Spacing.base, marginBottom: Spacing.sm, padding: 10, backgroundColor: '#ff9500', borderRadius: 8 }}>
          <Text style={{ fontSize: 12, color: '#000', fontWeight: '700' }}>SCAN: {scanDebug}</Text>
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
        ListHeaderComponent={
          isFetching && (options?.length ?? 0) > 0 ? (
            <Text style={{ color: Colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: Spacing.xs }}>
              Updating…
            </Text>
          ) : null
        }
        ListFooterComponent={
          // On identity dims (player / card #), always offer an
          // explicit "add new" escape so a user adding a second
          // card to a sparsely-seeded set isn't trapped picking
          // the one existing entry. Distinct from onManualFallback
          // (the generic "this card isn't in the catalog") because
          // we have to CLEAR the current identity dim — otherwise
          // the manual form pre-fills with the lingering cascade
          // value (e.g. last picked McCaffrey) and the user creates
          // a duplicate of the existing card.
          IDENTITY_DIMS.has(cascadeDim) && (options?.length ?? 0) > 0 ? (
            <TouchableOpacity
              onPress={() => onAddNewToSet?.(cascadeDim)}
              style={{
                paddingVertical: Spacing.md,
                paddingHorizontal: Spacing.md,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: Colors.accent,
                backgroundColor: 'transparent',
                marginTop: Spacing.sm,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: Spacing.sm,
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color={Colors.accent} />
              <Text style={{ color: Colors.accent, fontSize: 14, fontWeight: '600' }}>
                Add a new {cascadeLabel[cascadeDim].toLowerCase()} to this set
              </Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          isLoading || isFetching ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.sm }}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
                Loading {cascadeLabel[cascadeDim].toLowerCase()} options…
              </Text>
            </View>
          ) : isError ? (
            <View style={{ paddingVertical: Spacing.xl, alignItems: 'center', gap: Spacing.md }}>
              <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
                Couldn't load options. Check your connection.
              </Text>
              <TouchableOpacity onPress={() => refetch()}>
                <Text style={{ color: Colors.accent, fontWeight: '600' }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
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
        renderItem={({ item }) => {
          // On the parallel step, look up the enriched catalog row
          // for this parallel name so we can surface the print run
          // inline ("Gold /10" reads very differently from "Gold").
          const enriched = cascadeDim === 'parallel' && parallelRows
            ? parallelRows.find((r) => (r.parallel || '') === String(item))
            : null;
          const printRunLabel = enriched
            ? (enriched.is_one_of_one ? '1/1'
               : enriched.print_run ? `/${enriched.print_run}`
               : 'Unlimited')
            : null;
          return (
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
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
                <Text style={{ color: Colors.text, fontSize: 15 }}>{String(item)}</Text>
                {printRunLabel ? (
                  <Text style={{ color: Colors.textMuted, fontSize: 13, fontWeight: '500' }}>
                    {printRunLabel}
                  </Text>
                ) : null}
                {enriched?.is_autograph ? (
                  <Text style={{ color: '#9B59B6', fontSize: 11, fontWeight: '700' }}>AUTO</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          );
        }}
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
        {onCertEntry ? (
          <TouchableOpacity onPress={onCertEntry}>
            <Text style={{ textAlign: 'center', color: Colors.accent, fontSize: 13, fontWeight: Typography.semibold }}>
              Have a graded slab? Enter the cert number →
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
  // Optional incoming binderId — pre-selects the destination binder
  // when the user came from BinderEditor / BinderList "+ Add card".
  const incomingBinderId = route.params?.binderId || null;
  const queryClient = useQueryClient();
  // Pull the user once so the scan handler can gate-check Pro
  // status BEFORE asking for camera permission. Free users used
  // to walk through camera permission + photo capture + upload
  // before getting a 'Pro feature' rejection — that's a tease.
  // Now we block at the entry point with a clean upgrade prompt.
  const currentUser = useAuthStore((s) => s.user);
  // Selected destination binder. null = let the server auto-file
  // into the user's Default binder. Binder picker UI below the
  // catalog/parallel selection lets the user override.
  const [pickedBinderId, setPickedBinderId] = React.useState(incomingBinderId);
  // Pull the user's binders so the picker chips have real names.
  const { data: bindersData } = useQuery({
    queryKey: ['my-binders'],
    queryFn: () => bindersApi.list().then((r) => r.data),
  });
  const myBinders = bindersData?.binders || [];

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
  // Cert-lookup local state — only matters while step === 'cert_entry'.
  const [certForm, setCertForm] = useState({ company: 'psa', cert_number: '' });
  const [certLookupBusy, setCertLookupBusy] = useState(false);
  const [certLookupResult, setCertLookupResult] = useState(null); // { already_claimed, slab, catalog_match, provider_error }

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
  const [scanDebug, setScanDebug] = useState('');
  // Two-step scan: back first (text), then optional front (image).
  // scanReview holds OCR result + photo URIs so the user can review
  // and edit fields before committing to the cascade or manual entry.
  const [scanReview, setScanReview] = useState(null);
  // { player_name, year, card_number, candidates: [], backUri, frontUri }

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
    public_notes: '',
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

  // Shared camera+resize helper. Returns { uri, b64 } or null on
  // cancel/no-asset. Used by both the back-text scan and the
  // optional front-image follow-up.
  const captureAndResize = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Enable camera to scan a card.');
      return null;
    }
    // allowsEditing surfaces the OS-native crop UI immediately
    // after capture. Crucial for the back-of-card scan: the user
    // can trim the table edge / fingers / glare bars before the
    // photo hits Claude vision, which dramatically improves the
    // OCR hit rate on year + card number.
    const pick = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      base64: true,
      allowsEditing: true,
    });
    if (!pick.assets?.length) return null;
    const asset = pick.assets[0];
    let b64 = asset.base64;
    let uri = asset.uri;
    try {
      const resized = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      b64 = resized.base64;
      uri = resized.uri;
    } catch {
      // resize failed — fall back to original
    }
    return { uri, b64 };
  };

  // Back-of-card scan via Claude vision. Sends the photo to
  // /scan-vision which returns structured metadata directly (no
  // brittle regex distillation). Falls back to /ocr-suggest if
  // ANTHROPIC_API_KEY isn't configured on the server.
  const runBackScan = async () => {
    setScanDebug('photo OK • analyzing with Claude…');
    const captured = await captureAndResize();
    if (!captured) {
      setScanDebug('cancelled');
      return;
    }
    try {
      const res = await catalogApi.scanVision(`data:image/jpeg;base64,${captured.b64}`);
      const fields = res.data?.fields || {};
      const cands = res.data?.candidates || [];
      setScanReview({
        backUri: captured.uri,
        frontUri: null,
        player_name: fields.player_name || '',
        year: fields.year ? String(fields.year) : '',
        card_number: fields.card_number ? String(fields.card_number) : '',
        set_name: fields.set_name || '',
        manufacturer: fields.manufacturer || '',
        team: fields.team || '',
        sport: fields.sport || '',
        is_rookie: !!fields.is_rookie,
        is_autograph: !!fields.is_autograph,
        parallel: fields.parallel || '',
        parallel_evidence: fields.parallel_evidence || '',
        print_run: fields.print_run || null,
        serial_number: fields.serial_number || '',
        candidates: cands,
        confidence: fields.confidence ?? 0,
      });
      setStep('scan_review');
      setScanDebug(`vision ok • ${cands.length} cands • ${fields.player_name || '?'} ${fields.year || '?'} #${fields.card_number || '?'}`);
    } catch (err) {
      const code = err?.response?.data?.code;
      const errMsg = err?.response?.data?.error || err?.message || 'unknown';
      const status = err?.response?.status;
      setScanDebug(`SCAN FAILED • status=${status || 'NONE'} • ${errMsg}`);
      // If Claude isn't configured yet, fall back to legacy OCR.
      if (code === 'vision_not_configured') {
        try {
          const fallback = await catalogApi.ocrSuggest(`data:image/jpeg;base64,${captured.b64}`);
          const cands = fallback.data?.candidates || [];
          const distilled = fallback.data?.distilled || null;
          const bestPlayer = (distilled?.playerCandidates || [])[0] || '';
          setScanReview({
            backUri: captured.uri,
            frontUri: null,
            player_name: bestPlayer,
            year: distilled?.year ? String(distilled.year) : '',
            card_number: distilled?.cardNumber || '',
            set_name: '',
            manufacturer: '',
            candidates: cands,
          });
          setStep('scan_review');
          return;
        } catch { /* fall through to error alert */ }
      }
      Alert.alert('Scan failed', `${errMsg}\n\nYou can fill in the card details manually.`, [
        { text: 'Manual entry', onPress: () => setStep('manual_entry') },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  // Optional second photo: front of card, used as the listing image.
  // Doesn't go through OCR — just gets stored alongside.
  const runFrontScan = async () => {
    const captured = await captureAndResize();
    if (!captured) return;
    setScanReview((s) => (s ? { ...s, frontUri: captured.uri } : s));
  };

  // When committing scan results into the photos array, add the FRONT
  // first (so it becomes the cover at index 0) then the BACK. Both
  // are saved when both exist; if only one exists, that one gets
  // added. The user can reorder later via the photo grid (move-up /
  // make-cover buttons in the rendered photos block below).
  const commitScanPhotos = () => {
    const additions = [];
    if (scanReview?.frontUri) additions.push(scanReview.frontUri);
    if (scanReview?.backUri)  additions.push(scanReview.backUri);
    if (!additions.length) return;
    setPhotos((p) => [...p, ...additions]);
    setPhotoSources((src) => [...src, ...additions.map(() => 'camera')]);
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
    // allowsEditing surfaces the OS-native crop + rotate UI. We
    // intentionally DON'T set `aspect` — locking it to [3, 4] gave
    // the iOS picker only one drag direction (you could shrink the
    // frame but not change its proportions). Free-form crop gives 4
    // corner + 4 edge handles so the user can pull from any side.
    // Most cards will still end up roughly portrait — the default
    // capture orientation handles that — but oddball items (sticker
    // books, panoramic cards, autograph cuts) crop cleanly now.
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      cameraType: ImagePicker.CameraType.back,
      allowsEditing: true,
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
      allowsEditing: true,
      // No aspect lock — see takePhoto for the rationale (free-form
      // crop gives 8 handles instead of 1).
      // allowsMultipleSelection can't combine with allowsEditing —
      // the OS only gives a crop UI for single picks. Stick with
      // single-pick here so the edit UI is available; power users
      // who want bulk can add via camera or repeat the picker.
    });
    if (!result.canceled && result.assets?.length) {
      setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
      setPhotoSources((s) => [...s, ...result.assets.map(() => 'gallery')]);
    }
  };

  const recordVideo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings → Card Shop.');
      return;
    }
    // Short-video path for card inspection. 15s cap keeps the
    // base64 payload and Cloudinary storage reasonable; most spins
    // take 5-8s. allowsEditing surfaces the OS trim UI.
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      videoMaxDuration: 15,
      quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) {
      setVideoUri(result.assets[0].uri);
    }
  };
  const [videoUri, setVideoUri] = useState(null);

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

  // ========== Cert-lookup handler for graded slabs ==========
  // Walks: validate → POST /cert-lookup → branch on result:
  //   already_claimed   → surface warning, keep user on form
  //   slab + match      → pre-fill form + grading info, jump to details
  //   slab, no match    → pre-fill manual form, drop user there
  //   no slab           → pre-fill manual with just cert+company
  const runCertLookup = async () => {
    const cert = certForm.cert_number.trim();
    if (!cert) return;
    setCertLookupBusy(true);
    setCertLookupResult(null);
    try {
      const res = await catalogApi.certLookup({
        company: certForm.company,
        cert_number: cert,
      });
      const payload = res.data || {};
      setCertLookupResult(payload);
      // Stay on the cert_entry screen — the preview block
      // renders below the form so the user can confirm this is
      // their card before we proceed. Duplicate-claim warning
      // also shows there; any next-step routing happens via the
      // "Confirm & continue" button in the preview.
    } catch (err) {
      Alert.alert('Lookup failed', err?.response?.data?.error || err?.message || 'Try again.');
    } finally {
      setCertLookupBusy(false);
    }
  };

  // Invoked from the preview block's "Confirm & continue" button.
  // Fans out to the same four outcomes runCertLookup used to do
  // inline — now separated so the user decides to proceed.
  const confirmCertLookup = () => {
    const payload = certLookupResult;
    const cert = certForm.cert_number.trim();
    if (!payload || payload.already_claimed) return;

    // Lock grading fields on the owned-card form. If PSA returned
    // a front image, also pre-stage it as the first registered
    // photo so the user isn't starting from scratch.
    setForm((f) => ({
      ...f,
      grading_company: certForm.company,
      cert_number: cert,
      grade: payload.slab?.grade != null ? String(payload.slab.grade) : f.grade,
    }));
    if (payload.slab?.front_image_url) {
      setPhotos((p) => [...p, payload.slab.front_image_url]);
      setPhotoSources((s) => [...s, 'grading_service']);
    }
    if (payload.slab?.back_image_url) {
      setPhotos((p) => [...p, payload.slab.back_image_url]);
      setPhotoSources((s) => [...s, 'grading_service']);
    }

    if (payload.slab && payload.catalog_match) {
      setSelectedCatalog(payload.catalog_match);
      setStep('details');
      return;
    }
    setManualForm((f) => ({
      ...f,
      sport:          payload.slab?.sport || f.sport,
      player_name:    payload.slab?.player_name || f.player_name,
      year:           payload.slab?.year ? String(payload.slab.year) : f.year,
      manufacturer:   payload.slab?.brand || payload.slab?.set_name || f.manufacturer,
      set_name:       payload.slab?.set_name || f.set_name,
      card_number:    payload.slab?.card_number || f.card_number,
    }));
    setStep('manual_entry');
  };

  const goManualEntry = () => {
    // Pre-populate player_name from whatever the user typed in search.
    if (catalogSearch && !manualForm.player_name) {
      setManualForm((f) => ({ ...f, player_name: catalogSearch.trim() }));
    }
    setStep('manual_entry');
  };

  const registerMutation = useMutation({
    mutationFn: async () => {
      // Convert each local file:// photo into a base64 data URL so
      // the API can upload it to Cloudinary. file:// URIs never
      // leave the device otherwise — they'd render on this phone
      // briefly (until cache clears) and be invisible everywhere
      // else. Kept in order so the first photo stays the primary.
      // Track per-photo failures so we can surface a visible error
      // instead of silently dropping them to filter(Boolean).
      const photoFailures = [];
      const base64Photos = await Promise.all(
        photos.map(async (uri, i) => {
          if (!uri) return null;
          if (/^https?:\/\//i.test(uri)) return uri; // already hosted
          try {
            const b64 = await FileSystem.readAsStringAsync(uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            return `data:image/jpeg;base64,${b64}`;
          } catch (err) {
            photoFailures.push(`#${i + 1}: ${err?.message || 'read failed'}`);
            return null;
          }
        })
      );
      const uploaded = base64Photos.filter(Boolean);
      if (photoFailures.length) {
        Alert.alert(
          `${photoFailures.length} photo(s) failed to read`,
          `${uploaded.length} of ${photos.length} will be uploaded.\n\n${photoFailures.join('\n')}`,
        );
      }
      // Encode the optional video the same way. Videos are bigger
      // (typically 2-6 MB) so this can take a second on slower
      // devices — the 90s axios timeout set on register covers it.
      let videoDataUrl;
      if (videoUri) {
        try {
          const b64 = await FileSystem.readAsStringAsync(videoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          videoDataUrl = `data:video/mp4;base64,${b64}`;
        } catch (err) {
          Alert.alert('Video read failed', err?.message || 'Could not read the recorded video.');
        }
      }
      return cardsApi.register({
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
        public_notes: form.public_notes || undefined,
        photo_urls: uploaded,
        video_url: videoDataUrl || undefined,
        binder_id: pickedBinderId || undefined,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      navigation.replace('CardDetail', { cardId: res.data?.id });
    },
    onError: (err) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to register card');
    },
  });

  // Condition definitions mirror eBay's Trading Card grading
  // language so listings here and listings there read the same —
  // collectors comparing a /lets_talk card on Card Shop to a BIN
  // on eBay shouldn't have to translate between scales. Tapping a
  // condition chip opens the long-form description below.
  const CONDITIONS = [
    { key: 'gem_mint',  label: 'Gem Mint',   ebay: 'Graded — Gem Mint',
      desc: 'PSA/BGS/SGC 10 equivalent. Perfect centering, sharp corners, no printing defects visible under magnification. Raw Gem Mint is rare and should normally be graded.' },
    { key: 'mint',      label: 'Mint',       ebay: 'Mint or Mint 9',
      desc: 'PSA 9 equivalent. Near-perfect centering (55/45 or better), sharp corners, clean surface. One very minor flaw acceptable (e.g. a pinpoint print speck).' },
    { key: 'near_mint', label: 'Near Mint',  ebay: 'Near Mint–Mint or NM 8',
      desc: 'PSA 7-8 equivalent. Slight off-centering (60/40), minor corner wear, light surface scratches visible at an angle. No creases.' },
    { key: 'excellent', label: 'Excellent',  ebay: 'Excellent',
      desc: 'PSA 5-6. Mild rounding on one or two corners, minor edge wear, fuzz visible. Image still sharp, no creases or major surface flaws.' },
    { key: 'very_good', label: 'Very Good',  ebay: 'Very Good',
      desc: 'PSA 3-4. Noticeable corner wear and edge fuzz, small surface scratches or light gloss loss. May have a single very light crease.' },
    { key: 'good',      label: 'Good',       ebay: 'Good',
      desc: 'PSA 2. Rounded corners, frayed edges, visible creases, surface scratches or minor stains. Image intact and clearly identifiable.' },
    { key: 'fair',      label: 'Fair',       ebay: 'Fair',
      desc: 'PSA 1.5. Heavy wear on all edges/corners, multiple creases, possible minor tears at the edge. Image recognizable.' },
    { key: 'poor',      label: 'Poor',       ebay: 'Poor',
      desc: 'PSA 1. Major damage — tears, water damage, heavy staining, missing paper, writing, or pin-holes. Still the correct card but barely presentable.' },
  ];
  const [conditionDescFor, setConditionDescFor] = useState(null);
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

  // Scan review — user has photographed the back of a card and
  // OCR has run. Show extracted fields editable, top catalog
  // candidates, optional front photo capture, then route to the
  // chosen path (catalog match / cascade / manual entry).
  if (step === 'scan_review' && scanReview) {
    const updateField = (key) => (val) =>
      setScanReview((s) => (s ? { ...s, [key]: val } : s));
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => { setScanReview(null); setStep('cascade'); }}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review scan</Text>
          <View style={{ width: 22 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md }}>
          <Text style={{ color: Colors.textMuted, fontSize: Typography.sm }}>
            We pulled these fields from the back of the card. Edit anything that's wrong before continuing.
          </Text>

          {/* Back photo thumbnail */}
          {scanReview.backUri ? (
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Image source={{ uri: scanReview.backUri }} style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: Colors.surface2 }} />
              {scanReview.frontUri ? (
                <Image source={{ uri: scanReview.frontUri }} style={{ width: 80, height: 110, borderRadius: 8, backgroundColor: Colors.surface2 }} />
              ) : (
                <TouchableOpacity
                  onPress={runFrontScan}
                  style={{
                    width: 80, height: 110, borderRadius: 8,
                    backgroundColor: Colors.surface2,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: Colors.accent, borderStyle: 'dashed',
                  }}
                >
                  <Ionicons name="camera" size={24} color={Colors.accent} />
                  <Text style={{ color: Colors.accent, fontSize: 11, marginTop: 4 }}>Front photo</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          <Input label="Player" value={scanReview.player_name} onChangeText={updateField('player_name')} />
          <Input label="Year" value={scanReview.year} onChangeText={updateField('year')} keyboardType="number-pad" />
          <Input label="Card #" value={scanReview.card_number} onChangeText={updateField('card_number')} />
          <Input label="Set name (optional)" value={scanReview.set_name} onChangeText={updateField('set_name')} />
          <Input label="Manufacturer (optional)" value={scanReview.manufacturer} onChangeText={updateField('manufacturer')} />
          <Input label="Parallel / variant" value={scanReview.parallel} onChangeText={updateField('parallel')} />
          {scanReview.parallel_evidence ? (
            <Text style={{ color: Colors.textMuted, fontSize: Typography.sm, marginTop: -8 }}>
              ↑ {scanReview.parallel_evidence}
            </Text>
          ) : null}
          {/* Always show serial-number + print-run inputs — OCR
              often misses the "/N" stamp on numbered cards, and
              hiding the field forced users to navigate back to
              find it. Both fields are optional. */}
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Serial #"
                value={scanReview.serial_number || ''}
                onChangeText={updateField('serial_number')}
                keyboardType="number-pad"
                placeholder={scanReview.print_run ? '?' : 'optional'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Print run (/N)"
                value={scanReview.print_run ? String(scanReview.print_run) : ''}
                onChangeText={updateField('print_run')}
                keyboardType="number-pad"
                placeholder="optional"
              />
            </View>
          </View>

          {/* Catalog candidates from OCR — let the user pick if any matched */}
          {scanReview.candidates?.length ? (
            <View style={{ gap: Spacing.xs }}>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.sm, textTransform: 'uppercase', letterSpacing: 1 }}>
                Catalog matches
              </Text>
              {scanReview.candidates.slice(0, 5).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => {
                    commitScanPhotos();
                    setSelectedCatalog(c);
                    setStep('serial');
                  }}
                  style={{
                    padding: Spacing.sm,
                    backgroundColor: Colors.surface2,
                    borderRadius: Radius.md,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.text, fontWeight: Typography.semibold }}>
                    {c.player_name} {c.year} {c.set_name}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: Typography.sm }}>
                    {c.manufacturer ? `${c.manufacturer} · ` : ''}#{c.card_number || '?'} · {Math.round((c.confidence || 0) * 100)}% match
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={{ padding: Spacing.base, gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border }}>
          <Button
            title="Continue with these values"
            onPress={async () => {
              commitScanPhotos();
              const newCascade = {
                sport: scanReview.sport || cascade.sport,
                year: scanReview.year ? Number(scanReview.year) || scanReview.year : cascade.year,
                manufacturer: scanReview.manufacturer || cascade.manufacturer,
                set_name: scanReview.set_name || cascade.set_name,
                subset_name: cascade.subset_name,
                player_name: scanReview.player_name || cascade.player_name,
                card_number: scanReview.card_number || cascade.card_number,
                parallel: scanReview.parallel || cascade.parallel,
              };
              setCascade(newCascade);
              // Carry serial_number + print_run forward into the
              // grading/details form so the serial step pre-fills
              // (or skips entirely if already complete) instead of
              // making the user enter the same numbers twice.
              if (scanReview.serial_number || scanReview.print_run) {
                setForm((f) => ({
                  ...f,
                  serial_number: scanReview.serial_number || f.serial_number,
                  print_run: scanReview.print_run ? String(scanReview.print_run) : f.print_run,
                }));
              }
              setScanReview(null);
              // If we have the discriminating fields (player + year +
              // card #), search the catalog directly and skip the
              // cascade entirely. Cascade is only needed when the
              // user has to pick a missing dimension.
              // Local capture — scanReview gets cleared above, but we
              // still want to know if the user already typed in their
              // serial number so we can skip re-asking on the serial
              // step.
              const alreadyHasSerial = !!scanReview.serial_number;
              if (newCascade.player_name && newCascade.year && newCascade.card_number) {
                try {
                  const r = await catalogApi.search({
                    sport: newCascade.sport,
                    year: newCascade.year,
                    manufacturer: newCascade.manufacturer,
                    set_name: newCascade.set_name,
                    player_name: newCascade.player_name,
                    parallel: newCascade.parallel,
                    limit: 5,
                  });
                  const hits = r.data?.cards || [];
                  const exact = hits.find((c) =>
                    String(c.card_number || '') === String(newCascade.card_number || ''),
                  );
                  if (exact) {
                    setSelectedCatalog(exact);
                    setStep(alreadyHasSerial ? 'details' : 'serial');
                    return;
                  }
                } catch { /* fall through to manual entry */ }
                // Catalog miss → manual entry pre-filled. We have
                // enough data that the cascade picker would be
                // empty-handed at every step.
                setManualForm((f) => ({
                  ...f,
                  sport: newCascade.sport || f.sport,
                  year: newCascade.year ? String(newCascade.year) : f.year,
                  manufacturer: newCascade.manufacturer || f.manufacturer,
                  set_name: newCascade.set_name || f.set_name,
                  player_name: newCascade.player_name || f.player_name,
                  card_number: newCascade.card_number || f.card_number,
                  parallel: newCascade.parallel || f.parallel,
                  team: scanReview.team || f.team,
                  is_rookie: scanReview.is_rookie || f.is_rookie,
                  is_autograph: scanReview.is_autograph || f.is_autograph,
                  print_run: scanReview.print_run ? String(scanReview.print_run) : f.print_run,
                }));
                setStep('manual_entry');
                return;
              }
              // Missing one of the key fields — fall back to cascade
              // and land on the first actually-missing required dim.
              const required = ['sport','year','manufacturer','set_name','player_name','card_number'];
              const firstMissing = required.find((d) => !newCascade[d]) || 'parallel';
              setCascadeDim(firstMissing);
              setStep('cascade');
            }}
          />
          <Button
            title="Skip catalog — manual entry"
            variant="secondary"
            onPress={() => {
              commitScanPhotos();
              setManualForm((f) => ({
                ...f,
                year: scanReview.year || f.year,
                player_name: scanReview.player_name || f.player_name,
                card_number: scanReview.card_number || f.card_number,
                set_name: scanReview.set_name || f.set_name,
                manufacturer: scanReview.manufacturer || f.manufacturer,
              }));
              setStep('manual_entry');
              setScanReview(null);
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // --- Cascade step: sport → year → mfr → set → subset → player → card# → parallel ---
  if (step === 'cascade') {
    return (
      <CascadePicker
        scanDebug={scanDebug}
        navigation={navigation}
        cascade={cascade}
        setCascade={setCascade}
        cascadeDim={cascadeDim}
        setCascadeDim={setCascadeDim}
        cascadeQuery={cascadeQuery}
        setCascadeQuery={setCascadeQuery}
        cascadeOrder={CASCADE_ORDER}
        cascadeLabel={CASCADE_LABEL}
        onScan={async () => {
          // Pro gate FIRST — before camera permission, before
          // taking the photo, before uploading.
          const tier = currentUser?.subscription_tier;
          const isPro = tier === 'collector_pro' || tier === 'store_pro' || currentUser?.is_admin;
          if (!isPro) {
            Alert.alert(
              'Card scanning is a Pro feature',
              'Upgrade to Card Shop Pro to scan cards with the camera. You can still register cards manually using the cascade picker.',
              [
                { text: 'Maybe later', style: 'cancel' },
                { text: 'Upgrade', onPress: () => navigation.navigate('Profile', { screen: 'Upgrade' }) },
              ],
            );
            return;
          }
          // Two-step flow: tell the user upfront we want the BACK
          // first. Backs have machine-printed metadata (year,
          // card #, set name, copyright) that OCR reads cleanly;
          // fronts have stylized graphics that confuse Vision.
          // After OCR, we land on a review screen where the user
          // can confirm/edit fields and optionally add a front
          // photo for the listing image.
          Alert.alert(
            'Scan the BACK of the card',
            'Card backs have the printed text (year, set, card #) we use to identify the card. Hold the back flat and well-lit.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Take photo', onPress: () => runBackScan() },
            ],
          );
        }}
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
              // Route into the serial-number step when the resolved
              // card is numbered (/10, /25, …). Chain-of-custody
              // wants the specific copy recorded on the owned_card.
              setStep('serial');
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
        onManualFallback={() => {
          // Generic "I can't find this card anywhere in the catalog"
          // path — pre-fill manual entry with everything the user
          // picked so far, including the current dim if any. The
          // user is bailing out of cascade, not adding a sibling.
          setManualForm((f) => ({
            ...f,
            sport: cascade.sport || f.sport,
            year: cascade.year ? String(cascade.year) : f.year,
            manufacturer: cascade.manufacturer || f.manufacturer || '',
            set_name: cascade.set_name || f.set_name || '',
            subset_name: cascade.subset_name || f.subset_name || '',
            player_name: cascade.player_name || f.player_name || '',
            card_number: cascade.card_number || f.card_number || '',
            parallel: cascade.parallel || f.parallel || '',
          }));
          setStep('manual_entry');
        }}
        onAddNewToSet={(currentDim) => {
          // "+ Add a new player/card # to this set" — user is on an
          // identity dim and wants to enter a NEW value, not pick
          // from the existing options. Clear the current dim and
          // every dim after it so a previously-picked McCaffrey
          // doesn't bleed through and cause the manual entry to
          // upsert into the existing catalog row.
          const idx = CASCADE_ORDER.indexOf(currentDim);
          const cleared = { ...cascade };
          for (let i = idx; i < CASCADE_ORDER.length; i++) {
            delete cleared[CASCADE_ORDER[i]];
          }
          setManualForm((f) => ({
            ...f,
            sport: cleared.sport || f.sport,
            year: cleared.year ? String(cleared.year) : f.year,
            manufacturer: cleared.manufacturer || '',
            set_name: cleared.set_name || '',
            subset_name: cleared.subset_name || '',
            // The dim the user is overriding (and everything after
            // it) gets blanked so they enter the new value fresh.
            player_name: cleared.player_name || '',
            card_number: cleared.card_number || '',
            parallel: cleared.parallel || '',
          }));
          setStep('manual_entry');
        }}
        onCertEntry={() => setStep('cert_entry')}
      />
    );
  }

  if (step === 'cert_entry') {
    const claimed = certLookupResult?.already_claimed;
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('cascade')}>
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Graded Card</Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md }}>
          <Text style={{ color: Colors.textMuted, fontSize: 13, lineHeight: 18 }}>
            Enter the cert number off the slab label. We'll pull the card info when
            possible and check that nobody else on Card Shop has already claimed
            this exact slab.
          </Text>

          <View>
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
              Grading Company
            </Text>
            <View style={{ flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' }}>
              {['psa', 'bgs', 'sgc', 'csg', 'hga'].map((g) => {
                const autoFill = g === 'psa' || g === 'bgs';
                return (
                  <TouchableOpacity
                    key={g}
                    onPress={() => setCertForm((f) => ({ ...f, company: g }))}
                    style={[
                      styles.toggleBtn,
                      certForm.company === g && styles.toggleBtnActive,
                      { flexDirection: 'row', alignItems: 'center', gap: 6 },
                    ]}
                  >
                    <Text style={[
                      styles.toggleText,
                      certForm.company === g && styles.toggleTextActive,
                    ]}>{g.toUpperCase()}</Text>
                    {autoFill ? (
                      <View style={{
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 4,
                        backgroundColor: Colors.accent + '22',
                        borderWidth: 1,
                        borderColor: Colors.accent + '55',
                      }}>
                        <Text style={{ color: Colors.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                          AUTO
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 6 }}>
              AUTO = we pull the card data from the cert number for you
            </Text>
          </View>

          <Input
            label="Cert Number"
            value={certForm.cert_number}
            onChangeText={(v) => setCertForm((f) => ({ ...f, cert_number: v }))}
            placeholder="e.g. 12345678"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {certForm.company && !['psa', 'bgs'].includes(certForm.company) ? (
            <View style={{ padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ color: Colors.textMuted, fontSize: 13, lineHeight: 18 }}>
                Auto-fill is only live for PSA and BGS right now. For {certForm.company.toUpperCase()} cards,
                we'll still check that the cert isn't already claimed by another collector
                and you can fill in the rest manually.
              </Text>
            </View>
          ) : null}

          <Button
            title="Look up cert"
            onPress={runCertLookup}
            loading={certLookupBusy}
          />

          {claimed ? (
            <View style={{ padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.error + '22', borderWidth: 1, borderColor: Colors.error }}>
              <Text style={{ color: Colors.error, fontWeight: Typography.semibold, marginBottom: 4 }}>
                ⚠ Already claimed on Card Shop
              </Text>
              <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 18 }}>
                <Text style={{ fontWeight: Typography.semibold }}>@{claimed.username}</Text>
                {' registered this exact slab '}
                {claimed.claimed_at ? `on ${new Date(claimed.claimed_at).toLocaleDateString()}` : 'previously'}.
                {'\n\n'}
                If you believe this is a mistake or fraud, tap Report to open a ticket.
                A cert number is globally unique — two people can't own the same slab.
              </Text>
            </View>
          ) : null}

          {certLookupResult?.provider_error && !certLookupResult?.already_claimed ? (
            <Text style={{ color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>
              {certLookupResult.provider_error === 'invalid_cert'
                ? 'That cert number format didn\u2019t look right to PSA. Double-check the slab label.'
                : certLookupResult.provider_error === 'not_found'
                  ? 'PSA has no record of that cert. You can still continue manually.'
                  : 'Could not reach the grading service just now. You can still continue manually.'}
            </Text>
          ) : null}

          {/* Preview block — renders after a successful lookup so
              the user confirms this is actually their card before
              we proceed with registration. Shows the PSA scans
              (if available) and a summary of the slab metadata. */}
          {certLookupResult && !certLookupResult.already_claimed && certLookupResult.slab ? (
            <View style={{ marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.surface2 }}>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Match found
              </Text>
              <View style={{ flexDirection: 'row', gap: Spacing.md }}>
                {certLookupResult.slab.front_image_url ? (
                  <Image
                    source={{ uri: certLookupResult.slab.front_image_url }}
                    style={{ width: 80, height: 112, borderRadius: 6, backgroundColor: Colors.surface3 }}
                    resizeMode="contain"
                  />
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: Colors.text, fontSize: 16, fontWeight: Typography.semibold }}>
                    {certLookupResult.slab.player_name || 'Unknown player'}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 13, marginTop: 2 }}>
                    {[certLookupResult.slab.year, certLookupResult.slab.set_name].filter(Boolean).join(' ')}
                  </Text>
                  {certLookupResult.slab.card_number ? (
                    <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
                      #{certLookupResult.slab.card_number}
                    </Text>
                  ) : null}
                  <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: Typography.semibold, marginTop: 4 }}>
                    {certForm.company.toUpperCase()} {certLookupResult.slab.grade_description}
                  </Text>
                  {certLookupResult.slab.population_total ? (
                    <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 2 }}>
                      Pop {certLookupResult.slab.population_total} · {certLookupResult.slab.population_higher || 0} higher
                    </Text>
                  ) : null}
                </View>
              </View>

              {certLookupResult.catalog_match ? (
                <Text style={{ color: Colors.success, fontSize: 12, marginTop: 10 }}>
                  ✓ Matched to an existing catalog entry.
                </Text>
              ) : (
                <Text style={{ color: Colors.textMuted, fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>
                  No catalog match — you'll confirm the card details on the next screen.
                </Text>
              )}

              <Button
                title="Confirm & continue"
                onPress={confirmCertLookup}
                style={{ marginTop: 14 }}
              />
            </View>
          ) : null}

          {/* No-slab path: lookup returned nothing usable but the
              cert isn't claimed. Offer a "continue manually"
              shortcut so non-PSA certs still flow. */}
          {certLookupResult && !certLookupResult.already_claimed && !certLookupResult.slab ? (
            <Button
              title="Continue to manual entry"
              variant="secondary"
              onPress={() => {
                setForm((f) => ({
                  ...f,
                  grading_company: certForm.company,
                  cert_number: certForm.cert_number.trim(),
                }));
                setStep('manual_entry');
              }}
              style={{ marginTop: Spacing.md }}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
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
          // Custom-parallel entry was wired to a TODO; the screen
          // doesn't exist yet. Hidden until we build it — better to
          // omit than to ship a tap that does nothing.
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
                {selectedCatalog?.parallel || 'Base'}
                {selectedCatalog?.print_run ? ` /${selectedCatalog.print_run}` : ''}
              </Text>
            </View>
          </View>

          <Text style={{ color: Colors.textMuted, fontSize: Typography.sm }}>
            {selectedCatalog?.print_run
              ? `Which copy do you have? (e.g. 14 of ${selectedCatalog.print_run})`
              : "If your card is serial-numbered (e.g. #14/25), enter the numbers. Otherwise tap Skip."}
          </Text>

          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input
                label="Serial #"
                value={form.serial_number}
                onChangeText={set('serial_number')}
                placeholder={`1-${selectedCatalog?.print_run || '?'}`}
                keyboardType="number-pad"
              />
            </View>
            {!selectedCatalog?.print_run ? (
              <View style={{ flex: 1 }}>
                <Input
                  label="Print run (/N)"
                  value={form.print_run || ''}
                  onChangeText={set('print_run')}
                  placeholder="e.g. 25"
                  keyboardType="number-pad"
                />
              </View>
            ) : null}
          </View>

          {form.serial_number && (selectedCatalog?.print_run || form.print_run) && (
            <View style={[styles.rookieTag, { alignSelf: 'flex-start' }]}>
              <Text style={styles.rookieTagText}>#{form.serial_number}/{selectedCatalog?.print_run || form.print_run}</Text>
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
        <TouchableOpacity onPress={() => setStep('serial')}>
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
            <SectionHeader title="Condition (eBay scale)" />
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
              Tap a condition to see what it means. Matching eBay's
              grading keeps listings comparable across platforms.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.condBtn, form.condition === c.key && styles.condBtnActive]}
                  onPress={() => {
                    set('condition')(c.key);
                    setConditionDescFor(c.key);
                  }}
                  onLongPress={() => setConditionDescFor(c.key)}
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
                <View style={{
                  marginTop: Spacing.sm,
                  padding: Spacing.md,
                  borderRadius: Radius.md,
                  borderWidth: 1,
                  borderColor: Colors.border,
                  backgroundColor: Colors.surface2,
                }}>
                  <Text style={{ color: Colors.text, fontWeight: '700', marginBottom: 2 }}>
                    {picked.label}
                  </Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 6 }}>
                    eBay equivalent: {picked.ebay}
                  </Text>
                  <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 18 }}>
                    {picked.desc}
                  </Text>
                </View>
              );
            })() : null}
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

        {/* Public notes — visible on the listing and trade board */}
        <View>
          <SectionHeader title="Public Notes" />
          <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
            Shown to anyone viewing this card. Good for context like
            "part of my Flux rainbow, willing to trade toward the Pink".
          </Text>
          <Input
            value={form.public_notes}
            onChangeText={set('public_notes')}
            placeholder="Notes visible to everyone..."
            multiline
          />
        </View>

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
            label="Private Notes"
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
                {i === 0 ? (
                  <View style={{
                    position: 'absolute', top: 4, left: 4,
                    backgroundColor: Colors.accent,
                    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
                  }}>
                    <Text style={{ color: Colors.bg, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 }}>
                      COVER
                    </Text>
                  </View>
                ) : null}
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
                {/* Reorder controls. Left arrow swaps with previous;
                    right arrow swaps with next. The cover (index 0)
                    has no left arrow; the last photo has no right
                    arrow. Long-press would be nicer but adds gesture
                    handler scope; explicit buttons are cheaper. */}
                <View style={{
                  position: 'absolute', bottom: 4, right: 4,
                  flexDirection: 'row', gap: 2,
                }}>
                  {i > 0 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setPhotos((p) => {
                          const next = [...p];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return next;
                        });
                        setPhotoSources((s) => {
                          const next = [...s];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          return next;
                        });
                      }}
                      style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        justifyContent: 'center', alignItems: 'center',
                      }}
                    >
                      <Ionicons name="chevron-back" size={14} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                  {i < photos.length - 1 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setPhotos((p) => {
                          const next = [...p];
                          [next[i], next[i + 1]] = [next[i + 1], next[i]];
                          return next;
                        });
                        setPhotoSources((s) => {
                          const next = [...s];
                          [next[i], next[i + 1]] = [next[i + 1], next[i]];
                          return next;
                        });
                      }}
                      style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        justifyContent: 'center', alignItems: 'center',
                      }}
                    >
                      <Ionicons name="chevron-forward" size={14} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                </View>
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

        {/* Short video — optional. Captured in-camera so the device
            does the encoding, then base64-shipped to the API where
            Cloudinary handles streaming transcode. 15s cap keeps
            payload sizes sane; most corner/edge spins take 5-8s. */}
        <View>
          <SectionHeader title="Short Video (optional)" action={videoUri ? { label: 'Replace', onPress: recordVideo } : null} />
          <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
            Up to 15 seconds. Great for showing corners, edges, or surface in motion.
          </Text>
          {videoUri ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 }}>
              <Ionicons name="videocam" size={24} color={Colors.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontWeight: '600' }}>Video ready to upload</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11 }} numberOfLines={1}>
                  {videoUri.split('/').pop()}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setVideoUri(null)}>
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={recordVideo} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border }}>
              <Ionicons name="videocam-outline" size={20} color={Colors.textMuted} />
              <Text style={{ color: Colors.textMuted, fontWeight: '500' }}>Record a short video</Text>
            </TouchableOpacity>
          )}
        </View>
        {/* Binder picker — every card lives in a binder. Default to
            the user's Default binder if no incoming binderId; let
            them override before saving. */}
        {myBinders.length > 0 ? (
          <View style={{ marginTop: Spacing.lg }}>
            <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm }}>
              Goes in this binder
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {myBinders.map((b) => {
                const active = pickedBinderId
                  ? pickedBinderId === b.id
                  : b.name === 'Default';
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => setPickedBinderId(b.id)}
                    style={{
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.sm,
                      borderRadius: Radius.full,
                      borderWidth: 1,
                      borderColor: active ? Colors.accent : Colors.border,
                      backgroundColor: active ? Colors.surface2 : Colors.surface,
                    }}
                  >
                    <Text style={{
                      color: active ? Colors.accent : Colors.text,
                      fontSize: Typography.sm,
                      fontWeight: '600',
                    }}>{b.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Submit */}
      <View style={styles.submitBar}>
        <Button
          title={(() => {
            const parts = [];
            if (photos.length) parts.push(`${photos.length} photo${photos.length === 1 ? '' : 's'}`);
            if (videoUri) parts.push('1 video');
            return parts.length ? `Register Card · ${parts.join(' + ')}` : 'Register Card';
          })()}
          onPress={() => registerMutation.mutate()}
          loading={registerMutation.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// ZOOMABLE IMAGE VIEWER
// ============================================================
// Fullscreen modal for inspecting card photos. Pinch to zoom,
// pan when zoomed, double-tap to toggle 1x/2.5x, swipe to switch
// images. Pure gesture-handler + reanimated (both already native
// in the APK) so no rebuild is required.
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function ZoomableImage({ uri }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const resetToOneX = () => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 6));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.05) {
        // Snap back to 1x when close — pan stays centered.
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Pan only when zoomed, otherwise the parent swipe-between-
      // images gesture handles horizontal motion.
      if (savedScale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        runOnJS(resetToOneX)();
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinch, pan, doubleTap);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={{ width: SCREEN_W, height: SCREEN_H, justifyContent: 'center', alignItems: 'center' }}>
        <Animated.Image
          source={{ uri }}
          style={[{ width: SCREEN_W, height: SCREEN_H * 0.8 }, style]}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
}

function ZoomableImageViewer({ visible, images, initialIndex = 0, onClose }) {
  const [idx, setIdx] = React.useState(initialIndex);
  React.useEffect(() => {
    if (visible) setIdx(initialIndex);
  }, [visible, initialIndex]);
  if (!images?.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * SCREEN_W, y: 0 }}
          onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
          style={{ flex: 1 }}
        >
          {images.map((uri, i) => (
            <ZoomableImage key={`${uri}-${i}`} uri={uri} />
          ))}
        </ScrollView>

        <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} edges={['top']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md }}>
            <TouchableOpacity onPress={onClose} style={{ padding: Spacing.sm }}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {idx + 1} / {images.length}
            </Text>
            <View style={{ width: 44 }} />
          </View>
        </SafeAreaView>

        <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} edges={['bottom']}>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center', padding: Spacing.md }}>
            Pinch to zoom · Double-tap to toggle · Swipe to switch
          </Text>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ============================================================
// INLINE VIDEO PLAYER
// ============================================================
// Mounts a full-screen expo-video VideoView for the given URI.
// Auto-plays on mount, releases when the modal unmounts so we
// don't hold a hardware decoder for every CardDetail screen.
function InlineVideoPlayer({ uri, onClose }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        contentFit="contain"
        allowsFullscreen
        allowsPictureInPicture
        nativeControls
      />
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} edges={['top']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: Spacing.md }}>
          <TouchableOpacity onPress={onClose} style={{ padding: Spacing.sm }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ============================================================
// CARD DETAIL
// ============================================================
export const CardDetailScreen = ({ navigation, route }) => {
  const { cardId } = route.params;
  const queryClient = useQueryClient();
  const ebayStatus = useEbayStatus();
  const ebayEnabled = !!ebayStatus?.feature_enabled;
  const ebayConnected = !!ebayStatus?.connected;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: card, isLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => cardsApi.get(cardId).then((r) => r.data),
  });

  const { data: history } = useQuery({
    queryKey: ['card-history', cardId],
    queryFn: () => cardsApi.history(cardId).then((r) => r.data),
  });

  // Live eBay active-ask summary for the catalog row. We
  // deliberately don't show sold-comp medians — eBay deprecated
  // Finding API in 2024 and the Marketplace Insights replacement
  // is gated. Third-party SOLD data is one-click away via the
  // research_links block below.
  const { data: asks } = useQuery({
    queryKey: ['catalog-asks', card?.catalog_id],
    queryFn: () => catalogApi.marketAsks(card.catalog_id).then((r) => r.data),
    enabled: !!card?.catalog_id,
    staleTime: 5 * 60 * 1000,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => cardsApi.update(cardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Update failed'),
  });

  // Binder list for the move-to-binder action. Only fetched once
  // we know the viewer owns the card (the "Move" CTA renders for
  // owners only — see below).
  const { data: bindersData } = useQuery({
    queryKey: ['my-binders'],
    queryFn: () => bindersApi.list().then((r) => r.data),
    enabled: !!currentUserId && !!card && card.owner_id === currentUserId,
  });
  const myBinders = bindersData?.binders || [];

  const moveBinder = useMutation({
    mutationFn: (binderId) => moveCardToBinder(cardId, binderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      // Server semantics are additive — card stays in any binders
      // it was already in and is now ALSO in this one. Wording
      // matches that so users don't think it's an exclusive move.
      Alert.alert('Added', 'This card is now in the selected binder. It also stays in any binders you already had it in.');
    },
    onError: (err) => Alert.alert('Could not add card to binder', err?.response?.data?.error || 'Try again.'),
  });

  // Setting the binder-level intent IS the trade-board switch.
  // When the API tells us the card needs a listing (tradeable
  // intent + no active trade_listing yet), launch the listing
  // flow so the user picks visibility / takes photos.
  const setIntentMutation = useMutation({
    mutationFn: (intent_signal) => setCardIntent(cardId, intent_signal),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      queryClient.invalidateQueries({ queryKey: ['trade-listings'] });
      // Per-binder views render the intent_signal as an image
      // overlay ("Let's talk", "Priced", etc.). Invalidate them
      // too — without this, the overlay keeps showing the old
      // value until the binder is reopened from scratch.
      queryClient.invalidateQueries({ predicate: (q) =>
        q.queryKey?.[0] === 'binder' || q.queryKey?.[0] === 'public-binder'
      });
      if (res?.data?.needs_listing) {
        navigation.navigate('CreateTradeListing', { ownedCardId: cardId });
      }
    },
    onError: (err) => Alert.alert('Could not update intent', err?.response?.data?.error || 'Try again.'),
  });

  const promptMoveToBinder = () => {
    if (!myBinders.length) {
      Alert.alert('No binders', 'Create a binder first from the Collection tab.');
      return;
    }
    Alert.alert(
      'Add to which binder?',
      'Pick a binder to add this card to. Cards can live in multiple binders — adding here keeps it in any others it\u2019s already in.',
      [
        ...myBinders.map((b) => ({
          text: b.name,
          onPress: () => moveBinder.mutate(b.id),
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

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

  // Lightbox state — open with the tapped photo, swipe between
  // all of the owner's uploaded photos (catalog stock images are
  // intentionally excluded; they're lower-resolution thumbnails).
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [zoomIndex, setZoomIndex] = React.useState(0);
  const [videoOpen, setVideoOpen] = React.useState(false);

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
          {card?.owner_id === currentUserId ? (
            <TouchableOpacity onPress={promptMoveToBinder} accessibilityLabel="Add to binder">
              <Ionicons name="folder-open-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => navigation.navigate('EditCard', { cardId })}>
            <Ionicons name="create-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
          <TouchableOpacity onPress={confirmDelete}>
            <Ionicons name="trash-outline" size={20} color={Colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('InitiateTransfer', { cardId })}>
            <Ionicons name="swap-horizontal" size={22} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Card image — prefer the owner's uploaded photos (photo_urls
            first, then the dedicated image_front/back fields) because
            most Panini/Topps catalog rows ship with no stock image.
            Fall back to the catalog image only if the user didn't
            upload anything. Show all photos in a horizontal carousel
            if there's more than one. */}
        {(() => {
          const ownPhotos = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
          if (card.own_image_front) ownPhotos.unshift(card.own_image_front);
          if (card.own_image_back) ownPhotos.push(card.own_image_back);
          const catalogFallback = card.front_image_url;
          if (ownPhotos.length === 0 && !catalogFallback) {
            return (
              <View style={styles.cardImageArea}>
                <View style={styles.cardImagePlaceholder}>
                  <Text style={{ fontSize: 60 }}>🃏</Text>
                </View>
              </View>
            );
          }
          if (ownPhotos.length === 0) {
            return (
              <View style={styles.cardImageArea}>
                <Image source={{ uri: catalogFallback }} style={styles.cardImage} resizeMode="contain" />
              </View>
            );
          }
          // Tap any owner photo → fullscreen pinch-zoom. The catalog
          // stock image stays a non-interactive fallback.
          const openLightbox = (i) => { setZoomIndex(i); setZoomOpen(true); };
          if (ownPhotos.length === 1) {
            return (
              <TouchableOpacity style={styles.cardImageArea} activeOpacity={0.85} onPress={() => openLightbox(0)}>
                <Image source={{ uri: ownPhotos[0] }} style={styles.cardImage} resizeMode="contain" />
                <View style={styles.zoomHint}>
                  <Ionicons name="expand" size={12} color="#fff" />
                  <Text style={styles.zoomHintText}>Tap to zoom</Text>
                </View>
              </TouchableOpacity>
            );
          }
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base }}
              style={styles.cardImageArea}
            >
              {ownPhotos.map((uri, i) => (
                <TouchableOpacity key={`${uri}-${i}`} activeOpacity={0.85} onPress={() => openLightbox(i)}>
                  <Image source={{ uri }} style={styles.cardImage} resizeMode="contain" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          );
        })()}

        {/* Short video — Cloudinary auto-generates a poster frame
            at $cloudinaryVideoUrl.replace('.mp4', '.jpg'). Tap opens
            the system default video player / browser so we can play
            without a native player module (no expo-av in this APK). */}
        {card.video_url ? (() => {
          const posterUrl = String(card.video_url).replace(/\.(mp4|mov|webm|m4v)$/i, '.jpg');
          return (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setVideoOpen(true)}
              style={{ marginHorizontal: Spacing.base, marginTop: Spacing.md, borderRadius: Radius.md, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, backgroundColor: '#000' }}
            >
              <Image source={{ uri: posterUrl }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', top: 0, bottom: 0, left: 0, right: 0 }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 40, padding: 14 }}>
                  <Ionicons name="play" size={28} color="#fff" />
                </View>
              </View>
              <View style={{ position: 'absolute', bottom: 8, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>VIDEO</Text>
              </View>
            </TouchableOpacity>
          );
        })() : null}

        {/* In-app video player modal. expo-video's useVideoPlayer
            is hook-based and needs to live inside a component —
            split into InlineVideoPlayer below so we can conditionally
            mount it only while the modal is open (avoids holding
            a decoder open for every CardDetail mount). */}
        {card.video_url ? (
          <Modal visible={videoOpen} animationType="fade" onRequestClose={() => setVideoOpen(false)} transparent={false}>
            <InlineVideoPlayer uri={card.video_url} onClose={() => setVideoOpen(false)} />
          </Modal>
        ) : null}

        <ZoomableImageViewer
          visible={zoomOpen}
          images={(() => {
            const list = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
            if (card.own_image_front) list.unshift(card.own_image_front);
            if (card.own_image_back) list.push(card.own_image_back);
            return list;
          })()}
          initialIndex={zoomIndex}
          onClose={() => setZoomOpen(false)}
        />

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

          {/* Verification badge for graded cards — surfaces
              claim status at a glance. Raw cards skip this. */}
          {card.cert_number && card.verification_status ? (
            <View style={{ flexDirection: 'row', marginBottom: Spacing.sm }}>
              <VerificationBadge status={card.verification_status} size="md" />
            </View>
          ) : null}

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

          {/* Owner-only intent picker — the binder card's intent
              IS the trade-board switch. Setting a tradeable intent
              auto-launches the CreateTradeListing flow when no
              active listing exists; setting Showcase archives any
              existing listing via the migration-028 trigger. The
              user thinks "is this card tradeable?" and the data
              model follows. */}
          {card?.owner_id === currentUserId ? (
            <View style={{ marginTop: Spacing.lg }}>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase', marginBottom: Spacing.sm }}>
                Trade status
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }}>
                {[
                  { key: 'priced_to_move', label: 'Priced',     desc: 'Show a fixed price to buyers.' },
                  { key: 'lets_talk',      label: "Let's talk", desc: 'Open to offers — no fixed price.' },
                  { key: 'trade_only',     label: 'Trade only', desc: 'Cards only — no cash.' },
                  { key: 'not_for_sale',   label: 'Showcase',   desc: 'Off the trade board. Display only.' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => setIntentMutation.mutate(opt.key)}
                    disabled={setIntentMutation.isPending}
                    style={{
                      paddingHorizontal: Spacing.md,
                      paddingVertical: Spacing.sm,
                      borderRadius: Radius.full,
                      borderWidth: 1,
                      borderColor: card.intent_signal === opt.key ? Colors.accent : Colors.border,
                      backgroundColor: card.intent_signal === opt.key ? Colors.surface2 : Colors.surface,
                      opacity: setIntentMutation.isPending ? 0.5 : 1,
                    }}
                  >
                    <Text style={{
                      color: card.intent_signal === opt.key ? Colors.accent : Colors.text,
                      fontWeight: Typography.semibold,
                      fontSize: Typography.sm,
                    }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginTop: Spacing.sm, lineHeight: 16, fontStyle: 'italic' }}>
                {card.intent_signal === 'not_for_sale'
                  ? 'Card is in your binder only — not on the trade board.'
                  : 'Card is on the trade board.'}
              </Text>
            </View>
          ) : null}

          {/* Market snapshot — sold first (when available from the
              Finding API), active asks second. We only count
              auction closes in the sold median because Fixed-Price
              / BIN sales show the listing price, not the accepted
              Best Offer — that's what 130point gets right and raw
              eBay sold search doesn't. Research links stay visible
              below so collectors can cross-reference. */}
          {asks ? (
            <View style={{ marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border }}>
              {/* Verified sold block (auction closes) */}
              {asks.sold?.verified ? (
                <>
                  <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Recently sold (verified auction closes)
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' }}>
                    <Text style={{ color: Colors.text, fontSize: 22, fontWeight: Typography.semibold }}>
                      ${Number(asks.sold.verified.median).toFixed(0)}
                    </Text>
                    <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
                      median · ${Number(asks.sold.verified.min).toFixed(0)}–${Number(asks.sold.verified.max).toFixed(0)} · {asks.sold.verified.count} sale{asks.sold.verified.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </>
              ) : null}

              {/* Asking-only warning — BIN sales where the "sold at"
                  price is actually the listing price, not the accepted
                  Best Offer. eBay hides the accepted-offer amount. */}
              {asks.sold?.asking_only ? (
                <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: asks.sold?.verified ? 8 : 0, fontStyle: 'italic' }}>
                  ⚠ {asks.sold.asking_only.count} more sold via Buy-It-Now (asking price shown, actual sale may be lower if a Best Offer was accepted).
                </Text>
              ) : null}

              {/* Active asks — shown as a secondary signal */}
              {asks.asks?.summary ? (
                <View style={{ marginTop: (asks.sold?.verified || asks.sold?.asking_only) ? 12 : 0 }}>
                  <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
                    Current asks
                  </Text>
                  <Text style={{ color: Colors.text, fontSize: 14 }}>
                    <Text style={{ fontWeight: Typography.semibold }}>${Number(asks.asks.summary.median).toFixed(0)}</Text>
                    <Text style={{ color: Colors.textMuted }}> median · ${Number(asks.asks.summary.min).toFixed(0)}–${Number(asks.asks.summary.max).toFixed(0)} · {asks.asks.summary.count} active</Text>
                  </Text>
                </View>
              ) : null}

              {/* Empty state */}
              {!asks.sold?.verified && !asks.sold?.asking_only && !asks.asks?.summary ? (
                <Text style={{ color: Colors.textMuted, fontSize: 13 }}>
                  No recent eBay data for this card. Check research tools below.
                </Text>
              ) : null}

              {/* Research links — always visible */}
              <Text style={{ color: Colors.textMuted, fontSize: 11, marginTop: 12, fontStyle: 'italic' }}>
                Cross-check on:
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                {(asks.research_links || []).map((link) => (
                  <TouchableOpacity
                    key={link.label}
                    onPress={() => Linking.openURL(link.url).catch((err) => {
                      console.warn('Failed to open URL', link.url, err?.message);
                      Alert.alert('Could not open link', 'Try tapping again, or copy the URL manually.');
                    })}
                    style={{
                      paddingHorizontal: 10, paddingVertical: 4,
                      borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accent,
                    }}
                  >
                    <Text style={{ color: Colors.accent, fontSize: 11, fontWeight: Typography.semibold }}>
                      {link.label} ↗
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}

          {/* Public notes — owner's description, visible to everyone */}
          {card.public_notes ? (
            <View style={{ marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border }}>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: 4, letterSpacing: 1, textTransform: 'uppercase' }}>
                From the owner
              </Text>
              <Text style={{ color: Colors.text, fontSize: 14, lineHeight: 20 }}>
                {card.public_notes}
              </Text>
            </View>
          ) : null}

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

          {/* Chain of custody — Carfax view of every owner, transfer,
              video, and stolen flag in this card's life. The
              differentiator's storefront. */}
          <TouchableOpacity
            onPress={() => navigation.navigate('CardChain', { cardId })}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 8,
              padding: 14, marginVertical: 8,
              borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent + '60',
              backgroundColor: Colors.accent + '10',
            }}
          >
            <Ionicons name="git-network-outline" size={18} color={Colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold }}>
                View chain of custody
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 }}>
                Every transfer, photo, and video on this card. Shareable.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>

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

          {/* QR sticker actions — owner only. Two paths:
              - No sticker yet: show "Attach QR sticker" → scans an
                unregistered sticker and binds it to this card via PATCH.
              - Sticker present: show "Request new sticker" reprint flow
                (fraud-prevented; only owner can invalidate). */}
          {card.owner_id && currentUserId && card.owner_id === currentUserId ? (
            card.qr_insert_id ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('RequestReprint', {
                  cardId: card.id,
                  cardTitle: [card.year, card.set_name, card.player_name].filter(Boolean).join(' · '),
                })}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: Spacing.sm, padding: Spacing.md, marginTop: Spacing.md,
                  borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
                  backgroundColor: Colors.surface,
                }}
              >
                <Ionicons name="refresh-outline" size={18} color={Colors.accent} />
                <Text style={{ color: Colors.text, fontWeight: '600' }}>
                  Request new sticker
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => navigation.navigate('QRScanner', {
                  mode: 'attach',
                  cardId: card.id,
                })}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  gap: Spacing.sm, padding: Spacing.md, marginTop: Spacing.md,
                  borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent,
                  backgroundColor: Colors.accent + '11',
                }}
              >
                <Ionicons name="qr-code-outline" size={18} color={Colors.accent} />
                <Text style={{ color: Colors.accent, fontWeight: '700' }}>
                  Attach QR sticker
                </Text>
              </TouchableOpacity>
            )
          ) : null}

          {/* Message Owner — only when a non-owner is viewing
              this card. Opens (or resumes) the card-scoped chat
              thread. Owners see the Transfer button below instead. */}
          {card.owner_id && currentUserId && card.owner_id !== currentUserId ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('Conversation', {
                startWith: {
                  to_user_id: card.owner_id,
                  to_username: card.owner_username,
                  owned_card_id: card.id,
                },
                otherName: card.owner_display_name || card.owner_username,
                otherUsername: card.owner_username,
                ownedCardId: card.id,
                cardTitle: `${card.year} ${card.set_name}`,
              })}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: Spacing.sm, padding: Spacing.md, marginTop: Spacing.md,
                borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.accent,
              }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={18} color={Colors.accent} />
              <Text style={{ color: Colors.accent, fontWeight: '600' }}>
                Message {card.owner_display_name || card.owner_username}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* "This is my card" counter-claim — graded cards only,
              non-owners only. Fraud-deterrent: the real owner of a
              slab can flag it if they see their cert registered by
              someone else. Flips the card to 'disputed' pending
              admin review. */}
          {card.owner_id && currentUserId && card.owner_id !== currentUserId
            && card.cert_number && card.verification_status !== 'disputed' ? (
            <TouchableOpacity
              onPress={() => Alert.alert(
                'This is my card?',
                `Filing a counter-claim tells us you're the real owner of ${card.grading_company?.toUpperCase()} cert #${card.cert_number}. ` +
                'An admin will review. Be ready to show proof — photos of the slab in your hand with a timestamped note work best.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'File counter-claim',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await cardsApi.counterClaim(card.id, { reason: 'User-initiated counter-claim from CardDetail' });
                        queryClient.invalidateQueries({ queryKey: ['card', cardId] });
                        Alert.alert(
                          'Counter-claim filed',
                          'The card is now marked disputed. Admin will reach out. Gather your evidence in the meantime.'
                        );
                      } catch (err) {
                        Alert.alert(
                          'Could not file',
                          err?.response?.data?.error || 'Try again.'
                        );
                      }
                    },
                  },
                ]
              )}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                gap: Spacing.sm, padding: Spacing.md, marginTop: Spacing.sm,
                borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.error,
              }}
            >
              <Ionicons name="flag-outline" size={18} color={Colors.error} />
              <Text style={{ color: Colors.error, fontWeight: '600' }}>
                This is my card
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Trust-nudge copy — visible to everyone, draws extra
              attention when the claim isn't photo-verified. */}
          {card.cert_number && card.verification_status === 'claimed_unverified' ? (
            <Text style={{ color: Colors.textMuted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', marginTop: Spacing.sm }}>
              Not photo-verified. Ask to see the slab in hand before trading.
            </Text>
          ) : null}
          {card.verification_status === 'disputed' ? (
            <Text style={{ color: Colors.error, fontSize: 12, textAlign: 'center', marginTop: Spacing.sm, fontWeight: '600' }}>
              ⚠ A counter-claim is open on this card. Hold off on trades until it resolves.
            </Text>
          ) : null}

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

// ============================================================
// EDIT CARD
// ============================================================
// Post-registration editor for the fields the owner can change
// without invalidating chain of custody: condition, status,
// prices, public/private notes, serial number, and photos.
// Catalog fields (player, set, parallel, card #) are intentionally
// not editable — fixing those happens via delete + re-register,
// so the transfer log stays coherent.
export const EditCardScreen = ({ navigation, route }) => {
  const { cardId } = route.params;
  const queryClient = useQueryClient();

  const { data: card, isLoading } = useQuery({
    queryKey: ['card-private', cardId],
    queryFn: () => cardsApi.getPrivate(cardId).then((r) => r.data),
  });

  const [form, setForm] = useState(null);
  const [newPhotos, setNewPhotos] = useState([]); // newly-added file:// URIs
  const [conditionDescFor, setConditionDescFor] = useState(null);

  React.useEffect(() => {
    if (!card || form) return;
    setForm({
      status: card.status || 'nfs',
      condition: card.condition || 'near_mint',
      condition_notes: card.condition_notes || '',
      asking_price: card.asking_price != null ? String(card.asking_price) : '',
      serial_number: card.serial_number != null ? String(card.serial_number) : '',
      purchase_price: card.purchase_price != null ? String(card.purchase_price) : '',
      personal_valuation: card.personal_valuation != null ? String(card.personal_valuation) : '',
      notes: card.notes || '',
      public_notes: card.public_notes || '',
    });
  }, [card, form]);

  // Reuse the same eBay condition table the register screen uses
  // so the definitions stay in one place. Duplicated structurally
  // to avoid splitting the component file further; if a third
  // copy shows up this should move to a module-level constant.
  const CONDITIONS = [
    { key: 'gem_mint',  label: 'Gem Mint',   ebay: 'Graded — Gem Mint',
      desc: 'PSA/BGS/SGC 10 equivalent. Perfect centering, sharp corners, no printing defects visible under magnification.' },
    { key: 'mint',      label: 'Mint',       ebay: 'Mint or Mint 9',
      desc: 'PSA 9. Near-perfect centering (55/45+), sharp corners, clean surface. One very minor flaw acceptable.' },
    { key: 'near_mint', label: 'Near Mint',  ebay: 'Near Mint–Mint or NM 8',
      desc: 'PSA 7-8. Slight off-centering, minor corner wear, light surface scratches at an angle. No creases.' },
    { key: 'excellent', label: 'Excellent',  ebay: 'Excellent',
      desc: 'PSA 5-6. Mild corner rounding, minor edge wear. Image still sharp, no creases.' },
    { key: 'very_good', label: 'Very Good',  ebay: 'Very Good',
      desc: 'PSA 3-4. Noticeable corner wear and edge fuzz. May have a single very light crease.' },
    { key: 'good',      label: 'Good',       ebay: 'Good',
      desc: 'PSA 2. Rounded corners, visible creases, surface scratches. Image intact.' },
    { key: 'fair',      label: 'Fair',       ebay: 'Fair',
      desc: 'PSA 1.5. Heavy wear, multiple creases, possible minor tears. Image recognizable.' },
    { key: 'poor',      label: 'Poor',       ebay: 'Poor',
      desc: 'PSA 1. Major damage — tears, water damage, stains, writing, pin-holes.' },
  ];

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings → Card Shop → Permissions.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) {
      setNewPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
    }
  };
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) {
      setNewPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
    }
  };
  const addPhoto = () => {
    Alert.alert('Add a photo', null, [
      { text: 'Take photo', onPress: takePhoto },
      { text: 'Choose from gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const [newVideoUri, setNewVideoUri] = useState(null);
  const recordVideo = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings → Card Shop.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos, videoMaxDuration: 15,
      quality: 0.8, allowsEditing: true,
    });
    if (!result.canceled && result.assets?.length) setNewVideoUri(result.assets[0].uri);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Merge existing hosted photos with any newly captured ones
      // (converted to base64 for Cloudinary). Kept in order: old
      // photos first, new appended. User can reorder in a future
      // pass; for now order matches registration.
      const existing = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
      const newlyConverted = await Promise.all(
        newPhotos.map(async (uri) => {
          if (!uri) return null;
          if (/^https?:\/\//i.test(uri)) return uri;
          try {
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            return `data:image/jpeg;base64,${b64}`;
          } catch {
            return null;
          }
        })
      );
      const merged = [...existing, ...newlyConverted.filter(Boolean)];
      let videoPayload;
      if (newVideoUri) {
        try {
          const b64 = await FileSystem.readAsStringAsync(newVideoUri, { encoding: FileSystem.EncodingType.Base64 });
          videoPayload = `data:video/mp4;base64,${b64}`;
        } catch (err) {
          Alert.alert('Video read failed', err?.message || 'Could not read the recorded video.');
        }
      }
      return cardsApi.update(cardId, {
        status: form.status,
        condition: form.condition,
        condition_notes: form.condition_notes || undefined,
        asking_price: form.asking_price ? parseFloat(form.asking_price) : undefined,
        serial_number: form.serial_number ? parseInt(form.serial_number, 10) : undefined,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
        personal_valuation: form.personal_valuation ? parseFloat(form.personal_valuation) : undefined,
        notes: form.notes || undefined,
        public_notes: form.public_notes || undefined,
        photo_urls: merged,
        video_url: videoPayload || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card-private', cardId] });
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Could not save', err.response?.data?.error || 'Please try again.'),
  });

  const removeExistingPhoto = (idx) => {
    // Strip one URL from the existing list and save immediately so
    // the deletion can't get lost if the user backs out without
    // hitting Save. Other edits still require the explicit Save.
    const existing = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
    const next = existing.filter((_, i) => i !== idx);
    cardsApi.update(cardId, { photo_urls: next }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card-private', cardId] });
    }).catch((err) => Alert.alert('Could not remove photo', err.response?.data?.error || 'Please try again.'));
  };

  // Rotate an already-saved photo 90° clockwise via ImageManipulator.
  // Writes the rotated image back as a base64 data URL so the API
  // re-uploads to Cloudinary and the photo_urls list gets the new
  // hosted URL. Runs one API call per tap; four taps cycle back.
  // Full in-flow re-crop needs a canvas editor we don't have yet —
  // rotate + re-capture covers 90% of fix-the-photo cases for now.
  const rotateExistingPhoto = async (idx) => {
    const existing = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];
    const uri = existing[idx];
    if (!uri) return;
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ rotate: 90 }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const next = [...existing];
      next[idx] = `data:image/jpeg;base64,${result.base64}`;
      await cardsApi.update(cardId, { photo_urls: next });
      queryClient.invalidateQueries({ queryKey: ['card', cardId] });
      queryClient.invalidateQueries({ queryKey: ['card-private', cardId] });
    } catch (err) {
      Alert.alert('Could not rotate', err?.message || 'Try again.');
    }
  };

  if (isLoading || !card || !form) return <LoadingScreen />;

  const existingPhotos = Array.isArray(card.photo_urls) ? card.photo_urls.filter(Boolean) : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Card</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 100 }}>
        <View style={styles.selectedCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogPlayer}>{card.player_name}</Text>
            <Text style={styles.catalogSet}>{card.year} {card.manufacturer} {card.set_name}</Text>
            {card.parallel ? <Text style={styles.catalogParallel}>{card.parallel}{card.print_run ? ` /${card.print_run}` : ''}</Text> : null}
          </View>
        </View>

        {/* Condition */}
        {card.grading_company === 'raw' || !card.grading_company ? (
          <View>
            <SectionHeader title="Condition (eBay scale)" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
              {CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.condBtn, form.condition === c.key && styles.condBtnActive]}
                  onPress={() => { set('condition')(c.key); setConditionDescFor(c.key); }}
                >
                  <Text style={[styles.condText, form.condition === c.key && styles.condTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {conditionDescFor ? (() => {
              const picked = CONDITIONS.find((c) => c.key === conditionDescFor);
              if (!picked) return null;
              return (
                <View style={{ marginTop: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 }}>
                  <Text style={{ color: Colors.text, fontWeight: '700', marginBottom: 2 }}>{picked.label}</Text>
                  <Text style={{ color: Colors.textMuted, fontSize: 11, marginBottom: 6 }}>eBay equivalent: {picked.ebay}</Text>
                  <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 18 }}>{picked.desc}</Text>
                </View>
              );
            })() : null}
          </View>
        ) : null}

        {/* Status */}
        <View>
          <SectionHeader title="Availability" />
          <View style={styles.statusRow}>
            {[
              { key: 'nfs', label: 'NFS', desc: 'Not For Sale' },
              { key: 'nft', label: 'NFT', desc: 'Not For Trade' },
              { key: 'lets_talk', label: "Let's Talk", desc: 'Open to offers' },
            ].map((s) => (
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

        {form.status === 'lets_talk' && (
          <Input label="Asking Price" value={form.asking_price} onChangeText={set('asking_price')} placeholder="0.00" keyboardType="decimal-pad" />
        )}

        {/* Serial — only if the card is numbered */}
        {card.print_run ? (
          <Input
            label={`Your copy (1-${card.print_run})`}
            value={form.serial_number}
            onChangeText={set('serial_number')}
            placeholder={`e.g. 7 of ${card.print_run}`}
            keyboardType="number-pad"
          />
        ) : null}

        {/* Public notes */}
        <View>
          <SectionHeader title="Public Notes" />
          <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
            Shown to anyone viewing the card.
          </Text>
          <Input value={form.public_notes} onChangeText={set('public_notes')} placeholder="Notes visible to everyone..." multiline />
        </View>

        {/* Private details */}
        <View>
          <SectionHeader title="Private Details" />
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input label="Purchase Price" value={form.purchase_price} onChangeText={set('purchase_price')} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Your Valuation" value={form.personal_valuation} onChangeText={set('personal_valuation')} placeholder="0.00" keyboardType="decimal-pad" />
            </View>
          </View>
          <Input label="Private Notes" value={form.notes} onChangeText={set('notes')} placeholder="Only you can see these..." multiline />
        </View>

        {/* Photos */}
        <View>
          <SectionHeader title="Photos" action={{ label: '+ Add', onPress: addPhoto }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.base }} contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm }}>
            <TouchableOpacity style={styles.photoAdd} onPress={addPhoto}>
              <Ionicons name="camera" size={24} color={Colors.textMuted} />
              <Text style={styles.photoAddText}>Add</Text>
            </TouchableOpacity>
            {existingPhotos.map((uri, i) => (
              <View key={`ex-${i}`} style={styles.photoThumb}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                {/* Rotate button — 90° per tap, saves immediately.
                    Positioned bottom-right so the close button
                    stays in its usual top-right spot. */}
                <TouchableOpacity
                  style={styles.photoRotate}
                  onPress={() => rotateExistingPhoto(i)}
                  accessibilityLabel="Rotate 90°"
                >
                  <Ionicons name="refresh" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => Alert.alert('Remove photo?', 'This cannot be undone.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeExistingPhoto(i) },
                  ])}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
            {newPhotos.map((uri, i) => (
              <View key={`new-${i}`} style={styles.photoThumb}>
                <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 8 }} />
                <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '600' }}>NEW</Text>
                </View>
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setNewPhotos((p) => p.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close-circle" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Video — replaces the existing one if the user records. */}
        <View>
          <SectionHeader title="Short Video" action={newVideoUri ? { label: 'Replace', onPress: recordVideo } : null} />
          <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, marginBottom: Spacing.sm }}>
            {card.video_url ? 'A video is already attached — recording replaces it.' : 'Up to 15 seconds of the card in motion.'}
          </Text>
          {newVideoUri ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2 }}>
              <Ionicons name="videocam" size={24} color={Colors.accent} />
              <Text style={{ color: Colors.text, flex: 1, fontWeight: '600' }}>New video ready</Text>
              <TouchableOpacity onPress={() => setNewVideoUri(null)}>
                <Ionicons name="close-circle" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={recordVideo} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border }}>
              <Ionicons name="videocam-outline" size={20} color={Colors.textMuted} />
              <Text style={{ color: Colors.textMuted, fontWeight: '500' }}>{card.video_url ? 'Record replacement video' : 'Record a short video'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <View style={styles.submitBar}>
        <Button
          title="Save Changes"
          onPress={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          style={{ flex: 1 }}
        />
      </View>
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
  photoRotate: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10, width: 20, height: 20,
    alignItems: 'center', justifyContent: 'center',
  },
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
  zoomHint: {
    position: 'absolute', top: Spacing.sm, right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 3,
    flexDirection: 'row', alignItems: 'center', gap: 4,
  },
  zoomHintText: { color: '#fff', fontSize: 10, fontWeight: '600' },
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
