import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput, Image
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Radius, Shadows } from '../theme';
import { useAuthStore } from '../store/authStore';
import { authApi } from '../services/api';

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
}) => {
  // Local visibility state for password fields — tapping the eye
  // icon flips secureTextEntry so the user can confirm what they
  // typed. Only rendered when the caller asked for a secure input.
  const [revealed, setRevealed] = useState(false);
  const isSecure = !!secureTextEntry;
  const obscure = isSecure && !revealed;

  return (
    <View style={{ marginBottom: Spacing.md }}>
      {label && (
        <Text style={inputStyles.label}>{label}</Text>
      )}
      <View style={{ position: 'relative', justifyContent: 'center' }}>
        <TextInput
          ref={inputRef}
          style={[
            inputStyles.input,
            multiline && { height: numberOfLines ? numberOfLines * 24 : 80, textAlignVertical: 'top', paddingTop: 12 },
            error && { borderColor: Colors.error },
            isSecure && { paddingRight: 44 },
            style
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={obscure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoComplete={autoComplete}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          autoCorrect={false}
        />
        {isSecure ? (
          <TouchableOpacity
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            style={{ position: 'absolute', right: 12, padding: 4 }}
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={Colors.textMuted}
            />
          </TouchableOpacity>
        ) : null}
      </View>
      {error && <Text style={inputStyles.error}>{error}</Text>}
    </View>
  );
};

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
// Availability now comes from the for_sale / for_trade booleans;
// `status` only carries lifecycle (listed / pending_transfer / sold /
// traded). Lifecycle wins over availability when both could apply.
export const StatusBadge = ({ status, forSale, forTrade }) => {
  const lifecycle = {
    listed: { label: 'Listed', color: Colors.listed },
    pending_transfer: { label: 'Pending', color: Colors.pending },
    sold: { label: 'Sold', color: Colors.textMuted },
    traded: { label: 'Traded', color: Colors.textMuted },
  }[status];
  const config = lifecycle
    || (forSale && forTrade && { label: 'Sale / Trade', color: Colors.lets_talk })
    || (forSale && { label: 'For sale', color: Colors.lets_talk })
    || (forTrade && { label: 'For trade', color: Colors.lets_talk })
    || { label: 'Private', color: Colors.textMuted };

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
// Verification badge for a card's claim. Three states, each a
// clear visual: green check when OCR matched the cert, amber
// circle for "claimed but not photo-verified", red warning when
// a counter-claim is open.
export const VerificationBadge = ({ status, size = 'md', style }) => {
  const MAP = {
    verified_by_photo:   { icon: 'checkmark-circle', color: '#4CAF50', label: 'Verified' },
    claimed_unverified:  { icon: 'ellipse-outline',  color: '#D4A24C', label: 'Claimed' },
    disputed:            { icon: 'warning',          color: '#E74C3C', label: 'Disputed' },
  };
  const cfg = MAP[status] || MAP.claimed_unverified;
  const fontSize = size === 'sm' ? 10 : size === 'lg' ? 13 : 11;
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 16 : 14;
  return (
    <View style={[{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: cfg.color,
      backgroundColor: cfg.color + '18',
      alignSelf: 'flex-start',
    }, style]}>
      <Ionicons name={cfg.icon} size={iconSize} color={cfg.color} />
      <Text style={{ color: cfg.color, fontWeight: '600', fontSize, letterSpacing: 0.3 }}>
        {cfg.label}
      </Text>
    </View>
  );
};

export const CardTile = ({ card, onPress, style }) => {
  // Prefer the owner's uploaded photo over the catalog stock image
  // because most Panini/Topps rows ship with no image at all. Order:
  // photo_urls[0] → owner's dedicated front image → catalog front
  // image → 🃏 placeholder. Field-name hedge covers both /cards/mine
  // (aliased own_image_front) and /cards/:id (raw image_front_url).
  const ownPhoto = Array.isArray(card.photo_urls) && card.photo_urls.length
    ? card.photo_urls[0] : null;
  const displayUri = ownPhoto
    || card.own_image_front || card.image_front_url
    || card.front_image_url;
  return (
  <TouchableOpacity
    style={[cardTileStyles.container, style]}
    onPress={onPress}
    activeOpacity={0.85}
  >
    <View style={cardTileStyles.imageContainer}>
      {displayUri ? (
        <Image source={{ uri: displayUri }} style={cardTileStyles.image} resizeMode="contain" />
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
      {card.cert_number && card.verification_status ? (
        <View style={{ position: 'absolute', top: 6, left: 6 }}>
          <VerificationBadge status={card.verification_status} size="sm" />
        </View>
      ) : null}
    </View>
    <View style={cardTileStyles.info}>
      <Text style={cardTileStyles.player} numberOfLines={1}>{card.player_name}</Text>
      <Text style={cardTileStyles.set} numberOfLines={1}>
        {card.year} {card.set_name}{card.parallel ? ` · ${card.parallel}` : ''}
      </Text>
      <View style={cardTileStyles.footer}>
        <StatusBadge status={card.status} forSale={card.for_sale} forTrade={card.for_trade} />
        {card.asking_price && (
          <Text style={cardTileStyles.price}>${card.asking_price}</Text>
        )}
      </View>
    </View>
  </TouchableOpacity>
  );
};

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

// ============================================================
// ACCOUNT BANNERS — email verification nag + scheduled-deletion banner
// ============================================================
// Renders two stacked banners based on the current user from the auth store:
//   1. email-verify nag (dismissible in-session) when email_verified is false
//   2. persistent deletion-pending banner when scheduled_deletion_at is set
// Mount this at the top of the main tab (e.g. Collection) so it's always
// visible to the user after login.
const formatDeletionDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export const AccountBanners = () => {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [verifyDismissed, setVerifyDismissed] = useState(false);
  const [resending, setResending] = useState(false);

  if (!user) return null;

  const showVerifyBanner = user.email_verified === false && !verifyDismissed;
  const showDeletionBanner = !!user.scheduled_deletion_at;

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      const res = await authApi.resendVerify();
      if (res?.data?.already_verified) {
        showMessage({ message: 'Your email is already verified.', type: 'success' });
        updateUser({ email_verified: true });
      } else {
        showMessage({ message: 'Verification email sent.', type: 'success' });
      }
    } catch (err) {
      showMessage({
        message: err?.response?.data?.error || 'Could not resend. Try again.',
        type: 'danger',
      });
    } finally {
      setResending(false);
    }
  };

  if (!showVerifyBanner && !showDeletionBanner) return null;

  return (
    <View>
      {showVerifyBanner && (
        <View style={bannerStyles.verifyBanner}>
          <Ionicons name="mail-unread-outline" size={18} color={Colors.warning} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={bannerStyles.verifyText}>
              Confirm your email — we sent you a link.
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleResend}
            disabled={resending}
            style={bannerStyles.verifyAction}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            {resending ? (
              <ActivityIndicator size="small" color={Colors.warning} />
            ) : (
              <Text style={bannerStyles.verifyActionText}>Resend</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setVerifyDismissed(true)}
            style={bannerStyles.verifyClose}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="close" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {showDeletionBanner && (
        <View style={bannerStyles.deletionBanner}>
          <Ionicons name="warning-outline" size={18} color={Colors.accent3} style={{ marginTop: 1 }} />
          <Text style={bannerStyles.deletionText}>
            Account scheduled for deletion on {formatDeletionDate(user.scheduled_deletion_at)}.
            Sign in anytime to cancel.
          </Text>
        </View>
      )}
    </View>
  );
};

const bannerStyles = StyleSheet.create({
  verifyBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '18',
    borderWidth: 1,
    borderColor: Colors.warning + '66',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  verifyText: {
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 18,
  },
  verifyAction: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  verifyActionText: {
    color: Colors.warning,
    fontSize: Typography.sm,
    fontWeight: Typography.semibold,
  },
  verifyClose: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  deletionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.accent3 + '18',
    borderWidth: 1,
    borderColor: Colors.accent3 + '66',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  deletionText: {
    flex: 1,
    color: Colors.text,
    fontSize: Typography.sm,
    lineHeight: 18,
  },
});
