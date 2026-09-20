import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SHADOWS, TYPOGRAPHY } from '../constants/theme';

export type RideStatusTone = 'progress' | 'success';

interface RideStatusPillProps {
  label: string;
  tone?: RideStatusTone;
}

/**
 * Small centered floating status message used over the full-bleed map during an active ride —
 * matches the Passenger app's DriverEnRouteScreen statusPill exactly: a dot and one line of
 * text, nothing else. Used instead of a full-width header bar so the map stays the focus.
 */
export default function RideStatusPill({ label, tone = 'progress' }: RideStatusPillProps) {
  const isSuccess = tone === 'success';
  return (
    <View style={[styles.pill, isSuccess && styles.pillSuccess]}>
      <View style={[styles.dot, isSuccess && styles.dotSuccess]} />
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: RADIUS.full,
    ...SHADOWS.md,
  },
  pillSuccess: {
    backgroundColor: COLORS.successLight,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.primary,
  },
  dotSuccess: {
    backgroundColor: COLORS.success,
  },
  text: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
  },
});
