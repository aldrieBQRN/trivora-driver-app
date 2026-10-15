import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DriverProfile } from '../types';

export const DRIVER_SECURE_TOKEN_KEY = 'trivora_driver_auth_token';
export const DRIVER_SESSION_STORAGE_KEY = '@trivora_driver_session';

const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/**
 * Checks whether platform-backed SecureStore is available on the current device/runtime.
 * Resolves true on iOS and Android; false on Web or unsupported environments.
 */
export async function isSecureStorageAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Reads the driver auth token directly from secure storage.
 * Never throws — returns null if unavailable or if read fails.
 * Never logs the token.
 */
export async function getSecureDriverToken(): Promise<string | null> {
  try {
    const available = await isSecureStorageAvailable();
    if (!available) return null;
    return await SecureStore.getItemAsync(DRIVER_SECURE_TOKEN_KEY, SECURE_STORE_OPTIONS);
  } catch {
    return null;
  }
}

/**
 * Stores the driver auth token in platform-backed secure storage.
 * Verifies that the write succeeded by reading the token back before resolving true.
 * Returns false if secure store is unavailable, write fails, or verification fails.
 * Never writes to plaintext AsyncStorage fallback.
 * Never logs the token.
 */
export async function setSecureDriverToken(token: string): Promise<boolean> {
  try {
    const available = await isSecureStorageAvailable();
    if (!available) return false;
    await SecureStore.setItemAsync(DRIVER_SECURE_TOKEN_KEY, token, SECURE_STORE_OPTIONS);
    const verified = await SecureStore.getItemAsync(DRIVER_SECURE_TOKEN_KEY, SECURE_STORE_OPTIONS);
    return verified === token;
  } catch {
    return false;
  }
}

/**
 * Deletes the driver auth token from secure storage.
 */
export async function deleteSecureDriverToken(): Promise<void> {
  try {
    const available = await isSecureStorageAvailable();
    if (available) {
      await SecureStore.deleteItemAsync(DRIVER_SECURE_TOKEN_KEY, SECURE_STORE_OPTIONS);
    }
  } catch {
    // Silent fail on deletion
  }
}

export interface RestoredDriverSession {
  token: string | null;
  driver: DriverProfile | null;
  migrated: boolean;
}

/**
 * Safely restores driver session on app boot:
 * 1. Checks SecureStore for the authentication token.
 * 2. Checks AsyncStorage for cached driver profile and legacy session entries.
 * 3. If a legacy plaintext token is found in AsyncStorage:
 *    - If secure storage is available: attempts to securely store and verify the token.
 *    - Once verified: strips the plaintext token from AsyncStorage, leaving only non-sensitive cached driver data.
 *    - If verification fails: throws an error indicating migration failed (user must sign in again),
 *      and cleans up the legacy entry so bad state does not persist.
 * 4. Ensures no token is ever logged or exposed in error messages.
 */
export async function restoreDriverSession(): Promise<RestoredDriverSession> {
  const secureToken = await getSecureDriverToken();
  const rawSession = await AsyncStorage.getItem(DRIVER_SESSION_STORAGE_KEY);

  let cachedDriver: DriverProfile | null = null;
  let legacyToken: string | null = null;

  if (rawSession) {
    try {
      const parsed = JSON.parse(rawSession);
      if (parsed?.driver) {
        cachedDriver = parsed.driver;
      }
      if (typeof parsed?.token === 'string' && parsed.token.trim().length > 0) {
        legacyToken = parsed.token.trim();
      }
    } catch {
      // Corrupt JSON in AsyncStorage
    }
  }

  // Case 1: Token already present in SecureStore
  if (secureToken) {
    // If a legacy token was lingering in AsyncStorage, sanitize it now
    if (legacyToken) {
      try {
        await AsyncStorage.setItem(
          DRIVER_SESSION_STORAGE_KEY,
          JSON.stringify({ driver: cachedDriver })
        );
      } catch {
        // Non-fatal sanitization error
      }
    }
    return { token: secureToken, driver: cachedDriver, migrated: false };
  }

  // Case 2: No secure token, but legacy token found in AsyncStorage -> Safe Migration
  if (legacyToken) {
    const available = await isSecureStorageAvailable();
    if (available) {
      const ok = await setSecureDriverToken(legacyToken);
      if (ok) {
        // Migration verified! Clean the token out of AsyncStorage immediately
        try {
          await AsyncStorage.setItem(
            DRIVER_SESSION_STORAGE_KEY,
            JSON.stringify({ driver: cachedDriver })
          );
        } catch {
          await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY).catch(() => {});
        }
        return { token: legacyToken, driver: cachedDriver, migrated: true };
      } else {
        // Secure write or verification failed! Do NOT fall back to plaintext token storage.
        // Wipe corrupted entries and inform caller that user must sign in again.
        await deleteSecureDriverToken();
        await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY).catch(() => {});
        throw new Error('Session migration failed: secure storage write could not be verified. Please sign in again.');
      }
    } else {
      // Secure storage unavailable (e.g. web browser without SecureStore)
      // Per security requirement: do NOT silently persist tokens in plaintext.
      // Strip token from AsyncStorage so storage is clean.
      try {
        await AsyncStorage.setItem(
          DRIVER_SESSION_STORAGE_KEY,
          JSON.stringify({ driver: cachedDriver })
        );
      } catch {
        await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY).catch(() => {});
      }
      return { token: legacyToken, driver: cachedDriver, migrated: true };
    }
  }

  // Case 3: No token in either storage
  return { token: null, driver: cachedDriver, migrated: false };
}

/**
 * Fast token retriever for background tasks (e.g., locationTask):
 * 1. Reads from SecureStore.
 * 2. If not found, checks for legacy token in AsyncStorage, safely migrates and verifies it.
 */
export async function getDriverTokenForBackground(): Promise<string | null> {
  const secure = await getSecureDriverToken();
  if (secure) return secure;

  try {
    const raw = await AsyncStorage.getItem(DRIVER_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const legacy = parsed?.token;
    if (typeof legacy === 'string' && legacy.trim().length > 0) {
      const available = await isSecureStorageAvailable();
      if (available) {
        const ok = await setSecureDriverToken(legacy.trim());
        if (ok) {
          // Migrated successfully in background! Strip legacy token from AsyncStorage
          await AsyncStorage.setItem(
            DRIVER_SESSION_STORAGE_KEY,
            JSON.stringify({ driver: parsed?.driver || null })
          ).catch(() => {});
          return legacy.trim();
        }
      } else {
        return legacy.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Persists the session:
 * - Access token -> SecureStore only (if token is provided).
 * - Non-sensitive driver profile -> AsyncStorage only.
 * Returns true if token was securely saved (or token was null).
 */
export async function persistDriverSession(
  driverData: DriverProfile,
  token: string | null
): Promise<boolean> {
  // Always update non-sensitive driver cache in AsyncStorage (without token)
  try {
    await AsyncStorage.setItem(
      DRIVER_SESSION_STORAGE_KEY,
      JSON.stringify({ driver: driverData })
    );
  } catch {
    // AsyncStorage write error
  }

  if (token) {
    const saved = await setSecureDriverToken(token);
    if (!saved && __DEV__) {
      console.warn('[secureStorage] Token could not be written to SecureStore.');
    }
    return saved;
  }

  return true;
}

/**
 * Clears all persisted session data:
 * Removes token from SecureStore and removes session entry from AsyncStorage.
 */
export async function clearDriverSession(): Promise<void> {
  await deleteSecureDriverToken();
  try {
    await AsyncStorage.removeItem(DRIVER_SESSION_STORAGE_KEY);
  } catch {
    // Non-fatal
  }
}
