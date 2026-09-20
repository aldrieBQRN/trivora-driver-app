import React from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLORS } from '../constants/theme';

export type AvatarTone = 'driver' | 'passenger' | 'inverse';

interface AvatarProps {
  name: string;
  size?: number;
  tone?: AvatarTone;
  /** A real uploaded profile photo URL. When present, it replaces the initials design entirely;
   * when absent/null, the existing default avatar renders exactly as before. */
  imageUri?: string | null;
  style?: ViewStyle;
}

const TONE_STYLES: Record<AvatarTone, { bg: string; text: string }> = {
  driver: { bg: COLORS.primary, text: '#FFFFFF' },
  passenger: { bg: COLORS.primaryTint, text: COLORS.primary },
  inverse: { bg: 'rgba(255,255,255,0.16)', text: '#FFFFFF' },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Initials-based avatar used for both driver and passenger identity across the app.
 * Deliberately typographic (no illustration) to keep the ride flow feeling like a
 * commercial product rather than a decorated mockup.
 */
export default function Avatar({ name, size = 40, tone = 'passenger', imageUri, style }: AvatarProps) {
  const colors = TONE_STYLES[tone];

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={[styles.base, { width: size, height: size, borderRadius: size / 2 }, style] as any}
      />
    );
  }

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bg },
        style,
      ]}
    >
      <Text style={[styles.text, { color: colors.text, fontSize: size * 0.36 }]}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '800',
  },
});
