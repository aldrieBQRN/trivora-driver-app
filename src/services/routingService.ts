import { haversineKm } from '../utils/geo';

export interface RouteCoordinate {
  lat: number;
  lng: number;
}

export type RouteSource = 'osrm' | 'fallback';

export interface RouteResult {
  coordinates: RouteCoordinate[];
  distanceKm: number;
  durationMinutes: number;
  source: RouteSource;
}

const OSRM_ROUTE_URL = 'https://router.project-osrm.org/route/v1/driving';

const MAX_CACHE_ENTRIES = 200;
const routeCache = new Map<string, RouteResult>();

function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

function cacheSet<T>(cache: Map<string, T>, key: string, value: T) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(key, value);
}

function routeCacheKey(origin: RouteCoordinate, destination: RouteCoordinate): string {
  return `${round5(origin.lat)},${round5(origin.lng)}|${round5(destination.lat)},${round5(destination.lng)}`;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackRoute(origin: RouteCoordinate, destination: RouteCoordinate): RouteResult {
  const distanceKm = haversineKm(origin, destination);
  const durationMinutes = Math.max(1, Math.round((distanceKm / 20) * 60));
  return {
    // Deliberately EMPTY: a straight line between the points is not a road route and would
    // mislead. distance/duration below stay as estimates for the fare/ETA; the map draws no line.
    coordinates: [],
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMinutes,
    source: 'fallback',
  };
}

/** OSRM's `nearest` service — resolves a point to the closest routable road location. */
const OSRM_NEAREST_URL = 'https://router.project-osrm.org/nearest/v1/driving';
/** Beyond this the "nearest road" is treated as unavailable routing — never bridged with a huge
 * artificial access line. */
const SNAP_MAX_METERS = 500;
/** Consecutive geometry points closer than this (meters) are the same point (dedupe). */
const SAME_POINT_METERS = 0.5;
/** Assumed speed for the ETA of an endpoint access segment — matches the app's 20 km/h estimate. */
const ACCESS_SPEED_MPS = 20 / 3.6;

function haversineMeters(a: RouteCoordinate, b: RouteCoordinate): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Snaps a point to the nearest routable road via OSRM `nearest`. Returns the road point and the
 * REAL distance (haversine between the original and snapped coordinates) — not a fixed value.
 * Null = snapping failed or the road is farther than SNAP_MAX_METERS, both meaning "routing
 * unavailable" to the caller. The visible marker is never moved by this.
 */
async function snapToRoad(
  point: RouteCoordinate,
  timeoutMs: number
): Promise<{ point: RouteCoordinate; distanceMeters: number } | null> {
  try {
    const response = await fetchWithTimeout(`${OSRM_NEAREST_URL}/${point.lng},${point.lat}?number=1`, timeoutMs);
    if (!response.ok) return null;
    const data = await response.json();
    const loc = data?.code === 'Ok' ? data?.waypoints?.[0]?.location : null;
    if (!Array.isArray(loc) || loc.length < 2) return null;
    const snapped = { lat: Number(loc[1]), lng: Number(loc[0]) };
    if (!Number.isFinite(snapped.lat) || !Number.isFinite(snapped.lng)) return null;
    const distanceMeters = haversineMeters(point, snapped);
    if (distanceMeters > SNAP_MAX_METERS) return null;
    return { point: snapped, distanceMeters };
  } catch {
    return null;
  }
}

/** Drops consecutive points that are effectively the same coordinate. */
function dedupeConsecutive(points: RouteCoordinate[]): RouteCoordinate[] {
  const out: RouteCoordinate[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || haversineMeters(last, p) > SAME_POINT_METERS) out.push(p);
  }
  return out;
}

/**
 * Builds a road route whose geometry runs from the EXACT origin to the EXACT destination:
 *
 *   [origin, snappedOrigin, ...OSRM road geometry..., snappedDestination, destination]
 *
 * Each endpoint is resolved to its nearest routable road point (OSRM `nearest`); the main journey
 * is OSRM's road geometry between the two snapped points, used exactly as returned. The two
 * access legs (exact point <-> road point) are sized by the real coordinate distance, never a
 * fixed value, and are only endpoint connections — never a substitute for the road route.
 * Distance = origin access + OSRM route + destination access (each counted once); duration adds
 * the access legs at the app's 20 km/h estimate.
 *
 * Never rejects. Routing is "unavailable" — EMPTY geometry, tagged source 'fallback', with only
 * the app's existing haversine distance/duration estimate so fare/ETA behave as before — when
 * snapping fails, a snap exceeds SNAP_MAX_METERS, OSRM finds no route, or origin and destination
 * are the same point. No straight line is ever drawn. Successful results are cached; unavailable
 * ones are not, so a retry can succeed once connectivity returns.
 */
export async function fetchRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  opts?: { timeoutMs?: number }
): Promise<RouteResult> {
  const key = routeCacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached) return cached;

  if (haversineMeters(origin, destination) <= SAME_POINT_METERS) {
    return buildFallbackRoute(origin, destination);
  }

  const timeoutMs = opts?.timeoutMs ?? 6000;

  try {
    const [snappedOrigin, snappedDest] = await Promise.all([
      snapToRoad(origin, timeoutMs),
      snapToRoad(destination, timeoutMs),
    ]);
    if (!snappedOrigin || !snappedDest) throw new Error('No routable road near an endpoint');

    const url = `${OSRM_ROUTE_URL}/${snappedOrigin.point.lng},${snappedOrigin.point.lat};${snappedDest.point.lng},${snappedDest.point.lat}?overview=full&geometries=geojson`;
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

    const data = await response.json();
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || !route?.geometry?.coordinates) {
      throw new Error('OSRM: no route found');
    }

    const roadGeometry: RouteCoordinate[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    const coordinates = dedupeConsecutive([
      { lat: origin.lat, lng: origin.lng },
      snappedOrigin.point,
      ...roadGeometry,
      snappedDest.point,
      { lat: destination.lat, lng: destination.lng },
    ]);

    const accessMeters = snappedOrigin.distanceMeters + snappedDest.distanceMeters;
    const result: RouteResult = {
      coordinates,
      distanceKm: Number(((route.distance + accessMeters) / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round((route.duration + accessMeters / ACCESS_SPEED_MPS) / 60)),
      source: 'osrm',
    };
    cacheSet(routeCache, key, result);
    return result;
  } catch {
    return buildFallbackRoute(origin, destination);
  }
}
