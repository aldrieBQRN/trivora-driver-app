import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { ViolationCitation } from '../types';
import { ShieldCheck, ChevronRight, WifiOff } from 'lucide-react-native';
import EmptyState from '../components/EmptyState';
import TabHeader from '../components/TabHeader';
import StatusBadge from '../components/StatusBadge';
import FilterTabs from '../components/FilterTabs';
import ViolationDetailScreen, { violationTone } from './ViolationDetailScreen';

type FilterTab = 'All' | 'Pending' | 'Resolved';

const FILTER_OPTIONS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Resolved', label: 'Resolved' },
];

interface ViolationsHistoryScreenProps {
  /** Opens this violation's detail once it is in the list (a tapped violation notification). */
  focusViolationId?: number | null;
  onFocusHandled?: () => void;
}

export default function ViolationsHistoryScreen({ focusViolationId = null, onFocusHandled }: ViolationsHistoryScreenProps = {}) {
  const { violations, isLoadingViolations, violationsError, refreshViolations } = useDriverShift();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  // Holds only the id, not a snapshot of the violation itself — derived live from `violations`
  // below so that a submitted appeal (which updates that array) is reflected immediately in the
  // still-open detail view, instead of the detail being stuck showing whatever the violation
  // looked like at the moment it was tapped.
  const [selectedViolationId, setSelectedViolationId] = useState<number | null>(null);
  const selectedViolation = violations.find((v) => v.id === selectedViolationId) ?? null;

  useEffect(() => {
    if (focusViolationId == null) return;
    let cancelled = false;
    (async () => {
      // A brand-new violation may not be in the list yet — fetch once before giving up and just
      // showing the list.
      if (!violations.some((v) => v.id === focusViolationId)) await refreshViolations();
      if (cancelled) return;
      setSelectedViolationId(focusViolationId);
      onFocusHandled?.();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusViolationId]);

  const filtered = violations.filter((v) => {
    if (activeFilter === 'All') return true;
    return v.status === activeFilter.toLowerCase();
  });

  // Grand totals across every violation, independent of the active filter — a driver should
  // see how many are pending and what they owe at a glance without adding rows up themselves.
  const summary = useMemo(() => {
    const pending = violations.filter((v) => v.status === 'pending');
    return {
      pendingCount: pending.length,
      outstandingFines: pending.reduce((total, v) => total + v.fine, 0),
    };
  }, [violations]);

  // Plain list row: title + fine on top, citation/date beneath, a two-line description, then the
  // status badge — the badge is the only status colour on the row.
  const renderViolation = ({ item }: { item: ViolationCitation }) => {
    const isResolved = item.status === 'resolved';

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setSelectedViolationId(item.id)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}, ${item.driverStatusLabel}, fine ₱${item.fine.toFixed(2)}. Open details`}
      >
        <View style={styles.rowBody}>
          <View style={styles.titleRow}>
            <Text style={styles.violationTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={[styles.fineText, isResolved && styles.fineTextSettled]}>₱{item.fine.toFixed(2)}</Text>
          </View>
          <Text style={styles.metaText} numberOfLines={1}>{item.citationNo} · {item.date}</Text>
          <Text style={styles.violationDesc} numberOfLines={2}>{item.description}</Text>
          <StatusBadge label={item.driverStatusLabel} tone={violationTone(item)} style={styles.badge} />
        </View>

        <ChevronRight size={18} color={COLORS.textMuted} />
      </TouchableOpacity>
    );
  };

  // Only the FIRST load (nothing fetched yet) blocks the whole screen — a failed background
  // refresh while a list is already showing just leaves that list visible rather than hiding it
  // behind an error, and never falls back to fake/sample data either way.
  const showInitialLoading = isLoadingViolations && violations.length === 0;
  const showLoadError = !isLoadingViolations && violationsError && violations.length === 0;

  if (selectedViolation) {
    // A plain page: it needs its own status-bar gap since this tab runs under it.
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ViolationDetailScreen violation={selectedViolation} onBack={() => setSelectedViolationId(null)} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Navy tab header (same as Home's); once the list has loaded, the filter sits on its curve. */}
      <TabHeader title="Violations">
        {!showInitialLoading && !showLoadError ? (
          <FilterTabs
            options={FILTER_OPTIONS}
            value={activeFilter}
            onChange={(key) => setActiveFilter(key as FilterTab)}
            variant="floating"
          />
        ) : null}
      </TabHeader>

      {showInitialLoading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading violations...</Text>
        </View>
      ) : showLoadError ? (
        <EmptyState
          icon={WifiOff}
          title="Couldn't Load Violations"
          subtitle={violationsError ?? undefined}
          actionLabel="Retry"
          onAction={refreshViolations}
        />
      ) : (
        <>
          {violations.length > 0 && (
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{summary.pendingCount}</Text>
                <Text style={styles.summaryLabel}>Pending</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, summary.outstandingFines > 0 && styles.summaryValueDanger]}>
                  ₱{summary.outstandingFines.toFixed(2)}
                </Text>
                <Text style={styles.summaryLabel}>Outstanding fines</Text>
              </View>
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderViolation}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <EmptyState icon={ShieldCheck} title="No Violations" subtitle="You have no recorded violations." />
            }
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  // Same grouped strip as the Home "Today" figures.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  summaryValueDanger: {
    color: COLORS.dangerDark,
  },
  summaryLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  violationTitle: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
  },
  fineText: {
    ...TYPOGRAPHY.bodyLarge,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  fineTextSettled: {
    color: COLORS.textMuted,
  },
  metaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  violationDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 6,
  },
  badge: {
    marginTop: SPACING.sm,
  },
});
