import React, { forwardRef, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';

interface AppBottomSheetProps {
  /** Fixed heights to snap to. Omit and use `enableDynamicSizing` instead when the sheet should just hug its content. */
  snapPoints?: (string | number)[];
  /** Sizes the sheet to its actual content height instead of a guessed percentage — no dead space below short content, no risk of clipping tall content. Mutually exclusive with `snapPoints`. */
  enableDynamicSizing?: boolean;
  index?: number;
  children: ReactNode;
  onChange?: (index: number) => void;
  enablePanDownToClose?: boolean;
  backgroundVariant?: 'light' | 'dark';
  /**
   * Set false on `enableDynamicSizing` sheets whose primary action must be tappable the instant
   * the screen appears (the ride-flow screens). With the entrance slide-up animation left on,
   * the very first tap can land while the sheet is still resizing from its placeholder height to
   * the measured content height and gets swallowed by that in-flight gesture — the tap silently
   * does nothing and the driver has to tap again. Skipping the entrance animation means the sheet
   * is already settled at its final height before it can receive any touches.
   */
  animateOnMount?: boolean;
}

function Background({ style, backgroundVariant = 'light' }: BottomSheetBackgroundProps & { backgroundVariant?: 'light' | 'dark' }) {
  return (
    <View
      style={[
        style,
        styles.background,
        backgroundVariant === 'dark' ? styles.backgroundDark : styles.backgroundLight,
      ]}
    />
  );
}

/**
 * A fixed rounded panel over the map for the driver's booking screens (Home, Dispatch, En Route,
 * In Transit) — built on `@gorhom/bottom-sheet` for its layout/backdrop/dynamic-sizing machinery,
 * but with all drag/swipe gestures disabled so it behaves like a static overlay, not a draggable
 * sheet: it can't be dragged up, down, or between snap points, matching the Passenger app's fixed
 * bottom panel. Screens whose content height doesn't vary should use `enableDynamicSizing` rather
 * than guessing a snap-point percentage.
 */
const AppBottomSheet = forwardRef<BottomSheet, AppBottomSheetProps>(function AppBottomSheet(
  {
    snapPoints,
    enableDynamicSizing = false,
    index = 0,
    children,
    onChange,
    enablePanDownToClose = false,
    backgroundVariant = 'light',
    animateOnMount = true,
  },
  ref
) {
  return (
    <BottomSheet
      ref={ref}
      index={index}
      snapPoints={snapPoints}
      enableDynamicSizing={enableDynamicSizing}
      animateOnMount={animateOnMount}
      onChange={onChange}
      enablePanDownToClose={enablePanDownToClose}
      enableContentPanningGesture={false}
      enableHandlePanningGesture={false}
      enableOverDrag={false}
      handleIndicatorStyle={backgroundVariant === 'dark' ? styles.handleDark : styles.handleLight}
      backgroundComponent={(props) => <Background {...props} backgroundVariant={backgroundVariant} />}
      style={SHADOWS.sheet as object}
    >
      {children}
    </BottomSheet>
  );
});

export default AppBottomSheet;

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
  },
  backgroundLight: {
    backgroundColor: COLORS.background,
  },
  backgroundDark: {
    backgroundColor: COLORS.darkBackground,
  },
  handleLight: {
    backgroundColor: COLORS.border,
    width: 40,
  },
  handleDark: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 40,
  },
});
