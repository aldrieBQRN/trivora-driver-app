import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Image, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type LngLatBounds,
  type StyleSpecification,
} from '@maplibre/maplibre-react-native';
import { Compass, LocateFixed } from 'lucide-react-native';

const PICKUP_PIN_IMAGE = require('../../assets/map/pin-pickup.png');
const DESTINATION_PIN_IMAGE = require('../../assets/map/pin-destination.png');
import { COLORS, SHADOWS } from '../constants/theme';
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
/** Max route vertices used for fitBounds - covers the route's whole extent without walking
 * thousands of points on every reframe. */
const MAX_FIT_ROUTE_POINTS = 40;
/** Trip fit (Dispatch/request screen) only. The static pins are 36dp tall and drawn UPWARD from
 * their coordinate, so the top edge must leave room for a whole pin above the highest point;
 * the bottom only needs a small gap. The overlays themselves already bound the visible area, so
 * these margins are tighter than EDGE_MARGIN (which Home/other ride screens keep using). */
const TRIP_PIN_HEIGHT = 36;
const TRIP_FIT_MARGIN = 16;
/** Never let the trip padding leave less than this much map height to fit the route into. */
const TRIP_MIN_FIT_HEIGHT = 120;
/** Home map zoom: visible span in degrees (~0.004° ≈ 450 m; was 0.01° ≈ 1.1 km), converted to a
 * MapLibre zoom level by deltaToZoom. Used for both the initial camera and every recenter —
 * never re-applied on GPS ticks. */
const HOME_ZOOM_DELTA = 0.004;
/** Home follow mode: while following, a new GPS fix at least this far (km, ~3 m) from where the
 * camera was last centered moves the camera with it. Smaller moves (GPS jitter) only move the
 * marker, so the camera doesn't twitch on every tick. */
const HOME_FOLLOW_MIN_MOVE_KM = 0.003;

const CARTO_URL_TEMPLATE =
  'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=cb1_3qo7_1_ac41fdc9883213d666d06544';

// CARTO Voyager raster basemap as a MapLibre style — the whole map is the CARTO tiles (no Google
// Maps SDK, no Google API key). Same tile URL/key/look as the Passenger app and the web map.
const CARTO_MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [CARTO_URL_TEMPLATE],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#FAF6EE' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };
/** Width (dp) assumed until the map's real width is measured. */
const DEFAULT_MAP_WIDTH = 400;
/** Pin bitmaps are 28x36dp with the tip at the bottom-center pixel. */
const PIN_SIZE = { width: 28, height: 36 };

/** The camera used to be sized by a lat/lng span (react-native-maps regions); MapLibre uses a zoom
 * level (512dp world at zoom 0). Converts the same span across the map's width. */
function deltaToZoom(delta: number, widthDp: number) {
  return Math.log2((360 * (widthDp || DEFAULT_MAP_WIDTH)) / (512 * delta));
}

/** [west, south, east, north] around the points, never degenerate (two identical points would
 * otherwise zoom the camera all the way in). */
function boundsOf(points: { lat: number; lng: number }[]): LngLatBounds {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  points.forEach((p) => {
    west = Math.min(west, p.lng);
    east = Math.max(east, p.lng);
    south = Math.min(south, p.lat);
    north = Math.max(north, p.lat);
  });
  const MIN_SPAN = 0.0005;
  if (east - west < MIN_SPAN) {
    const c = (east + west) / 2;
    west = c - MIN_SPAN / 2;
    east = c + MIN_SPAN / 2;
  }
  if (north - south < MIN_SPAN) {
    const c = (north + south) / 2;
    south = c - MIN_SPAN / 2;
    north = c + MIN_SPAN / 2;
  }
  return [west, south, east, north];
}

/** Polygon approximating a circle of `radiusM` meters (MapLibre circle layers are sized in pixels;
 * this keeps the broadcast radius a real 150 m on the ground). */
function circlePolygon(lat: number, lng: number, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: number[][] = [];
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export default function TrivoraDriverMapNative({
  driverLocation,
  isOnline,
  showDriverMarker = true,
  showCompass = true,
  focusCurrentLocation = false,
  onRecenter,
  recenterSignal: externalRecenterSignal,
  target,
  tripDropoff,
  routeCoordinates,
  routeSource,
  topInset = 0,
  bottomInset = 0,
  onMapPress,
  pinLocation,
  pickupLocation,
  style,
}: TrivoraDriverMapProps) {
  const cameraRef = useRef<CameraRef | null>(null);
  // Captured once at mount: the Camera's initialViewState only applies to its first render.
  const initialCenterRef = useRef(
    driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : target ? { lat: target.lat, lng: target.lng } : null
  );
  const initialCenter = initialCenterRef.current;
  const mountedWithLocationRef = useRef(!!driverLocation);
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  // Home camera bookkeeping. The camera and the marker both read `driverLocation`, so they can't
  // disagree — what used to go wrong was WHEN the camera was moved (see the effects below).
  const [mapReady, setMapReady] = useState(false);
  const homeFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const userMovedRef = useRef(false);
  // Mirrors !userMovedRef for rendering the Focus button's active/paused look.
  const [isFollowing, setIsFollowing] = useState(true);

  // Derived from the caller's actual header/bottom-sheet heights (not a guessed geographic
  // offset) — used as the camera padding, so a target stays inside the visible (non-overlaid)
  // area instead of the map treating the full screen as usable space. Mirrors the Passenger
  // app's own TrivoraMap.native.tsx exactly.
  const edgePadding = useMemo(
    () => ({ top: topInset + EDGE_MARGIN, right: EDGE_MARGIN, bottom: bottomInset + EDGE_MARGIN, left: EDGE_MARGIN }),
    [topInset, bottomInset]
  );

  // Trip fit only: padding sized to the real visible strip between the top overlay and the bottom
  // sheet (+ room for the pins' height). If that would leave less than TRIP_MIN_FIT_HEIGHT of the
  // map's measured height, the two margins shrink first, never the overlay insets themselves.
  const [mapHeight, setMapHeight] = useState(0);
  const [mapWidth, setMapWidth] = useState(0);
  const homeZoom = deltaToZoom(HOME_ZOOM_DELTA, mapWidth);
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
   * set) — fits the driver + pickup/dropoff target via fitBounds' padding, exactly like the
   * Passenger app's own frameRelevantPoints does for its own pickup/dropoff points.
   * Home's framing (frameSelf, below) is separate and untouched by this. */
  const frameTarget = useCallback(
    (animated: boolean) => {
      if (!cameraRef.current || !target) return;
      const duration = animated ? 500 : 0;

      // Dispatch/request screen (tripDropoff set): frame the whole TRIP - pickup, destination and
      // the full road route (sampled) - not the driver, so both endpoints and the route fit in the
      // area between the top chrome and the bottom sheet (the padding is the only inset mechanism).
      if (tripDropoff) {
        const points = [
          { lat: target.lat, lng: target.lng },
          { lat: tripDropoff.lat, lng: tripDropoff.lng },
        ];
        if (routeCoordinates && routeCoordinates.length > 0) {
          const step = Math.max(1, Math.ceil(routeCoordinates.length / MAX_FIT_ROUTE_POINTS));
          routeCoordinates.forEach((c, i) => {
            if (i % step === 0 || i === routeCoordinates.length - 1) points.push({ lat: c.lat, lng: c.lng });
          });
        }
        cameraRef.current.fitBounds(boundsOf(points), { padding: tripFitPadding, duration });
        lastFramedRef.current = driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
        return;
      }

      // Driver + target. Before the first GPS fix only the target is framed; the driver is added
      // by the move-reframe effect below once a real position exists.
      if (!driverLocation) {
        cameraRef.current.easeTo({ center: [target.lng, target.lat], zoom: homeZoom, padding: NO_PADDING, duration });
      } else {
        cameraRef.current.fitBounds(
          boundsOf([
            { lat: target.lat, lng: target.lng },
            { lat: driverLocation.lat, lng: driverLocation.lng },
          ]),
          { padding: edgePadding, duration }
        );
      }
      lastFramedRef.current = driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
    },
    [target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, routeCoordinates, driverLocation?.lat, driverLocation?.lng, edgePadding, tripFitPadding, homeZoom]
  );

  /** Home only (no ride target). Centers the camera on EXACTLY the driver's coordinate — the same
   * `driverLocation` the marker uses. The header/bottom-sheet chrome is handled by ONE mechanism:
   * the camera padding (= edgePadding), which shifts the camera's visual center into the usable
   * area between header and sheet. This is the last known-good Driver behavior.
   *
   * What made it wrong before: a SECOND, pixel-space correction stacked on top of the padding, so
   * the chrome was compensated twice and the map sat too high. That correction stays removed.
   * Removing the padding as well left the marker at 50% of the whole map, too low. */
  const frameSelf = (animated: boolean) => {
    const camera = cameraRef.current;
    if (!camera || !driverLocation) return; // no real position yet — the first fix frames it
    // The very first framing of a map that mounted before GPS existed (no initial center) jumps
    // straight to the driver instead of flying in from the default world view.
    if (!homeFramedRef.current && !mountedWithLocationRef.current) animated = false;
    const lat = driverLocation.lat;
    const lng = driverLocation.lng;
    homeFramedRef.current = { lat, lng };
    if (__DEV__) {
      console.log(
        `[driver-map] easeTo target=(${lat}, ${lng}) marker=(${driverLocation.lat}, ${driverLocation.lng}) ` +
          `padding=${JSON.stringify(edgePadding)} zoom=${homeZoom.toFixed(2)}`
      );
    }
    camera.easeTo({ center: [lng, lat], zoom: homeZoom, padding: edgePadding, duration: animated ? 500 : 0 });
  };

  // Home only — frame once the map has finished loading (a camera move issued before then can be
  // dropped on native) and again when the caller's real measured header/sheet heights replace
  // their initial 0 default, since the padding changes with them. Never after the driver has
  // moved the map themselves.
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
  // same target, same padding, same zoom). A manual pan/zoom pauses this (onRegionDidChange
  // below) and leaves the map where the driver put it; only the Focus button resumes it.
  useEffect(() => {
    if (target || !mapReady) return;
    if (!driverLocation) return;
    const framed = homeFramedRef.current;
    // First real fix on a map that mounted before GPS arrived: frame it now (the ready/inset
    // effect above already ran and found no position to frame).
    if (!framed) {
      frameSelf(true);
      return;
    }
    if (userMovedRef.current) return;
    if (haversineKm(framed, { lat: driverLocation.lat, lng: driverLocation.lng }) >= HOME_FOLLOW_MIN_MOVE_KM) {
      frameSelf(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.lat, driverLocation?.lng]);

  // Booking process only — frames the driver + target whenever a ride target first appears, and
  // whenever the padding (i.e. topInset/bottomInset) changes: a booking screen that already has
  // its target set at mount would otherwise fit using ~zero padding — the bottom sheet's real
  // height is only known a render or two later via onLayout — leaving the route hidden behind
  // the booking panel. Also refits if the panel's height changes later.
  // Waits for mapReady: a fit issued before the map has loaded (and been laid out) can be dropped,
  // leaving the camera on its initial single-point view — the "zoomed in on one endpoint" bug.
  useEffect(() => {
    if (!target) {
      lastFramedRef.current = null;
      return;
    }
    if (!mapReady) return;
    frameTarget(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, tripDropoff ? routeCoordinates : null, tripDropoff ? tripFitPadding : edgePadding]);

  // Booking process only — keep the target in frame as the driver approaches, without
  // re-animating on every GPS tick, only once they've moved meaningfully since the camera was
  // last positioned.
  useEffect(() => {
    if (!target || tripDropoff || !driverLocation || !mapReady) return;
    // First fix after mounting without GPS: bring the driver into the target framing once.
    if (!lastFramedRef.current) {
      frameTarget(true);
      return;
    }
    const moved = haversineKm(lastFramedRef.current, { lat: driverLocation.lat, lng: driverLocation.lng });
    if (moved >= REFRAME_THRESHOLD_KM) frameTarget(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.lat, driverLocation?.lng]);

  const handleRecenter = () => {
    if (pinLocation && (pickupLocation || driverLocation)) {
      const pickup = pickupLocation || driverLocation!;
      const points: { lat: number; lng: number }[] = [
        { lat: pickup.lat, lng: pickup.lng },
        { lat: pinLocation.lat, lng: pinLocation.lng },
      ];
      if (routeCoordinates && routeCoordinates.length > 0) {
        const step = Math.max(1, Math.ceil(routeCoordinates.length / MAX_FIT_ROUTE_POINTS));
        routeCoordinates.forEach((c, i) => {
          if (i % step === 0 || i === routeCoordinates.length - 1) points.push({ lat: c.lat, lng: c.lng });
        });
      }
      cameraRef.current?.fitBounds(boundsOf(points), { padding: edgePadding, duration: 500 });
      lastFramedRef.current = null;
    } else if (target) {
      frameTarget(true);
    } else {
      // Focus Current Location: center on the latest GPS fix and resume following.
      userMovedRef.current = false;
      setIsFollowing(true);
      frameSelf(true);
    }
    onRecenter?.();
  };

  useEffect(() => {
    if (externalRecenterSignal && externalRecenterSignal > 0) {
      userMovedRef.current = false;
      handleRecenter();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRecenterSignal]);

  // Home (no target): the camera is framed against the chrome padding — a map created with
  // placeholder 0 insets and framed before the measured header/sheet heights arrive is framed
  // against the WRONG padding (and Home remounts on every return from a ride, where the location
  // is already known so the map mounts before layout). So Home creates its map only once both
  // insets are measured, letting it start with its FINAL padding and initial camera. First open
  // and return-to-Home then take the identical path.
  const homeInsetsMeasured = !!target || (topInset > 0 && bottomInset > 0);
  if (!homeInsetsMeasured) {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => {
        setMapHeight(e.nativeEvent.layout.height);
        setMapWidth(e.nativeEvent.layout.width);
      }}
    >
      <Map
        style={StyleSheet.absoluteFillObject}
        mapStyle={CARTO_MAP_STYLE}
        attribution={false}
        logo={false}
        compass={false}
        onDidFinishLoadingMap={() => {
          if (__DEV__) console.log(`[driver-map] onDidFinishLoadingMap initialCenter=${initialCenter ? `(${initialCenter.lat}, ${initialCenter.lng})` : 'none (no GPS yet)'}`);
          setMapReady(true);
        }}
        onRegionDidChange={(e) => {
          if (e.nativeEvent.userInteraction && !userMovedRef.current) {
            userMovedRef.current = true;
            if (!target) setIsFollowing(false);
          }
        }}
        onPress={
          onMapPress
            ? (e: any) => {
                const lngLat = e?.nativeEvent?.lngLat;
                if (Array.isArray(lngLat) && lngLat.length === 2) onMapPress({ lat: Number(lngLat[1]), lng: Number(lngLat[0]) });
              }
            : undefined
        }
      >
        <Camera
          ref={cameraRef}
          // Real coordinates only: the driver if known, else the ride target (a real booking
          // point), else none — the map still mounts and starts loading tiles, and the camera moves
          // to the first real fix when it arrives (never a guessed/default location). Home starts
          // with its chrome padding; ride screens frame with fitBounds' own padding.
          // A trip (target + tripDropoff) starts already framed on both endpoints, so it never
          // opens zoomed in on the pickup alone; the fit effect then adds the route once loaded.
          initialViewState={target && tripDropoff ? {
            bounds: boundsOf([
              { lat: target.lat, lng: target.lng },
              { lat: tripDropoff.lat, lng: tripDropoff.lng },
            ]),
            padding: tripFitPadding,
          } : initialCenter ? {
            center: [initialCenter.lng, initialCenter.lat],
            zoom: homeZoom,
            padding: target ? NO_PADDING : edgePadding,
          } : undefined}
        />

        {/* Live broadcast radius — visible only while online, communicating "the dispatch
            system can see me" spatially rather than as a separate text label. */}
        {isOnline && !target && driverLocation && (
          <GeoJSONSource id="broadcast-radius" data={circlePolygon(driverLocation.lat, driverLocation.lng, 150)}>
            <Layer id="broadcast-radius-fill" type="fill" paint={{ 'fill-color': 'rgba(27, 58, 105, 0.10)' }} />
            <Layer id="broadcast-radius-line" type="line" paint={{ 'line-color': 'rgba(27, 58, 105, 0.25)', 'line-width': 1 }} />
          </GeoJSONSource>
        )}

        {/* Route: a style layer, so it draws above the CARTO raster and below the markers (which
            are native views on top of the map). */}
        {routeCoordinates && routeCoordinates.length > 1 && (
          <GeoJSONSource
            id="route"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: routeCoordinates.map((p) => [p.lng, p.lat]) },
            }}
          >
            <Layer
              id="route-line"
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': routeSource === 'fallback' ? 'butt' : 'round' }}
              paint={
                routeSource === 'fallback'
                  ? // [8, 6]dp dashes, expressed in line widths.
                    { 'line-color': COLORS.primary, 'line-width': 4, 'line-dasharray': [2, 1.5] }
                  : { 'line-color': COLORS.primary, 'line-width': 4 }
              }
            />
          </GeoJSONSource>
        )}

        {/* Pickup / dropoff pin — static bitmap (assets/map/pin-*.png, 28x36 at 1x with @2x/@3x),
            cropped so the pin's tip is the bottom-center pixel of the image; anchor "bottom" = the
            tip = the exact coordinate at every zoom. Same asset set and anchoring as the Passenger
            app. */}
        {pickupLocation ? (
          <Marker id="pickup-pin" lngLat={[pickupLocation.lng, pickupLocation.lat]} anchor="bottom">
            <Image source={PICKUP_PIN_IMAGE} style={PIN_SIZE} />
          </Marker>
        ) : null}
        {target ? (
          <Marker id="target-pin" lngLat={[target.lng, target.lat]} anchor="bottom">
            <Image source={target.kind === 'pickup' ? PICKUP_PIN_IMAGE : DESTINATION_PIN_IMAGE} style={PIN_SIZE} />
          </Marker>
        ) : null}
        {tripDropoff ? (
          <Marker id="trip-dropoff-pin" lngLat={[tripDropoff.lng, tripDropoff.lat]} anchor="bottom">
            <Image source={DESTINATION_PIN_IMAGE} style={PIN_SIZE} />
          </Marker>
        ) : null}
        {pinLocation ? (
          <Marker id="destination-pin" lngLat={[pinLocation.lng, pinLocation.lat]} anchor="bottom">
            <Image source={DESTINATION_PIN_IMAGE} style={PIN_SIZE} />
          </Marker>
        ) : null}

        {/* Rendered last so it draws above the pins. */}
        {showDriverMarker && driverLocation ? (
          <Marker id="driver" lngLat={[driverLocation.lng, driverLocation.lat]} anchor="center">
            <View
              style={[
                styles.trikeBubble,
                !isOnline && styles.trikeBubbleOffline,
                { transform: [{ rotate: `${driverLocation.heading || 0}deg` }] },
              ]}
            >
              <TricycleIcon
                size={20}
                color={isOnline ? COLORS.primary : COLORS.textMuted}
                accentColor={isOnline ? '#3B82F6' : COLORS.textMuted}
              />
            </View>
          </Marker>
        ) : null}
      </Map>

      {(focusCurrentLocation || (showCompass && !target)) && (
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
