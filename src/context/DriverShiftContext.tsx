import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  ReactNode,
} from 'react';
import * as Location from 'expo-location';
import { AppState, AppStateStatus, DeviceEventEmitter, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDriverAuth } from './DriverAuthContext';
import { useToast } from '../components/Toast';
import { rideDate } from '../utils/rideDate';
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import {
  driverApi,
  mapBookingRecordToIncoming,
  mapBookingRecordToHistoryItem,
  mapViolationRecordToCitation,
} from '../services/api';
import { MUNICIPAL_SPEED_LIMIT_KMH, checkColorCodingViolation } from '../constants/todaRoutes';
import { ViolationCitation, IncomingBooking, RideHistoryItem } from '../types';
import {
  LOCATION_TASK_NAME,
  LOCATION_EVENT_NAME,
  TRACKING_MODE_STORAGE_KEY,
  IS_ONLINE_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  LAST_SENT_AT_STORAGE_KEY,
  GPS_TRANSMITTER_STORAGE_KEY,
  GPS_FIX_DELIVERY_INTERVAL_MS,
  GpsTransmitter,
} from '../tasks/locationTask';

const ACTIVE_RIDE_STATUSES = ['accepted', 'arrived', 'in_transit'] as const;
// Background DATA refresh cadence — pending dispatch and ride history are live server state the
// driver is waiting on, so they refresh on the project-wide 5-second standard. Read-only GETs:
// they never transmit GPS and never touch the transmission cadence below.
const PENDING_REQUEST_POLL_MS = 5000;
// History doesn't need to be near-real-time, just eventually consistent without requiring an
// app restart — a passenger's rating can land any time after their ride completes.
const HISTORY_REFRESH_POLL_MS = 5000;
// THE GPS transmission cadence. Every sender in this file (the scheduled watcher tick, the native
// position watch, the app-resume catch-up) must pass claimTransmitSlot() before sending, which
// admits at most one transmission per GPS_TRANSMISSION_INTERVAL_MS — so this constant is the
// single source of truth for how often a ping reaches the backend, however many timers ask.
//
// Deliberately TIME-based with no distance/movement filter on the sending decision, so a
// stationary tricycle reports on exactly the same 5-second cadence as a moving one and a
// distanceInterval on the native watch can never suppress the scheduled update. Transmission only:
// UI screen refreshes are unrelated to this and cannot produce a GPS record.
const GPS_TRANSMISSION_INTERVAL_MS = 5000;
// How long the app can sit backgrounded before a resume is treated as needing an immediate
// catch-up ping rather than just waiting for the next natural watcher tick — one interval's
// worth of gap is the threshold, so the visible gap after resuming is bounded to roughly the
// actual time spent backgrounded, not "backgrounded time + up to another interval."
const BACKGROUND_CATCHUP_THRESHOLD_MS = GPS_TRANSMISSION_INTERVAL_MS;

interface PendingPing {
  latitude: number;
  longitude: number;
  speed_kmh: number;
  heading_deg: number;
  recorded_at: string;
}

interface DriverShiftContextType {
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  isAvailable: boolean;
  setIsAvailable: (avail: boolean) => void;
  trackingMode: 'mobile_app' | 'iot_device';
  iotDeviceId: string;
  updateTrackingMode: (mode: 'mobile_app' | 'iot_device', iotId?: string) => Promise<void>;
  /** Real device GPS only — null until a fix has actually been obtained. Never a fake/default
   * coordinate; screens that need a location must guard for null and show LocationPendingView. */
  currentLat: number | null;
  currentLng: number | null;
  isLocatingDriver: boolean;
  locationError: string | null;
  retryLocation: () => void;
  speedKmh: number;
  headingDeg: number;
  violations: ViolationCitation[];
  /** True only while the FIRST fetch is in flight — background poll refreshes never flip this
   * back on, so an already-populated list doesn't flash a spinner every 15s. */
  isLoadingViolations: boolean;
  /** Set when the most recent fetch failed. Cleared as soon as one succeeds. Screens should only
   * treat this as a blocking error state when `violations` is still empty — a failed background
   * refresh shouldn't hide a list that already loaded successfully. */
  violationsError: string | null;
  refreshViolations: () => Promise<void>;
  submitViolationAppeal: (
    violationId: number,
    reason: string,
    proof?: { uri: string; name: string; type: string }
  ) => Promise<void>;
  activeSpeedWarning: boolean;
  codingWarning: any;
  incomingBooking: IncomingBooking | null;
  setIncomingBooking: (booking: IncomingBooking | null) => void;
  activeBooking: IncomingBooking | null;
  setActiveBooking: (booking: IncomingBooking | null) => void;
  rideState: 'idle' | 'dispatch' | 'accepted' | 'arrived' | 'in_transit' | 'fare_collect';
  setRideState: (state: 'idle' | 'dispatch' | 'accepted' | 'arrived' | 'in_transit' | 'fare_collect') => void;
  fareToCollect: number | null;
  setFareToCollect: (fare: number | null) => void;
  todayEarnings: number;
  completedTripsCount: number;
  totalCompletedRides: number;
  averageRating: number | null;
  historyList: RideHistoryItem[];
  acceptBooking: () => void;
  declineBooking: () => void;
  setStatusArrived: () => void;
  setStatusInTransit: () => void;
  completeTrip: () => void;
  finishAndCollectFare: () => void;
  /** Driver-initiated cancellation of the active booking — only valid while still 'accepted'
   * (pickup/en-route phase, before "Arrived"). The backend enforces this window independently;
   * this resolves to false (and shows a toast) if the backend rejects it, e.g. because the
   * driver already tapped Arrived on another device/tab in the meantime. */
  cancelActiveBooking: () => Promise<boolean>;
}

const DriverShiftContext = createContext<DriverShiftContextType | null>(null);

export function DriverShiftProvider({ children }: { children: ReactNode }) {
  const { driver } = useDriverAuth();
  const { showToast } = useToast();

  const [isOnline, setIsOnlineState] = useState<boolean>(true);
  const [isAvailable, setIsAvailableState] = useState<boolean>(true);

  // Guards the persistence effect below from overwriting the real historical value with this
  // hook's hardcoded `true` default before the restore-and-reconcile effect has had a chance to
  // read it back — both effects fire on the same initial render, so ordering matters here.
  const hasRestoredOnlineRef = useRef(false);

  // Mirrored to AsyncStorage so a relaunch (see the restore-and-reconcile effect a few lines
  // down) knows whether the driver was actually online when the app last ran, and so the
  // background task (locationTask.ts) can independently notice it's been orphaned — see there.
  useEffect(() => {
    if (!hasRestoredOnlineRef.current) return;
    AsyncStorage.setItem(IS_ONLINE_STORAGE_KEY, String(isOnline)).catch(() => {});
  }, [isOnline]);

  // Startup/relaunch safety check. Ending a shift normally (tapping "Go Offline") already stops
  // background tracking cleanly via the watcher effect's own cleanup below — this effect exists
  // for the case that cleanup never ran at all: the driver force-quit the app while still online.
  // startLocationUpdatesAsync registers a persistent OS-level task that survives the app process
  // dying, so on the next launch it could still be running even though nothing in this fresh React
  // tree ever started it. Runs once, before login, since the orphaned task belongs to whatever
  // driver was using this device last, not necessarily whoever (re)opens the app next.
  useEffect(() => {
    (async () => {
      let restoredOnline = true;
      try {
        const persisted = await AsyncStorage.getItem(IS_ONLINE_STORAGE_KEY);
        if (persisted !== null) {
          restoredOnline = persisted === 'true';
          setIsOnlineState(restoredOnline);
        }
      } catch {
        // Storage read failed — keep the safe `true` default; reconciliation below then simply
        // finds nothing to stop (isTracking && !true is always false), which is the correct
        // no-op when we can't determine the real prior state.
      } finally {
        hasRestoredOnlineRef.current = true;
      }
      // A fresh install with no persisted key yet (`persisted === null` above) falls through here
      // with the same safe `true` default, for the same reason — nothing could have been orphaned
      // before this app has ever gone online once.

      // Background-delivery reconciliation for this relaunch, run before the watcher effect below
      // can (re)start anything. startLocationUpdatesAsync() registers a persistent OS-level task,
      // so a state where those updates are still running but this launch has no shift to track
      // must be closed out here: driver offline, or no driver session left to authenticate a send
      // with. When it is legitimately still online with a session, nothing is touched — the
      // watcher effect is the single starter, and its startBackgroundUpdates() is idempotent
      // (it checks hasStartedLocationUpdatesAsync first), so a relaunch just re-enters the state
      // it was already in instead of starting a second sender.
      if (Platform.OS === 'web') return;
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!started) return;
        const sessionRaw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (restoredOnline && sessionRaw) return;
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      } catch {
        // Updates never started, background permission not granted yet, or the native module is
        // unavailable in this environment — every one of those means "nothing to reconcile".
      }
    })();
    // Runs once per app process start — deliberately not re-run on driver/login changes, since an
    // orphaned task is a device-level leftover, not something tied to whichever driver is
    // currently authenticated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [trackingMode, setTrackingMode] = useState<'mobile_app' | 'iot_device'>(
    driver?.tricycle?.activeTrackingMode || 'mobile_app'
  );
  const [iotDeviceId, setIotDeviceId] = useState<string>(
    driver?.tricycle?.iotDeviceId || 'TRV-IOT-0842'
  );

  // Mirrored to AsyncStorage so the background location task (locationTask.ts) — which runs
  // outside the React tree and cannot read this state directly — knows whether it's still
  // allowed to send (only when tracking mode is 'mobile_app', same rule the foreground path uses).
  useEffect(() => {
    AsyncStorage.setItem(TRACKING_MODE_STORAGE_KEY, trackingMode).catch(() => {});
  }, [trackingMode]);

  // Real device GPS — no seeded/default coordinate. Starts null; the mount effect below (and,
  // while online, the continuous watcher) are the only things that ever set a real fix.
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number>(0);
  const [headingDeg, setHeadingDeg] = useState<number>(0);
  const { isLocating: isLocatingDriver, error: locationError, requestCurrentLocation } = useCurrentLocation();

  // A bounded 1-slot buffer, not an unbounded offline queue: if a send fails, the single most
  // recent unsent reading is kept here (overwriting any earlier one — never accumulated) and is
  // flushed alongside the next successful reading via the batch endpoint. This trades "a full
  // offline trail" for simplicity, deliberately — see the GPS/IoT tracking plan.
  const pendingPingRef = useRef<PendingPing | null>(null);
  // When the app last transitioned to background/inactive — used by the AppState effect below to
  // decide whether a resume needs an immediate catch-up ping.
  const wentBackgroundAtRef = useRef<number | null>(null);

  // Real violations only — fetched from the backend (see the effect below). No hardcoded demo
  // records: an empty list here means the driver genuinely has none yet, or they haven't loaded.
  const [violations, setViolations] = useState<ViolationCitation[]>([]);
  const [isLoadingViolations, setIsLoadingViolations] = useState<boolean>(true);
  const [violationsError, setViolationsError] = useState<string | null>(null);

  const [activeSpeedWarning, setActiveSpeedWarning] = useState<boolean>(false);
  const [codingWarning, setCodingWarning] = useState<any>(null);

  const [incomingBooking, setIncomingBooking] = useState<IncomingBooking | null>(null);
  const [activeBooking, setActiveBooking] = useState<IncomingBooking | null>(null);
  const [rideState, setRideState] = useState<'idle' | 'dispatch' | 'accepted' | 'arrived' | 'in_transit' | 'fare_collect'>('idle');
  const [fareToCollect, setFareToCollect] = useState<number | null>(null);

  const [historyList, setHistoryList] = useState<RideHistoryItem[]>([
    {
      id: 1,
      bookingCode: 'TRV-20240520-0941',
      passengerName: 'Maria Santos',
      pickup: 'Nasugbu Municipal Hall',
      dropoff: 'Bucana, Nasugbu',
      distanceKm: 1.8,
      fare: 45.0,
      date: 'May 20, 2024',
      time: '09:41 AM',
      status: 'completed',
      paymentMethod: 'cash',
      rating: 5,
    },
    {
      id: 2,
      bookingCode: 'TRV-20240520-0852',
      passengerName: 'Juan Reyes',
      pickup: 'Bucana, Nasugbu',
      dropoff: 'Nasugbu Municipal Hall',
      distanceKm: 1.8,
      fare: 40.0,
      date: 'May 20, 2024',
      time: '08:52 AM',
      status: 'completed',
      paymentMethod: 'cash',
      rating: null,
    },
    {
      id: 3,
      bookingCode: 'TRV-20240519-0523',
      passengerName: 'Ana Cruz',
      pickup: 'Bucana Public Market',
      dropoff: 'Brgy. 10, Nasugbu',
      distanceKm: 2.5,
      fare: 50.0,
      date: 'May 19, 2024',
      time: '05:23 PM',
      status: 'completed',
      paymentMethod: 'gcash',
      rating: 4,
    },
    {
      id: 4,
      bookingCode: 'TRV-20240519-0310',
      passengerName: 'Mark Villanueva',
      pickup: 'Barangay 8, Nasugbu',
      dropoff: 'Nasugbu Municipal Hall',
      distanceKm: 1.8,
      fare: 45.0,
      date: 'May 19, 2024',
      time: '03:10 PM',
      status: 'completed',
      paymentMethod: 'cash',
      rating: 5,
    },
    {
      id: 5,
      bookingCode: 'TRV-20240518-1140',
      passengerName: 'Liza Fernandez',
      pickup: 'Wawa Port Terminal',
      dropoff: 'Bucana, Nasugbu',
      distanceKm: 2.0,
      fare: 30.0,
      date: 'May 18, 2024',
      time: '11:40 AM',
      status: 'cancelled',
      paymentMethod: 'cash',
    },
  ]);

  const addToHistory = (item: RideHistoryItem) => {
    setHistoryList((prev) => [item, ...prev]);
  };

  // Single source of truth for every "completed rides" statistic shown anywhere in this app
  // (Home, Earnings, Profile) — all derived from the same real, backend-scoped historyList
  // (see the fetchHistory effect below) instead of separate frozen/hardcoded counters, so they
  // can never drift apart or show a fake non-zero default for a driver with no rides yet.
  const completedHistory = useMemo(
    () => historyList.filter((h) => h.status === 'completed'),
    [historyList]
  );

  const isToday = (item: RideHistoryItem) => {
    const d = rideDate(item);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const todaysCompletedHistory = useMemo(
    () => completedHistory.filter((h) => isToday(h)),
    [completedHistory]
  );

  const todayEarnings = useMemo(
    () => todaysCompletedHistory.reduce((sum, h) => sum + h.fare, 0),
    [todaysCompletedHistory]
  );
  const completedTripsCount = todaysCompletedHistory.length;
  const totalCompletedRides = completedHistory.length;

  // Overall average of this driver's own received ratings only — computed from the same
  // completed-rides list as everything else above, so it always agrees with Completed Rides/
  // Earnings for the same driver and updates as soon as a new rating is fetched, instead of the
  // stale rating snapshot cached once at login.
  const averageRating = useMemo(() => {
    const rated = completedHistory.filter(
      (h): h is RideHistoryItem & { rating: number } => h.rating != null
    );
    if (rated.length === 0) return null;
    return rated.reduce((sum, h) => sum + h.rating, 0) / rated.length;
  }, [completedHistory]);

  useEffect(() => {
    if (driver?.tricycle?.plateNumber) {
      const check = checkColorCodingViolation(driver.tricycle.plateNumber);
      if (check.isViolation) {
        setCodingWarning(check);
      } else {
        setCodingWarning(null);
      }
    }
  }, [driver]);

  const applyLocationFix = (coords: { lat: number; lng: number } | null) => {
    if (__DEV__) console.log('[driver-loc] initial fix from useCurrentLocation:', coords);
    if (!coords) return;
    setCurrentLat(coords.lat);
    setCurrentLng(coords.lng);
  };

  // Real GPS, obtained the moment the driver is known — independent of online status, so Home
  // shows the driver's actual position even before they go online (see LocationPendingView for
  // what renders while this is in flight or if it fails).
  useEffect(() => {
    if (!driver) return;
    requestCurrentLocation().then(applyLocationFix);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id]);

  const retryLocation = () => {
    requestCurrentLocation().then(applyLocationFix);
  };

  // Single send path used by the scheduled 15s watcher tick, the position-watch fallback and the
  // AppState catch-up ping below — all of which must win claimTransmitSlot() first. If a previous
  // send failed and is still pending, flushes it alongside this reading via
  // the batch endpoint (so no reading is silently lost to a single dropped network blip); on
  // success either way, clears the pending slot. On failure, this reading becomes the new (and
  // only) pending one — never accumulated.
  const sendPing = async (ping: PendingPing) => {
    const pending = pendingPingRef.current;
    try {
      if (pending) {
        await driverApi.sendTelematicsBatch([pending, ping]);
      } else {
        await driverApi.sendTelematics(ping);
      }
      pendingPingRef.current = null;
    } catch (err) {
      // Kept resilient (the reading is queued, never dropped) but no longer silent — a failed
      // send here previously left zero trace anywhere, which is exactly what made "GPS looks like
      // it's running but nothing reaches the database" invisible to debug. No token/PII logged.
      if (__DEV__) {
        console.warn('[telemetry] sendPing failed, queued for retry:', (err as Error)?.message || err);
      }
      pendingPingRef.current = ping;
    }
  };

  // ── GPS transmission ownership + the shared cross-context cadence stamp ────────────────────
  // Exactly ONE side may write a record per 15s window, and which side that is follows the app
  // state: active → this file's scheduled pollOnce() interval; backgrounded → locationTask.ts
  // (the OS background location task). The handover is persisted because locationTask.ts runs
  // outside the React tree and must reach the same decision on its own, including across a
  // headless relaunch. It fails closed: a stale value can only delay a send, never enable two.
  // Web is untouched — there is no background task in a browser tab, so the scheduled tick below
  // stays the one and always-favourable sender and this flag is simply never changed.
  const transmitterRef = useRef<GpsTransmitter>('foreground');
  const setTransmitter = (next: GpsTransmitter) => {
    if (Platform.OS === 'web') return;
    if (transmitterRef.current === next) return;
    transmitterRef.current = next;
    AsyncStorage.setItem(GPS_TRANSMITTER_STORAGE_KEY, next).catch(() => {});
  };

  // The single gate every GPS transmission must pass through before it can reach the backend.
  // It admits at most one transmission per GPS_TRANSMISSION_INTERVAL_MS, no matter which timer
  // asks — this is what stops the scheduled tick, the native position watch, the resume
  // catch-up and the background location task from each writing their own record for the same
  // moment. Synchronous check-and-set, so two timers firing in the same JS turn can never both
  // win it.
  const lastTransmitSlotRef = useRef(0);
  const claimTransmitSlot = (): { at: number; previous: number } | null => {
    const now = Date.now();
    const previous = lastTransmitSlotRef.current;
    if (now - previous < GPS_TRANSMISSION_INTERVAL_MS) return null;
    lastTransmitSlotRef.current = now;
    // Publish the claim to the one place the background task can read (it cannot see this ref).
    // Written at claim time rather than after the send: the window is consumed either way, and
    // it is what keeps the cadence continuous across the foreground→background handover instead
    // of restarting the 15s count every time the app changes state.
    AsyncStorage.setItem(LAST_SENT_AT_STORAGE_KEY, String(now)).catch(() => {});
    return { at: now, previous };
  };
  // Hands a claimed slot back when the sender that took it never obtained a fix to send — a
  // single GPS hiccup must not hold the 15-second window shut and block the fallback paths (or
  // stretch the next scheduled tick past its interval).
  const rollbackTransmitSlot = (claim: { at: number; previous: number } | null) => {
    if (claim && lastTransmitSlotRef.current === claim.at) {
      lastTransmitSlotRef.current = claim.previous;
      // Compare-and-set on the persisted copy too: only roll it back if nobody else has claimed
      // the window in the meantime, so restoring our slot can never erase a claim the background
      // task just published (which would otherwise let it send twice inside one interval).
      AsyncStorage.getItem(LAST_SENT_AT_STORAGE_KEY)
        .then((stored) => {
          if (Number(stored || 0) !== claim.at) return null;
          return AsyncStorage.setItem(LAST_SENT_AT_STORAGE_KEY, String(claim.previous));
        })
        .catch(() => {});
    }
  };
  // Absorb the persisted stamp — written by the background task while this side was backgrounded —
  // into the in-memory slot before claiming, so a ping that just went out from the background is
  // not followed by an "immediate" foreground ping seconds later. Purely monotonic; the sync
  // check-and-set above remains the authoritative gate.
  const hydrateTransmitSlot = async () => {
    try {
      const persisted = Number((await AsyncStorage.getItem(LAST_SENT_AT_STORAGE_KEY)) || 0);
      if (Number.isFinite(persisted) && persisted > lastTransmitSlotRef.current) {
        lastTransmitSlotRef.current = persisted;
      }
    } catch {
      // Storage unavailable — the in-memory slot still guards this side on its own.
    }
  };
  // The one claim path every sender uses: hydrate first, then the synchronous check-and-set.
  const claimTransmitSlotAsync = async () => {
    await hydrateTransmitSlot();
    return claimTransmitSlot();
  };

  // ── OS background location lifecycle ──────────────────────────────────────────────────────
  // startLocationUpdatesAsync()/stopLocationUpdatesAsync() are called from exactly two places —
  // the watcher effect (start on online, stop in its cleanup) and the startup reconciliation
  // above (stop an orphan) — both of them idempotent, so online → running, offline → stopped,
  // and no path can end up with two live registrations. Best-effort throughout: a refused
  // background permission, a missing native module or an environment that cannot host background
  // location all degrade to "no background delivery", never to a crash or a weaker foreground
  // path — the scheduled tick and the position watch below keep working exactly as before.
  const startBackgroundUpdates = async (): Promise<boolean> => {
    if (Platform.OS === 'web') return false;
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) return true;
      // The OS requires its own "always"/background grant on top of the foreground one already
      // requested. Asked here — at the moment tracking actually begins — never forced, and a
      // denial simply means background delivery stays off.
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        if (__DEV__) {
          console.warn('[telemetry:bg] background location permission not granted — background GPS stays off, foreground tracking continues.');
        }
        return false;
      }
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        // Sampling rate only — locationTask.ts decides whether a fix is transmitted (15s).
        timeInterval: GPS_FIX_DELIVERY_INTERVAL_MS,
        // No displacement filter: a stationary tricycle must still produce a fix every cycle,
        // which is exactly what the 15s scheduled update requires.
        distanceInterval: 0,
        activityType: Location.ActivityType.AutomotiveNavigation,
        // Never let the OS pause delivery while the tricycle is parked — a parked unit is still
        // a unit the coding-violation record needs to locate.
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        // Required for sustained delivery on Android 8+ (and it also covers the background
        // permission there): the OS keeps the app alive behind a user-visible notification
        // instead of freezing it shortly after it backgrounds. The permissions it needs are
        // already declared in app.json (FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION,
        // ACCESS_BACKGROUND_LOCATION) and the Expo config plugin enables the service.
        foregroundService: {
          notificationTitle: 'Trivora Driver',
          notificationBody: 'Sending GPS for your active shift',
          notificationColor: '#1D2542',
        },
      });
      return true;
    } catch (err) {
      if (__DEV__) console.warn('[telemetry:bg] could not start background location updates:', err);
      return false;
    }
  };
  const stopBackgroundUpdates = () => {
    if (Platform.OS === 'web') return;
    Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
  };

  // Continuous real-GPS tracking while online — the same trigger condition the old simulated
  // interval used, since every state that needs live position (available, dispatched, en route to
  // pickup, in transit) is only reachable while online. Every fix is applied to the UI, and
  // transmission happens through claimTransmitSlot() on a fixed 15-second schedule with no
  // distance/movement filter — so a stationary tricycle still reports on the same cadence as a
  // moving one (required for reliable coding-violation GPS coverage while parked).
  //
  // Actual sending path: the fixed-timer poll (pollOnce below) is the primary and scheduled
  // sender. The native position watch underneath is a fallback sender only — a passive watch has
  // no guaranteed schedule (observed directly against this project's backend logs: it sent
  // reliably for a few cycles then silently stopped firing while the app was still open, iOS's
  // Balanced accuracy deciding there was "nothing new" to report), so it is never allowed to set
  // the cadence, only to cover a window the scheduled tick failed to. Both go through the same
  // slot gate, so their combined output is still exactly one record per interval.
  //
  // Background delivery: locationTask.ts registers the TaskManager task that keeps receiving
  // fixes while the app is backgrounded/screen-locked (same 15s cadence by contract), and THIS
  // effect is the single place that starts and stops it — startBackgroundUpdates() once the
  // foreground permission is in hand (it also requests the background permission the OS
  // requires), stopBackgroundUpdates() in the cleanup below. So online → background delivery
  // running; offline / tracking-mode change / driver change → cleanup stops it. Transmission
  // then follows the ownership flag: while this app is active, pollOnce() below owns the cadence
  // and the task only feeds the UI; the moment the app backgrounds the AppState effect below
  // hands the cadence over to the task. One sender at a time, both paced by the shared stamp.
  //
  // Web: background tasks don't exist in a browser tab, so web always uses the same poll, and
  // sends directly from here (never via locationTask.ts, which only registers on native).
  useEffect(() => {
    // Also gated on `driver`, not just `isOnline` — DriverShiftProvider wraps the whole app
    // including the pre-login screens, and `isOnline` already defaults to true, so without this
    // the watcher would start (and call sendTelematics with no auth token yet, producing 401s)
    // before the driver has even logged in.
    if (!isOnline || !driver) return;
    let cancelled = false;
    let activePollTimer: ReturnType<typeof setInterval> | null = null;
    let bgEventSubscription: { remove: () => void } | null = null;

    // Own the cadence for as long as this run of the watcher is what's driving the app. Seeded
    // from the real app state rather than assumed, so a run that begins while already
    // backgrounded hands the cadence straight to the OS task instead of to a foreground timer
    // the OS has suspended. An unknown/null state counts as foreground — failing toward the
    // long-verified scheduled tick is the safe direction (and it is the normal state at mount).
    setTransmitter(AppState.currentState === 'background' ? 'background' : 'foreground');

    // Updates only the on-screen state (map position, heading, speed) — never sends anything.
    // Shared by the web poll and the native background-task event listener below.
    const applyFixState = (coords: { latitude: number; longitude: number; heading: number | null; speed: number | null }) => {
      const { latitude, longitude, heading, speed } = coords;
      if (__DEV__) {
        console.log(`[driver-heading] latitude=${latitude}`);
        console.log(`[driver-heading] longitude=${longitude}`);
        console.log(`[driver-heading] heading=${heading} (expo-location coords.heading, degrees 0-360, -1/null = unknown)`);
      }
      setCurrentLat(latitude);
      setCurrentLng(longitude);

      // Heading/speed are only reliable while actually moving — expo-location reports -1 (or
      // null) when they can't be determined, in which case the last known value is kept
      // rather than snapping the marker's rotation or the speed readout to zero/garbage.
      const nextHeading = heading != null && heading >= 0 ? heading : null;
      const nextSpeedKmh = speed != null && speed >= 0 ? Number((speed * 3.6).toFixed(1)) : null;
      if (nextHeading != null) setHeadingDeg(nextHeading);
      if (nextSpeedKmh != null) {
        setSpeedKmh(nextSpeedKmh);
        setActiveSpeedWarning(nextSpeedKmh > MUNICIPAL_SPEED_LIMIT_KMH);
      }
      return { nextHeading, nextSpeedKmh };
    };

    // Shared by web and the Expo-Go/foreground-fallback path below. Actively asks for a fresh fix
    // on a fixed timer rather than trusting a passive watch (watchPositionAsync/browser
    // watchPosition) to call back on its own schedule — observed directly against this project's
    // real backend logs: the passive watcher sent reliably for a few cycles then silently stopped
    // firing altogether while the app was still open and connected (iOS's Balanced accuracy can
    // decide there's "nothing new" to report and stop invoking the callback, regardless of
    // distanceInterval). Explicitly polling guarantees a request every interval regardless of
    // whether the native layer thinks the position "changed."
    const pollOnce = async () => {
      // Claim this cycle's transmission slot up front, anchored to the TICK rather than to
      // however long the fix takes. Recording the slot only after a variable-length GPS fix
      // would let a slow fix drift the cadence past 15s (and a fast one silently skip a tick);
      // anchoring here keeps the schedule exact. A denied claim just means another sender has
      // already covered this window — the on-screen position still updates either way.
      const slot =
        trackingMode === 'mobile_app' && transmitterRef.current === 'foreground'
          ? await claimTransmitSlotAsync()
          : null;
      const releaseSlot = () => rollbackTransmitSlot(slot);

      try {
        // maxAge: a days-old cached fix must never move the marker/camera to where the device used to be.
        const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60_000 }).catch(() => null);
        if (lastKnown && !cancelled) {
          applyFixState(lastKnown.coords);
        }

        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          timeoutPromise,
        ]);

        if (cancelled || !position || !('coords' in position)) {
          // No fix to send — hand the slot back so the position watch can still cover this window.
          releaseSlot();
          return;
        }
        const { nextHeading, nextSpeedKmh } = applyFixState(position.coords);
        if (slot) {
          // Transmission (not UI refresh): the one scheduled GPS send. The claim already
          // guarantees this record is at least 15 seconds after the previous one.
          sendPing({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed_kmh: nextSpeedKmh ?? speedKmh,
            heading_deg: nextHeading ?? headingDeg,
            recorded_at: new Date().toISOString(),
          });
        }
      } catch {
        // Transient GPS hiccup — release the slot so the window isn't held shut, and simply
        // try again next tick.
        releaseSlot();
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        // Hand the OS the ability to keep delivering fixes while this app is backgrounded —
        // once, after the foreground grant is in place, and only in mobile-GPS mode (in IoT mode
        // the device itself transmits, so the app must not add a second background source).
        if (trackingMode === 'mobile_app') {
          const started = await startBackgroundUpdates();
          if (cancelled && started) {
            // The effect was cleaned up while the permission dialog was up — don't leave a
            // registration behind that nothing in this tree will ever stop again.
            stopBackgroundUpdates();
            return;
          }
          if (__DEV__ && started) console.log('[telemetry:bg] background location updates running');
        }

        // Perform initial instant poll
        await pollOnce();
        if (cancelled) return;

        // The scheduled GPS_TRANSMISSION_INTERVAL_MS (5-second) transmission cadence. Nothing else — not a UI refresh, not the
        // position watch — is allowed to set the rate at which GPS reaches the backend.
        activePollTimer = setInterval(pollOnce, GPS_TRANSMISSION_INTERVAL_MS);

        // Native position watch: keeps the on-screen map/speed readout live between scheduled
        // ticks, and doubles as a fallback SENDER only when the scheduled tick couldn't get a fix.
        if (Platform.OS !== 'web') {
          try {
            const watchSub = await Location.watchPositionAsync(
              {
                accuracy: Location.Accuracy.Balanced,
                timeInterval: 8000,
                distanceInterval: 3,
              },
              (position) => {
                if (cancelled) return;
                const { nextHeading, nextSpeedKmh } = applyFixState(position.coords);
                if (trackingMode !== 'mobile_app') return;
                // Same ownership rule as the scheduled tick: while the app is backgrounded the
                // OS task owns the cadence (the watch can still be delivering on Android), so
                // the watch must not also send.
                if (transmitterRef.current !== 'foreground') return;
                // Same gate as the scheduled tick. While the tick is healthy this claim is
                // always denied (the tick already holds the window), so the watch can never put
                // a duplicate record next to a scheduled one. Its timeInterval/distanceInterval
                // only decide when the watch *asks* to send — they have no say over the
                // scheduled update, which travels through pollOnce instead.
                claimTransmitSlotAsync().then((slot) => {
                  if (cancelled || !slot) return;
                  sendPing({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    speed_kmh: nextSpeedKmh ?? speedKmh,
                    heading_deg: nextHeading ?? headingDeg,
                    recorded_at: new Date().toISOString(),
                  });
                });
              }
            );
            if (cancelled) {
              watchSub.remove();
            } else {
              bgEventSubscription = watchSub;
            }
          } catch (watchErr) {
            if (__DEV__) console.warn('[telemetry] watchPositionAsync fallback to active interval:', watchErr);
          }
        }
      } catch {
        // Native module unavailable or permissions denied — never crash the app
      }
    })();

    return () => {
      cancelled = true;
      if (activePollTimer) clearInterval(activePollTimer);
      bgEventSubscription?.remove();
      // Going offline, switching tracking mode, a driver change and unmount all funnel through
      // this one cleanup, so the OS registration can never outlive the state that authorised it
      // — "Offline stops background delivery" is enforced here rather than left to the task's
      // own self-heal. Harmless when nothing was started (web, or a denied permission).
      stopBackgroundUpdates();
      setTransmitter('none');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, trackingMode, driver?.id]);

  // Defensive fallback for when foreground/background delivery was starved — OEM battery
  // optimizers (Xiaomi/Huawei/Samsung's aggressive background-kill policies) or a driver who only
  // granted "While Using" location on iOS can go quiet despite tracking being active. This effect
  // bounds the visible gap after a resume to roughly "actual time spent backgrounded" by firing
  // one immediate catch-up ping, instead of silently waiting for the next scheduled tick — and
  // it goes through the same slot gate, so it can never write a duplicate record next to a
  // transmission that just went out.
  useEffect(() => {
    if (!isOnline || !driver) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        wentBackgroundAtRef.current = Date.now();
        // Hand the cadence to the OS background task: from here on pollOnce() must not transmit
        // (its timer can still fire briefly on Android) or it would write beside the task.
        setTransmitter('background');
        return;
      }

      if (nextState !== 'active') return;
      // Take the cadence back before anything below claims a slot, so the task stops being the
      // transmitter the moment the app is visible again — and make sure the background
      // registration this resume is replacing actually exists (it may never have been started:
      // startBackgroundUpdates() refuses to run while the app is backgrounded).
      setTransmitter('foreground');
      if (trackingMode === 'mobile_app') await startBackgroundUpdates();

      const wentBackgroundAt = wentBackgroundAtRef.current;
      wentBackgroundAtRef.current = null;
      if (!wentBackgroundAt) return;
      if (Date.now() - wentBackgroundAt < BACKGROUND_CATCHUP_THRESHOLD_MS) return;
      if (trackingMode !== 'mobile_app') return;

      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude, heading, speed } = position.coords;

        setCurrentLat(latitude);
        setCurrentLng(longitude);

        const nextHeading = heading != null && heading >= 0 ? heading : headingDeg;
        const nextSpeedKmh = speed != null && speed >= 0 ? Number((speed * 3.6).toFixed(1)) : speedKmh;
        setHeadingDeg(nextHeading);
        setSpeedKmh(nextSpeedKmh);

        // Same gate as the watcher tick: if a transmission already went out inside the last
        // 15 seconds — very likely from the background task we just took the cadence back from —
        // this resume has no gap to fill and writes nothing.
        if (!(await claimTransmitSlotAsync())) return;

        sendPing({
          latitude,
          longitude,
          speed_kmh: nextSpeedKmh,
          heading_deg: nextHeading,
          recorded_at: new Date().toISOString(),
        });
      } catch {
        // No fix available on resume (permission revoked, GPS off, etc.) — the next natural
        // watcher tick picks tracking back up if/when it can; never let this crash the app.
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, driver?.id, trackingMode]);

  // Restore an in-progress ride (or a pending request already waiting) and pull real trip
  // history from the backend as soon as the driver is known. Falls back to the local demo
  // data above if the backend is unreachable, matching the rest of the auth flow.
  useEffect(() => {
    if (!driver) return;
    let cancelled = false;

    // Push the client's current online/available state to the backend so the dispatch
    // gate (which reads driver.is_online / is_available) matches what the app displays
    // from the very first screen after login, instead of whatever was last saved. If TMO has
    // suspended/revoked this driver since the local "online" flag was last persisted, the
    // backend rejects this and the local state must fall back to offline instead of showing
    // "Online" for a session the server never actually accepted.
    driverApi.updateOnlineStatus(isOnline, isAvailable).catch(() => {
      setIsOnlineState(false);
      setIsAvailableState(false);
    });

    (async () => {
      try {
        const res = await driverApi.getActiveBooking(driver.id);
        if (cancelled || !res?.booking) return;
        const booking = res.booking;
        // Only restore a genuinely ASSIGNED ride (driver_id === this driver) after an app
        // restart. When the driver has no assignment, this same endpoint's backend fallback
        // returns "the nearest pending request in your zone" as a generic thing-to-look-at —
        // that is NOT an offer routed to this driver, and must not be treated as one. Showing
        // it as `incomingBooking` was why a driver would see the same unclaimed pending request
        // (sometimes belonging to an entirely different passenger) reappear as their own
        // incoming request on every login. Actual incoming requests are already discovered
        // correctly by the dedicated getPendingRequests() poll below, which does apply the real
        // eligibility filtering — this branch was redundant with it and wrong besides.
        if (ACTIVE_RIDE_STATUSES.includes(booking.status)) {
          setActiveBooking(mapBookingRecordToIncoming(booking));
          setRideState(booking.status);
          setIsAvailableState(false);
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [driver?.id]);

  // Refreshes ride history periodically, not just once at login. A rating is submitted by the
  // passenger on their own separate screen, at their own pace — very often AFTER this driver's
  // history was already fetched once — so a one-time fetch would never pick it up, and with no
  // pull-to-refresh anywhere in this screen, the driver would only ever see it after force-
  // restarting the app. This mirrors the same "always replace on success, even if empty" fix
  // already applied above, just re-run periodically instead of once.
  useEffect(() => {
    if (!driver) return;
    let cancelled = false;

    const fetchHistory = async () => {
      try {
        const res = await driverApi.getHistory(driver.id);
        if (cancelled) return;
        const rawList = res?.bookings || res?.history || [];
        const finished = rawList.filter((b: any) => b.status === 'completed' || b.status === 'cancelled');
        setHistoryList(finished.map(mapBookingRecordToHistoryItem));
      } catch {}
    };

    fetchHistory();
    const interval = setInterval(fetchHistory, HISTORY_REFRESH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [driver?.id]);

  // Real violations, fetched from the backend — and refreshed periodically for the same reason
  // ride history is: an appeal's status changes on the TMO/admin side, at its own pace, with no
  // pull-to-refresh on this screen, so a one-time fetch would never pick up a decision made while
  // the driver already has the app open.
  const refreshViolations = async () => {
    try {
      const res = await driverApi.getViolations();
      const rawList = res?.violations || [];
      setViolations(rawList.map(mapViolationRecordToCitation));
      setViolationsError(null);
    } catch {
      setViolationsError('Could not load your violations. Check your connection and try again.');
    } finally {
      setIsLoadingViolations(false);
    }
  };

  useEffect(() => {
    if (!driver) return;
    let cancelled = false;
    // Re-enter the loading state for this driver's own first fetch — relevant if a different
    // driver logs in without the app fully remounting, so their view doesn't briefly show the
    // previous driver's already-settled loading/error state.
    setIsLoadingViolations(true);
    setViolationsError(null);

    const run = async () => {
      if (cancelled) return;
      await refreshViolations();
    };

    run();
    const interval = setInterval(run, HISTORY_REFRESH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver?.id]);

  const submitViolationAppeal = async (
    violationId: number,
    reason: string,
    proof?: { uri: string; name: string; type: string }
  ) => {
    const res = await driverApi.submitAppeal(violationId, reason, proof);
    if (res?.violation) {
      const updated = mapViolationRecordToCitation(res.violation);
      setViolations((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    } else {
      // Fall back to a full refetch if the response shape is unexpected, rather than leaving
      // stale local state after a successful submission.
      await refreshViolations();
    }
  };

  // Poll for a new pending ride request whenever the driver is online, available, and idle.
  //
  // Deliberately keeps polling even once `incomingBooking` is set (unlike the old guard here,
  // which stopped the poll entirely the moment a request was shown) — that gap meant nothing ever
  // re-checked whether the request being displayed was still valid, so DriverDispatchScreen could
  // stay open indefinitely showing a booking the passenger had already cancelled, or that another
  // driver had already accepted. Uses the functional setState form specifically so `incomingBooking`
  // doesn't need to be a dependency (it's read as `prev` instead) — the effect's identity should be
  // driven by online/available/rideState/driver, not by the very state this poll maintains.
  useEffect(() => {
    const canReceiveRequests = isOnline && isAvailable && rideState === 'idle' && !activeBooking && !!driver;

    if (!canReceiveRequests || !driver) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await driverApi.getPendingRequests(driver.id);
        if (cancelled) return;
        const list: any[] = res?.requests || [];

        setIncomingBooking((prev) => {
          if (prev) {
            // Already showing a specific request to the driver — only check whether THAT one is
            // still present (still pending, still theirs to decide on). Never swap to a
            // different pending request out from under them mid-decision.
            const stillValid = list.some((b) => String(b.id) === String(prev.id));
            if (!stillValid) {
              showToast('This ride request is no longer available.', 'info');
              return null;
            }
            return prev;
          }
          // Nothing shown yet — surface the newest eligible request, same as before.
          return list.length > 0
            ? mapBookingRecordToIncoming(list[0], currentLat ?? undefined, currentLng ?? undefined)
            : null;
        });
      } catch {}
    };

    poll();
    const interval = setInterval(poll, PENDING_REQUEST_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, isAvailable, rideState, !!activeBooking, driver?.id]);

  // Poll the driver's own active booking so a passenger-initiated cancellation is discovered —
  // nothing else currently pushes that change to the driver app. Scoped to the specific booking
  // id (not the generic "what's my current assignment" lookup) so a cancelled ride is never
  // reinterpreted as "no active ride, here's a new pending one instead."
  useEffect(() => {
    if (!driver || !activeBooking || rideState === 'idle' || rideState === 'fare_collect') return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await driverApi.getActiveBooking(driver.id, activeBooking.id);
        if (cancelled) return;
        if (res?.booking?.status === 'cancelled') {
          // Alert.alert is a documented no-op on react-native-web — this silently vanished there,
          // leaving the driver's screen reset with no explanation of why.
          showToast('The passenger cancelled this ride.', 'info');
          setActiveBooking(null);
          setRideState('idle');
          setIsAvailableState(true);
        }
      } catch {}
    };

    const interval = setInterval(poll, PENDING_REQUEST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [driver?.id, activeBooking?.id, rideState]);

  const setIsOnline = (online: boolean) => {
    const previousOnline = isOnline;
    const previousAvailable = isAvailable;
    setIsOnlineState(online);
    setIsAvailableState(online);
    if (driver) {
      // The backend is the authority on whether this driver may actually go online (e.g. TMO
      // has suspended/revoked them since this screen last loaded) — a rejection here must revert
      // the optimistic toggle and tell the driver why, not leave the UI showing "Online" while
      // the server never accepted it.
      driverApi.updateOnlineStatus(online, online).catch((err: any) => {
        setIsOnlineState(previousOnline);
        setIsAvailableState(previousAvailable);
        showToast(
          err?.message || 'Could not update your online status. Please check your connection and try again.',
          'info'
        );
      });
    }
  };

  const setIsAvailable = (avail: boolean) => {
    const previousAvailable = isAvailable;
    setIsAvailableState(avail);
    if (driver) {
      driverApi.updateOnlineStatus(isOnline, avail).catch((err: any) => {
        setIsAvailableState(previousAvailable);
        showToast(
          err?.message || 'Could not update your availability. Please check your connection and try again.',
          'info'
        );
      });
    }
  };

  // Server-authoritative: the backend's response decides whether this driver actually got the
  // ride, not the act of tapping Accept. Two drivers can tap Accept on the same booking; only
  // one request wins server-side, and the loser gets HTTP 409 — this must NOT be treated as a
  // generic error, and the driver must NOT be moved into the active-ride state until the backend
  // confirms the assignment.
  const acceptBooking = async () => {
    if (!incomingBooking || !driver) return;
    const requestedBooking = incomingBooking;

    try {
      const res = await driverApi.acceptBooking(requestedBooking.id, driver.id);
      const confirmed = res?.booking
        ? mapBookingRecordToIncoming(res.booking, currentLat ?? undefined, currentLng ?? undefined)
        : requestedBooking;
      setActiveBooking(confirmed);
      setIncomingBooking(null);
      setIsAvailableState(false);
      setRideState('accepted');
    } catch (err: any) {
      if (err?.status === 409) {
        showToast('Another driver already accepted this request.', 'info');
        setIncomingBooking(null);
        return;
      }
      showToast(err?.message || 'Could not accept this ride. Please check your connection and try again.', 'info');
    }
  };

  // Persists the decline server-side (see driverApi.declineBooking) so getPendingRequests()
  // stops re-offering this exact request to this driver on the very next poll — previously this
  // only cleared local state, so the same booking (still 'pending' for every other driver) came
  // right back on the next 6-second tick. Fire-and-forget: the UI clears immediately either way,
  // same as before, since there's nothing for the driver to wait on here.
  const declineBooking = () => {
    if (incomingBooking) {
      driverApi.declineBooking(incomingBooking.id).catch(() => {});
    }
    setIncomingBooking(null);
  };

  // Server-authoritative, matching acceptBooking: wait for the backend to confirm the status
  // transition before changing the local rideState. If the request fails (or the backend
  // rejects an invalid transition), the driver's screen must NOT silently move forward — it
  // stays exactly where it was, with a real error shown, instead of pretending the update
  // happened just because the button was tapped.
  const setStatusArrived = async () => {
    if (!activeBooking) return;
    try {
      await driverApi.updateStatus(activeBooking.id, 'arrived');
      setRideState('arrived');
    } catch (err: any) {
      showToast(err?.message || 'Could not update your status. Please check your connection and try again.', 'info');
    }
  };

  const setStatusInTransit = async () => {
    if (!activeBooking) return;
    try {
      await driverApi.updateStatus(activeBooking.id, 'in_transit');
      setRideState('in_transit');
    } catch (err: any) {
      showToast(err?.message || 'Could not start the ride. Please check your connection and try again.', 'info');
    }
  };

  // Server-authoritative cancellation for the pickup/en-route phase. The backend rejects this
  // once the booking is past 'accepted' (see BookingController::updateStatus), so this never
  // trusts local state alone — a rejection here (e.g. the driver tapped Arrived on another
  // device a moment earlier) leaves activeBooking/rideState untouched and surfaces a toast,
  // matching the same server-confirms-first pattern as setStatusArrived/setStatusInTransit.
  const cancelActiveBooking = async (): Promise<boolean> => {
    if (!activeBooking) return false;
    try {
      await driverApi.updateStatus(activeBooking.id, 'cancelled');
      setActiveBooking(null);
      setRideState('idle');
      setIsAvailableState(true);
      return true;
    } catch (err: any) {
      showToast(err?.message || 'Could not cancel this ride. Please check your connection and try again.', 'info');
      return false;
    }
  };

  const completeTrip = async () => {
    if (!activeBooking) return;
    const fare = activeBooking.fare;
    try {
      await driverApi.updateStatus(activeBooking.id, 'completed');
      setFareToCollect(fare);
      setRideState('fare_collect');
    } catch (err: any) {
      showToast(err?.message || 'Could not complete the ride. Please check your connection and try again.', 'info');
    }
  };

  const finishAndCollectFare = () => {
    const fare = fareToCollect ?? activeBooking?.fare ?? 45.0;
    // todayEarnings/completedTripsCount are derived from historyList (see above) — adding this
    // completed ride to it below is what updates them; there's no separate counter to bump.

    if (activeBooking) {
      const now = new Date();
      addToHistory({
        id: Date.now(),
        bookingCode: activeBooking.bookingCode,
        passengerName: activeBooking.passengerName,
        pickup: activeBooking.pickup,
        dropoff: activeBooking.dropoff,
        distanceKm: activeBooking.distanceKm,
        fare,
        passengerCount: activeBooking.passengerCount,
        farePerPassenger: activeBooking.farePerPassenger,
        date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: now.toISOString(),
        status: 'completed',
        paymentMethod: activeBooking.paymentMethod || 'cash',
      });
    }

    setActiveBooking(null);
    setFareToCollect(null);
    setRideState('idle');
    setIsAvailableState(true);
  };

  const updateTrackingMode = async (mode: 'mobile_app' | 'iot_device', iotId?: string) => {
    setTrackingMode(mode);
    if (iotId) setIotDeviceId(iotId);
    try {
      await driverApi.setTrackingMode(mode, iotId);
    } catch {}
  };

  return (
    <DriverShiftContext.Provider
      value={{
        isOnline,
        setIsOnline,
        isAvailable,
        setIsAvailable,
        trackingMode,
        iotDeviceId,
        updateTrackingMode,
        currentLat,
        currentLng,
        isLocatingDriver,
        locationError,
        retryLocation,
        speedKmh,
        headingDeg,
        violations,
        isLoadingViolations,
        violationsError,
        refreshViolations,
        submitViolationAppeal,
        activeSpeedWarning,
        codingWarning,
        incomingBooking,
        setIncomingBooking,
        activeBooking,
        setActiveBooking,
        rideState,
        setRideState,
        fareToCollect,
        setFareToCollect,
        todayEarnings,
        completedTripsCount,
        totalCompletedRides,
        averageRating,
        historyList,
        acceptBooking,
        declineBooking,
        setStatusArrived,
        setStatusInTransit,
        completeTrip,
        finishAndCollectFare,
        cancelActiveBooking,
      }}
    >
      {children}
    </DriverShiftContext.Provider>
  );
}

export function useDriverShift(): DriverShiftContextType {
  const context = useContext(DriverShiftContext);
  if (!context) {
    throw new Error('useDriverShift must be used within a DriverShiftProvider');
  }
  return context;
}
