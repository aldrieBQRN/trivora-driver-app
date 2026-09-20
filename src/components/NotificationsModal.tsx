import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { X, Gauge, ShieldAlert, AlertOctagon, BellOff } from 'lucide-react-native';
import EmptyState from './EmptyState';
import StatusBadge from './StatusBadge';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

/**
 * A real feed of what actually needs the driver's attention right now — live compliance
 * warnings plus unresolved citations — built from the same `violations`/`activeSpeedWarning`/
 * `codingWarning` state already tracked in DriverShiftContext. There's no separate backend
 * notification system in this app, so this deliberately doesn't invent one: it's a different
 * lens on real data, not a duplicate of the Violations tab (which is the full pending+resolved
 * history/management view) — and not exclusively about violations either, so this doesn't funnel
 * everything toward a single "view all violations" destination.
 *
 * A modal overlay rather than a pushed full screen — matches the Passenger app's own
 * Notifications presentation, so the same feature opens the same way in both apps.
 */
export default function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
  const { violations, activeSpeedWarning, codingWarning } = useDriverShift();
  const pendingViolations = violations.filter((v) => v.status === 'pending');
  const hasLiveAlerts = activeSpeedWarning || !!codingWarning;
  const hasAnything = hasLiveAlerts || pendingViolations.length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {!hasAnything && (
              <EmptyState
                icon={BellOff}
                title="You're All Caught Up"
                subtitle="No active alerts or pending violations right now."
              />
            )}

            {hasLiveAlerts && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ACTIVE NOW</Text>

                {activeSpeedWarning && (
                  <View style={styles.row}>
                    <View style={[styles.iconBubble, styles.iconBubbleDanger]}>
                      <Gauge size={17} color={COLORS.dangerDark} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowTitle}>Overspeeding Detected</Text>
                        <StatusBadge label="LIVE" tone="danger" size="sm" />
                      </View>
                      <Text style={styles.rowDesc}>
                        Slow down to stay under the municipal speed limit.
                      </Text>
                    </View>
                  </View>
                )}

                {codingWarning && (
                  <View style={styles.row}>
                    <View style={[styles.iconBubble, styles.iconBubbleDanger]}>
                      <ShieldAlert size={17} color={COLORS.dangerDark} />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowTitle}>Color-Coding Restriction</Text>
                        <StatusBadge label="LIVE" tone="danger" size="sm" />
                      </View>
                      <Text style={styles.rowDesc}>{codingWarning.description}</Text>
                    </View>
                  </View>
                )}
              </View>
            )}

            {pendingViolations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>PENDING VIOLATIONS</Text>

                {pendingViolations.map((item) => (
                  <View key={item.id} style={styles.row}>
                    <View style={[styles.iconBubble, styles.iconBubbleWarning]}>
                      <AlertOctagon size={17} color="#B45309" />
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowTitle}>{item.title}</Text>
                        <Text style={styles.rowFine}>₱{item.fine.toFixed(2)}</Text>
                      </View>
                      <Text style={styles.rowDesc} numberOfLines={2}>{item.description}</Text>
                      <Text style={styles.rowDate}>{item.date}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    maxHeight: '80%',
    ...SHADOWS.sheet,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING.md,
    paddingBottom: Platform.OS === 'ios' ? 34 : SPACING.lg,
  },
  section: {
    marginBottom: SPACING.md,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBubbleDanger: {
    backgroundColor: COLORS.dangerLight,
  },
  iconBubbleWarning: {
    backgroundColor: COLORS.amberLight,
  },
  rowBody: {
    flex: 1,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  rowTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  rowFine: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.dangerDark,
  },
  rowDesc: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  rowDate: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 4,
  },
});
