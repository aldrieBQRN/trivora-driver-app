import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass, LocateFixed } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';
import { haversineKm } from '../utils/geo';

/** Mirrors the native map's re-frame threshold — see TrivoraDriverMap.native.tsx. */
const REFRAME_THRESHOLD_KM = 0.12;
const EDGE_MARGIN = 40;
/** Home only: a later GPS fix this far from where Home was last framed re-centers the camera,
 * until the driver has panned/zoomed themselves — see the native map for the full rationale. */
const HOME_RECENTER_THRESHOLD_KM = 0.15;
/** Max route vertices used for the trip fit — same sampling as the native map. */
const MAX_FIT_ROUTE_POINTS = 40;

// Identical tile source to the Passenger app's web map — same CARTO Voyager basemap.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_3qo7_1_ac41fdc9883213d666d06544';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

function driverIconHtml(heading: number, isOnline: boolean): string {
  const borderColor = isOnline ? COLORS.primary : COLORS.textMuted;
  return `
    <div style="width:36px;height:36px;border-radius:18px;background:#FFFFFF;border:2px solid ${borderColor};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(15,23,42,0.35);transform:rotate(${heading}deg);">
      <div style="width:11px;height:11px;border-radius:6px;background:${isOnline ? '#3B82F6' : COLORS.textMuted};"></div>
    </div>
  `;
}


/** Anchor bottom switches the icon's anchor from center to its bottom tip so teardrop pin
 * markers point down at the exact coordinate. */
function makeDivIcon(html: string, size: number, anchorBottom = false): L.DivIcon {
  return L.divIcon({
    html,
    className: 'trivora-marker-icon',
    iconSize: [size, size],
    iconAnchor: anchorBottom ? [size / 2, size] : [size / 2, size / 2],
  });
}

/** Same teardrop-pin shape as the Passenger app (TrivoraMap.web.tsx / PinLocationModal.web.tsx):
 * pickup is green (#059669), dropoff / destination is red (#EF4444).
 * Both point down at the exact coordinate with anchor at bottom-center. */
export const PICKUP_ICON_HTML = `
  <div style="cursor: pointer; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3)); display: flex; flex-direction: column; align-items: center;">
    <div style="background: #059669; width: 22px; height: 22px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid #FFFFFF;">
      <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  </div>
`;

export const DROPOFF_ICON_HTML = `
  <div style="cursor: pointer; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3)); display: flex; flex-direction: column; align-items: center;">
    <div style="background: #EF4444; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2px solid #FFFFFF;">
      <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>
    </div>
  </div>
`;

interface MapControllerProps {
  /** Null for a map with no live driver (Ride Details' historical trip). */
  driver: { lat: number; lng: number } | null;
  target?: { lat: number; lng: number } | null;
  /** Trip mode (with `target` as the pickup): frame pickup + destination + route, not the driver. */
  tripDropoff?: { lat: number; lng: number } | null;
  tripRoute?: { lat: number; lng: number }[] | null;
  topInset: number;
  bottomInset: number;
  recenterSignal: number;
  pinLocation?: { lat: number; lng: number } | null;
  pickupLocation?: { lat: number; lng: number } | null;
  routeCoordinates?: { lat: number; lng: number }[] | null;
  onUserMoved?: () => void;
}

/** Imperatively frames the map — Leaflet has no declarative "fit these points" prop. Frames once
 * when a target first appears (or on mount, if there's none), re-frames while a target is active
 * only once the driver has moved meaningfully since the last frame (not on every GPS tick), and
 * re-frames on demand via the compass button's recenterSignal — mirroring the native map and the
 * Passenger app's own web map controller so all three behave the same way. */
function MapController({
  driver,
  target,
  tripDropoff,
  tripRoute,
  topInset,
  bottomInset,
  recenterSignal,
  pinLocation,
  pickupLocation,
  routeCoordinates,
  onUserMoved,
}: MapControllerProps) {
  const map = useMap();
  const driverLat = driver?.lat;
  const driverLng = driver?.lng;
  // Leaflet measures its container once at creation; inside a flex layout that size can be wrong
  // until invalidateSize(). Framing waits for it, so the first fit uses the real map area.
  const [sized, setSized] = useState(false);
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const homeFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const userMovedRef = useRef(false);

  // Only genuine user gestures count — programmatic flyTo/setView also fire zoom/move events.
  useMapEvents({
    dragstart: () => {
      userMovedRef.current = true;
      onUserMoved?.();
    },
  });
  useEffect(() => {
    const el = map.getContainer();
    const onWheel = () => {
      userMovedRef.current = true;
      onUserMoved?.();
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [map, onUserMoved]);

  const frame = (animated: boolean) => {
    const opts = {
      paddingTopLeft: [EDGE_MARGIN, topInset + EDGE_MARGIN] as [number, number],
      paddingBottomRight: [EDGE_MARGIN, bottomInset + EDGE_MARGIN] as [number, number],
    };
    if (pinLocation && (pickupLocation || driver)) {
      // Pin Location mode: frame from pickup (driver) to destination (pinLocation),
      // including any intermediate route coordinates so the entire trip is in view.
      const pickup = pickupLocation || driver!;
      const points: [number, number][] = [
        [pickup.lat, pickup.lng],
        [pinLocation.lat, pinLocation.lng],
      ];
      if (routeCoordinates && routeCoordinates.length > 0) {
        const step = Math.max(1, Math.ceil(routeCoordinates.length / MAX_FIT_ROUTE_POINTS));
        routeCoordinates.forEach((c, i) => {
          if (i % step === 0 || i === routeCoordinates.length - 1) points.push([c.lat, c.lng]);
        });
      }
      const bounds = L.latLngBounds(points);
      if (animated) map.flyToBounds(bounds, { ...opts, duration: 0.6 });
      else map.fitBounds(bounds, opts);
      lastFramedRef.current = null;
      return;
    }
    if (target && tripDropoff) {
      // Trip mode: both stored endpoints always, plus the sampled route when it has loaded.
      const points: [number, number][] = [
        [target.lat, target.lng],
        [tripDropoff.lat, tripDropoff.lng],
      ];
      if (tripRoute && tripRoute.length > 0) {
        const step = Math.max(1, Math.ceil(tripRoute.length / MAX_FIT_ROUTE_POINTS));
        tripRoute.forEach((c, i) => {
          if (i % step === 0 || i === tripRoute.length - 1) points.push([c.lat, c.lng]);
        });
      }
      const bounds = L.latLngBounds(points);
      if (animated) map.flyToBounds(bounds, { ...opts, duration: 0.6 });
      else map.fitBounds(bounds, opts);
      lastFramedRef.current = null;
    } else if (target) {
      const points: [number, number][] = [[target.lat, target.lng]];
      if (driverLat != null && driverLng != null) points.push([driverLat, driverLng]);
      const bounds = L.latLngBounds(points);
      if (animated) map.flyToBounds(bounds, { ...opts, duration: 0.6 });
      else map.fitBounds(bounds, opts);
      lastFramedRef.current = driverLat != null && driverLng != null ? { lat: driverLat, lng: driverLng } : null;
    } else {
      if (driverLat == null || driverLng == null) return;
      // Single point (Home, no ride target) — a plain setView/flyTo centers on the mathematical
      // middle of the WHOLE container, ignoring the header/sheet chrome. Instead, project where
      // the driver's point would render if centered normally, shift that pixel by half the
      // top/bottom inset difference, and center on whatever geographic point lands there —
      // computed from the map's own current projection/zoom, not a guessed offset.
      homeFramedRef.current = { lat: driverLat, lng: driverLng };
      const zoom = 16;
      const driverPixel = map.project(L.latLng(driverLat, driverLng), zoom);
      const verticalOffset = (topInset - bottomInset) / 2;
      const shiftedPixel = L.point(driverPixel.x, driverPixel.y - verticalOffset);
      const center = map.unproject(shiftedPixel, zoom);
      if (animated) map.flyTo(center, zoom, { duration: 0.6 });
      else map.setView(center, zoom);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      setSized(true);
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  // Also re-frames once the caller's real measured insets replace their initial 0 default (e.g.
  // Home's header/sheet report their actual height via onLayout shortly after first mount) —
  // without this, a target-less map (Home) would frame once with no inset data and never correct
  // itself when the real values arrive a moment later.
  // Trip mode also refits once when its route loads (tripRoute), never on GPS ticks.
  useEffect(() => {
    if (!sized) return;
    if (!target && userMovedRef.current && homeFramedRef.current) return;
    frame(false);
    if (!target) lastFramedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sized, target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, tripRoute, topInset, bottomInset]);

  // Home only — re-center when a materially different fix replaces the one Home was framed on
  // (coarse/cached first fix -> real fix); ordinary GPS ticks only move the marker.
  useEffect(() => {
    const framed = homeFramedRef.current;
    if (target || !framed || userMovedRef.current || driverLat == null || driverLng == null) return;
    if (haversineKm(framed, { lat: driverLat, lng: driverLng }) >= HOME_RECENTER_THRESHOLD_KM) frame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLat, driverLng]);

  useEffect(() => {
    if (!target || tripDropoff || !lastFramedRef.current || driverLat == null || driverLng == null) return;
    const moved = haversineKm(lastFramedRef.current, { lat: driverLat, lng: driverLng });
    if (moved >= REFRAME_THRESHOLD_KM) frame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLat, driverLng]);

  useEffect(() => {
    if (recenterSignal > 0) {
      userMovedRef.current = false;
      frame(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterSignal]);

  return null;
}

/** Reports map taps (only mounted when the caller passed `onMapPress`). */
function MapPressHandler({ onMapPress }: { onMapPress: (p: { lat: number; lng: number }) => void }) {
  useMapEvents({ click: (e) => onMapPress({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export default function TrivoraDriverMapWeb({
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
  const [internalRecenterSignal, setInternalRecenterSignal] = useState(0);
  const [isFollowing, setIsFollowing] = useState(true);
  const effectiveRecenterSignal = (externalRecenterSignal ?? 0) + internalRecenterSignal;

  const handleUserMoved = useCallback(() => {
    setIsFollowing(false);
  }, []);

  // Rounded to the nearest 5° so small simulated-GPS heading jitter doesn't rebuild this DOM
  // icon on every tick — imperceptible visually, but cuts marker recreation frequency noticeably.
  const roundedHeading = Math.round((driverLocation?.heading ?? 0) / 5) * 5;
  const driverIcon = useMemo(
    () =>
      L.divIcon({
        html: driverIconHtml(roundedHeading, isOnline),
        className: 'trivora-driver-marker-icon',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    [roundedHeading, isOnline]
  );

  const pickupPinIcon = useMemo(
    () => makeDivIcon(PICKUP_ICON_HTML, 22, true),
    []
  );

  const dropoffPinIcon = useMemo(
    () => makeDivIcon(DROPOFF_ICON_HTML, 32, true),
    []
  );

  const targetIcon = useMemo(() => {
    if (!target) return null;
    return target.kind === 'pickup' ? pickupPinIcon : dropoffPinIcon;
  }, [target?.kind, pickupPinIcon, dropoffPinIcon]);

  const handleRecenter = () => {
    setIsFollowing(true);
    setInternalRecenterSignal((n) => n + 1);
    onRecenter?.();
  };

  // Web (Leaflet) needs a real centre to create the map: the driver, else the ride target (a real
  // booking point). With neither it keeps the existing empty container (the native maps mount
  // immediately — see TrivoraDriverMap.native).
  const initialCenter = driverLocation ?? target;
  if (!initialCenter) {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View style={[styles.container, style]}>
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={16}
        zoomControl={false}
        style={styles.leafletContainer as any}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

        <MapController
          driver={driverLocation}
          target={target}
          tripDropoff={tripDropoff}
          tripRoute={tripDropoff ? routeCoordinates : null}
          topInset={topInset}
          bottomInset={bottomInset}
          recenterSignal={effectiveRecenterSignal}
          pinLocation={pinLocation}
          pickupLocation={pickupLocation}
          routeCoordinates={routeCoordinates}
          onUserMoved={handleUserMoved}
        />

        {isOnline && !target && driverLocation && (
          <Circle
            center={[driverLocation.lat, driverLocation.lng]}
            radius={150}
            pathOptions={{
              color: 'rgba(27, 58, 105, 0.25)',
              fillColor: 'rgba(27, 58, 105, 0.10)',
              fillOpacity: 1,
              weight: 1,
            }}
          />
        )}

        {routeCoordinates && routeCoordinates.length > 1 && (
          <Polyline
            positions={routeCoordinates.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: COLORS.primary,
              weight: 4,
              dashArray: routeSource === 'fallback' ? '8 6' : undefined,
            }}
          />
        )}

        {showDriverMarker && driverLocation && <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />}
        {pickupLocation && <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupPinIcon} />}

        {target && targetIcon && <Marker position={[target.lat, target.lng]} icon={targetIcon} />}
        {tripDropoff && <Marker position={[tripDropoff.lat, tripDropoff.lng]} icon={dropoffPinIcon} />}
        {pinLocation && <Marker position={[pinLocation.lat, pinLocation.lng]} icon={dropoffPinIcon} />}
        {onMapPress && <MapPressHandler onMapPress={onMapPress} />}
      </MapContainer>

      {(focusCurrentLocation || (showCompass && !target)) && (
        <TouchableOpacity
          style={[
            styles.focusButton,
            { bottom: bottomInset + 12 },
            isFollowing && styles.focusButtonActive,
            !driverLocation && styles.focusButtonDisabled,
          ]}
          onPress={handleRecenter}
          disabled={!driverLocation}
          activeOpacity={0.8}
          accessibilityRole="button"
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
  leafletContainer: {
    height: '100%',
    width: '100%',
  },
  focusButton: {
    position: 'absolute',
    right: 16,
    zIndex: 500,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.md,
  },
  focusButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  focusButtonDisabled: {
    opacity: 0.5,
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
    zIndex: 500,
  },
});
