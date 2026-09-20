import React from 'react';
import { TouchableOpacity, View, StyleSheet, ViewStyle } from 'react-native';
import { COLORS, SHADOWS } from '../constants/theme';

interface FloatingIconButtonProps {
  onPress?: () => void;
  size?: number;
  hasBadge?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  children: React.ReactNode;
}

/**
 * The circular floating control used over full-bleed map screens (back, notifications, call,
 * message). Ported from the Passenger app's FloatingIconButton so both apps draw the same
 * floating-chrome shape/shadow/surface instead of each screen hand-rolling its own icon circle.
 */
export default function FloatingIconButton({
  onPress,
  size = 36,
  hasBadge,
  accessibilityLabel,
  style,
  children,
}: FloatingIconButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, { width: size, height: size, borderRadius: size / 2 }, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel}
    >
      {children}
      {hasBadge && <View style={styles.badge} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...SHADOWS.md,
  },
  badge: {
    position: 'absolute',
    top: 7,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.danger,
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
});
