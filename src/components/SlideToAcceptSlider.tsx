import React, { useEffect, useState } from 'react';
import { View, StyleSheet, LayoutChangeEvent, ActivityIndicator } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
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
 * Built on react-native-gesture-handler + reanimated rather than PanResponder — PanResponder's
 * web responder shim only reliably tracks touch, so dragging the thumb with a mouse on web did
 * nothing. Gesture Handler's pan gesture handles mouse/pointer input the same as touch.
 */
export default function SlideToAcceptSlider({
  label = 'Slide to Accept Ride',
  onAccept,
  processing = false,
}: SlideToAcceptSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const translateX = useSharedValue(0);
  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const handleAccept = () => {
    onAccept();
  };

  const panGesture = Gesture.Pan()
    .enabled(!processing)
    .onChange((event) => {
      const next = translateX.value + event.changeX;
      translateX.value = Math.max(0, Math.min(next, maxDrag));
    })
    .onEnd((event) => {
      const threshold = maxDrag * 0.7;
      if (maxDrag > 0 && (translateX.value >= threshold || event.velocityX > 800)) {
        // Held at the end (not auto-reset) once accepted — the caller's `processing` prop now
        // owns when this returns to the start: on a successful accept this screen unmounts
        // before that ever matters; on failure, the effect below springs it back so the driver
        // can retry instead of it silently snapping back mid-request.
        translateX.value = withTiming(maxDrag, { duration: 140 }, () => {
          runOnJS(handleAccept)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  useEffect(() => {
    if (!processing) translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processing]);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, Math.max(maxDrag, 1)], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.track} onLayout={onTrackLayout}>
      <Animated.Text style={[styles.label, labelStyle]}>
        {processing ? 'Accepting...' : label}
      </Animated.Text>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.thumb, thumbStyle]}>
          {processing ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <ChevronsRight size={22} color={COLORS.primary} />
          )}
        </Animated.View>
      </GestureDetector>
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
