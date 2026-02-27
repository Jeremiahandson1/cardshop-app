import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  FlatList, Image, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cardsApi, catalogApi } from '../services/api';
import { Button, Input, StatusBadge, SectionHeader, LoadingScreen, Divider } from '../components/ui';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ============================================================
// REGISTER CARD
// ============================================================
export const RegisterCardScreen = ({ navigation, route }) => {
  const qrCode = route.params?.qrCode;
  const queryClient = useQueryClient();

  const [step, setStep] = useState(qrCode ? 'search' : 'scan_or_search');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [form, setForm] = useState({
    grading_company: 'raw',
    condition: 'near_mint',
    cert_number: '',
    grade: '',
    status: 'nfs',
    asking_price: '',
    condition_notes: '',
  });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const searchCatalog = async (q) => {
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await catalogApi.search({ q, limit: 10 });
      setSearchResults(res.data.cards);
    } catch {}
    setSearching(false);
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled) {
      setPhotos((p) => [...p, ...result.assets.map((a) => a.uri)]);
    }
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
      photo_urls: photos,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-cards'] });
      navigation.replace('CardDetail', { cardId: res.data.id });
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
            label="Search for this card"
            value={catalogSearch}
            onChangeText={(v) => {
              setCatalogSearch(v);
              searchCatalog(v);
            }}
            placeholder="Player name, set, year..."
            returnKeyType="search"
          />
        </View>

        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, paddingBottom: Spacing.xxxl }}
          ListHeaderComponent={
            !searching && catalogSearch.length > 1 && searchResults.length === 0 ? (
              <TouchableOpacity
                style={styles.createNewBtn}
                onPress={() => navigation.navigate('AddToCatalog', {
                  prefill: catalogSearch,
                  onCreated: (card) => { setSelectedCatalog(card); setStep('details'); }
                })}
              >
                <Ionicons name="add-circle" size={18} color={Colors.accent} />
                <Text style={styles.createNewText}>Card not found — add it to the catalog</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.catalogResult}
              onPress={() => { setSelectedCatalog(item); setStep('details'); }}
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

  // Step 2: Details
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('search')}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Card Details</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 100 }}>
        {/* Selected card preview */}
        <View style={styles.selectedCard}>
          {selectedCatalog.front_image_url
            ? <Image source={{ uri: selectedCatalog.front_image_url }} style={{ width: 50, height: 70 }} resizeMode="contain" />
            : <Text style={{ fontSize: 28 }}>🃏</Text>
          }
          <View style={{ flex: 1 }}>
            <Text style={styles.catalogPlayer}>{selectedCatalog.player_name}</Text>
            <Text style={styles.catalogSet}>{selectedCatalog.year} {selectedCatalog.set_name}</Text>
            {selectedCatalog.parallel && <Text style={styles.catalogParallel}>{selectedCatalog.parallel}</Text>}
          </View>
        </View>

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
                    {c.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
                <TouchableOpacity
                  style={styles.photoRemove}
                  onPress={() => setPhotos((p) => p.filter((_, idx) => idx !== i))}
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card', cardId] }),
  });

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
        <TouchableOpacity onPress={() => navigation.navigate('InitiateTransfer', { cardId })}>
          <Ionicons name="swap-horizontal" size={22} color={Colors.accent} />
        </TouchableOpacity>
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
          {card.is_rookie && (
            <View style={styles.rookieTag}>
              <Text style={styles.rookieTagText}>Rookie Card</Text>
            </View>
          )}

          <Divider />

          {/* Grade or condition */}
          {card.grading_company !== 'raw' ? (
            <View style={styles.gradeBlock}>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeCompany}>{card.grading_company.toUpperCase()}</Text>
                <Text style={styles.gradeNum}>{card.grade}</Text>
              </View>
              <Text style={styles.certNum}>Cert #{card.cert_number}</Text>
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Condition</Text>
              <Text style={styles.infoValue}>{card.condition?.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</Text>
            </View>
          )}

          {/* Transfer count */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ownership History</Text>
            <Text style={styles.infoValue}>{card.transfer_count} transfer{card.transfer_count !== 1 ? 's' : ''}</Text>
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
                    <Text style={styles.historyMethod}>{t.method.replace('_', ' ')}</Text>
                    <Text style={styles.historyDate}>
                      {new Date(t.completed_at).toLocaleDateString()}
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
});
