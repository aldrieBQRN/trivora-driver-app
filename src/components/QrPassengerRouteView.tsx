import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, SignalLow } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { haversineKm } from '../utils/geo';
import TrivoraDriverMap from './TrivoraDriverMap';
import ScreenHeader from './ScreenHeader';
import Button from './Button';
import { QrSessionPassenger } from '../types';

interface QrPassengerRouteViewProps {
  passenger: QrSessionPassenger;
  label: string;
  onBack: () => void;
  /** Present only while this passenger is aboard — drop off straight from the map. */
  onDropOff?: () => void;
  dropOffBusy?: boolean;
}

/** Same speed the app already uses for its ETA estimates (≈20 km/h in town). */
const TOWN_SPEED_KMH = 20;

/**
 * Full-screen route for one walk-in passenger: the driver's live GPS position to that passenger's
 * own destination, re-routed as the driver moves (useLiveRoute — the same routing the normal ride
 * screens use). Available before and during the ride. Display only; the fare was fixed by the
 * server at join time.
 */
export default function QrPassengerRouteView({ passenger, label, onBack, onDropOff, dropOffBusy }: QrPassengerRouteViewProps) {
  const { currentLat, currentLng, headingDeg } = useDriverShift();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);

  const driverLocation = currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng, heading: headingDeg } : null;
  const dest = passenger.dropoff;
  const route = useLiveRoute(driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null, { lat: dest.lat, lng: dest.lng });

  // Remaining distance along the drawn road route (never a guess when there's no GPS).
  const remainingKm = useMemo(() => {
    const pts = route?.coordinates ?? [];
    if (pts.length > 1) {
      let km = 0;
      for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
      return km;
    }
    return driverLocation ? haversineKm(driverLocation, dest) : null;
  }, [route, driverLocation?.lat, driverLocation?.lng, dest.lat, dest.lng]);
  const etaMin = remainingKm != null ? Math.max(1, Math.round((remainingKm / TOWN_SPEED_KMH) * 60)) : null;

  return (
    <View style={styles.container}>
      <TrivoraDriverMap
        driverLocation={driverLocation}
        isOnline
        showCompass
        target={{ lat: dest.lat, lng: dest.lng, label: dest.name, kind: 'dropoff' }}
        routeCoordinates={route?.coordinates ?? []}
        routeSource={route?.source ?? 'fallback'}
        topInset={headerHeight}
        bottomInset={panelHeight}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader
        variant="overlay"
        tone="opaque"
        title={`Route · ${label}`}
        subtitle={passenger.status === 'in_transit' ? 'Aboard' : 'Waiting to start'}
        onBack={onBack}
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
      />

      <View
        style={[styles.panel, { paddingBottom: insets.bottom + SPACING.md }]}
        onLayout={(e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.destRow}>
          <MapPin size={16} color={COLORS.danger} />
          <View style={styles.flex}>
            <Text style={styles.label}>Destination</Text>
            <Text style={styles.dest} numberOfLines={2}>{dest.name}</Text>
          </View>
        </View>

        {driverLocation ? (
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.label}>Distance</Text>
              <Text style={styles.value}>{remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.label}>Est. time</Text>
              <Text style={styles.value}>{etaMin != null ? `${etaMin} min` : '—'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.stat, styles.statEnd]}>
              <Text style={styles.label}>Fare</Text>
              <Text style={styles.fare}>₱{Number(passenger.fare_amount || 0).toFixed(2)}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.gpsRow}>
            <SignalLow size={14} color={COLORS.warning} />
            <Text style={styles.gpsText}>Waiting for your GPS position to draw the route.</Text>
          </View>
        )}

        {route?.source === 'fallback' && driverLocation ? (
          <Text style={styles.note}>Road route unavailable — distance is an estimate.</Text>
        ) : null}

        {onDropOff ? (
          <Button label="Drop Off" onPress={onDropOff} loading={dropOffBusy} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md + 4,
    gap: SPACING.md,
    ...SHADOWS.sheet,
  },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...TYPOGRAPHY.label, color: COLORS.textMuted },
  dest: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  stat: { flex: 1 },
  statEnd: { alignItems: 'flex-end' },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.borderLight, marginHorizontal: SPACING.md },
  value: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, marginTop: 3 },
  fare: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, marginTop: 1 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  gpsText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, flex: 1 },
  note: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: -SPACING.xs },
});
