import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  LayoutChangeEvent,
  ActivityIndicator,
  Animated,
  PanResponder,
} from 'react-native';
import { ChevronsRight } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, TYPOGRAPHY } from '../constants/theme';

interface SlideToAcceptSliderProps {
  label?: string;
  onAccept: () => void;
  /** True while the accept request is in flight (server-authoritative — see
   * DriverDispatchScreen's handleAccept). Locks the thumb at the end of the track with a spinner
   * instead of resetting immediately, so a slow connection doesn't look like the slide did
   * nothing; disables further dragging until it settles. */
  processing?: boolean;
}

const THUMB_SIZE = 52;
const TRACK_PADDING = 4;

/**
 * Draggable "Slide to Accept Ride" control for the incoming-booking screen.
 * Built on standard React Native PanResponder + Animated for bulletproof reliability across all platforms.
 */
export default function SlideToAcceptSlider({
  label = 'Slide to Accept Ride',
  onAccept,
  processing = false,
}: SlideToAcceptSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);
  const maxDragRef = useRef(maxDrag);
  maxDragRef.current = maxDrag;

  const pan = useRef(new Animated.Value(0)).current;
  const currentDrag = useRef(0);

  useEffect(() => {
    const listener = pan.addListener(({ value }) => {
      currentDrag.current = value;
    });
    return () => {
      pan.removeListener(listener);
    };
  }, [pan]);

  useEffect(() => {
    if (!processing) {
      Animated.spring(pan, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: false }).start();
    }
  }, [processing, pan]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !processing,
      onMoveShouldSetPanResponder: (_, gestureState) => !processing && Math.abs(gestureState.dx) > 2,
      onPanResponderGrant: () => {
        pan.setOffset(currentDrag.current);
        pan.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const next = gestureState.dx;
        const total = currentDrag.current + next;
        if (total >= 0 && total <= maxDragRef.current) {
          pan.setValue(next);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        const threshold = maxDragRef.current * 0.7;
        const value = currentDrag.current;
        if (maxDragRef.current > 0 && (value >= threshold || gestureState.vx > 0.8)) {
          Animated.timing(pan, {
            toValue: maxDragRef.current,
            duration: 140,
            useNativeDriver: false,
          }).start(() => {
            onAccept();
          });
        } else {
          Animated.spring(pan, {
            toValue: 0,
            damping: 18,
            stiffness: 220,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const labelOpacity = pan.interpolate({
    inputRange: [0, Math.max(maxDrag, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.track} onLayout={onTrackLayout}>
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]}>
        {processing ? 'Accepting...' : label}
      </Animated.Text>
      <Animated.View
        style={[styles.thumb, { transform: [{ translateX: pan }] }]}
        {...panResponder.panHandlers}
      >
        {processing ? (
          <ActivityIndicator size="small" color={COLORS.primary} />
        ) : (
          <ChevronsRight size={22} color={COLORS.primary} />
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + TRACK_PADDING * 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryDark,
    justifyContent: 'center',
    padding: TRACK_PADDING,
    ...SHADOWS.md,
  },
  label: {
    position: 'absolute',
    alignSelf: 'center',
    ...TYPOGRAPHY.bodyLarge,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
});
