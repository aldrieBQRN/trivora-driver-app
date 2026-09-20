import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { driverApi, setAuthToken } from '../services/api';

/**
 * Real background GPS delivery for the driver shift watcher (DriverShiftContext), using
 * Location.startLocationUpdatesAsync + this TaskManager task instead of watchPositionAsync —
 * watchPositionAsync only runs while the app's JS is alive in the foreground; the OS suspends it
 * the moment the app backgrounds. This task keeps receiving fixes (subject to OS/platform
 * restrictions — see the caller) while backgrounded or screen-locked.
 *
 * defineTask() must run once at module load, before startLocationUpdatesAsync() is ever called —
 * importing this file (for its exported constants) from DriverShiftContext.tsx, which itself
 * loads early as a top-level provider, is what guarantees that ordering here.
 *
 * This task executes OUTSIDE the React tree — it cannot read component state or the in-memory
 * authToken that api.ts's module scope holds (a headless relaunch after the OS kills the app
 * starts that module state fresh at null). Everything the task needs (auth token, whether mobile
 * GPS tracking is even the active mode, and the 60s send cadence / 1-slot pending-ping resilience
 * DriverShiftContext already uses in the foreground) is instead read from/written to
 * AsyncStorage, so the task is fully self-contained.
 */

export const LOCATION_TASK_NAME = 'trivora-driver-location-task';
// Emitted on every fix so DriverShiftContext can keep the on-screen map/speed readout live
// whenever the app happens to be in the foreground — this task is the single location source for
// native; nothing else subscribes to the OS location APIs, so there is exactly one native GPS
// watcher per shift, not two.
export const LOCATION_EVENT_NAME = 'trivora:location-update';

// Must match DriverAuthContext.tsx's own key exactly — this task reads the same persisted
// session, it does not create a second one.
const SESSION_STORAGE_KEY = '@trivora_driver_session';
export const TRACKING_MODE_STORAGE_KEY = '@trivora_tracking_mode';
// Mirrors DriverShiftContext's `isOnline` state. Checked on every task invocation (see below) as
// a self-healing safety net: if the app is force-quit while online, no cleanup ever runs, and
// this task — a persistent OS-level registration — would otherwise keep firing and draining
// battery indefinitely even if the app is never reopened. The very next scheduled invocation
// (up to 60s later) notices the mismatch and stops itself. DriverShiftContext additionally
// double-checks for an orphaned task on its own startup, in case the driver reopens the app
// before that next tick fires.
export const IS_ONLINE_STORAGE_KEY = '@trivora_is_online';
const PENDING_PING_STORAGE_KEY = '@trivora_bg_pending_ping';
const LAST_SENT_AT_STORAGE_KEY = '@trivora_bg_last_sent_at';
// Kept identical to DriverShiftContext's WATCH_TIME_INTERVAL_MS by contract (both are the fixed
// project-wide 60s GPS interval) — not imported directly to keep this task file free of any
// dependency on the React context module.
const SEND_INTERVAL_MS = 60000;

type Ping = {
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_deg: number;
  recorded_at: string;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    if (__DEV__) console.warn('[telemetry:bg] task error:', error.message);
    return;
  }

  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  const latest = locations && locations[locations.length - 1];
  if (!latest) return;

  const { latitude, longitude, heading, speed } = latest.coords;
  const nextHeading = heading != null && heading >= 0 ? heading : 0;
  const nextSpeedKmh = speed != null && speed >= 0 ? Number((speed * 3.6).toFixed(1)) : 0;

  DeviceEventEmitter.emit(LOCATION_EVENT_NAME, { latitude, longitude, heading: nextHeading, speedKmh: nextSpeedKmh });

  try {
    // Self-healing orphan check: if the app was force-quit while online, no cleanup ever ran to
    // call stopLocationUpdatesAsync, and this task would otherwise keep firing forever — even if
    // the app is never reopened. 'true' is treated as the safe default (an app that has never set
    // this key at all is presumably still in its very first online session), so this only ever
    // stops the task on an EXPLICIT persisted 'false'.
    const isOnline = (await AsyncStorage.getItem(IS_ONLINE_STORAGE_KEY)) !== 'false';
    if (!isOnline) {
      if (__DEV__) console.warn('[telemetry:bg] Orphaned background task detected (driver is offline) — stopping self.');
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      return;
    }

    const trackingMode = (await AsyncStorage.getItem(TRACKING_MODE_STORAGE_KEY)) || 'mobile_app';
    if (trackingMode !== 'mobile_app') return;

    const lastSentAt = Number((await AsyncStorage.getItem(LAST_SENT_AT_STORAGE_KEY)) || 0);
    const now = Date.now();
    if (now - lastSentAt < SEND_INTERVAL_MS) return;

    const sessionRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionRaw) return; // no logged-in driver session — nothing to authenticate the send with
    const session = JSON.parse(sessionRaw) as { token?: string };
    if (!session.token) return;
    setAuthToken(session.token);

    const ping: Ping = {
      latitude,
      longitude,
      speed_kmh: nextSpeedKmh,
      heading_deg: nextHeading,
      recorded_at: new Date(latest.timestamp).toISOString(),
    };

    const pendingRaw = await AsyncStorage.getItem(PENDING_PING_STORAGE_KEY);
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as Ping) : null;

    try {
      if (pending) {
        await driverApi.sendTelematicsBatch([pending, ping]);
      } else {
        await driverApi.sendTelematics(ping);
      }
      await AsyncStorage.removeItem(PENDING_PING_STORAGE_KEY);
      await AsyncStorage.setItem(LAST_SENT_AT_STORAGE_KEY, String(now));
    } catch (sendErr) {
      // Same resilience contract as the foreground sendPing(): keep only the single most recent
      // unsent reading, flush it alongside the next successful one via the batch endpoint.
      await AsyncStorage.setItem(PENDING_PING_STORAGE_KEY, JSON.stringify(ping));
      if (__DEV__) {
        console.warn('[telemetry:bg] send failed, queued for retry:', (sendErr as Error)?.message || sendErr);
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[telemetry:bg] unexpected error:', (e as Error)?.message || e);
  }
});
