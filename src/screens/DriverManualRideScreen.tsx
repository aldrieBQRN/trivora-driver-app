import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, LayoutChangeEvent, Modal, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, CheckCircle2, ChevronRight, Minus, Plus, Satellite, SignalLow, AlertCircle, Search, MapPinned, Banknote, Smartphone } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useManualRide, toManualRideError, ManualRideError } from '../context/ManualRideContext';
import { useQrSession } from '../context/QrSessionContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { useLiveRoute } from '../hooks/useLiveRoute';
import { haversineKm } from '../utils/geo';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import ConfirmModal from '../components/ConfirmModal';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import DestinationSearchModal, { SelectedDestination } from '../components/DestinationSearchModal';
import DestinationPinModal from '../components/DestinationPinModal';
import DriverPaymentModal, { PassengerPaymentTarget } from '../components/DriverPaymentModal';
import { ManualRide, ManualRideQuote, DriverGcashQrStatus, PaymentMethod } from '../types';
import { driverApi } from '../services/api';

const peso = (n: number | null | undefined) => `₱${Number(n || 0).toFixed(2)}`;

/**
 * Manual Ride — add a walk-in passenger who has no app. The pick-up is the driver's current GPS
 * (decided by the server), the driver picks the destination and passenger count, and the fare is
 * the server's quote (never editable). The passenger joins the tricycle's one ride session — the
 * same one QR passengers join — whose screen then runs Start Ride and each drop-off.
 * (A legacy stand-alone ride still in progress keeps its own map, Complete and Cancel.)
 */
export default function DriverManualRideScreen() {
  const { ride } = useManualRide();
  return ride ? <ManualRideInProgress ride={ride} /> : <ManualRideSetup />;
}

// ============================================================================ Setup

function ManualRideSetup() {
  const { close, quote: requestQuote, add, busy } = useManualRide();
  const { session } = useQrSession();
  // Adding to a ride that is already boarding (QR and/or walk-in passengers waiting).
  const joiningSession = session?.session.status === 'boarding' ? session.session : null;
  const { currentLat, currentLng, isLocatingDriver } = useDriverShift();
  const hasGps = currentLat != null && currentLng != null;

  const [destination, setDestination] = useState<SelectedDestination | null>(null);
  const [partySize, setPartySize] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [driverGcash, setDriverGcash] = useState<DriverGcashQrStatus | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showChooser, setShowChooser] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [quote, setQuote] = useState<ManualRideQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<ManualRideError | null>(null);
  const [addError, setAddError] = useState<ManualRideError | null>(null);
  const [isAdding, setIsAdding] = useState<boolean>(false);
  // Seats still free in the ride (shared with everyone already in it), from the latest server read.
  const [seatsLeft, setSeatsLeft] = useState<number | null>(joiningSession ? joiningSession.seats_remaining : null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    driverApi.getGcashQr().then(setDriverGcash).catch(() => {});
  }, []);

  const hasDriverGcash = Boolean(driverGcash?.has_gcash_qr || driverGcash?.configured || driverGcash?.gcash_qr_url);

  const fetchQuote = async (targetDest?: SelectedDestination, targetParty?: number) => {
    const dest = targetDest ?? destination;
    const party = targetParty ?? partySize;
    if (!dest) return;

    const requestId = ++requestIdRef.current;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsQuoting(true);
    setQuoteError(null);
    setAddError(null);
    try {
      const q = await requestQuote({
        party_size: party,
        dropoff_name: dest.name,
        dropoff_lat: dest.lat,
        dropoff_lng: dest.lng,
      }, { signal: controller.signal });
      if (requestId !== requestIdRef.current) return;
      setQuote(q);
      setSeatsLeft(q.seats_remaining ?? q.passenger_capacity);
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      if (requestId !== requestIdRef.current) return;
      setQuote(null);
      setQuoteError(toManualRideError(err, "Couldn't calculate the fare."));
    } finally {
      if (requestId === requestIdRef.current) setIsQuoting(false);
    }
  };

  // A fresh server quote whenever the destination or passenger count changes, debounced by ~300ms.
  useEffect(() => {
    setQuote(null);
    if (!destination) {
      setIsQuoting(false);
      return;
    }
    setIsQuoting(true);
    const timer = setTimeout(() => {
      fetchQuote(destination, partySize);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [destination?.lat, destination?.lng, destination?.name, partySize]);

  const maxParty = seatsLeft ?? null;
  const canIncrease = maxParty == null || partySize < maxParty;

  const handleAdd = async () => {
    if (!quote || isAdding || !!busy) return;
    setIsAdding(true);
    setAddError(null);
    try {
      // On a dropped connection the same quote is simply sent again — the server adds it once.
      await add(quote.quote, paymentMethod);
    } catch (err: any) {
      if (err?.message === 'busy') return;
      const error = toManualRideError(err, "Couldn't add the passenger.");
      setAddError(error);
      // An expired or rejected quote can't be reused — get a new one.
      if (error.code === 'quote_expired' || error.code === 'invalid_quote') {
        setQuote(null);
        fetchQuote();
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={joiningSession ? 'Add Walk-in Passenger' : 'Manual Ride'}
        subtitle={joiningSession ? 'Joins your current ride' : 'Passenger without the app'}
        onBack={close}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Trip */}
        <Text style={styles.sectionLabelFirst}>Trip</Text>
        {/* Pick-up + destination in one card, like the passenger app's route card */}
        <View style={styles.tripCard}>
        <View style={styles.tripRow}>
          <View style={styles.markerCol}><View style={styles.pickupDot} /></View>
          <View style={styles.flex}>
            <Text style={styles.caption}>Pick-up</Text>
            <Text style={styles.value}>Your current location</Text>
            <View style={styles.gpsLine}>
              {hasGps ? <Satellite size={12} color={COLORS.success} /> : <SignalLow size={12} color={COLORS.warning} />}
              <Text style={[styles.gpsText, hasGps ? styles.gpsOk : styles.gpsWait]}>
                {hasGps ? 'GPS active' : isLocatingDriver ? 'Getting your GPS position…' : 'Waiting for a GPS fix'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.tripRow, styles.tripRowDivided]}
          onPress={() => setShowChooser(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={destination ? `Destination ${destination.name}. Change` : 'Choose the destination'}
        >
          <View style={styles.markerCol}><MapPin size={16} color={COLORS.danger} /></View>
          <View style={styles.flex}>
            <Text style={styles.caption}>Destination</Text>
            <Text style={[styles.value, !destination && styles.placeholder]} numberOfLines={2}>
              {destination ? destination.name : 'Search or pin a destination'}
            </Text>
          </View>
          {destination ? <Text style={styles.changeText}>Change</Text> : <ChevronRight size={18} color={COLORS.textMuted} />}
        </TouchableOpacity>
        </View>

        <View style={styles.partyRow}>
          <View style={styles.flex}>
            <Text style={styles.value}>Passengers</Text>
            <Text style={styles.caption}>
              {maxParty != null ? `${maxParty} seat${maxParty === 1 ? '' : 's'} left in your tricycle` : 'In this group'}
            </Text>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, partySize <= 1 && styles.stepBtnDisabled]}
              onPress={() => setPartySize((n) => Math.max(1, n - 1))}
              disabled={partySize <= 1}
              accessibilityLabel="Fewer passengers"
            >
              <Minus size={16} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{partySize}</Text>
            <TouchableOpacity
              style={[styles.stepBtn, !canIncrease && styles.stepBtnDisabled]}
              onPress={() => setPartySize((n) => n + 1)}
              disabled={!canIncrease}
              accessibilityLabel="More passengers"
            >
              <Plus size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Payment Method */}
        <Text style={styles.sectionLabel}>Payment Method</Text>
        <View style={styles.paymentMethodRow}>
          <TouchableOpacity
            style={[styles.paymentMethodCard, paymentMethod === 'cash' && styles.paymentMethodCardActive]}
            onPress={() => setPaymentMethod('cash')}
            activeOpacity={0.7}
          >
            <Banknote size={18} color={paymentMethod === 'cash' ? COLORS.primary : COLORS.textSecondary} />
            <Text style={[styles.paymentMethodText, paymentMethod === 'cash' && styles.paymentMethodTextActive]}>
              Cash
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.paymentMethodCard,
              paymentMethod === 'gcash' && styles.paymentMethodCardActive,
              !hasDriverGcash && styles.paymentMethodCardDisabled,
            ]}
            onPress={() => {
              if (hasDriverGcash) setPaymentMethod('gcash');
            }}
            disabled={!hasDriverGcash}
            activeOpacity={0.7}
          >
            <Smartphone
              size={18}
              color={!hasDriverGcash ? COLORS.textMuted : paymentMethod === 'gcash' ? COLORS.primary : COLORS.textSecondary}
            />
            <View>
              <Text
                style={[
                  styles.paymentMethodText,
                  paymentMethod === 'gcash' && styles.paymentMethodTextActive,
                  !hasDriverGcash && styles.paymentMethodTextDisabled,
                ]}
              >
                GCash
              </Text>
              {!hasDriverGcash && (
                <Text style={styles.paymentMethodSubtext}>No QR configured</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Fare — the server's quote, never editable */}
        <Text style={styles.sectionLabel}>Fare</Text>
        {!destination ? (
          <Text style={styles.hint}>Choose a destination to calculate the fare.</Text>
        ) : isQuoting ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.hint}>Calculating the fare…</Text>
          </View>
        ) : quoteError ? (
          <View style={styles.errorBlock}>
            <View style={styles.errorLine}>
              <AlertCircle size={15} color={COLORS.dangerDark} />
              <Text style={styles.errorText}>{quoteError.message}</Text>
            </View>
            <TouchableOpacity onPress={() => fetchQuote()} accessibilityRole="button">
              <Text style={styles.retry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : quote ? (
          <View>
            <FareLine label="Distance" value={`${Number(quote.distance_km).toFixed(1)} km${quote.distance_source === 'fallback' ? ' (est.)' : ''}`} />
            <FareLine label="Fare per passenger" value={peso(quote.fare_per_passenger)} />
            <FareLine label="Passengers" value={`× ${quote.party_size}`} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total fare</Text>
              <Text style={styles.totalValue}>{peso(quote.fare_amount)}</Text>
            </View>
            <Text style={styles.note}>Calculated by Trivora from the route distance. Collect in cash at drop-off.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {addError ? <Text style={[styles.errorText, styles.footerError]}>{addError.message}</Text> : null}
        <View style={styles.footerRow}>
          <View style={styles.flex}>
            <Text style={styles.caption}>Total fare</Text>
            {quote ? (
              <Text style={styles.footerValue}>{peso(quote.fare_amount)}</Text>
            ) : (
              <Text style={styles.footerPending}>Set a destination</Text>
            )}
          </View>
          <Button
            label="Add Passenger"
            onPress={handleAdd}
            loading={busy === 'add' || isAdding}
            disabled={!quote || isQuoting || !!busy || isAdding}
            fullWidth={false}
            style={styles.footerBtn}
          />
        </View>
      </View>

      {/* Destination method: search, or pin it on the map. The pin is the destination only —
          the pick-up always comes from the driver's GPS on the server. */}
      <Modal visible={showChooser} transparent animationType="fade" onRequestClose={() => setShowChooser(false)}>
        <Pressable style={styles.chooserBackdrop} onPress={() => setShowChooser(false)} accessibilityLabel="Close">
          <Pressable style={styles.chooserSheet} onPress={() => {}}>
            <Text style={styles.chooserTitle}>Set the destination</Text>
            <TouchableOpacity
              style={styles.chooserRow}
              onPress={() => { setShowChooser(false); setShowSearch(true); }}
              accessibilityRole="button"
              accessibilityLabel="Search a destination"
            >
              <View style={styles.chooserIcon}><Search size={18} color={COLORS.primary} /></View>
              <View style={styles.flex}>
                <Text style={styles.value}>Search</Text>
                <Text style={styles.caption}>Find a place by name</Text>
              </View>
              <ChevronRight size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chooserRow, styles.chooserRowDivider]}
              onPress={() => { setShowChooser(false); setShowPin(true); }}
              accessibilityRole="button"
              accessibilityLabel="Pin the destination on the map"
            >
              <View style={styles.chooserIcon}><MapPinned size={18} color={COLORS.primary} /></View>
              <View style={styles.flex}>
                <Text style={styles.value}>Pin on map</Text>
                <Text style={styles.caption}>Tap the exact drop-off point</Text>
              </View>
              <ChevronRight size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.chooserCancel} onPress={() => setShowChooser(false)} accessibilityRole="button">
              <Text style={styles.chooserCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <DestinationSearchModal
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        onSelect={(d) => { setDestination(d); setShowSearch(false); }}
      />

      <DestinationPinModal
        visible={showPin}
        onClose={() => setShowPin(false)}
        initialDestination={destination}
        onConfirm={(d) => { setDestination(d); setShowPin(false); }}
      />
    </View>
  );
}

function FareLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fareLine}>
      <Text style={styles.fareLabel}>{label}</Text>
      <Text style={styles.fareValue}>{value}</Text>
    </View>
  );
}

// ============================================================================ In progress

function ManualRideInProgress({ ride }: { ride: ManualRide }) {
  const { close, complete, cancel, busy } = useManualRide();
  const { currentLat, currentLng, headingDeg, isOnline } = useDriverShift();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);
  const [confirm, setConfirm] = useState<'complete' | 'cancel' | null>(null);

  const driverLocation = currentLat != null && currentLng != null ? { lat: currentLat, lng: currentLng, heading: headingDeg } : null;
  const dest = ride.dropoff;
  // The existing live route (display only) — redrawn as the driver moves.
  const route = useLiveRoute(driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng } : null, { lat: dest.lat, lng: dest.lng });
  const remainingKm = useMemo(() => {
    const pts = route?.coordinates ?? [];
    if (pts.length > 1) {
      let km = 0;
      for (let i = 1; i < pts.length; i++) km += haversineKm(pts[i - 1], pts[i]);
      return km;
    }
    return driverLocation ? haversineKm(driverLocation, dest) : null;
  }, [route, driverLocation?.lat, driverLocation?.lng, dest.lat, dest.lng]);

  const [paymentTarget, setPaymentTarget] = useState<PassengerPaymentTarget | null>(null);

  const onConfirm = async () => {
    const action = confirm;
    setConfirm(null);
    if (!action) return;
    if (action === 'cancel') {
      await cancel();
    } else if (action === 'complete') {
      const ok = await complete();
      if (ok) {
        setPaymentTarget({
          bookingId: ride.booking_code,
          bookingCode: ride.booking_code,
          passengerName: 'Walk-in Passenger',
          fare: Number(ride.fare_amount || 0),
          paymentMethod: ride.payment_method || 'cash',
          paymentStatus: 'unpaid',
          paymentReference: null,
          source: 'walk_in',
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      <TrivoraDriverMap
        driverLocation={driverLocation}
        isOnline
        showCompass
        mapVariant="liberty"
        pitch={50}
        target={{ lat: dest.lat, lng: dest.lng, label: dest.name, kind: 'dropoff' }}
        routeCoordinates={route?.coordinates ?? []}
        routeSource={route?.source ?? 'fallback'}
        topInset={headerHeight}
        bottomInset={panelHeight}
        style={StyleSheet.absoluteFillObject}
      />

      <ScreenHeader
        variant="overlay"
        tone="opaque"
        title="Manual Ride"
        subtitle="In progress"
        onBack={close}
        onLayout={(e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height)}
      />

      <View
        style={[styles.panel, { paddingBottom: insets.bottom + SPACING.md }]}
        onLayout={(e: LayoutChangeEvent) => setPanelHeight(e.nativeEvent.layout.height)}
      >
        <View style={styles.eyebrowRow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrow}>Manual Ride · In progress</Text>
        </View>

        <View style={styles.destRow}>
          <MapPin size={16} color={COLORS.danger} />
          <View style={styles.flex}>
            <Text style={styles.label}>Destination</Text>
            <Text style={styles.destText} numberOfLines={2}>{dest.name}</Text>
          </View>
        </View>

        {!driverLocation || !isOnline ? (
          <View style={styles.gpsLine}>
            <SignalLow size={13} color={COLORS.warning} />
            <Text style={[styles.gpsText, styles.gpsWait]}>
              {!isOnline ? "You're offline — GPS isn't being sent. You can still complete the ride." : 'Waiting for your GPS position.'}
            </Text>
          </View>
        ) : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.label}>Distance left</Text>
            <Text style={styles.statValue}>{remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—'}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.stat}>
            <Text style={styles.label}>Passengers</Text>
            <Text style={styles.statValue}>{ride.party_size}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={[styles.stat, styles.statEnd]}>
            <Text style={styles.label}>{ride.payment_method === 'gcash' ? 'GCash fare' : 'Cash fare'}</Text>
            <Text style={styles.statStrong}>{peso(ride.fare_amount)}</Text>
          </View>
        </View>

        <Button label="Complete Ride" icon={CheckCircle2} onPress={() => setConfirm('complete')} loading={busy === 'complete'} disabled={!!busy} />
        <TouchableOpacity
          style={styles.cancelLink}
          onPress={() => setConfirm('cancel')}
          disabled={!!busy}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel ride'}</Text>
        </TouchableOpacity>
      </View>

      <ConfirmModal
        visible={confirm !== null}
        title={confirm === 'complete' ? 'Complete this ride?' : 'Cancel this ride?'}
        message={
          confirm === 'complete'
            ? `Drop-off at ${dest.name}. Fare: ${peso(ride.fare_amount)} (${ride.payment_method === 'gcash' ? 'GCash' : 'Cash'}). Payment collection follows drop-off.`
            : "The trip is recorded as cancelled and no fare is added to your earnings."
        }
        confirmLabel={confirm === 'complete' ? 'Complete Ride' : 'Cancel Ride'}
        cancelLabel="Back"
        destructive={confirm === 'cancel'}
        loading={!!busy}
        onConfirm={onConfirm}
        onCancel={() => setConfirm(null)}
      />

      <DriverPaymentModal
        visible={paymentTarget !== null}
        target={paymentTarget}
        onClose={() => {
          setPaymentTarget(null);
          close();
        }}
        onSuccess={() => {
          setPaymentTarget(null);
          close();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },

  // Setup — bordered cards with soft section labels (same language as the passenger app)
  sectionLabelFirst: { ...TYPOGRAPHY.label, color: COLORS.textMuted, paddingTop: SPACING.md + 4, paddingBottom: SPACING.sm },
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textMuted, marginTop: SPACING.lg, paddingBottom: SPACING.sm },
  tripCard: { borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: SPACING.sm },
  tripRowDivided: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  markerCol: { width: 20, alignItems: 'center' },
  pickupDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 3, borderColor: COLORS.primary, backgroundColor: COLORS.background },
  caption: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  value: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary, marginTop: 2 },
  placeholder: { color: COLORS.textMuted, fontWeight: '400' },
  gpsLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  gpsText: { ...TYPOGRAPHY.caption, fontWeight: '600' },
  gpsOk: { color: COLORS.success },
  gpsWait: { color: COLORS.textSecondary },
  partyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64,
    marginTop: SPACING.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.lg,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepBtnDisabled: { opacity: 0.35 },
  stepValue: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, minWidth: 18, textAlign: 'center' },
  hint: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, paddingVertical: SPACING.sm },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  errorBlock: { gap: SPACING.xs, paddingVertical: SPACING.sm },
  errorLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  errorText: { ...TYPOGRAPHY.bodySmall, color: COLORS.dangerDark, flex: 1 },
  retry: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.primary, paddingLeft: 21 },
  fareLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36 },
  fareLabel: { ...TYPOGRAPHY.body, color: COLORS.textSecondary },
  fareValue: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: SPACING.xs, paddingVertical: SPACING.sm + 2 },
  totalLabel: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary },
  totalValue: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary },
  note: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm + 4, paddingBottom: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border, gap: SPACING.xs },
  footerError: { textAlign: 'center' },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 52 },
  footerValue: { ...TYPOGRAPHY.h1, color: COLORS.textPrimary },
  footerPending: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  footerBtn: { minWidth: 160 },

  // In progress — map + bottom panel
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md + 4,
    gap: SPACING.md,
    ...SHADOWS.sheet,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  eyebrow: { ...TYPOGRAPHY.label, color: COLORS.success },
  destRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { ...TYPOGRAPHY.label, color: COLORS.textMuted },
  destText: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary, marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingTop: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  stat: { flex: 1 },
  statEnd: { alignItems: 'flex-end' },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.borderLight, marginHorizontal: SPACING.md },
  statValue: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, marginTop: 3 },
  statStrong: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, marginTop: 1 },
  changeText: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.primary },
  chooserBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  chooserSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.lg,
  },
  chooserTitle: { ...TYPOGRAPHY.h3, fontWeight: '700', color: COLORS.textPrimary, marginBottom: SPACING.sm },
  chooserRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  chooserRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  chooserIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primaryTint, alignItems: 'center', justifyContent: 'center' },
  chooserCancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44, marginTop: SPACING.sm },
  chooserCancelText: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textSecondary },
  cancelLink: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', marginTop: -SPACING.xs },
  cancelText: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.dangerDark },

  // Payment method selection styles
  paymentMethodRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: 2,
    marginBottom: SPACING.xs,
  },
  paymentMethodCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  paymentMethodCardActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  paymentMethodCardDisabled: {
    opacity: 0.5,
    backgroundColor: COLORS.backgroundSubtle,
  },
  paymentMethodText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  paymentMethodTextActive: {
    color: COLORS.primary,
  },
  paymentMethodTextDisabled: {
    color: COLORS.textMuted,
  },
  paymentMethodSubtext: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
  },
});
