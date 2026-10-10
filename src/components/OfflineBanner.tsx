import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, Wifi, Clock } from 'lucide-react-native';
import { useNetwork } from '../context/NetworkContext';
import { useDriverShift } from '../context/DriverShiftContext';

export default function OfflineBanner() {
  const { isConnected } = useNetwork();
  const { isOnline, telemetryStatus, autoOfflineRemainingSeconds } = useDriverShift();
  const insets = useSafeAreaInsets();
  const [showRestored, setShowRestored] = useState(false);
  const wasOffline = useRef(false);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  // Active warning if phone has no internet OR driver is online and telemetry is in No Signal
  const isStaleOrDisconnected = !isConnected || (isOnline && telemetryStatus === 'no_signal');

  useEffect(() => {
    if (isStaleOrDisconnected) {
      wasOffline.current = true;
      setShowRestored(false);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
      }).start();
    } else if (wasOffline.current) {
      // Transition from disconnected to restored
      setShowRestored(true);
      const timer = setTimeout(() => {
        Animated.timing(slideAnim, {
          toValue: -120,
          duration: 350,
          useNativeDriver: true,
        }).start(() => {
          setShowRestored(false);
          wasOffline.current = false;
        });
      }, 2500);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(-120);
    }
  }, [isStaleOrDisconnected, slideAnim]);

  if (!isStaleOrDisconnected && !showRestored) {
    return null;
  }

  const isOnlineBanner = !isStaleOrDisconnected && showRestored;
  const topOffset = Math.max(insets.top, Platform.OS === 'android' ? 10 : 0);

  // Format countdown mm:ss
  const remainingSecs = autoOfflineRemainingSeconds !== null ? autoOfflineRemainingSeconds : 600;
  const mins = Math.floor(remainingSecs / 60);
  const secs = remainingSecs % 60;
  const countdownFormatted = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

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
      {isOnlineBanner ? (
        <View style={[styles.pill, styles.pillOnline]}>
          <Wifi size={15} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.pillText}>Internet connection restored. GPS tracking resumed.</Text>
        </View>
      ) : isOnline ? (
        // Persistent countdown banner when driver is online but connection/telemetry is lost
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <View style={styles.iconCircle}>
                <WifiOff size={16} color="#DC2626" strokeWidth={2.5} />
              </View>
              <Text style={styles.cardTitle}>No Internet Connection</Text>
            </View>
            <View style={styles.timerBadge}>
              <Clock size={11} color="#B45309" strokeWidth={2.2} />
              <Text style={styles.timerBadgeText}>{countdownFormatted}</Text>
            </View>
          </View>
          <Text style={styles.cardSubtitle}>GPS updates are temporarily unavailable.</Text>
          <Text style={styles.cardCountdown}>
            You will be marked Offline in <Text style={styles.cardCountdownHighlight}>{countdownFormatted}</Text>.
          </Text>
        </View>
      ) : (
        // Standard pill if driver is already offline
        <View style={[styles.pill, styles.pillOffline]}>
          <WifiOff size={15} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={styles.pillText}>No Internet Connection (Offline Mode)</Text>
        </View>
      )}
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  pillOffline: {
    backgroundColor: '#DC2626',
  },
  pillOnline: {
    backgroundColor: '#16A34A',
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  timerBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    color: '#B45309',
  },
  cardSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginBottom: 4,
  },
  cardCountdown: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '600',
  },
  cardCountdownHighlight: {
    color: '#D97706',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
