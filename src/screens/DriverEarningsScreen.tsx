import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { RideHistoryItem } from '../types';
import { rideDate } from '../utils/rideDate';
import { Star, TrendingUp, TrendingDown } from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import SectionHeader from '../components/SectionHeader';
import FilterTabs from '../components/FilterTabs';

type Period = 'daily' | 'weekly' | 'monthly';

const PERIOD_LABEL: Record<Period, string> = {
  daily: "Today's Earnings",
  weekly: "This Week's Earnings",
  monthly: "This Month's Earnings",
};

const PREVIOUS_LABEL: Record<Period, string> = {
  daily: 'yesterday',
  weekly: 'last week',
  monthly: 'last month',
};

const PERIOD_OPTIONS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TREND_BAR_MAX_HEIGHT = 56;

// Real ride records already carry a completion time (e.g. "09:41 AM"), so today's rides can be
// grouped into the same four day-parts a driver naturally thinks in, instead of 24 mostly-empty
// hourly bars. This is the daily-view equivalent of weekly's 7 days / monthly's 4-5 weeks —
// one granularity level below the period itself, always a fixed, legible bucket count.
const DAY_PARTS: { label: string; startHour: number; endHour: number }[] = [
  { label: 'Morning', startHour: 6, endHour: 12 },
  { label: 'Afternoon', startHour: 12, endHour: 18 },
  { label: 'Evening', startHour: 18, endHour: 24 },
  { label: 'Night', startHour: 0, endHour: 6 },
];

function sumFares(items: RideHistoryItem[]): number {
  return items.reduce((total, item) => total + item.fare, 0);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Parses the app's "hh:mm AM/PM" time strings (from mock data and mapBookingRecordToHistoryItem
 * alike) into a 24-hour hour value, so a ride record can be placed into a day-part bucket. */
function parseHour(time: string): number {
  const match = time.match(/(\d{1,2}):\d{2}\s*(AM|PM)/i);
  if (!match) return 0;
  let hour = parseInt(match[1], 10) % 12;
  if (match[2].toUpperCase() === 'PM') hour += 12;
  return hour;
}

export default function DriverEarningsScreen() {
  const { todayEarnings, completedTripsCount, historyList } = useDriverShift();
  const [period, setPeriod] = useState<Period>('daily');

  // Everything below still comes from the exact same two sources the old screen used —
  // the live todayEarnings/completedTripsCount counters for "daily", and historyList
  // (real backend data via driverApi.getHistory, falling back to local demo data) for
  // weekly/monthly aggregation. No new data source, no invented numbers — this just
  // extends the same date-filtering approach to also expose the underlying ride records
  // (so the breakdown/trend sections below have something real to group) and a matching
  // "previous period" window for the comparison line.
  const periodStats = useMemo(() => {
    const completed = historyList.filter((t) => t.status === 'completed');
    const cancelled = historyList.filter((t) => t.status === 'cancelled');

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - 6);
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfWeek.getDate() - 7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const between = (list: RideHistoryItem[], start: Date, end?: Date) =>
      list.filter((t) => {
        const d = rideDate(t);
        return d >= start && (!end || d < end);
      });

    const dailyItems = between(completed, startOfToday);
    const yesterdayItems = between(completed, startOfYesterday, startOfToday);

    const weeklyItems = between(completed, startOfWeek);
    const prevWeeklyItems = between(completed, startOfPrevWeek, startOfWeek);

    const monthlyItems = between(completed, startOfMonth);
    const prevMonthlyItems = between(completed, startOfPrevMonth, startOfMonth);

    return {
      daily: {
        value: todayEarnings,
        count: completedTripsCount,
        items: dailyItems,
        cancelled: between(cancelled, startOfToday),
        previousValue: sumFares(yesterdayItems),
      },
      weekly: {
        value: sumFares(weeklyItems),
        count: weeklyItems.length,
        items: weeklyItems,
        cancelled: between(cancelled, startOfWeek),
        previousValue: sumFares(prevWeeklyItems),
      },
      monthly: {
        value: sumFares(monthlyItems),
        count: monthlyItems.length,
        items: monthlyItems,
        cancelled: between(cancelled, startOfMonth),
        previousValue: sumFares(prevMonthlyItems),
      },
    };
  }, [historyList, todayEarnings, completedTripsCount]);

  const activeStats = periodStats[period];
  const avgPerRide = activeStats.count > 0 ? activeStats.value / activeStats.count : 0;
  const hasData = activeStats.count > 0;
  // For weekly/monthly, activeStats.count IS activeStats.items.length (both derived from
  // historyList), so this is always true whenever hasData is. For daily, activeStats.count
  // comes from the live todayEarnings/completedTripsCount counters (preserved as-is per the
  // existing calculation), which can be non-zero even when historyList has no ride record
  // actually dated today — e.g. a fresh session before any ride has completed, or a seeded
  // demo total with no matching dated record. Performance/trend are built from dated records,
  // so they need this narrower check to avoid showing a contradictory "0 completed" alongside
  // a non-zero hero, or silently hiding the chart with no explanation.
  const hasBreakdownData = activeStats.items.length > 0;

  const delta =
    activeStats.previousValue > 0
      ? ((activeStats.value - activeStats.previousValue) / activeStats.previousValue) * 100
      : null;

  // Performance for the period — completion rate and average passenger rating, both
  // aggregated from the same real ride records (not per-ride detail, so this stays an
  // Earnings-page summary rather than duplicating what Ride History already shows).
  // Trivora is cash-only, so there is no payment-method split to show here.
  const performance = useMemo(() => {
    const completedCount = activeStats.items.length;
    const cancelledCount = activeStats.cancelled.length;
    const totalRides = completedCount + cancelledCount;
    const completionRate = totalRides > 0 ? (completedCount / totalRides) * 100 : null;

    const ratedItems = activeStats.items.filter((t): t is RideHistoryItem & { rating: number } => t.rating != null);
    const avgRating = ratedItems.length > 0 ? ratedItems.reduce((sum, t) => sum + t.rating, 0) / ratedItems.length : null;

    return { completedCount, cancelledCount, completionRate, avgRating, ratedCount: ratedItems.length };
  }, [activeStats.items, activeStats.cancelled]);

  // A real breakdown chart only makes sense at a granularity that stays legible regardless of
  // ride volume: daily breaks into 4 day-parts, weekly into 7 days, monthly into 4-5 weeks
  // (grouped by day-of-month, not calendar week, so it's always a fixed, predictable bucket
  // count) rather than ~30 daily bars, which would be noise rather than a useful chart. All
  // three render real (possibly zero) totals from actual ride records — never invented ones.
  const trendTitle =
    period === 'daily' ? 'Earnings by Time of Day' : period === 'weekly' ? 'Daily Earnings' : 'Weekly Earnings';

  const dailyTrend = useMemo(() => {
    if (period !== 'daily') return [];
    const currentHour = new Date().getHours();
    return DAY_PARTS.map((part) => {
      const total = sumFares(
        periodStats.daily.items.filter((t) => {
          const hour = parseHour(t.time);
          return hour >= part.startHour && hour < part.endHour;
        })
      );
      const isCurrent = currentHour >= part.startHour && currentHour < part.endHour;
      return { label: part.label, total, isCurrent };
    });
  }, [period, periodStats.daily.items]);

  const weeklyTrend = useMemo(() => {
    if (period !== 'weekly') return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - i));
      const total = sumFares(periodStats.weekly.items.filter((t) => isSameDay(rideDate(t), day)));
      return { label: WEEKDAY_LABELS[day.getDay()], total, isCurrent: isSameDay(day, today) };
    });
  }, [period, periodStats.weekly.items]);

  const monthlyTrend = useMemo(() => {
    if (period !== 'monthly') return [];
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = now.getDate();

    const buckets: { label: string; total: number; isCurrent: boolean }[] = [];
    for (let start = 1; start <= daysInMonth; start += 7) {
      const end = Math.min(start + 6, daysInMonth);
      const total = sumFares(
        periodStats.monthly.items.filter((t) => {
          const d = rideDate(t);
          return d.getFullYear() === year && d.getMonth() === month && d.getDate() >= start && d.getDate() <= end;
        })
      );
      buckets.push({ label: `W${buckets.length + 1}`, total, isCurrent: todayDate >= start && todayDate <= end });
    }
    return buckets;
  }, [period, periodStats.monthly.items]);

  const trendData = period === 'daily' ? dailyTrend : period === 'weekly' ? weeklyTrend : monthlyTrend;
  const trendMax = Math.max(1, ...trendData.map((d) => d.total));
  const showTrend = trendData.length > 0 && trendData.some((d) => d.total > 0);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Earnings" />

      <FilterTabs options={PERIOD_OPTIONS} value={period} onChange={(key) => setPeriod(key as Period)} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Total earnings is the one figure that matters most on this screen. */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>{PERIOD_LABEL[period]}</Text>
          <Text style={styles.heroValue}>₱{activeStats.value.toFixed(2)}</Text>

          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{activeStats.count}</Text>
              <Text style={styles.heroStatLabel}>Completed Rides</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>₱{avgPerRide.toFixed(2)}</Text>
              <Text style={styles.heroStatLabel}>Avg / Ride</Text>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          {!hasData ? (
            <Text style={styles.emptyText}>No completed rides in this period yet.</Text>
          ) : (
            <>
              {delta !== null && (
                <View style={styles.compareRow}>
                  {delta >= 0 ? (
                    <TrendingUp size={13} color={COLORS.success} />
                  ) : (
                    <TrendingDown size={13} color={COLORS.dangerDark} />
                  )}
                  <Text style={styles.compareText}>
                    <Text style={[styles.compareValue, { color: delta >= 0 ? COLORS.success : COLORS.dangerDark }]}>
                      {delta >= 0 ? '+' : ''}
                      {delta.toFixed(0)}%
                    </Text>{' '}
                    vs {PREVIOUS_LABEL[period]}
                  </Text>
                </View>
              )}

              {hasBreakdownData ? (
                <>
                  <View>
                    <SectionHeader title="Performance" />
                    <View style={styles.perfRow}>
                      <View style={styles.perfItem}>
                        <Text style={styles.perfValue}>
                          {performance.completionRate !== null ? `${performance.completionRate.toFixed(0)}%` : '—'}
                        </Text>
                        <Text style={styles.perfLabel}>Completion Rate</Text>
                        <Text style={styles.perfCaption}>
                          {performance.completedCount} completed · {performance.cancelledCount} cancelled
                        </Text>
                      </View>
                      <View style={styles.perfDivider} />
                      <View style={styles.perfItem}>
                        <View style={styles.perfStarRow}>
                          {performance.avgRating !== null && (
                            <Star size={14} color={COLORS.amber} fill={COLORS.amber} />
                          )}
                          <Text style={styles.perfValue}>
                            {performance.avgRating !== null ? performance.avgRating.toFixed(1) : '—'}
                          </Text>
                        </View>
                        <Text style={styles.perfLabel}>Avg Rating</Text>
                        <Text style={styles.perfCaption}>
                          {performance.ratedCount > 0
                            ? `${performance.ratedCount} rated ${performance.ratedCount === 1 ? 'ride' : 'rides'}`
                            : 'No ratings yet'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {showTrend && (
                    <View>
                      <SectionHeader title={trendTitle} />
                      <View style={styles.trendChart}>
                        {trendData.map((bucket, index) => (
                          <View key={index} style={styles.trendCol}>
                            <Text style={styles.trendValue}>{bucket.total > 0 ? Math.round(bucket.total) : ''}</Text>
                            <View style={styles.trendTrack}>
                              <View
                                style={[
                                  styles.trendBar,
                                  { height: Math.max(3, (bucket.total / trendMax) * TREND_BAR_MAX_HEIGHT) },
                                  bucket.isCurrent && styles.trendBarCurrent,
                                ]}
                              />
                            </View>
                            <Text style={[styles.trendDayLabel, bucket.isCurrent && styles.trendDayLabelCurrent]}>
                              {bucket.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <Text style={styles.emptyText}>Ride-by-ride details for this period aren't available yet.</Text>
              )}
            </>
          )}
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
  scrollContent: {
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    padding: SPACING.lg,
    ...SHADOWS.md,
  },
  heroLabel: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroValue: {
    ...TYPOGRAPHY.hero,
    fontSize: 42,
    lineHeight: 46,
    color: '#FFFFFF',
    marginTop: 6,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.16)',
    width: '100%',
  },
  heroStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    ...TYPOGRAPHY.h2,
    color: '#FFFFFF',
  },
  heroStatLabel: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroStatDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  body: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    gap: SPACING.lg,
  },
  emptyText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compareText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  compareValue: {
    fontWeight: '800',
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  perfItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  perfDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.borderLight,
  },
  perfStarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  perfValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  perfLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  perfCaption: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  trendChart: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  trendCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  trendValue: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textSecondary,
    height: 13,
  },
  trendTrack: {
    height: TREND_BAR_MAX_HEIGHT,
    width: 14,
    justifyContent: 'flex-end',
  },
  trendBar: {
    width: '100%',
    borderRadius: RADIUS.xs,
    backgroundColor: COLORS.border,
  },
  trendBarCurrent: {
    backgroundColor: COLORS.primary,
  },
  trendDayLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  trendDayLabelCurrent: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
