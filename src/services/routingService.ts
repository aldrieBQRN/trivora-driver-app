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
    coordinates: [origin, destination],
    distanceKm: Number(distanceKm.toFixed(2)),
    durationMinutes,
    source: 'fallback',
  };
}

/**
 * Fetches a real road-following route from OSRM's public routing server — the same service and
 * fallback strategy as the Passenger app's routingService, so both apps draw routes the same way.
 * Never rejects — any failure (timeout, non-200, malformed body, OSRM's own error code) resolves
 * a straight-line haversine fallback instead, tagged `source: 'fallback'`. Successful results are
 * cached; fallback results are not, so a later retry can still succeed once connectivity returns.
 */
export async function fetchRoute(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
  opts?: { timeoutMs?: number }
): Promise<RouteResult> {
  const key = routeCacheKey(origin, destination);
  const cached = routeCache.get(key);
  if (cached) return cached;

  const timeoutMs = opts?.timeoutMs ?? 6000;
  const url = `${OSRM_ROUTE_URL}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);

    const data = await response.json();
    const route = data?.routes?.[0];
    if (data?.code !== 'Ok' || !route?.geometry?.coordinates) {
      throw new Error('OSRM: no route found');
    }

    const coordinates: RouteCoordinate[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    const result: RouteResult = {
      coordinates,
      distanceKm: Number((route.distance / 1000).toFixed(2)),
      durationMinutes: Math.max(1, Math.round(route.duration / 60)),
      source: 'osrm',
    };
    cacheSet(routeCache, key, result);
    return result;
  } catch {
    return buildFallbackRoute(origin, destination);
  }
}
