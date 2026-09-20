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
  bodyNumber: string;
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
  /** Friendly label mirroring the web's own phrasing (Operator\ViolationController::ticket()) —
   * 'Automated IoT Detection' or 'Manual (TMO Personnel)'. */
  detectionMethodLabel: string;
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
  status: 'completed' | 'cancelled';
  paymentMethod: PaymentMethod;
  rating?: number | null;
  ratingComment?: string | null;
  ratingFeedbackTags?: string[];
}

/** Account/vehicle-config fields collected on the registration flow's "Account Info" step,
 * carried forward to the separate "Create Password" step where the actual account is created. */
export interface PendingAccountInfo {
  email: string;
  mobile: string;
  trackingMode: 'mobile_app' | 'iot_device';
  iotDeviceId?: string;
}

export interface VerifiedOperatorData {
  success: boolean;
  eligible: boolean;
  verification_token: string;
  /** The DOB actually submitted during verification — the backend doesn't echo it back, so this
   * is tracked client-side purely to resend it at registration for independent server-side
   * re-validation (the backend never trusts a client's earlier eligibility pass). */
  date_of_birth?: string;
  /** The authoritative permit number from franchise_schemes.franchise_number — the credential
   * this whole verification is keyed on, echoed from the resolved DB record (not merely the
   * user-typed input) so the UI can display it distinctly from what was entered. */
  franchise_number: string;
  operator: {
    id: number;
    full_name: string;
    license_number: string;
    toda_zone: string;
    barangay: string;
  };
  /** The operator's actual franchised tricycle, resolved server-side from the authoritative
   * ownership record — never a client-supplied plate/body number. */
  tricycle: {
    id: number;
    plate_number: string;
    body_number: string;
    status: string;
    make_model: string;
    toda_zone: string | null;
  } | null;
}
