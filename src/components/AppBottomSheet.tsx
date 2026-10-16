import React, { forwardRef, useImperativeHandle, ReactNode } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';

export interface BottomSheetRef {
  snapToIndex: (index: number) => void;
  snapToPosition: (position: string | number) => void;
  expand: () => void;
  collapse: () => void;
  close: () => void;
  forceClose: () => void;
}

export function BottomSheetView({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={style}>{children}</View>;
}

export interface AppBottomSheetProps {
  snapPoints?: (string | number)[];
  enableDynamicSizing?: boolean;
  index?: number;
  children: ReactNode;
  onChange?: (index: number) => void;
  enablePanDownToClose?: boolean;
  backgroundVariant?: 'light' | 'dark';
  animateOnMount?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A fixed rounded bottom panel over the map for the driver's booking screens (Home, Dispatch, En Route,
 * In Transit) — pure React Native overlay matching the Passenger app's bottom card architecture for
 * 100% stability and zero native crash risks.
 */
const AppBottomSheet = forwardRef<BottomSheetRef, AppBottomSheetProps>(function AppBottomSheet(
  {
    children,
    backgroundVariant = 'light',
    style,
  },
  ref
) {
  useImperativeHandle(ref, () => ({
    snapToIndex: () => {},
    snapToPosition: () => {},
    expand: () => {},
    collapse: () => {},
    close: () => {},
    forceClose: () => {},
  }));

  return (
    <View
      style={[
        styles.panel,
        backgroundVariant === 'dark' ? styles.backgroundDark : styles.backgroundLight,
        style,
      ]}
    >
      {children}
    </View>
  );
});

export default AppBottomSheet;

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    ...SHADOWS.sheet,
    zIndex: 10,
  },
  backgroundLight: {
    backgroundColor: '#FFFFFF',
  },
  backgroundDark: {
    backgroundColor: COLORS.darkSurface,
  },
});
