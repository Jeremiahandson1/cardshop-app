import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { qrApi, cardsApi } from '../services/api';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button } from '../components/ui';

export const QRScannerScreen = ({ navigation, route }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  // Camera zoom (0 = none, 1 = max). Needed for small printed
  // QR stickers (sub-12mm) where the camera has trouble locking
  // on at normal hand-distance — the user can crank zoom up
  // and bring the QR into focus without physically getting their
  // phone within 2 inches of the sticker.
  const [zoom, setZoom] = useState(0);
  const scanGuardRef = useRef(false);
  const mode = route?.params?.mode || 'register'; // 'register' | 'lookup' | 'transfer' | 'attach'
  const cardIdToAttach = route?.params?.cardId || null;

  const handleBarCodeScanned = async (event) => {
    if (scanGuardRef.current) return;
    scanGuardRef.current = true;

    // Defensive: barcode scanner sometimes hands back odd shapes
    // (numeric, buffer, missing data). Coerce to string and bail
    // gracefully if there's nothing usable.
    let data = '';
    try {
      data = String(event?.data ?? '');
    } catch {
      data = '';
    }
    if (!data) {
      Alert.alert('Scan failed', 'No data read from QR code. Try again.');
      scanGuardRef.current = false;
      return;
    }

    // QR payloads we accept:
    //   - bare 8-char short code           "ABCD1234"
    //   - bare UUID                        "550e8400-e29b-..."
    //   - app deep link                    "cardshop://card/<id>"
    //   - public web URL (new format)      "https://.../c/<short_code>"
    // The web URL is what stock phone cameras actually dispatch on,
    // so existing stickers keep working AND newly-printed stickers
    // can be scanned by anyone.
    let code = data;
    const cardshopMatch = /cardshop:\/\/(?:card|c)\/([A-Za-z0-9-]+)/.exec(data);
    const httpsMatch    = /https?:\/\/[^/]+\/c\/([A-Za-z0-9-]+)/.exec(data);
    if (httpsMatch)         code = httpsMatch[1];
    else if (cardshopMatch) code = cardshopMatch[1];

    setScanned(true);
    setScanning(true);
    // Haptics is best-effort. If the module isn't available
    // (rare native bundling edge case), don't crash the scan flow.
    try {
      if (Haptics?.notificationAsync) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { /* ignore */ }

    const resetScanner = () => {
      setScanned(false);
      setScanning(false);
      scanGuardRef.current = false;
    };

    try {
      const res = await qrApi.lookup(code);
      const insert = res.data;

      // Superseded — this sticker was replaced. Tell the user
      // explicitly so they don't mistakenly think the card has a
      // problem. Offer to jump to the current sticker's card if we
      // can resolve the owned_card_id. Never silently route to
      // CardDetail — that would mask the provenance signal.
      if (insert.status === 'superseded') {
        const supersededWhen = insert.superseded_at
          ? new Date(insert.superseded_at).toLocaleDateString() : 'earlier';
        const cardName = insert.card
          ? [insert.card.year, insert.card.set_name, insert.card.player_name].filter(Boolean).join(' · ')
          : 'this card';
        const actions = [
          { text: 'OK', onPress: resetScanner, style: 'cancel' },
        ];
        if (insert.owned_card_id) {
          actions.unshift({
            text: 'View current card',
            onPress: () => navigation.navigate('CardDetail', { cardId: insert.owned_card_id }),
          });
        }
        Alert.alert(
          'Outdated sticker',
          `This sticker was replaced on ${supersededWhen}.\n\n` +
          `${cardName} still lives in Card Shop — ask the current owner to scan their up-to-date sticker for full provenance.`,
          actions,
        );
        return;
      }

      if (mode === 'attach') {
        if (!cardIdToAttach) {
          Alert.alert('Attach failed', 'No card ID provided to attach the QR to.');
          resetScanner();
          return;
        }
        if (insert.status !== 'unregistered') {
          Alert.alert(
            'Sticker already used',
            'This QR sticker is already attached to a card. Use a fresh sticker.',
          );
          resetScanner();
          return;
        }
        try {
          await cardsApi.update(cardIdToAttach, { qr_insert_code: code });
          try {
            if (Haptics?.notificationAsync) {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          } catch { /* ignore */ }
          Alert.alert(
            'Sticker attached',
            'This QR is now linked to your card. Scan it any time to view, transfer, or verify ownership.',
            [{ text: 'OK', onPress: () => navigation.goBack() }],
          );
        } catch (err) {
          const code = err?.response?.data?.code;
          const msg = err?.response?.data?.error || 'Could not attach the sticker.';
          Alert.alert(
            code === 'qr_already_attached' ? 'Card already has a sticker' : 'Attach failed',
            msg,
          );
          resetScanner();
        }
        return;
      }

      // Hide the "Scanning..." indicator before navigate so it
      // doesn't look stuck. Keep `scanned: true` so the camera
      // stays paused — if the navigate silently no-ops we don't
      // want it re-firing on the same code in an infinite loop.
      // The Scan tab uses QRScannerScreen directly as the tab
      // content (no stack wrapper). When the user enters from the
      // bottom Scan tab, our navigation prop is the bottom-tab
      // navigator — it can only see sibling tabs (Binders, Trade,
      // LCS, Profile), not the screens nested inside them. So
      // `navigate('CardDetail')` from here silently no-ops.
      //
      // The fix is the tab/stack nested-navigation form:
      //   navigation.navigate('Binders', { screen: 'CardDetail', params: {...} })
      // which switches to the Binders tab AND tells its stack to
      // push CardDetail. CardDetail/RegisterCard/InitiateTransfer
      // all live in BinderStack so we route everything through it.
      const goNavigate = (name, params) => {
        setScanning(false);
        try {
          const state = navigation.getState?.();
          const currentRoutes = state?.routes?.map((r) => r.name) || [];
          // If we're at the tab-root level (current stack contains
          // the tab names), route via the Binders stack which holds
          // the target screens. Otherwise we're inside a stack
          // already and a direct navigate works.
          const isTabRoot = currentRoutes.includes('Binders') && currentRoutes.includes('Profile');
          if (isTabRoot) {
            navigation.navigate('Binders', { screen: name, params });
          } else {
            navigation.navigate(name, params);
          }
        } catch (e) {
          Alert.alert('Navigation failed', e?.message || 'unknown');
          resetScanner();
        }
      };

      if (mode === 'register') {
        if (insert.status === 'unregistered') {
          goNavigate('RegisterCard', { qrCode: code });
        } else if (insert.owned_card_id) {
          goNavigate('CardDetail', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Already Registered', 'This QR insert has already been used but the card is no longer available.');
          resetScanner();
        }
      } else if (mode === 'transfer') {
        if (insert.owned_card_id) {
          goNavigate('InitiateTransfer', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Not Registered', 'This card has not been registered yet.');
          resetScanner();
        }
      } else {
        // Just lookup
        if (insert.owned_card_id) {
          goNavigate('CardDetail', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Unregistered', 'This QR insert has not been registered to a card yet.', [
            { text: 'Register It', onPress: () => goNavigate('RegisterCard', { qrCode: code }) },
            { text: 'Cancel', onPress: resetScanner, style: 'cancel' },
          ]);
          setScanning(false);
        }
      }
    } catch (err) {
      const url = err?.config?.baseURL || err?.config?.url || '?';
      const status = err?.response?.status || 'no_response';
      const msg = err?.response?.data?.error || err?.message || 'unknown';
      // First 4 lines of stack trace — pinpoints which line in the
      // scanner is actually throwing. Strip file:// prefixes so the
      // alert is readable on a phone screen.
      const stack = (err?.stack || '')
        .split('\n')
        .slice(0, 4)
        .map((s) => s.trim().replace(/file:\/\/[^/]+\//, ''))
        .join('\n');
      Alert.alert(
        'Scan failed',
        `data="${data.slice(0, 60)}"\ncode="${code.slice(0, 60)}"\nmode=${mode}\n\n${msg}\nstatus=${status}\nurl=${url}\n\nstack:\n${stack}`,
      );
      setScanned(false);
      setScanning(false);
      scanGuardRef.current = false;
    }
  };

  if (!permission) return <View style={styles.safe} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.permContainer}>
          <Text style={{ fontSize: 48, marginBottom: Spacing.lg }}>📷</Text>
          <Text style={styles.permTitle}>Camera Access Needed</Text>
          <Text style={styles.permSub}>Card Shop needs camera access to scan QR codes on your cards</Text>
          <Button title="Grant Permission" onPress={requestPermission} style={{ marginTop: Spacing.xl }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        zoom={zoom}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      {/* Tap-to-zoom: tapping anywhere on the camera preview
          toggles between 1× and 5×. Lets the user frame the
          whole card to confirm what they're scanning, then tap
          to instantly zoom on the QR for the actual decode.
          Lives behind the overlay chrome so it doesn't intercept
          taps on the close button, zoom chips, or rescan button. */}
      <TouchableOpacity
        style={StyleSheet.absoluteFillObject}
        activeOpacity={1}
        onPress={() => setZoom((z) => (z > 0 ? 0 : 0.5))}
      />

      {/* Dark overlay with cutout feel */}
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Top bar */}
        <SafeAreaView>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>
              {mode === 'register' ? 'Scan QR Insert'
                : mode === 'transfer' ? 'Scan to Transfer'
                : mode === 'attach' ? 'Attach Sticker'
                : 'Scan Card'}
            </Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>

        {/* Scanner frame */}
        <View style={styles.frameArea}>
          <View style={styles.frame}>
            {/* Corner markers */}
            {[
              { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((corner, i) => (
              <View key={i} style={[styles.corner, corner]} />
            ))}
            {scanning && (
              <View style={styles.scanningIndicator}>
                <Text style={styles.scanningText}>Scanning...</Text>
              </View>
            )}
          </View>
          {/* Hide the bottom hint once a scan completes — it covers
              up React Native LogBox warnings that surface there. */}
          {!scanned ? (
            <Text style={styles.hint}>
              {zoom > 0
                ? 'Zoomed 5× · tap anywhere to zoom out'
                : 'Frame the card · tap anywhere to zoom 5× on the QR'}
            </Text>
          ) : null}
        </View>

        {/* Zoom control — tappable 1x / 2x / 5x / 10x preset chips
            so users scanning small (sub-12mm) stickers can pull
            the QR into focus from arm's length instead of having
            to bring the phone within an inch of the sticker. */}
        {!scanned && (
          <View style={styles.zoomBar}>
            {[
              { label: '1×',  v: 0    },
              { label: '2×',  v: 0.2  },
              { label: '5×',  v: 0.5  },
              { label: '10×', v: 0.85 },
            ].map((step) => {
              const active = Math.abs(zoom - step.v) < 0.05;
              return (
                <TouchableOpacity
                  key={step.label}
                  onPress={() => setZoom(step.v)}
                  style={[styles.zoomChip, active ? styles.zoomChipActive : null]}
                >
                  <Text style={[styles.zoomChipText, active ? styles.zoomChipTextActive : null]}>
                    {step.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Bottom actions */}
        <View style={styles.bottomBar}>
          {scanned && !scanning && (
            <TouchableOpacity style={styles.rescanBtn} onPress={() => { setScanned(false); scanGuardRef.current = false; }}>
              <Text style={styles.rescanText}>Tap to Scan Again</Text>
            </TouchableOpacity>
          )}
          {mode === 'register' && (
            <TouchableOpacity
              style={styles.manualBtn}
              onPress={() => navigation.navigate('RegisterCard', {})}
            >
              <Text style={styles.manualText}>Enter manually instead</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  container: { flex: 1 },
  permContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxxl
  },
  permTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, textAlign: 'center', marginBottom: Spacing.sm },
  permSub: { color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center', lineHeight: 22 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  frameArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl },
  frame: {
    width: 240, height: 240,
    position: 'relative',
  },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: Colors.accent,
  },
  scanningIndicator: {
    position: 'absolute', bottom: -40, left: 0, right: 0, alignItems: 'center',
  },
  scanningText: { color: Colors.accent, fontSize: Typography.sm },
  hint: { color: 'rgba(255,255,255,0.7)', fontSize: Typography.sm, textAlign: 'center' },
  bottomBar: { paddingBottom: 48, paddingHorizontal: Spacing.xl, alignItems: 'center', gap: Spacing.md },
  rescanBtn: {
    backgroundColor: Colors.accent, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md, borderRadius: Radius.full,
  },
  rescanText: { color: Colors.bg, fontWeight: Typography.bold, fontSize: Typography.base },
  manualBtn: { paddingVertical: Spacing.sm },
  manualText: { color: 'rgba(255,255,255,0.5)', fontSize: Typography.sm },
  zoomBar: {
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  zoomChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  zoomChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  zoomChipText: {
    color: Colors.text, fontSize: 13, fontWeight: Typography.bold,
  },
  zoomChipTextActive: { color: Colors.bg },
});
