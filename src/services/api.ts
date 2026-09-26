import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DriverProfile, IncomingBooking, ViolationCitation } from '../types';

function getDefaultApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  const isPlaceholder = Boolean(envUrl && envUrl.includes('your-ngrok-url'));

  // Web runs on the local machine where Laravel is on port 8000; connect directly
  // rather than routing through an external tunnel or LAN IP heuristic.
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8000/api/v1';
      }
      if (hostname && (!envUrl || isPlaceholder)) {
        return `http://${hostname}:8000/api/v1`;
      }
    }
    if (envUrl && !isPlaceholder) {
      return envUrl;
    }
    return 'http://localhost:8000/api/v1';
  }

  // Explicit override (Render cloud host or real ngrok tunnel) takes priority on mobile
  if (envUrl && !isPlaceholder) {
    return envUrl;
  }

  // In Expo Go on physical device connected via LAN (not --tunnel), hostUri holds the
  // development machine's LAN IP.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:8000/api/v1`;
    }
  }

  // Standalone app / physical device fallback: default to live Render backend
  if (!__DEV__) {
    return 'https://trivora-mh55.onrender.com/api/v1';
  }

  // Fallback for Android emulator connecting to host PC
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }

  return 'http://localhost:8000/api/v1';
}

let API_BASE_URL = getDefaultApiBaseUrl();

// Dev-only: makes a wrong/unreachable base URL (e.g. still resolving to localhost on a physical
// device, or a stale LAN IP after the PC switched networks) visible in the Metro console instead
// of silently failing every request with no trace — this exact class of bug is why GPS telemetry
// can look "sent" from the UI but never reach the backend.
if (__DEV__) {
  console.log(`[api] Resolved API_BASE_URL: ${API_BASE_URL}`);
}

export function setApiBaseUrl(url: string) {
  API_BASE_URL = url;
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

let authToken: string | null = null;

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setOnUnauthorized(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  // FormData bodies (appeal proof upload) must NOT get a manual Content-Type — fetch/RN needs to
  // set 'multipart/form-data; boundary=...' itself, which only happens when the header is absent.
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    Accept: 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/login') && unauthorizedHandler) {
      unauthorizedHandler();
    }
    const errorMsg = (data && data.message) || `HTTP Error ${response.status}`;
    const err = new Error(errorMsg) as any;
    err.data = data;
    err.status = response.status;
    throw err;
  }

  return data as T;
}

/**
 * Appends a locally-picked file to a FormData body. On native, RN's networking layer
 * understands the `{uri, name, type}` object shape directly. On web, it does not — an
 * expo-image-picker asset's `uri` there is a blob:/data: URL, and appending that object as-is
 * produces no real file part at all (the backend's `image` validation then fails outright, even
 * for a genuinely valid picture), so it must be fetched into a real Blob first.
 */
async function appendFileToFormData(
  form: FormData,
  fieldName: string,
  file: { uri: string; name: string; type: string }
): Promise<void> {
  if (Platform.OS === 'web') {
    const response = await fetch(file.uri);
    const blob = await response.blob();
    form.append(fieldName, blob, file.name);
  } else {
    form.append(fieldName, { uri: file.uri, name: file.name, type: file.type } as any);
  }
}

export const driverApi = {
  /** Step 1 of registration — the franchise permit number is the ONLY verification input
   * (no date of birth, no name). The response carries the franchise's registered people for
   * the user to select which one this account belongs to. */
  verifyEligibility: async (franchiseNumber: string) => {
    return request('/driver/verify-eligibility', {
      method: 'POST',
      body: JSON.stringify({
        franchise_number: franchiseNumber,
      }),
    });
  },

  register: async (payload: any) => {
    return request('/driver/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Driver login — the person's EXISTING registered mobile number + password (email is no
   * longer part of the login flow). */
  login: async (mobile: string, password: string) => {
    return request('/driver/login', {
      method: 'POST',
      body: JSON.stringify({ login: mobile, password }),
    });
  },

  /** Validates the current token and returns the driver's latest profile — used to restore a
   * session after a cold start (app relaunch/reload) instead of forcing a fresh login. */
  me: async () => {
    return request('/driver/me');
  },

  getPendingRequests: async (driverId: number | string) => {
    return request(`/driver/bookings/pending?driver_id=${driverId}`);
  },

  acceptBooking: async (bookingId: number | string, driverId: number | string) => {
    return request(`/driver/bookings/${bookingId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ driver_id: driverId }),
    });
  },

  /** Records this driver's decline server-side (see BookingController::declineBooking) so
   * getPendingRequests() stops re-offering the same request to them — the booking itself is
   * untouched and stays visible to every other eligible driver in the zone. */
  declineBooking: async (bookingId: number | string) => {
    return request(`/driver/bookings/${bookingId}/decline`, { method: 'POST' });
  },

  updateStatus: async (bookingId: number | string, status: string, reason: string | null = null) => {
    return request(`/driver/bookings/${bookingId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, cancellation_reason: reason }),
    });
  },

  getActiveBooking: async (driverId: number | string, bookingId?: number | string) => {
    // A bookingId bypasses the "what's my current assignment" branching entirely and looks up
    // that specific booking directly (same backend codepath the passenger app already uses) —
    // needed to check on the driver's OWN active ride's status without it being reinterpreted
    // as "find me a new one" once the original booking is no longer in an active status
    // (e.g. right after the passenger cancels it).
    const params = new URLSearchParams({ driver_id: String(driverId) });
    if (bookingId) params.append('booking_id', String(bookingId));
    return request(`/driver/bookings/active?${params.toString()}`);
  },

  getHistory: async (driverId: number | string) => {
    return request(`/driver/bookings/history?driver_id=${driverId}`);
  },

  updateOnlineStatus: async (isOnline: boolean, isAvailable?: boolean) => {
    return request('/driver/status', {
      method: 'POST',
      body: JSON.stringify({ is_online: isOnline, is_available: isAvailable ?? null }),
    });
  },

  logout: async () => {
    return request('/driver/logout', { method: 'POST' });
  },

  // Appends to the tricycle_locations violation-detection log AND updates the driver's own
  // current_lat/current_lng (DriverTelematicsController::store does both in one request as of
  // the GPS-interval retune), so this single call is now what the Passenger app's active-booking
  // polling reads too — the shift watcher no longer needs a separate updateLocation call.
  sendTelematics: async (telemetry: any) => {
    return request('/driver/telematics', {
      method: 'POST',
      body: JSON.stringify(telemetry),
    });
  },

  // Flushes up to 100 pings queued while offline in one request (DriverTelematicsController::
  // batchStore). Used by the shift watcher's single-slot pending-ping buffer to catch up after a
  // dropped send, not for a general offline queue.
  sendTelematicsBatch: async (pings: any[]) => {
    return request('/driver/telematics/batch', {
      method: 'POST',
      body: JSON.stringify({ pings }),
    });
  },

  // Kept for the passenger-facing active-booking path (BookingController::updateDriverLocation),
  // which may still want a tighter-than-15s cadence during an active ride in a future pass — the
  // shift-wide watcher itself no longer calls this, since sendTelematics now covers current_lat/
  // current_lng too.
  updateLocation: async (driverId: number | string, latitude: number, longitude: number) => {
    return request(`/driver/location?driver_id=${driverId}`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    });
  },

  setTrackingMode: async (mode: string, iotDeviceId: string | null = null) => {
    return request('/driver/telemetry-mode', {
      method: 'POST',
      body: JSON.stringify({ mode, iot_device_id: iotDeviceId }),
    });
  },

  getViolations: async () => {
    return request('/driver/violations');
  },

  /** `proof` is a local file URI (from the image picker/camera) — omit it to submit without evidence. */
  submitAppeal: async (violationId: number, reason: string, proof?: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    form.append('reason', reason);
    if (proof) {
      await appendFileToFormData(form, 'proof', proof);
    }
    return request(`/driver/violations/${violationId}/appeal`, {
      method: 'POST',
      body: form,
    });
  },

  /** `photo` is a local file URI from the image picker/camera. Replaces any existing photo. */
  uploadProfilePhoto: async (photo: { uri: string; name: string; type: string }) => {
    const form = new FormData();
    await appendFileToFormData(form, 'photo', photo);
    return request('/driver/profile-photo', {
      method: 'POST',
      body: form,
    });
  },

  removeProfilePhoto: async () => {
    return request('/driver/profile-photo', { method: 'DELETE' });
  },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Maps a raw Eloquent Booking record (from GET /driver/bookings/pending or /active) into the app's IncomingBooking shape. */
export function mapBookingRecordToIncoming(
  raw: any,
  driverLat?: number,
  driverLng?: number
): IncomingBooking {
  const passenger = raw.passenger || {};
  const passengerUser = passenger.user || {};

  let pickupDistanceKm: number | undefined;
  let pickupEtaMinutes: number | undefined;
  if (driverLat != null && driverLng != null && raw.pickup_lat != null && raw.pickup_lng != null) {
    pickupDistanceKm = Number(
      haversineKm(driverLat, driverLng, Number(raw.pickup_lat), Number(raw.pickup_lng)).toFixed(1)
    );
    pickupEtaMinutes = Math.max(1, Math.round((pickupDistanceKm / 20) * 60));
  }

  return {
    id: raw.id,
    bookingCode: raw.booking_code,
    passengerName: passengerUser.name || 'Passenger',
    passengerAvatarUrl: passengerUser.profile_photo_url || undefined,
    passengerMobile: passenger.mobile_number || '',
    passengerTrips: passenger.total_rides ?? 0,
    pickup: raw.pickup_name,
    dropoff: raw.dropoff_name,
    pickupLat: raw.pickup_lat != null ? Number(raw.pickup_lat) : undefined,
    pickupLng: raw.pickup_lng != null ? Number(raw.pickup_lng) : undefined,
    dropoffLat: raw.dropoff_lat != null ? Number(raw.dropoff_lat) : undefined,
    dropoffLng: raw.dropoff_lng != null ? Number(raw.dropoff_lng) : undefined,
    pickupDistanceKm,
    pickupEtaMinutes,
    distanceKm: Number(raw.distance_km ?? 0),
    fare: Number(raw.fare_amount ?? 0),
    passengerCount: Number(raw.passenger_count ?? 1),
    farePerPassenger: Number(raw.fare_per_passenger ?? raw.fare_amount ?? 0),
    todaZoneName: raw.toda_zone?.name || 'General Service',
    rating: Number(passenger.rating ?? 5.0),
    paymentMethod: raw.payment_method === 'gcash' ? 'gcash' : 'cash',
    passengerNotes: raw.passenger_notes || null,
    dispatchedAt: raw.dispatched_at || null,
  };
}

/** Maps a raw completed/cancelled Booking record (from GET /driver/bookings/history) into the app's RideHistoryItem shape. */
export function mapBookingRecordToHistoryItem(raw: any) {
  const passengerUser = raw.passenger?.user || {};
  const completedAt = raw.completed_at || raw.cancelled_at || raw.requested_at;
  const dateObj = completedAt ? new Date(completedAt) : new Date();

  return {
    id: raw.id,
    bookingCode: raw.booking_code,
    passengerName: passengerUser.name || 'Passenger',
    passengerAvatarUrl: passengerUser.profile_photo_url || undefined,
    pickup: raw.pickup_name,
    dropoff: raw.dropoff_name,
    pickupLat: raw.pickup_lat != null ? Number(raw.pickup_lat) : undefined,
    pickupLng: raw.pickup_lng != null ? Number(raw.pickup_lng) : undefined,
    dropoffLat: raw.dropoff_lat != null ? Number(raw.dropoff_lat) : undefined,
    dropoffLng: raw.dropoff_lng != null ? Number(raw.dropoff_lng) : undefined,
    distanceKm: Number(raw.distance_km ?? 0),
    durationMinutes: raw.estimated_duration_mins != null ? Number(raw.estimated_duration_mins) : undefined,
    fare: Number(raw.fare_amount ?? 0),
    passengerCount: Number(raw.passenger_count ?? 1),
    farePerPassenger: Number(raw.fare_per_passenger ?? raw.fare_amount ?? 0),
    date: dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: dateObj.toISOString(),
    status: (raw.status === 'completed' ? 'completed' : 'cancelled') as 'completed' | 'cancelled',
    paymentMethod: (raw.payment_method === 'gcash' ? 'gcash' : 'cash') as 'cash' | 'gcash',
    rating: raw.rating?.score != null ? Number(raw.rating.score) : null,
    ratingComment: raw.rating?.comment || null,
    ratingFeedbackTags: Array.isArray(raw.rating?.feedback_tags) ? raw.rating.feedback_tags : undefined,
  };
}

/** Maps a raw driver login/register API response into the app's DriverProfile shape. */
export function mapAuthResponseToDriverProfile(res: any, fallbackEmail?: string): DriverProfile {
  const rawDriver = res.driver || {};
  const operator = res.operator || {};
  const tricycle = res.tricycle || {};
  const franchise = res.franchise || {};

  return {
    id: rawDriver.id ?? res.user?.id ?? Date.now(),
    name: operator.full_name || res.user?.name || 'Driver',
    email: res.user?.email || fallbackEmail || '',
    mobile: rawDriver.mobile_number || undefined,
    licenseNumber: operator.license_number || rawDriver.license_number || '',
    todaZone: {
      id: 0,
      code: '',
      name: operator.toda_zone || tricycle.toda_zone || 'General Service',
      terminal: '',
      badgeColor: '#1B3A69',
      centerLat: 0,
      centerLng: 0,
      coverageKm: 3.0,
      baseFare: 20.0,
      perKmRate: 5.0,
    },
    tricycle: {
      id: tricycle.id ?? 0,
      plateNumber: tricycle.plate_number || 'N/A',
      codingNumber: tricycle.coding_scheme_number || tricycle.body_number || 'N/A',
      model: tricycle.make_model || `${tricycle.make || ''} ${tricycle.model || ''}`.trim() || 'N/A',
      iotDeviceId: undefined,
      activeTrackingMode: tricycle.active_tracking_mode === 'iot_device' ? 'iot_device' : 'mobile_app',
    },
    rating: Number(rawDriver.rating ?? 5.0),
    totalTrips: Number(rawDriver.total_trips ?? 0),
    todayEarnings: Number(rawDriver.today_earnings ?? 0),
    avatarUrl: res.user?.profile_photo_url || undefined,
    franchiseStatus: franchise.status === 'suspended' || franchise.status === 'revoked' ? franchise.status : 'active',
    franchiseStatusReason: franchise.status_reason ?? null,
    franchiseStatusChangedAt: franchise.status_changed_at ?? null,
  };
}

/** Maps a raw violation record (from GET /driver/violations) into the app's ViolationCitation
 * shape — driver_status/driver_status_label/can_appeal are computed server-side (see
 * DriverViolationController::driverFacingStatus), this just converts snake_case to camelCase. */
export function mapViolationRecordToCitation(raw: any): ViolationCitation {
  const detectedAt = raw.detected_at ? new Date(raw.detected_at) : null;
  const isResolved = raw.driver_status === 'resolved';

  return {
    id: raw.id,
    citationNo: raw.citation_no,
    type: raw.title,
    title: raw.title,
    description: raw.description || 'No additional details recorded.',
    fine: Number(raw.fine_amount ?? 0),
    date: detectedAt
      ? detectedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ' • ' +
        detectedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A',
    status: isResolved ? 'resolved' : 'pending',
    driverStatus: raw.driver_status,
    driverStatusLabel: raw.driver_status_label,
    canAppeal: !!raw.can_appeal,
    location: raw.location ? { latitude: Number(raw.location.latitude), longitude: Number(raw.location.longitude) } : null,
    appeal: raw.appeal
      ? {
          id: raw.appeal.id,
          reason: raw.appeal.reason,
          evidenceUrl: raw.appeal.evidence_url || null,
          status: raw.appeal.status,
          submittedAt: raw.appeal.submitted_at || null,
          reviewedAt: raw.appeal.reviewed_at || null,
          reviewNotes: raw.appeal.review_notes || null,
        }
      : null,
  };
}
