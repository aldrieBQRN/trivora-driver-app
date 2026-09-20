import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapPin } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY } from '../constants/theme';

interface StopProps {
  label: string;
  address: string;
  meta?: string;
}

interface RouteTimelineProps {
  pickup?: StopProps;
  dropoff?: StopProps;
  compact?: boolean;
}

/**
 * Shared pickup → drop-off presentation — a continuous rail (dot, connecting line, pin) next to
 * the address rows, matching the Passenger app's RouteSummaryStrip so both apps draw a route the
 * same way. Renders either stop alone (the "going to pickup" and "in transit to drop-off" screens
 * only need one leg) or both, connected by one line spanning the full row height.
 */
export default function RouteTimeline({ pickup, dropoff, compact }: RouteTimelineProps) {
  const showBoth = !!pickup && !!dropoff;

  return (
    <View style={styles.container}>
      <View style={styles.rail}>
        {pickup && <View style={styles.pickupDot} />}
        {showBoth && <View style={styles.connector} />}
        {dropoff && (
          <View style={styles.dropoffPin}>
            <MapPin size={9} color="#FFFFFF" />
          </View>
        )}
      </View>

      <View style={styles.rows}>
        {pickup && (
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{pickup.label}</Text>
              <Text style={[styles.rowValue, compact && styles.rowValueCompact]} numberOfLines={1}>
                {pickup.address}
              </Text>
            </View>
            {pickup.meta && <Text style={styles.meta}>{pickup.meta}</Text>}
          </View>
        )}

        {showBoth && <View style={styles.hairline} />}

        {dropoff && (
          <View style={styles.row}>
            <View style={styles.rowTextCol}>
              <Text style={styles.rowLabel}>{dropoff.label}</Text>
              <Text style={[styles.rowValue, compact && styles.rowValueCompact]} numberOfLines={1}>
                {dropoff.address}
              </Text>
            </View>
            {dropoff.meta && <Text style={styles.meta}>{dropoff.meta}</Text>}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 12,
  },
  rail: {
    width: 16,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  pickupDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#2563EB',
  },
  connector: {
    width: 1.5,
    flex: 1,
    backgroundColor: COLORS.border,
    marginVertical: 3,
  },
  dropoffPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 8,
  },
  rowTextCol: {
    flex: 1,
  },
  rowLabel: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textSecondary,
  },
  rowValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    marginTop: 1,
  },
  rowValueCompact: {
    fontWeight: '700',
  },
  meta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  hairline: {
    height: 1,
    backgroundColor: COLORS.borderLight,
  },
});
