import { Linking } from 'react-native';

/**
 * Opens the device's default dialer with the given number pre-filled. Returns false when the
 * number is missing/blank or the OS couldn't handle the `tel:` link, so callers can show their
 * own fallback message instead of failing silently.
 */
export async function callPhoneNumber(phoneNumber?: string | null): Promise<boolean> {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) return false;
  try {
    await Linking.openURL(`tel:${trimmed}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the device's default SMS app with the given number pre-filled. Returns false when the
 * number is missing/blank or the OS couldn't handle the `sms:` link.
 */
export async function messagePhoneNumber(phoneNumber?: string | null): Promise<boolean> {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) return false;
  try {
    await Linking.openURL(`sms:${trimmed}`);
    return true;
  } catch {
    return false;
  }
}
