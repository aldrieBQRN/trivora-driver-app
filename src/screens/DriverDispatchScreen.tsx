import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { MessageSquare } from 'lucide-react-native';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import LocationPendingView from '../components/LocationPendingView';
import SlideToAcceptSlider from '../components/SlideToAcceptSlider';
import Avatar from '../components/Avatar';
import RouteTimeline from '../components/RouteTimeline';
import StatusBadge from '../components/StatusBadge';
import AppBottomSheet from '../components/AppBottomSheet';
import { useLiveRoute } from '../hooks/useLiveRoute';

// Mirrors BookingDispatchService::OFFER_TIMEOUT_SECONDS on the backend — the backend, not this
// value, is what actually expires an offer; keeping these in sync just avoids the driver's local
// countdown reaching zero (and auto-declining) noticeably before or after the server's own clock.
const OFFER_TIMEOUT_SECONDS = 25;

/** Derives the starting countdown from the backend's own dispatched_at timestamp rather than
 * always starting a fresh 25s on mount — so a slow render/navigation after the backend already
 * targeted this driver doesn't hand them extra time beyond what the server considers the offer
 * window, and a delayed mount doesn't undercount either. */
function computeInitialCountdown(dispatchedAt?: string | null): number {
  if (!dispatchedAt) return OFFER_TIMEOUT_SECONDS;
  const elapsedSeconds = Math.floor((Date.now() - new Date(dispatchedAt).getTime()) / 1000);
  return Math.max(0, OFFER_TIMEOUT_SECONDS - elapsedSeconds);
}
// A single fixed point, not a draggable range — the panel no longer responds to swipe gestures
// (see AppBottomSheet), so there's nothing to snap between. Generous by design: it must
// comfortably fit identity + fare + route + the slider without clipping.
const SNAP_POINTS = ['58%'];
// This sheet uses a fixed percentage snap point rather than dynamic sizing, so its covered height
// can't be measured via onLayout on the sheet content itself — it's derived from the same
// percentage the snap point uses, multiplied against the screen's own root container (measured
// via onLayout below) rather than Dimensions.get('window'), so it stays correct on any device or
// viewport instead of assuming the map fills the OS window.
const SHEET_SNAP_FRACTION = 0.58;

export default function DriverDispatchScreen() {
  const {
    incomingBooking,
    acceptBooking,
    declineBooking,
    currentLat,
    currentLng,
    isLocatingDriver,
    locationError,
    retryLocation,
    headingDeg,
  } = useDriverShift();
  const [countdown, setCountdown] = useState(() => computeInitialCountdown(incomingBooking?.dispatchedAt));
  const [isAccepting, setIsAccepting] = useState(false);
  const isCancelledRef = useRef(false);
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const handleTopLayout = (e: LayoutChangeEvent) => setTopOverlayHeight(e.nativeEvent.layout.height);

  // The root container's own rendered height — not Dimensions.get('window') — so the fixed-
  // snap-point sheet's covered height (see SHEET_SNAP_FRACTION above) is derived from the actual
  // visible map area on whatever device/viewport this renders in.
  const [containerHeight, setContainerHeight] = useState(0);
  const handleContainerLayout = (e: LayoutChangeEvent) => setContainerHeight(e.nativeEvent.layout.height);
  const bottomInset = containerHeight * SHEET_SNAP_FRACTION;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0 && !isCancelledRef.current) {
      declineBooking();
    }
  }, [countdown]);

  const pickupLat = incomingBooking?.pickupLat;
  const pickupLng = incomingBooking?.pickupLng;

  const dropoffLat = incomingBooking?.dropoffLat;
  const dropoffLng = incomingBooking?.dropoffLng;
  const hasTrip = pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null;

  // The request screen shows the TRIP the driver is being asked to take: exact pickup -> road
  // route -> exact destination (the existing fetchRoute via useLiveRoute). Only when the booking
  // carries no destination does it fall back to the previous driver -> pickup route.
  const tripRoute = useLiveRoute(
    hasTrip ? { lat: pickupLat as number, lng: pickupLng as number } : null,
    hasTrip ? { lat: dropoffLat as number, lng: dropoffLng as number } : null
  );
  const approachRoute = useLiveRoute(
    !hasTrip && currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng } : null,
    !hasTrip && pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null
  );
  const route = hasTrip ? tripRoute : approachRoute;

  const handleDecline = () => {
    if (isAccepting) return;
    isCancelledRef.current = true;
    declineBooking();
  };

  // acceptBooking is server-authoritative (waits for the backend to confirm before moving the
  // driver into the active-ride state) — on a slow connection the slider would otherwise just
  // snap back and look like the slide did nothing. `processing` keeps the thumb held at the end
  // with a spinner instead, and only lets the slider reset if the request actually failed.
  const handleAccept = async () => {
    if (isAccepting) return;
    isCancelledRef.current = true;
    setIsAccepting(true);
    await acceptBooking();
    setIsAccepting(false);
  };

  if (!incomingBooking) return null;
  if (currentLat == null || currentLng == null) {
    return <LocationPendingView isLocating={isLocatingDriver} error={locationError} onRetry={retryLocation} />;
  }
  const booking = incomingBooking;
  const isUrgent = countdown <= 6;

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* Real map, same engine/style as Home — dimmed to keep the request the dominant moment */}
      <TrivoraDriverMap
        driverLocation={{ lat: currentLat, lng: currentLng, heading: headingDeg }}
        isOnline
        showCompass={false}
        target={
          pickupLat != null && pickupLng != null
            ? { lat: pickupLat, lng: pickupLng, label: booking.pickup, kind: 'pickup' }
            : undefined
        }
        tripDropoff={hasTrip ? { lat: dropoffLat as number, lng: dropoffLng as number } : undefined}
        // Trip view: only pickup pin + route + destination pin, no driver marker. Without a
        // destination the previous driver -> pickup view (driver marker included) is kept.
        showDriverMarker={!hasTrip}
        routeCoordinates={route?.coordinates}
        routeSource={route?.source}
        // topOverlayHeight is the overlay's full measured height, which already includes its
        // paddingTop (safe area + SPACING.lg) — adding those again double-counted the top chrome.
        topInset={topOverlayHeight}
        bottomInset={bottomInset}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={styles.dimOverlay} pointerEvents="none" />

      <View
        style={[styles.topOverlay, { paddingTop: insets.top + SPACING.lg }]}
        pointerEvents="none"
        onLayout={handleTopLayout}
      >
        <Text style={styles.requestEyebrow}>NEW RIDE REQUEST</Text>
        <View style={[styles.countdownRing, isUrgent && styles.countdownRingUrgent]}>
          <Text style={[styles.countdownNumber, isUrgent && styles.countdownNumberUrgent]}>{countdown}</Text>
        </View>
      </View>

      <AppBottomSheet ref={sheetRef} snapPoints={SNAP_POINTS} index={0}>
        <BottomSheetView style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.md }]}>
          {/* Who — identity comes first */}
          <View style={styles.passengerRow}>
            <Avatar name={booking.passengerName} imageUri={booking.passengerAvatarUrl} size={44} tone="driver" />
            <View style={styles.passengerCol}>
              <Text style={styles.passengerName}>{booking.passengerName}</Text>
              <Text style={styles.passengerMeta}>{booking.passengerTrips ?? 0} Completed Rides</Text>
            </View>
            <StatusBadge label={(booking.paymentMethod || 'cash').toUpperCase()} tone="brand" size="sm" />
          </View>

          {/* Fare — the dominant figure on this screen, driven by typography not a box. Priced
              per passenger by trip distance, charged once per rider — booking.fare is already the
              backend-computed total (farePerPassenger x passengerCount). */}
          <View style={styles.fareRow}>
            <Text style={styles.fareLabel}>Estimated Fare</Text>
            <Text style={styles.fareValue}>₱{booking.fare.toFixed(2)}</Text>
          </View>
          <Text style={styles.fareCaption}>
            ₱{booking.farePerPassenger.toFixed(2)} × {booking.passengerCount} passenger
            {booking.passengerCount !== 1 ? 's' : ''}
          </Text>

          {/* Where */}
          <RouteTimeline
            pickup={{
              label: 'Pick-up',
              address: booking.pickup,
              meta: `${booking.pickupDistanceKm ?? 1.2} km away`,
            }}
            dropoff={{
              label: 'Destination',
              address: booking.dropoff,
              meta: `${booking.distanceKm} km`,
            }}
          />

          {/* Passenger's optional note (e.g. "waiting near blue gate") — only takes up space when
              they actually left one, matching the passenger app's own "Note to Driver" field. */}
          {!!booking.passengerNotes && (
            <View style={styles.noteRow}>
              <MessageSquare size={15} color={COLORS.textSecondary} />
              <Text style={styles.noteText} numberOfLines={2}>{booking.passengerNotes}</Text>
            </View>
          )}

          <SlideToAcceptSlider onAccept={handleAccept} processing={isAccepting} />

          <TouchableOpacity
            style={[styles.declineBtn, isAccepting && styles.declineBtnDisabled]}
            onPress={handleDecline}
            activeOpacity={0.7}
            disabled={isAccepting}
          >
            <Text style={styles.declineBtnText}>Decline</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.darkBackground,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 32, 64, 0.72)',
  },
  topOverlay: {
    alignItems: 'center',
    gap: 14,
  },
  requestEyebrow: {
    ...TYPOGRAPHY.label,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 2,
  },
  countdownRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  countdownRingUrgent: {
    borderColor: COLORS.danger,
  },
  countdownNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  countdownNumberUrgent: {
    color: '#FCA5A5',
  },
  sheetContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    gap: SPACING.md,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  passengerCol: {
    flex: 1,
  },
  passengerName: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.textPrimary,
  },
  passengerMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  fareLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  fareValue: {
    ...TYPOGRAPHY.hero,
    fontSize: 34,
    lineHeight: 38,
    color: COLORS.primary,
  },
  fareCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'right',
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  noteText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  declineBtn: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  declineBtnDisabled: {
    opacity: 0.4,
  },
  declineBtnText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
});
