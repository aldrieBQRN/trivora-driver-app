export interface RouteLatLng {
  lat: number;
  lng: number;
}

export type RouteSource = 'osrm' | 'fallback';

export interface TargetLocation {
  lat: number;
  lng: number;
  label: string;
  kind: 'pickup' | 'dropoff';
}

/**
 * Canonical prop contract for the Driver map, shared by the native (react-native-maps) and web
 * (Leaflet) implementations — mirrors the Passenger app's TrivoraMap so both apps render the same
 * map system. Used both for the Home screen (just the driver's own live position) and the ride
 * flow (Dispatch/En Route/In Transit), which additionally pass a `target` pickup/dropoff pin and
 * a `routeCoordinates` polyline from the routing service.
 */
export interface TrivoraDriverMapProps {
  driverLocation: { lat: number; lng: number; heading: number };
  isOnline: boolean;
  zoneName?: string;
  showTodaPill?: boolean;
  showCompass?: boolean;
  onTodaPress?: () => void;
  onRecenter?: () => void;
  /** Pickup or drop-off pin for the active ride; omitted on the Home screen. */
  target?: TargetLocation;
  /** Real road-following polyline from the routing service, or a 2-point fallback. */
  routeCoordinates?: RouteLatLng[];
  /** Lets the map render a fallback route as visibly distinct from a real one. */
  routeSource?: RouteSource;
  /** Height, in px, of any opaque/floating chrome covering the TOP of this map (status pill,
   * safe-area inset) — so camera framing keeps markers below it instead of centering on the full
   * screen height as if that chrome weren't there. */
  topInset?: number;
  /** Height, in px, of any opaque/floating chrome covering the BOTTOM of this map (a bottom
   * sheet, nav bar) — same purpose as `topInset`, for the bottom edge. */
  bottomInset?: number;
  style?: any;
}
