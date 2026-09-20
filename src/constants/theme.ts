/**
 * Trivora Driver Design System - Modern Native App Theme
 * Primary Brand: #1B3A69 | Dominant Clean White: #FFFFFF
 * Optimized for handlebar mount clarity, outdoor sunlight readability, and tactile operation
 */

export const COLORS = {
  // Primary Brand (#1B3A69)
  primary: '#1B3A69',
  primaryDark: '#122646',
  primaryHover: '#152E54',
  primaryLight: '#2A4D82',
  primaryTint: '#EEF4FA',

  // Surfaces & Backgrounds
  background: '#FFFFFF',
  backgroundSubtle: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceInput: '#F1F5F9',

  // Hairline Borders
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderFocus: '#1B3A69',

  // Typography
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textInverse: '#FFFFFF',

  // Telematics & Speedometer Colors
  speedSafe: '#10B981',    // Green (< 30 km/h)
  speedWarning: '#F59E0B', // Amber (30 - 40 km/h)
  speedDanger: '#EF4444',  // Red (> 40 km/h municipal violation)

  // Status & Semantics
  online: '#10B981',
  offline: '#64748B',
  success: '#10B981',
  successLight: '#ECFDF5',
  successBorder: '#A7F3D0',
  warning: '#F59E0B',
  warningLight: '#FFFBEB',
  danger: '#EF4444',
  dangerDark: '#DC2626',
  dangerLight: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerSurface: 'rgba(239, 68, 68, 0.12)',
  amber: '#F59E0B',
  amberLight: '#FFFBEB',
  sky: '#0284C7',

  // Dark hero surfaces (splash, incoming-booking backdrop, profile banner)
  darkBackground: '#0D2040',
  darkSurface: '#152B52',
  darkSurfaceRaised: '#1E3A8A',
  darkBorder: 'rgba(255, 255, 255, 0.16)',
  darkTextPrimary: '#FFFFFF',
  darkTextSecondary: 'rgba(255, 255, 255, 0.72)',
  darkTextMuted: 'rgba(255, 255, 255, 0.48)',
};

export const SHADOWS = {
  none: {
    elevation: 0,
    shadowOpacity: 0,
  },
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 8,
  },
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
};

export const RADIUS = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
};

export const SPACING = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
};

export const BUTTONS = {
  touchHeight: 56, // Large 56px touch target for driver handlebar ergonomics
  touchHeightSm: 44,
  touchHeightLg: 58,
};

/** Named type scale, shared across all screens instead of hand-rolled fontSize/fontWeight pairs. */
export const TYPOGRAPHY = {
  /** Reserved for the one dominant figure on a screen — a fare, a total, an amount due. Typography carries the hierarchy instead of a container. */
  hero: { fontSize: 44, fontWeight: '900' as const, lineHeight: 48, letterSpacing: -0.8 },
  display: { fontSize: 28, fontWeight: '900' as const, lineHeight: 34, letterSpacing: -0.3 },
  h1: { fontSize: 22, fontWeight: '900' as const, lineHeight: 28, letterSpacing: -0.2 },
  h2: { fontSize: 18, fontWeight: '800' as const, lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: '800' as const, lineHeight: 21 },
  bodyLarge: { fontSize: 15, fontWeight: '700' as const, lineHeight: 20 },
  body: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  bodySmall: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  caption: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14 },
  micro: { fontSize: 10, fontWeight: '700' as const, lineHeight: 13 },
  label: {
    fontSize: 9,
    fontWeight: '700' as const,
    lineHeight: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
};
