import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Button } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');
const FRAME_WIDTH = width * 0.8;
const FRAME_HEIGHT = FRAME_WIDTH * 1.4;
const VIDEO_MAX_SECONDS = 10;

/**
 * Card capture flow:
 *   1. Front photo
 *   2. Back photo
 *   3. (Optional) short 5-10 second video — "proof of life" clip
 *
 * On complete, calls route.params.onComplete({ front, back, video? })
 * where each value is a base64 data URL (image/jpeg or video/mp4).
 */
export const TradeCameraScreen = ({ navigation, route }) => {
  const onComplete = route.params?.onComplete;
  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  // 'front' | 'back' | 'video_prompt' | 'video_record' | 'video_review'
  const [step, setStep] = useState('front');
  const [preview, setPreview] = useState(null);
  const [frontData, setFrontData] = useState(null);
  const [backData, setBackData] = useState(null);
  const [videoData, setVideoData] = useState(null); // { uri, dataUrl }
  const [capturing, setCapturing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // ---------- photo capture ----------
  const takePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7, base64: true, skipProcessing: false,
      });
      const dataUrl = `data:image/jpeg;base64,${photo.base64}`;
      setPreview({ uri: photo.uri, dataUrl });
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
    } else if (step === 'back') {
      setBackData(preview.dataUrl);
      setPreview(null);
      setStep('video_prompt');
    }
  };

  // ---------- video capture ----------
  const startRecording = async () => {
    if (!cameraRef.current || recording) return;
    // Ensure mic permission (required for video with audio)
    if (micPermission && !micPermission.granted) {
      const r = await requestMicPermission();
      if (!r.granted) {
        // Proceed without audio — recordAsync will still record video-only
      }
    }
    setRecording(true);
    setRecordTimer(0);
    timerRef.current = setInterval(() => {
      setRecordTimer((t) => {
        const next = t + 1;
        if (next >= VIDEO_MAX_SECONDS) {
          stopRecording();
        }
        return next;
      });
    }, 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: VIDEO_MAX_SECONDS });
      if (timerRef.current) clearInterval(timerRef.current);
      // Convert to base64 data URL so it fits the same pipeline as photos
      const base64 = await FileSystem.readAsStringAsync(video.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const dataUrl = `data:video/mp4;base64,${base64}`;
      setVideoData({ uri: video.uri, dataUrl });
      setStep('video_review');
    } catch (err) {
      console.warn('record failed', err);
    } finally {
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!cameraRef.current) return;
    try {
      await cameraRef.current.stopRecording();
    } catch {}
  };

  const retakeVideo = () => {
    setVideoData(null);
    setStep('video_record');
  };

  const skipVideo = () => {
    onComplete?.({ front: frontData, back: backData });
    navigation.goBack();
  };

  const confirmVideo = () => {
    onComplete?.({
      front: frontData,
      back: backData,
      video: videoData?.dataUrl || null,
    });
    navigation.goBack();
  };

  // ---------- permission / loading gates ----------
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
        <Button title="Grant camera access" onPress={requestPermission} style={{ marginTop: Spacing.lg }} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: Spacing.sm }} />
      </SafeAreaView>
    );
  }

  // ---------- RENDER BY STEP ----------

  // Step: video_prompt — offer optional video after both photos captured
  if (step === 'video_prompt') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={skipVideo}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add a video?</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.promptBody}>
          <Ionicons name="videocam" size={64} color={Colors.accent} />
          <Text style={styles.promptTitle}>Short proof-of-life clip</Text>
          <Text style={styles.promptText}>
            A 5–10 second video of you holding the card (front, flip, back) is
            genuine proof for high-value trades. Optional but strongly recommended.
          </Text>
          <Button
            title="Record video"
            onPress={() => setStep('video_record')}
            style={{ marginTop: Spacing.lg, width: '100%' }}
          />
          <Button
            title="Skip — post without video"
            variant="secondary"
            onPress={skipVideo}
            style={{ marginTop: Spacing.sm, width: '100%' }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // Step: video_review — after recording, preview + confirm/retake
  if (step === 'video_review' && videoData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review video</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.previewContainer}>
          <View style={styles.videoReviewBox}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
            <Text style={styles.videoReviewText}>Video captured</Text>
            <Text style={styles.videoReviewSub}>
              (Preview playback unavailable in-app — trust the timer, retake if unsure.)
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button title="Retake" variant="secondary" onPress={retakeVideo} style={{ flex: 1 }} />
          <Button title="Use video, finish" onPress={confirmVideo} style={{ flex: 1.5 }} />
        </View>
      </SafeAreaView>
    );
  }

  // Step: video_record — live camera in video mode
  if (step === 'video_record') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('video_prompt')}>
            <Ionicons name="arrow-back" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {recording ? `Recording · ${recordTimer}s / ${VIDEO_MAX_SECONDS}s` : 'Record video'}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="video" />
          <View pointerEvents="none" style={styles.frameOverlay}>
            <Text style={styles.frameHint}>
              Hold the card in frame. Show front, flip, back. Max {VIDEO_MAX_SECONDS}s.
            </Text>
          </View>
        </View>
        <View style={styles.shutterRow}>
          <View style={{ width: 40 }} />
          <TouchableOpacity
            style={[styles.shutter, recording && styles.recShutter]}
            onPress={recording ? stopRecording : startRecording}
            activeOpacity={0.7}
          >
            {recording ? (
              <View style={styles.recStopInner} />
            ) : (
              <View style={styles.recDotInner} />
            )}
          </TouchableOpacity>
          <View style={{ width: 40 }}>
            <Text style={styles.stepIndicator}>3/3</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Step: front / back (photo capture, with preview state)
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
            title={step === 'front' ? 'Use front, capture back' : 'Use back, continue'}
            onPress={confirm}
            style={{ flex: 1.5 }}
          />
        </View>
      </SafeAreaView>
    );
  }

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
        <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="picture" />
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
          <Text style={styles.stepIndicator}>{step === 'front' ? '1/3' : '2/3'}</Text>
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
    color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold,
    marginTop: Spacing.base,
  },
  permissionBody: {
    color: Colors.textMuted, fontSize: Typography.base,
    textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  headerTitle: {
    color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold,
  },

  cameraWrap: { flex: 1, position: 'relative', backgroundColor: '#000' },
  camera: { flex: 1 },

  frameOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  frame: { width: FRAME_WIDTH, height: FRAME_HEIGHT, position: 'relative' },
  corner: {
    position: 'absolute', width: 28, height: 28,
    borderColor: Colors.accent, borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  frameHint: {
    color: '#fff', fontSize: Typography.sm, fontWeight: Typography.semibold,
    marginTop: Spacing.base, textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
    textAlign: 'center', paddingHorizontal: Spacing.xl,
  },

  shutterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  shutter: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: Colors.surface,
  },
  shutterCapturing: { opacity: 0.6 },
  shutterInner: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: Colors.accent, borderWidth: 2, borderColor: Colors.bg,
  },
  recShutter: { backgroundColor: Colors.accent3 },
  recDotInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: Colors.accent3 },
  recStopInner: { width: 28, height: 28, backgroundColor: Colors.bg, borderRadius: 4 },
  stepIndicator: {
    color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold,
    textAlign: 'right',
  },

  previewContainer: {
    flex: 1, backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.base,
  },
  previewImage: { width: '100%', height: '100%' },

  videoReviewBox: { alignItems: 'center', gap: Spacing.sm, padding: Spacing.xl },
  videoReviewText: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginTop: Spacing.base },
  videoReviewSub: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', lineHeight: 20 },

  actions: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.base },

  promptBody: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, gap: Spacing.sm,
  },
  promptTitle: {
    color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold,
    marginTop: Spacing.base, textAlign: 'center',
  },
  promptText: {
    color: Colors.textMuted, fontSize: Typography.base, lineHeight: 22,
    textAlign: 'center', marginBottom: Spacing.lg,
  },
});
