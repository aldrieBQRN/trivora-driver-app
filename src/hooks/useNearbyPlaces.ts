import { useState, useEffect, useRef, useCallback } from 'react';
import { NearbyPlace } from '../types';
import { fetchNearbyPlaces } from '../services/api';

interface UseNearbyPlacesProps {
  searchCenter: { lat: number; lng: number } | null;
  radius?: number;
  initialCategory?: string;
  enabled?: boolean;
}

const PRELOAD_CATEGORIES = [
  'restaurants',
  'coffee',
  'hotels',
  'gas_stations',
  'hospitals',
  'schools',
  'banks',
  'shops',
  'government',
  'places',
];

const FETCH_TIMEOUT_MS = 3000;

function matchesCategory(place: NearbyPlace, targetCategory: string): boolean {
  const cat = (place.category || '').toLowerCase();
  switch (targetCategory) {
    case 'restaurants':
      return cat === 'restaurants' || cat === 'restaurant' || cat === 'fast_food';
    case 'coffee':
      return cat === 'coffee' || cat === 'cafe';
    case 'hotels':
      return cat === 'hotels' || cat === 'hotel' || cat === 'motel' || cat === 'guest_house' || cat === 'hostel';
    case 'gas_stations':
      return cat === 'gas_stations' || cat === 'fuel';
    case 'hospitals':
      return cat === 'hospitals' || cat === 'hospital' || cat === 'clinic' || cat === 'pharmacy';
    case 'schools':
      return cat === 'schools' || cat === 'school' || cat === 'college' || cat === 'university' || cat === 'kindergarten';
    case 'banks':
      return cat === 'banks' || cat === 'bank' || cat === 'atm';
    case 'shops':
      return cat === 'shops' || cat === 'shop' || cat === 'supermarket' || cat === 'convenience' || cat === 'department_store';
    case 'government':
      return cat === 'government' || cat === 'townhall' || cat === 'courthouse' || cat === 'police' || cat === 'post_office';
    case 'places':
      return cat === 'places' || cat === 'attraction' || cat === 'viewpoint' || cat === 'park' || cat === 'place_of_worship';
    default:
      return cat === targetCategory;
  }
}

export function useNearbyPlaces({
  searchCenter,
  radius = 2000,
  initialCategory = 'all',
  enabled = true,
}: UseNearbyPlacesProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const selectedCategoryRef = useRef(initialCategory);
  const requestIdRef = useRef(0);
  const memoryCacheRef = useRef<Record<string, NearbyPlace[]>>({});
  const inFlightRef = useRef(false);
  const searchCenterRef = useRef(searchCenter);
  searchCenterRef.current = searchCenter;

  const getCacheKey = useCallback(
    (center: { lat: number; lng: number }, category: string) => {
      return `${category}:${center.lat.toFixed(3)},${center.lng.toFixed(3)}:${radius}`;
    },
    [radius]
  );

  const fetchWithTimeout = useCallback(
    async (params: { latitude: number; longitude: number; radius: number; category: string }) => {
      let timer: any;
      const timeoutPromise = new Promise<NearbyPlace[]>((resolve) => {
        timer = setTimeout(() => resolve([]), FETCH_TIMEOUT_MS);
      });
      try {
        const result = await Promise.race([fetchNearbyPlaces(params), timeoutPromise]);
        clearTimeout(timer);
        return result || [];
      } catch {
        clearTimeout(timer);
        return [];
      }
    },
    []
  );

  const fetchAllAndPartition = useCallback(
    async (center: { lat: number; lng: number }) => {
      if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;

      const allKey = getCacheKey(center, 'all');

      // If already in cache, instantly populate from cache
      if (memoryCacheRef.current[allKey] !== undefined) {
        const currentKey = getCacheKey(center, selectedCategoryRef.current);
        const currentPlaces =
          selectedCategoryRef.current === 'all'
            ? memoryCacheRef.current[allKey]
            : (memoryCacheRef.current[currentKey] ??
              memoryCacheRef.current[allKey].filter((p) => matchesCategory(p, selectedCategoryRef.current)));

        setPlaces(currentPlaces);
        setIsLoading(false);
        return;
      }

      const reqId = ++requestIdRef.current;
      inFlightRef.current = true;
      setIsLoading(true);

      try {
        const results = await fetchWithTimeout({
          latitude: center.lat,
          longitude: center.lng,
          radius,
          category: 'all',
        });

        if (reqId === requestIdRef.current) {
          inFlightRef.current = false;
          // Store 'all' results
          memoryCacheRef.current[allKey] = results;

          // Pre-partition EVERY category into memory cache immediately (even if empty [])
          // This guarantees that clicking ANY category later is 100% 0ms instant with NO spinner!
          PRELOAD_CATEGORIES.forEach((catKey) => {
            const cKey = getCacheKey(center, catKey);
            const subset = results.filter((p) => matchesCategory(p, catKey));
            memoryCacheRef.current[cKey] = subset;
          });

          // Show places for whatever category the user currently has selected
          const activeKey = getCacheKey(center, selectedCategoryRef.current);
          const activePlaces =
            selectedCategoryRef.current === 'all'
              ? results
              : (memoryCacheRef.current[activeKey] ?? []);

          setPlaces(activePlaces);
          setIsLoading(false);
        }
      } catch {
        if (reqId === requestIdRef.current) {
          inFlightRef.current = false;
          memoryCacheRef.current[allKey] = [];
          PRELOAD_CATEGORIES.forEach((catKey) => {
            const cKey = getCacheKey(center, catKey);
            memoryCacheRef.current[cKey] = [];
          });
          setPlaces([]);
          setIsLoading(false);
        }
      }
    },
    [getCacheKey, radius, fetchWithTimeout]
  );

  // Trigger preload when searchCenter is available
  useEffect(() => {
    if (!enabled || !searchCenter) return;

    fetchAllAndPartition(searchCenter);
  }, [enabled, searchCenter?.lat, searchCenter?.lng, fetchAllAndPartition]);

  // When user taps a category chip:
  // Instant 0ms response! If category has items, shows them. If empty, immediately shows empty state.
  const handleSelectCategory = useCallback(
    (category: string) => {
      setSelectedCategory(category);
      selectedCategoryRef.current = category;
      setSelectedPlace(null);

      const center = searchCenterRef.current;
      if (!center || !enabled) return;

      const cacheKey = getCacheKey(center, category);
      const allKey = getCacheKey(center, 'all');

      // 1. Direct hit in preloaded category cache
      if (memoryCacheRef.current[cacheKey] !== undefined) {
        setPlaces(memoryCacheRef.current[cacheKey]);
        setIsLoading(false);
        return;
      }

      // 2. Derive synchronously from preloaded 'all' cache (instant 0ms, no spinner)
      if (memoryCacheRef.current[allKey] !== undefined) {
        const allPlaces = memoryCacheRef.current[allKey];
        const subset = category === 'all'
          ? allPlaces
          : allPlaces.filter((p) => matchesCategory(p, category));
        memoryCacheRef.current[cacheKey] = subset;
        setPlaces(subset);
        setIsLoading(false);
        return;
      }

      // 3. If 'all' is still in flight, keep loading indicator until 'all' completes
      // It will auto-populate this category the moment 'all' finishes!
      if (inFlightRef.current) {
        setIsLoading(true);
        return;
      }

      // 4. Fallback if 'all' hasn't started yet
      fetchAllAndPartition(center);
    },
    [enabled, getCacheKey, fetchAllAndPartition]
  );

  const handleSelectPlace = useCallback((place: NearbyPlace | null) => {
    setSelectedPlace(place);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPlace(null);
  }, []);

  return {
    selectedCategory,
    setSelectedCategory: handleSelectCategory,
    places,
    selectedPlace,
    setSelectedPlace: handleSelectPlace,
    clearSelection,
    isLoading,
  };
}
