import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { useDriverShift } from '../context/DriverShiftContext';
import { DriverProfile } from '../types';
import {
  User,
  Truck,
  Radar,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  ChevronDown,
  Star,
  MapPin,
  Pencil,
} from 'lucide-react-native';
import EditableAvatar from '../components/EditableAvatar';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';
import EditProfileModal from '../components/EditProfileModal';
import ConfirmModal from '../components/ConfirmModal';

interface DriverProfileScreenProps {
  onOpenTrackingSettings: () => void;
}

// Help Center / About Trivora have no structured contact fields anywhere in the app (no
// driver-specific hotline/email exists), so their expandable panel shows this one real
// sentence as plain text rather than inventing label/value rows to match Driver
// Information's shape.
const STATIC_MENU_COPY: Record<string, string> = {
  help: 'For assistance, contact the TODA Bucana Dispatch Desk or the Nasugbu BPLO.',
  about: 'Trivora is the official municipal tricycle dispatch platform of Nasugbu, Batangas.',
};

type ExpandableSection = 'info' | 'vehicle' | 'help' | 'about' | null;

export default function DriverProfileScreen({ onOpenTrackingSettings }: DriverProfileScreenProps) {
  const { driver, logout, updateProfile, refreshProfile } = useDriverAuth();
  const { isOnline, averageRating, totalCompletedRides } = useDriverShift();
  const [expanded, setExpanded] = useState<ExpandableSection>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Same reasoning as the Passenger app's Profile screen: this screen only exists in the tree
  // while its tab is selected (App.tsx's state machine unmounts it otherwise), so mounting here
  // already means "just became active". Silent, no loading flag — `driver` stays visible the
  // whole time, this just replaces it once fresh data arrives (e.g. a TMO-side license/TODA-zone
  // change). Ride stats (rating/completed rides) are already kept fresh continuously by
  // DriverShiftContext's own historyList poll, independent of this screen being open.
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSection = (section: ExpandableSection) => {
    setExpanded((prev) => (prev === section ? null : section));
  };

  const handleSaveProfile = (fields: Partial<DriverProfile>) => {
    updateProfile(fields);
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    logout();
  };

  const trackingModeLabel =
    driver?.tricycle?.activeTrackingMode === 'iot_device' ? 'Onboard IoT Tracker' : 'Smartphone GPS';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Identity header — same plain, non-filled treatment as the Passenger app's own Profile
          header: asymmetric contact-card layout (avatar beside identity, corner edit action),
          a hairline divider, then a divided stat row. No banner/card background here — just the
          page background with a bottom border, not a dark or brand-colored fill. */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <EditableAvatar
            name={driver?.name || 'Juan Dela Cruz'}
            imageUri={driver?.avatarUrl}
            size={60}
            tone="driver"
            onPhotoChanged={(url) => updateProfile({ avatarUrl: url || undefined })}
          />

          <View style={styles.identityCol}>
            <Text style={styles.driverName} numberOfLines={1}>{driver?.name || 'Juan Dela Cruz'}</Text>
            <StatusBadge
              label={isOnline ? 'Online' : 'Offline'}
              tone={isOnline ? 'success' : 'neutral'}
              size="sm"
              style={styles.statusBadge}
            />
            <View style={styles.zoneRow}>
              <MapPin size={12} color={COLORS.textMuted} />
              <Text style={styles.zoneText} numberOfLines={1}>{driver?.todaZone?.name || 'TODA Bucana'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.editIconBtn}
            onPress={() => setShowEditModal(true)}
            activeOpacity={0.8}
            accessibilityLabel="Edit profile"
          >
            <Pencil size={15} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerDivider} />

        {/* Same divided stat-row language as the Earnings hero card, so a driver's rating and
            ride count read with the same visual weight wherever they appear in the app. */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <View style={styles.statValueRow}>
              <Star size={14} color={COLORS.amber} fill={COLORS.amber} />
              <Text style={styles.statValue}>{averageRating != null ? averageRating.toFixed(2) : 'Not Rated'}</Text>
            </View>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalCompletedRides}</Text>
            <Text style={styles.statLabel}>Total Rides</Text>
          </View>
        </View>
      </View>

      {/* Driver Info */}
      <Text style={styles.groupLabel}>DRIVER INFO</Text>

      <MenuRow
        icon={User}
        label="Driver Information"
        subtitle={driver?.licenseNumber}
        expanded={expanded === 'info'}
        onPress={() => toggleSection('info')}
      />
      {expanded === 'info' && (
        <View style={styles.detailPanel}>
          <DetailRow label="Full Name" value={driver?.name || '—'} />
          <DetailRow label="License Number" value={driver?.licenseNumber || '—'} />
          <DetailRow label="Mobile Number" value={driver?.mobile || '—'} />
          <DetailRow label="Email Address" value={driver?.email || '—'} />
          <DetailRow label="TODA Zone" value={driver?.todaZone?.name || '—'} last />
        </View>
      )}

      <MenuRow
        icon={Truck}
        label="Vehicle & Franchise"
        subtitle={
          driver?.tricycle ? `${driver.tricycle.plateNumber} · ${driver.tricycle.bodyNumber}` : undefined
        }
        expanded={expanded === 'vehicle'}
        onPress={() => toggleSection('vehicle')}
      />
      {expanded === 'vehicle' && (
        <View style={styles.detailPanel}>
          <DetailRow label="Plate Number" value={driver?.tricycle?.plateNumber || '—'} />
          <DetailRow label="Body Number" value={driver?.tricycle?.bodyNumber || '—'} />
          <DetailRow label="Unit Model" value={driver?.tricycle?.model || '—'} />
          <DetailRow label="Tracking Source" value={trackingModeLabel} last />
        </View>
      )}

      <MenuRow
        icon={Radar}
        label="Tracking Settings"
        subtitle={trackingModeLabel}
        onPress={onOpenTrackingSettings}
      />

      {/* Support */}
      <Text style={styles.groupLabel}>SUPPORT</Text>

      <MenuRow
        icon={HelpCircle}
        label="Help Center"
        expanded={expanded === 'help'}
        onPress={() => toggleSection('help')}
      />
      {expanded === 'help' && (
        <View style={styles.detailPanel}>
          <Text style={styles.paragraph}>{STATIC_MENU_COPY.help}</Text>
        </View>
      )}

      <MenuRow
        icon={Info}
        label="About Trivora"
        expanded={expanded === 'about'}
        onPress={() => toggleSection('about')}
      />
      {expanded === 'about' && (
        <View style={styles.detailPanel}>
          <Text style={styles.paragraph}>{STATIC_MENU_COPY.about}</Text>
        </View>
      )}

      <Button label="Log Out" variant="danger" icon={LogOut} onPress={handleLogout} style={styles.logoutBtn} />

      <EditProfileModal
        visible={showEditModal}
        onClose={() => setShowEditModal(false)}
        driver={driver}
        onSave={handleSaveProfile}
      />

      <ConfirmModal
        visible={showLogoutConfirm}
        title="Log out?"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </ScrollView>
  );
}

interface MenuRowProps {
  icon: LucideIcon;
  label: string;
  /** A real-data preview shown even while collapsed — Help/About have no natural preview and omit it. */
  subtitle?: string;
  /** Present (true/false) for rows that expand in place; omit for rows that navigate away. */
  expanded?: boolean;
  onPress: () => void;
}

function MenuRow({ icon: Icon, label, subtitle, expanded, onPress }: MenuRowProps) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.menuIconBadge}>
        <Icon size={18} color={COLORS.textSecondary} strokeWidth={1.8} />
      </View>
      <View style={styles.menuTextCol}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? (
          <Text style={styles.menuSubtitle} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {expanded === undefined ? (
        <ChevronRight size={16} color={COLORS.textMuted} />
      ) : (
        <ChevronDown
          size={16}
          color={COLORS.textMuted}
          style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}
        />
      )}
    </TouchableOpacity>
  );
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[detailStyles.row, last && detailStyles.rowLast]}>
      <Text style={detailStyles.label}>{label}</Text>
      <Text style={detailStyles.value} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  value: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: SPACING.md,
    gap: SPACING.sm,
    paddingBottom: 40,
  },
  header: {
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  identityCol: {
    flex: 1,
    paddingTop: 2,
  },
  driverName: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  statusBadge: {
    marginTop: 6,
  },
  zoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  zoneText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  editIconBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginTop: SPACING.lg,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: COLORS.border,
  },
  groupLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginTop: SPACING.md,
    marginBottom: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  menuIconBadge: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuTextCol: {
    flex: 1,
    gap: 1,
  },
  menuLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  menuSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  detailPanel: {
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  paragraph: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 18,
    paddingVertical: SPACING.sm,
  },
  logoutBtn: {
    marginTop: SPACING.sm,
  },
});
