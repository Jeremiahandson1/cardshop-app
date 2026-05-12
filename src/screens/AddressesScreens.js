// Saved shipping addresses — manage screen + form.
//
//   AddressesScreen      — list, set default, edit, delete
//   AddressFormScreen    — create or edit (id route param = edit mode)
//
// Used by Checkout via address picker, and standalone in Profile.

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { addressesApi } from '../services/api';
import { Button, ScreenHeader, EmptyState, LoadingScreen } from '../components/ui';
import { Colors, Spacing, Radius, Typography } from '../theme';

// ============================================================
// LIST
// ============================================================
export const AddressesScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.list(),
  });

  const promoteMut = useMutation({
    mutationFn: (id) => addressesApi.update(id, { is_default: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => addressesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
  });

  const addresses = data?.addresses || [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Shipping addresses"
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('AddressForm', {})}
            accessibilityLabel="Add a shipping address"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
              backgroundColor: Colors.accent + '22',
              borderWidth: 1, borderColor: Colors.accent + '66',
            }}
          >
            <Ionicons name="add" size={14} color={Colors.accent} />
            <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>Add address</Text>
          </TouchableOpacity>
        }
      />
      {isLoading ? (
        <LoadingScreen />
      ) : !addresses.length ? (
        <EmptyState
          icon="📦"
          title="No addresses yet"
          message="Add a shipping address to skip retyping it at checkout."
          action={{ title: 'Add address', onPress: () => navigation.navigate('AddressForm', {}) }}
        />
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.name}>{item.label || 'Address'}</Text>
                  {item.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>}
                </View>
                <Text style={styles.line}>{item.name}</Text>
                <Text style={styles.line}>{item.line1}{item.line2 ? `, ${item.line2}` : ''}</Text>
                <Text style={styles.line}>{item.city}, {item.state} {item.zip}</Text>
              </View>
              <View style={{ gap: 6, alignItems: 'flex-end' }}>
                <TouchableOpacity
                  onPress={() => navigation.navigate('AddressForm', { id: item.id })}
                  accessibilityLabel="Edit this address"
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: Colors.surface2,
                    borderWidth: 1, borderColor: Colors.border,
                  }}
                >
                  <Ionicons name="create-outline" size={12} color={Colors.text} />
                  <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                </TouchableOpacity>
                {!item.is_default && (
                  <TouchableOpacity
                    onPress={() => promoteMut.mutate(item.id)}
                    accessibilityLabel="Set as default address"
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                      backgroundColor: Colors.accent + '22',
                      borderWidth: 1, borderColor: Colors.accent + '66',
                    }}
                  >
                    <Ionicons name="star-outline" size={12} color={Colors.accent} />
                    <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: '700' }}>Default</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    'Delete address?',
                    '',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteMut.mutate(item.id) },
                    ],
                  )}
                  accessibilityLabel="Delete this address"
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: 'transparent',
                    borderWidth: 1, borderColor: Colors.accent3 + '66',
                  }}
                >
                  <Ionicons name="trash-outline" size={12} color={Colors.accent3} />
                  <Text style={{ color: Colors.accent3, fontSize: 12, fontWeight: '700' }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
};

// ============================================================
// FORM
// ============================================================
export const AddressFormScreen = ({ navigation, route }) => {
  const id = route.params?.id;
  const editing = !!id;
  const qc = useQueryClient();

  // Pull existing data if editing.
  const { data: list } = useQuery({
    queryKey: ['addresses'],
    queryFn: () => addressesApi.list(),
    enabled: editing,
  });
  const existing = editing ? list?.addresses?.find((a) => a.id === id) : null;

  const [form, setForm] = useState({
    label: '', name: '', line1: '', line2: '', city: '', state: '', zip: '', country: 'US',
    is_default: false,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        label: existing.label || '',
        name: existing.name || '',
        line1: existing.line1 || '',
        line2: existing.line2 || '',
        city: existing.city || '',
        state: existing.state || '',
        zip: existing.zip || '',
        country: existing.country || 'US',
        is_default: !!existing.is_default,
      });
    }
  }, [existing]);

  const saveMut = useMutation({
    mutationFn: () => editing
      ? addressesApi.update(id, form)
      : addressesApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] });
      navigation.goBack();
    },
    onError: (err) => Alert.alert('Save failed', err.response?.data?.error || err.message),
  });

  const valid = form.name && form.line1 && form.city && form.state && form.zip;

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={editing ? 'Edit address' : 'New address'} />
      <ScrollView contentContainerStyle={{ padding: Spacing.md }}>
        <Field label="Label (optional)" placeholder="Home, Office…"
               value={form.label} onChangeText={(label) => setForm({ ...form, label })} />
        <Field label="Recipient name" placeholder="Full name"
               value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
        <Field label="Address line 1" placeholder="Street address"
               value={form.line1} onChangeText={(line1) => setForm({ ...form, line1 })} />
        <Field label="Address line 2 (optional)" placeholder="Apt, suite, etc."
               value={form.line2} onChangeText={(line2) => setForm({ ...form, line2 })} />
        <View style={{ flexDirection: 'row', gap: Spacing.xs }}>
          <View style={{ flex: 2 }}>
            <Field label="City" placeholder=""
                   value={form.city} onChangeText={(city) => setForm({ ...form, city })} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="State" placeholder="" autoCapitalize="characters"
                   value={form.state} maxLength={2}
                   onChangeText={(state) => setForm({ ...form, state })} />
          </View>
          <View style={{ flex: 1.2 }}>
            <Field label="ZIP" placeholder="" keyboardType="number-pad"
                   value={form.zip} onChangeText={(zip) => setForm({ ...form, zip })} />
          </View>
        </View>

        <TouchableOpacity
          style={styles.toggleRow}
          onPress={() => setForm({ ...form, is_default: !form.is_default })}
        >
          <View style={[styles.checkbox, form.is_default && styles.checkboxOn]}>
            {form.is_default && <Ionicons name="checkmark" size={16} color={Colors.bg} />}
          </View>
          <Text style={styles.toggleLabel}>Use as default for new orders</Text>
        </TouchableOpacity>

        <Button
          title={saveMut.isPending ? 'Saving…' : (editing ? 'Save changes' : 'Add address')}
          onPress={() => saveMut.mutate()}
          disabled={!valid || saveMut.isPending}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

const Field = ({ label, ...rest }) => (
  <View style={{ marginBottom: Spacing.sm }}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={styles.input}
      placeholderTextColor={Colors.textMuted}
      {...rest}
    />
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },

  row: {
    flexDirection: 'row', gap: Spacing.sm,
    backgroundColor: Colors.surface, padding: Spacing.md, borderRadius: Radius.md,
  },
  name: { color: Colors.text, fontWeight: '600', fontSize: 14 },
  line: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
  defaultBadge: {
    backgroundColor: Colors.accent, borderRadius: 4,
    paddingVertical: 2, paddingHorizontal: 6,
  },
  defaultBadgeText: { color: Colors.bg, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  fieldLabel: { color: Colors.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  input: {
    backgroundColor: Colors.surface, color: Colors.text, fontSize: 15,
    padding: Spacing.sm, borderRadius: Radius.sm,
    borderWidth: 1, borderColor: Colors.border,
  },

  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: 5,
    borderWidth: 2, borderColor: Colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  toggleLabel: { color: Colors.text, fontSize: 14 },
});
