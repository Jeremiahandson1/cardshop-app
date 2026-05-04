// Pack-out / unpack video capture for the chain-of-custody video gate
// (Theme E2 of CHAIN_OF_CUSTODY_PLAN.md). Required on shipments
// $200+. Asymmetric gate — your video protects you, not the other
// party.
//
// Flow:
//  1. Server issues a challenge phrase (must appear on screen during
//     recording — proves the video is fresh, not a re-upload)
//  2. User records up to VIDEO_MAX_SECONDS
//  3. Video uploaded as base64 → Cloudinary → URL stored on the CSTX
//
// Mode is passed via route.params.phase = 'packout' | 'unpack'.
// Upon successful upload, navigates back; the CSTX detail screen
// refetches video status.

import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../components/ui';
import { cstxApi } from '../services/api';
import { Colors, Typography, Spacing, Radius } from '../theme';

const { width } = Dimensions.get('window');
const VIDEO_MAX_SECONDS = 60; // pack-outs need a few seconds for label, contents, sealing

export const TransferVideoScreen = ({ navigation, route }) => {
  const { transactionId, phase } = route.params || {};
  const isPackout = phase === 'packout';
  const queryClient = useQueryClient();

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [step, setStep] = useState('intro'); // intro | record | review | uploading
  const [recording, setRecording] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [videoData, setVideoData] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const cameraRef = useRef(null);
  const timerRef = useRef(null);

  // Issue a challenge phrase as soon as the screen opens
  useEffect(() => {
    (async () => {
      try {
        const res = await cstxApi.videoChallenge(transactionId, phase);
        setChallenge(res.data?.challenge);
      } catch (e) {
        Alert.alert('Could not start video', e.response?.data?.error || e.message);
      }
    })();
  }, [transactionId, phase]);

  useEffect(() => {
    if (permission && !permission.granted) requestPermission();
  }, [permission]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: ({ dataUrl }) => cstxApi.submitVideo(transactionId, phase, dataUrl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cstx-video-status', transactionId] });
      queryClient.invalidateQueries({ queryKey: ['cstx', transactionId] });
      Alert.alert(
        'Video saved',
        isPackout
          ? 'Pack-out video recorded. You can now ship the card and add the tracking number.'
          : 'Unpack video recorded. You can now confirm delivery or open a dispute if anything is wrong.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (e) => {
      const msg = e.response?.data?.error || e.message || 'Upload failed';
      Alert.alert('Upload failed', msg);
      setStep('review');
    },
  });

  const startRecording = async () => {
    if (!cameraRef.current || recording) return;
    if (micPermission && !micPermission.granted) {
      await requestMicPermission();
    }
    setRecording(true);
    setRecordTimer(0);
    timerRef.current = setInterval(() => {
      setRecordTimer((t) => {
        const next = t + 1;
        if (next >= VIDEO_MAX_SECONDS) stopRecording();
        return next;
      });
    }, 1000);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: VIDEO_MAX_SECONDS });
      if (timerRef.current) clearInterval(timerRef.current);
      const base64 = await FileSystem.readAsStringAsync(video.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      setVideoData({ uri: video.uri, dataUrl: `data:video/mp4;base64,${base64}` });
      setStep('review');
    } catch (e) {
      console.warn('record failed', e);
    } finally {
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    try { await cameraRef.current?.stopRecording(); } catch {}
  };

  const submit = () => {
    if (!videoData?.dataUrl) return;
    setStep('uploading');
    uploadMutation.mutate({ dataUrl: videoData.dataUrl });
  };

  // ----- permission gate -----
  if (!permission) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={Colors.accent} />
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="videocam-outline" size={48} color={Colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>
          The {isPackout ? 'pack-out' : 'unpack'} video requires camera access. This is your dispute coverage — without it you can't open a case if something goes wrong.
        </Text>
        <Button title="Grant access" onPress={requestPermission} style={{ marginTop: Spacing.lg }} />
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: Spacing.sm }} />
      </SafeAreaView>
    );
  }

  // ----- intro -----
  if (step === 'intro') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isPackout ? 'Pack-out video' : 'Unpack video'}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.introBody}>
          <Ionicons name={isPackout ? 'cube-outline' : 'cube'} size={56} color={Colors.accent} />
          <Text style={styles.introTitle}>
            {isPackout ? 'Record the pack-out' : 'Record the unpacking'}
          </Text>
          <Text style={styles.introText}>
            {isPackout
              ? 'Show the card matching the listing, the toploader/holder, the envelope or box, the address label, and the seal. This protects YOU if a dispute is filed.'
              : 'Don\'t open the package until you start recording. Show the label, the unboxing, and the card emerging from the toploader. This protects YOU if something is missing or wrong.'}
          </Text>
          {challenge ? (
            <View style={styles.challengeBox}>
              <Text style={styles.challengeLabel}>Challenge phrase — must appear on screen during recording:</Text>
              <Text style={styles.challengePhrase}>{challenge}</Text>
              <Text style={styles.challengeHint}>
                Hold a piece of paper with this phrase up to the camera at the start of the recording. (Or read it aloud.)
              </Text>
            </View>
          ) : (
            <ActivityIndicator color={Colors.accent} style={{ marginTop: Spacing.lg }} />
          )}
          <Button
            title="Start recording"
            onPress={() => setStep('record')}
            disabled={!challenge}
            style={{ marginTop: Spacing.xl, width: '100%' }}
          />
          <Text style={styles.disclaimer}>
            Without this video, you forfeit your right to open a dispute. The other party's case is unaffected by your decision.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ----- recording -----
  if (step === 'record') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('intro')} disabled={recording}>
            <Ionicons name="arrow-back" size={28} color={recording ? Colors.textMuted : Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {recording ? `Recording · ${recordTimer}s / ${VIDEO_MAX_SECONDS}s` : 'Tap to record'}
          </Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="video" />
          <View pointerEvents="none" style={styles.overlay}>
            <View style={styles.challengeOverlay}>
              <Text style={styles.challengeOverlayText}>{challenge}</Text>
            </View>
            <Text style={styles.frameHint}>
              {isPackout
                ? 'Show: card → holder → envelope → label → seal'
                : 'Show: label → opening → card extraction'}
            </Text>
          </View>
        </View>
        <View style={styles.shutterRow}>
          <View style={{ width: 50 }} />
          <TouchableOpacity
            style={[styles.shutter, recording && styles.recShutter]}
            onPress={recording ? stopRecording : startRecording}
            activeOpacity={0.7}
          >
            {recording ? <View style={styles.recStopInner} /> : <View style={styles.recDotInner} />}
          </TouchableOpacity>
          <View style={{ width: 50 }} />
        </View>
      </SafeAreaView>
    );
  }

  // ----- review -----
  if (step === 'review' && videoData) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Review</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.reviewBody}>
          <Ionicons name="checkmark-circle" size={72} color={Colors.success} />
          <Text style={styles.reviewTitle}>Video captured</Text>
          <Text style={styles.reviewSub}>
            Submit to upload and lock in your dispute coverage.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xl, width: '100%' }}>
            <Button title="Retake" variant="secondary" onPress={() => { setVideoData(null); setStep('record'); }} style={{ flex: 1 }} />
            <Button title="Submit" onPress={submit} style={{ flex: 1.5 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ----- uploading -----
  return (
    <SafeAreaView style={styles.center}>
      <ActivityIndicator color={Colors.accent} size="large" />
      <Text style={styles.uploadingText}>Uploading {isPackout ? 'pack-out' : 'unpack'} video…</Text>
      <Text style={styles.uploadingSub}>Don't close the app — large videos take a moment.</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  permissionTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginTop: Spacing.base },
  permissionBody: { color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },

  introBody: { flex: 1, padding: Spacing.xl, gap: Spacing.sm, alignItems: 'center' },
  introTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, marginTop: Spacing.base, textAlign: 'center' },
  introText: { color: Colors.textMuted, fontSize: Typography.base, lineHeight: 22, textAlign: 'center', marginBottom: Spacing.base },
  disclaimer: {
    color: Colors.accent3, fontSize: Typography.sm, lineHeight: 18,
    textAlign: 'center', marginTop: Spacing.lg, fontStyle: 'italic',
  },

  challengeBox: {
    backgroundColor: Colors.surface, borderColor: Colors.accent, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.base, width: '100%',
    marginTop: Spacing.base,
  },
  challengeLabel: { color: Colors.textMuted, fontSize: Typography.sm },
  challengePhrase: {
    color: Colors.accent, fontSize: 22, fontWeight: Typography.bold,
    marginTop: Spacing.xs, letterSpacing: 1.5, textAlign: 'center',
  },
  challengeHint: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: Spacing.xs, lineHeight: 18 },

  cameraWrap: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'space-between', padding: Spacing.base,
  },
  challengeOverlay: {
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: Radius.sm,
  },
  challengeOverlayText: { color: '#fff', fontSize: 16, letterSpacing: 1.5, fontWeight: Typography.bold },
  frameHint: {
    color: '#fff', fontSize: Typography.sm, fontWeight: Typography.semibold,
    backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
    borderRadius: Radius.sm, textAlign: 'center',
  },

  shutterRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg,
  },
  shutter: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: Colors.surface,
  },
  recShutter: { backgroundColor: Colors.accent3 },
  recDotInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.accent3 },
  recStopInner: { width: 32, height: 32, backgroundColor: Colors.bg, borderRadius: 4 },

  reviewBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  reviewTitle: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.bold, marginTop: Spacing.base },
  reviewSub: { color: Colors.textMuted, fontSize: Typography.base, textAlign: 'center', marginTop: Spacing.xs },

  uploadingText: { color: Colors.text, fontSize: Typography.md, marginTop: Spacing.lg },
  uploadingSub: { color: Colors.textMuted, fontSize: Typography.sm, marginTop: Spacing.xs },
});
