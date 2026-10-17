import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY, FONT_FAMILY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { useDriverNotifications } from '../context/DriverNotificationsContext';
import {
  X, Gauge, ShieldAlert, AlertOctagon, BellOff, BellRing, CarFront, CircleX, CircleCheck, Receipt, BadgeCheck,
} from 'lucide-react-native';
import EmptyState from './EmptyState';
import StatusBadge from './StatusBadge';
import { AppNotificationItem } from '../types';

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

/** Icon + tone per backend event (App\Services\MobileNotifier). */
function eventVisual(event: string | null) {
  switch (event) {
    case 'booking_request':
      return { Icon: BellRing, color: COLORS.primary, bubble: styles.iconBubbleInfo };
    case 'booking_assigned':
      return { Icon: CarFront, color: COLORS.primary, bubble: styles.iconBubbleInfo };
    case 'booking_completed':
      return { Icon: CircleCheck, color: COLORS.success, bubble: styles.iconBubbleSuccess };
    case 'booking_cancelled':
      return { Icon: CircleX, color: COLORS.dangerDark, bubble: styles.iconBubbleDanger };
    case 'fare_updated':
      return { Icon: Receipt, color: COLORS.primary, bubble: styles.iconBubbleInfo };
    case 'violation_appeal_approved':
    case 'violation_settled':
    case 'franchise_active':
      return { Icon: BadgeCheck, color: COLORS.success, bubble: styles.iconBubbleSuccess };
    default:
      return { Icon: AlertOctagon, color: COLORS.dangerDark, bubble: styles.iconBubbleDanger };
  }
}

/**
 * The driver's notification center: live compliance warnings from DriverShiftContext (speeding,
 * coding day), the persistent backend notifications (DriverNotificationsContext — ride requests,
 * ride updates, violations, franchise status, fare changes; the same items that arrive as phone
 * notifications), and still-unresolved citations. Tapping a notification marks it read and opens
 * the screen it is about.
 *
 * A modal overlay rather than a pushed full screen — matches the Passenger app's own
 * Notifications presentation, so the same feature opens the same way in both apps.
 */
export default function NotificationsModal({ visible, onClose }: NotificationsModalProps) {
  // Bottom sheet clears the phone's navigation bar (gesture or 3-button).
  const insets = useSafeAreaInsets();
  const { violations, activeSpeedWarning, codingWarning } = useDriverShift();
  const { notifications, unreadCount, markAllRead, openNotification } = useDriverNotifications();
  const pendingViolations = violations.filter((v) => v.status === 'pending');
  const hasLiveAlerts = activeSpeedWarning || !!codingWarning;
  const hasAnything = hasLiveAlerts || pendingViolations.length > 0 || notifications.length > 0;

  const renderNotification = (item: AppNotificationItem) => {
    const { Icon, color, bubble } = eventVisual(item.event);
    return (
      <TouchableOpacity key={item.id} style={styles.row} onPress={() => openNotification(item)} activeOpacity={0.7}>
        <View style={[styles.iconBubble, bubble]}>
          <Icon size={17} color={color} />
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text style={[styles.rowTitle, item.read && styles.rowTitleRead]} numberOfLines={1}>{item.title}</Text>
            <View style={styles.metaRight}>
              {!item.read && <View style={styles.unreadDot} />}
              <Text style={styles.rowDate}>{item.time}</Text>
            </View>
          </View>
          <Text style={styles.rowDesc}>{item.message}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Notifications</Text>
              {/* Always shown — reads "0 unread" after Mark all read instead of disappearing */}
              <Text style={styles.unreadLabel}>{unreadCount} unread</Text>
            </View>
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity onPress={markAllRead} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.markAllText}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
                <X size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + SPACING.sm, Platform.OS === 'ios' ? 34 : SPACING.lg) }]}>
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
                    <View
                      style={[
                        styles.iconBubble,
                        codingWarning.isViolation ? styles.iconBubbleDanger : styles.iconBubbleWarning,
                      ]}
                    >
                      {codingWarning.isViolation ? (
                        <AlertOctagon size={17} color={COLORS.dangerDark} />
                      ) : (
                        <ShieldAlert size={17} color={COLORS.amberDark} />
                      )}
                    </View>
                    <View style={styles.rowBody}>
                      <View style={styles.rowHeader}>
                        <Text style={styles.rowTitle}>{codingWarning.title || 'Coding Restriction Today'}</Text>
                        <StatusBadge
                          label={codingWarning.isViolation ? 'VIOLATION' : 'RESTRICTED'}
                          tone={codingWarning.isViolation ? 'danger' : 'warning'}
                          size="sm"
                        />
                      </View>
                      <Text style={styles.rowDesc}>{codingWarning.description}</Text>
                      {codingWarning.fineText ? (
                        <Text style={[styles.rowFine, { marginTop: 2 }]}>{codingWarning.fineText}</Text>
                      ) : null}
                    </View>
                  </View>
                )}
              </View>
            )}

            {notifications.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>RECENT</Text>
                {notifications.map(renderNotification)}
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
  unreadLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  markAllText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.primary,
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
  iconBubbleInfo: {
    backgroundColor: COLORS.backgroundSubtle,
  },
  iconBubbleSuccess: {
    backgroundColor: COLORS.successLight,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
  },
  rowTitleRead: {
    fontFamily: FONT_FAMILY,
    fontWeight: '500',
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
    fontWeight: '700',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  rowFine: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
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
