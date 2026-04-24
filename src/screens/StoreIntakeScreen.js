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

// Stages of the intake flow. Keeping them explicit makes the flow
// easy to follow — each stage has a single responsibility.
const STAGE = {
  SCAN: 'scan',       // employee scans a QR (the sticker they just applied)
  CARD: 'card',       // pick the card via cascade / cert / manual
  DETAILS: 'details', // condition, price, notes, photos
  SAVING: 'saving',
};

export const StoreIntakeScreen = ({ navigation }) => {
  const user = useAuthStore((s) => s.user);
  const [stage, setStage] = useState(STAGE.SCAN);
  const [scannedQr, setScannedQr] = useState(null); // { code, short_code, id } on unregistered scan
  const [selectedCatalog, setSelectedCatalog] = useState(null); // { id, player_name, ... }
  const [locationId, setLocationId] = useState('');

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
  // Stage 1 — QR scan
  // ============================================================
  const [permission, requestPermission] = useCameraPermissions();
  const [scanBusy, setScanBusy] = useState(false);

  const handleScan = useCallback(async ({ data }) => {
    if (scanBusy) return;
    setScanBusy(true);
    try {
      const raw = String(data || '').trim();
      // Accept bare short codes (8-12 chars A-Z0-9) or full UUIDs
      const code = /^[0-9A-Za-z]{6,}$/.test(raw) ? raw : raw.replace(/^cardshop:\/\/(card\/|c\/)?/i, '');
      const { data: look } = await qrApi.lookup(code);
      if (look.status === 'superseded') {
        Alert.alert(
          'Outdated sticker',
          'This QR was replaced. Do not reuse — grab a blank sticker from the sheet instead. ' +
          'The old sticker is kept in the ledger as evidence that it was superseded.',
        );
        setScanBusy(false);
        return;
      }
      if (look.status !== 'unregistered') {
        Alert.alert(
          'Already registered',
          'This QR is already linked to a card. Use a blank sticker or scan in Card Detail instead.',
        );
        setScanBusy(false);
        return;
      }
      setScannedQr({ code: look.code, short_code: look.short_code, id: look.id });
      setStage(STAGE.CARD);
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
    setStage(STAGE.SCAN);
    setScannedQr(null);
    setSelectedCatalog(null);
    setCondition('near_mint');
    setAskingPrice('');
    setPublicNotes('');
    setFrontPhoto(null);
    setBackPhoto(null);
    setSearchQ('');
    setSearchResults([]);
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
        title={stage === STAGE.SCAN ? 'Scan QR sticker' : 'Intake card'}
        subtitle={locations.length > 0 ? locations.find((l) => l.id === locationId)
          ? `${locations.find((l) => l.id === locationId).store_name} — ${locations.find((l) => l.id === locationId).name}`
          : undefined
          : undefined}
        right={stage !== STAGE.SCAN ? (
          <TouchableOpacity onPress={resetForm}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        ) : undefined}
      />

      {stage === STAGE.SCAN && (
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
              onBarcodeScanned={handleScan}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            >
              <View style={styles.scanOverlay}>
                <View style={styles.scanFrame} />
                <Text style={styles.scanHint}>Point at the QR sticker you just applied</Text>
              </View>
            </CameraView>
          )}
        </View>
      )}

      {stage === STAGE.CARD && (
        <ScrollView contentContainerStyle={styles.pad}>
          <View style={styles.qrPill}>
            <Ionicons name="qr-code" size={16} color={Colors.accent} />
            <Text style={styles.qrPillText}>Sticker {scannedQr?.short_code || scannedQr?.code?.slice(0, 8)}</Text>
          </View>

          <Text style={styles.sectionLabel}>Which card is this?</Text>
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
        </ScrollView>
      )}

      {stage === STAGE.DETAILS && (
        <ScrollView contentContainerStyle={styles.pad}>
          <View style={styles.qrPill}>
            <Ionicons name="qr-code" size={16} color={Colors.accent} />
            <Text style={styles.qrPillText}>Sticker {scannedQr?.short_code || scannedQr?.code?.slice(0, 8)}</Text>
          </View>

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

          <Text style={styles.sectionLabel}>Photos</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
            <TouchableOpacity style={styles.photoSlot} onPress={() => captureImage(setFrontPhoto)}>
              {frontPhoto ? (
                <Text style={styles.photoHint}>✓ Front captured (tap to retake)</Text>
              ) : (
                <>
                  <Ionicons name="camera" size={24} color={Colors.accent} />
                  <Text style={styles.photoHint}>Front</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoSlot} onPress={() => captureImage(setBackPhoto)}>
              {backPhoto ? (
                <Text style={styles.photoHint}>✓ Back captured (tap to retake)</Text>
              ) : (
                <>
                  <Ionicons name="camera-reverse" size={24} color={Colors.accent} />
                  <Text style={styles.photoHint}>Back</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <Button
            title={saveMut.isPending ? 'Saving…' : 'Save to inventory'}
            onPress={() => saveMut.mutate()}
            disabled={saveMut.isPending || !askingPrice || !locationId}
            style={{ marginTop: Spacing.lg }}
          />
        </ScrollView>
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
