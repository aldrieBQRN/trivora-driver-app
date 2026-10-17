import { Asset } from 'expo-asset';
// From the package root (its `main`), not per-weight sub-paths, which Metro didn't resolve in
// every project. This file is web-only, so the extra weights it references never reach native.
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { FONT_FAMILY } from '../constants/theme';

const FACES: [number, number][] = [
  [400, PlusJakartaSans_400Regular],
  [500, PlusJakartaSans_500Medium],
  [600, PlusJakartaSans_600SemiBold],
  [700, PlusJakartaSans_700Bold],
  [800, PlusJakartaSans_800ExtraBold],
];

/**
 * Web only: the app.json expo-font plugin bundles the font into the native builds, not the
 * browser. Registers one @font-face per weight under the same family name, so FONT_FAMILY +
 * fontWeight resolve exactly as on Android/iOS.
 */
export function registerWebFonts() {
  if (typeof document === 'undefined' || document.getElementById('trivora-web-fonts')) return;
  const style = document.createElement('style');
  style.id = 'trivora-web-fonts';
  style.textContent = FACES.map(
    ([weight, font]) =>
      `@font-face{font-family:'${FONT_FAMILY}';src:url('${Asset.fromModule(font).uri}') format('truetype');` +
      `font-weight:${weight};font-style:normal;font-display:swap;}`
  ).join('\n');
  document.head.appendChild(style);
}
