import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Compass } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS } from '../constants/theme';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';
import { haversineKm } from '../utils/geo';

/** Mirrors the native map's re-frame threshold — see TrivoraDriverMap.native.tsx. */
const REFRAME_THRESHOLD_KM = 0.12;
const EDGE_MARGIN = 40;
/** Home only: a later GPS fix this far from where Home was last framed re-centers the camera,
 * until the driver has panned/zoomed themselves — see the native map for the full rationale. */
const HOME_RECENTER_THRESHOLD_KM = 0.15;

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

function targetIconHtml(kind: 'pickup' | 'dropoff'): string {
  if (kind === 'pickup') {
    return `<div style="width:16px;height:16px;border-radius:8px;background:#059669;border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(15,23,42,0.3);"></div>`;
  }
  return `<div style="width:22px;height:22px;border-radius:11px;background:${COLORS.danger};border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(15,23,42,0.3);"></div>`;
}

interface MapControllerProps {
  driverLat: number;
  driverLng: number;
  target?: { lat: number; lng: number } | null;
  topInset: number;
  bottomInset: number;
  recenterSignal: number;
}

/** Imperatively frames the map — Leaflet has no declarative "fit these points" prop. Frames once
 * when a target first appears (or on mount, if there's none), re-frames while a target is active
 * only once the driver has moved meaningfully since the last frame (not on every GPS tick), and
 * re-frames on demand via the compass button's recenterSignal — mirroring the native map and the
 * Passenger app's own web map controller so all three behave the same way. */
function MapController({ driverLat, driverLng, target, topInset, bottomInset, recenterSignal }: MapControllerProps) {
  const map = useMap();
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const homeFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const userMovedRef = useRef(false);

  // Only genuine user gestures count — programmatic flyTo/setView also fire zoom/move events.
  useMapEvents({ dragstart: () => { userMovedRef.current = true; } });
  useEffect(() => {
    const el = map.getContainer();
    const onWheel = () => { userMovedRef.current = true; };
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => el.removeEventListener('wheel', onWheel);
  }, [map]);

  const frame = (animated: boolean) => {
    if (target) {
      const bounds = L.latLngBounds([
        [driverLat, driverLng],
        [target.lat, target.lng],
      ]);
      const opts = {
        paddingTopLeft: [EDGE_MARGIN, topInset + EDGE_MARGIN] as [number, number],
        paddingBottomRight: [EDGE_MARGIN, bottomInset + EDGE_MARGIN] as [number, number],
      };
      if (animated) map.flyToBounds(bounds, { ...opts, duration: 0.6 });
      else map.fitBounds(bounds, opts);
      lastFramedRef.current = { lat: driverLat, lng: driverLng };
    } else {
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
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);

  // Also re-frames once the caller's real measured insets replace their initial 0 default (e.g.
  // Home's header/sheet report their actual height via onLayout shortly after first mount) —
  // without this, a target-less map (Home) would frame once with no inset data and never correct
  // itself when the real values arrive a moment later.
  useEffect(() => {
    if (!target && userMovedRef.current && homeFramedRef.current) return;
    frame(false);
    if (!target) lastFramedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.lat, target?.lng, topInset, bottomInset]);

  // Home only — re-center when a materially different fix replaces the one Home was framed on
  // (coarse/cached first fix -> real fix); ordinary GPS ticks only move the marker.
  useEffect(() => {
    const framed = homeFramedRef.current;
    if (target || !framed || userMovedRef.current) return;
    if (haversineKm(framed, { lat: driverLat, lng: driverLng }) >= HOME_RECENTER_THRESHOLD_KM) frame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLat, driverLng]);

  useEffect(() => {
    if (!target || !lastFramedRef.current) return;
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

export default function TrivoraDriverMapWeb({
  driverLocation,
  isOnline,
  showDriverMarker = true,
  showCompass = true,
  onRecenter,
  target,
  routeCoordinates,
  routeSource,
  topInset = 0,
  bottomInset = 0,
  style,
}: TrivoraDriverMapProps) {
  const [recenterSignal, setRecenterSignal] = useState(0);

  // Rounded to the nearest 5° so small simulated-GPS heading jitter doesn't rebuild this DOM
  // icon on every tick — imperceptible visually, but cuts marker recreation frequency noticeably.
  const roundedHeading = Math.round(driverLocation.heading / 5) * 5;
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

  const targetIcon = useMemo(() => {
    if (!target) return null;
    const size = target.kind === 'pickup' ? 16 : 22;
    return L.divIcon({
      html: targetIconHtml(target.kind),
      className: 'trivora-driver-target-icon',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }, [target?.kind]);

  const handleRecenter = () => {
    setRecenterSignal((n) => n + 1);
    onRecenter?.();
  };

  return (
    <View style={[styles.container, style]}>
      <MapContainer
        center={[driverLocation.lat, driverLocation.lng]}
        zoom={16}
        zoomControl={false}
        style={styles.leafletContainer as any}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

        <MapController
          driverLat={driverLocation.lat}
          driverLng={driverLocation.lng}
          target={target}
          topInset={topInset}
          bottomInset={bottomInset}
          recenterSignal={recenterSignal}
        />

        {isOnline && !target && (
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

        {showDriverMarker && <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon} />}

        {target && targetIcon && <Marker position={[target.lat, target.lng]} icon={targetIcon} />}
      </MapContainer>

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
  leafletContainer: {
    height: '100%',
    width: '100%',
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
