import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';
import { BUTTONS, COLORS, RADIUS, SHADOWS, TYPOGRAPHY } from '../constants/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
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

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      style={[
        styles.base,
        { height },
        variantStyle.container,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        animatedStyle,
        style,
      ]}
      onPress={onPress}
      disabled={isDisabled}
      onPressIn={() => {
        scale.value = withSpring(0.97, { damping: 18, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 300 });
      }}
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
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
