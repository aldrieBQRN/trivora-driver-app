/**
 * Trivora Driver - TypeScript Interfaces
 */

export interface TodaZone {
  id: number;
  code: string;
  name: string;
  terminal: string;
  badgeColor: string;
  centerLat: number;
  centerLng: number;
  coverageKm: number;
  baseFare: number;
  perKmRate: number;
}

export interface CodingStatus {
  is_restricted_today: boolean;
  evaluated_identifier?: string | null;
  last_digit?: number | null;
  scheme_id?: number | null;
  scheme_name?: string | null;
  color_hex?: string | null;
  restricted_days?: string[];
  restricted_digits?: number[];
  fine_amount?: number;
  status: string;
  status_label: string;
  warning_message?: string | null;
}

export interface TricycleUnit {
  id: number;
  plateNumber: string;
  codingNumber: string;
  model: string;
  iotDeviceId?: string;
  activeTrackingMode: 'mobile_app' | 'iot_device';
  unitCode?: string;
  stickerNumber?: string | null;
  passengerCapacity?: number | null;
  codingStatus?: CodingStatus | null;
}

export interface NearbyPlace {
  id: string;
  name: string;
  category: string;
  category_label?: string;
  latitude: number;
  longitude: number;
  address?: string;
}

export interface DriverQrCodeData {
  unit_code: string;
  sticker_number: string | null;
  plate_number: string;
  passenger_capacity: number | null;
  qr_token: string;
  qr_url: string;
  status: 'ready' | 'capacity_required' | 'not_ready';
  status_label: string;
  note: string;
  print_url?: string;
}

export interface DriverProfile {
  id: number;
  name: string;
  email: string;
  mobile?: string;
  licenseNumber: string;
  todaZone: TodaZone;
  tricycle: TricycleUnit;
  rating: number;
  totalTrips: number;
  todayEarnings: number;
  avatarUrl?: string | null;
  codingStatus?: CodingStatus | null;
  /** TMO-controlled operational authorization status of this driver's ASSIGNED FRANCHISE
   * (FranchiseScheme.status on the backend) — NOT a status on the driver's own account. A
   * driver's personal account/login is never suspended or revoked; only their franchise's
   * ability to operate is. Defaults to 'active' when a response omits it (e.g. the local
   * demo-mode profile, or no franchise assigned yet), never inferred client-side otherwise: the
   * backend is the source of truth and blocks operational actions (going online, bookings,
   * telematics) server-side regardless of what this field says. */
  franchiseStatus?: 'active' | 'suspended' | 'revoked';
  /** TMO's reason for the franchise's current suspension/revocation, if any — null while active. */
  franchiseStatusReason?: string | null;
  /** ISO timestamp of the franchise's last status change, if any. */
  franchiseStatusChangedAt?: string | null;
}

export type PaymentMethod = 'cash' | 'gcash';
export type PaymentStatus = 'unpaid' | 'payment_submitted' | 'paid';

export interface DriverGcashQrStatus {
  has_gcash_qr: boolean;
  configured?: boolean;
  gcash_qr_url: string | null;
  gcash_name: string | null;
  gcash_number: string | null;
}

export interface ViolationAppeal {
  id: number;
  reason: string;
  evidenceUrl: string | null;
  status: 'under_review' | 'approved' | 'rejected';
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
}

export interface ViolationCitation {
  id: number;
  citationNo: string;
  type: string;
  title: string;
  description: string;
  fine: number;
  date: string;
  detectedAt?: string | null;
  /** Simple binary state — kept for the existing All/Pending/Resolved filter tabs and badge tone. */
  status: 'pending' | 'resolved';
  /** The real lifecycle state, including appeal sub-states — see DriverViolationController's
   * driverFacingStatus() on the backend for the source of truth this mirrors. */
  driverStatus: 'pending' | 'appeal_under_review' | 'resolved' | 'fine_payment_required';
  driverStatusLabel: string;
  canAppeal: boolean;
  location: { latitude: number; longitude: number } | null;
  appeal: ViolationAppeal | null;
}

export interface CodingWarning {
  isViolation: boolean;
  title: string;
  day: string;
  lastDigit?: number | null;
  ruleInfo: string;
  advisory: string;
  fineAmount?: number | null;
  fineText?: string | null;
  description: string;
  colorHex?: string | null;
}

export interface IncomingBooking {
  id: number | string;
  bookingCode: string;
  passengerName: string;
  passengerMobile: string;
  passengerTrips?: number;
  /** The passenger's own uploaded photo, if any — falls back to the default passenger avatar
   * wherever it's rendered when absent. Never the driver's own photo. */
  passengerAvatarUrl?: string | null;
  pickup: string;
  dropoff: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  pickupDistanceKm?: number;
  pickupEtaMinutes?: number;
  distanceKm: number;
  fare: number;
  passengerCount: number;
  farePerPassenger: number;
  todaZoneName: string;
  rating: number;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentReference?: string | null;
  paymentAmountReceived?: number | null;
  paymentChangeAmount?: number | null;
  paidAt?: string | null;
  /** The passenger's optional note left at booking time (e.g. "waiting near blue gate") —
   * null/undefined when they left it blank. */
  passengerNotes?: string | null;
  /** ISO timestamp of when the backend targeted THIS driver for this booking
   * (Booking.dispatched_at) — the offer countdown is derived from this, not a fresh local timer,
   * so it stays correct even if the app was slow to render the request after the backend already
   * started the clock. Undefined only for bookings mapped from a context that never carries it
   * (e.g. ride history). */
  dispatchedAt?: string | null;
}

export interface RideHistoryItem {
  id: number | string;
  bookingCode: string;
  passengerName: string;
  passengerAvatarUrl?: string | null;
  pickup: string;
  dropoff: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  distanceKm: number;
  durationMinutes?: number;
  fare: number;
  passengerCount?: number;
  farePerPassenger?: number;
  date: string;
  time: string;
  /** Exact completion/cancellation time as an ISO timestamp — the value every date-range
   * calculation (Earnings periods, today's totals) must use. `date`/`time` above are display
   * strings only: Hermes (the app's JS engine) can't reliably parse "September 26, 2026" back into
   * a Date, which silently emptied every Earnings period. */
  timestamp?: string;
  /** True for a QR Ride / walk-in trip (booking_type = qr_walkin). */
  isWalkIn?: boolean;
  /** True for a Manual Ride recorded by the driver (booking_type = manual, no passenger account). */
  isManual?: boolean;
  status: 'completed' | 'cancelled';
  paymentMethod: PaymentMethod;
  /** Earnings are credited only once the driver confirms payment — 'paid' or not. */
  paymentStatus?: string;
  /** GCash reference the driver recorded, when paid by GCash. */
  paymentReference?: string | null;
  rating?: number | null;
  ratingComment?: string | null;
  ratingFeedbackTags?: string[];
}

/** Vehicle/GPS-config + person-selection fields carried from the registration flow's
 * "Select Person" step to the separate "Create Password" step where the actual account is
 * created. `personType` is WHICH of the franchise's verified people (the Tricycle Owner or
 * the separate assigned Tricycle Driver) this account belongs to — chosen from the list the
 * backend returned, never typed in. No other personal information lives here: name,
 * birthday, mobile, and barangay are read-only from the verified franchise record and are
 * never collected during registration. */
export interface PendingAccountInfo {
  trackingMode: 'mobile_app' | 'iot_device';
  iotDeviceId?: string;
  personType: 'owner' | 'driver';
}

/** Read-only EXISTING personal information of one person associated with the franchise —
 * either the Tricycle Owner or the separate assigned Tricycle Driver — offered as a
 * selectable choice for who will use the Driver App. Comes back from verify-eligibility
 * straight off the franchise/application record, never collected from the user, never
 * editable, and deliberately WITHOUT an email address.
 *
 * `birthday` is the exact server-formatted display string and `date_of_birth` the exact
 * date-only YYYY-MM-DD value — both authoritative as recorded, so a birthday is never
 * re-parsed through a local Date/UTC conversion that could shift it a day earlier. */
export interface VerifiedPersonalInformation {
  /** Which selectable person this is — `owner` (Tricycle Owner) or `driver` (the separate
   * assigned Tricycle Driver). The only values register() accepts as person_type. */
  type: 'owner' | 'driver';
  /** Human-readable role label for display (e.g. "Tricycle Owner"). */
  role: string;
  full_name: string;
  birthday: string | null;
  /** Exact date-only YYYY-MM-DD as recorded — no timezone shifting. */
  date_of_birth?: string | null;
  mobile_number: string | null;
  barangay: string | null;
}

export interface VerifiedOperatorData {
  success: boolean;
  eligible: boolean;
  verification_token: string;
  /** The authoritative permit number from franchise_schemes.franchise_number — the credential
   * this whole verification is keyed on, echoed from the resolved DB record (not merely the
   * user-typed input) so the UI can display it distinctly from what was entered. */
  franchise_number: string;
  /** Whether the owner is also the driver of this franchise (true) or a separate assigned
   * application_drivers person exists (false) — determines how many people are listed. */
  owner_is_driver?: boolean;
  application_reference?: string | null;
  /** Every registered person of this franchise, read-only, for the user to select which one
   * this Driver App account belongs to: the Tricycle Owner always, plus the separate
   * assigned Tricycle Driver when one exists. The only people an account may be linked to. */
  people?: VerifiedPersonalInformation[];
  operator: {
    id: number;
    full_name: string;
    license_number: string;
    toda_zone: string;
    barangay: string;
  };
  /** The operator's actual franchised tricycle, resolved server-side from the authoritative
   * ownership record — never a client-supplied plate/Sticker Number. */
  tricycle: {
    id: number;
    plate_number: string;
    coding_scheme_number: string;
    body_number: string; // legacy key — kept for shipped app builds
    status: string;
    make_model: string;
    toda_zone: string | null;
  } | null;
}


// ---------------------------------------------------------------------------------------------
// QR Ride / Walk-in Ride — shapes returned by /driver/qr-session/* (server-authoritative).
// ---------------------------------------------------------------------------------------------

export type QrPassengerStatus = 'accepted' | 'in_transit' | 'completed' | 'cancelled';

export interface QrSessionPassenger {
  booking_code: string;
  status: QrPassengerStatus;
  party_size: number;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  distance_km: number;
  distance_source: 'osrm' | 'fallback' | null;
  estimated_duration_mins: number;
  fare_per_passenger: number;
  fare_amount: number;
  payment_method: string;
  payment_status: PaymentStatus | string;
  payment_reference?: string | null;
  payment_amount_received?: number | null;
  payment_change_amount?: number | null;
  paid_at?: string | null;
  joined_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'passenger' | 'driver' | 'system' | null;
  /** 'qr' = joined with the Passenger app; 'walk_in' = added by the driver (Manual Ride, no account). */
  source?: 'qr' | 'walk_in';
  passenger_name?: string | null;
}

export interface QrSession {
  session: {
    session_code: string;
    status: 'boarding' | 'in_progress' | 'completed' | 'cancelled';
    capacity: number | null;
    seats_used: number;
    seats_remaining: number | null;
    opened_at: string | null;
    expires_at: string | null;
    started_at: string | null;
    ended_at: string | null;
    end_reason: string | null;
    total_fare: number;
  };
  passengers: QrSessionPassenger[];
}

// ---------------------------------------------------------------------------------------------
// Manual Ride — shapes returned by /driver/manual-ride/* (server-authoritative: pick-up, distance
// and fare are always the server's).
// ---------------------------------------------------------------------------------------------

export interface ManualRideQuote {
  quote: string;
  expires_at: string;
  party_size: number;
  pickup: { lat: number; lng: number; source: 'driver_gps' };
  dropoff_name: string;
  distance_km: number;
  distance_source: 'osrm' | 'fallback';
  estimated_duration_mins: number;
  fare_per_passenger: number;
  fare_amount: number;
  passenger_capacity: number | null;
  /** Seats still free in the tricycle's open ride session before this party. */
  seats_remaining?: number | null;
}

export interface ManualRide {
  booking_code: string;
  status: 'accepted' | 'in_transit' | 'completed' | 'cancelled';
  party_size: number;
  pickup: { name: string; lat: number; lng: number };
  dropoff: { name: string; lat: number; lng: number };
  distance_km: number;
  distance_source: 'osrm' | 'fallback' | null;
  estimated_duration_mins: number;
  fare_per_passenger: number;
  fare_amount: number;
  payment_method: string;
  payment_status: PaymentStatus | string;
  payment_reference?: string | null;
  payment_amount_received?: number | null;
  payment_change_amount?: number | null;
  paid_at?: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  dropped_off_recorded: boolean;
}
