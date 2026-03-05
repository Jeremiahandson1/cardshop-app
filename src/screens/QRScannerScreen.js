import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { qrApi } from '../services/api';
import { Colors, Typography, Spacing, Radius } from '../theme';
import { Button } from '../components/ui';

export const QRScannerScreen = ({ navigation, route }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanGuardRef = useRef(false);
  const mode = route?.params?.mode || 'register'; // 'register' | 'lookup'

  const handleBarCodeScanned = async ({ data }) => {
    if (scanGuardRef.current) return;
    scanGuardRef.current = true;

    // Extract code from deep link: cardshop://card/UUID
    let code = data;
    if (data.includes('cardshop://card/')) {
      code = data.replace('cardshop://card/', '');
    }

    setScanned(true);
    setScanning(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      const res = await qrApi.lookup(code);
      const insert = res.data;

      if (mode === 'register') {
        if (insert.status === 'unregistered') {
          // Navigate to registration flow with this code
          navigation.replace('RegisterCard', { qrCode: code });
        } else if (insert.owned_card_id) {
          // Show the card this QR is tied to
          navigation.replace('CardDetail', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Already Registered', 'This QR insert has already been used but the card is no longer available.');
          setScanned(false);
          setScanning(false);
          scanGuardRef.current = false;
        }
      } else if (mode === 'transfer') {
        if (insert.owned_card_id) {
          navigation.replace('InitiateTransfer', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Not Registered', 'This card has not been registered yet.');
          setScanned(false);
          setScanning(false);
          scanGuardRef.current = false;
        }
      } else {
        // Just lookup
        if (insert.owned_card_id) {
          navigation.replace('CardDetail', { cardId: insert.owned_card_id });
        } else {
          Alert.alert('Unregistered', 'This QR insert has not been registered to a card yet.', [
            { text: 'Register It', onPress: () => navigation.replace('RegisterCard', { qrCode: code }) },
            { text: 'Cancel', onPress: () => { setScanned(false); scanGuardRef.current = false; }, style: 'cancel' }
          ]);
          setScanning(false);
        }
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to look up QR code');
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
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Dark overlay with cutout feel */}
      <View style={styles.overlay}>
        {/* Top bar */}
        <SafeAreaView>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.topTitle}>
              {mode === 'register' ? 'Scan QR Insert' : mode === 'transfer' ? 'Scan to Transfer' : 'Scan Card'}
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
          <Text style={styles.hint}>Point at the QR code on your card insert</Text>
        </View>

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
});
