import React, { ReactNode } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';

interface StaticBottomPanelProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Fixed bottom panel over the map for the ride-flow screens (En Route, In Transit) — looks like
 * AppBottomSheet (rounded top, sheet shadow, no handle since it can't be dragged) but is a plain
 * View that hugs its content. Those sheets were never draggable, and @gorhom's dynamic-sizing
 * machinery could swallow
 * the first tap on the primary action ("I Have Arrived" needing two taps) while it re-measured.
 */
export default function StaticBottomPanel({ children, style, onLayout }: StaticBottomPanelProps) {
  return (
    <View style={styles.panel} onLayout={onLayout}>
      <View style={style}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    ...SHADOWS.sheet,
  },
});
