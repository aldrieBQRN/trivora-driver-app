import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { BUTTONS, COLORS, RADIUS, SHADOWS, TYPOGRAPHY } from '../constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'dangerOutline' | 'ghost';
export type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Single source of truth for button hierarchy across the app — primary action, secondary/outline, and destructive. */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const height = size === 'lg' ? BUTTONS.touchHeight : BUTTONS.touchHeightSm;
  const variantStyle = VARIANT_STYLES[variant];

  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, damping: 18, stiffness: 300 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 300 }).start();
  };

  return (
    <AnimatedPressable
      style={[
        styles.base,
        { height, transform: [{ scale }] },
        variantStyle.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variantStyle.text.color} />
      ) : (
        <>
          {Icon && <Icon size={18} color={variantStyle.text.color as string} />}
          <Text style={[styles.label, variantStyle.text]}>{label}</Text>
          {IconRight && <IconRight size={18} color={variantStyle.text.color as string} />}
        </>
      )}
    </AnimatedPressable>
  );
}

const VARIANT_STYLES: Record<ButtonVariant, { container: ViewStyle; text: { color: string } }> = {
  primary: {
    container: { backgroundColor: COLORS.primary, ...SHADOWS.md },
    text: { color: '#FFFFFF' },
  },
  secondary: {
    container: { backgroundColor: COLORS.primaryTint },
    text: { color: COLORS.primary },
  },
  outline: {
    container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.border },
    text: { color: COLORS.textPrimary },
  },
  danger: {
    container: { backgroundColor: COLORS.dangerLight, borderWidth: 1, borderColor: COLORS.dangerBorder },
    text: { color: COLORS.danger },
  },
  /** Destructive but routine (e.g. Log Out): red label only, neutral container — red stays
   * reserved for the label that names the destructive action, not a whole red slab. */
  dangerOutline: {
    container: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.border },
    text: { color: COLORS.dangerDark },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: COLORS.primary },
  },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: RADIUS.lg,
    paddingHorizontal: 20,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
