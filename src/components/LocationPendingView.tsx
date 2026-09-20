import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MapPinOff } from 'lucide-react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import Button from './Button';

interface LocationPendingViewProps {
  /** true while a GPS fix is still being acquired — shows a spinner instead of the error state. */
  isLocating: boolean;
  /** Set when a fetch actually failed (permission denied, GPS unavailable). */
  error: string | null;
  onRetry: () => void;
}

/**
 * Full-bleed placeholder shown wherever a screen needs the driver's real GPS position before it
 * can render anything (the map has no honest coordinate to draw a marker at otherwise). Never
 * substitutes a fake/default location — if GPS truly can't be obtained, this says so plainly and
 * offers a retry, matching the same "no fake fallback" rule the Passenger app follows.
 */
export default function LocationPendingView({ isLocating, error, onRetry }: LocationPendingViewProps) {
  return (
    <View style={styles.container}>
      {isLocating && !error ? (
        <>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.title}>Getting your location...</Text>
          <Text style={styles.subtitle}>Make sure location services are turned on.</Text>
        </>
      ) : (
        <>
          <MapPinOff size={40} color={COLORS.textSecondary} opacity={0.5} />
          <Text style={styles.title}>Location Unavailable</Text>
          <Text style={styles.subtitle}>
            {error || 'Trivora needs location access to show your real position and route you to rides.'}
          </Text>
          <Button label="Enable Location" onPress={onRetry} variant="primary" style={styles.retryBtn} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    gap: 10,
    backgroundColor: COLORS.background,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 10,
  },
});
