/**
 * OpenFreeMap vector tile styles for MapLibre Native in Trivora Driver App.
 * OpenFreeMap provides free, open-source vector map tiles powered by OpenStreetMap data.
 */
export const OPENFREEMAP_BRIGHT_STYLE = 'https://tiles.openfreemap.org/styles/bright';
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export type MapVariant = 'bright' | 'liberty';

export const MAP_STYLES: Record<MapVariant, string> = {
  bright: OPENFREEMAP_BRIGHT_STYLE,
  liberty: OPENFREEMAP_LIBERTY_STYLE,
};

/** 3D camera pitch for active ride tracking / navigation screens (approx 45° to 55°). */
export const ACTIVE_RIDE_PITCH = 50;

/** 2D top-down camera pitch for Home, Pin Location, and dispatch screens. */
export const TOP_DOWN_PITCH = 0;

/** [west, south, east, north] around points. */
export function boundsOf(points: { lat: number; lng: number }[]): [number, number, number, number] {
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
