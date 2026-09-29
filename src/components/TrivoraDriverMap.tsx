import React from 'react';
import { Platform } from 'react-native';
import TrivoraDriverMapWeb from './TrivoraDriverMap.web';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

// The native map (MapLibre) is only required on native: MapLibre touches native TurboModules at
// import time, which don't exist on web, so importing it eagerly would crash the web build.
const TrivoraDriverMapNative: typeof import('./TrivoraDriverMap.native').default | null =
  Platform.OS === 'web' ? null : require('./TrivoraDriverMap.native').default;

export type { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

/**
 * Driver Home's map — the same map engine and CARTO Voyager visual language as the
 * Passenger app's TrivoraMap (MapLibre on native, Leaflet on web), scoped to
 * what monitoring your own live position needs rather than a pickup/dropoff route.
 */
export default function TrivoraDriverMap(props: TrivoraDriverMapProps) {
  if (Platform.OS === 'web') {
    return <TrivoraDriverMapWeb {...props} />;
  }
  return TrivoraDriverMapNative ? <TrivoraDriverMapNative {...props} /> : null;
}
