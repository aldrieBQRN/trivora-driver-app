/**
 * Trivora Driver Design System - Modern Native App Theme
 * Primary Brand: #1D2542 | Dominant Clean White: #FFFFFF
 * Optimized for handlebar mount clarity, outdoor sunlight readability, and tactile operation
 */

export const COLORS = {
  // Shared Trivora brand navy (#1D2542) — same in the Passenger and Driver apps
  primary: '#1D2542',
  primaryDark: '#141A31',
  primaryHover: '#283256',
  primaryLight: '#4A5275',
  primaryTint: '#EDEEF3',

  // Surfaces & Backgrounds
  background: '#FFFFFF',
  backgroundSubtle: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceCard: '#FFFFFF',
  surfaceInput: '#F1F5F9',

  // Hairline Borders
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  borderFocus: '#1D2542',

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
  amberDark: '#B45309',
  amberLight: '#FFFBEB',
  sky: '#0284C7',

  // Dark hero surfaces (splash, incoming-booking backdrop, profile banner)
  darkBackground: '#141A31',
  darkSurface: '#1D2542',
  darkSurfaceRaised: '#2A3358',
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

/**
 * Named type scale. Every screen should draw its text styles from here instead of hand-rolling
 * fontSize/fontWeight pairs.
 *
 * Hierarchy rules (shared by the Passenger and Driver apps):
 * - Three weights only: 400 (reading text), 600 (titles, labels, emphasis), 700 (page titles and
 *   the one key value on a screen). Nothing heavier — Android renders 800/900 as Roboto Black,
 *   which made every line on a screen shout at the same volume.
 * - Nothing below 11px; 12px+ for anything a rider/driver must read at a glance.
 * - Emphasise the value, not its label (e.g. "₱126.00" is bigger than "Total Fare").
 */
export const TYPOGRAPHY = {
  /** Reserved for the one dominant figure on a screen — a fare, a total, an amount due. Typography carries the hierarchy instead of a container. */
  hero: { fontSize: 44, fontWeight: '700' as const, lineHeight: 48, letterSpacing: -0.8 },
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34, letterSpacing: -0.4 },
  h1: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: -0.2 },
  h2: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  bodyLarge: { fontSize: 15, fontWeight: '600' as const, lineHeight: 21 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  micro: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14 },
  label: {
    fontSize: 11,
    fontWeight: '600' as const,
    lineHeight: 14,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
};
