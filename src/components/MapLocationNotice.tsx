import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';

interface MapLocationNoticeProps {
  isLocating: boolean;
  error: string | null;
  onRetry: () => void;
  /** Distance from the top of the screen, so it sits below each screen's own header/overlay. */
  top: number;
}

/**
 * Small floating notice shown OVER an already-mounted map while the first real GPS fix is
 * pending (or failed) — replacing the old full-screen LocationPendingView that kept the map from
 * mounting at all. The map underneath keeps loading tiles and route/booking markers regardless.
 */
export default function MapLocationNotice({ isLocating, error, onRetry, top }: MapLocationNoticeProps) {
  const failed = !!error && !isLocating;
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View style={styles.card}>
        {failed ? null : <ActivityIndicator size="small" color={COLORS.primary} />}
        <Text style={styles.text} numberOfLines={2}>
          {failed ? error : 'Getting your location…'}
        </Text>
        {failed && (
          <TouchableOpacity onPress={onRetry} style={styles.retry} accessibilityLabel="Enable location">
            <Text style={styles.retryText}>Enable</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
    zIndex: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    maxWidth: 360,
    ...SHADOWS.md,
  },
  text: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  retry: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.full,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  retryText: {
    ...TYPOGRAPHY.caption,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
