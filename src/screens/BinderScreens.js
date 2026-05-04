import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Switch, Alert, Modal,
  Image, TextInput, Dimensions, Share, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bindersApi, cardsApi, offersApi, cstxApi, followsApi, safetyApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Button, Input, StatusBadge, EmptyState, LoadingScreen,
  ScreenHeader, SectionHeader, Divider, CardTile
} from '../components/ui';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

const { width } = Dimensions.get('window');
const COLUMN_GAP = Spacing.sm;
const CARD_WIDTH = (width - Spacing.base * 2 - COLUMN_GAP) / 2;

// ============================================================
// BINDER STATUS BADGE
// ============================================================
const BinderStatusBadge = ({ status, showFloorActive }) => {
  if (showFloorActive) {
    return (
      <View style={[bsBadge.container, { borderColor: Colors.accent3 }]}>
        <View style={[bsBadge.dot, { backgroundColor: Colors.accent3 }]} />
        <Text style={[bsBadge.text, { color: Colors.accent3 }]}>Show Floor Live</Text>
      </View>
    );
  }
  const config = {
    active: { label: 'Active', color: Colors.success },
    expired: { label: 'Expired', color: Colors.textMuted },
    archived: { label: 'Archived', color: Colors.textDim },
  }[status] || { label: status || 'Active', color: Colors.success };

  return (
    <View style={[bsBadge.container, { borderColor: config.color }]}>
      <View style={[bsBadge.dot, { backgroundColor: config.color }]} />
      <Text style={[bsBadge.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const bsBadge = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3, gap: 4, alignSelf: 'flex-start',
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  text: { fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 0.5 },
});

// ============================================================
// INTENT SIGNAL BADGE
// ============================================================
const IntentBadge = ({ signal }) => {
  // Maps both the API's current binder_intent_signal enum
  // (lets_talk / priced_to_move / trade_only / not_for_sale) and
  // the legacy strings the UI used to send (sell / trade / etc.)
  // so old data + new data both render with proper labels.
  const config = {
    // Current canonical values (server-side enum):
    priced_to_move: { label: 'Priced',     color: Colors.accent },
    lets_talk:      { label: "Let's talk", color: Colors.info },
    trade_only:     { label: 'Trade only', color: Colors.accent2 },
    not_for_sale:   { label: 'Showcase',   color: Colors.accent4 },
    // Legacy values still floating around in older clients:
    sell:           { label: 'Sell',       color: Colors.accent },
    trade:          { label: 'Trade',      color: Colors.accent2 },
    sell_or_trade:  { label: 'Sell/Trade', color: Colors.info },
    showcase:       { label: 'Showcase',   color: Colors.accent4 },
    nfs:            { label: 'NFS',        color: Colors.textMuted },
  }[signal] || { label: 'NFS', color: Colors.textMuted };

  return (
    <View style={[intentStyles.badge, { borderColor: config.color }]}>
      <Text style={[intentStyles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const intentStyles = StyleSheet.create({
  badge: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start',
  },
  text: { fontSize: Typography.xs, fontWeight: Typography.semibold },
});

// ============================================================
// BINDER LIST SCREEN
// ============================================================
export const BinderListScreen = ({ navigation }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-binders'],
    queryFn: () => bindersApi.list().then((r) => r.data),
  });

  const binders = data?.binders || [];

  if (isLoading) return <LoadingScreen message="Loading your binders..." />;

  const renderBinder = ({ item }) => (
    <TouchableOpacity
      style={styles.binderItem}
      // Tapping a binder shows its cards (PublicBinder view). When
      // the viewer is the owner, that screen surfaces an Edit gear
      // that routes to BinderEditor for settings/sections. Going
      // straight to BinderEditor was the old behavior and confused
      // users who expected to see their cards first.
      onPress={() => item.link_token
        ? navigation.navigate('PublicBinder', { linkToken: item.link_token, binderId: item.id })
        : navigation.navigate('BinderEditor', { binderId: item.id })}
      activeOpacity={0.85}
    >
      <View style={styles.binderIcon}>
        <Ionicons name="book" size={22} color={Colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.binderName}>{item.name}</Text>
        <View style={styles.binderMeta}>
          <Text style={styles.binderMetaText}>{item.card_count || 0} cards</Text>
          <Text style={styles.binderMetaDot}> · </Text>
          <Text style={styles.binderMetaText}>{item.view_count || 0} views</Text>
          <Text style={styles.binderMetaDot}> · </Text>
          <Text style={styles.binderMetaText}>{item.offer_count || 0} offers</Text>
        </View>
        <BinderStatusBadge status={item.status} showFloorActive={item.show_floor_live} />
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="My Binders"
        subtitle={`${binders.length} binder${binders.length !== 1 ? 's' : ''}`}
        right={
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => navigation.navigate('BinderEditor', {})}
          >
            <Text style={styles.createBtnText}>Create</Text>
          </TouchableOpacity>
        }
      />

      <FlatList
        data={binders}
        renderItem={renderBinder}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="📒"
            title="No binders yet"
            message="Create a binder to showcase your cards, get offers, and trade with collectors."
            action={{ label: 'Create a Binder', onPress: () => navigation.navigate('BinderEditor', {}) }}
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// BINDER EDITOR SCREEN
// ============================================================
export const BinderEditorScreen = ({ navigation, route }) => {
  const binderId = route.params?.binderId;
  const isEditing = !!binderId;
  const queryClient = useQueryClient();

  const { data: existingBinder, isLoading: loadingBinder } = useQuery({
    queryKey: ['binder', binderId],
    queryFn: () => bindersApi.get(binderId).then((r) => r.data),
    enabled: isEditing,
  });

  const [form, setForm] = useState({
    name: '',
    allow_cash_offers: true,
    allow_trade_offers: true,
    show_valuations: false,
    searchable: true,
    follow_enabled: true,
    qr_enabled: true,
    link_type: 'permanent',
    expires_at: '',
    venmo_handle: '',
    paypal_handle: '',
    cashapp_handle: '',
    min_offer_floor: '',
  });
  const [initialized, setInitialized] = useState(false);
  // Show Floor mode is niche (only useful at card shows) — hide
  // behind an advanced toggle by default.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showFloorForm, setShowFloorForm] = useState({
    event_name: '',
    table_number: '',
    notes: '',
  });

  React.useEffect(() => {
    if (existingBinder && !initialized) {
      setForm({
        name: existingBinder.name || '',
        allow_cash_offers: existingBinder.allow_cash_offers ?? true,
        allow_trade_offers: existingBinder.allow_trade_offers ?? true,
        show_valuations: existingBinder.show_valuations ?? false,
        searchable: existingBinder.searchable ?? true,
        follow_enabled: existingBinder.follow_enabled ?? true,
        qr_enabled: existingBinder.qr_enabled ?? true,
        link_type: existingBinder.link_type || 'permanent',
        expires_at: existingBinder.expires_at || '',
        venmo_handle: existingBinder.venmo_handle || '',
        paypal_handle: existingBinder.paypal_handle || '',
        cashapp_handle: existingBinder.cashapp_handle || '',
        min_offer_floor: existingBinder.min_offer_floor ? String(existingBinder.min_offer_floor) : '',
      });
      setInitialized(true);
    }
  }, [existingBinder, initialized]);

  const [newSectionName, setNewSectionName] = useState('');
  const sections = existingBinder?.sections || [];

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const createMutation = useMutation({
    mutationFn: (data) => bindersApi.create(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      navigation.replace('BinderEditor', { binderId: res.data?.id });
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to create binder'),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => bindersApi.update(binderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
      Alert.alert('Saved', 'Binder updated successfully.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to update binder'),
  });

  const addSectionMutation = useMutation({
    mutationFn: (data) => bindersApi.addSection(binderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
      setNewSectionName('');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to add section'),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId) => bindersApi.deleteSection(binderId, sectionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['binder', binderId] }),
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to delete section'),
  });

  const showFloorMutation = useMutation({
    mutationFn: (data) => bindersApi.activateShowFloor(binderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      Alert.alert('Show Floor Live!', 'Your binder is now on the show floor.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to activate show floor'),
  });

  const handleSave = () => {
    const payload = {
      name: form.name,
      allow_cash_offers: form.allow_cash_offers,
      allow_trade_offers: form.allow_trade_offers,
      show_valuations: form.show_valuations,
      searchable: form.searchable,
      follow_enabled: form.follow_enabled,
      qr_enabled: form.qr_enabled,
      link_type: form.link_type,
      expires_at: form.link_type === 'timed' && form.expires_at ? form.expires_at : undefined,
      venmo_handle: form.venmo_handle || undefined,
      paypal_handle: form.paypal_handle || undefined,
      cashapp_handle: form.cashapp_handle || undefined,
      min_offer_floor: form.min_offer_floor ? parseFloat(form.min_offer_floor) : undefined,
    };

    if (isEditing) {
      updateMutation.mutate(payload);
    } else {
      if (!form.name.trim()) {
        Alert.alert('Required', 'Please enter a binder name');
        return;
      }
      createMutation.mutate(payload);
    }
  };

  const handleShare = async () => {
    if (!existingBinder?.link_token) return;
    const url = `https://cardshop.app/binder/${existingBinder.link_token}`;
    try {
      await Share.share({ message: `Check out my binder: ${url}`, url });
    } catch {}
  };

  const handleCopyLink = async () => {
    if (!existingBinder?.link_token) return;
    const url = `https://cardshop.app/binder/${existingBinder.link_token}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied', 'Binder link copied to clipboard.');
  };

  if (isEditing && loadingBinder) return <LoadingScreen />;

  const LINK_TYPES = [
    { key: 'permanent', label: 'Permanent' },
    { key: 'timed', label: 'Timed' },
    { key: 'show_floor', label: 'Show Floor' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit Binder' : 'New Binder'}</Text>
        {isEditing ? (
          <TouchableOpacity onPress={() => navigation.navigate('BinderAnalytics', { binderId })}>
            <Ionicons name="bar-chart-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 22 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 }}>
        {/* Binder Name */}
        <Input
          label="Binder Name"
          value={form.name}
          onChangeText={set('name')}
          placeholder="My Baseball Rookies"
          autoCapitalize="words"
        />

        {/* Toggle Switches */}
        <View>
          <SectionHeader title="Settings" />
          <View style={styles.toggleCard}>
            {[
              { key: 'allow_cash_offers', label: 'Allow Cash Offers', icon: 'cash-outline' },
              { key: 'allow_trade_offers', label: 'Allow Trade Offers', icon: 'swap-horizontal-outline' },
              { key: 'show_valuations', label: 'Show Valuations', icon: 'pricetag-outline' },
              { key: 'searchable', label: 'Searchable', icon: 'search-outline' },
              { key: 'follow_enabled', label: 'Allow Follows', icon: 'people-outline' },
              { key: 'qr_enabled', label: 'QR Code Enabled', icon: 'qr-code-outline' },
            ].map((toggle, i) => (
              <View key={toggle.key}>
                <View style={styles.toggleItem}>
                  <View style={styles.toggleIcon}>
                    <Ionicons name={toggle.icon} size={16} color={Colors.textMuted} />
                  </View>
                  <Text style={styles.toggleLabel}>{toggle.label}</Text>
                  <Switch
                    value={form[toggle.key]}
                    onValueChange={set(toggle.key)}
                    trackColor={{ false: Colors.surface2, true: Colors.accent + '66' }}
                    thumbColor={form[toggle.key] ? Colors.accent : Colors.textMuted}
                  />
                </View>
                {i < 5 && <View style={styles.toggleDivider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Link Type */}
        <View>
          <SectionHeader title="Link Type" />
          <View style={styles.linkTypeRow}>
            {LINK_TYPES.map((lt) => (
              <TouchableOpacity
                key={lt.key}
                style={[styles.linkTypeBtn, form.link_type === lt.key && styles.linkTypeBtnActive]}
                onPress={() => set('link_type')(lt.key)}
              >
                <Text style={[styles.linkTypeText, form.link_type === lt.key && styles.linkTypeTextActive]}>
                  {lt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Expiry date for timed links */}
        {form.link_type === 'timed' && (
          <Input
            label="Expiry Date (YYYY-MM-DD)"
            value={form.expires_at}
            onChangeText={set('expires_at')}
            placeholder="2026-04-01"
          />
        )}

        {/* Payment Handles */}
        <View>
          <SectionHeader title="Payment Handles" />
          <Input label="Venmo" value={form.venmo_handle} onChangeText={set('venmo_handle')} placeholder="@username" />
          <Input label="PayPal" value={form.paypal_handle} onChangeText={set('paypal_handle')} placeholder="email@example.com" />
          <Input label="Cash App" value={form.cashapp_handle} onChangeText={set('cashapp_handle')} placeholder="$cashtag" />
        </View>

        {/* Min offer floor */}
        <Input
          label="Minimum Offer Floor ($)"
          value={form.min_offer_floor}
          onChangeText={set('min_offer_floor')}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />

        {/* Sections (editing only) */}
        {isEditing && (
          <View>
            <SectionHeader title="Sections" action={{ label: '+ Add', onPress: () => {
              if (!newSectionName.trim()) return;
              addSectionMutation.mutate({ name: newSectionName.trim() });
            }}} />
            <View style={styles.sectionInputRow}>
              <TextInput
                style={styles.sectionInput}
                value={newSectionName}
                onChangeText={setNewSectionName}
                placeholder="Section name..."
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity
                style={styles.sectionAddBtn}
                onPress={() => {
                  if (!newSectionName.trim()) return;
                  addSectionMutation.mutate({ name: newSectionName.trim() });
                }}
              >
                <Ionicons name="add" size={18} color={Colors.bg} />
              </TouchableOpacity>
            </View>
            {sections.map((section) => (
              <View key={section.id} style={styles.sectionItem}>
                <Ionicons name="reorder-three" size={18} color={Colors.textMuted} />
                <Text style={styles.sectionItemName}>{section.name}</Text>
                <Text style={styles.sectionItemCount}>{section.card_count || 0} cards</Text>
                <TouchableOpacity
                  onPress={() => Alert.alert('Delete Section', `Remove "${section.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deleteSectionMutation.mutate(section.id) },
                  ])}
                >
                  <Ionicons name="trash-outline" size={16} color={Colors.accent3} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Manage Cards (editing only) */}
        {isEditing && (
          <Button
            title="Manage Cards"
            variant="secondary"
            onPress={() => navigation.navigate('BinderCardPicker', { binderId })}
            icon={<Ionicons name="albums-outline" size={18} color={Colors.text} />}
          />
        )}

        {/* Share Link (editing only) */}
        {isEditing && existingBinder?.link_token && (
          <View>
            <SectionHeader title="Share Link" />
            <View style={styles.shareLinkCard}>
              <Text style={styles.shareLinkUrl} numberOfLines={1}>
                cardshop.app/binder/{existingBinder.link_token}
              </Text>
              <View style={styles.shareLinkBtns}>
                <TouchableOpacity style={styles.shareLinkBtn} onPress={handleCopyLink}>
                  <Ionicons name="copy-outline" size={16} color={Colors.accent} />
                  <Text style={styles.shareLinkBtnText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.shareLinkBtn} onPress={handleShare}>
                  <Ionicons name="share-outline" size={16} color={Colors.accent} />
                  <Text style={styles.shareLinkBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* QR Code (editing only) */}
        {isEditing && form.qr_enabled && existingBinder?.link_token && (
          <View>
            <SectionHeader title="QR Code" />
            <View style={styles.qrCard}>
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code" size={80} color={Colors.accent} />
              </View>
              <Text style={styles.qrHint}>
                Share this QR code at shows for instant binder access
              </Text>
            </View>
          </View>
        )}

        {/* Activate Show Floor (editing only) — niche feature, only
            relevant at card shows. Hidden behind a "show advanced
            options" toggle so it doesn't clutter the editor for
            users who aren't running show-floor sessions. The active
            state below the toggle still surfaces unconditionally so
            anyone with a live show-floor binder can find the End
            button regardless of the advanced toggle state. */}
        {isEditing && !existingBinder?.show_floor_live && (
          <View>
            <Divider />
            <TouchableOpacity
              onPress={() => setShowAdvanced((v) => !v)}
              style={{ paddingVertical: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              accessibilityRole="button"
              accessibilityLabel={showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
            >
              <Text style={{ color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold }}>
                Advanced
              </Text>
              <Ionicons
                name={showAdvanced ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={Colors.textMuted}
              />
            </TouchableOpacity>
            {showAdvanced ? (
              <View style={styles.showFloorCard}>
                <Ionicons name="storefront" size={24} color={Colors.accent4} />
                <Text style={styles.showFloorTitle}>Show Floor Mode</Text>
                <Text style={styles.showFloorDesc}>
                  Go live at card shows. Tell collectors at the venue exactly where to find you. Pro feature.
                </Text>
                <View style={{ alignSelf: 'stretch', marginTop: Spacing.md, gap: Spacing.sm }}>
                  <Input
                    label="Event name"
                    placeholder="NSCC 2026"
                    value={showFloorForm.event_name}
                    onChangeText={(v) => setShowFloorForm((f) => ({ ...f, event_name: v }))}
                  />
                  <Input
                    label="Table / booth number"
                    placeholder="B-247"
                    value={showFloorForm.table_number}
                    onChangeText={(v) => setShowFloorForm((f) => ({ ...f, table_number: v }))}
                  />
                  <Input
                    label="Notes (optional)"
                    placeholder="Look for the orange Twomiah banner"
                    value={showFloorForm.notes}
                    onChangeText={(v) => setShowFloorForm((f) => ({ ...f, notes: v }))}
                    multiline
                  />
                </View>
                <Button
                  title="Go Live"
                  variant="ghost"
                  onPress={() => showFloorMutation.mutate({
                    event_name: showFloorForm.event_name.trim() || undefined,
                    table_number: showFloorForm.table_number.trim() || undefined,
                    notes: showFloorForm.notes.trim() || undefined,
                  })}
                  loading={showFloorMutation.isPending}
                  style={{ marginTop: Spacing.md, alignSelf: 'stretch' }}
                />
              </View>
            ) : null}
          </View>
        )}

        {isEditing && existingBinder?.show_floor_live && (
          <View style={[styles.showFloorCard, { borderColor: Colors.accent3 }]}>
            <View style={styles.liveDot} />
            <Text style={[styles.showFloorTitle, { color: Colors.accent3 }]}>Show Floor is LIVE</Text>
            {existingBinder.show_floor_event_name ? (
              <Text style={styles.showFloorDesc}>
                {existingBinder.show_floor_event_name}
                {existingBinder.show_floor_table_number ? ` · Table ${existingBinder.show_floor_table_number}` : ''}
              </Text>
            ) : null}
            {existingBinder.show_floor_notes ? (
              <Text style={[styles.showFloorDesc, { fontStyle: 'italic' }]}>
                {existingBinder.show_floor_notes}
              </Text>
            ) : null}
            <Button
              title="End Show Floor"
              variant="danger"
              size="sm"
              onPress={() => bindersApi.endShowFloor(binderId).then(() => {
                queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
                queryClient.invalidateQueries({ queryKey: ['my-binders'] });
              })}
              style={{ marginTop: Spacing.md }}
            />
          </View>
        )}
      </ScrollView>

      {/* Save/Create button */}
      <View style={styles.submitBar}>
        <Button
          title={isEditing ? 'Save Changes' : 'Create Binder'}
          onPress={handleSave}
          loading={createMutation.isPending || updateMutation.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// BINDER CARD PICKER SCREEN
// ============================================================
export const BinderCardPickerScreen = ({ navigation, route }) => {
  const { binderId } = route.params;
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [cardSettings, setCardSettings] = useState({});

  const { data: cardsData, isLoading } = useQuery({
    queryKey: ['my-cards'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });

  const { data: binderData } = useQuery({
    queryKey: ['binder', binderId],
    queryFn: () => bindersApi.get(binderId).then((r) => r.data),
  });

  const addCardsMutation = useMutation({
    mutationFn: (data) => bindersApi.addCards(binderId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['binder', binderId] });
      queryClient.invalidateQueries({ queryKey: ['my-binders'] });
      Alert.alert('Added', 'Cards added to binder.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to add cards'),
  });

  const cards = cardsData?.cards || [];
  const existingCardIds = new Set((binderData?.cards || []).map((c) => c.owned_card_id));

  const filtered = cards.filter((c) => {
    if (existingCardIds.has(c.id)) return false;
    if (!search.trim()) return true;
    return c.player_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.set_name?.toLowerCase().includes(search.toLowerCase());
  });

  const selectedCount = Object.keys(selected).filter((k) => selected[k]).length;

  const toggleCard = (id) => {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
    if (!cardSettings[id]) {
      setCardSettings((prev) => ({
        ...prev,
        [id]: { intent_signal: 'priced_to_move', asking_price: '', floor_price: '', owner_note: '' },
      }));
    }
  };

  const updateCardSetting = (id, key, value) => {
    setCardSettings((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value },
    }));
  };

  const handleAdd = () => {
    const cardIds = Object.keys(selected).filter((k) => selected[k]);
    if (cardIds.length === 0) {
      Alert.alert('Select Cards', 'Please select at least one card to add.');
      return;
    }
    // API expects { card_id, intent_signal, ... } — see binders.js
    // POST /:id/cards. Mobile previously used `owned_card_id` and a
    // different enum vocabulary, both of which got rejected by the
    // validate middleware as "Validation failed".
    const cardsPayload = cardIds.map((id) => ({
      card_id: id,
      intent_signal: cardSettings[id]?.intent_signal || 'priced_to_move',
      asking_price: cardSettings[id]?.asking_price ? parseFloat(cardSettings[id].asking_price) : undefined,
      floor_price: cardSettings[id]?.floor_price ? parseFloat(cardSettings[id].floor_price) : undefined,
      owner_note: cardSettings[id]?.owner_note || undefined,
    }));
    addCardsMutation.mutate({ cards: cardsPayload });
  };

  // Keys must match the API enum exactly — see
  // body('cards.*.intent_signal').isIn([...]) in binders.js.
  const INTENTS = [
    { key: 'priced_to_move', label: 'Priced' },
    { key: 'lets_talk', label: 'Let\'s talk' },
    { key: 'trade_only', label: 'Trade only' },
    { key: 'not_for_sale', label: 'Showcase' },
  ];

  if (isLoading) return <LoadingScreen message="Loading your collection..." />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Cards</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={16} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search your collection..."
          placeholderTextColor={Colors.textMuted}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const isSelected = selected[item.id];
          const settings = cardSettings[item.id] || {};
          return (
            <View>
              <TouchableOpacity
                style={[styles.pickerCard, isSelected && styles.pickerCardSelected]}
                onPress={() => toggleCard(item.id)}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color={Colors.bg} />}
                </View>
                <View style={styles.pickerCardImg}>
                  {item.front_image_url
                    ? <Image source={{ uri: item.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                    : <Text style={{ fontSize: 20 }}>🃏</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerCardPlayer}>{item.player_name}</Text>
                  <Text style={styles.pickerCardSet}>{item.year} {item.set_name}</Text>
                  {item.grade && (
                    <Text style={styles.pickerCardGrade}>
                      {item.grading_company?.toUpperCase()} {item.grade}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>

              {/* Per-card settings when selected */}
              {isSelected && (
                <View style={styles.pickerSettings}>
                  <Text style={styles.pickerSettingsLabel}>INTENT SIGNAL</Text>
                  <View style={styles.intentRow}>
                    {INTENTS.map((intent) => (
                      <TouchableOpacity
                        key={intent.key}
                        style={[
                          styles.intentBtn,
                          settings.intent_signal === intent.key && styles.intentBtnActive,
                        ]}
                        onPress={() => updateCardSetting(item.id, 'intent_signal', intent.key)}
                      >
                        <Text style={[
                          styles.intentBtnText,
                          settings.intent_signal === intent.key && styles.intentBtnTextActive,
                        ]}>
                          {intent.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Asking Price"
                        value={settings.asking_price || ''}
                        onChangeText={(v) => updateCardSetting(item.id, 'asking_price', v)}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Input
                        label="Floor Price"
                        value={settings.floor_price || ''}
                        onChangeText={(v) => updateCardSetting(item.id, 'floor_price', v)}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <Input
                    label="Owner Note"
                    value={settings.owner_note || ''}
                    onChangeText={(v) => updateCardSetting(item.id, 'owner_note', v)}
                    placeholder="Any details for buyers..."
                    multiline
                    numberOfLines={2}
                  />
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon="🃏"
            title={search ? 'No matches found' : 'No cards available'}
            message={search ? 'Try a different search' : 'All your cards are already in this binder.'}
          />
        }
      />

      {/* Add button */}
      <View style={styles.submitBar}>
        <Button
          title={`Add ${selectedCount} Card${selectedCount !== 1 ? 's' : ''}`}
          onPress={handleAdd}
          loading={addCardsMutation.isPending}
          disabled={selectedCount === 0}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// PUBLIC BINDER SCREEN
// ============================================================
export const PublicBinderScreen = ({ navigation, route }) => {
  const { linkToken, binderId: paramBinderId } = route.params || {};
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [activeSection, setActiveSection] = useState(null);
  const [filterPlayer, setFilterPlayer] = useState('');
  const [sortBy, setSortBy] = useState('recent');
  const [showFilters, setShowFilters] = useState(false);

  const { data: binder, isLoading } = useQuery({
    queryKey: ['public-binder', linkToken],
    queryFn: () => bindersApi.getPublic(linkToken).then((r) => r.data),
    enabled: !!linkToken,
  });

  const followMutation = useMutation({
    mutationFn: () => followsApi.follow(binder?.owner?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-binder', linkToken] }),
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to follow'),
  });

  const unfollowMutation = useMutation({
    mutationFn: () => followsApi.unfollow(binder?.owner?.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['public-binder', linkToken] }),
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to unfollow'),
  });

  // IMPORTANT: every hook must run on every render in the same
  // order. The previous version put `if (isLoading) return …` on
  // top of this block, which skipped the useCallback below on the
  // loading render and brought it back on the loaded render —
  // React's hook tracker compares hook counts between renders and
  // hard-crashes ("Rendered more hooks than during the previous
  // render"). This is what gave the user a gray screen + app close
  // every time tapping a binder transitioned isLoading false.
  // Fix: declare the useCallback up here, then early-return below.
  const renderCard = useCallback(({ item, index }) => (
    <TouchableOpacity
      style={[styles.publicCard, {
        width: CARD_WIDTH,
        marginLeft: index % 2 === 0 ? 0 : COLUMN_GAP,
        marginBottom: COLUMN_GAP,
      }]}
      // If the viewer is the binder owner, send them to the owner's
      // CardDetail screen — that's where they can edit the card,
      // change intent_signal (NFS / NFT / Let's talk / etc.), set
      // a price, move it to a different binder, and so on.
      // BinderCardDetail is the public-facing buyer view (Make Offer,
      // owner notes), which doesn't make sense for the owner.
      onPress={() => {
        const viewerIsOwner = !!user && !!binder?.owner?.id && binder.owner.id === user.id;
        if (viewerIsOwner && item.owned_card_id) {
          navigation.navigate('CardDetail', { cardId: item.owned_card_id });
        } else {
          navigation.navigate('BinderCardDetail', { card: item, binder, linkToken });
        }
      }}
      activeOpacity={0.85}
    >
      <View style={styles.publicCardImg}>
        {(() => {
          // Prefer the owner's uploaded photo. Fall back to the
          // catalog stock image only if no owner photo exists.
          // The /api/b/binder/* response surfaces:
          //   display_image_front — COALESCE(oc.image_front_url, cc.front_image_url)
          //   photo_urls          — array of owner-uploaded photos
          //   front_image_url     — catalog stock image
          const uri = item.display_image_front
            || (Array.isArray(item.photo_urls) && item.photo_urls[0])
            || item.front_image_url;
          return uri
            ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28 }}>🃏</Text></View>;
        })()}
        <View style={styles.publicCardIntentOverlay}>
          <IntentBadge signal={item.intent_signal} />
        </View>
      </View>
      <View style={{ padding: Spacing.sm, gap: 3 }}>
        <Text style={styles.publicCardPlayer} numberOfLines={1}>{item.player_name}</Text>
        <Text style={styles.publicCardSet} numberOfLines={1}>{item.year} {item.set_name}</Text>
        {item.asking_price && (
          <Text style={styles.publicCardPrice}>${item.asking_price}</Text>
        )}
      </View>
    </TouchableOpacity>
  ), [navigation, binder, linkToken, user]);

  // Now safe to early-return — every hook above runs on every
  // render, regardless of the binder being loaded or not.
  if (isLoading || !binder) return <LoadingScreen message="Loading binder..." />;

  const sections = binder.sections || [];
  const allCards = binder.cards || [];
  const sectionCards = activeSection
    ? allCards.filter((c) => c.section_id === activeSection)
    : allCards;

  let displayCards = sectionCards;
  if (filterPlayer.trim()) {
    displayCards = displayCards.filter((c) =>
      c.player_name?.toLowerCase().includes(filterPlayer.toLowerCase())
    );
  }
  if (sortBy === 'price') {
    displayCards = [...displayCards].sort((a, b) => (b.asking_price || 0) - (a.asking_price || 0));
  } else if (sortBy === 'intent') {
    // Order by purchase-readiness: priced first (one tap to buy),
    // negotiable next, trade-only after, NFS / showcase last.
    // Includes the legacy keys (sell/trade/etc.) so old binders
    // sort sensibly until any remaining old data flushes.
    const intentOrder = {
      priced_to_move: 0, sell: 0,
      lets_talk: 1, sell_or_trade: 1,
      trade_only: 2, trade: 2,
      not_for_sale: 3, nfs: 3, showcase: 3,
    };
    displayCards = [...displayCards].sort((a, b) =>
      (intentOrder[a.intent_signal] ?? 5) - (intentOrder[b.intent_signal] ?? 5)
    );
  }

  const wantListMatches = binder.want_list_matches || [];

  // Owner viewing their own binder gets an Edit gear in the header.
  // Compare against the resolved owner.id from the API response so we
  // don't depend on the link_token alone (which could be public).
  const isOwner = !!user && !!binder?.owner?.id && binder.owner.id === user.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header with back */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{binder.name}</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {isOwner ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('BinderEditor', { binderId: paramBinderId || binder.id })}
              accessibilityLabel="Edit binder"
            >
              <Ionicons name="settings-outline" size={22} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}
          {/* Owner-only "+ Add card" — drops new cards into THIS
              binder. Pre-fills the binder picker on RegisterCard so
              the user doesn't have to pick again. */}
          {isOwner ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('RegisterCard', { binderId: paramBinderId || binder.id })}
              accessibilityLabel="Add card to this binder"
            >
              <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)}>
            <Ionicons name="options-outline" size={22} color={Colors.accent} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={displayCards}
        renderItem={renderCard}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={{ padding: Spacing.base, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.md }}>
            {/* Owner info */}
            <View style={styles.ownerRow}>
              <View style={styles.ownerAvatar}>
                <Text style={styles.ownerAvatarText}>
                  {binder.owner?.display_name?.[0]?.toUpperCase() || '?'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerName}>{binder.owner?.display_name || binder.owner?.username}</Text>
                <View style={styles.trustRow}>
                  <Ionicons name="shield-checkmark" size={12} color={Colors.accent2} />
                  {/* binder.owner.trust_score from /api/b/binder/* is
                      an OBJECT (verified_deals, trades_completed,
                      flags[], avg_response_hours, etc.) — rendering
                      it directly inside <Text> crashes RN. Pull
                      individual primitives instead. */}
                  <Text style={styles.trustScore}>
                    {binder.owner?.trust_score?.verified_deals || 0} verified deal
                    {binder.owner?.trust_score?.verified_deals === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
              {user && binder.follow_enabled && (
                <TouchableOpacity
                  style={[styles.followBtn, binder.is_following && styles.followBtnActive]}
                  onPress={() => binder.is_following ? unfollowMutation.mutate() : followMutation.mutate()}
                >
                  <Text style={[styles.followBtnText, binder.is_following && { color: Colors.accent }]}>
                    {binder.is_following ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
              )}
              {/* More menu — required by Apple guideline 1.2 to
                  expose Block + Report on every UGC surface. The
                  binder owner's own view doesn't get this menu
                  (you can't block or report yourself). */}
              {user && !isOwner && binder.owner?.id ? (
                <TouchableOpacity
                  style={[styles.followBtn, { marginLeft: Spacing.xs }]}
                  onPress={() => Alert.alert(
                    binder.owner?.display_name || 'This user',
                    undefined,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Report this binder',
                        onPress: () => Alert.alert(
                          'Report this binder',
                          'Why are you reporting this binder?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Spam', onPress: () => safetyApi.reportContent({ target_type: 'binder', target_id: binder.id, reason: 'spam' }).then(() => Alert.alert('Thanks', 'Our team will review this report.')).catch((e) => Alert.alert('Error', e?.response?.data?.error || 'Try again.')) },
                            { text: 'Abusive', onPress: () => safetyApi.reportContent({ target_type: 'binder', target_id: binder.id, reason: 'abuse' }).then(() => Alert.alert('Thanks', 'Our team will review this report.')).catch((e) => Alert.alert('Error', e?.response?.data?.error || 'Try again.')) },
                            { text: 'Fraud', onPress: () => safetyApi.reportContent({ target_type: 'binder', target_id: binder.id, reason: 'fraud' }).then(() => Alert.alert('Thanks', 'Our team will review this report.')).catch((e) => Alert.alert('Error', e?.response?.data?.error || 'Try again.')) },
                            { text: 'Other', onPress: () => safetyApi.reportContent({ target_type: 'binder', target_id: binder.id, reason: 'other' }).then(() => Alert.alert('Thanks', 'Our team will review this report.')).catch((e) => Alert.alert('Error', e?.response?.data?.error || 'Try again.')) },
                          ],
                        ),
                      },
                      {
                        text: 'Block this user',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            await safetyApi.blockUser(binder.owner.id, 'Blocked from public binder');
                            Alert.alert('Blocked', 'This user has been blocked.');
                            navigation.goBack();
                          } catch (err) {
                            Alert.alert('Could not block', err?.response?.data?.error || 'Try again.');
                          }
                        },
                      },
                    ],
                  )}
                >
                  <Text style={styles.followBtnText}>{'\u22EF'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Show floor banner — physical findability at a card show.
                Renders event + table prominently so a visitor walking
                the floor knows exactly where to go. Notes (if any) sit
                underneath in italic. Field is `show_floor_live` (the
                actual column); the legacy `show_floor_active` name
                never matched the API payload. */}
            {binder.show_floor_live && (
              <View style={styles.showFloorLiveBanner}>
                <View style={styles.liveDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.showFloorLiveText}>
                    LIVE
                    {binder.show_floor_event_name ? ` at ${binder.show_floor_event_name}` : ''}
                    {binder.show_floor_table_number ? ` · Table ${binder.show_floor_table_number}` : ''}
                  </Text>
                  {binder.show_floor_notes ? (
                    <Text style={[styles.showFloorLiveText, { fontWeight: 'normal', fontStyle: 'italic', marginTop: 2 }]}>
                      {binder.show_floor_notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* Want list match banner */}
            {wantListMatches.length > 0 && (
              <View style={styles.wantMatchBanner}>
                <Ionicons name="heart" size={16} color={Colors.accent3} />
                <Text style={styles.wantMatchText}>
                  {wantListMatches.length} card{wantListMatches.length !== 1 ? 's' : ''} match your want list!
                </Text>
              </View>
            )}

            {/* Section tabs */}
            {sections.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
                <TouchableOpacity
                  style={[styles.sectionTab, !activeSection && styles.sectionTabActive]}
                  onPress={() => setActiveSection(null)}
                >
                  <Text style={[styles.sectionTabText, !activeSection && styles.sectionTabTextActive]}>All</Text>
                </TouchableOpacity>
                {sections.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.sectionTab, activeSection === s.id && styles.sectionTabActive]}
                    onPress={() => setActiveSection(s.id)}
                  >
                    <Text style={[styles.sectionTabText, activeSection === s.id && styles.sectionTabTextActive]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Filter bar */}
            {showFilters && (
              <View style={styles.filterBar}>
                <View style={styles.searchContainer}>
                  <Ionicons name="search" size={14} color={Colors.textMuted} style={{ marginRight: Spacing.sm }} />
                  <TextInput
                    style={[styles.searchInput, { fontSize: Typography.sm }]}
                    value={filterPlayer}
                    onChangeText={setFilterPlayer}
                    placeholder="Filter by player..."
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>
                <View style={styles.sortRow}>
                  {['recent', 'price', 'intent'].map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
                      onPress={() => setSortBy(s)}
                    >
                      <Text style={[styles.sortBtnText, sortBy === s && styles.sortBtnTextActive]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="📒"
            title="No cards in this binder"
            message="This binder doesn't have any cards yet."
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// BINDER CARD DETAIL MODAL
// ============================================================
export const BinderCardDetailScreen = ({ navigation, route }) => {
  const { card, binder, linkToken } = route.params;
  const user = useAuthStore((s) => s.user);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{card.player_name}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Card image */}
        <View style={styles.cardImageArea}>
          {card.front_image_url
            ? <Image source={{ uri: card.front_image_url }} style={styles.cardImage} resizeMode="contain" />
            : <View style={styles.cardImagePlaceholder}><Text style={{ fontSize: 60 }}>🃏</Text></View>
          }
        </View>

        <View style={{ padding: Spacing.base }}>
          {/* Title */}
          <Text style={styles.detailPlayer}>{card.player_name}</Text>
          <Text style={styles.detailSet}>{card.year} {card.set_name}</Text>
          {card.parallel && <Text style={styles.detailParallel}>{card.parallel}</Text>}

          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
            <IntentBadge signal={card.intent_signal} />
          </View>

          <Divider />

          {/* Grade */}
          {card.grading_company && card.grading_company !== 'raw' ? (
            <View style={styles.gradeBlock}>
              <View style={styles.gradeBadge}>
                <Text style={styles.gradeCompany}>{card.grading_company.toUpperCase()}</Text>
                <Text style={styles.gradeNum}>{card.grade}</Text>
              </View>
              {card.cert_number && (
                <Text style={styles.certNum}>Cert #{card.cert_number}</Text>
              )}
            </View>
          ) : (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Condition</Text>
              <Text style={styles.infoValue}>
                {card.condition?.replace(/_/g, ' ')?.replace(/\b\w/g, (l) => l.toUpperCase()) || 'Raw'}
              </Text>
            </View>
          )}

          {/* Price */}
          {card.asking_price && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Asking Price</Text>
              <Text style={[styles.infoValue, { color: Colors.accent }]}>${card.asking_price}</Text>
            </View>
          )}

          {/* Owner note */}
          {card.owner_note && (
            <View style={styles.ownerNoteBox}>
              <Text style={styles.ownerNoteLabel}>Owner's Note</Text>
              <Text style={styles.ownerNoteText}>{card.owner_note}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Action buttons */}
      <View style={styles.submitBar}>
        {(() => {
          // Hide buyer actions when the viewer is the binder owner.
          // PublicBinder routes owners to CardDetail instead, but a
          // deep link or stale navigation could still drop them here.
          const viewerIsOwner = !!user && !!binder?.owner?.id && binder.owner.id === user.id;
          if (viewerIsOwner) {
            return (
              <Button
                title="Edit card"
                onPress={() => card.owned_card_id && navigation.navigate('CardDetail', { cardId: card.owned_card_id })}
                disabled={!card.owned_card_id}
                style={{ flex: 1 }}
              />
            );
          }
          if (card.intent_signal !== 'not_for_sale') {
            return (
              <Button
                title={card.asking_price ? `Buy $${card.asking_price}` : 'Make Offer'}
                onPress={() => navigation.navigate('MakeOffer', {
                  cards: [card],
                  binderId: binder?.id,
                  binderOwnerId: binder?.owner?.id,
                })}
                style={{ flex: 1 }}
              />
            );
          }
          return (
            <Button
              title="Add to Want List"
              variant="secondary"
              onPress={() => Alert.alert('Want List', 'Card added to your want list.')}
              icon={<Ionicons name="heart-outline" size={18} color={Colors.text} />}
              style={{ flex: 1 }}
            />
          );
        })()}
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// MAKE OFFER SCREEN
// ============================================================
export const MakeOfferScreen = ({ navigation, route }) => {
  const { cards: offerCards, binderId, binderOwnerId } = route.params;
  const queryClient = useQueryClient();

  const [offerType, setOfferType] = useState('single');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [tradeCards, setTradeCards] = useState([]);
  const [showTradePicker, setShowTradePicker] = useState(false);

  const { data: myCardsData } = useQuery({
    queryKey: ['my-cards'],
    queryFn: () => cardsApi.mine({ limit: 200 }).then((r) => r.data),
  });
  const myCards = myCardsData?.cards || [];

  const createOfferMutation = useMutation({
    mutationFn: (data) => offersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-offers'] });
      Alert.alert('Offer Sent', 'Your offer has been sent to the seller.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to send offer'),
  });

  const handleSubmit = () => {
    const payload = {
      binder_id: binderId,
      to_user_id: binderOwnerId,
      offer_type: offerType,
      card_ids: offerCards.map((c) => c.id),
      amount: ['single', 'bundle', 'trade_plus_cash'].includes(offerType) && amount
        ? parseFloat(amount) : undefined,
      trade_card_ids: ['trade', 'trade_plus_cash'].includes(offerType) ? tradeCards.map((c) => c.id) : undefined,
      message: message.trim() || undefined,
    };
    createOfferMutation.mutate(payload);
  };

  const OFFER_TYPES = [
    { key: 'single', label: 'Cash', icon: 'cash-outline' },
    { key: 'trade', label: 'Trade', icon: 'swap-horizontal-outline' },
    { key: 'trade_plus_cash', label: 'Trade + Cash', icon: 'git-merge-outline' },
    { key: 'bundle', label: 'Bundle', icon: 'layers-outline' },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Make Offer</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 }}>
        {/* Cards being offered on */}
        <View>
          <SectionHeader title="Card(s)" />
          {offerCards.map((card) => (
            <View key={card.id} style={styles.offerCardPreview}>
              <View style={styles.pickerCardImg}>
                {card.front_image_url
                  ? <Image source={{ uri: card.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                  : <Text style={{ fontSize: 20 }}>🃏</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerCardPlayer}>{card.player_name}</Text>
                <Text style={styles.pickerCardSet}>{card.year} {card.set_name}</Text>
              </View>
              {card.asking_price && (
                <Text style={styles.offerCardPrice}>${card.asking_price}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Offer type */}
        <View>
          <SectionHeader title="Offer Type" />
          <View style={styles.offerTypeRow}>
            {OFFER_TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.offerTypeBtn, offerType === t.key && styles.offerTypeBtnActive]}
                onPress={() => setOfferType(t.key)}
              >
                <Ionicons
                  name={t.icon}
                  size={18}
                  color={offerType === t.key ? Colors.accent : Colors.textMuted}
                />
                <Text style={[styles.offerTypeText, offerType === t.key && { color: Colors.accent }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Cash amount */}
        {['single', 'bundle', 'trade_plus_cash'].includes(offerType) && (
          <Input
            label="Offer Amount ($)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        )}

        {/* Trade card picker */}
        {['trade', 'trade_plus_cash'].includes(offerType) && (
          <View>
            <SectionHeader
              title="Your Trade Cards"
              action={{ label: '+ Add', onPress: () => setShowTradePicker(true) }}
            />
            {tradeCards.length === 0 ? (
              <TouchableOpacity style={styles.addTradeBtn} onPress={() => setShowTradePicker(true)}>
                <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
                <Text style={styles.addTradeBtnText}>Select cards from your collection</Text>
              </TouchableOpacity>
            ) : (
              tradeCards.map((card) => (
                <View key={card.id} style={styles.offerCardPreview}>
                  <View style={styles.pickerCardImg}>
                    {card.front_image_url
                      ? <Image source={{ uri: card.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                      : <Text style={{ fontSize: 20 }}>🃏</Text>
                    }
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerCardPlayer}>{card.player_name}</Text>
                    <Text style={styles.pickerCardSet}>{card.year} {card.set_name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setTradeCards((tc) => tc.filter((c) => c.id !== card.id))}>
                    <Ionicons name="close-circle" size={18} color={Colors.accent3} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {/* Trade card picker modal */}
        <Modal visible={showTradePicker} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => setShowTradePicker(false)}>
                <Text style={{ color: Colors.accent, fontSize: Typography.base }}>Done</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Select Trade Cards</Text>
              <View style={{ width: 40 }} />
            </View>
            <FlatList
              data={myCards}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm }}
              renderItem={({ item }) => {
                const isSelected = tradeCards.some((c) => c.id === item.id);
                return (
                  <TouchableOpacity
                    style={[styles.pickerCard, isSelected && styles.pickerCardSelected]}
                    onPress={() => {
                      if (isSelected) {
                        setTradeCards((tc) => tc.filter((c) => c.id !== item.id));
                      } else {
                        setTradeCards((tc) => [...tc, item]);
                      }
                    }}
                  >
                    <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                      {isSelected && <Ionicons name="checkmark" size={14} color={Colors.bg} />}
                    </View>
                    <View style={styles.pickerCardImg}>
                      {item.front_image_url
                        ? <Image source={{ uri: item.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                        : <Text style={{ fontSize: 20 }}>🃏</Text>
                      }
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerCardPlayer}>{item.player_name}</Text>
                      <Text style={styles.pickerCardSet}>{item.year} {item.set_name}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </SafeAreaView>
        </Modal>

        {/* Message */}
        <Input
          label="Message (optional)"
          value={message}
          onChangeText={setMessage}
          placeholder="Add a note to the seller..."
          multiline
          numberOfLines={3}
        />
      </ScrollView>

      <View style={styles.submitBar}>
        <Button
          title="Submit Offer"
          onPress={handleSubmit}
          loading={createOfferMutation.isPending}
          style={{ flex: 1 }}
        />
      </View>
    </SafeAreaView>
  );
};

// ============================================================
// OFFERS LIST SCREEN
// ============================================================
export const OffersListScreen = ({ navigation }) => {
  const [tab, setTab] = useState('received');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-offers', tab],
    queryFn: () => offersApi.mine({ direction: tab }).then((r) => r.data),
  });

  const offers = data?.offers || [];

  if (isLoading) return <LoadingScreen message="Loading offers..." />;

  const getStatusColor = (status) => ({
    pending: Colors.warning,
    accepted: Colors.success,
    declined: Colors.accent3,
    countered: Colors.info,
    cancelled: Colors.textMuted,
    expired: Colors.textDim,
  }[status] || Colors.textMuted);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Offers" />

      {/* Tab toggle */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'received' && styles.tabBtnActive]}
          onPress={() => setTab('received')}
        >
          <Text style={[styles.tabBtnText, tab === 'received' && styles.tabBtnTextActive]}>Received</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sent' && styles.tabBtnActive]}
          onPress={() => setTab('sent')}
        >
          <Text style={[styles.tabBtnText, tab === 'sent' && styles.tabBtnTextActive]}>Sent</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={offers}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm, paddingBottom: 80 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.offerItem}
            onPress={() => navigation.navigate('OfferDetail', { offerId: item.id })}
          >
            <View style={styles.offerItemImg}>
              {item.card_image_url
                ? <Image source={{ uri: item.card_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                : <Text style={{ fontSize: 20 }}>🃏</Text>
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.offerItemTitle}>
                {item.card_count > 1 ? `${item.card_count} cards` : item.player_name || 'Card'}
              </Text>
              <Text style={styles.offerItemMeta}>
                {item.offer_type?.replace(/_/g, ' ')}
                {item.amount ? ` · $${item.amount}` : ''}
              </Text>
              <Text style={styles.offerItemUser}>
                {tab === 'received' ? `From: ${item.from_username}` : `To: ${item.to_username}`}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <View style={[styles.offerStatusBadge, { borderColor: getStatusColor(item.status) }]}>
                <Text style={[styles.offerStatusText, { color: getStatusColor(item.status) }]}>
                  {item.status?.charAt(0).toUpperCase() + item.status?.slice(1)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="💬"
            title={`No ${tab} offers`}
            message={tab === 'received' ? 'Offers from other collectors will appear here.' : 'Offers you send will appear here.'}
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// OFFER DETAIL SCREEN
// ============================================================
export const OfferDetailScreen = ({ navigation, route }) => {
  const { offerId } = route.params;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const [counterAmount, setCounterAmount] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [showCounter, setShowCounter] = useState(false);
  const [threadMessage, setThreadMessage] = useState('');

  const { data: offer, isLoading } = useQuery({
    queryKey: ['offer', offerId],
    queryFn: () => offersApi.get(offerId).then((r) => r.data),
  });

  const acceptMutation = useMutation({
    mutationFn: () => offersApi.accept(offerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      queryClient.invalidateQueries({ queryKey: ['my-offers'] });
      Alert.alert('Accepted', 'Offer accepted! A transaction will be created.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to accept offer'),
  });

  const declineMutation = useMutation({
    mutationFn: () => offersApi.decline(offerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      queryClient.invalidateQueries({ queryKey: ['my-offers'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to decline offer'),
  });

  const counterMutation = useMutation({
    mutationFn: (data) => offersApi.counter(offerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      setShowCounter(false);
      setCounterAmount('');
      setCounterMessage('');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to counter'),
  });

  const messageMutation = useMutation({
    mutationFn: (data) => offersApi.message(offerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      setThreadMessage('');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to send message'),
  });

  if (isLoading || !offer) return <LoadingScreen />;

  const isRecipient = offer.to_user_id === user?.id;
  const isSender = offer.from_user_id === user?.id;
  const messages = offer.messages || [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Offer Detail</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 120 }}>
        {/* Cards */}
        <View>
          <SectionHeader title="Card(s)" />
          {(offer.cards || []).map((card) => (
            <View key={card.id} style={styles.offerCardPreview}>
              <View style={styles.pickerCardImg}>
                {card.front_image_url
                  ? <Image source={{ uri: card.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                  : <Text style={{ fontSize: 20 }}>🃏</Text>
                }
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerCardPlayer}>{card.player_name}</Text>
                <Text style={styles.pickerCardSet}>{card.year} {card.set_name}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Offer details */}
        <View style={styles.offerDetailCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>{offer.offer_type?.replace(/_/g, ' ')}</Text>
          </View>
          {offer.amount && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Amount</Text>
              <Text style={[styles.infoValue, { color: Colors.accent }]}>${offer.amount}</Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{offer.status}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>From</Text>
            <Text style={styles.infoValue}>{offer.from_username}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>To</Text>
            <Text style={styles.infoValue}>{offer.to_username}</Text>
          </View>
        </View>

        {/* Trade cards if any */}
        {offer.trade_cards && offer.trade_cards.length > 0 && (
          <View>
            <SectionHeader title="Trade Cards Offered" />
            {offer.trade_cards.map((card) => (
              <View key={card.id} style={styles.offerCardPreview}>
                <View style={styles.pickerCardImg}>
                  {card.front_image_url
                    ? <Image source={{ uri: card.front_image_url }} style={{ width: 36, height: 50 }} resizeMode="contain" />
                    : <Text style={{ fontSize: 20 }}>🃏</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerCardPlayer}>{card.player_name}</Text>
                  <Text style={styles.pickerCardSet}>{card.year} {card.set_name}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Messages thread */}
        <View>
          <SectionHeader title="Messages" />
          {messages.length === 0 && (
            <Text style={styles.noMessages}>No messages yet</Text>
          )}
          {messages.map((msg, i) => (
            <View
              key={msg.id || i}
              style={[styles.messageBubble, msg.from_user_id === user?.id && styles.messageBubbleSelf]}
            >
              <Text style={styles.messageUser}>{msg.from_username || 'User'}</Text>
              <Text style={styles.messageText}>{msg.content}</Text>
              <Text style={styles.messageTime}>
                {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
              </Text>
            </View>
          ))}
        </View>

        {/* Message input */}
        {offer.status === 'pending' || offer.status === 'countered' ? (
          <View style={styles.messageInputRow}>
            <TextInput
              style={styles.messageInput}
              value={threadMessage}
              onChangeText={setThreadMessage}
              placeholder="Type a message..."
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity
              style={styles.sendBtn}
              onPress={() => {
                if (!threadMessage.trim()) return;
                messageMutation.mutate({ content: threadMessage.trim() });
              }}
            >
              <Ionicons name="send" size={18} color={Colors.bg} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Counter form */}
        {showCounter && (
          <View style={styles.counterCard}>
            <SectionHeader title="Counter Offer" />
            <Input
              label="Counter Amount ($)"
              value={counterAmount}
              onChangeText={setCounterAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
            <Input
              label="Message"
              value={counterMessage}
              onChangeText={setCounterMessage}
              placeholder="Explain your counter..."
              multiline
              numberOfLines={2}
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Send Counter"
                onPress={() => counterMutation.mutate({
                  amount: counterAmount ? parseFloat(counterAmount) : undefined,
                  message: counterMessage.trim() || undefined,
                })}
                loading={counterMutation.isPending}
                size="sm"
                style={{ flex: 1 }}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowCounter(false)}
                size="sm"
                style={{ flex: 1 }}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      {offer.status === 'pending' && (
        <View style={styles.submitBar}>
          {isRecipient && (
            <>
              <Button
                title="Accept"
                onPress={() => Alert.alert('Accept Offer', 'Accept this offer?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Accept', onPress: () => acceptMutation.mutate() },
                ])}
                loading={acceptMutation.isPending}
                style={{ flex: 1 }}
              />
              <Button
                title="Counter"
                variant="secondary"
                onPress={() => setShowCounter(true)}
                style={{ flex: 1 }}
              />
              <Button
                title="Decline"
                variant="danger"
                size="sm"
                onPress={() => Alert.alert('Decline Offer', 'Decline this offer?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Decline', style: 'destructive', onPress: () => declineMutation.mutate() },
                ])}
                loading={declineMutation.isPending}
                style={{ flex: 0.6 }}
              />
            </>
          )}
          {isSender && (
            <Button
              title="Cancel Offer"
              variant="danger"
              onPress={() => Alert.alert('Cancel Offer', 'Cancel your offer?', [
                { text: 'No', style: 'cancel' },
                { text: 'Cancel Offer', style: 'destructive', onPress: () => declineMutation.mutate() },
              ])}
              style={{ flex: 1 }}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
};

// ============================================================
// TRANSACTION SCREEN (CSTX)
// ============================================================
export const TransactionScreen = ({ navigation, route }) => {
  const { transactionId } = route.params;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [paymentId, setPaymentId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const { data: tx, isLoading } = useQuery({
    queryKey: ['transaction', transactionId],
    queryFn: () => cstxApi.get(transactionId).then((r) => r.data),
  });

  // Video gate status (Theme E2). Re-fetched whenever the user
  // returns to this screen so a freshly-recorded video lights up
  // the right banners without a manual reload.
  const { data: videoStatus } = useQuery({
    queryKey: ['cstx-video-status', transactionId],
    queryFn: () => cstxApi.videoStatus(transactionId).then((r) => r.data),
    refetchOnMount: true,
  });

  const { data: tracking } = useQuery({
    queryKey: ['cstx-tracking-url', transactionId],
    queryFn: () => cstxApi.trackingUrl(transactionId).then((r) => r.data),
    enabled: !!tx?.tracking_number,
  });

  const waiveVideoMutation = useMutation({
    mutationFn: () => cstxApi.waiveVideo(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cstx-video-status', transactionId] });
      Alert.alert('Waiver recorded', 'The other party must also waive for the video requirement to be lifted on this deal.');
    },
    onError: (err) => Alert.alert('Could not waive', err.response?.data?.error || err.message),
  });

  const submitPaymentMutation = useMutation({
    mutationFn: (data) => cstxApi.submitPayment(transactionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', transactionId] });
      Alert.alert('Payment Submitted', 'The seller will be notified to confirm.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to submit payment'),
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: () => cstxApi.confirmPayment(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', transactionId] });
      Alert.alert('Payment Confirmed', 'Please ship the card and add tracking info.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to confirm payment'),
  });

  const addTrackingMutation = useMutation({
    mutationFn: (data) => cstxApi.addTracking(transactionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', transactionId] });
      Alert.alert('Tracking Added', 'The buyer will be notified.');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to add tracking'),
  });

  const confirmDeliveryMutation = useMutation({
    mutationFn: () => cstxApi.confirmDelivery(transactionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction', transactionId] });
      Alert.alert('Delivery Confirmed', 'Transaction complete!');
    },
    onError: (err) => Alert.alert('Error', err.response?.data?.error || 'Failed to confirm delivery'),
  });

  if (isLoading || !tx) return <LoadingScreen />;

  const isBuyer = tx.buyer_id === user?.id;
  const isSeller = tx.seller_id === user?.id;

  const STEPS = [
    { key: 'pending_payment', label: 'Pending Payment' },
    { key: 'payment_submitted', label: 'Payment Submitted' },
    { key: 'payment_confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'complete', label: 'Complete' },
  ];
  const currentStepIndex = STEPS.findIndex((s) => s.key === tx.status);

  const copyToClipboard = async (text) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', 'Copied to clipboard.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transaction</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 100 }}>
        {/* CSTX ID */}
        <View style={styles.cstxIdCard}>
          <Text style={styles.cstxIdLabel}>CSTX ID</Text>
          <Text style={styles.cstxIdValue}>{tx.cstx_id || tx.id}</Text>
        </View>

        {/* Status stepper */}
        <View style={styles.stepperCard}>
          {STEPS.map((step, i) => {
            const isActive = i <= currentStepIndex;
            const isCurrent = i === currentStepIndex;
            return (
              <View key={step.key} style={styles.stepItem}>
                <View style={styles.stepDotRow}>
                  <View style={[
                    styles.stepDot,
                    isActive && styles.stepDotActive,
                    isCurrent && styles.stepDotCurrent,
                  ]}>
                    {isActive && <Ionicons name="checkmark" size={10} color={Colors.bg} />}
                  </View>
                  {i < STEPS.length - 1 && (
                    <View style={[styles.stepLine, isActive && styles.stepLineActive]} />
                  )}
                </View>
                <Text style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                  isCurrent && styles.stepLabelCurrent,
                ]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Amount */}
        {tx.amount && (
          <View style={styles.offerDetailCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Amount</Text>
              <Text style={[styles.infoValue, { color: Colors.accent }]}>${tx.amount}</Text>
            </View>
          </View>
        )}

        {/* Payment handles for buyer */}
        {isBuyer && tx.status === 'pending_payment' && tx.payment_handles && (
          <View>
            <SectionHeader title="Payment Handles" />
            <View style={styles.paymentHandleCard}>
              {tx.payment_handles.venmo && (
                <TouchableOpacity style={styles.paymentHandle} onPress={() => copyToClipboard(tx.payment_handles.venmo)}>
                  <Text style={styles.paymentHandleLabel}>Venmo</Text>
                  <Text style={styles.paymentHandleValue}>{tx.payment_handles.venmo}</Text>
                  <Ionicons name="copy-outline" size={14} color={Colors.accent} />
                </TouchableOpacity>
              )}
              {tx.payment_handles.paypal && (
                <TouchableOpacity style={styles.paymentHandle} onPress={() => copyToClipboard(tx.payment_handles.paypal)}>
                  <Text style={styles.paymentHandleLabel}>PayPal</Text>
                  <Text style={styles.paymentHandleValue}>{tx.payment_handles.paypal}</Text>
                  <Ionicons name="copy-outline" size={14} color={Colors.accent} />
                </TouchableOpacity>
              )}
              {tx.payment_handles.cashapp && (
                <TouchableOpacity style={styles.paymentHandle} onPress={() => copyToClipboard(tx.payment_handles.cashapp)}>
                  <Text style={styles.paymentHandleLabel}>Cash App</Text>
                  <Text style={styles.paymentHandleValue}>{tx.payment_handles.cashapp}</Text>
                  <Ionicons name="copy-outline" size={14} color={Colors.accent} />
                </TouchableOpacity>
              )}
            </View>

            <Input
              label="Payment Confirmation ID"
              value={paymentId}
              onChangeText={setPaymentId}
              placeholder="Enter payment ID or reference..."
            />
            <Button
              title="Submit Payment"
              onPress={() => {
                if (!paymentId.trim()) {
                  Alert.alert('Required', 'Please enter a payment ID');
                  return;
                }
                submitPaymentMutation.mutate({ payment_id: paymentId.trim() });
              }}
              loading={submitPaymentMutation.isPending}
            />
          </View>
        )}

        {/* Seller: confirm payment */}
        {isSeller && tx.status === 'payment_submitted' && (
          <View>
            <View style={styles.noteBox}>
              <Ionicons name="information-circle" size={16} color={Colors.info} />
              <Text style={styles.noteText}>
                Buyer has submitted payment (ID: {tx.payment_id}). Please verify and confirm.
              </Text>
            </View>
            <Button
              title="Confirm Payment Received"
              onPress={() => Alert.alert('Confirm Payment', 'Confirm you received payment?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Confirm', onPress: () => confirmPaymentMutation.mutate() },
              ])}
              loading={confirmPaymentMutation.isPending}
            />
          </View>
        )}

        {/* Video gate banner (Theme E2). Shown whenever video is required. */}
        {videoStatus?.video_required && (
          <View style={styles.videoGateCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="videocam" size={18} color={Colors.accent} />
              <Text style={styles.videoGateTitle}>
                {videoStatus.waiver?.fully_waived ? 'Video waived' : 'Video required'}
              </Text>
            </View>
            <Text style={styles.videoGateBody}>
              {videoStatus.waiver?.fully_waived
                ? 'Both parties opted out. Disputes fall back to chain-of-custody record only.'
                : `This deal is $${tx.deal_amount} — pack-out and unpack videos are required for any dispute. Your video protects YOU specifically.`}
            </Text>
            {!videoStatus.waiver?.fully_waived && (
              <View style={{ marginTop: Spacing.xs }}>
                <Text style={styles.videoStatusLine}>
                  • Pack-out (seller): {videoStatus.packout?.recorded ? '✓ recorded' : '— not yet'}
                </Text>
                <Text style={styles.videoStatusLine}>
                  • Unpack (buyer): {videoStatus.unpack?.recorded ? '✓ recorded' : '— not yet'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Seller: record pack-out before adding tracking */}
        {isSeller && tx.status === 'payment_confirmed' && videoStatus?.video_required && !videoStatus.packout?.recorded && !videoStatus.waiver?.fully_waived && (
          <View style={styles.gateActionCard}>
            <Text style={styles.gateActionTitle}>Step 1: Record pack-out video</Text>
            <Text style={styles.gateActionBody}>
              Record the card going into its holder, the envelope/box, the address label, and the seal. The challenge phrase will appear on screen — keep it visible during recording.
            </Text>
            <Button
              title="Record pack-out video"
              onPress={() => navigation.navigate('TransferVideo', { transactionId, phase: 'packout' })}
            />
            <Button
              title="Skip — waive video for this deal"
              variant="secondary"
              onPress={() => Alert.alert(
                'Waive video?',
                'You won\'t be able to open a dispute on this deal unless the buyer also waives. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Waive', style: 'destructive', onPress: () => waiveVideoMutation.mutate() },
                ]
              )}
              style={{ marginTop: Spacing.xs }}
            />
          </View>
        )}

        {/* Seller: add tracking (gated behind pack-out video if required) */}
        {isSeller && tx.status === 'payment_confirmed' && (videoStatus?.packout?.recorded || !videoStatus?.video_required || videoStatus?.waiver?.fully_waived) && (
          <View>
            <Input
              label="Tracking Number"
              value={trackingNumber}
              onChangeText={setTrackingNumber}
              placeholder="Enter shipping tracking number..."
            />
            <Button
              title="Add Tracking"
              onPress={() => {
                if (!trackingNumber.trim()) {
                  Alert.alert('Required', 'Please enter a tracking number');
                  return;
                }
                addTrackingMutation.mutate({ tracking_number: trackingNumber.trim() });
              }}
              loading={addTrackingMutation.isPending}
            />
          </View>
        )}

        {/* Tracking info display + carrier link-out (Theme E1) */}
        {tx.tracking_number && (
          <View style={styles.offerDetailCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Tracking</Text>
              <TouchableOpacity onPress={() => copyToClipboard(tx.tracking_number)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.infoValue}>{tx.tracking_number}</Text>
                  <Ionicons name="copy-outline" size={12} color={Colors.accent} />
                </View>
              </TouchableOpacity>
            </View>
            {tracking?.tracking?.url && (
              <TouchableOpacity
                style={styles.trackBtn}
                onPress={() => Linking.openURL(tracking.tracking.url)}
              >
                <Ionicons name="open-outline" size={14} color={Colors.accent} />
                <Text style={styles.trackBtnText}>Track on {(tracking.tracking.carrier || 'carrier').toUpperCase()}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Buyer: record unpack video before confirming delivery */}
        {isBuyer && (tx.status === 'shipped' || tx.status === 'delivered') && videoStatus?.video_required && !videoStatus.unpack?.recorded && !videoStatus.waiver?.fully_waived && (
          <View style={styles.gateActionCard}>
            <Text style={styles.gateActionTitle}>Don't open the package yet</Text>
            <Text style={styles.gateActionBody}>
              Start the unpack video FIRST, then open the package on camera. Show the label, the unboxing, and the card emerging from its holder. This is your dispute coverage.
            </Text>
            <Button
              title="Record unpack video"
              onPress={() => navigation.navigate('TransferVideo', { transactionId, phase: 'unpack' })}
            />
            <Button
              title="Skip — waive video for this deal"
              variant="secondary"
              onPress={() => Alert.alert(
                'Waive video?',
                'You won\'t be able to open a dispute on this deal unless the seller also waives. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Waive', style: 'destructive', onPress: () => waiveVideoMutation.mutate() },
                ]
              )}
              style={{ marginTop: Spacing.xs }}
            />
          </View>
        )}

        {/* Buyer: confirm delivery (gated behind unpack video if required) */}
        {isBuyer && (tx.status === 'shipped' || tx.status === 'delivered') && (videoStatus?.unpack?.recorded || !videoStatus?.video_required || videoStatus?.waiver?.fully_waived) && (
          <Button
            title="Confirm Delivery"
            onPress={() => Alert.alert('Confirm Delivery', 'Confirm you received the card?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Confirm', onPress: () => confirmDeliveryMutation.mutate() },
            ])}
            loading={confirmDeliveryMutation.isPending}
          />
        )}

        {/* Buyer: file stalled-transfer report after SLA breach */}
        {isBuyer && tx.status === 'payment_confirmed' && (() => {
          const ageMs = Date.now() - new Date(tx.created_at).getTime();
          const ageDays = ageMs / (1000 * 60 * 60 * 24);
          if (ageDays < 5) return null;
          return (
            <TouchableOpacity
              style={styles.stalledBtn}
              onPress={() => navigation.navigate('StalledTransferReport', { transactionId })}
            >
              <Ionicons name="time-outline" size={16} color={Colors.accent3} />
              <Text style={styles.stalledBtnText}>Seller hasn't shipped — file stalled report</Text>
            </TouchableOpacity>
          );
        })()}

        {/* Report problem — with video-gate disclaimer if applicable */}
        {tx.status !== 'complete' && tx.status !== 'disputed' && (
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => {
              const role = isBuyer ? 'buyer' : 'seller';
              const myVideo = role === 'buyer' ? videoStatus?.unpack?.recorded : videoStatus?.packout?.recorded;
              if (videoStatus?.video_required && !myVideo && !videoStatus?.waiver?.fully_waived) {
                Alert.alert(
                  'Video required',
                  `This deal is $${tx.deal_amount} — to open a dispute you need your own ${role === 'buyer' ? 'unpack' : 'pack-out'} video. The other party's video status doesn't affect your case.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Record video', onPress: () => navigation.navigate('TransferVideo', { transactionId, phase: role === 'buyer' ? 'unpack' : 'packout' }) },
                  ]
                );
                return;
              }
              navigation.navigate('DisputeDetail', { transactionId });
            }}
          >
            <Ionicons name="warning-outline" size={16} color={Colors.accent3} />
            <Text style={styles.reportBtnText}>Report a Problem</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// BINDER ANALYTICS SCREEN
// ============================================================
export const BinderAnalyticsScreen = ({ navigation, route }) => {
  const { binderId } = route.params;

  const { data, isLoading } = useQuery({
    queryKey: ['binder-analytics', binderId],
    queryFn: () => bindersApi.analytics(binderId).then((r) => r.data),
  });

  if (isLoading) return <LoadingScreen message="Loading analytics..." />;

  const analytics = data || {};

  const StatBox = ({ label, value, color }) => (
    <View style={styles.statBox}>
      <Text style={[styles.statBoxValue, color && { color }]}>{value ?? '—'}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Analytics</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.base, gap: Spacing.md, paddingBottom: 80 }}>
        {/* Collector+ badge */}
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={16} color={Colors.accent4} />
          <Text style={styles.premiumBadgeText}>Collector+ Feature</Text>
        </View>

        {/* Top stats */}
        <View style={styles.statsGrid}>
          <StatBox label="Total Views" value={analytics.total_views || 0} color={Colors.accent} />
          <StatBox label="Offer Rate" value={analytics.offer_rate ? `${analytics.offer_rate}%` : '0%'} color={Colors.accent2} />
          <StatBox label="Followers" value={analytics.follower_count || 0} color={Colors.accent4} />
          <StatBox label="Total Offers" value={analytics.total_offers || 0} />
        </View>

        <Divider />

        {/* Card view counts */}
        <View>
          <SectionHeader title="Card Views" />
          {(analytics.card_views || []).length === 0 && (
            <Text style={styles.noMessages}>No card view data yet</Text>
          )}
          {(analytics.card_views || []).map((cv, i) => (
            <View key={cv.card_id || i} style={styles.analyticsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.analyticsCardName}>{cv.player_name}</Text>
                <Text style={styles.analyticsCardSet}>{cv.year} {cv.set_name}</Text>
              </View>
              <Text style={styles.analyticsCount}>{cv.view_count} views</Text>
            </View>
          ))}
        </View>

        <Divider />

        {/* Most offered cards */}
        <View>
          <SectionHeader title="Most Offered Cards" />
          {(analytics.most_offered || []).length === 0 && (
            <Text style={styles.noMessages}>No offer data yet</Text>
          )}
          {(analytics.most_offered || []).map((mo, i) => (
            <View key={mo.card_id || i} style={styles.analyticsRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.analyticsCardName}>{mo.player_name}</Text>
                <Text style={styles.analyticsCardSet}>{mo.year} {mo.set_name}</Text>
              </View>
              <Text style={[styles.analyticsCount, { color: Colors.accent }]}>{mo.offer_count} offers</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold, flex: 1, textAlign: 'center' },
  createBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, backgroundColor: Colors.accent,
  },
  createBtnText: { color: Colors.bg, fontSize: Typography.sm, fontWeight: Typography.bold },

  // Binder list
  binderItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  binderIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    backgroundColor: Colors.accent + '22', alignItems: 'center', justifyContent: 'center',
  },
  binderName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  binderMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2, marginBottom: Spacing.xs },
  binderMetaText: { color: Colors.textMuted, fontSize: Typography.xs },
  binderMetaDot: { color: Colors.textMuted, fontSize: Typography.xs },

  // Toggle card
  toggleCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  toggleItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.base,
  },
  toggleIcon: {
    width: 32, height: 32, borderRadius: Radius.sm,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  toggleLabel: { flex: 1, color: Colors.text, fontSize: Typography.base },
  toggleDivider: { height: 1, backgroundColor: Colors.border, marginLeft: 64 },

  // Link type
  linkTypeRow: { flexDirection: 'row', gap: Spacing.sm },
  linkTypeBtn: {
    flex: 1, padding: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center',
  },
  linkTypeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  linkTypeText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  linkTypeTextActive: { color: Colors.accent },

  // Sections
  sectionInputRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionInput: {
    flex: 1, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: Typography.sm,
  },
  sectionAddBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  sectionItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  sectionItemName: { flex: 1, color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  sectionItemCount: { color: Colors.textMuted, fontSize: Typography.xs },

  // Share link
  shareLinkCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  shareLinkUrl: { color: Colors.text, fontSize: Typography.sm, fontFamily: 'Courier', marginBottom: Spacing.md },
  shareLinkBtns: { flexDirection: 'row', gap: Spacing.sm },
  shareLinkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.accent,
    backgroundColor: Colors.accent + '15',
  },
  shareLinkBtnText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },

  // QR
  qrCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.xl, alignItems: 'center',
  },
  qrPlaceholder: {
    width: 160, height: 160, borderRadius: Radius.md,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  qrHint: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center' },

  // Show floor
  showFloorCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.accent4, padding: Spacing.xl,
    alignItems: 'center',
  },
  showFloorTitle: { color: Colors.text, fontSize: Typography.lg, fontWeight: Typography.bold, marginTop: Spacing.sm },
  showFloorDesc: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
  liveDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent3,
  },

  // Submit bar
  submitBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: Spacing.base, backgroundColor: Colors.bg,
    borderTopWidth: 1, borderTopColor: Colors.border,
    flexDirection: 'row', gap: Spacing.sm,
  },

  // Search
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: {
    flex: 1, paddingVertical: Spacing.md,
    color: Colors.text, fontSize: Typography.base,
  },

  // Card picker
  pickerCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  pickerCardSelected: { borderColor: Colors.accent, backgroundColor: Colors.accent + '10' },
  checkbox: {
    width: 22, height: 22, borderRadius: Radius.sm,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  pickerCardImg: {
    width: 40, height: 54, borderRadius: 4,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  pickerCardPlayer: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  pickerCardSet: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 1 },
  pickerCardGrade: { color: Colors.accent, fontSize: Typography.xs, fontWeight: Typography.medium, marginTop: 1 },
  pickerSettings: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    marginTop: -1, padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderTopWidth: 0,
  },
  pickerSettingsLabel: {
    color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold,
    letterSpacing: 1, marginBottom: Spacing.sm,
  },
  intentRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md, flexWrap: 'wrap' },
  intentBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  intentBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  intentBtnText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium },
  intentBtnTextActive: { color: Colors.accent },

  // Public binder
  ownerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  ownerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.accent + '22', borderWidth: 1, borderColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ownerAvatarText: { color: Colors.accent, fontSize: Typography.lg, fontWeight: Typography.heavy },
  ownerName: { color: Colors.text, fontSize: Typography.base, fontWeight: Typography.semibold },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trustScore: { color: Colors.accent2, fontSize: Typography.xs, fontWeight: Typography.medium },
  followBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.accent + '15',
  },
  followBtnActive: { backgroundColor: Colors.accent + '22' },
  followBtnText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  showFloorLiveBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent3 + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent3 + '40', padding: Spacing.sm, marginBottom: Spacing.md,
  },
  showFloorLiveText: { color: Colors.accent3, fontSize: Typography.sm, fontWeight: Typography.bold },
  wantMatchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent3 + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent3 + '30', padding: Spacing.sm, marginBottom: Spacing.md,
  },
  wantMatchText: { color: Colors.accent3, fontSize: Typography.sm, fontWeight: Typography.medium },
  sectionTab: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    marginRight: Spacing.sm,
  },
  sectionTabActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  sectionTabText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.medium },
  sectionTabTextActive: { color: Colors.accent, fontWeight: Typography.semibold },
  filterBar: { marginBottom: Spacing.sm },
  sortRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  sortBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
  },
  sortBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  sortBtnText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.medium },
  sortBtnTextActive: { color: Colors.accent },
  publicCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    ...Shadows.sm,
  },
  publicCardImg: {
    backgroundColor: Colors.surface2, aspectRatio: 0.72, position: 'relative',
  },
  publicCardIntentOverlay: { position: 'absolute', top: 6, left: 6 },
  publicCardPlayer: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  publicCardSet: { color: Colors.textMuted, fontSize: Typography.xs },
  publicCardPrice: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.bold, marginTop: 2 },

  // Card detail
  cardImageArea: {
    height: 280, backgroundColor: Colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  cardImage: { width: 200, height: 280 },
  cardImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  detailPlayer: { color: Colors.text, fontSize: Typography.xl, fontWeight: Typography.heavy, marginBottom: 2 },
  detailSet: { color: Colors.textMuted, fontSize: Typography.base },
  detailParallel: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium, marginTop: 2 },
  gradeBlock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginVertical: Spacing.md },
  gradeBadge: {
    backgroundColor: Colors.accent, borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, alignItems: 'center',
  },
  gradeCompany: { color: Colors.bg, fontSize: Typography.xs, fontWeight: Typography.heavy, letterSpacing: 1 },
  gradeNum: { color: Colors.bg, fontSize: Typography.xxl, fontWeight: Typography.heavy, lineHeight: 32 },
  certNum: { color: Colors.textMuted, fontSize: Typography.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  infoLabel: { color: Colors.textMuted, fontSize: Typography.sm },
  infoValue: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  ownerNoteBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginTop: Spacing.md,
  },
  ownerNoteLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 0.5, marginBottom: Spacing.xs },
  ownerNoteText: { color: Colors.text, fontSize: Typography.sm, lineHeight: 20 },

  // Make offer
  offerCardPreview: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm,
  },
  offerCardPrice: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.bold },
  offerTypeRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  offerTypeBtn: {
    flex: 1, minWidth: '40%', padding: Spacing.sm, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface2,
    alignItems: 'center', gap: 4,
  },
  offerTypeBtnActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '15' },
  offerTypeText: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold },
  addTradeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accent + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent + '40', padding: Spacing.md,
  },
  addTradeBtnText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.medium },

  // Offers list
  tabRow: {
    flexDirection: 'row', marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.surface2, borderRadius: Radius.md, padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: Radius.sm, alignItems: 'center' },
  tabBtnActive: { backgroundColor: Colors.accent },
  tabBtnText: { color: Colors.textMuted, fontSize: Typography.sm, fontWeight: Typography.semibold },
  tabBtnTextActive: { color: Colors.bg },
  offerItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  offerItemImg: {
    width: 40, height: 54, borderRadius: 4,
    backgroundColor: Colors.surface2, alignItems: 'center', justifyContent: 'center',
  },
  offerItemTitle: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
  offerItemMeta: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2, textTransform: 'capitalize' },
  offerItemUser: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 1 },
  offerStatusBadge: {
    borderWidth: 1, borderRadius: Radius.full,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  offerStatusText: { fontSize: Typography.xs, fontWeight: Typography.semibold },

  // Offer detail
  offerDetailCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  noMessages: { color: Colors.textMuted, fontSize: Typography.sm, textAlign: 'center', paddingVertical: Spacing.lg },
  messageBubble: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    marginBottom: Spacing.sm, maxWidth: '85%',
  },
  messageBubbleSelf: { alignSelf: 'flex-end', borderColor: Colors.accent + '40', backgroundColor: Colors.accent + '10' },
  messageUser: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, marginBottom: 2 },
  messageText: { color: Colors.text, fontSize: Typography.sm, lineHeight: 18 },
  messageTime: { color: Colors.textDim, fontSize: Typography.xs, marginTop: 4 },
  messageInputRow: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'center',
  },
  messageInput: {
    flex: 1, backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    color: Colors.text, fontSize: Typography.sm,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: Radius.md,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  counterCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent + '40', padding: Spacing.md,
  },

  // Transaction
  cstxIdCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.xl,
    borderWidth: 1, borderColor: Colors.accent + '40', padding: Spacing.xl,
    alignItems: 'center',
  },
  cstxIdLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1 },
  cstxIdValue: { color: Colors.accent, fontSize: Typography.xxl, fontWeight: Typography.heavy, marginTop: Spacing.xs, fontFamily: 'Courier' },
  stepperCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepDotRow: { alignItems: 'center' },
  stepDot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepDotCurrent: { borderColor: Colors.accent, backgroundColor: Colors.accent, ...Shadows.gold },
  stepLine: { width: 2, height: 20, backgroundColor: Colors.border },
  stepLineActive: { backgroundColor: Colors.accent },
  stepLabel: { color: Colors.textMuted, fontSize: Typography.sm },
  stepLabelActive: { color: Colors.text },
  stepLabelCurrent: { color: Colors.accent, fontWeight: Typography.bold },
  paymentHandleCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden',
  },
  paymentHandle: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  paymentHandleLabel: { color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, width: 60 },
  paymentHandleValue: { flex: 1, color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  noteBox: {
    flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start',
    backgroundColor: Colors.info + '15', borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.info + '40', padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  noteText: { color: Colors.textMuted, fontSize: Typography.sm, flex: 1, lineHeight: 18 },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent3 + '40',
    backgroundColor: Colors.accent3 + '10',
  },
  reportBtnText: { color: Colors.accent3, fontSize: Typography.sm, fontWeight: Typography.semibold },

  // Chain-of-custody video gate (Theme E2)
  videoGateCard: {
    backgroundColor: Colors.surface, borderColor: Colors.accent, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.md,
  },
  videoGateTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  videoGateBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18, marginTop: 4 },
  videoStatusLine: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18 },

  gateActionCard: {
    backgroundColor: Colors.accent + '10', borderColor: Colors.accent, borderWidth: 1,
    borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm,
  },
  gateActionTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.bold },
  gateActionBody: { color: Colors.textMuted, fontSize: Typography.sm, lineHeight: 18 },

  // Carrier tracking link-out (Theme E1)
  trackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 10, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.accent + '40',
    backgroundColor: Colors.accent + '10',
    marginTop: Spacing.xs,
  },
  trackBtnText: { color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold },

  // Stalled transfer report (Theme E5)
  stalledBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.accent3 + '60',
    backgroundColor: Colors.accent3 + '20',
  },
  stalledBtnText: { color: Colors.accent3, fontSize: Typography.sm, fontWeight: Typography.semibold },

  // Analytics
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, alignSelf: 'flex-start',
    backgroundColor: Colors.accent4 + '22', borderRadius: Radius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 4,
    borderWidth: 1, borderColor: Colors.accent4 + '44',
  },
  premiumBadgeText: { color: Colors.accent4, fontSize: Typography.xs, fontWeight: Typography.semibold },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  statBox: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.md,
    alignItems: 'center',
  },
  statBoxValue: { color: Colors.text, fontSize: Typography.xxl, fontWeight: Typography.heavy },
  statBoxLabel: { color: Colors.textMuted, fontSize: Typography.xs, marginTop: 2 },
  analyticsRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  analyticsCardName: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.medium },
  analyticsCardSet: { color: Colors.textMuted, fontSize: Typography.xs },
  analyticsCount: { color: Colors.text, fontSize: Typography.sm, fontWeight: Typography.semibold },
});
