import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import MapView, { Circle, Marker, Polyline, UrlTile } from 'react-native-maps';
import { Compass, Shield, ChevronRight, LocateFixed } from 'lucide-react-native';

const PICKUP_PIN_IMAGE = require('../../assets/map/pin-pickup.png');
const DESTINATION_PIN_IMAGE = require('../../assets/map/pin-destination.png');
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
/** Max route vertices handed to fitToCoordinates - covers the route's whole extent without
 * passing thousands of points across the native bridge. */
const MAX_FIT_ROUTE_POINTS = 40;
/** Trip fit (Dispatch/request screen) only. The static pins are 36dp tall and drawn UPWARD from
 * their coordinate, so the top edge must leave room for a whole pin above the highest point;
 * the bottom only needs a small gap. The overlays themselves already bound the visible area, so
 * these margins are tighter than EDGE_MARGIN (which Home/other ride screens keep using). */
const TRIP_PIN_HEIGHT = 36;
const TRIP_FIT_MARGIN = 16;
/** Never let the trip padding leave less than this much map height to fit the route into. */
const TRIP_MIN_FIT_HEIGHT = 120;
/** Home map zoom: visible span in degrees (~0.004° ≈ 450 m top-to-bottom; was 0.01° ≈ 1.1 km).
 * Used for both the initial region and every recenter — never re-applied on GPS ticks. */
const HOME_ZOOM_DELTA = 0.004;
/** Home follow mode: while following, a new GPS fix at least this far (km, ~3 m) from where the
 * camera was last centered moves the camera with it. Smaller moves (GPS jitter) only move the
 * marker, so the camera doesn't twitch on every tick. */
const HOME_FOLLOW_MIN_MOVE_KM = 0.003;

const CARTO_URL_TEMPLATE =
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_3qo7_1_ac41fdc9883213d666d06544';

// Identical to the Passenger app's CARTO Voyager style — same map "skin" across the ecosystem.
const VOYAGER_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FAF6EE' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#4A5568' }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#FAF6EE' }] },
  { featureType: 'poi', elementType: 'geometry.fill', stylers: [{ color: '#E8EFE6' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ color: '#DCE8D8' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#E2D9C8' }] },
  { featureType: 'road.arterial', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#FCE7C8' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#E8DEC8' }] },
  { featureType: 'road.local', elementType: 'geometry.fill', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.local', elementType: 'geometry.stroke', stylers: [{ color: '#E8DEC8' }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#85CBE6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2E7997' }] },
];

export default function TrivoraDriverMapNative({
  driverLocation,
  isOnline,
  showDriverMarker = true,
  showCompass = true,
  onRecenter,
  target,
  tripDropoff,
  routeCoordinates,
  routeSource,
  topInset = 0,
  bottomInset = 0,
  style,
}: TrivoraDriverMapProps) {
  const mapRef = useRef<MapView | null>(null);
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  // Home camera bookkeeping. The camera and the marker both read `driverLocation`, so they can't
  // disagree — what used to go wrong was WHEN the camera was moved (see the effects below).
  const [mapReady, setMapReady] = useState(false);
  const homeFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const userMovedRef = useRef(false);
  // Mirrors !userMovedRef for rendering the Focus button's active/paused look.
  const [isFollowing, setIsFollowing] = useState(true);

  // Derived from the caller's actual header/bottom-sheet heights (not a guessed geographic
  // offset) — react-native-maps applies this to every camera operation, so a booking-screen
  // target stays inside the visible (non-overlaid) area instead of the map treating the full
  // screen as usable space. Mirrors the Passenger app's own TrivoraMap.native.tsx exactly.
  const edgePadding = useMemo(
    () => ({ top: topInset + EDGE_MARGIN, right: EDGE_MARGIN, bottom: bottomInset + EDGE_MARGIN, left: EDGE_MARGIN }),
    [topInset, bottomInset]
  );

  // Trip fit only: padding sized to the real visible strip between the top overlay and the bottom
  // sheet (+ room for the pins' height). If that would leave less than TRIP_MIN_FIT_HEIGHT of the
  // map's measured height, the two margins shrink first, never the overlay insets themselves.
  const [mapHeight, setMapHeight] = useState(0);
  const tripFitPadding = useMemo(() => {
    let top = topInset + TRIP_PIN_HEIGHT + TRIP_FIT_MARGIN;
    let bottom = bottomInset + TRIP_FIT_MARGIN;
    if (mapHeight > 0) {
      const overflow = top + bottom - (mapHeight - TRIP_MIN_FIT_HEIGHT);
      if (overflow > 0) {
        const cut = Math.min(overflow, 2 * TRIP_FIT_MARGIN);
        top -= cut / 2;
        bottom -= cut / 2;
      }
    }
    return { top, right: EDGE_MARGIN, bottom, left: EDGE_MARGIN };
  }, [topInset, bottomInset, mapHeight]);

  /** Booking-process framing only (Dispatch/En-Route/Arrived/In-Transit — anywhere `target` is
   * set) — fits the driver + pickup/dropoff target via fitToCoordinates' edge padding, exactly
   * like the Passenger app's own frameRelevantPoints does for its own pickup/dropoff points.
   * Home's framing (frameSelf, below) is separate and untouched by this. */
  const frameTarget = useCallback(
    (animated: boolean) => {
      if (!mapRef.current || !target) return;

      // Dispatch/request screen (tripDropoff set): frame the whole TRIP - pickup, destination and
      // the full road route (sampled) - not the driver, so both endpoints and the route fit in the
      // area between the top chrome and the bottom sheet (edgePadding is the only inset mechanism).
      if (tripDropoff) {
        const points = [
          { latitude: target.lat, longitude: target.lng },
          { latitude: tripDropoff.lat, longitude: tripDropoff.lng },
        ];
        if (routeCoordinates && routeCoordinates.length > 0) {
          const step = Math.max(1, Math.ceil(routeCoordinates.length / MAX_FIT_ROUTE_POINTS));
          routeCoordinates.forEach((c, i) => {
            if (i % step === 0 || i === routeCoordinates.length - 1) points.push({ latitude: c.lat, longitude: c.lng });
          });
        }
        mapRef.current.fitToCoordinates(points, { edgePadding: tripFitPadding, animated });
        lastFramedRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
        return;
      }

      mapRef.current.fitToCoordinates(
        [
          { latitude: driverLocation.lat, longitude: driverLocation.lng },
          { latitude: target.lat, longitude: target.lng },
        ],
        { edgePadding, animated }
      );
      lastFramedRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
    },
    [target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, routeCoordinates, driverLocation.lat, driverLocation.lng, edgePadding, tripFitPadding]
  );

  /** Home only (no ride target). Centers the camera on EXACTLY the driver's coordinate — the same
   * `driverLocation` the marker uses. The header/bottom-sheet chrome is handled by ONE mechanism:
   * the MapView's `mapPadding` (= edgePadding), which shifts the camera's visual center into the
   * usable area between header and sheet. This is the last known-good Driver behavior.
   *
   * What made it wrong before: a SECOND, pixel-space correction (pointForCoordinate ->
   * coordinateForPoint, shifted by (top - bottom) / 2) stacked on top of mapPadding, so the
   * chrome was compensated twice and the map sat too high. That correction stays removed. Removing
   * mapPadding as well (the last attempt) left the marker at 50% of the whole map, too low. */
  const frameSelf = (animated: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const lat = driverLocation.lat;
    const lng = driverLocation.lng;
    homeFramedRef.current = { lat, lng };
    if (__DEV__) {
      console.log(
        `[driver-map] animateToRegion target=(${lat}, ${lng}) marker=(${driverLocation.lat}, ${driverLocation.lng}) ` +
          `mapPadding=${JSON.stringify(edgePadding)} delta=${HOME_ZOOM_DELTA}`
      );
    }
    map.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: HOME_ZOOM_DELTA, longitudeDelta: HOME_ZOOM_DELTA }, animated ? 500 : 0);
  };

  // Home only — frame once the map is READY (a region animation issued before then is silently
  // dropped on native) and again when the caller's real measured header/sheet heights replace
  // their initial 0 default, since mapPadding changes with them. Never after the driver has moved
  // the map themselves.
  useEffect(() => {
    if (target || !mapReady) return;
    if (userMovedRef.current && homeFramedRef.current) return;
    frameSelf(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, topInset, bottomInset]);

  // A ride target going away (this instance reused after a ride) must leave NO ride camera state
  // behind: clear the Home bookkeeping and frame Home again from scratch on the driver's location.
  const hadTargetRef = useRef(!!target);
  useEffect(() => {
    if (target) {
      hadTargetRef.current = true;
      return;
    }
    if (!hadTargetRef.current) return;
    hadTargetRef.current = false;
    lastFramedRef.current = null;
    homeFramedRef.current = null;
    userMovedRef.current = false;
    setIsFollowing(true);
    if (mapReady) frameSelf(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!target]);

  // Home only — FOLLOW MODE. While following (the default, and after every Focus tap), each new
  // GPS fix from the existing driver location state re-centers the camera on it (same frameSelf:
  // same target, same mapPadding, same zoom). A manual pan/zoom pauses this (onRegionChangeComplete
  // below) and leaves the map where the driver put it; only the Focus button resumes it.
  useEffect(() => {
    if (target || !mapReady) return;
    const framed = homeFramedRef.current;
    if (!framed) return; // the ready/inset effect above performs the first framing
    if (userMovedRef.current) return;
    if (haversineKm(framed, { lat: driverLocation.lat, lng: driverLocation.lng }) >= HOME_FOLLOW_MIN_MOVE_KM) {
      frameSelf(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation.lat, driverLocation.lng]);

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
  }, [target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, tripDropoff ? routeCoordinates : null, tripDropoff ? tripFitPadding : edgePadding]);

  // Booking process only — keep the target in frame as the driver approaches, without
  // re-animating on every GPS tick, only once they've moved meaningfully since the camera was
  // last positioned. Unchanged from before this fix.
  useEffect(() => {
    if (!target || tripDropoff || !lastFramedRef.current) return;
    const moved = haversineKm(lastFramedRef.current, { lat: driverLocation.lat, lng: driverLocation.lng });
    if (moved >= REFRAME_THRESHOLD_KM) frameTarget(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation.lat, driverLocation.lng]);

  const handleRecenter = () => {
    if (target) {
      frameTarget(true);
    } else {
      // Focus Current Location: center on the latest GPS fix and resume following.
      userMovedRef.current = false;
      setIsFollowing(true);
      frameSelf(true);
    }
    onRecenter?.();
  };

  // Home (no target): the camera is framed against mapPadding, and native applies a padding change
  // asynchronously — a MapView created with placeholder 0 insets and framed before the measured
  // header/sheet heights arrive is framed against the WRONG padding (and Home remounts on every
  // return from a ride, where the location is already known so the map mounts before layout). So
  // Home creates its MapView only once both insets are measured, letting it start with its FINAL
  // padding and initialRegion. First open and return-to-Home then take the identical path.
  const homeInsetsMeasured = !!target || (topInset > 0 && bottomInset > 0);
  if (!homeInsetsMeasured) {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View style={[styles.container, style]} onLayout={(e) => setMapHeight(e.nativeEvent.layout.height)}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={{
          latitude: driverLocation.lat,
          longitude: driverLocation.lng,
          latitudeDelta: HOME_ZOOM_DELTA,
          longitudeDelta: HOME_ZOOM_DELTA,
        }}
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
        customMapStyle={VOYAGER_MAP_STYLE}
        showsUserLocation={false}
        showsCompass={false}
        // Home (no target) centers via mapPadding. Ride screens (target set) frame with
        // fitToCoordinates' edgePadding, which already carries the same insets — passing mapPadding
        // as well applied them twice and squeezed the driver->pickup fit toward the header.
        mapPadding={target ? undefined : edgePadding}
        onMapReady={() => {
          if (__DEV__) console.log(`[driver-map] onMapReady initialRegion=(${driverLocation.lat}, ${driverLocation.lng}) marker=(${driverLocation.lat}, ${driverLocation.lng})`);
          setMapReady(true);
        }}
        onRegionChangeComplete={(_region, details) => {
          if (details?.isGesture && !userMovedRef.current) {
            userMovedRef.current = true;
            if (!target) setIsFollowing(false);
          }
        }}
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
            // Above the basemap UrlTile (zIndex 1), below the markers (10+) — at the default 0 the
            // route is drawn under the opaque tile overlay and is invisible on native.
            zIndex={2}
            coordinates={routeCoordinates.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={COLORS.primary}
            strokeWidth={4}
            lineDashPattern={routeSource === 'fallback' ? [8, 6] : undefined}
          />
        )}

        {showDriverMarker && (
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
        )}

        {/* Pickup / dropoff pin — static bitmap marker (assets/map/pin-*.png, 28x36 at 1x with
            @2x/@3x), cropped so the pin's tip is the bottom-center pixel of the image. Passed as
            the Marker `image` (not a React/SVG child) so the native map anchors the bitmap itself;
            anchor (0.5, 1) = the tip = the exact coordinate at every zoom. Same asset set and
            anchoring as the Passenger app. */}
        {target && (
          <Marker
            zIndex={10}
            coordinate={{ latitude: target.lat, longitude: target.lng }}
            image={target.kind === 'pickup' ? PICKUP_PIN_IMAGE : DESTINATION_PIN_IMAGE}
            anchor={{ x: 0.5, y: 1 }}
          />
        )}
        {tripDropoff && (
          <Marker
            zIndex={10}
            coordinate={{ latitude: tripDropoff.lat, longitude: tripDropoff.lng }}
            image={DESTINATION_PIN_IMAGE}
            anchor={{ x: 0.5, y: 1 }}
          />
        )}
      </MapView>

      {showCompass && !target && (
        // Home: Focus Current Location, placed just above the bottom sheet (the top-right spot
        // sits under Home's floating header). Filled = following, outlined = paused by a pan.
        <TouchableOpacity
          style={[styles.focusButton, { bottom: bottomInset + 12 }, isFollowing && styles.focusButtonActive]}
          onPress={handleRecenter}
          activeOpacity={0.8}
          accessibilityLabel="Focus current location"
        >
          <LocateFixed size={18} color={isFollowing ? '#FFFFFF' : COLORS.primary} />
        </TouchableOpacity>
      )}
      {showCompass && target && (
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
  focusButton: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.sm,
  },
  focusButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
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
