import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { Phone, MessageSquare } from 'lucide-react-native';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import LocationPendingView from '../components/LocationPendingView';
import RideProgressStepper from '../components/RideProgressStepper';
import Avatar from '../components/Avatar';
import RouteTimeline from '../components/RouteTimeline';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import RideStatusPill from '../components/RideStatusPill';
import AppBottomSheet from '../components/AppBottomSheet';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { useToast } from '../components/Toast';
import { callPhoneNumber, messagePhoneNumber } from '../utils/deviceContact';

export default function DriverInTransitScreen() {
  const {
    activeBooking,
    completeTrip,
    currentLat,
    currentLng,
    isLocatingDriver,
    locationError,
    retryLocation,
    headingDeg,
  } = useDriverShift();
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [isCompleting, setIsCompleting] = useState(false);

  // Measured from actual layout rather than guessed — see DriverEnRoutePickupScreen.
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const handleTopLayout = (e: LayoutChangeEvent) => setTopOverlayHeight(e.nativeEvent.layout.height);
  const handleSheetLayout = (e: LayoutChangeEvent) => setSheetHeight(e.nativeEvent.layout.height);

  const pickupLat = activeBooking?.pickupLat;
  const pickupLng = activeBooking?.pickupLng;
  const dropoffLat = activeBooking?.dropoffLat;
  const dropoffLng = activeBooking?.dropoffLng;

  // Fixed Pick-up -> Destination route — matching the Passenger app's own Ride in Progress map,
  // which draws BookingContext's pickup->dropoff route (fetched once, not the driver's live
  // position) for this exact phase. The driver's live GPS only drives the separate
  // `driverLocation` marker below; it must never become the route's origin, or the road-following
  // geometry gets refetched from wherever the driver currently is instead of staying anchored to
  // the actual ride the passenger booked (previously this used currentLat/currentLng here, which
  // is what caused the drawn line to disagree with Passenger's pickup->dropoff route).
  const hasTrip = pickupLat != null && pickupLng != null && dropoffLat != null && dropoffLng != null;

  const route = useLiveRoute(
    pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null,
    dropoffLat != null && dropoffLng != null ? { lat: dropoffLat, lng: dropoffLng } : null
  );

  if (!activeBooking) return null;
  if (currentLat == null || currentLng == null) {
    return <LocationPendingView isLocating={isLocatingDriver} error={locationError} onRetry={retryLocation} />;
  }
  const booking = activeBooking;

  const hasPassengerPhone = !!booking.passengerMobile?.trim();

  const handleCall = async () => {
    const opened = await callPhoneNumber(booking.passengerMobile);
    if (!opened) showToast("Passenger's phone number isn't available.", 'info');
  };

  const handleMessage = async () => {
    const opened = await messagePhoneNumber(booking.passengerMobile);
    if (!opened) showToast("Passenger's phone number isn't available.", 'info');
  };

  // completeTrip is server-authoritative (waits for the backend to confirm before moving to
  // fare_collect) — show a loading state instead of leaving the button looking unresponsive on
  // a slow connection.
  const handleComplete = async () => {
    if (isCompleting) return;
    setIsCompleting(true);
    await completeTrip();
    setIsCompleting(false);
  };

  return (
    <View style={styles.container}>
      <TrivoraDriverMap
        driverLocation={{ lat: currentLat, lng: currentLng, heading: headingDeg }}
        isOnline
        showCompass
        // Trip framing: pickup pin + full pickup -> destination route + destination pin, fitted as a
        // whole and NOT refit on the driver's GPS (tripDropoff mode). The driver's tricycle stays
        // visible as a secondary marker. Without pickup coordinates, the previous destination-only
        // target is kept.
        target={
          hasTrip
            ? { lat: pickupLat as number, lng: pickupLng as number, label: booking.pickup, kind: 'pickup' }
            : dropoffLat != null && dropoffLng != null
              ? { lat: dropoffLat, lng: dropoffLng, label: booking.dropoff, kind: 'dropoff' }
              : undefined
        }
        tripDropoff={hasTrip ? { lat: dropoffLat as number, lng: dropoffLng as number } : undefined}
        routeCoordinates={route?.coordinates}
        routeSource={route?.source}
        topInset={insets.top + 12 + topOverlayHeight}
        bottomInset={sheetHeight}
        style={StyleSheet.absoluteFillObject}
      />

      {/* No header bar — one status message floating top-center, same as the Passenger app. */}
      <View style={[styles.topWrap, { top: insets.top + 12 }]} onLayout={handleTopLayout}>
        <RideStatusPill label={`Ride in Progress · ${booking.distanceKm} km to go`} />
      </View>

      <AppBottomSheet ref={sheetRef} enableDynamicSizing index={0} animateOnMount={false}>
        <BottomSheetView
          style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.md }]}
          onLayout={handleSheetLayout}
        >
          <View style={styles.passengerRow}>
            <Avatar name={booking.passengerName} imageUri={booking.passengerAvatarUrl} size={42} tone="driver" />
            <View style={styles.passengerCol}>
              <Text style={styles.passengerName}>{booking.passengerName}</Text>
              <Text style={styles.passengerMeta}>{booking.passengerTrips ?? 0} Completed Rides</Text>
            </View>
            <View style={styles.fareCol}>
              <Text style={styles.fareValue}>₱{booking.fare.toFixed(2)}</Text>
              <StatusBadge label={(booking.paymentMethod || 'cash').toUpperCase()} tone="brand" size="sm" />
            </View>
          </View>

          <RouteTimeline
            dropoff={{
              label: 'Destination',
              address: booking.dropoff,
              meta: `${booking.distanceKm} km · ~6 min`,
            }}
          />

          {/* Call/Message stay available through the ride itself, same as the Passenger app's own
              ActiveRideScreen — no driver cancellation here (see DriverEnRoutePickupScreen; the
              backend also rejects it past 'accepted', see BookingController::updateStatus). */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionItem, !hasPassengerPhone && styles.actionItemDisabled]}
              onPress={handleCall}
              activeOpacity={0.7}
              disabled={!hasPassengerPhone}
            >
              <View style={styles.actionIconBox}>
                <Phone size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.actionLabel}>Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionItem, !hasPassengerPhone && styles.actionItemDisabled]}
              onPress={handleMessage}
              activeOpacity={0.7}
              disabled={!hasPassengerPhone}
            >
              <View style={styles.actionIconBox}>
                <MessageSquare size={18} color={COLORS.primary} />
              </View>
              <Text style={styles.actionLabel}>Message</Text>
            </TouchableOpacity>
          </View>

          <RideProgressStepper currentStep="in_transit" />

          <Button label="Complete Ride" onPress={handleComplete} loading={isCompleting} />
        </BottomSheetView>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  topWrap: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    alignItems: 'center',
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
  fareCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fareValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.primary,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.xl,
  },
  actionItem: {
    alignItems: 'center',
    gap: 4,
  },
  actionItemDisabled: {
    opacity: 0.4,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
});
