import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, MapPin, Hand, Crosshair } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { reverseGeocodePoint, fetchRoute, RouteCoordinate, RouteSource } from '../services/routingService';
import TrivoraDriverMap from './TrivoraDriverMap';
import Button from './Button';
import { SelectedDestination } from './DestinationSearchModal';

interface DestinationPinModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (destination: SelectedDestination) => void;
  initialDestination?: SelectedDestination | null;
}

/**
 * Pin the passenger's DESTINATION on the existing driver map. The map opens on the driver's own
 * position for convenience only — nothing is selected until the driver taps the map, and the
 * pick-up is never chosen here (the server always takes it from the driver's GPS). The pinned
 * point's name comes from a reverse lookup when available, else a plain "Selected location".
 */
export default function DestinationPinModal({ visible, onClose, onConfirm, initialDestination }: DestinationPinModalProps) {
  const insets = useSafeAreaInsets();
  const { currentLat, currentLng, headingDeg, isOnline } = useDriverShift();
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<{ name: string; address: string } | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[]>([]);
  const [routeSource, setRouteSource] = useState<RouteSource>('osrm');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const lookupRef = useRef(0);

  const driverLocation = currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng, heading: headingDeg } : null;

  useEffect(() => {
    if (!visible) return;
    setMessage(null);
    if (initialDestination) {
      const initPoint = { lat: initialDestination.lat, lng: initialDestination.lng };
      setPin(initPoint);
      setPlace({ name: initialDestination.name, address: initialDestination.address ?? '' });
      if (driverLocation) {
        setIsResolving(true);
        const id = ++lookupRef.current;
        fetchRoute({ lat: driverLocation.lat, lng: driverLocation.lng }, initPoint)
          .then((route) => {
            if (id !== lookupRef.current) return;
            if (route && route.coordinates && route.coordinates.length > 0) {
              setRouteCoordinates(route.coordinates);
              setRouteSource(route.source);
            } else {
              setRouteCoordinates([
                { lat: driverLocation.lat, lng: driverLocation.lng },
                { lat: initPoint.lat, lng: initPoint.lng },
              ]);
              setRouteSource('fallback');
            }
            setIsResolving(false);
          })
          .catch(() => {
            if (id !== lookupRef.current) return;
            setRouteCoordinates([
              { lat: driverLocation.lat, lng: driverLocation.lng },
              { lat: initPoint.lat, lng: initPoint.lng },
            ]);
            setRouteSource('fallback');
            setIsResolving(false);
          });
      }
    } else {
      setPin(null);
      setPlace(null);
      setRouteCoordinates([]);
      setRouteSource('osrm');
      setIsResolving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePress = (point: { lat: number; lng: number }) => {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return;
    setPin(point);
    setPlace(null);
    setMessage(null);
    const id = ++lookupRef.current;
    setIsResolving(true);

    const reversePromise = reverseGeocodePoint(point);
    const routePromise = driverLocation
      ? fetchRoute({ lat: driverLocation.lat, lng: driverLocation.lng }, point)
      : Promise.resolve(null);

    Promise.all([reversePromise, routePromise])
      .then(([found, route]) => {
        if (id !== lookupRef.current) return;
        setPlace(found);
        if (route && route.coordinates && route.coordinates.length > 0) {
          setRouteCoordinates(route.coordinates);
          setRouteSource(route.source);
        } else if (driverLocation) {
          setRouteCoordinates([
            { lat: driverLocation.lat, lng: driverLocation.lng },
            { lat: point.lat, lng: point.lng },
          ]);
          setRouteSource('fallback');
        }
        setIsResolving(false);
      })
      .catch(() => {
        if (id !== lookupRef.current) return;
        if (driverLocation) {
          setRouteCoordinates([
            { lat: driverLocation.lat, lng: driverLocation.lng },
            { lat: point.lat, lng: point.lng },
          ]);
          setRouteSource('fallback');
        }
        setIsResolving(false);
      });
  };

  const handleConfirm = () => {
    if (!pin) {
      setMessage('Tap the map where the passenger is going to place the destination pin.');
      return;
    }
    onConfirm({
      name: place?.name || 'Selected location',
      address: place?.address,
      lat: pin.lat,
      lng: pin.lng,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {driverLocation ? (
          <TrivoraDriverMap
            driverLocation={driverLocation}
            isOnline={isOnline}
            showDriverMarker={false}
            pickupLocation={driverLocation}
            showCompass={false}
            mapVariant="bright"
            pitch={0}
            onMapPress={handlePress}
            pinLocation={pin}
            routeCoordinates={routeCoordinates}
            routeSource={routeSource}
            recenterSignal={recenterSignal}
            topInset={headerHeight}
            bottomInset={panelHeight}
            style={StyleSheet.absoluteFillObject}
          />
        ) : (
          <View style={styles.noGps}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.noGpsText}>Waiting for your GPS position to open the map…</Text>
          </View>
        )}

        <View
          style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}
          onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.flex}>
            <Text style={styles.title}>Pin the destination</Text>
            <View style={styles.hintRow}>
              <Hand size={13} color={COLORS.textSecondary} />
              <Text style={styles.hint}>Tap the map where the passenger is going</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close map">
            <X size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {driverLocation ? (
          <TouchableOpacity
            style={[styles.floatingFocusBtn, { bottom: panelHeight + 16 }]}
            onPress={() => setRecenterSignal((n) => n + 1)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Focus pick-up and destination"
          >
            <Crosshair size={20} color={COLORS.primary} />
          </TouchableOpacity>
        ) : null}

        <View
          style={[styles.panel, { paddingBottom: insets.bottom + SPACING.md }]}
          onLayout={(e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height)}
        >
          <View style={styles.destRow}>
            <MapPin size={18} color={pin ? COLORS.danger : COLORS.textMuted} />
            <View style={styles.flex}>
              <Text style={styles.label}>Destination</Text>
              {pin ? (
                <>
                  <Text style={styles.destName} numberOfLines={2}>
                    {isResolving ? 'Finding the address…' : place?.name || 'Selected location'}
                  </Text>
                  <Text style={styles.coords}>
                    {place?.address && !isResolving ? `${place.address.split(',').slice(1, 3).join(',').trim()} · ` : ''}
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </Text>
                </>
              ) : (
                <Text style={styles.destPlaceholder}>No pin yet</Text>
              )}
            </View>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <Button label="Confirm destination" onPress={handleConfirm} disabled={isResolving} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundSubtle },
  flex: { flex: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm + 2,
    backgroundColor: COLORS.background, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  title: { ...TYPOGRAPHY.h3, fontWeight: '700', color: COLORS.textPrimary },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  hint: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  floatingFocusBtn: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.md,
    zIndex: 10,
  },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md + 4,
    gap: SPACING.md,
    ...SHADOWS.sheet,
  },
  destRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { ...TYPOGRAPHY.label, color: COLORS.textMuted },
  destName: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary, marginTop: 2 },
  destPlaceholder: { ...TYPOGRAPHY.body, color: COLORS.textMuted, marginTop: 2 },
  coords: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
  message: { ...TYPOGRAPHY.bodySmall, color: COLORS.dangerDark, marginTop: -SPACING.xs },
  noGps: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  noGpsText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
});
