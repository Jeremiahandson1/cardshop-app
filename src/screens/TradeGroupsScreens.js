import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ScrollView, Modal, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradeGroupsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import {
  Button, Input, EmptyState, LoadingScreen,
  ScreenHeader, SectionHeader, Divider,
} from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

// ============================================================
// GROUPS LIST — landing page for the groups area
// ============================================================
export const TradeGroupsListScreen = ({ navigation }) => {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['my-trade-groups'],
    queryFn: () => tradeGroupsApi.mine().then((r) => r.data),
  });
  const groups = data?.groups || [];

  if (isLoading) return <LoadingScreen message="Loading your groups..." />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Trade Groups"
        subtitle="Private invite-only trading circles"
        right={
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateTradeGroup')}
            accessibilityLabel="Create a trade group"
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
              backgroundColor: Colors.accent,
            }}
          >
            <Ionicons name="add" size={14} color={Colors.bg} />
            <Text style={{ color: Colors.bg, fontSize: 13, fontWeight: '800' }}>New group</Text>
          </TouchableOpacity>
        }
      />

      <View style={{ paddingHorizontal: Spacing.base, marginBottom: Spacing.sm }}>
        <Button
          title="Join a group by invite link"
          variant="secondary"
          onPress={() => navigation.navigate('JoinTradeGroup')}
          icon={<Ionicons name="link" size={16} color={Colors.accent} />}
        />
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={{ padding: Spacing.base }}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.groupRow}
            onPress={() => navigation.navigate('TradeGroupDetail', { groupId: item.id })}
          >
            {item.avatar_url ? (
              <Image source={{ uri: item.avatar_url }} style={styles.groupAvatar} />
            ) : (
              <View style={[styles.groupAvatar, styles.groupAvatarPlaceholder]}>
                <Ionicons name="people" size={22} color={Colors.accent} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.groupName}>{item.name}</Text>
              <View style={styles.groupMeta}>
                <Text style={styles.groupMetaText}>
                  {item.member_count} member{item.member_count === 1 ? '' : 's'}
                </Text>
                {item.role === 'admin' ? (
                  <>
                    <Text style={styles.groupMetaDot}> · </Text>
                    <Text style={[styles.groupMetaText, { color: Colors.accent }]}>Admin</Text>
                  </>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="👥"
            title="No groups yet"
            message="Create a group for your trading crew, or paste an invite link to join one."
            action={
              <Button
                title="Create a group"
                onPress={() => navigation.navigate('CreateTradeGroup')}
              />
            }
          />
        }
      />
    </SafeAreaView>
  );
};

// ============================================================
// CREATE GROUP
// ============================================================
export const CreateTradeGroupScreen = ({ navigation }) => {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createMutation = useMutation({
    mutationFn: () => tradeGroupsApi.create({
      name: name.trim(),
      description: description.trim() || null,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my-trade-groups'] });
      navigation.replace('TradeGroupDetail', { groupId: r.data.id });
    },
    onError: (err) => {
      Alert.alert('Could not create group', err?.response?.data?.error || 'Please try again.');
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="New Group"
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
        <Input
          label="Group name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Eau Claire Card Heads"
          autoCapitalize="words"
        />
        <Input
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="What's this group about?"
          multiline
          numberOfLines={3}
        />
        <Text style={styles.helperText}>
          You'll be the admin. Only people with an invite link you share can join.
        </Text>
        <Button
          title="Create group"
          onPress={() => createMutation.mutate()}
          loading={createMutation.isPending}
          disabled={!name.trim()}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// GROUP DETAIL
// ============================================================
export const TradeGroupDetailScreen = ({ navigation, route }) => {
  const { groupId } = route.params;

  const { data: group, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['trade-group', groupId],
    queryFn: () => tradeGroupsApi.get(groupId).then((r) => r.data),
  });

  if (isLoading || !group) return <LoadingScreen message="Loading group..." />;

  const isAdmin = group.my_role === 'admin';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title={group.name}
        subtitle={`${group.members.length} members`}
        right={
          isAdmin ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('TradeGroupManage', { groupId })}
              accessibilityLabel="Manage this group"
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 4,
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999,
                backgroundColor: Colors.accent + '22',
                borderWidth: 1, borderColor: Colors.accent + '66',
              }}
            >
              <Ionicons name="settings-outline" size={14} color={Colors.accent} />
              <Text style={{ color: Colors.accent, fontSize: 13, fontWeight: '700' }}>Manage</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          )
        }
      />

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={Colors.accent} />
        }
      >
        {group.description ? (
          <Text style={styles.groupDescription}>{group.description}</Text>
        ) : null}

        <Button
          title="List a card to this group"
          onPress={() => navigation.navigate('CreateTradeListing', { presetGroupId: groupId })}
          style={{ marginTop: Spacing.md }}
        />
        <Button
          title="View this group's trade board"
          variant="secondary"
          onPress={() => navigation.navigate('TradeBoardMain', { scope: 'group', groupId })}
          style={{ marginTop: Spacing.sm }}
        />

        <Divider style={{ marginVertical: Spacing.base }} />

        <SectionHeader title="Members" />
        {group.members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            {m.avatar_url ? (
              <Image source={{ uri: m.avatar_url }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatar, { backgroundColor: Colors.surface3 }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>
                {m.display_name || m.username}
              </Text>
              <Text style={styles.memberMeta}>
                {m.role === 'admin' ? 'Admin' : 'Member'}
              </Text>
            </View>
          </View>
        ))}

        {!isAdmin ? (
          <Button
            title="Leave group"
            variant="danger"
            style={{ marginTop: Spacing.xl }}
            onPress={() => Alert.alert(
              'Leave this group?',
              'You will no longer see group-scoped listings.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Leave',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      const userId = group.members.find((m) => m.role !== 'admin')?.user_id || null;
                      // The self-leave path uses my own user id:
                      const me = useAuthStore.getState().user;
                      await tradeGroupsApi.removeMember(groupId, me.id);
                      navigation.goBack();
                    } catch (err) {
                      Alert.alert('Could not leave', err?.response?.data?.error || 'Please try again.');
                    }
                  },
                },
              ]
            )}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// GROUP MANAGE (ADMIN ONLY) — invite management + rename + kick
// ============================================================
export const TradeGroupManageScreen = ({ navigation, route }) => {
  const { groupId } = route.params;
  const qc = useQueryClient();
  const [createInviteOpen, setCreateInviteOpen] = useState(false);
  const [inviteLabel, setInviteLabel] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const { data: group, refetch: refetchGroup } = useQuery({
    queryKey: ['trade-group', groupId],
    queryFn: () => tradeGroupsApi.get(groupId).then((r) => r.data),
  });

  const { data: invitesData, refetch: refetchInvites } = useQuery({
    queryKey: ['trade-group-invites', groupId],
    queryFn: () => tradeGroupsApi.listInvites(groupId).then((r) => r.data),
  });
  const invites = invitesData?.invites || [];

  // All five mutations share the same error pattern — surface the
  // server's message so the user knows whether their action took.
  // Without this the Modal closes and form clears even on 4xx, which
  // makes failed actions look successful.
  const onMutationError = (verb) => (err) => {
    Alert.alert(
      `Could not ${verb}`,
      err?.response?.data?.error || err?.message || 'Try again in a moment.',
    );
  };

  const createInvite = useMutation({
    mutationFn: () => tradeGroupsApi.createInvite(groupId, { label: inviteLabel.trim() || null }),
    onSuccess: () => {
      setCreateInviteOpen(false);
      setInviteLabel('');
      refetchInvites();
    },
    onError: onMutationError('create invite'),
  });

  const revokeInvite = useMutation({
    mutationFn: (token) => tradeGroupsApi.revokeInvite(groupId, token),
    onSuccess: () => refetchInvites(),
    onError: onMutationError('revoke invite'),
  });

  const rename = useMutation({
    mutationFn: () => tradeGroupsApi.update(groupId, { name: newName.trim() }),
    onSuccess: () => {
      setRenameOpen(false);
      refetchGroup();
    },
    onError: onMutationError('rename group'),
  });

  const deleteGroup = useMutation({
    mutationFn: () => tradeGroupsApi.remove(groupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-trade-groups'] });
      navigation.popToTop();
    },
    onError: onMutationError('delete group'),
  });

  const kick = useMutation({
    mutationFn: (userId) => tradeGroupsApi.removeMember(groupId, userId),
    onSuccess: () => refetchGroup(),
    onError: onMutationError('remove member'),
  });

  const copyInvite = async (token) => {
    const url = `cardshop://join?token=${token}`;
    await Clipboard.setStringAsync(url);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  };

  if (!group) return <LoadingScreen />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Manage group"
        subtitle={group.name}
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base, paddingBottom: 100 }}>
        {/* Rename */}
        <SectionHeader
          title="Name"
          action={
            <TouchableOpacity onPress={() => { setNewName(group.name); setRenameOpen(true); }}>
              <Text style={styles.linkText}>Edit</Text>
            </TouchableOpacity>
          }
        />
        <Text style={styles.helperText}>{group.name}</Text>

        {/* Invites */}
        <SectionHeader
          title="Invite links"
          action={
            <TouchableOpacity onPress={() => setCreateInviteOpen(true)}>
              <Text style={styles.linkText}>+ New</Text>
            </TouchableOpacity>
          }
        />
        {invites.length === 0 && (
          <Text style={styles.helperText}>
            No invite links yet. Create one to invite people to this group.
          </Text>
        )}
        {invites.map((inv) => (
          <View key={inv.id} style={styles.inviteRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteLabel}>
                {inv.label || 'Invite'}
              </Text>
              <Text style={styles.inviteMeta}>
                {inv.state === 'active'
                  ? `Expires ${new Date(inv.expires_at).toLocaleDateString()} · ${inv.used_count} joined`
                  : inv.state === 'expired'
                  ? 'Expired'
                  : 'Revoked'}
              </Text>
            </View>
            {inv.state === 'active' ? (
              <>
                <TouchableOpacity
                  onPress={() => copyInvite(inv.token)}
                  accessibilityLabel="Copy invite link"
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: Colors.accent + '22',
                    borderWidth: 1, borderColor: Colors.accent + '66',
                  }}
                >
                  <Ionicons name="copy-outline" size={12} color={Colors.accent} />
                  <Text style={{ color: Colors.accent, fontSize: 12, fontWeight: '700' }}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert(
                    'Revoke invite?',
                    'Anyone still holding this link will no longer be able to join.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Revoke', style: 'destructive', onPress: () => revokeInvite.mutate(inv.token) },
                    ]
                  )}
                  accessibilityLabel="Revoke invite link"
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
                    backgroundColor: 'transparent',
                    borderWidth: 1, borderColor: Colors.error + '66',
                  }}
                >
                  <Ionicons name="trash-outline" size={12} color={Colors.error} />
                  <Text style={{ color: Colors.error, fontSize: 12, fontWeight: '700' }}>Revoke</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        ))}

        {/* Members */}
        <SectionHeader title="Members" />
        {group.members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            {m.avatar_url ? (
              <Image source={{ uri: m.avatar_url }} style={styles.memberAvatar} />
            ) : (
              <View style={[styles.memberAvatar, { backgroundColor: Colors.surface3 }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>{m.display_name || m.username}</Text>
              <Text style={styles.memberMeta}>{m.role === 'admin' ? 'Admin' : 'Member'}</Text>
            </View>
            {m.role !== 'admin' ? (
              <TouchableOpacity
                onPress={() => Alert.alert(
                  'Remove member?',
                  `Remove ${m.display_name || m.username} from this group?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => kick.mutate(m.user_id) },
                  ]
                )}
                style={styles.inviteAction}
              >
                <Ionicons name="person-remove-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}

        {/* Delete */}
        <Button
          title="Delete group"
          variant="danger"
          style={{ marginTop: Spacing.xl }}
          onPress={() => Alert.alert(
            'Delete this group?',
            'This removes the group and all its invite links. Listings previously scoped here stay on users\' accounts but lose their group scope.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteGroup.mutate() },
            ]
          )}
        />
      </ScrollView>

      {/* Create invite modal */}
      <Modal visible={createInviteOpen} transparent animationType="slide" onRequestClose={() => setCreateInviteOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New invite link</Text>
            <Text style={styles.modalSubtitle}>Auto-expires in 14 days.</Text>
            <Input
              label="Label (optional)"
              value={inviteLabel}
              onChangeText={setInviteLabel}
              placeholder="e.g. FB group wave 1"
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setCreateInviteOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Create"
                onPress={() => createInvite.mutate()}
                loading={createInvite.isPending}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename modal */}
      <Modal visible={renameOpen} transparent animationType="slide" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename group</Text>
            <Input
              label="New name"
              value={newName}
              onChangeText={setNewName}
              placeholder="Group name"
              autoCapitalize="words"
            />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setRenameOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Save"
                onPress={() => rename.mutate()}
                loading={rename.isPending}
                disabled={!newName.trim()}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ============================================================
// JOIN GROUP (paste invite link)
// ============================================================
export const JoinTradeGroupScreen = ({ navigation, route }) => {
  const qc = useQueryClient();
  const [link, setLink] = useState(route.params?.token || '');

  const extractToken = (input) => {
    // Accept raw token, full URL, or cardshop://join?token=...
    const trimmed = input.trim();
    const match = trimmed.match(/token=([A-Za-z0-9_-]+)/);
    return match ? match[1] : trimmed;
  };

  const joinMutation = useMutation({
    mutationFn: () => tradeGroupsApi.joinByToken(extractToken(link)),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['my-trade-groups'] });
      if (r.data.already_member) {
        Alert.alert('Already a member', `You're already in ${r.data.group_name}.`);
      } else {
        Alert.alert('Joined!', `Welcome to ${r.data.group_name}.`);
      }
      navigation.replace('TradeGroupDetail', { groupId: r.data.group_id });
    },
    onError: (err) => {
      Alert.alert('Could not join', err?.response?.data?.error || 'The invite may have expired or been revoked.');
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.bg }} edges={['top']}>
      <ScreenHeader
        title="Join a Group"
        right={
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        }
      />
      <ScrollView contentContainerStyle={{ padding: Spacing.base }}>
        <Input
          label="Invite link or token"
          value={link}
          onChangeText={setLink}
          placeholder="Paste the invite link here"
          autoCapitalize="none"
          multiline
          numberOfLines={2}
        />
        <Text style={styles.helperText}>
          An admin of the group generated this link and shared it with you. Links last 14 days.
        </Text>
        <Button
          title="Join group"
          onPress={() => joinMutation.mutate()}
          loading={joinMutation.isPending}
          disabled={!link.trim()}
          style={{ marginTop: Spacing.lg }}
        />
      </ScrollView>
    </SafeAreaView>
  );
};

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.base,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupAvatar: {
    width: 48, height: 48, borderRadius: 24,
  },
  groupAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface2,
  },
  groupName: {
    color: Colors.text,
    fontSize: Typography.md,
    fontWeight: Typography.semibold,
  },
  groupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  groupMetaText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
  },
  groupMetaDot: {
    color: Colors.textDim,
  },
  groupDescription: {
    color: Colors.text,
    fontSize: Typography.base,
    lineHeight: 22,
  },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
  },
  memberName: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  memberMeta: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },

  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  inviteLabel: {
    color: Colors.text,
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
  },
  inviteMeta: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
    marginTop: 2,
  },
  inviteAction: {
    padding: 8,
  },

  helperText: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: Spacing.xs,
  },
  linkText: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalTitle: {
    color: Colors.text,
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    marginBottom: 4,
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginBottom: Spacing.base,
  },
});
