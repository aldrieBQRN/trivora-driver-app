import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Compass } from 'lucide-react-native';
import { SHADOWS } from '../constants/theme';

const AMBER = '#D97706';

interface MapFocusButtonProps {
  onPress: () => void;
  /** Placement (position/offsets) — the button's look is fixed here. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

/**
 * The one focus/recenter button for every map in the app — the white circle with the amber
 * compass, so "focus the map" reads the same on Home, booking, ride and pin-location maps.
 */
export default function MapFocusButton({ onPress, style, accessibilityLabel = 'Recenter map' }: MapFocusButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Compass size={18} color={AMBER} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8DEC8',
    ...SHADOWS.sm,
  },
});
