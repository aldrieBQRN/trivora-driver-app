import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { Star, Bell, Satellite, Gauge, ShieldAlert, ChevronRight, ShieldOff, Ban, Users, Plus, Navigation, MapPin } from 'lucide-react-native';
import { useQrSession } from '../context/QrSessionContext';
import { useManualRide } from '../context/ManualRideContext';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import MapLocationNotice from '../components/MapLocationNotice';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import FloatingIconButton from '../components/FloatingIconButton';
import Avatar from '../components/Avatar';
import NotificationsModal from '../components/NotificationsModal';
import { reverseGeocodePoint } from '../services/routingService';
import { haversineKm } from '../utils/geo';

interface DriverDashboardScreenProps {
  onOpenProfile?: () => void;
  onOpenTrips: () => void;
  onOpenEarnings: () => void;
  onOpenViolations: () => void;
  /** Reopens the walk-in (Scan to Ride) session screen while a session is open. */
  onOpenQrSession?: () => void;
}

/** Below this height (px) the panel uses tighter type and spacing so the map keeps enough room. */
const COMPACT_HEIGHT = 720;
/** At or above this width (tablets, web) the panel and ride bars stop stretching edge to edge. */
const WIDE_WIDTH = 720;
const PANEL_MAX_WIDTH = 560;
/** Below this width the Manual Ride button is text-only. */
const NARROW_WIDTH = 380;

export default function DriverDashboardScreen({
  onOpenProfile,
  onOpenTrips,
  onOpenEarnings,
  onOpenViolations,
  onOpenQrSession,
}: DriverDashboardScreenProps) {
  const { driver } = useDriverAuth();
  const { session: qrSession } = useQrSession();
  const { ride: manualRide, open: openManualRide } = useManualRide();
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
  const insets = useSafeAreaInsets();
  const [showNotifications, setShowNotifications] = useState(false);

  // Measured from actual layout rather than guessed, so the map keeps the driver's own location
  // centered in the area actually visible below the header.
  const [headerHeight, setHeaderHeight] = useState(0);
  const handleHeaderLayout = (e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height);

  // The panel's real rendered height is what the map treats as covered (camera padding).
  const [panelHeight, setPanelHeight] = useState(0);
  const handlePanelLayout = (e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height);
  const bottomInset = panelHeight;

  // Adaptive layout from the real window size (phones, small phones, tablets, desktop web).
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < COMPACT_HEIGHT;
  const isWide = windowWidth >= WIDE_WIDTH;
  // Narrow phones: the two side-by-side buttons drop the icon so "Manual Ride" stays on one line.
  const isNarrow = windowWidth < NARROW_WIDTH;

  const hasPendingViolation = violations.some((v) => v.status === 'pending');
  const hasUnread = hasPendingViolation || activeSpeedWarning || !!codingWarning;
  const hasComplianceWarning = isOnline && (activeSpeedWarning || !!codingWarning);
  const firstName = (driver?.name || 'Juan Dela Cruz').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const [locationName, setLocationName] = useState<string | null>(null);
  const lastGeocodedCoords = useRef<{ lat: number; lng: number } | null>(null);
  const isGeocodingRef = useRef(false);

  const locationKnown = currentLat != null && currentLng != null;

  useEffect(() => {
    if (!locationKnown || currentLat == null || currentLng == null) {
      return;
    }

    if (
      lastGeocodedCoords.current &&
      haversineKm(lastGeocodedCoords.current, { lat: currentLat, lng: currentLng }) < 0.05
    ) {
      return;
    }

    if (isGeocodingRef.current) return;
    isGeocodingRef.current = true;

    reverseGeocodePoint({ lat: currentLat, lng: currentLng })
      .then((result) => {
        if (result) {
          setLocationName(result.address || result.name);
          lastGeocodedCoords.current = { lat: currentLat, lng: currentLng };
        }
      })
      .catch(() => {})
      .finally(() => {
        isGeocodingRef.current = false;
      });
  }, [locationKnown, currentLat, currentLng]);

  const trackingLabel = trackingMode === 'iot_device' ? 'IoT Tracker' : 'Mobile GPS';
  // TMO-controlled operational authorization on the driver's ASSIGNED FRANCHISE — never a status
  // on the driver's own account. The backend is the actual enforcement boundary (it rejects going
  // online/accepting bookings outright), this only keeps the driver from tapping an action that's
  // guaranteed to fail and tells them why up front.
  const isSuspended = driver?.franchiseStatus === 'suspended';
  const isRevoked = driver?.franchiseStatus === 'revoked';
  const isRestricted = isSuspended || isRevoked;
  // A walk-in passenger (Manual Ride) can be added only while online and operational, into no ride
  // yet or the one still boarding with a free seat (the server re-checks all of this).
  const sessionTakesWalkIn = !qrSession
    || (qrSession.session.status === 'boarding' && (qrSession.session.seats_remaining ?? 1) > 0);
  const canStartManualRide = isOnline && !isRestricted && sessionTakesWalkIn && !manualRide;

  // The map mounts immediately (tiles start loading) whether or not GPS has arrived; a small
  // notice over it covers the wait/permission state instead of a full-screen blocker.
  const driverLocation =
    currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng, heading: headingDeg } : null;

  return (
    <View style={styles.container}>
      {/* The map is the workspace, not a widget — full-bleed, with the header and status
          floating on top of it, exactly like the rest of the ride experience. */}
      <TrivoraDriverMap
        driverLocation={driverLocation}
        isOnline={isOnline}
        focusCurrentLocation
        topInset={headerHeight}
        bottomInset={bottomInset}
        style={StyleSheet.absoluteFillObject}
      />
      {!driverLocation && (
        <MapLocationNotice isLocating={isLocatingDriver} error={locationError} onRetry={retryLocation} top={headerHeight + 8} />
      )}

      <ScreenHeader
        variant="overlay"
        tone="opaque"
        onLayout={handleHeaderLayout}
        title={`${greeting}, ${firstName}`}
        subtitle={
          <View style={styles.headerLocationRow}>
            <MapPin size={12} color={locationKnown ? COLORS.primary : COLORS.textMuted} strokeWidth={2.4} />
            <Text style={styles.headerLocation} numberOfLines={1}>
              {locationKnown ? (locationName || 'Finding your location…') : (locationError ? 'Location unavailable' : 'Finding your location…')}
            </Text>
          </View>
        }
        leftSlot={
          <TouchableOpacity onPress={onOpenProfile} activeOpacity={0.8} accessibilityLabel="Open profile">
            <Avatar name={driver?.name || 'Juan Dela Cruz'} imageUri={driver?.avatarUrl} tone="driver" size={40} />
          </TouchableOpacity>
        }
        rightSlot={
          <FloatingIconButton onPress={() => setShowNotifications(true)} hasBadge={hasUnread} accessibilityLabel="Notifications">
            <Bell size={17} color={COLORS.textPrimary} />
          </FloatingIconButton>
        }
      />

      {qrSession && (
        <TouchableOpacity
          style={[styles.qrBar, isWide && styles.barWide, { top: headerHeight + 8 }]}
          onPress={onOpenQrSession}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open ride session"
        >
          <Users size={16} color={COLORS.textInverse} />
          <Text style={styles.qrBarText} numberOfLines={1}>
            Ride session · {qrSession.session.seats_used}/{qrSession.session.capacity ?? '—'}{' '}
            {qrSession.session.status === 'boarding' ? 'waiting to start' : qrSession.session.status === 'completed' ? 'ready to end' : 'in progress'}
          </Text>
          <ChevronRight size={16} color={COLORS.textInverse} />
        </TouchableOpacity>
      )}

      {manualRide && (
        <TouchableOpacity
          style={[styles.qrBar, isWide && styles.barWide, { top: headerHeight + 8 }]}
          onPress={openManualRide}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open Manual Ride in progress"
        >
          <Navigation size={16} color={COLORS.textInverse} />
          <Text style={styles.qrBarText} numberOfLines={1}>
            Manual Ride in progress · {manualRide.dropoff.name}
          </Text>
          <ChevronRight size={16} color={COLORS.textInverse} />
        </TouchableOpacity>
      )}

      {/* Home panel — hugs its content (no fixed-percentage sheet, so no dead space on tall
          phones and nothing clipped on short ones) and reports its real height to the map. On
          tablets / web it stays a readable width, centred. */}
      <View
        style={[
          styles.panel,
          isWide && styles.panelWide,
          { paddingBottom: insets.bottom + (isCompact ? SPACING.sm + 4 : SPACING.md + 4) },
          isCompact && styles.panelCompact,
        ]}
        onLayout={handlePanelLayout}
      >
        <View style={styles.handle} />

        {isRestricted && (
          <View style={[styles.statusBanner, isRevoked ? styles.statusBannerDanger : styles.statusBannerWarning]}>
            {isRevoked ? <Ban size={16} color={COLORS.dangerDark} /> : <ShieldOff size={16} color={COLORS.warning} />}
            <View style={styles.statusBannerText}>
              <Text style={[styles.statusBannerTitle, isRevoked ? styles.statusBannerTitleDanger : styles.statusBannerTitleWarning]}>
                {isRevoked ? 'Franchise Revoked' : 'Franchise Suspended'}
              </Text>
              <Text style={styles.statusBannerBody} numberOfLines={isCompact ? 3 : undefined}>
                {isRevoked
                  ? 'Your assigned franchise has been revoked. You cannot go online or accept bookings. Please contact the Municipal Tricycle Office for assistance.'
                  : 'Your assigned franchise is currently suspended. You cannot go online or accept bookings while it is suspended.'}
              </Text>
              {driver?.franchiseStatusReason ? (
                <Text style={styles.statusBannerReason}>Reason: {driver.franchiseStatusReason}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Work status — the one fact that matters most, carried by type size, with the live
            GPS state beside it instead of on a line of its own. */}
        <View>
          <View style={styles.statusRow}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>Work status</Text>
              <Text style={[isCompact ? styles.heroWordCompact : styles.heroWord, isOnline ? styles.heroWordOnline : styles.heroWordOffline]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            {isOnline ? (
              <View style={styles.gpsChip}>
                <Satellite size={12} color={COLORS.success} />
                <Text style={styles.gpsChipText}>GPS · {trackingLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroSubtitle}>
            {isRestricted
              ? 'Going online is disabled while your franchise is restricted'
              : isOnline
              ? "You're visible to nearby ride requests"
              : 'Go online to start receiving rides'}
          </Text>
        </View>

        {canStartManualRide ? (
          // Online and free: Go Offline shares the row with Manual Ride (walk-in passenger
          // without the app).
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <Button label="Go Offline" onPress={() => setIsOnline(false)} variant="secondary" size={isCompact ? 'md' : 'lg'} />
            </View>
            <View style={styles.flex}>
              <Button
                label={qrSession ? 'Add Walk-in' : 'Manual Ride'}
                icon={isNarrow ? undefined : Plus}
                onPress={openManualRide}
                size={isCompact ? 'md' : 'lg'}
              />
            </View>
          </View>
        ) : (
          <Button
            label={isOnline ? 'Go Offline' : 'Go Online'}
            onPress={() => setIsOnline(!isOnline)}
            variant={isOnline ? 'secondary' : 'primary'}
            disabled={isRestricted && !isOnline}
            size={isCompact ? 'md' : 'lg'}
          />
        )}

        {hasComplianceWarning && (
          <TouchableOpacity style={styles.warningRow} onPress={onOpenViolations} activeOpacity={0.75}>
            {activeSpeedWarning ? <Gauge size={15} color={COLORS.dangerDark} /> : <ShieldAlert size={15} color={COLORS.dangerDark} />}
            <Text style={styles.warningText} numberOfLines={2}>
              {activeSpeedWarning ? 'Overspeeding detected — slow down to stay under the municipal limit.' : codingWarning?.description}
            </Text>
            <ChevronRight size={14} color={COLORS.dangerDark} />
          </TouchableOpacity>
        )}

        {/* Today — two tappable figures that open Earnings and Rides */}
        <View style={styles.todayRow}>
          <TouchableOpacity
            style={styles.todayStat}
            onPress={onOpenEarnings}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`Today's earnings ₱${todayEarnings.toFixed(2)}. Open earnings`}
          >
            <Text style={styles.todayCaption}>Today's earnings</Text>
            <View style={styles.todayValueRow}>
              <Text style={[styles.todayValue, isCompact && styles.todayValueCompact]} numberOfLines={1}>
                ₱{todayEarnings.toFixed(2)}
              </Text>
              <ChevronRight size={16} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
          <View style={styles.todayDivider} />
          <TouchableOpacity
            style={styles.todayStat}
            onPress={onOpenTrips}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${completedTripsCount} completed rides today. Open ride history`}
          >
            <Text style={styles.todayCaption}>Completed rides</Text>
            <View style={styles.todayValueRow}>
              <Text style={[styles.todayValue, isCompact && styles.todayValueCompact]}>{completedTripsCount}</Text>
              <ChevronRight size={16} color={COLORS.textMuted} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <NotificationsModal visible={showNotifications} onClose={() => setShowNotifications(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  flex: { flex: 1 },
  headerLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  headerLocation: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    flexShrink: 1,
  },
  actionRow: { flexDirection: 'row', gap: SPACING.sm },
  qrBar: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    minHeight: 48,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
  },
  qrBarText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '600',
    color: COLORS.textInverse,
    flex: 1,
  },
  // Home panel — content-height, over the map
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.md,
    ...SHADOWS.sheet,
  },
  panelCompact: {
    gap: SPACING.sm + 4,
  },
  panelWide: {
    left: '50%',
    right: undefined,
    width: PANEL_MAX_WIDTH,
    marginLeft: -PANEL_MAX_WIDTH / 2,
  },
  barWide: {
    left: '50%',
    right: undefined,
    width: PANEL_MAX_WIDTH,
    marginLeft: -PANEL_MAX_WIDTH / 2,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.xs,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACING.sm,
  },
  eyebrow: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  heroWord: {
    ...TYPOGRAPHY.display,
    marginTop: 2,
  },
  heroWordCompact: {
    ...TYPOGRAPHY.h1,
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
    marginTop: 2,
  },
  gpsChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.successLight,
  },
  gpsChipText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.success,
  },
  statusBanner: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: RADIUS.lg,
    padding: SPACING.sm + 2,
    borderWidth: 1,
  },
  statusBannerWarning: {
    backgroundColor: COLORS.warningLight,
    borderColor: COLORS.warning,
  },
  statusBannerDanger: {
    backgroundColor: COLORS.dangerLight,
    borderColor: COLORS.dangerBorder,
  },
  statusBannerText: {
    flex: 1,
    gap: 2,
  },
  statusBannerTitle: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
  },
  statusBannerTitleWarning: {
    color: COLORS.warning,
  },
  statusBannerTitleDanger: {
    color: COLORS.dangerDark,
  },
  statusBannerBody: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  statusBannerReason: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 2,
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
  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  todayStat: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  todayCaption: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  todayValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  todayValue: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  todayValueCompact: {
    ...TYPOGRAPHY.h2,
  },
  todayDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: SPACING.lg,
  },
});
