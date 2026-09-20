import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Wifi } from 'lucide-react-native';
import { useNetwork } from '../context/NetworkContext';

export default function OfflineBanner() {
  const { isConnected } = useNetwork();
  const insets = useSafeAreaInsets();
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(false);
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    if (!isConnected) {
      wasOffline.current = true;
      setShowRestored(false);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else if (wasOffline.current) {
      // Transition from offline to online
      setShowRestored(true);
      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -60,
          duration: 350,
          useNativeDriver: true,
        }).start(() => {
          setShowRestored(false);
          wasOffline.current = false;
        });
      }, 2500);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(-60);
    }
  }, [isConnected, slideAnim]);

  if (isConnected && !showRestored) {
    return null;
  }

  const isOnlineBanner = isConnected && showRestored;
  const topOffset = Math.max(insets.top, Platform.OS === 'android' ? 10 : 0);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          transform: [{ translateY: slideAnim }],
        },
      ]}
      pointerEvents="none"
    >
      <View style={[styles.pill, isOnlineBanner ? styles.pillOnline : styles.pillOffline]}>
        {isOnlineBanner ? (
          <>
            <Wifi size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.text}>Back Online</Text>
          </>
        ) : (
          <>
            <WifiOff size={16} color="#FFFFFF" strokeWidth={2.5} />
            <Text style={styles.text}>No Internet Connection (Offline Mode)</Text>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 99999,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  pillOffline: {
    backgroundColor: '#DC2626', // High contrast danger red
  },
  pillOnline: {
    backgroundColor: '#16A34A', // Vibrant success green
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
