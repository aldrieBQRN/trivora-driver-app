import React, { useEffect, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text } from 'react-native';
import { RADIUS, SHADOWS } from '../constants/theme';

interface SplashScreenProps {
  onFinish: () => void;
}

// Matches app.json's native splash `backgroundColor` exactly, so the OS-level splash hands off
// to this in-app one with no visible color flash between them.
const SPLASH_BACKGROUND = '#0F1E36';
const AUTO_ADVANCE_MS = 1400;

/**
 * A brief, brand-only beat before the onboarding screen — mirrors the Passenger app's own
 * SplashScreen exactly (same asset, timing, and splash background color) so both apps open with
 * the same brand moment. Auto-advances quickly (and can be tapped through immediately) so it
 * reads as a polished brand moment rather than a loading screen or a delay before the app is
 * usable.
 */
export default function SplashScreen({ onFinish }: SplashScreenProps) {
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    const timer = setTimeout(onFinish, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Pressable style={styles.container} onPress={onFinish}>
      <Animated.View style={[styles.content, { opacity: fade }]}>
        <Image
          source={require('../../assets/branding/trivora-logo-white-bg.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Official Municipal Tricycle Platform</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 220,
    height: 220,
    borderRadius: RADIUS.lg,
    ...SHADOWS.md,
  },
  tagline: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.4,
  },
});
