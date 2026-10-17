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
  // Where the thumb sat when the current drag began; each move places it at start + dx, clamped
  // to the track. (Adding dx to a listener-tracked live value counted every move twice, so the
  // thumb hit the clamp early and froze mid-track.)
  const dragStart = useRef(0);
  const lastValue = useRef(0);
  // The responder is created once, so it reads these through refs (never a first-render copy).
  const processingRef = useRef(processing);
  processingRef.current = processing;
  const onAcceptRef = useRef(onAccept);
  onAcceptRef.current = onAccept;

  useEffect(() => {
    if (!processing) {
      lastValue.current = 0;
      Animated.spring(pan, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: false }).start();
    }
  }, [processing, pan]);

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  };

  const springBack = () => {
    lastValue.current = 0;
    Animated.spring(pan, { toValue: 0, damping: 18, stiffness: 220, useNativeDriver: false }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !processingRef.current,
      // Claim horizontal drags before a parent sheet/scroll view can, and never hand them back
      // mid-slide — a stolen gesture never "releases", which left the thumb stuck in the middle.
      onMoveShouldSetPanResponderCapture: (_, g) => !processingRef.current && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        pan.stopAnimation((value) => {
          dragStart.current = value;
          lastValue.current = value;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = Math.min(Math.max(dragStart.current + g.dx, 0), maxDragRef.current);
        lastValue.current = next;
        pan.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        // Past 60% of the track, or a quick flick to the right, completes the slide.
        const max = maxDragRef.current;
        if (max > 0 && (lastValue.current >= max * 0.6 || g.vx > 0.5)) {
          lastValue.current = max;
          Animated.timing(pan, { toValue: max, duration: 140, useNativeDriver: false }).start(() => {
            onAcceptRef.current();
          });
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: springBack,
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
