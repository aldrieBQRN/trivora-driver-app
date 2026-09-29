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
 * Canonical prop contract for the Driver map, shared by the native (MapLibre) and web
 * (Leaflet) implementations — mirrors the Passenger app's TrivoraMap so both apps render the same
 * map system. Used both for the Home screen (just the driver's own live position) and the ride
 * flow (Dispatch/En Route/In Transit), which additionally pass a `target` pickup/dropoff pin and
 * a `routeCoordinates` polyline from the routing service.
 */
export interface TrivoraDriverMapProps {
  /** The driver's real GPS position, or null while the first fix hasn't arrived yet. The map
   * mounts either way — tiles start loading immediately — and the marker/camera follow once a
   * real position exists. Never substitute a guessed coordinate. */
  driverLocation: { lat: number; lng: number; heading: number } | null;
  isOnline: boolean;
  /** Draw the driver's own tricycle marker. Default true; the Dispatch/request screen turns it off
   * so its background map shows only the passenger's pickup -> destination trip. */
  showDriverMarker?: boolean;
  showCompass?: boolean;
  /** When true, renders a Focus Current Location button on Home screen matching Passenger app. */
  focusCurrentLocation?: boolean;
  onRecenter?: () => void;
  /** Signal incremented to re-center/fit the map camera programmatically from a parent component. */
  recenterSignal?: number;
  /** Pickup or drop-off pin for the active ride; omitted on the Home screen. */
  target?: TargetLocation;
  /** Trip destination shown alongside `target` (the pickup) on the Dispatch/request screen, so the
   * whole pickup -> destination trip is framed and both static pins are drawn. */
  tripDropoff?: { lat: number; lng: number };
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
  /** Optional: called with the tapped map coordinate (Manual Ride "pin the destination"). Absent
   * everywhere else, so every existing map behaves exactly as before. */
  onMapPress?: (point: RouteLatLng) => void;
  /** Optional destination pin drawn without moving the camera (unlike `target`, which reframes) —
   * so tapping to place / move the pin never makes the map jump. */
  pinLocation?: RouteLatLng | null;
  /** Optional pickup pin (green pin) drawn at a specific location — used e.g. in DestinationPinModal
   * where the driver's location is the pickup point and represented as a green pickup pin instead of
   * the vehicle marker. */
  pickupLocation?: RouteLatLng | null;
  style?: any;
}
