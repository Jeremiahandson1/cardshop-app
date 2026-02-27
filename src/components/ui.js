import React from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput, Image
} from 'react-native';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';

// ============================================================
// BUTTON
// ============================================================
export const Button = ({
  title, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, style, icon
}) => {
  const styles = getButtonStyles(variant, size, disabled || loading);
  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? Colors.bg : Colors.accent} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon}
          <Text style={styles.text}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const getButtonStyles = (variant, size, disabled) => {
  const heights = { sm: 38, md: 48, lg: 56 };
  const fontSizes = { sm: Typography.sm, md: Typography.base, lg: Typography.md };

  const bg = {
    primary: disabled ? Colors.accentDim : Colors.accent,
    secondary: Colors.surface2,
    ghost: 'transparent',
    danger: Colors.accent3,
    teal: Colors.accent2,
  }[variant] || Colors.accent;

  const color = {
    primary: Colors.bg,
    secondary: Colors.text,
    ghost: Colors.accent,
    danger: '#fff',
    teal: Colors.bg,
  }[variant] || Colors.bg;

  return StyleSheet.create({
    container: {
      backgroundColor: bg,
      height: heights[size],
      borderRadius: Radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
      borderWidth: variant === 'ghost' ? 1 : 0,
      borderColor: Colors.accent,
      opacity: disabled ? 0.6 : 1,
    },
    text: {
      color,
      fontSize: fontSizes[size],
      fontWeight: Typography.bold,
      letterSpacing: 0.3,
    },
  });
};

// ============================================================
// INPUT
// ============================================================
export const Input = ({
  label, value, onChangeText, placeholder, secureTextEntry,
  keyboardType, autoCapitalize = 'none', error, style, multiline,
  numberOfLines, autoComplete, returnKeyType, onSubmitEditing, inputRef
}) => (
  <View style={{ marginBottom: Spacing.md }}>
    {label && (
      <Text style={inputStyles.label}>{label}</Text>
    )}
    <TextInput
      ref={inputRef}
      style={[
        inputStyles.input,
        multiline && { height: numberOfLines ? numberOfLines * 24 : 80, textAlignVertical: 'top', paddingTop: 12 },
        error && { borderColor: Colors.error },
        style
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Colors.textMuted}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      multiline={multiline}
      numberOfLines={numberOfLines}
      autoComplete={autoComplete}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      autoCorrect={false}
    />
    {error && <Text style={inputStyles.error}>{error}</Text>}
  </View>
);

const inputStyles = StyleSheet.create({
  label: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    fontWeight: Typography.medium,
    marginBottom: 6,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    color: Colors.text,
    fontSize: Typography.base,
  },
  error: {
    color: Colors.error,
    fontSize: Typography.xs,
    marginTop: 4,
  },
});

// ============================================================
// CARD STATUS BADGE
// ============================================================
export const StatusBadge = ({ status }) => {
  const config = {
    nfs: { label: 'NFS', color: Colors.nfs },
    nft: { label: 'NFT', color: Colors.nft },
    lets_talk: { label: "Let's Talk", color: Colors.lets_talk },
    listed: { label: 'Listed', color: Colors.listed },
    pending_transfer: { label: 'Pending', color: Colors.pending },
  }[status] || { label: status, color: Colors.textMuted };

  return (
    <View style={[badgeStyles.container, { borderColor: config.color }]}>
      <View style={[badgeStyles.dot, { backgroundColor: config.color }]} />
      <Text style={[badgeStyles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  text: {
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
    letterSpacing: 0.5,
  },
});

// ============================================================
// CARD TILE
// ============================================================
export const CardTile = ({ card, onPress, style }) => (
  <TouchableOpacity
    style={[cardTileStyles.container, style]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={cardTileStyles.imageContainer}>
      {card.front_image_url ? (
        <Image source={{ uri: card.front_image_url }} style={cardTileStyles.image} resizeMode="contain" />
      ) : (
        <View style={cardTileStyles.imagePlaceholder}>
          <Text style={{ fontSize: 28 }}>🃏</Text>
        </View>
      )}
      {card.is_rookie && (
        <View style={cardTileStyles.rookieBadge}>
          <Text style={cardTileStyles.rookieText}>RC</Text>
        </View>
      )}
    </View>
    <View style={cardTileStyles.info}>
      <Text style={cardTileStyles.player} numberOfLines={1}>{card.player_name}</Text>
      <Text style={cardTileStyles.set} numberOfLines={1}>
        {card.year} {card.set_name}{card.parallel ? ` · ${card.parallel}` : ''}
      </Text>
      <View style={cardTileStyles.footer}>
        {card.status && <StatusBadge status={card.status} />}
        {card.asking_price && (
          <Text style={cardTileStyles.price}>${card.asking_price}</Text>
        )}
      </View>
    </View>
  </TouchableOpacity>
);

const cardTileStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  imageContainer: {
    backgroundColor: Colors.surface2,
    aspectRatio: 0.72,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rookieBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Colors.accent,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  rookieText: {
    color: Colors.bg,
    fontSize: 9,
    fontWeight: Typography.heavy,
  },
  info: {
    padding: Spacing.sm,
    gap: 3,
  },
  player: {
    color: Colors.text,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  set: {
    color: Colors.textMuted,
    fontSize: Typography.xs,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  price: {
    color: Colors.accent,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
});

// ============================================================
// SCREEN HEADER
// ============================================================
export const ScreenHeader = ({ title, subtitle, right }) => (
  <View style={headerStyles.container}>
    <View>
      <Text style={headerStyles.title}>{title}</Text>
      {subtitle && <Text style={headerStyles.subtitle}>{subtitle}</Text>}
    </View>
    {right}
  </View>
);

const headerStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.xl,
    fontWeight: Typography.heavy,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: Typography.sm,
    marginTop: 2,
  },
});

// ============================================================
// EMPTY STATE
// ============================================================
export const EmptyState = ({ icon = '🃏', title, message, action }) => (
  <View style={emptyStyles.container}>
    <Text style={emptyStyles.icon}>{icon}</Text>
    <Text style={emptyStyles.title}>{title}</Text>
    {message && <Text style={emptyStyles.message}>{message}</Text>}
    {action && (
      <Button title={action.label} onPress={action.onPress} style={{ marginTop: Spacing.lg }} />
    )}
  </View>
);

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxxl,
  },
  icon: {
    fontSize: 52,
    marginBottom: Spacing.base,
  },
  title: {
    color: Colors.text,
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  message: {
    color: Colors.textMuted,
    fontSize: Typography.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});

// ============================================================
// LOADING SCREEN
// ============================================================
export const LoadingScreen = ({ message = 'Loading...' }) => (
  <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator size="large" color={Colors.accent} />
    <Text style={{ color: Colors.textMuted, marginTop: Spacing.md, fontSize: Typography.base }}>{message}</Text>
  </View>
);

// ============================================================
// SECTION HEADER
// ============================================================
export const SectionHeader = ({ title, action }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md }}>
    <Text style={{ color: Colors.textMuted, fontSize: Typography.xs, fontWeight: Typography.semibold, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</Text>
    {action && (
      <TouchableOpacity onPress={action.onPress}>
        <Text style={{ color: Colors.accent, fontSize: Typography.sm, fontWeight: Typography.semibold }}>{action.label}</Text>
      </TouchableOpacity>
    )}
  </View>
);

// ============================================================
// DIVIDER
// ============================================================
export const Divider = ({ style }) => (
  <View style={[{ height: 1, backgroundColor: Colors.border, marginVertical: Spacing.md }, style]} />
);
