import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Compass, LocateFixed } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../constants/theme';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';
import { haversineKm } from '../utils/geo';
import {
  MAP_STYLES,
  ACTIVE_RIDE_PITCH,
  TOP_DOWN_PITCH,
  MapVariant,
  boundsOf,
} from '../constants/openFreeMap';

const TRICYCLE_MARKER_IMAGE = require('../../assets/images/tricycle-marker.webp');
const tricycleUri: string =
  typeof TRICYCLE_MARKER_IMAGE === 'string'
    ? TRICYCLE_MARKER_IMAGE
    : TRICYCLE_MARKER_IMAGE?.default || TRICYCLE_MARKER_IMAGE?.uri || String(TRICYCLE_MARKER_IMAGE);

const REFRAME_THRESHOLD_KM = 0.12;
const EDGE_MARGIN = 40;
const HOME_RECENTER_THRESHOLD_KM = 0.15;
const MAX_FIT_ROUTE_POINTS = 40;

export function driverIconHtml(heading: number, isOnline: boolean, uri: string): string {
  const filter = isOnline
    ? 'filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));'
    : 'filter: grayscale(100%) opacity(0.55);';
  return `
    <div style="width:45px;height:30px;display:flex;align-items:center;justify-content:center;${filter}transform:rotate(${heading}deg);">
      <img src="${uri}" alt="Tricycle" style="width:45px;height:30px;object-fit:contain;pointer-events:none;" />
    </div>
  `;
}

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
  mapVariant,
  mapStyleUrl,
  pitch,
  style,
}: TrivoraDriverMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const effectiveVariant: MapVariant = mapVariant ?? (pitch && pitch > 0 ? 'liberty' : 'bright');
  const effectiveMapStyle = mapStyleUrl ?? MAP_STYLES[effectiveVariant];
  const effectivePitch = pitch ?? (effectiveVariant === 'liberty' ? ACTIVE_RIDE_PITCH : TOP_DOWN_PITCH);

  const [isFollowing, setIsFollowing] = useState(true);
  const isFollowingRef = useRef(true);
  const userMovedRef = useRef(false);
  const homeFramedRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFramedRef = useRef<{ lat: number; lng: number } | null>(null);

  const edgePadding = useMemo(
    () => ({
      top: topInset + EDGE_MARGIN,
      right: EDGE_MARGIN,
      bottom: bottomInset + EDGE_MARGIN,
      left: EDGE_MARGIN,
    }),
    [topInset, bottomInset]
  );

  const tripFitPadding = useMemo(
    () => ({
      top: topInset + 20,
      right: 32,
      bottom: bottomInset + 32,
      left: 32,
    }),
    [topInset, bottomInset]
  );

  const isFallbackRoute = routeSource === 'fallback';

  // Markers refs
  const driverMarkerRef = useRef<maplibregl.Marker | null>(null);
  const targetMarkerRef = useRef<maplibregl.Marker | null>(null);
  const tripDropoffMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pickupMarkerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Sync route layer helper
  const syncRouteLayer = useCallback(
    (map: maplibregl.Map, coords: { lat: number; lng: number }[], fallback: boolean) => {
      if (!map.isStyleLoaded()) return;
      const lineCoords = (coords || []).map((c) => [c.lng, c.lat]);
      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: lineCoords },
      };

      const source = map.getSource('driver-route') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else if (lineCoords.length > 0) {
        map.addSource('driver-route', { type: 'geojson', data });
        map.addLayer({
          id: 'driver-route-line',
          type: 'line',
          source: 'driver-route',
          layout: {
            'line-join': 'round',
            'line-cap': fallback ? 'butt' : 'round',
          },
          paint: fallback
            ? { 'line-color': '#94A3B8', 'line-width': 4, 'line-dasharray': [2, 1.5] }
            : { 'line-color': '#2563EB', 'line-width': 5 },
        });
      }
    },
    []
  );

  // Initialize MapLibre GL map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialPoint = driverLocation
      ? { lat: driverLocation.lat, lng: driverLocation.lng }
      : target
        ? { lat: target.lat, lng: target.lng }
        : { lat: 14.0718, lng: 120.6325 };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: effectiveMapStyle,
      center: [initialPoint.lng, initialPoint.lat],
      zoom: 16,
      pitch: effectivePitch,
      bearing: 0,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

    map.on('load', () => {
      setMapReady(true);
      syncRouteLayer(map, routeCoordinates || [], isFallbackRoute);
    });

    map.on('style.load', () => {
      syncRouteLayer(map, routeCoordinates || [], isFallbackRoute);
    });

    map.on('styleimagemissing', (e: { id: string }) => {
      const id = e?.id;
      if (id && !map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    map.on('dragstart', () => {
      userMovedRef.current = true;
      if (!target) {
        isFollowingRef.current = false;
        setIsFollowing(false);
      }
    });

    mapRef.current = map;

    return () => {
      driverMarkerRef.current?.remove();
      targetMarkerRef.current?.remove();
      tripDropoffMarkerRef.current?.remove();
      pickupMarkerRef.current?.remove();
      pinMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Update onMapPress click handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handler = (e: maplibregl.MapMouseEvent) => {
      if (onMapPress) {
        onMapPress({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    };

    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [onMapPress]);

  // Update style when effectiveMapStyle changes
  const currentStyleUrlRef = useRef(effectiveMapStyle);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (currentStyleUrlRef.current !== effectiveMapStyle) {
      currentStyleUrlRef.current = effectiveMapStyle;
      map.setStyle(effectiveMapStyle);
    }
  }, [effectiveMapStyle, mapReady]);

  // Update pitch when effectivePitch changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.easeTo({ pitch: effectivePitch, duration: 400 });
  }, [effectivePitch, mapReady]);

  // Sync route coordinates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    syncRouteLayer(map, routeCoordinates || [], isFallbackRoute);
  }, [routeCoordinates, isFallbackRoute, mapReady, syncRouteLayer]);

  // Driver vehicle marker
  const roundedHeading = driverLocation ? Math.round(driverLocation.heading / 5) * 5 : 0;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (showDriverMarker && driverLocation) {
      if (!driverMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'trivora-driver-marker-icon';
        el.innerHTML = driverIconHtml(roundedHeading, isOnline, tricycleUri);
        driverMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([driverLocation.lng, driverLocation.lat])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([driverLocation.lng, driverLocation.lat]);
        const el = driverMarkerRef.current.getElement();
        if (el) el.innerHTML = driverIconHtml(roundedHeading, isOnline, tricycleUri);
      }
    } else if (driverMarkerRef.current) {
      driverMarkerRef.current.remove();
      driverMarkerRef.current = null;
    }
  }, [showDriverMarker, driverLocation?.lat, driverLocation?.lng, roundedHeading, isOnline]);

  // Target pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (target) {
      const isPickup = target.kind === 'pickup';
      const iconHtml = isPickup ? PICKUP_ICON_HTML : DROPOFF_ICON_HTML;

      if (!targetMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'trivora-marker-icon';
        el.innerHTML = iconHtml;
        targetMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([target.lng, target.lat])
          .addTo(map);
      } else {
        targetMarkerRef.current.setLngLat([target.lng, target.lat]);
        const el = targetMarkerRef.current.getElement();
        if (el) el.innerHTML = iconHtml;
      }
    } else if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }
  }, [target?.lat, target?.lng, target?.kind]);

  // Trip dropoff pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tripDropoff) {
      if (!tripDropoffMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'trivora-marker-icon';
        el.innerHTML = DROPOFF_ICON_HTML;
        tripDropoffMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([tripDropoff.lng, tripDropoff.lat])
          .addTo(map);
      } else {
        tripDropoffMarkerRef.current.setLngLat([tripDropoff.lng, tripDropoff.lat]);
      }
    } else if (tripDropoffMarkerRef.current) {
      tripDropoffMarkerRef.current.remove();
      tripDropoffMarkerRef.current = null;
    }
  }, [tripDropoff?.lat, tripDropoff?.lng]);

  // Pickup location marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pickupLocation) {
      if (!pickupMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'trivora-marker-icon';
        el.innerHTML = PICKUP_ICON_HTML;
        pickupMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pickupLocation.lng, pickupLocation.lat])
          .addTo(map);
      } else {
        pickupMarkerRef.current.setLngLat([pickupLocation.lng, pickupLocation.lat]);
      }
    } else if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }
  }, [pickupLocation?.lat, pickupLocation?.lng]);

  // Pin location marker (manual ride destination pin)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (pinLocation) {
      if (!pinMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'trivora-marker-icon';
        el.innerHTML = DROPOFF_ICON_HTML;
        pinMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([pinLocation.lng, pinLocation.lat])
          .addTo(map);
      } else {
        pinMarkerRef.current.setLngLat([pinLocation.lng, pinLocation.lat]);
      }
    } else if (pinMarkerRef.current) {
      pinMarkerRef.current.remove();
      pinMarkerRef.current = null;
    }
  }, [pinLocation?.lat, pinLocation?.lng]);

  // Camera framing logic
  const frameRelevantPoints = useCallback(
    (animated: boolean) => {
      const map = mapRef.current;
      if (!map) return;

      const duration = animated ? 500 : 0;

      // Dispatch / request screen: frame entire trip (target pickup + tripDropoff + route)
      if (target && tripDropoff) {
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
        const b = boundsOf(points);
        map.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: tripFitPadding, pitch: effectivePitch, duration }
        );
        lastFramedRef.current = driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
        return;
      }

      // Ride target (e.g. En route pickup or in-transit dropoff)
      if (target) {
        if (!driverLocation) {
          map.easeTo({ center: [target.lng, target.lat], zoom: 16, padding: { top: 0, right: 0, bottom: 0, left: 0 }, pitch: effectivePitch, duration });
        } else {
          const b = boundsOf([
            { lat: target.lat, lng: target.lng },
            { lat: driverLocation.lat, lng: driverLocation.lng },
          ]);
          map.fitBounds(
            [
              [b[0], b[1]],
              [b[2], b[3]],
            ],
            { padding: edgePadding, pitch: effectivePitch, duration }
          );
        }
        lastFramedRef.current = driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null;
        return;
      }

      // Home (no target): center on driver's own position
      if (driverLocation) {
        homeFramedRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
        map.easeTo({
          center: [driverLocation.lng, driverLocation.lat],
          zoom: 16,
          padding: edgePadding,
          pitch: effectivePitch,
          duration,
        });
      }
    },
    [target, tripDropoff, routeCoordinates, driverLocation, tripFitPadding, edgePadding, effectivePitch]
  );

  // Auto-frame on target / dropoff changes
  useEffect(() => {
    if (!mapReady) return;
    frameRelevantPoints(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, target?.lat, target?.lng, tripDropoff?.lat, tripDropoff?.lng, topInset, bottomInset]);

  // Recenter signals
  useEffect(() => {
    if (!mapReady || externalRecenterSignal === undefined) return;
    frameRelevantPoints(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalRecenterSignal]);

  // Follow driver during ride
  useEffect(() => {
    if (!mapReady || !target || !driverLocation || !lastFramedRef.current) return;
    const moved = haversineKm(lastFramedRef.current, driverLocation);
    if (moved >= REFRAME_THRESHOLD_KM) frameRelevantPoints(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverLocation?.lat, driverLocation?.lng]);

  // Follow driver on Home
  useEffect(() => {
    if (!mapReady || target || !driverLocation || !isFollowingRef.current) return;
    const framed = homeFramedRef.current;
    if (!framed) {
      frameRelevantPoints(false);
      return;
    }
    const moved = haversineKm(framed, driverLocation);
    if (moved >= HOME_RECENTER_THRESHOLD_KM) {
      frameRelevantPoints(true);
    }
  }, [driverLocation?.lat, driverLocation?.lng, mapReady, target, frameRelevantPoints]);

  const handleFocus = () => {
    if (!driverLocation) return;
    userMovedRef.current = false;
    isFollowingRef.current = true;
    setIsFollowing(true);
    frameRelevantPoints(true);
  };

  const handleRecenter = () => {
    userMovedRef.current = false;
    isFollowingRef.current = true;
    setIsFollowing(true);
    frameRelevantPoints(true);
    if (onRecenter) onRecenter();
  };

  return (
    <View style={[styles.container, style]}>
      {/* MapLibre Web GL Map Container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />

      {/* Focus Current Location Button (Home only) */}
      {focusCurrentLocation && !target && (
        <TouchableOpacity
          style={[styles.focusButton, { bottom: bottomInset + 12 }, isFollowing && styles.focusButtonActive]}
          onPress={handleFocus}
          activeOpacity={0.8}
          accessibilityLabel="Focus current location"
        >
          <LocateFixed size={18} color={isFollowing ? '#FFFFFF' : COLORS.primary} />
        </TouchableOpacity>
      )}

      {/* Floating Compass / Recenter Button */}
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
    zIndex: 10,
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
    zIndex: 10,
  },
});
