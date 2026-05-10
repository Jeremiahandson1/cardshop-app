// Store staff intake — the fast-path flow for bringing a card
// into a shop's inventory. Designed to clear one card in ~30s at
// the counter:
//
//   Scan QR  →  pick card from cascade (or cert-lookup for slabs)
//            →  condition + price + optional notes + photos
//            →  Save
//
// On Save we POST /api/cards with status='listed' so it's
// immediately searchable across the chain, and we link the
// qr_insert_id so scanning the sticker later returns the whole
// record.
//
// This screen doesn't reproduce the full RegisterCardScreen — it
// skips collector-only fields (purchase_price, personal_valuation,
// private notes, serial_number prompts) to keep the flow tight.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';

import {
  Button, Input, ScreenHeader, LoadingScreen,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { cardsApi, qrApi, catalogApi, storeInventoryApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

const CONDITIONS = [
  { value: 'gem_mint',  label: 'Gem Mint' },
  { value: 'mint',      label: 'Mint' },
  { value: 'near_mint', label: 'Near Mint' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'very_good', label: 'Very Good' },
  { value: 'good',      label: 'Good' },
  { value: 'fair',      label: 'Fair' },
  { value: 'poor',      label: 'Poor' },
];

// Stages of the intake flow. Order matters — we photograph the
// card BEFORE applying the QR sticker so the sticker doesn't
// obscure any part of the card during the vision scan. The QR
// sticker scan is the LAST step, right before save.
const STAGE = {
  VISION:  'vision',  // capture front + back, vision identifies the card
  CARD:    'card',    // confirm the catalog match (or fall back to search)
  DETAILS: 'details', // condition, price, notes
  QR:      'qr',      // scan the sticker that's now on the card
  SAVING:  'saving',
};

export const StoreIntakeScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [stage, setStage] = useState(STAGE.VISION);
  const [scannedQr, setScannedQr] = useState(null); // { code, short_code, id } on unregistered scan
  const [selectedCatalog, setSelectedCatalog] = useState(null); // { id, player_name, ... }
  const [locationId, setLocationId] = useState('');
  // Vision-scan output — candidates the model surfaced + raw fields.
  // Used to pre-select on the CARD stage so staff can confirm with
  // one tap instead of typing a search.
  const [visionCandidates, setVisionCandidates] = useState([]);
  const [visionAnalyzing, setVisionAnalyzing] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Details form
  const [condition, setCondition] = useState('near_mint');
  const [askingPrice, setAskingPrice] = useState('');
  const [publicNotes, setPublicNotes] = useState('');
  const [frontPhoto, setFrontPhoto] = useState(null); // base64 data URL
  const [backPhoto, setBackPhoto] = useState(null);

  const qc = useQueryClient();

  // Pre-load the user's locations. If they only belong to one
  // location, preselect it so there's no dropdown to touch.
  const { data: locData } = useQuery({
    queryKey: ['store-locations'],
    queryFn: () => storeInventoryApi.myLocations().then((r) => r.data),
  });
  const locations = locData?.locations || [];
  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0].id);
  }, [locations, locationId]);

  // ============================================================
  // Stage 1 — Vision pair scan (front + back)
  // ============================================================
  const [permission, requestPermission] = useCameraPermissions();
  const [scanBusy, setScanBusy] = useState(false);

  // Capture an in-app camera shot, resize to 1024 wide, return
  // { uri, b64 } or null on cancel. Mirrors RegisterCardScreen.
  const captureAndResize = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera needed', 'Enable camera to scan a card.');
      return null;
    }
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
      b64 = resized.base64; uri = resized.uri;
    } catch { /* fall back to original */ }
    return { uri, b64 };
  };

  // Two-photo capture → pair-scan vision call. Identifies the card,
  // pre-fills frontPhoto + backPhoto for the save payload, jumps to
  // the CARD stage with candidates ready to confirm.
  const runPairScan = async () => {
    setScanBusy(true);
    try {
      const front = await captureAndResize();
      if (!front) { setScanBusy(false); return; }
      Alert.alert('Now flip the card', 'Capture the back of the same card.', [
        { text: 'Cancel', style: 'cancel', onPress: () => setScanBusy(false) },
        {
          text: 'Capture back',
          onPress: async () => {
            const back = await captureAndResize();
            if (!back) { setScanBusy(false); return; }
            setFrontPhoto(`data:image/jpeg;base64,${front.b64}`);
            setBackPhoto(`data:image/jpeg;base64,${back.b64}`);
            setVisionAnalyzing(true);
            try {
              const res = await catalogApi.scanVisionPair(
                `data:image/jpeg;base64,${front.b64}`,
                `data:image/jpeg;base64,${back.b64}`,
              );
              const cands = res.data?.candidates || [];
              setVisionCandidates(cands);
              // If there's a single high-confidence top candidate,
              // pre-select and skip straight to details — keeps the
              // counter flow tight when the model is confident.
              if (cands.length === 1 && (res.data?.fields?.confidence ?? 0) >= 0.9) {
                setSelectedCatalog(cands[0]);
                setStage(STAGE.DETAILS);
              } else {
                setStage(STAGE.CARD);
              }
            } catch (err) {
              // Vision down? Fall back to manual search; the card
              // photos are already captured so no work is lost.
              setShowManualSearch(true);
              setStage(STAGE.CARD);
              Alert.alert('Vision unavailable', 'Search for the card manually — photos are saved.');
            } finally {
              setVisionAnalyzing(false);
              setScanBusy(false);
            }
          },
        },
      ]);
    } catch (err) {
      Alert.alert('Capture failed', err?.message || 'Try again.');
      setScanBusy(false);
    }
  };

  // ============================================================
  // Stage 4 — QR sticker scan (the last step before save)
  // ============================================================
  const handleQrScan = useCallback(async ({ data }) => {
    if (scanBusy) return;
    setScanBusy(true);
    try {
      const raw = String(data || '').trim();
      const code = /^[0-9A-Za-z]{6,}$/.test(raw) ? raw : raw.replace(/^cardshop:\/\/(card\/|c\/)?/i, '');
      const { data: look } = await qrApi.lookup(code);
      if (look.status === 'superseded') {
        Alert.alert(
          'Outdated sticker',
          'This QR was replaced. Use a blank sticker instead.',
        );
        setScanBusy(false);
        return;
      }
      if (look.status !== 'unregistered') {
        Alert.alert(
          'Already registered',
          'This QR is already linked to a card. Use a blank sticker.',
        );
        setScanBusy(false);
        return;
      }
      setScannedQr({ code: look.code, short_code: look.short_code, id: look.id });
      // QR is the last step — fire save immediately.
      setStage(STAGE.SAVING);
      saveMut.mutate();
    } catch (err) {
      Alert.alert('Scan failed', err?.response?.data?.error || err?.message || 'Try again.');
    } finally {
      setScanBusy(false);
    }
  }, [scanBusy]);

  // ============================================================
  // Stage 2 — catalog card search
  // ============================================================
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);

  const runSearch = async () => {
    if (!searchQ.trim()) return;
    setSearchBusy(true);
    try {
      const res = await catalogApi.search({ q: searchQ.trim(), limit: 20 });
      setSearchResults(res.data?.cards || res.data || []);
    } catch (err) {
      Alert.alert('Search failed', err?.message || 'Try again.');
    } finally {
      setSearchBusy(false);
    }
  };

  // ============================================================
  // Stage 3 — photos
  // ============================================================
  const captureImage = async (setter) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera access', 'We need camera access to capture card photos.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.75,
      base64: false,
    });
    if (r.canceled) return;
    const asset = r.assets[0];
    try {
      const b64 = asset.base64
        || await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const mime = asset.mimeType || 'image/jpeg';
      setter(`data:${mime};base64,${b64}`);
    } catch (err) {
      Alert.alert('Photo error', err?.message || 'Could not read the photo.');
    }
  };

  // ============================================================
  // Save
  // ============================================================
  const saveMut = useMutation({
    mutationFn: async () => {
      if (!selectedCatalog?.id) throw new Error('Pick a card first');
      if (!locationId) throw new Error('Pick a location');
      if (!askingPrice) throw new Error('Asking price is required');
      const price = Number(askingPrice);
      if (!Number.isFinite(price) || price <= 0) throw new Error('Enter a valid price');
      const payload = {
        catalog_id: selectedCatalog.id,
        qr_insert_code: scannedQr?.code,
        status: 'listed',
        asking_price: price,
        condition,
        public_notes: publicNotes || undefined,
        store_location_id: locationId,
        photo_urls: [frontPhoto, backPhoto].filter(Boolean),
      };
      const res = await cardsApi.register(payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cards-mine'] });
      qc.invalidateQueries({ queryKey: ['inventory-search'] });
      resetForm();
      Alert.alert('Added to inventory', 'Card is live across every location. Ready for the next one.');
    },
    onError: (err) => {
      Alert.alert('Could not save', err?.response?.data?.error || err?.message || 'Try again.');
      setStage(STAGE.DETAILS);
    },
  });

  const resetForm = () => {
    setStage(STAGE.VISION);
    setScannedQr(null);
    setSelectedCatalog(null);
    setCondition('near_mint');
    setAskingPrice('');
    setPublicNotes('');
    setFrontPhoto(null);
    setBackPhoto(null);
    setSearchQ('');
    setSearchResults([]);
    setVisionCandidates([]);
    setShowManualSearch(false);
  };

  // ============================================================
  // Render
  // ============================================================
  const cardTitle = selectedCatalog
    ? [selectedCatalog.year, selectedCatalog.set_name, selectedCatalog.player_name].filter(Boolean).join(' · ')
    : '';

  if (!user || !['store_owner', 'store_staff', 'admin'].includes(user.role)) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Store Intake" />
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.muted}>Store staff only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScreenHeader
        title={
          stage === STAGE.VISION ? 'Photograph the card'
          : stage === STAGE.QR     ? 'Scan QR sticker'
          : 'Intake card'
        }
        subtitle={locations.length > 0 ? locations.find((l) => l.id === locationId)
          ? `${locations.find((l) => l.id === locationId).store_name} — ${locations.find((l) => l.id === locationId).name}`
          : undefined
          : undefined}
        right={stage !== STAGE.VISION ? (
          <TouchableOpacity onPress={resetForm}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        ) : undefined}
      />

      {/* VISION: capture the card UNOBSCURED before the sticker
          goes on. This is the change from the old QR-first flow —
          previously you applied the sticker first, which obscured
          part of the card and degraded vision recognition. */}
      {stage === STAGE.VISION && (
        <View style={{ flex: 1, padding: Spacing.base }}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.lg, paddingHorizontal: Spacing.lg }}>
            <Ionicons name="camera-outline" size={64} color={Colors.accent} />
            <Text style={[styles.cardTitle, { textAlign: 'center' }]}>Photograph the card first</Text>
            <Text style={[styles.muted, { textAlign: 'center', lineHeight: 20 }]}>
              Capture the front, then the back, BEFORE applying the QR sticker.
              Our AI will identify the card so you don't have to type the catalog info.
            </Text>
            {visionAnalyzing ? (
              <View style={{ alignItems: 'center', gap: Spacing.sm }}>
                <Text style={styles.muted}>Analyzing both photos…</Text>
              </View>
            ) : (
              <Button
                title={scanBusy ? 'Capturing…' : 'Start scan (front + back)'}
                onPress={runPairScan}
                disabled={scanBusy}
                style={{ alignSelf: 'stretch' }}
              />
            )}
            <TouchableOpacity onPress={() => { setShowManualSearch(true); setStage(STAGE.CARD); }}>
              <Text style={[styles.muted, { color: Colors.accent }]}>Or pick the card manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* QR: scan the sticker AFTER the card is photographed and
          its details are entered. By this point the sticker is
          physically on the card; scanning fires save immediately. */}
      {stage === STAGE.QR && (
        <View style={{ flex: 1 }}>
          {!permission ? (
            <LoadingScreen />
          ) : !permission.granted ? (
            <View style={styles.centered}>
              <Text style={styles.muted}>Camera permission needed to scan stickers.</Text>
              <Button title="Grant camera access" onPress={requestPermission} />
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              onBarcodeScanned={handleQrScan}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            >
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Point at the sticker you just applied to this card</Text>
              </View>
            </CameraView>
          )}
        </View>
      )}

      {stage === STAGE.CARD && (
        <ScrollView contentContainerStyle={styles.pad}>
          {visionCandidates.length > 0 && !showManualSearch && (
            <>
              <Text style={styles.sectionLabel}>Vision matches — tap to confirm</Text>
              {visionCandidates.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.catalogRow}
                  onPress={() => { setSelectedCatalog(c); setStage(STAGE.DETAILS); }}
                >
                  <Text style={styles.catalogTitle}>
                    {[c.year, c.set_name, c.player_name].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.muted}>
                    {c.card_number ? `#${c.card_number}` : ''}
                    {c.parallel ? ` · ${c.parallel}` : ''}
                    {c.manufacturer ? ` · ${c.manufacturer}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowManualSearch(true)}
                style={{ alignItems: 'center', paddingVertical: Spacing.md }}
              >
                <Text style={[styles.muted, { color: Colors.accent }]}>None of these — search manually</Text>
              </TouchableOpacity>
            </>
          )}

          {(showManualSearch || visionCandidates.length === 0) && (
            <>
              <Text style={styles.sectionLabel}>Search the catalog</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={{ flex: 1 }}>
                  <Input
                    placeholder="Player, set, year, parallel…"
                    value={searchQ}
                    onChangeText={setSearchQ}
                    onSubmitEditing={runSearch}
                    returnKeyType="search"
                  />
                </View>
                <Button title="Search" onPress={runSearch} />
              </View>
              {searchBusy && <Text style={styles.muted}>Searching…</Text>}
              {searchResults.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.catalogRow}
                  onPress={() => { setSelectedCatalog(c); setStage(STAGE.DETAILS); }}
                >
                  <Text style={styles.catalogTitle}>
                    {[c.year, c.set_name, c.player_name].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.muted}>
                    {c.card_number ? `#${c.card_number}` : ''}
                    {c.parallel ? ` · ${c.parallel}` : ''}
                    {c.manufacturer ? ` · ${c.manufacturer}` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </ScrollView>
      )}

      {stage === STAGE.DETAILS && (
        <ScrollView contentContainerStyle={styles.pad}>
          {/* Photos pill — confirms vision capture is complete; the
              old QR pill that lived here moved to the post-DETAILS
              QR stage since the sticker scan is now the last step. */}
          {(frontPhoto || backPhoto) ? (
            <View style={[styles.qrPill, { backgroundColor: 'rgba(74,222,128,0.15)', borderColor: '#4ade80' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#4ade80" />
              <Text style={[styles.qrPillText, { color: '#4ade80' }]}>
                Photos captured ({frontPhoto ? 'front' : ''}{frontPhoto && backPhoto ? ' + back' : (backPhoto ? 'back' : '')})
              </Text>
            </View>
          ) : null}

          <Text style={styles.cardTitle}>{cardTitle}</Text>
          <TouchableOpacity onPress={() => setStage(STAGE.CARD)}>
            <Text style={[styles.muted, { color: Colors.accent, marginBottom: Spacing.md }]}>Change card</Text>
          </TouchableOpacity>

          {locations.length > 1 && (
            <>
              <Text style={styles.sectionLabel}>Location</Text>
              <View style={styles.chipRow}>
                {locations.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.chip, locationId === l.id && styles.chipOn]}
                    onPress={() => setLocationId(l.id)}
                  >
                    <Text style={[styles.chipText, locationId === l.id && styles.chipTextOn]}>{l.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>Condition</Text>
          <View style={styles.chipRow}>
            {CONDITIONS.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[styles.chip, condition === c.value && styles.chipOn]}
                onPress={() => setCondition(c.value)}
              >
                <Text style={[styles.chipText, condition === c.value && styles.chipTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionLabel}>Asking price *</Text>
          <Input
            value={askingPrice}
            onChangeText={setAskingPrice}
            placeholder="e.g. 20"
            keyboardType="decimal-pad"
          />

          <Text style={styles.sectionLabel}>Public notes</Text>
          <Input
            value={publicNotes}
            onChangeText={setPublicNotes}
            placeholder="Centering notes, corner wear, anything customers should know"
            multiline
            numberOfLines={3}
            autoCapitalize="sentences"
          />

          {/* Photos already captured in the VISION stage. Allow
              retake here in case lighting was bad, but don't make
              capture a required step — the vision pair scan was
              the gate. */}
          {(!frontPhoto || !backPhoto) && (
            <>
              <Text style={styles.sectionLabel}>Photos (optional retake)</Text>
              <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                <TouchableOpacity style={styles.photoSlot} onPress={() => captureImage(setFrontPhoto)}>
                  {frontPhoto ? (
                    <Text style={styles.photoHint}>✓ Front (tap to retake)</Text>
                  ) : (
                    <><Ionicons name="camera" size={24} color={Colors.accent} /><Text style={styles.photoHint}>Front</Text></>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoSlot} onPress={() => captureImage(setBackPhoto)}>
                  {backPhoto ? (
                    <Text style={styles.photoHint}>✓ Back (tap to retake)</Text>
                  ) : (
                    <><Ionicons name="camera-reverse" size={24} color={Colors.accent} /><Text style={styles.photoHint}>Back</Text></>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Move to QR scan instead of saving — sticker is the
              physical last step and pairs the just-applied label
              to the now-finalized card record. If a save retry is
              landing back here (QR already scanned but save errored),
              the button becomes a direct save instead of re-scanning. */}
          {scannedQr ? (
            <Button
              title={saveMut.isPending ? 'Saving…' : `Save (sticker ${scannedQr.short_code || scannedQr.code?.slice(0,8)})`}
              onPress={() => saveMut.mutate()}
              disabled={saveMut.isPending || !askingPrice || !locationId}
              style={{ marginTop: Spacing.lg }}
            />
          ) : (
            <Button
              title="Apply sticker → Scan QR"
              onPress={() => setStage(STAGE.QR)}
              disabled={!askingPrice || !locationId}
              style={{ marginTop: Spacing.lg }}
            />
          )}
        </ScrollView>
      )}

      {stage === STAGE.SAVING && (
        <View style={styles.centered}>
          <Text style={styles.muted}>Saving to inventory…</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.lg, gap: Spacing.md },
  pad: { padding: Spacing.base, paddingBottom: Spacing.xxxl },
  muted: { color: Colors.textMuted, fontSize: Typography.sm },
  sectionLabel: {
    color: Colors.textMuted, fontSize: Typography.xs,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: Spacing.md, marginBottom: Spacing.xs, fontWeight: Typography.semibold,
  },
  qrPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.accent + '22', borderColor: Colors.accent, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full, marginBottom: Spacing.md,
  },
  qrPillText: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 0.3 },

  catalogRow: {
    backgroundColor: Colors.surface, padding: Spacing.md,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  catalogTitle: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold, marginBottom: 2 },

  cardTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginBottom: 4 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  chipTextOn: { color: Colors.bg, fontWeight: Typography.semibold },

  photoSlot: {
    flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    padding: Spacing.md,
  },
  photoHint: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 6, textAlign: 'center' },

  scanOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  scanFrame: { width: 240, height: 240, borderWidth: 2, borderColor: Colors.accent, borderRadius: Radius.md },
  scanHint: { color: '#fff', fontSize: Typography.sm, marginTop: Spacing.lg, textAlign: 'center', paddingHorizontal: Spacing.lg },
});
