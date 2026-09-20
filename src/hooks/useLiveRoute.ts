import { useEffect, useRef, useState } from 'react';
import { fetchRoute, RouteCoordinate, RouteSource } from '../services/routingService';
import { haversineKm, GeoPoint } from '../utils/geo';

/** How far the driver must move from the route's last-fetched origin before it's worth asking
 * the routing service for a new one. Small enough that the drawn line never drifts far from the
 * driver marker, large enough that normal GPS jitter (a few meters per tick) doesn't trigger a
 * network request on every update. */
const REROUTE_THRESHOLD_KM = 0.05;

interface LiveRoute {
  coordinates: RouteCoordinate[];
  source: RouteSource;
}

/**
 * A driver->target route that tracks the driver's actual current position instead of freezing at
 * whichever origin happened to be current when the target first appeared. Previously, both
 * DriverEnRoutePickupScreen and DriverInTransitScreen fetched the route once in a `useEffect`
 * keyed only on the target's coordinates, closing over `currentLat`/`currentLng` at that instant —
 * as the driver's GPS moved (DriverShiftContext's simulated position ticks every 6s), the drawn
 * route kept starting from that stale origin forever, while the driver marker itself moved freely
 * away from it.
 *
 * This refetches whenever the target changes (a new pickup/drop-off — always, regardless of how
 * close the driver is to their last position) or whenever the driver has moved a meaningful
 * distance from the route's last-used origin. It intentionally does NOT refetch on every GPS tick.
 */
export function useLiveRoute(origin: GeoPoint | null, target: GeoPoint | null): LiveRoute | null {
  const [route, setRoute] = useState<LiveRoute | null>(null);
  const requestIdRef = useRef(0);
  const lastFetchRef = useRef<{ origin: GeoPoint; target: GeoPoint } | null>(null);

  useEffect(() => {
    if (!origin || !target) {
      setRoute(null);
      lastFetchRef.current = null;
      return;
    }

    const last = lastFetchRef.current;
    const targetChanged = !last || last.target.lat !== target.lat || last.target.lng !== target.lng;
    const movedMeaningfully = !last || haversineKm(last.origin, origin) >= REROUTE_THRESHOLD_KM;

    if (!targetChanged && !movedMeaningfully) return;

    let cancelled = false;
    const requestId = ++requestIdRef.current;
    lastFetchRef.current = { origin, target };

    fetchRoute(origin, target).then((result) => {
      if (cancelled || requestId !== requestIdRef.current) return;
      setRoute({ coordinates: result.coordinates, source: result.source });
    });

    return () => {
      cancelled = true;
    };
  }, [origin?.lat, origin?.lng, target?.lat, target?.lng]);

  return route;
}
