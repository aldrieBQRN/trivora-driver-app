import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { ViolationCitation } from '../types';
import { AlertOctagon, ShieldCheck, CheckCircle2, ChevronRight, WifiOff } from 'lucide-react-native';
import EmptyState from '../components/EmptyState';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';
import FilterTabs from '../components/FilterTabs';
import ViolationDetailModal from '../components/ViolationDetailModal';

type FilterTab = 'All' | 'Pending' | 'Resolved';

const FILTER_OPTIONS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'Resolved', label: 'Resolved' },
];

export default function ViolationsHistoryScreen() {
  const { violations, isLoadingViolations, violationsError, refreshViolations } = useDriverShift();
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  // Holds only the id, not a snapshot of the violation itself — derived live from `violations`
  // below so that a submitted appeal (which updates that array) is reflected immediately in the
  // still-open detail modal, instead of the modal being stuck showing whatever the violation
  // looked like at the moment it was tapped.
  const [selectedViolationId, setSelectedViolationId] = useState<number | null>(null);
  const selectedViolation = violations.find((v) => v.id === selectedViolationId) ?? null;

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

  const renderViolation = ({ item }: { item: ViolationCitation }) => {
    const isResolved = item.status === 'resolved';

    return (
      <TouchableOpacity style={styles.row} onPress={() => setSelectedViolationId(item.id)} activeOpacity={0.7}>
        <View style={[styles.accentBar, isResolved ? styles.accentBarResolved : styles.accentBarPending]} />

        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <View style={styles.badgeRow}>
              {isResolved ? (
                <CheckCircle2 size={15} color={COLORS.success} />
              ) : (
                <AlertOctagon size={15} color={COLORS.dangerDark} />
              )}
              <Text style={styles.citationNo}>{item.citationNo}</Text>
            </View>
            <StatusBadge label={item.driverStatusLabel} tone={isResolved ? 'success' : 'danger'} size="sm" />
          </View>

          <Text style={styles.violationTitle}>{item.title}</Text>
          <Text style={styles.violationDesc}>{item.description}</Text>

          <View style={styles.footerRow}>
            <Text style={styles.dateText}>{item.date}</Text>
            <Text style={[styles.fineText, !isResolved && styles.fineTextPending]}>₱{item.fine.toFixed(2)}</Text>
          </View>
        </View>

        <ChevronRight size={18} color={COLORS.textMuted} style={styles.chevron} />
      </TouchableOpacity>
    );
  };

  // Only the FIRST load (nothing fetched yet) blocks the whole screen — a failed background
  // refresh while a list is already showing just leaves that list visible rather than hiding it
  // behind an error, and never falls back to fake/sample data either way.
  const showInitialLoading = isLoadingViolations && violations.length === 0;
  const showLoadError = !isLoadingViolations && violationsError && violations.length === 0;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Violations" />

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
          <FilterTabs
            options={FILTER_OPTIONS}
            value={activeFilter}
            onChange={(key) => setActiveFilter(key as FilterTab)}
          />

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
                <Text style={styles.summaryLabel}>Outstanding Fines</Text>
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

      <ViolationDetailModal
        visible={selectedViolation !== null}
        violation={selectedViolation}
        onClose={() => setSelectedViolationId(null)}
      />
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
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
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  accentBar: {
    width: 3,
    borderRadius: RADIUS.full,
  },
  chevron: {
    alignSelf: 'center',
  },
  accentBarPending: {
    backgroundColor: COLORS.danger,
  },
  accentBarResolved: {
    backgroundColor: COLORS.success,
  },
  rowBody: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  citationNo: {
    ...TYPOGRAPHY.caption,
    fontWeight: '900',
    color: COLORS.primary,
  },
  violationTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  violationDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  dateText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  fineText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
  fineTextPending: {
    color: COLORS.dangerDark,
  },
});
