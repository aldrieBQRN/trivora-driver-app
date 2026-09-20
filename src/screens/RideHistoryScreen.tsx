import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { RideHistoryItem } from '../types';
import { Receipt, Star } from 'lucide-react-native';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import RouteTimeline from '../components/RouteTimeline';
import StatusBadge from '../components/StatusBadge';
import FilterTabs from '../components/FilterTabs';
import DriverRideDetailsScreen from './DriverRideDetailsScreen';

type FilterTab = 'All' | 'Completed' | 'Cancelled';

const FILTER_OPTIONS = [
  { key: 'All', label: 'All' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
];

export default function RideHistoryScreen() {
  const { historyList } = useDriverShift();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [selectedItem, setSelectedItem] = useState<RideHistoryItem | null>(null);

  const filtered = historyList.filter((item) => {
    if (activeFilter === 'All') return true;
    return item.status === activeFilter.toLowerCase();
  });

  const sections = useMemo(() => {
    const byDate = new Map<string, RideHistoryItem[]>();
    filtered.forEach((item) => {
      const list = byDate.get(item.date) || [];
      list.push(item);
      byDate.set(item.date, list);
    });
    return Array.from(byDate.entries()).map(([date, data]) => ({ title: date, data }));
  }, [filtered]);

  if (selectedItem) {
    return <DriverRideDetailsScreen item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Ride History" />

      <FilterTabs
        options={FILTER_OPTIONS}
        value={activeFilter}
        onChange={(key) => setActiveFilter(key as FilterTab)}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.dateHeader}>{title}</Text>
        )}
        renderItem={({ item }) => {
          const isCompleted = item.status === 'completed';
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => setSelectedItem(item)}
              activeOpacity={isCompleted ? 0.7 : 1}
              disabled={!isCompleted}
            >
              <View style={styles.routeCol}>
                <RouteTimeline
                  pickup={{ label: 'Pick-up', address: item.pickup }}
                  dropoff={{ label: 'Destination', address: item.dropoff }}
                  compact
                />
                <Text style={styles.metaText}>{item.passengerName} · {item.time}</Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.fareText}>₱{item.fare.toFixed(2)}</Text>
                <Text style={styles.paxText}>{item.passengerCount ?? 1} pax</Text>
                <StatusBadge
                  label={isCompleted ? 'Completed' : 'Cancelled'}
                  tone={isCompleted ? 'success' : 'danger'}
                  size="sm"
                />
                {isCompleted && (
                  item.rating ? (
                    <View style={styles.ratingRow}>
                      <Star size={11} color={COLORS.amber} fill={COLORS.amber} />
                      <Text style={styles.ratingText}>{item.rating.toFixed(1)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.notRatedText}>Not Rated</Text>
                  )
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon={Receipt} title="No Rides Yet" subtitle="Completed rides will show up here." />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 40,
  },
  dateHeader: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  routeCol: {
    flex: 1,
    gap: 6,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  fareText: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.textPrimary,
  },
  paxText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  notRatedText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  metaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginLeft: 20,
  },
});
