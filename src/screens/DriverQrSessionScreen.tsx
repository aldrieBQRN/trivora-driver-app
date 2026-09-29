import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MapPin, Users, WifiOff, CheckCircle2, Navigation, UserPlus } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useQrSession } from '../context/QrSessionContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { useManualRide } from '../context/ManualRideContext';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import ConfirmModal from '../components/ConfirmModal';
import QrPassengerRouteView from '../components/QrPassengerRouteView';
import { QrSessionPassenger } from '../types';

interface DriverQrSessionScreenProps {
  onBack: () => void;
}

type PendingAction =
  | { kind: 'start' }
  | { kind: 'remove'; passenger: QrSessionPassenger; label: string }
  | { kind: 'dropoff'; passenger: QrSessionPassenger; label: string }
  | null;

const peso = (n: number) => `₱${Number(n || 0).toFixed(2)}`;

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  accepted: { label: 'Waiting', bg: COLORS.primaryTint, fg: COLORS.primary },
  in_transit: { label: 'Aboard', bg: COLORS.successLight, fg: COLORS.success },
  completed: { label: 'Dropped off', bg: COLORS.backgroundSubtle, fg: COLORS.textSecondary },
};

/** How each passenger got into the ride: scanned the QR, or added by the driver (no app). */
const sourceLabel = (p: QrSessionPassenger) => (p.source === 'walk_in' ? 'Walk-in passenger' : 'QR passenger');

/**
 * The driver's one ride session: QR passengers (joined by scanning the tricycle's QR) and walk-in
 * passengers (added here via Manual Ride) together — who is in, where each is going, their fare,
 * then Start Ride and one Drop Off per passenger. Passenger names aren't shown — only what the
 * driver needs to deliver each trip. Everything reflects the server's session (QrSessionContext).
 */
export default function DriverQrSessionScreen({ onBack }: DriverQrSessionScreenProps) {
  const { session, busy, startRide, dropOff, removePassenger, endRide } = useQrSession();
  const { isOnline } = useDriverShift();
  const { open: openAddWalkIn } = useManualRide();
  const [pending, setPending] = useState<PendingAction>(null);
  // Booking code whose route is open full-screen (before or during the ride).
  const [routeFor, setRouteFor] = useState<string | null>(null);

  const passengers = session?.passengers ?? [];
  const seated = passengers.filter((p) => p.status === 'accepted' || p.status === 'in_transit');
  const aboard = passengers.filter((p) => p.status === 'in_transit');
  const dropped = passengers.filter((p) => p.status === 'completed');
  const collected = useMemo(() => dropped.reduce((sum, p) => sum + Number(p.fare_amount || 0), 0), [dropped]);
  // Counted in seats (party sizes), the same unit as "3 / 4 seats" — not in bookings.
  const seatsOf = (list: QrSessionPassenger[]) => list.reduce((sum, p) => sum + Number(p.party_size || 0), 0);

  if (!session) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="Ride Session" onBack={onBack} />
        <View style={styles.empty}>
          <Users size={28} color={COLORS.textMuted} />
          <Text style={styles.emptyTitle}>No passengers yet</Text>
          <Text style={styles.emptyBody}>Passengers join by scanning the QR code on your tricycle, or add a walk-in passenger from Home.</Text>
        </View>
      </View>
    );
  }

  const s = session.session;
  const isBoarding = s.status === 'boarding';
  const expiresAt = timeLabel(s.expires_at);
  // A walk-in can be added while boarding, online, and a seat is still free (the server re-checks).
  const canAddWalkIn = isBoarding && isOnline && (s.seats_remaining == null || s.seats_remaining > 0);

  const confirm = async () => {
    const action = pending;
    if (!action) return;
    if (action.kind === 'start') await startRide();
    if (action.kind === 'remove') await removePassenger(action.passenger.booking_code);
    if (action.kind === 'dropoff') {
      const ok = await dropOff(action.passenger.booking_code);
      // Dropped off from the route map — back to the passenger list.
      if (ok && routeFor === action.passenger.booking_code) setRouteFor(null);
    }
    setPending(null);
  };

  const confirmModal = (
    <ConfirmModal
      visible={pending !== null}
      title={
        pending?.kind === 'start' ? 'Start the ride?'
          : pending?.kind === 'remove' ? `Remove ${pending.label}?`
          : pending?.kind === 'dropoff' ? `Drop off ${pending.label}?`
          : ''
      }
      message={
        pending?.kind === 'start'
          ? `${s.seats_used} ${s.seats_used === 1 ? 'passenger' : 'passengers'} aboard. No one else can join once the ride starts.`
          : pending?.kind === 'remove'
          ? "They'll be taken off this ride and won't be charged."
          : pending?.kind === 'dropoff'
          ? `At ${pending.passenger.dropoff.name}. Collect ${peso(pending.passenger.fare_amount)} in cash.`
          : ''
      }
      confirmLabel={pending?.kind === 'start' ? 'Start Ride' : pending?.kind === 'remove' ? 'Remove' : 'Drop Off'}
      cancelLabel="Cancel"
      destructive={pending?.kind === 'remove'}
      loading={!!busy}
      onConfirm={confirm}
      onCancel={() => setPending(null)}
    />
  );

  // Full-screen route for one passenger — live GPS to their destination.
  const routeIndex = routeFor ? passengers.findIndex((p) => p.booking_code === routeFor) : -1;
  const routePassenger = routeIndex >= 0 ? passengers[routeIndex] : null;
  if (routePassenger && routePassenger.status !== 'completed' && routePassenger.status !== 'cancelled') {
    const label = `Passenger ${routeIndex + 1}`;
    return (
      <>
        <QrPassengerRouteView
          passenger={routePassenger}
          label={label}
          onBack={() => setRouteFor(null)}
          onDropOff={routePassenger.status === 'in_transit' ? () => setPending({ kind: 'dropoff', passenger: routePassenger, label }) : undefined}
          dropOffBusy={busy === routePassenger.booking_code}
        />
        {confirmModal}
      </>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Ride Session"
        subtitle={isBoarding ? 'Waiting to start' : 'Ride in progress'}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Summary — state, seats and money, all as plain type on the page */}
        <View style={styles.summary}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.stateDot, !isBoarding && styles.stateDotActive]} />
            <Text style={[styles.eyebrow, !isBoarding && styles.eyebrowActive]}>
              {isBoarding ? 'Boarding' : 'Ride in progress'}
            </Text>
          </View>
          <Text style={styles.seats}>
            {s.seats_used}
            <Text style={styles.seatsOf}> / {s.capacity ?? '—'} seats</Text>
          </Text>

          {/* One segment per seat — filled for each passenger seated */}
          {s.capacity ? (
            <View style={styles.seatBar}>
              {Array.from({ length: s.capacity }).map((_, i) => (
                <View key={i} style={[styles.seatSeg, i < s.seats_used && styles.seatSegFilled]} />
              ))}
            </View>
          ) : null}

          <Text style={styles.summaryText}>
            {isBoarding
              ? `Passengers can still join by scanning your QR, or add a walk-in passenger.${expiresAt ? ` Start by ${expiresAt} or this ride is cancelled.` : ''}`
              : 'No one else can join. Drop each passenger off at their destination.'}
          </Text>

          {!isOnline && (
            <View style={styles.offlineRow}>
              <WifiOff size={14} color={COLORS.dangerDark} />
              <Text style={styles.offlineText}>
                You're offline — GPS isn't being sent. Drop-offs are saved without a location.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <Stat label={isBoarding ? 'Waiting' : 'Aboard'} value={String(seatsOf(isBoarding ? seated : aboard))} />
          <View style={styles.statDivider} />
          <Stat label="Dropped off" value={String(seatsOf(dropped))} />
          <View style={styles.statDivider} />
          <Stat label="Total fare" value={peso(s.total_fare)} end strong />
        </View>

        <Text style={styles.sectionLabel}>Passengers</Text>

        {passengers.length === 0 ? (
          <Text style={styles.emptyBody}>No passengers are waiting.</Text>
        ) : (
          passengers.map((p, i) => {
            const label = `Passenger ${i + 1}`;
            const meta = STATUS_META[p.status] ?? STATUS_META.completed;
            const rowBusy = busy === p.booking_code;
            const isDone = p.status === 'completed';
            return (
              <View key={p.booking_code} style={[styles.row, i > 0 && styles.rowDivider]}>
                <View style={styles.rowMain}>
                  <View style={[styles.num, isDone && styles.numDone]}>
                    {isDone
                      ? <CheckCircle2 size={16} color={COLORS.success} />
                      : <Text style={styles.numText}>{i + 1}</Text>}
                  </View>

                  <View style={styles.rowBody}>
                    <View style={styles.destLine}>
                      <MapPin size={13} color={isDone ? COLORS.textMuted : COLORS.danger} />
                      <Text style={[styles.rowDest, isDone && styles.muted]} numberOfLines={2}>{p.dropoff.name}</Text>
                    </View>
                    <Text style={styles.rowMeta}>
                      <Text style={styles.sourceText}>{sourceLabel(p)}</Text>
                      {' · '}{p.party_size} {p.party_size === 1 ? 'seat' : 'seats'} · {Number(p.distance_km).toFixed(1)} km
                      {isDone && timeLabel(p.completed_at) ? ` · dropped off ${timeLabel(p.completed_at)}` : ''}
                    </Text>
                  </View>

                  <View style={styles.rowRight}>
                    <Text style={[styles.rowFare, isDone && styles.muted]}>{peso(p.fare_amount)}</Text>
                    <Text style={[styles.tagText, { color: meta.fg }]}>{meta.label}</Text>
                  </View>
                </View>

                {p.status === 'accepted' && isBoarding && (
                  <View style={styles.linkRow}>
                    <TouchableOpacity
                      style={styles.linkBtn}
                      onPress={() => setRouteFor(p.booking_code)}
                      accessibilityRole="button"
                      accessibilityLabel={`View route to ${label}'s destination`}
                    >
                      <Navigation size={14} color={COLORS.primary} />
                      <Text style={styles.linkText}>View route</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.linkBtn}
                      onPress={() => setPending({ kind: 'remove', passenger: p, label })}
                      disabled={!!busy}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${label}`}
                    >
                      <Text style={styles.removeText}>{rowBusy ? 'Removing…' : 'Remove passenger'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {p.status === 'in_transit' && (
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.routeIconBtn}
                      onPress={() => setRouteFor(p.booking_code)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`View route to ${label}'s destination`}
                    >
                      <Navigation size={18} color={COLORS.primary} />
                    </TouchableOpacity>
                    <View style={styles.flex}>
                      <Button
                        label="Drop Off"
                        size="md"
                        onPress={() => setPending({ kind: 'dropoff', passenger: p, label })}
                        loading={rowBusy}
                        disabled={!!busy && !rowBusy}
                      />
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}

        {canAddWalkIn && (
          <TouchableOpacity
            style={styles.addRow}
            onPress={openAddWalkIn}
            disabled={!!busy}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add a walk-in passenger"
          >
            <View style={styles.addIcon}><UserPlus size={16} color={COLORS.primary} /></View>
            <View style={styles.flex}>
              <Text style={styles.addText}>Add Walk-in Passenger</Text>
              <Text style={styles.rowMeta}>
                For someone without the app{s.seats_remaining != null ? ` · ${s.seats_remaining} ${s.seats_remaining === 1 ? 'seat' : 'seats'} left` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {isBoarding ? (
          <View style={styles.footerRow}>
            <View style={styles.flex}>
              <Text style={styles.footerLabel}>{s.seats_used} {s.seats_used === 1 ? 'passenger' : 'passengers'}</Text>
              <Text style={styles.footerValue}>{peso(s.total_fare)}</Text>
            </View>
            <Button
              label="Start Ride"
              onPress={() => setPending({ kind: 'start' })}
              loading={busy === 'start'}
              disabled={seated.length === 0 || !!busy}
              fullWidth={false}
              style={styles.footerBtn}
            />
          </View>
        ) : seated.length > 0 ? (
          // Two rows: what's been collected (+ who's still aboard), then collection progress.
          <View style={styles.collectBlock}>
            <View style={styles.collectTop}>
              <View style={styles.flex}>
                <Text style={styles.footerLabel}>Collected</Text>
                <Text style={styles.footerValue}>
                  {peso(collected)} <Text style={styles.footerOf}>of {peso(s.total_fare)}</Text>
                </Text>
              </View>
              <View style={styles.aboardTag}>
                <View style={styles.aboardDot} />
                <Text style={styles.aboardText}>{seatsOf(aboard)} aboard</Text>
              </View>
            </View>
            <View style={styles.collectTrack}>
              <View
                style={[
                  styles.collectFill,
                  { width: `${s.total_fare > 0 ? Math.min(100, (collected / s.total_fare) * 100) : 0}%` },
                ]}
              />
            </View>
          </View>
        ) : (
          <Button label="End Ride" variant="secondary" onPress={endRide} loading={busy === 'end'} />
        )}
      </View>

      {confirmModal}
    </View>
  );
}

function Stat({ label, value, end, strong }: { label: string; value: string; end?: boolean; strong?: boolean }) {
  return (
    <View style={[styles.stat, end && styles.statEnd]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={strong ? styles.statStrong : styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Flat page: plain type and hairline dividers, no boxed cards.
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  flex: { flex: 1 },

  // Summary
  summary: { paddingTop: SPACING.md + 4, paddingBottom: SPACING.md, gap: 6 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
  stateDotActive: { backgroundColor: COLORS.success },
  eyebrow: { ...TYPOGRAPHY.label, color: COLORS.textSecondary },
  eyebrowActive: { color: COLORS.success },
  seats: { ...TYPOGRAPHY.display, color: COLORS.textPrimary },
  seatsOf: { ...TYPOGRAPHY.h3, color: COLORS.textSecondary },
  seatBar: { flexDirection: 'row', gap: 4, marginTop: 2 },
  seatSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceInput },
  seatSegFilled: { backgroundColor: COLORS.primary },
  summaryText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, marginTop: 4 },
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  offlineText: { ...TYPOGRAPHY.caption, color: COLORS.dangerDark, flex: 1 },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  stat: { flex: 1 },
  statEnd: { alignItems: 'flex-end' },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.borderLight, marginHorizontal: SPACING.md },
  statLabel: { ...TYPOGRAPHY.label, color: COLORS.textMuted },
  statValue: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary, marginTop: 3 },
  statStrong: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, marginTop: 1 },

  // Passenger list
  sectionLabel: { ...TYPOGRAPHY.label, color: COLORS.textSecondary, paddingTop: SPACING.md + 4, paddingBottom: SPACING.xs, borderTopWidth: 1, borderTopColor: COLORS.border },
  row: { paddingVertical: SPACING.md, gap: SPACING.sm + 2 },
  rowDivider: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  rowMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primaryTint, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: COLORS.successLight },
  numText: { ...TYPOGRAPHY.bodySmall, fontWeight: '700', color: COLORS.primary },
  rowBody: { flex: 1, gap: 3 },
  destLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  rowDest: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary, flex: 1 },
  rowMeta: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  sourceText: { fontWeight: '600', color: COLORS.textPrimary },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  addIcon: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: COLORS.primary, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addText: { ...TYPOGRAPHY.bodyLarge, fontWeight: '600', color: COLORS.primary },
  rowRight: { alignItems: 'flex-end', gap: 3 },
  rowFare: { ...TYPOGRAPHY.bodyLarge, fontWeight: '700', color: COLORS.textPrimary },
  tagText: { ...TYPOGRAPHY.micro },
  muted: { color: COLORS.textSecondary },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.lg, paddingLeft: 42 },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 },
  linkText: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.primary },
  removeText: { ...TYPOGRAPHY.bodySmall, fontWeight: '600', color: COLORS.dangerDark },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingLeft: 42 },
  routeIconBtn: {
    width: 44, height: 44, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
  },

  // Footer — the figure on the left, the one action on the right
  footer: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm + 4, paddingBottom: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, minHeight: 52 },
  footerLabel: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary },
  footerValue: { ...TYPOGRAPHY.h1, color: COLORS.textPrimary },
  footerOf: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary },
  collectBlock: { gap: SPACING.sm + 2, paddingVertical: SPACING.xs },
  collectTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  aboardTag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.successLight },
  aboardDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.success },
  aboardText: { ...TYPOGRAPHY.caption, fontWeight: '700', color: COLORS.success },
  collectTrack: { height: 6, borderRadius: 3, backgroundColor: COLORS.surfaceInput, overflow: 'hidden' },
  collectFill: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  footerBtn: { minWidth: 160 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.xl },
  emptyTitle: { ...TYPOGRAPHY.h3, color: COLORS.textPrimary },
  emptyBody: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.md },
});
