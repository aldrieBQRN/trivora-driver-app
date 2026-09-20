import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

interface StatusBadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  style?: ViewStyle;
}

const TONE_STYLES: Record<BadgeTone, { bg: string; text: string; border: string }> = {
  success: { bg: COLORS.successLight, text: COLORS.success, border: COLORS.successBorder },
  warning: { bg: COLORS.amberLight, text: '#B45309', border: '#FDE68A' },
  danger: { bg: COLORS.dangerLight, text: COLORS.dangerDark, border: COLORS.dangerBorder },
  neutral: { bg: COLORS.surfaceInput, text: COLORS.textSecondary, border: COLORS.border },
  brand: { bg: COLORS.primaryTint, text: COLORS.primary, border: 'rgba(27, 58, 105, 0.15)' },
};

/** Single pill/badge treatment shared by trip status, violation status, tracking-mode "active" tags, and payment chips. */
export default function StatusBadge({ label, tone = 'neutral', size = 'md', style }: StatusBadgeProps) {
  const colors = TONE_STYLES[tone];
  return (
    <View
      style={[
        styles.base,
        size === 'sm' && styles.sm,
        { backgroundColor: colors.bg, borderColor: colors.border },
        style,
      ]}
    >
      <Text style={[styles.text, size === 'sm' && styles.textSm, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  textSm: {
    fontSize: 9,
    letterSpacing: 0.4,
  },
});
