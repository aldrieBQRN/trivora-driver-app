import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import MapView, { Circle, Marker, Polyline, UrlTile } from 'react-native-maps';
import { Compass, Shield, ChevronRight, MapPin } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';
import { TricycleIcon } from './icons';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';
import { haversineKm } from '../utils/geo';

/** The driver must move this far from where the camera was last framed before we re-fit while
 * following a pickup/drop-off target — keeps the destination in view as the driver approaches
 * without re-animating the camera on every small GPS tick. */
const REFRAME_THRESHOLD_KM = 0.12;
/** Fixed breathing room added on top of the caller-supplied chrome insets, so a pin never sits
 * flush against the edge of the visible (non-overlaid) map area. */
const EDGE_MARGIN = 40;

const CARTO_URL_TEMPLATE =
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

// Identical to the Passenger app's CARTO Voyager style — same map "skin" across the ecosystem.
const VOYAGER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FAF6EE' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#786F66' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FAF6EE' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#F0ECE3' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#D8F3DC' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#427848' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FFB74D' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E68A00' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#FFE4BA' }] },
  { featureType: 'road.arterial', elementType: 'geometry.stroke', stylers: [{ color: '#F4C793' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#E8DEC8' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#85CBE6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2E7997' }] },
];

export default function TrivoraDriverMapNative({
  driverLocation,
  isOnline,
  zoneName = 'TODA Bucana Zone',
  showTodaPill = true,
  showCompass = true,
  onTodaPress,
  onRecenter,
  target,
  routeCoordinates,
  routeSource,
  topInset = 0,
  bottomInset = 0,
  style,
}: TrivoraDriverMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);

  // Derived from the caller's actual header/bottom-sheet heights (not a guessed geographic
  // offset) — react-native-maps applies this to every camera operation, so a booking-screen
  // target stays inside the visible (non-overlaid) area instead of the map treating the full
  // screen as usable space. Mirrors the Passenger app's own TrivoraMap.native.tsx exactly.
  const edgePadding = useMemo(
    () => ({ top: topInset + EDGE_MARGIN, right: EDGE_MARGIN, bottom: bottomInset + EDGE_MARGIN, left: EDGE_MARGIN }),
    [topInset, bottomInset]
  );

  /** Booking-process framing only (Dispatch/En-Route/Arrived/In-Transit — anywhere `target` is
   * set) — fits the driver + pickup/dropoff target via fitToCoordinates' edge padding, exactly
   * like the Passenger app's own frameRelevantPoints does for its own pickup/dropoff points.
   * Home's framing (frameSelf, below) is separate and untouched by this. */
  const frameTarget = useCallback(
    (animated: boolean) => {
      if (!mapRef.current || !target) return;
      mapRef.current.fitToCoordinates(
        [
          { latitude: driverLocation.lat, longitude: driverLocation.lng },
          { latitude: target.lat, longitude: target.lng },
        ],
        { edgePadding, animated }
      );
      lastFramedRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
    },
    [target?.lat, target?.lng, driverLocation.lat, driverLocation.lng, edgePadding]
  );

  /** Home only (no ride target) — unchanged from before this fix. fitToCoordinates has nothing
   * to fit with a single point, and `mapPadding` alone isn't reliably honored for a plain region
   * center on every provider/platform, so this centers on the driver first, then measures where
   * that point actually rendered and corrects the center in pixel space (via the map's own
   * current projection) so it lands in the middle of the VISIBLE area instead of the full
   * container. */
  const frameSelf = (animated: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    map.animateToRegion(
      { latitude: driverLocation.lat, longitude: driverLocation.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      animated ? 500 : 0
    );
    if (topInset === 0 && bottomInset === 0) return;
    const verticalOffset = (topInset - bottomInset) / 2;
    setTimeout(async () => {
      try {
        const point = await map.pointForCoordinate({ latitude: driverLocation.lat, longitude: driverLocation.lng });
        const corrected = await map.coordinateForPoint({ x: point.x, y: point.y - verticalOffset });
        map.animateToRegion(
          { latitude: corrected.latitude, longitude: corrected.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 },
          animated ? 300 : 0
        );
      } catch {}
    }, animated ? 550 : 50);
  };

  // Home only — re-centers on mount, and again once the caller's real measured insets replace
  // their initial 0 default. Untouched by this fix (still keyed on topInset/bottomInset only,
  // exactly as before).
  useEffect(() => {
    if (target) return;
    frameSelf(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topInset, bottomInset]);

  // Booking process only — frames the driver + target whenever a ride target first appears, and
  // now ALSO whenever edgePadding (i.e. topInset/bottomInset) changes, which is the actual fix:
  // previously this only depended on target?.lat/lng, so a booking screen that already has its
  // target set at mount (every ride-flow screen) would fit using ~zero padding — the bottom
  // sheet's real height is only known a render or two later via onLayout — and this effect would
  // never re-fire to correct it. This is exactly the "route hidden behind the booking panel"
  // symptom, and mirrors the Passenger app's own frame effect, which lists its equivalent
  // edgePadding in this same dependency array. Also means the route now correctly refits if the
  // panel's height changes later (e.g. its content grows or shrinks).
  useEffect(() => {
    if (!target) {
      lastFramedRef.current = null;
      return;
    }
    frameTarget(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng, edgePadding]);

  // Booking process only — keep the target in frame as the driver approaches, without
  // re-animating on every GPS tick, only once they've moved meaningfully since the camera was
  // last positioned. Unchanged from before this fix.
  useEffect(() => {
    if (!target || !lastFramedRef.current) return;
    const moved = haversineKm(lastFramedRef.current, { lat: driverLocation.lat, lng: driverLocation.lng });
    if (moved >= REFRAME_THRESHOLD_KM) frameTarget(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation.lat, driverLocation.lng]);

  const handleRecenter = () => {
    if (target) {
      frameTarget(true);
    } else {
      frameSelf(true);
    }
    onRecenter?.();
  };

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: driverLocation.lat,
          longitude: driverLocation.lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        customMapStyle={VOYAGER_MAP_STYLE}
        showsUserLocation={false}
        showsCompass={false}
        mapPadding={edgePadding}
      >
        <UrlTile
          urlTemplate={CARTO_URL_TEMPLATE}
          maximumZ={19}
          flipY={false}
          tileSize={256}
          shouldReplaceMapContent={true}
          zIndex={1}
        />
        {/* Live broadcast radius — visible only while online, communicating "the dispatch
            system can see me" spatially rather than as a separate text label. */}
        {isOnline && !target && (
          <Circle
            center={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
            radius={150}
            fillColor="rgba(27, 58, 105, 0.10)"
            strokeColor="rgba(27, 58, 105, 0.25)"
            strokeWidth={1}
          />
        )}

        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            coordinates={routeCoordinates.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={COLORS.primary}
            strokeWidth={4}
            lineDashPattern={routeSource === 'fallback' ? [8, 6] : undefined}
          />
        )}

        <Marker
          zIndex={10}
          coordinate={{ latitude: driverLocation.lat, longitude: driverLocation.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          rotation={driverLocation.heading}
        >
          <View style={[styles.trikeBubble, !isOnline && styles.trikeBubbleOffline]}>
            <TricycleIcon
              size={20}
              color={isOnline ? COLORS.primary : COLORS.textMuted}
              accentColor={isOnline ? '#3B82F6' : COLORS.textMuted}
            />
          </View>
        </Marker>

        {target && (
          <Marker zIndex={10} coordinate={{ latitude: target.lat, longitude: target.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            {target.kind === 'pickup' ? (
              <View style={styles.pickupPin} />
            ) : (
              <View style={styles.dropoffPin}>
                <MapPin size={9} color="#FFFFFF" />
              </View>
            )}
          </Marker>
        )}
      </MapView>

      {showTodaPill && (
        <TouchableOpacity style={styles.todaPill} onPress={onTodaPress} activeOpacity={0.88}>
          <Shield size={12} color={COLORS.textInverse} />
          <Text style={styles.todaPillText}>{zoneName}</Text>
          <ChevronRight size={14} color={COLORS.textInverse} />
        </TouchableOpacity>
      )}

      {showCompass && (
        <TouchableOpacity style={styles.compassButton} onPress={handleRecenter} activeOpacity={0.8}>
          <Compass size={18} color="#D97706" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF6EE',
    position: 'relative',
    overflow: 'hidden',
  },
  trikeBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  trikeBubbleOffline: {
    borderColor: COLORS.textMuted,
  },
  pickupPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#059669',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    ...SHADOWS.sm,
  },
  dropoffPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.danger,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.sm,
  },
  todaPill: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    ...SHADOWS.md,
  },
  todaPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  compassButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8DEC8',
    ...SHADOWS.sm,
  },
});
