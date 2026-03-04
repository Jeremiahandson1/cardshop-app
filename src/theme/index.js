export const Colors = {
  // Backgrounds
  bg: '#0a0a0f',
  surface: '#12121a',
  surface2: '#1a1a26',
  surface3: '#22223a',
  border: '#2a2a3a',
  borderLight: '#3a3a50',

  // Brand
  accent: '#e8c547',       // gold
  accentDim: '#b89a2e',
  accent2: '#4ecdc4',      // teal
  accent3: '#ff6b6b',      // red for disputes/errors
  accent4: '#a78bfa',      // purple for premium

  // Text
  text: '#e8e8f0',
  textMuted: '#8888aa',
  textDim: '#555577',

  // Status colors
  success: '#4ade80',
  warning: '#fbbf24',
  error: '#f87171',
  info: '#60a5fa',

  // Card status
  nfs: '#8888aa',
  nft: '#4ade80',
  lets_talk: '#e8c547',
  listed: '#60a5fa',
  pending: '#fbbf24',
};

export const Typography = {
  // Font families (using system fonts — swap for custom in production)
  heading: 'System',
  body: 'System',
  mono: 'Courier',

  // Sizes
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  xxxl: 38,

  // Weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  heavy: '800',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 999,
};

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  gold: {
    shadowColor: '#e8c547',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
};
