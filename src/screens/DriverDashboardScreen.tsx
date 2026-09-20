import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent } from 'react-native';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import type BottomSheet from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { Star, Bell, Satellite, Gauge, ShieldAlert, ChevronRight } from 'lucide-react-native';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import LocationPendingView from '../components/LocationPendingView';
import AppBottomSheet from '../components/AppBottomSheet';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import FloatingIconButton from '../components/FloatingIconButton';
import Avatar from '../components/Avatar';
import NotificationsModal from '../components/NotificationsModal';

interface DriverDashboardScreenProps {
  onOpenProfile?: () => void;
  onOpenTrips: () => void;
  onOpenEarnings: () => void;
  onOpenViolations: () => void;
}

// A single fixed point, not a draggable range — the panel no longer responds to swipe gestures
// (see AppBottomSheet), so there's nothing to snap between. Sized to comfortably fit the status
// hero + its action button + an optional warning line + the today stats row, with a little
// margin — not the old, larger budget that also had to fit the now-removed dev-only "Simulate
// Ride Request" button, which left a visible gap below the today stats row once that was gone.
const SNAP_POINTS = ['47%'];
// This sheet uses a fixed percentage snap point rather than dynamic sizing, so its covered height
// can't be measured via onLayout on the sheet content itself (that would report the content's
// intrinsic size, not the snap-constrained visible sheet height) — it has to be derived from the
// same percentage the snap point uses. Multiplying against the screen's root container (measured
// via onLayout below), not Dimensions.get('window'), keeps this correct on any device/viewport
// (phone, tablet, desktop browser, split-screen) instead of assuming the map fills the OS window.
const SHEET_SNAP_FRACTION = 0.47;

export default function DriverDashboardScreen({
  onOpenProfile,
  onOpenTrips,
  onOpenEarnings,
  onOpenViolations,
}: DriverDashboardScreenProps) {
  const { driver } = useDriverAuth();
  const {
    isOnline,
    setIsOnline,
    currentLat,
    currentLng,
    isLocatingDriver,
    locationError,
    retryLocation,
    headingDeg,
    trackingMode,
    todayEarnings,
    completedTripsCount,
    averageRating,
    activeSpeedWarning,
    codingWarning,
    violations,
  } = useDriverShift();
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();
  const [showNotifications, setShowNotifications] = useState(false);

  // Measured from actual layout rather than guessed, so the map keeps the driver's own location
  // centered in the area actually visible below the header.
  const [headerHeight, setHeaderHeight] = useState(0);
  const handleHeaderLayout = (e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height);

  // The root container's own rendered height — not Dimensions.get('window') — so the fixed-
  // snap-point sheet's covered height (see SHEET_SNAP_FRACTION above) is derived from the actual
  // visible map area on whatever device/viewport this renders in.
  const [containerHeight, setContainerHeight] = useState(0);
  const handleContainerLayout = (e: LayoutChangeEvent) => setContainerHeight(e.nativeEvent.layout.height);
  const bottomInset = containerHeight * SHEET_SNAP_FRACTION;

  const hasPendingViolation = violations.some((v) => v.status === 'pending');
  const hasUnread = hasPendingViolation || activeSpeedWarning || !!codingWarning;
  const hasComplianceWarning = isOnline && (activeSpeedWarning || !!codingWarning);
  const firstName = (driver?.name || 'Juan Dela Cruz').split(' ')[0];
  const trackingLabel = trackingMode === 'iot_device' ? 'IoT Tracker' : 'Mobile GPS';

  if (currentLat == null || currentLng == null) {
    return <LocationPendingView isLocating={isLocatingDriver} error={locationError} onRetry={retryLocation} />;
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {/* The map is the workspace, not a widget — full-bleed, with the header and status
          floating on top of it, exactly like the rest of the ride experience. */}
      <TrivoraDriverMap
        driverLocation={{ lat: currentLat, lng: currentLng, heading: headingDeg }}
        isOnline={isOnline}
        zoneName={driver?.todaZone?.name || 'TODA Bucana Zone'}
        topInset={headerHeight}
        bottomInset={bottomInset}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader
        variant="overlay"
        tone="opaque"
        onLayout={handleHeaderLayout}
        title={`Hi, ${firstName}`}
        subtitle={`Driver · ${driver?.todaZone?.name || 'TODA Bucana'} · ${
          averageRating != null ? `${averageRating.toFixed(2)} ★` : 'Not Rated'
        }`}
        leftSlot={
          <TouchableOpacity onPress={onOpenProfile} activeOpacity={0.8} accessibilityLabel="Open profile">
            <Avatar name={driver?.name || 'Juan Dela Cruz'} imageUri={driver?.avatarUrl} tone="driver" size={36} />
          </TouchableOpacity>
        }
        rightSlot={
          <FloatingIconButton onPress={() => setShowNotifications(true)} hasBadge={hasUnread} accessibilityLabel="Notifications">
            <Bell size={17} color={COLORS.textPrimary} />
          </FloatingIconButton>
        }
      />

      <AppBottomSheet ref={sheetRef} snapPoints={SNAP_POINTS} index={0}>
        <BottomSheetView style={[styles.sheetContent, { paddingBottom: insets.bottom + SPACING.md }]}>
          {/* The one fact that matters most, told through scale rather than a boxed card —
              the same "typography carries the hierarchy" rule as the fare on the ride screens. */}
          <View>
            <Text style={styles.eyebrow}>WORK STATUS</Text>
            <Text style={[styles.heroWord, isOnline ? styles.heroWordOnline : styles.heroWordOffline]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {isOnline ? "You're visible to nearby ride requests" : 'Go online to start receiving rides'}
            </Text>

            {/* Always rendered (not conditionally mounted) so this row's space stays reserved
                whether online or offline — otherwise the sheet's fixed height left a bigger gap
                below the today stats row specifically when offline, since the content was one
                row shorter but the sheet didn't shrink to match. */}
            <View style={[styles.gpsRow, !isOnline && styles.gpsRowHidden]}>
              <Satellite size={12} color={COLORS.success} />
              <Text style={styles.gpsText}>GPS Active · {trackingLabel}</Text>
            </View>
          </View>

          <Button
            label={isOnline ? 'Go Offline' : 'Go Online'}
            onPress={() => setIsOnline(!isOnline)}
            variant={isOnline ? 'secondary' : 'primary'}
          />

          {hasComplianceWarning && (
            <TouchableOpacity style={styles.warningRow} onPress={onOpenViolations} activeOpacity={0.75}>
              {activeSpeedWarning ? (
                <Gauge size={15} color={COLORS.dangerDark} />
              ) : (
                <ShieldAlert size={15} color={COLORS.dangerDark} />
              )}
              <Text style={styles.warningText} numberOfLines={2}>
                {activeSpeedWarning
                  ? 'Overspeeding detected — slow down to stay under the municipal limit.'
                  : codingWarning?.description}
              </Text>
              <ChevronRight size={14} color={COLORS.dangerDark} />
            </TouchableOpacity>
          )}

          <View style={styles.divider} />

          <View style={styles.todayRow}>
            <TouchableOpacity style={styles.todayStat} onPress={onOpenEarnings} activeOpacity={0.7}>
              <Text style={styles.todayValue}>₱{todayEarnings.toFixed(2)}</Text>
              <Text style={styles.todayCaption}>Today's Earnings</Text>
            </TouchableOpacity>
            <View style={styles.todayDivider} />
            <TouchableOpacity style={styles.todayStat} onPress={onOpenTrips} activeOpacity={0.7}>
              <Text style={styles.todayValue}>{completedTripsCount}</Text>
              <Text style={styles.todayCaption}>Completed Rides</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </AppBottomSheet>

      <NotificationsModal visible={showNotifications} onClose={() => setShowNotifications(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  sheetContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    gap: SPACING.md,
  },
  eyebrow: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  heroWord: {
    ...TYPOGRAPHY.display,
    marginTop: 2,
  },
  heroWordOnline: {
    color: COLORS.success,
  },
  heroWordOffline: {
    color: COLORS.textPrimary,
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
  },
  gpsRowHidden: {
    opacity: 0,
  },
  gpsText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2,
  },
  warningText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
    color: COLORS.dangerDark,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  todayStat: {
    flex: 1,
  },
  todayValue: {
    ...TYPOGRAPHY.display,
    color: COLORS.textPrimary,
  },
  todayCaption: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  todayDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SPACING.lg,
  },
});
