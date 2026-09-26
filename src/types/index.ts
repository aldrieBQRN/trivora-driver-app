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

export interface TricycleUnit {
  id: number;
  plateNumber: string;
  codingNumber: string;
  model: string;
  iotDeviceId?: string;
  activeTrackingMode: 'mobile_app' | 'iot_device';
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
  status: 'completed' | 'cancelled';
  paymentMethod: PaymentMethod;
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
