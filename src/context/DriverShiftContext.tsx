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
import { useCurrentLocation } from '../hooks/useCurrentLocation';
import {
  driverApi,
  mapBookingRecordToIncoming,
  mapBookingRecordToHistoryItem,
  mapViolationRecordToCitation,
} from '../services/api';
import { MUNICIPAL_SPEED_LIMIT_KMH, checkColorCodingViolation } from '../constants/todaRoutes';
import { ViolationCitation, IncomingBooking, RideHistoryItem } from '../types';
import { LOCATION_TASK_NAME, LOCATION_EVENT_NAME, TRACKING_MODE_STORAGE_KEY, IS_ONLINE_STORAGE_KEY } from '../tasks/locationTask';

const ACTIVE_RIDE_STATUSES = ['accepted', 'arrived', 'in_transit'] as const;
const PENDING_REQUEST_POLL_MS = 6000;
// History doesn't need to be near-real-time, just eventually consistent without requiring an
// app restart — a passenger's rating can land any time after their ride completes.
const HISTORY_REFRESH_POLL_MS = 15000;
// Target GPS reporting cadence, passed to Location.watchPositionAsync. Fixed at the project's
// required 60-second interval — do not lower this without a corresponding change to the backend/
// TMO staleness thresholds that are derived from it (see ColorCodingRuleService/tracking config on
// the backend). Every fix is sent regardless of movement — there is deliberately no distance/
// movement filter on the sending decision (see applyFix below), so a stationary tricycle still
// reports on this same cadence.
const WATCH_TIME_INTERVAL_MS = 60000;
// How long the app can sit backgrounded before a resume is treated as needing an immediate
// catch-up ping rather than just waiting for the next natural watcher tick — one interval's
// worth of gap is the threshold, so the visible gap after resuming is bounded to roughly the
// actual time spent backgrounded, not "backgrounded time + up to another 60s."
const BACKGROUND_CATCHUP_THRESHOLD_MS = WATCH_TIME_INTERVAL_MS;

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

      if (Platform.OS === 'web') return;
      try {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isTracking && !restoredOnline) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
          if (__DEV__) {
            console.warn('[telemetry] Stopped an orphaned background location task from a previous session (app was likely force-quit while still online).');
          }
        }
      } catch {
        // hasStartedLocationUpdatesAsync/stopLocationUpdatesAsync aren't available in every
        // environment (e.g. Expo Go never has a real task registered to begin with) — nothing to
        // reconcile in that case, and this must never crash app startup either way.
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

  const isToday = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  const todaysCompletedHistory = useMemo(
    () => completedHistory.filter((h) => isToday(h.date)),
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

  // Single send path used by both the steady 60s watcher tick and the AppState catch-up ping
  // below. If a previous send failed and is still pending, flushes it alongside this reading via
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

  // Continuous real-GPS tracking while online — the same trigger condition the old simulated
  // interval used, since every state that needs live position (available, dispatched, en route to
  // pickup, in transit) is only reachable while online. Every fix is applied and sent — no
  // distance/movement filter — so a stationary tricycle still reports on the same fixed cadence
  // as a moving one (required for reliable coding-violation GPS coverage while parked).
  //
  // Native (iOS/Android): tries Location.startLocationUpdatesAsync + the locationTask.ts
  // TaskManager task first — this keeps delivering fixes (and, inside the task itself, sending
  // them) while the app is backgrounded or the screen is locked, subject to the OS/platform
  // limits documented in locationTask.ts and below. That API is NOT supported in Expo Go on
  // either platform (Expo's own documented limitation) — if it throws, this falls back to the
  // same active-poll approach as web (see pollOnce below). Only one of the two is ever active at
  // once per shift.
  //
  // Why polling, not watchPositionAsync, for the fallback: a passive watch has no guaranteed
  // schedule — observed directly against this project's backend logs, it sent reliably for a few
  // cycles then silently stopped firing altogether while the app was still open (iOS's Balanced
  // accuracy can decide there's "nothing new" to report). Actively requesting a fresh fix on a
  // fixed timer guarantees a request every interval regardless of what the native layer thinks.
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
    let bgUpdatesStarted = false;

    // Updates only the on-screen state (map position, heading, speed) — never sends anything.
    // Shared by the web poll and the native background-task event listener below.
    const applyFixState = (coords: { latitude: number; longitude: number; heading: number | null; speed: number | null }) => {
      const { latitude, longitude, heading, speed } = coords;
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
      try {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (cancelled) return;
        const { nextHeading, nextSpeedKmh } = applyFixState(position.coords);
        if (trackingMode === 'mobile_app') {
          sendPing({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            speed_kmh: nextSpeedKmh ?? speedKmh,
            heading_deg: nextHeading ?? headingDeg,
            recorded_at: new Date().toISOString(),
          });
        }
      } catch {
        // A single failed poll (transient permission hiccup, no fix available this tick) must not
        // stop future polls — the interval simply tries again next tick.
      }
    };

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || status !== 'granted') return;

        if (Platform.OS === 'web') {
          // No background task exists for web — this is foreground only, unavoidably.
          await pollOnce();
          if (!cancelled) activePollTimer = setInterval(pollOnce, WATCH_TIME_INTERVAL_MS);
          return;
        }

        // Background permission is requested in addition to foreground — without it, iOS never
        // delivers updates once the app is backgrounded (Android still delivers via the
        // foreground service either way, but the OS-level "Allow all the time" prompt is still
        // the honest ask here). Best-effort: some environments (Expo Go) don't support this call
        // at all, so a rejection here must not stop the foreground fallback below from working.
        await Location.requestBackgroundPermissionsAsync().catch(() => {});
        if (cancelled) return;

        try {
          bgEventSubscription = DeviceEventEmitter.addListener(LOCATION_EVENT_NAME, (fix: { latitude: number; longitude: number; heading: number; speedKmh: number }) => {
            applyFixState({ latitude: fix.latitude, longitude: fix.longitude, heading: fix.heading, speed: null });
            // Sending is handled entirely inside locationTask.ts (it has its own 60s gate and
            // pending-ping retry persisted in AsyncStorage) — this listener only drives the UI.
          });

          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: WATCH_TIME_INTERVAL_MS,
            distanceInterval: 0,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
              notificationTitle: 'Trivora — Shift Active',
              notificationBody: 'Sending your GPS location for coding-violation monitoring while your shift is active.',
            },
          });
          if (cancelled) {
            await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
            return;
          }
          bgUpdatesStarted = true;
        } catch (bgErr) {
          // startLocationUpdatesAsync is NOT supported in Expo Go on either platform (Expo's own
          // documented limitation) and can also fail if background permission was denied. Rather
          // than sending nothing at all in that case, fall back to the same active-poll approach
          // web uses — this is what keeps Expo Go testing working; a real dev-client/production
          // build gets the real background path above instead.
          if (__DEV__) {
            console.warn('[telemetry] startLocationUpdatesAsync unavailable, falling back to foreground polling:', (bgErr as Error)?.message || bgErr);
          }
          bgEventSubscription?.remove();
          bgEventSubscription = null;

          await pollOnce();
          if (!cancelled) activePollTimer = setInterval(pollOnce, WATCH_TIME_INTERVAL_MS);
        }
      } catch {
        // Native module unavailable, permission API unsupported in this environment, etc. — never
        // let a GPS failure take down the app; the driver simply keeps whatever position (or
        // null) they already had, and the screen-level LocationPendingView explains it.
      }
    })();

    return () => {
      cancelled = true;
      if (activePollTimer) clearInterval(activePollTimer);
      bgEventSubscription?.remove();
      if (bgUpdatesStarted) {
        Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, trackingMode, driver?.id]);

  // Defensive fallback, now that real background tracking exists via locationTask.ts — OEM battery
  // optimizers (Xiaomi/Huawei/Samsung's aggressive background-kill policies) or a driver who only
  // granted "While Using" location on iOS can still cause the background task to be silently
  // starved despite being correctly registered. This effect bounds the visible gap after a resume
  // to roughly "actual time spent backgrounded" by firing one immediate catch-up ping, instead of
  // silently waiting up to another full 60s for the next tick — harmless if the background task
  // was already delivering fine (the backend's per-day dedup means an extra ping never double-
  // counts a violation).
  useEffect(() => {
    if (!isOnline || !driver) return;

    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        wentBackgroundAtRef.current = Date.now();
        return;
      }

      if (nextState !== 'active') return;

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
    // from the very first screen after login, instead of whatever was last saved.
    driverApi.updateOnlineStatus(isOnline, isAvailable).catch(() => {});

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
    setIsOnlineState(online);
    setIsAvailableState(online);
    if (driver) {
      driverApi.updateOnlineStatus(online, online).catch(() => {});
    }
  };

  const setIsAvailable = (avail: boolean) => {
    setIsAvailableState(avail);
    if (driver) {
      driverApi.updateOnlineStatus(isOnline, avail).catch(() => {});
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
