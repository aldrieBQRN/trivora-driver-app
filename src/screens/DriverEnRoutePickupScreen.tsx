import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { Phone, MessageSquare, X } from 'lucide-react-native';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import LocationPendingView from '../components/LocationPendingView';
import RideProgressStepper from '../components/RideProgressStepper';
import Avatar from '../components/Avatar';
import RouteTimeline from '../components/RouteTimeline';
import Button from '../components/Button';
import RideStatusPill from '../components/RideStatusPill';
import AppBottomSheet from '../components/AppBottomSheet';
import ConfirmModal from '../components/ConfirmModal';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { useToast } from '../components/Toast';
import { callPhoneNumber, messagePhoneNumber } from '../utils/deviceContact';

export default function DriverEnRoutePickupScreen() {
  const {
    activeBooking,
    rideState,
    setStatusArrived,
    setStatusInTransit,
    cancelActiveBooking,
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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAdvancing, setIsAdvancing] = useState(false);

  // Measured from actual layout rather than guessed, so the map's camera framing keeps pins
  // below the status pill and above the bottom sheet regardless of exact content/font sizes.
  const [topOverlayHeight, setTopOverlayHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  const handleTopLayout = (e: LayoutChangeEvent) => setTopOverlayHeight(e.nativeEvent.layout.height);
  const handleSheetLayout = (e: LayoutChangeEvent) => setSheetHeight(e.nativeEvent.layout.height);

  const pickupLat = activeBooking?.pickupLat;
  const pickupLng = activeBooking?.pickupLng;
  const hasArrived = rideState === 'arrived';

  // Always CURRENT DRIVER POSITION -> pickup, not the driver's position when this screen first
  // mounted — see useLiveRoute for why that distinction matters. Passing null once arrived stops
  // the driver-to-pickup navigation route entirely (no further fetches, nothing drawn) — arriving
  // means there's nowhere left to navigate to for this leg.
  const route = useLiveRoute(
    !hasArrived && currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng } : null,
    !hasArrived && pickupLat != null && pickupLng != null ? { lat: pickupLat, lng: pickupLng } : null
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

  // setStatusArrived/setStatusInTransit are server-authoritative (they wait for the backend to
  // confirm before flipping rideState) — on a slow connection the button would otherwise just
  // sit there looking unresponsive for however long that takes, inviting a second tap.
  const handlePrimaryAction = async () => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    if (hasArrived) {
      await setStatusInTransit();
    } else {
      await setStatusArrived();
    }
    setIsAdvancing(false);
  };

  const handleConfirmCancel = async () => {
    setIsCancelling(true);
    await cancelActiveBooking();
    setIsCancelling(false);
    setShowCancelConfirm(false);
  };

  return (
    <View style={styles.container}>
      {/* Full-bleed real map, same engine/style as Home — no header bar, just one status
          message floating top-center, same as the Passenger app's DriverEnRouteScreen. */}
      <TrivoraDriverMap
        driverLocation={{ lat: currentLat, lng: currentLng, heading: headingDeg }}
        isOnline
        showCompass
        target={
          pickupLat != null && pickupLng != null
            ? { lat: pickupLat, lng: pickupLng, label: booking.pickup, kind: 'pickup' }
            : undefined
        }
        routeCoordinates={route?.coordinates}
        routeSource={route?.source}
        topInset={insets.top + 12 + topOverlayHeight}
        bottomInset={sheetHeight}
        style={StyleSheet.absoluteFillObject}
      />

      <View style={[styles.topWrap, { top: insets.top + 12 }]} onLayout={handleTopLayout}>
        <RideStatusPill
          label={
            hasArrived
              ? `Arrived — waiting for ${booking.passengerName.split(' ')[0]}`
              : `Heading to Pick-up · ${booking.pickupEtaMinutes ?? 3} min`
          }
          tone={hasArrived ? 'success' : 'progress'}
        />
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
          </View>

          <RouteTimeline
            pickup={{
              label: 'Pick-up',
              address: booking.pickup,
              meta: `${booking.pickupDistanceKm ?? 1.2} km · ${booking.pickupEtaMinutes ?? 3} min`,
            }}
          />

          {!!booking.passengerNotes && (
            <View style={styles.noteRow}>
              <MessageSquare size={15} color={COLORS.textSecondary} />
              <Text style={styles.noteText} numberOfLines={2}>{booking.passengerNotes}</Text>
            </View>
          )}

          {/* Contact + cancel actions as labeled icon+label items, matching the Passenger app's
              DriverEnRouteScreen convention exactly — Call, Message, and (while still on the way
              to pickup) Cancel together in one row, not a separately-styled cancellation UI.
              Cancel is only available during pickup/en-route — once "Arrived" is tapped, rideState
              flips and it disappears immediately from this same row (the backend also rejects a
              cancel attempt past this point, see BookingController::updateStatus). */}
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

            {!hasArrived && (
              <TouchableOpacity style={styles.actionItem} onPress={() => setShowCancelConfirm(true)} activeOpacity={0.7}>
                <View style={[styles.actionIconBox, { backgroundColor: COLORS.dangerLight }]}>
                  <X size={18} color={COLORS.danger} />
                </View>
                <Text style={[styles.actionLabel, { color: COLORS.danger }]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>

          <RideProgressStepper currentStep={hasArrived ? 'arrived' : 'to_pickup'} />

          <Button
            label={hasArrived ? 'Start Ride' : 'I Have Arrived'}
            onPress={handlePrimaryAction}
            loading={isAdvancing}
          />
        </BottomSheetView>
      </AppBottomSheet>

      <ConfirmModal
        visible={showCancelConfirm}
        title="Cancel Ride?"
        message="Are you sure you want to cancel this ride?"
        confirmLabel="Cancel Ride"
        cancelLabel="Keep Ride"
        destructive
        loading={isCancelling}
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
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
});
