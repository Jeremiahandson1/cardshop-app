// ============================================================
// Card-scoped in-app chat.
//
// Every message persists in Postgres (no edit / delete) so the
// full thread survives a dispute. Threads are keyed on the card
// + the two participants; the same pair can have separate
// conversations about different cards so the audit log stays
// clean per transaction.
//
// Two screens:
//   ConversationListScreen — inbox, newest thread on top
//   ConversationScreen     — single thread, send + scroll to end
// ============================================================

import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Image,
  KeyboardAvoidingView, Platform, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { messagesApi } from '../services/api';
import { LoadingScreen } from '../components/ui';
import { Colors, Typography, Spacing, Radius } from '../theme';

function formatRelative(iso) {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

// ============================================================
// CONVERSATION LIST (inbox)
// ============================================================
export const ConversationListScreen = ({ navigation }) => {
  const { data: conversations, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => messagesApi.conversations().then((r) => r.data),
    // Poll every 20s so unread badge + last-message preview stay
    // roughly in sync even without a socket.
    refetchInterval: 20_000,
  });

  if (isLoading) return <LoadingScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={conversations || []}
        keyExtractor={(item) => item.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerStyle={{ paddingBottom: Spacing.xl }}
        ListEmptyComponent={
          <View style={{ padding: Spacing.xl, alignItems: 'center', gap: Spacing.md }}>
            <Ionicons name="chatbubbles-outline" size={48} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
              No conversations yet.{'\n'}Tap "Message owner" on a card to start one.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.convRow}
            onPress={() => navigation.navigate('Conversation', {
              conversationId: item.id,
              otherName: item.other_display_name || item.other_username,
              otherUsername: item.other_username,
              ownedCardId: item.owned_card_id,
              cardTitle: item.player_name ? `${item.year || ''} ${item.set_name || ''}`.trim() : null,
            })}
          >
            {item.front_image_url ? (
              <Image source={{ uri: item.front_image_url }} style={styles.convThumb} />
            ) : (
              <View style={[styles.convThumb, styles.convThumbFallback]}>
                <Text style={{ fontSize: 18 }}>🃏</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                <Text style={styles.convOther} numberOfLines={1}>
                  {item.other_display_name || item.other_username}
                </Text>
                <Text style={styles.convTime}>{formatRelative(item.last_message_at)}</Text>
              </View>
              {item.player_name ? (
                <Text style={styles.convCard} numberOfLines={1}>
                  {item.player_name} · {item.year} {item.set_name}
                </Text>
              ) : null}
              <Text
                style={[styles.convLast, parseInt(item.unread_count, 10) > 0 && styles.convLastUnread]}
                numberOfLines={1}
              >
                {item.last_message || 'No messages yet'}
              </Text>
            </View>
            {parseInt(item.unread_count, 10) > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{item.unread_count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
};

// ============================================================
// CONVERSATION (single thread)
// ============================================================
// Route params:
//   - conversationId (required to load)  OR
//   - startWith: { to_user_id?, to_username?, owned_card_id? }
//     to open fresh; we POST the first message to create-or-find
//     the thread, then reload by its returned id.
export const ConversationScreen = ({ navigation, route }) => {
  const {
    conversationId: initialId, startWith, otherName, otherUsername,
    ownedCardId: inboxOwnedCardId, cardTitle,
  } = route.params || {};
  const [conversationId, setConversationId] = useState(initialId);
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: messages, isLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => messagesApi.thread(conversationId).then((r) => r.data),
    enabled: !!conversationId,
    // Lightweight polling for near-realtime inbound messages.
    refetchInterval: 8_000,
  });

  const sendMutation = useMutation({
    mutationFn: (body) => messagesApi.send({
      // Prefer the explicit IDs from a fresh "Message owner" launch.
      // Falling back to inbox-row values lets the same composer work
      // for ongoing threads — the server re-finds the conversation
      // by (card, participants) and appends.
      to_user_id: startWith?.to_user_id,
      to_username: startWith?.to_username || otherUsername,
      owned_card_id: startWith?.owned_card_id || inboxOwnedCardId,
      body,
    }),
    onSuccess: (res) => {
      const newId = res.data?.conversation_id;
      if (newId && newId !== conversationId) {
        setConversationId(newId);
      }
      queryClient.invalidateQueries({ queryKey: ['conversation', newId || conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setDraft('');
    },
    onError: (err) => Alert.alert('Could not send', err.response?.data?.error || 'Try again.'),
  });

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    sendMutation.mutate(body);
  };

  React.useEffect(() => {
    // Auto-scroll to the newest message when messages arrive or
    // when the draft is sent. ref may be null on first render.
    if (messages?.length && listRef.current) {
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
    }
  }, [messages?.length]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{otherName || 'Message'}</Text>
          {cardTitle ? <Text style={styles.headerSub} numberOfLines={1}>{cardTitle}</Text> : null}
        </View>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // offset was 60 on iOS, which left the composer hidden behind
        // the keyboard. The header sits OUTSIDE this view, so the
        // view's bottom is already at the screen bottom — offset
        // should be 0 so the composer lifts the full keyboard height.
        // Android default behavior was undefined (no lift at all);
        // 'height' resizes the view so the composer stays in view.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {conversationId && isLoading ? (
          <LoadingScreen />
        ) : (
          <FlatList
            ref={listRef}
            data={messages || []}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ padding: Spacing.base, gap: Spacing.sm }}
            ListEmptyComponent={
              <View style={{ padding: Spacing.xl, alignItems: 'center' }}>
                <Text style={{ color: Colors.textMuted, textAlign: 'center' }}>
                  {startWith ? 'Say hi — your first message starts the thread.' : 'No messages yet.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={[styles.bubble, item.is_mine ? styles.bubbleMine : styles.bubbleOther]}>
                <Text style={item.is_mine ? styles.bubbleTextMine : styles.bubbleTextOther}>
                  {item.body}
                </Text>
                <Text style={[styles.bubbleTime, item.is_mine ? styles.bubbleTimeMine : styles.bubbleTimeOther]}>
                  {formatRelative(item.sent_at)}
                </Text>
              </View>
            )}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message…"
            placeholderTextColor={Colors.textMuted}
            style={styles.composerInput}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={send}
            disabled={sendMutation.isPending || !draft.trim()}
            style={[styles.sendBtn, (!draft.trim() || sendMutation.isPending) && { opacity: 0.4 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  headerTitle: { color: Colors.text, fontSize: Typography.md, fontWeight: Typography.semibold },
  headerSub: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },

  // Inbox rows
  convRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  convThumb: { width: 44, height: 62, borderRadius: 6, backgroundColor: Colors.surface2 },
  convThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  convOther: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  convTime: { color: Colors.textMuted, fontSize: 11 },
  convCard: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  convLast: { color: Colors.textMuted, fontSize: 13, marginTop: 3 },
  convLastUnread: { color: Colors.text, fontWeight: '600' },
  unreadBadge: {
    marginLeft: Spacing.sm, minWidth: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Thread bubbles
  bubble: {
    maxWidth: '78%', padding: Spacing.md,
    borderRadius: Radius.md, marginVertical: 2,
  },
  bubbleMine: {
    alignSelf: 'flex-end', backgroundColor: Colors.accent,
    borderTopRightRadius: 4,
  },
  bubbleOther: {
    alignSelf: 'flex-start', backgroundColor: Colors.surface2,
    borderTopLeftRadius: 4, borderWidth: 1, borderColor: Colors.border,
  },
  bubbleTextMine: { color: '#fff', fontSize: 15, lineHeight: 20 },
  bubbleTextOther: { color: Colors.text, fontSize: 15, lineHeight: 20 },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  bubbleTimeOther: { color: Colors.textMuted },

  // Composer
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm,
    padding: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  composerInput: {
    flex: 1, color: Colors.text,
    backgroundColor: Colors.surface2,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: Radius.md, maxHeight: 120,
    borderWidth: 1, borderColor: Colors.border,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
});
