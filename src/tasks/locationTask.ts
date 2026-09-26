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
 * loads early as a top-level provider, is what guarantees that ordering here. DriverShiftContext
 * is also the ONLY place that starts and stops the OS updates: it calls
 * startLocationUpdatesAsync(LOCATION_TASK_NAME, …) when the driver is online in mobile-GPS mode
 * (after requesting the background permission) and stopLocationUpdatesAsync() on offline, on
 * tracking-mode change and on unmount — so registration, lifecycle and cadence all stay in one
 * pair of hands, and no second timer/task is ever created.
 *
 * This task executes OUTSIDE the React tree — it cannot read component state or the in-memory
 * authToken that api.ts's module scope holds (a headless relaunch after the OS kills the app
 * starts that module state fresh at null). Everything the task needs (auth token, whether mobile
 * GPS tracking is even the active mode, which side currently owns transmission, and the 15s send
 * cadence / 1-slot pending-ping resilience DriverShiftContext already uses in the foreground) is
 * instead read from/written to AsyncStorage, so the task is fully self-contained.
 *
 * Exactly ONE sender may write a record for a given 15s window. Two things enforce that here:
 *   1. transmitter ownership (GPS_TRANSMITTER_STORAGE_KEY): this task only transmits while the
 *      value is 'background' — i.e. the app is backgrounded and the foreground's scheduled
 *      pollOnce() interval has handed over. In the foreground the task still runs (and still
 *      emits the UI event below) but never sends, so it can never duplicate the scheduled tick;
 *   2. the shared cadence stamp (LAST_SENT_AT_STORAGE_KEY): the same key DriverShiftContext's
 *      claimTransmitSlot() claims through, so a send by either side holds the window shut for
 *      the other. That is what keeps the 15s cadence continuous across the foreground→background
 *      handover instead of restarting the count every time the app changes state.
 */

export const LOCATION_TASK_NAME = 'trivora-driver-location-task';
// Emitted on every fix so a foreground listener can keep the on-screen map/speed readout live
// even for fixes that arrive through the background task. Transmission is decided separately,
// inside the task below — receiving a fix (or broadcasting one) never implies a GPS record.
export const LOCATION_EVENT_NAME = 'trivora:location-update';

// Must match DriverAuthContext.tsx's own key exactly — this task reads the same persisted
// session, it does not create a second one. Exported for DriverShiftContext's startup
// reconciliation: an orphaned task cannot authenticate anything without a session, so it is
// stopped on relaunch when no session is left.
export const SESSION_STORAGE_KEY = '@trivora_driver_session';
export const TRACKING_MODE_STORAGE_KEY = '@trivora_tracking_mode';
// Mirrors DriverShiftContext's `isOnline` state. Checked on every task invocation (see below) as
// a self-healing safety net: if the app is force-quit while online, no cleanup ever runs, and
// this task — a persistent OS-level registration — would otherwise keep firing and draining
// battery indefinitely even if the app is never reopened. The very next scheduled invocation
// (up to 15s later) notices the mismatch and stops itself. DriverShiftContext additionally
// double-checks for an orphaned task on its own startup, in case the driver reopens the app
// before that next tick fires.
export const IS_ONLINE_STORAGE_KEY = '@trivora_is_online';
const PENDING_PING_STORAGE_KEY = '@trivora_bg_pending_ping';
// THE shared cadence stamp — written by whichever side wins a transmit slot (this task when the
// app is backgrounded, DriverShiftContext's claimTransmitSlot() when it is foregrounded) and read
// by both. Exported so DriverShiftContext claims through this exact key instead of keeping a
// second, disconnected notion of "when did we last send".
export const LAST_SENT_AT_STORAGE_KEY = '@trivora_bg_last_sent_at';

/** Which side is currently allowed to transmit GPS. Persisted because this task cannot read
 * DriverShiftContext's state and has to keep making the same decision across a headless
 * (app-killed) relaunch. Fails closed: a stale value can only delay a send, never enable two. */
export type GpsTransmitter = 'none' | 'foreground' | 'background';
// 'none'       — no sender (offline, logged out, or not yet started): this task sends nothing.
// 'foreground' — the app is active, so DriverShiftContext's scheduled pollOnce() owns the cadence.
// 'background' — the app is backgrounded, so THIS task owns the cadence until the app resumes.
export const GPS_TRANSMITTER_STORAGE_KEY = '@trivora_gps_transmitter';

// Kept identical to DriverShiftContext's GPS_TRANSMISSION_INTERVAL_MS by contract (both are the
// fixed project-wide 5s GPS transmission interval) — not imported directly to keep this task
// file free of any dependency on the React context module.
const SEND_INTERVAL_MS = 5000;

// How often the OS is asked to hand a fix to this task (the value DriverShiftContext passes as
// `timeInterval` to startLocationUpdatesAsync). This is the SAMPLING rate, never the transmission
// rate — the SEND_INTERVAL_MS check above decides whether a fix is actually sent. It has to sit
// well below the 5s send interval, on a fine grid, because OS delivery jitter around the boundary would otherwise
// push every other delivery outside the window and silently stretch the real cadence to ~10s.
// distanceInterval is set to 0 by the caller for the same reason: no movement threshold may ever
// hold a scheduled update back for a stationary tricycle.
export const GPS_FIX_DELIVERY_INTERVAL_MS = 1000;

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

    // Transmission ownership — checked BEFORE the cadence stamp, so a foreground-owned period can
    // never consume (and therefore never block) a send window. While the app is active,
    // DriverShiftContext's scheduled pollOnce() interval is the transmitter and this task must
    // not write a second record beside it: it still emits the UI event above, it just never
    // sends. Once the app is backgrounded the flag flips to 'background' and this task takes the
    // cadence over until the app resumes.
    const transmitter = (await AsyncStorage.getItem(GPS_TRANSMITTER_STORAGE_KEY)) as GpsTransmitter | null;
    if (transmitter !== 'background') return;

    const lastSentAt = Number((await AsyncStorage.getItem(LAST_SENT_AT_STORAGE_KEY)) || 0);
    const now = Date.now();
    if (now - lastSentAt < SEND_INTERVAL_MS) return;

    const sessionRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    if (!sessionRaw) return; // no logged-in driver session — nothing to authenticate the send with
    const session = JSON.parse(sessionRaw) as { token?: string };
    if (!session.token) return;
    setAuthToken(session.token);

    // Claim the window BEFORE attempting the send — the same ordering claimTransmitSlot() uses on
    // the foreground side. A send that fails still consumed this window (its reading is queued in
    // the pending slot below and flushed with the next one), so stamping only on success would let
    // a flaky network collapse the cadence into a retry loop faster than the 15s standard.
    await AsyncStorage.setItem(LAST_SENT_AT_STORAGE_KEY, String(now));

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
      // The cadence stamp was already written above (at claim time) — nothing to update here.
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
