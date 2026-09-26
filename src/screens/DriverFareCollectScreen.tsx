import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { Check, Banknote, Smartphone } from 'lucide-react-native';
import RouteTimeline from '../components/RouteTimeline';
import Button from '../components/Button';

export default function DriverFareCollectScreen() {
  const { fareToCollect, activeBooking, finishAndCollectFare } = useDriverShift();
  const insets = useSafeAreaInsets();

  const totalFare = fareToCollect ?? activeBooking?.fare ?? 45.0;
  const passengerCount = activeBooking?.passengerCount ?? 1;
  const farePerPassenger = activeBooking?.farePerPassenger ?? totalFare;
  const isCash = (activeBooking?.paymentMethod || 'cash') === 'cash';

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.checkCircle}>
          <Check size={26} color="#FFFFFF" strokeWidth={3} />
        </View>
        <Text style={styles.title}>Ride Completed</Text>
        {activeBooking && <Text style={styles.subtitle}>{activeBooking.passengerName}</Text>}

        {/* Total fare is the one number that matters here — typography carries it, not a card.
            Priced per passenger by trip distance, charged once per rider. */}
        <View style={styles.fareHero}>
          <Text style={styles.fareHeroLabel}>Total Fare</Text>
          <Text style={styles.fareHeroValue}>₱{totalFare.toFixed(2)}</Text>
          <Text style={styles.fareHeroBreakdown}>
            ₱{farePerPassenger.toFixed(2)} × {passengerCount} passenger{passengerCount !== 1 ? 's' : ''}
          </Text>
        </View>

        <View style={styles.paymentRow}>
          {isCash ? (
            <Banknote size={18} color={COLORS.success} />
          ) : (
            <Smartphone size={18} color={COLORS.success} />
          )}
          <Text style={styles.paymentText}>
            {isCash
              ? `Collect ₱${totalFare.toFixed(2)} cash from passenger`
              : `₱${totalFare.toFixed(2)} paid via GCash — no cash to collect`}
          </Text>
        </View>

        {activeBooking && (
          <View style={styles.recap}>
            <Text style={styles.recapLabel}>TRIP</Text>
            <RouteTimeline
              pickup={{ label: 'Pick-up', address: activeBooking.pickup }}
              dropoff={{ label: 'Destination', address: activeBooking.dropoff }}
              compact
            />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + SPACING.md }]}>
        <Button label="Finish Ride & Go Available" onPress={finishAndCollectFare} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  checkCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: 2,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  fareHero: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  fareHeroLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
  },
  fareHeroValue: {
    ...TYPOGRAPHY.hero,
    color: COLORS.primary,
    marginTop: 4,
  },
  fareHeroBreakdown: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.successLight,
  },
  paymentText: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.textPrimary,
    flex: 1,
  },
  recap: {
    width: '100%',
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  recapLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  footer: {
    padding: SPACING.md,
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
