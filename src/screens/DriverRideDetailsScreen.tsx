import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { RideHistoryItem } from '../types';
import { Star, MessageSquareQuote } from 'lucide-react-native';
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
        <View style={styles.topRow}>
          <StatusBadge
            label={isCompleted ? 'Completed' : 'Cancelled'}
            tone={isCompleted ? 'success' : 'danger'}
          />
          <Text style={styles.bookingCode}>{item.bookingCode}</Text>
        </View>
        <Text style={styles.dateTimeText}>{item.date} · {item.time}</Text>

        {/* Passenger */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PASSENGER</Text>
          <View style={styles.passengerRow}>
            <Avatar name={item.passengerName} imageUri={item.passengerAvatarUrl} size={44} tone="driver" />
            <View style={styles.passengerCol}>
              <Text style={styles.passengerName}>{item.passengerName}</Text>
              {isCompleted ? (
                item.rating ? (
                  <View style={styles.ratingRow}>
                    <Star size={13} color={COLORS.amber} fill={COLORS.amber} />
                    <Text style={styles.ratingText}>{item.rating.toFixed(1)} rating for this ride</Text>
                  </View>
                ) : (
                  <Text style={styles.notRatedText}>Not Rated</Text>
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
          <Text style={styles.sectionLabel}>ROUTE</Text>
          <RouteTimeline
            pickup={{ label: 'Pick-up', address: item.pickup }}
            dropoff={{ label: 'Destination', address: item.dropoff }}
          />

          {hasRouteCoords && (
            <View style={styles.mapBox}>
              <TrivoraDriverMap
                driverLocation={{ lat: item.pickupLat as number, lng: item.pickupLng as number, heading: 0 }}
                isOnline
                showTodaPill={false}
                showCompass={false}
                target={{
                  lat: item.dropoffLat as number,
                  lng: item.dropoffLng as number,
                  label: item.dropoff,
                  kind: 'dropoff',
                }}
                routeCoordinates={routeCoordinates}
                style={styles.mapFill}
              />
            </View>
          )}
        </View>

        <View style={styles.divider} />

        {/* Ride Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RIDE SUMMARY</Text>
          <DetailRow label="Distance" value={`${item.distanceKm.toFixed(1)} km`} />
          {item.durationMinutes != null && (
            <DetailRow label="Duration" value={`${item.durationMinutes} min`} />
          )}
          <DetailRow label="Passengers" value={String(item.passengerCount ?? 1)} />
          <DetailRow label="Fare per Passenger" value={`₱${(item.farePerPassenger ?? item.fare).toFixed(2)}`} />
          <DetailRow
            label="Payment Method"
            value={item.paymentMethod === 'gcash' ? 'GCash' : 'Cash'}
            last
          />
        </View>

        <View style={styles.divider} />

        {/* Earnings */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>EARNINGS</Text>
          <View style={styles.earningsHero}>
            <Text style={styles.earningsHeroLabel}>Fare Earned</Text>
            <Text style={styles.earningsHeroValue}>₱{item.fare.toFixed(2)}</Text>
          </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bookingCode: {
    ...TYPOGRAPHY.caption,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  dateTimeText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 6,
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
    ...TYPOGRAPHY.micro,
    color: COLORS.primary,
    fontWeight: '800',
  },
  mapBox: {
    height: 160,
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailRowLast: {
    borderBottomWidth: 0,
  },
  detailLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  detailValue: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  earningsHero: {
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
  },
  earningsHeroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  earningsHeroValue: {
    ...TYPOGRAPHY.hero,
    color: COLORS.primary,
    marginTop: 4,
  },
});
