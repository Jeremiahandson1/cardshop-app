import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');
const FRAME_WIDTH = width * 0.8;
const FRAME_HEIGHT = FRAME_WIDTH * 1.4; // trading-card aspect ratio ~2.5:3.5

/**
 * Two-step card capture flow: FRONT, then BACK.
 * On complete, calls route.params.onComplete({ front, back }) where each
 * value is a base64 data URL ready to send to the API.
 */
export const TradeCameraScreen = ({ navigation, route }) => {
  const onComplete = route.params?.onComplete;
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState('front'); // 'front' | 'back'
  const [preview, setPreview] = useState(null); // { base64, uri } for current step
  const [frontData, setFrontData] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (permission && !permission.granted) {
      requestPermission();
    }
  }, [permission]);

  const takePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
        skipProcessing: false,
      });
      const dataUrl = `data:image/jpeg;base64,${photo.base64}`;
      setPreview({ uri: photo.uri, dataUrl });
    } catch (err) {
      console.warn('capture failed', err);
    } finally {
      setCapturing(false);
    }
  };

  const retake = () => setPreview(null);

  const confirm = () => {
    if (!preview) return;
    if (step === 'front') {
      setFrontData(preview.dataUrl);
      setPreview(null);
      setStep('back');
    } else {
      // Done — return both photos
      onComplete?.({ front: frontData, back: preview.dataUrl });
      navigation.goBack();
    }
  };

  // Permission gates
  if (!permission) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.accent} />
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Ionicons name="camera-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          Card verification requires you to capture fresh front and back photos
          of the card in hand. Tap below to grant access.
        </Text>
        <Button
          title="Grant camera access"
          onPress={requestPermission}
          style={{ marginTop: Spacing.lg }}
        />
        <Button
          title="Cancel"
          variant="secondary"
          onPress={() => navigation.goBack()}
          style={{ marginTop: Spacing.sm }}
        />
      </SafeAreaView>
    );
  }

  // Preview state — user took a photo, now confirms or retakes
  if (preview) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            Review {step === 'front' ? 'front' : 'back'}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.previewContainer}>
          <Image source={{ uri: preview.uri }} style={styles.previewImage} resizeMode="contain" />
        </View>
        <View style={styles.actions}>
          <Button title="Retake" variant="secondary" onPress={retake} style={{ flex: 1 }} />
          <Button
            title={step === 'front' ? 'Use front, capture back' : 'Use back, finish'}
            onPress={confirm}
            style={{ flex: 1.5 }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Capture state — live camera with overlay
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'front' ? 'Front of card' : 'Back of card'}
        </Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.cameraWrap}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back" />

        {/* Card frame overlay */}
        <View pointerEvents="none" style={styles.frameOverlay}>
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.frameHint}>
            Fill the frame with the {step === 'front' ? 'FRONT' : 'BACK'} of the card
          </Text>
        </View>
      </View>

      <View style={styles.shutterRow}>
        <View style={{ width: 40 }} />
        <TouchableOpacity
          style={[styles.shutter, capturing && styles.shutterCapturing]}
          onPress={takePhoto}
          disabled={capturing}
          activeOpacity={0.7}
        >
          {capturing ? <ActivityIndicator color={Colors.bg} /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
        <View style={{ width: 40 }}>
          <Text style={styles.stepIndicator}>{step === 'front' ? '1/2' : '2/2'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loadingContainer: {
    flex: 1, backgroundColor: Colors.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl,
  },
  permissionTitle: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    marginTop: Spacing.base,
  },
  permissionBody: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    textAlign: 'center',
    marginTop: Spacing.sm,
    lineHeight: 22,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  headerTitle: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },

  cameraWrap: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  camera: { flex: 1 },

  frameOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28, height: 28,
    borderColor: Colors.accent,
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  frameHint: {
    color: '#fff',
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    marginTop: Spacing.base,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
  },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.surface,
  },
  shutterCapturing: { opacity: 0.6 },
  shutterInner: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.bg,
  },
  stepIndicator: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
    textAlign: 'right',
  },

  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.base,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },

  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.base,
  },
});
