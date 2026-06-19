import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { cardChainApi } from '../services/api';
import { Colors, Spacing } from '../theme';

/**
 * ChainOfCustody — a compact, self-fetching provenance summary.
 *
 * Drop into ANY screen that shows a specific card; pass the owned_card id.
 * It fetches /cards/:id/chain (readable by non-owners, so it works on
 * cards you're buying or receiving), shows "N links in the chain · @owner",
 * and on tap opens the full CardChain timeline.
 *
 * The host screen's nav stack must register the 'CardChain' route — every
 * stack that renders a card-detail screen already does.
 *
 * Renders nothing if no cardId. Never throws: a failed/empty fetch falls
 * back to the "original owner" line so a screen can't break because chain
 * data was unavailable.
 */
export const ChainOfCustody = ({ cardId, navigation, style }) => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chain-summary', cardId],
    queryFn: () => cardChainApi.get(cardId).then((r) => r.data),
    enabled: !!cardId,
    staleTime: 60_000,
    retry: 1,
  });

  if (!cardId) return null;

  const chainLength = Number(data?.chain_length || 0);
  const owner = data?.current_owner;
  const summary = isLoading
    ? 'Loading history…'
    : (isError || chainLength <= 1)
      ? 'Original owner · no prior transfers'
      : `${chainLength} links in the chain`;
  const ownerLine = owner
    ? (owner.off_platform ? 'Left Card Shop' : `@${owner.username}`)
    : null;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={isLoading}
      onPress={() => navigation && navigation.navigate('CardChain', { cardId })}
      accessibilityRole="button"
      accessibilityLabel="View this card's chain of custody"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          backgroundColor: Colors.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: Colors.border,
        },
        style,
      ]}
    >
      <Ionicons name="git-network-outline" size={20} color={Colors.accent} />
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: Colors.textMuted,
            fontWeight: '700',
            marginBottom: 2,
          }}
        >
          Chain of custody
        </Text>
        <Text style={{ fontSize: 14, color: Colors.text, fontWeight: '600' }} numberOfLines={1}>
          {summary}
          {ownerLine ? ` · ${ownerLine}` : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </TouchableOpacity>
  );
};

export default ChainOfCustody;
