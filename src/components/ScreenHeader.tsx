import React, { ReactNode } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import type { LucideIcon } from 'lucide-react-native';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import FloatingIconButton from './FloatingIconButton';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  /** Custom element before the title — e.g. a driver avatar on Home. Ignored when `onBack` is set. */
  leftSlot?: ReactNode;
  rightIcon?: LucideIcon;
  onRightPress?: () => void;
  rightSlot?: ReactNode;
  /** 'solid' sits in normal document flow; 'overlay' floats over full-bleed content (e.g. a map) with a blur backing. */
  variant?: 'solid' | 'overlay';
  /** Only relevant to the 'overlay' variant: 'blur' (default) is see-through over the map; 'opaque' is a fully solid bar that still floats above the content instead of pushing it down. */
  tone?: 'blur' | 'opaque';
  /** Reports the header's actual rendered height — e.g. so a map underneath an overlay header
   * can compute how much of its top edge is actually covered. */
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * One header treatment for every non-dashboard screen: optional back button, title/subtitle,
 * and a single optional right-side action. The `overlay` variant lets a map or other full-bleed
 * content run underneath the status bar instead of being boxed below a hard header; its `tone`
 * controls whether that floating bar is see-through blur or a fully opaque surface. Icon buttons
 * are always the shared solid FloatingIconButton (same convention as the Passenger app), since a
 * translucent-on-blur icon circle disappears the moment the tone underneath it is opaque.
 */
export default function ScreenHeader({
  title,
  subtitle,
  onBack,
  leftSlot,
  rightIcon: RightIcon,
  onRightPress,
  rightSlot,
  variant = 'solid',
  tone = 'blur',
  onLayout,
}: ScreenHeaderProps) {
  const isOverlay = variant === 'overlay';
  const isOpaqueOverlay = isOverlay && tone === 'opaque';
  const useLightText = isOverlay && !isOpaqueOverlay;
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.row, isOverlay && { paddingTop: insets.top + SPACING.sm }]}>
      {onBack && (
        <FloatingIconButton onPress={onBack} accessibilityLabel="Back">
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </FloatingIconButton>
      )}
      {!onBack && leftSlot}

      <View style={styles.titleCol}>
        <Text style={[styles.title, useLightText && styles.titleOverlay]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, useLightText && styles.subtitleOverlay]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>

      {rightSlot}
      {RightIcon && !rightSlot && (
        <FloatingIconButton onPress={onRightPress}>
          <RightIcon size={18} color={COLORS.primary} />
        </FloatingIconButton>
      )}
      {!RightIcon && !rightSlot && onBack && <View style={styles.spacer} />}
    </View>
  );

  if (isOpaqueOverlay) {
    return (
      <View style={[styles.blurContainer, styles.opaqueContainer]} onLayout={onLayout}>
        {content}
      </View>
    );
  }

  if (isOverlay) {
    return (
      <BlurView intensity={40} tint="dark" style={styles.blurContainer} onLayout={onLayout}>
        {content}
      </BlurView>
    );
  }

  return (
    <View style={styles.solidContainer} onLayout={onLayout}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  solidContainer: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.sm,
  },
  blurContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  opaqueContainer: {
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...SHADOWS.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm + 2,
    paddingBottom: SPACING.sm + 2,
  },
  titleCol: {
    flex: 1,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  titleOverlay: {
    color: '#FFFFFF',
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  subtitleOverlay: {
    color: 'rgba(255,255,255,0.75)',
  },
  spacer: {
    width: 36,
  },
});
