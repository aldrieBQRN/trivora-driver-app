import { useCallback, useState } from 'react';
import * as Location from 'expo-location';

export interface CurrentLocationCoords {
  lat: number;
  lng: number;
}

interface UseCurrentLocationResult {
  isLocating: boolean;
  /** Set only when a fetch actually failed (permission denied, GPS unavailable) — callers can
   * surface this to explain why no real position is available yet. */
  error: string | null;
  requestCurrentLocation: () => Promise<CurrentLocationCoords | null>;
}

/**
 * One-shot device GPS fetch, gating on foreground permission first. Never throws — a denied
 * permission or a GPS failure resolves null so callers can show an honest "location unavailable"
 * state instead of substituting a fake position. Identical in shape and behavior to the Passenger
 * app's own `useCurrentLocation` (same permission-gating approach, same Accuracy.Balanced choice)
 * so both apps obtain real GPS the same reliable way — this is the Driver app's own copy since the
 * two apps share no code, not a divergent implementation.
 */
export function useCurrentLocation(): UseCurrentLocationResult {
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCurrentLocation = useCallback(async (): Promise<CurrentLocationCoords | null> => {
    setIsLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission was not granted.');
        return null;
      }

      // Step 1: Check instant hardware cache (< 50ms)
      const lastKnown = await Location.getLastKnownPositionAsync().catch(() => null);
      if (lastKnown?.coords) {
        setIsLocating(false);
        return { lat: lastKnown.coords.latitude, lng: lastKnown.coords.longitude };
      }

      // Step 2: Fresh fix with a strict 6-second timeout so it never hangs
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000));
      const freshPosition = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        timeoutPromise,
      ]);

      if (freshPosition && 'coords' in freshPosition) {
        return { lat: freshPosition.coords.latitude, lng: freshPosition.coords.longitude };
      }

      // Step 3: Safe municipal center fallback (Nasugbu town center)
      return { lat: 14.0725, lng: 120.6322 };
    } catch {
      setError('Could not determine your current location.');
      return { lat: 14.0725, lng: 120.6322 };
    } finally {
      setIsLocating(false);
    }
  }, []);

  return { isLocating, error, requestCurrentLocation };
}
