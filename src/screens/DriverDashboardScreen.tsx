import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutChangeEvent, useWindowDimensions, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { Star, Bell, Satellite, Gauge, ShieldAlert, ChevronRight, ShieldOff, Ban, Users, Plus, Navigation, MapPin, Wallet, CheckCircle2, Power, PowerOff } from 'lucide-react-native';
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

/** Status dot; while online a soft ring pulses out from it to read as "live". */
function LiveDot({ online }: { online: boolean }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!online) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [online, pulse]);

  return (
    <View style={styles.liveDotWrap}>
      {online && (
        <Animated.View
          style={[
            styles.liveRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
            },
          ]}
        />
      )}
      <View style={[styles.heroDot, online ? styles.heroDotOnline : styles.heroDotOffline]} />
    </View>
  );
}

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

  // Panel eases up into place when Home opens (transform only, so its measured height is unchanged).
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [enter]);

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
        mapVariant="bright"
        pitch={0}
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
        rounded
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
            <View>
              <Avatar name={driver?.name || 'Juan Dela Cruz'} imageUri={driver?.avatarUrl} tone="driver" size={40} />
              {/* Live work status at a glance, on the avatar */}
              <View style={[styles.avatarDot, isOnline ? styles.avatarDotOnline : styles.avatarDotOffline]} />
            </View>
          </TouchableOpacity>
        }
        rightSlot={
          <FloatingIconButton
            onPress={() => setShowNotifications(true)}
            hasBadge={hasUnread}
            accessibilityLabel="Notifications"
            size={40}
            style={styles.headerIconBtn}
          >
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
          <View style={styles.barIcon}>
            <Users size={16} color={COLORS.textInverse} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.qrBarText} numberOfLines={1}>Ride session</Text>
            <Text style={styles.qrBarSub} numberOfLines={1}>
              {qrSession.session.seats_used}/{qrSession.session.capacity ?? '—'} seats ·{' '}
              {qrSession.session.status === 'boarding' ? 'Waiting to start' : qrSession.session.status === 'completed' ? 'Ready to end' : 'In progress'}
            </Text>
          </View>
          <ChevronRight size={18} color={COLORS.textInverse} />
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
          <View style={styles.barIcon}>
            <Navigation size={16} color={COLORS.textInverse} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.qrBarText} numberOfLines={1}>Manual Ride in progress</Text>
            <Text style={styles.qrBarSub} numberOfLines={1}>To {manualRide.dropoff.name}</Text>
          </View>
          <ChevronRight size={18} color={COLORS.textInverse} />
        </TouchableOpacity>
      )}

      {/* Home panel — hugs its content (no fixed-percentage sheet, so no dead space on tall
          phones and nothing clipped on short ones) and reports its real height to the map. On
          tablets / web it stays a readable width, centred. */}
      <Animated.View
        style={[
          { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
          styles.panel,
          isWide && styles.panelWide,
          { paddingBottom: insets.bottom + (isCompact ? SPACING.sm + 4 : SPACING.md + 4) },
          isCompact && styles.panelCompact,
        ]}
        onLayout={handlePanelLayout}
      >
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

        {/* Work status — a small status pill (the only colour) and a plain headline; GPS source
            sits quietly beside the pill. */}
        <View style={styles.statusBlock}>
          <View style={styles.statusTopRow}>
            <View style={[styles.statusPill, isOnline ? styles.statusPillOnline : styles.statusPillOffline]}>
              <LiveDot online={isOnline} />
              <Text style={[styles.statusPillText, isOnline ? styles.statusPillTextOnline : styles.statusPillTextOffline]}>
                {isOnline ? 'Online' : 'Offline'}
              </Text>
            </View>
            {isOnline ? (
              <View style={styles.gpsMeta}>
                <Satellite size={12} color={COLORS.textSecondary} />
                <Text style={styles.gpsMetaText}>{trackingLabel}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.statusTitle, isCompact && styles.statusTitleCompact]}>
            {isOnline ? 'Ready for ride requests' : "You're offline"}
          </Text>
          <Text style={styles.heroSubtitle}>
            {isRestricted
              ? 'Going online is disabled while your franchise is restricted'
              : isOnline
              ? "You're visible to nearby passengers"
              : 'Go online to start receiving rides'}
          </Text>
        </View>

        {canStartManualRide ? (
          // Online and free: Go Offline shares the row with Manual Ride (walk-in passenger
          // without the app).
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <Button
                label="Go Offline"
                icon={isNarrow ? undefined : PowerOff}
                onPress={() => setIsOnline(false)}
                variant="secondary"
                size={isCompact ? 'md' : 'lg'}
              />
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
            icon={isOnline ? PowerOff : Power}
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

        {/* Today — one grouped strip of three figures; earnings and rides open their screens */}
        <View style={styles.todayBlock}>
          <Text style={styles.eyebrow}>Today</Text>
          <View style={styles.statsGroup}>
            <TouchableOpacity
              style={styles.stat}
              onPress={onOpenEarnings}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`Today's earnings ₱${todayEarnings.toFixed(2)}. Open earnings`}
            >
              <Text style={[styles.statValue, isCompact && styles.statValueCompact]} numberOfLines={1} adjustsFontSizeToFit>
                ₱{todayEarnings.toFixed(2)}
              </Text>
              <View style={styles.statLabelRow}>
                <Wallet size={12} color={COLORS.textSecondary} />
                <Text style={styles.statLabel}>Earnings</Text>
                <ChevronRight size={12} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.stat}
              onPress={onOpenTrips}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={`${completedTripsCount} completed rides today. Open ride history`}
            >
              <Text style={[styles.statValue, isCompact && styles.statValueCompact]}>{completedTripsCount}</Text>
              <View style={styles.statLabelRow}>
                <CheckCircle2 size={12} color={COLORS.textSecondary} />
                <Text style={styles.statLabel}>Rides</Text>
                <ChevronRight size={12} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.stat} accessibilityLabel={`Rating ${averageRating != null ? averageRating.toFixed(1) : 'not yet rated'}`}>
              <Text style={[styles.statValue, isCompact && styles.statValueCompact]}>
                {averageRating != null ? averageRating.toFixed(1) : '—'}
              </Text>
              <View style={styles.statLabelRow}>
                <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>

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
    gap: SPACING.sm + 4,
    minHeight: 60,
    paddingHorizontal: SPACING.sm + 4,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary,
    ...SHADOWS.md,
  },
  barIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBarText: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '700',
    color: COLORS.textInverse,
  },
  qrBarSub: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.72)',
    marginTop: 1,
  },
  headerIconBtn: {
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    shadowOpacity: 0,
    elevation: 0,
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
    paddingTop: SPACING.lg,
    gap: SPACING.md + 2,
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
  eyebrow: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
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
  statusBlock: {
    gap: 4,
  },
  statusTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
  },
  statusPillOnline: { backgroundColor: COLORS.successLight },
  statusPillOffline: { backgroundColor: COLORS.surfaceInput },
  statusPillText: { ...TYPOGRAPHY.caption, fontWeight: '700' },
  statusPillTextOnline: { color: COLORS.success },
  statusPillTextOffline: { color: COLORS.textSecondary },
  gpsMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gpsMetaText: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  statusTitle: { ...TYPOGRAPHY.h1, color: COLORS.textPrimary },
  statusTitleCompact: { ...TYPOGRAPHY.h2 },
  liveDotWrap: { width: 8, height: 8, alignItems: 'center', justifyContent: 'center' },
  liveRing: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  heroDot: { width: 8, height: 8, borderRadius: 4 },
  heroDotOnline: { backgroundColor: COLORS.success },
  heroDotOffline: { backgroundColor: COLORS.textMuted },
  statsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 4,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.xs,
  },
  statValue: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary },
  statValueCompact: { ...TYPOGRAPHY.h3 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: COLORS.border },
  todayBlock: {
    gap: SPACING.sm,
  },
  avatarDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.background,
  },
  avatarDotOnline: { backgroundColor: COLORS.success },
  avatarDotOffline: { backgroundColor: COLORS.textMuted },
});
