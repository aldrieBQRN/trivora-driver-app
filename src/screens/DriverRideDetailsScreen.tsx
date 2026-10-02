import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { RideHistoryItem } from '../types';
import { Star, MessageSquareQuote, CheckCircle2, Clock, Banknote, Smartphone } from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';
import Avatar from '../components/Avatar';
import RouteTimeline from '../components/RouteTimeline';
import TrivoraDriverMap from '../components/TrivoraDriverMap';
import { fetchRoute, RouteCoordinate } from '../services/routingService';

interface DriverRideDetailsScreenProps {
  item: RideHistoryItem;
  onBack: () => void;
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last && styles.detailRowLast]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

/**
 * Driver-facing counterpart to the Passenger app's E-Receipt — same underlying booking record,
 * but organized around what a driver needs after a ride: who they carried, the route they drove,
 * and what they earned, rather than a paid-fare receipt. Reached by tapping a completed row in
 * Ride History; only ever rendered with real booking data already present on the history item.
 */
export default function DriverRideDetailsScreen({ item, onBack }: DriverRideDetailsScreenProps) {
  const isCompleted = item.status === 'completed';
  // Earnings are credited only once the driver confirms payment; an unknown status (older data)
  // is treated as paid, as before.
  const isPaid = isCompleted && (!item.paymentStatus || item.paymentStatus === 'paid');
  const isGcash = item.paymentMethod === 'gcash';
  const methodLabel = isGcash ? 'GCash' : 'Cash';
  const hasRouteCoords =
    item.pickupLat != null && item.pickupLng != null && item.dropoffLat != null && item.dropoffLng != null;

  const [routeCoordinates, setRouteCoordinates] = useState<RouteCoordinate[] | undefined>(undefined);

  useEffect(() => {
    if (!hasRouteCoords) return;
    let cancelled = false;
    fetchRoute(
      { lat: item.pickupLat as number, lng: item.pickupLng as number },
      { lat: item.dropoffLat as number, lng: item.dropoffLng as number }
    ).then((result) => {
      if (!cancelled) setRouteCoordinates(result.coordinates);
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the booking itself — this route is fixed history, never refetched for the same item.
  }, [item.id, hasRouteCoords]);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ride Details" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* What this ride earned, first */}
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>{isPaid ? 'Fare earned' : 'Fare'}</Text>
          <Text style={[styles.heroAmount, !isCompleted && styles.heroAmountInert]}>₱{item.fare.toFixed(2)}</Text>
          {isCompleted ? (
            isPaid ? (
              <View style={styles.heroPill}>
                <CheckCircle2 size={13} color={COLORS.success} />
                <Text style={styles.heroPillText}>Paid via {methodLabel}</Text>
              </View>
            ) : (
              <View style={[styles.heroPill, styles.heroPillPending]}>
                <Clock size={13} color={COLORS.amberDark} />
                <Text style={[styles.heroPillText, styles.heroPillTextPending]}>Payment pending · {methodLabel}</Text>
              </View>
            )
          ) : (
            <StatusBadge label="Cancelled" tone="danger" />
          )}
          <Text style={styles.heroMeta}>{item.bookingCode} · {item.date} · {item.time}</Text>
        </View>

        {/* Passenger */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Passenger</Text>
          <View style={styles.passengerRow}>
            <Avatar name={item.passengerName} imageUri={item.passengerAvatarUrl} size={44} tone="driver" />
            <View style={styles.passengerCol}>
              <Text style={styles.passengerName}>{item.passengerName}</Text>
              {item.isManual ? (
                <Text style={styles.notRatedText}>Manual ride · no app account</Text>
              ) : isCompleted ? (
                item.rating ? (
                  <View style={styles.ratingRow}>
                    <Star size={13} color={COLORS.amber} fill={COLORS.amber} />
                    <Text style={styles.ratingText}>{item.rating.toFixed(1)} rating for this ride</Text>
                  </View>
                ) : (
                  <Text style={styles.notRatedText}>Not rated</Text>
                )
              ) : null}
            </View>
          </View>

          {!!item.ratingComment && (
            <View style={styles.commentBox}>
              <MessageSquareQuote size={14} color={COLORS.textSecondary} />
              <Text style={styles.commentText}>{item.ratingComment}</Text>
            </View>
          )}

          {!!item.ratingFeedbackTags?.length && (
            <View style={styles.tagRow}>
              {item.ratingFeedbackTags.map((tag) => (
                <View key={tag} style={styles.tagChip}>
                  <Text style={styles.tagChipText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Route */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Route</Text>
          <RouteTimeline
            pickup={{ label: 'Pick-up', address: item.pickup }}
            dropoff={{ label: 'Destination', address: item.dropoff }}
          />

          {hasRouteCoords && (
            <View style={styles.mapBox}>
              {/* Historical trip: framed on the stored pickup -> destination (+ route once
                  fetched) via the map's trip mode — never on the driver's current location. */}
              <TrivoraDriverMap
                driverLocation={null}
                showDriverMarker={false}
                isOnline
                showCompass={false}
                mapVariant="bright"
                pitch={0}
                target={{
                  lat: item.pickupLat as number,
                  lng: item.pickupLng as number,
                  label: item.pickup,
                  kind: 'pickup',
                }}
                tripDropoff={{ lat: item.dropoffLat as number, lng: item.dropoffLng as number }}
                routeCoordinates={routeCoordinates}
                style={styles.mapFill}
              />
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Ride summary */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Ride summary</Text>
          <DetailRow label="Distance" value={`${item.distanceKm.toFixed(1)} km`} />
          {item.durationMinutes != null && (
            <DetailRow label="Duration" value={`${item.durationMinutes} min`} />
          )}
          <DetailRow label="Passengers" value={String(item.passengerCount ?? 1)} />
          <DetailRow label="Fare per passenger" value={`₱${(item.farePerPassenger ?? item.fare).toFixed(2)}`} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total fare</Text>
            <Text style={styles.totalValue}>₱{item.fare.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Payment</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Method</Text>
            <View style={styles.methodValue}>
              {isGcash ? <Smartphone size={14} color={COLORS.primary} /> : <Banknote size={14} color={COLORS.primary} />}
              <Text style={styles.detailValue}>{methodLabel}</Text>
            </View>
          </View>
          {isCompleted && (
            <DetailRow label="Status" value={isPaid ? 'Paid' : 'Payment pending'} last={!(isGcash && item.paymentReference)} />
          )}
          {isGcash && item.paymentReference ? <DetailRow label="GCash reference" value={item.paymentReference} last /> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  hero: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.backgroundSubtle,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  heroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  heroAmount: {
    ...TYPOGRAPHY.hero,
    color: COLORS.textPrimary,
  },
  heroAmountInert: {
    color: COLORS.textMuted,
    textDecorationLine: 'line-through',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.successLight,
  },
  heroPillPending: {
    backgroundColor: COLORS.amberLight,
  },
  heroPillText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.success,
  },
  heroPillTextPending: {
    color: COLORS.amberDark,
  },
  heroMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginTop: SPACING.lg,
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  ratingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  notRatedText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  commentBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  commentText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 17,
    fontStyle: 'italic',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: SPACING.sm,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
  },
  tagChipText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
  },
  mapBox: {
    height: 180,
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.md,
  },
  mapFill: {
    flex: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.md,
    minHeight: 40,
  },
  detailRowLast: {},
  detailLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  methodValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
    paddingTop: SPACING.sm + 2,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  totalLabel: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  totalValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
});
