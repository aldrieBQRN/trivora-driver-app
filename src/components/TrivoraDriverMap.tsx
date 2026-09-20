import React from 'react';
import { Platform } from 'react-native';
import TrivoraDriverMapWeb from './TrivoraDriverMap.web';
import TrivoraDriverMapNative from './TrivoraDriverMap.native';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

export type { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

/**
 * Driver Home's map — the same map engine and CARTO Voyager visual language as the
 * Passenger app's TrivoraMap (react-native-maps on native, Leaflet on web), scoped to
 * what monitoring your own live position needs rather than a pickup/dropoff route.
 */
export default function TrivoraDriverMap(props: TrivoraDriverMapProps) {
  if (Platform.OS === 'web') {
    return <TrivoraDriverMapWeb {...props} />;
  }
  return <TrivoraDriverMapNative {...props} />;
}
