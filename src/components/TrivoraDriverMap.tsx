import React from 'react';
import { Platform } from 'react-native';
import { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

export type { TrivoraDriverMapProps } from './TrivoraDriverMap.types';

/**
 * Driver Home's map — delegates to native (MapLibre) on Android/iOS, and web (OpenFreeMap) on Web.
 */
export default function TrivoraDriverMap(props: TrivoraDriverMapProps) {
  if (Platform.OS === 'web') {
    const Component = require('./TrivoraDriverMap.web').default;
    return <Component {...props} />;
  }
  const Component = require('./TrivoraDriverMap.native').default;
  return <Component {...props} />;
}
