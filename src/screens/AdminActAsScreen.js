// Admin "Act as user" — search a user and impersonate them so
// you can scan/add cards into THEIR account at a show without
// their phone. The session swap is handled in authStore; the
// global banner (App.js) shows "Acting as @X" with a Stop tap.
// Backend audits every impersonation and blocks admin-on-admin.

import React, { useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { ScreenHeader } from '../components/ui';
import { Colors, Spacing, Typography, Radius } from '../theme';

export const AdminActAsScreen = ({ navigation }) => {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busyId, setBusyId] = useState(null);
  const impersonate = useAuthStore((s) => s.impersonate);
  const me = useAuthStore((s) => s.user);

  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isFetching } = useQuery({
    queryKey: ['admin-user-search', debounced],
    queryFn: () => adminApi.searchUsers(debounced).then((r) => r.data?.users || r.data || []),
    enabled: debounced.length >= 2,
    staleTime: 30000,
  });
  const users = Array.isArray(data) ? data : [];

  const act = (u) => {
    if (u.role === 'admin') {
      Alert.alert('Not allowed', 'You cannot act as another admin.');
      return;
    }
    Alert.alert(
      `Act as @${u.username}?`,
      'You will be signed in AS this user — anything you add (scans, binders, listings) goes to their account. This is logged. The banner up top reverts you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Act as @${u.username}`,
          style: 'destructive',
          onPress: async () => {
            setBusyId(u.id);
            try {
              await impersonate(u.id);
              Alert.alert(
                'Now acting as ' + `@${u.username}`,
                'Use the Scan tab to add cards to their account. Tap the banner at the top to stop.',
              );
              navigation.popToTop();
            } catch (e) {
              Alert.alert('Could not act as user', e?.response?.data?.error || e.message || 'Try again.');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  if (me?.role !== 'admin') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
        <ScreenHeader title="Act as user" />
        <Text style={{ color: Colors.textMuted, padding: Spacing.base }}>Admins only.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Act as user"
        subtitle="Show-floor intake — scan into their account"
        right={(
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        )}
      />
      <View style={{ padding: Spacing.base }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: Colors.warning + '18', borderColor: Colors.warning + '55',
          borderWidth: 1, borderRadius: Radius.md, padding: 10, marginBottom: Spacing.base,
        }}>
          <Ionicons name="shield-checkmark-outline" size={18} color={Colors.warning} />
          <Text style={{ color: Colors.text, fontSize: 12, flex: 1 }}>
            Every action is recorded in the audit log under your admin account.
          </Text>
        </View>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search username, email, or name…"
          placeholderTextColor={Colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            backgroundColor: Colors.card, color: Colors.text,
            borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.md,
            padding: 12, fontSize: 15,
          }}
        />
      </View>
      {isFetching && <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />}
      <FlatList
        data={users}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingBottom: 40 }}
        ListEmptyComponent={!isFetching && debounced.length >= 2 ? (
          <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 30 }}>
            No users match “{debounced}”.
          </Text>
        ) : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => act(item)}
            disabled={busyId === item.id}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: Colors.border, opacity: busyId === item.id ? 0.5 : 1,
            }}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.card,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: Colors.text, fontWeight: '700' }}>
                {(item.username || '?')[0]?.toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: Colors.text, fontWeight: '700' }} numberOfLines={1}>
                @{item.username}
                {item.role === 'admin' ? '  ·  admin' : ''}
              </Text>
              <Text style={{ color: Colors.textMuted, fontSize: 12 }} numberOfLines={1}>
                {item.email}{item.subscription_tier ? `  ·  ${item.subscription_tier}` : ''}
              </Text>
            </View>
            {busyId === item.id
              ? <ActivityIndicator color={Colors.accent} />
              : <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

export default AdminActAsScreen;
