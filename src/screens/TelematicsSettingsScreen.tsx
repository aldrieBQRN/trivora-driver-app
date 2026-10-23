import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, FONT_FAMILY } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { Cpu, Smartphone, Radio, ShieldCheck, Lock } from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';

interface TelematicsSettingsScreenProps {
  onBack: () => void;
}

// Read-only: the tracking method (phone GPS vs the installed tracker) is set by TMO at Final
// Confirmation or on Tricycle Details. Drivers can see it here but can no longer change it.
export default function TelematicsSettingsScreen({ onBack }: TelematicsSettingsScreenProps) {
  // Pushed page with the tab bar hidden: the last item must clear the phone's navigation bar.
  const insets = useSafeAreaInsets();
  const { trackingMode, iotDeviceId, currentLat, currentLng, headingDeg } = useDriverShift();
  const isIot = trackingMode === 'iot_device';

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tracking Settings" onBack={onBack} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}>
        <Text style={styles.sectionLabel}>ACTIVE TELEMETRY SOURCE</Text>

        <View style={[styles.card, !isIot && styles.cardSelected]}>
          <View style={styles.iconBox}>
            <Smartphone size={22} color={!isIot ? COLORS.primary : COLORS.textMuted} />
          </View>
          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.modeName}>Smartphone Mobile GPS</Text>
              {!isIot && <StatusBadge label="ACTIVE" tone="success" size="sm" />}
            </View>
            <Text style={styles.modeDesc}>
              Streams real-time coordinates and speed pings from your smartphone's GPS while you are Online.
            </Text>
          </View>
        </View>

        <View style={[styles.card, isIot && styles.cardSelected]}>
          <View style={styles.iconBox}>
            <Cpu size={22} color={isIot ? COLORS.primary : COLORS.textMuted} />
          </View>
          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.modeName}>Onboard IoT Tracker Hardware</Text>
              {isIot && <StatusBadge label="ACTIVE" tone="success" size="sm" />}
            </View>
            <Text style={styles.modeDesc}>
              {isIot && iotDeviceId
                ? `Tracker #${iotDeviceId} installed on your tricycle sends its position directly to the municipal portal.`
                : 'Receives telemetry directly from the municipal-certified GPS tracker installed on your tricycle unit.'}
            </Text>
          </View>
        </View>

        <View style={styles.formCard}>
          <View style={styles.lockRow}>
            <Lock size={14} color={COLORS.primary} />
            <Text style={styles.formTitle}>SET BY THE TMO OFFICE</Text>
          </View>
          <Text style={styles.formDesc}>
            Your tracking source is assigned by the Traffic Management Office. To install, replace or remove a GPS
            tracker, visit the TMO office.
          </Text>
        </View>

        {/* Diagnostics */}
        <View style={styles.diagCard}>
          <View style={styles.diagHeader}>
            <Radio size={16} color={COLORS.primary} />
            <Text style={styles.diagTitle}>LIVE TELEMETRY STREAM TO MUNICIPAL PORTAL</Text>
          </View>

          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>LATITUDE</Text>
              <Text style={styles.gridVal}>{currentLat != null ? currentLat.toFixed(6) : '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>LONGITUDE</Text>
              <Text style={styles.gridVal}>{currentLng != null ? currentLng.toFixed(6) : '—'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>HEADING</Text>
              <Text style={styles.gridVal}>{headingDeg}°</Text>
            </View>
          </View>

          <View style={styles.noticeRow}>
            <ShieldCheck size={14} color={COLORS.success} />
            <Text style={styles.noticeText}>
              Municipal Violation Engine actively monitors for color-coding compliance, speed limits, and route boundaries.
            </Text>
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
    padding: SPACING.md,
    gap: SPACING.md,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.textSecondary,
    letterSpacing: 0.6,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    gap: 12,
    alignItems: 'center',
    ...SHADOWS.sm,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  modeName: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    flexShrink: 1,
  },
  modeDesc: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  formCard: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
    ...SHADOWS.sm,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  formDesc: {
    fontFamily: FONT_FAMILY,
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  diagCard: {
    backgroundColor: COLORS.primaryTint,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(27, 58, 105, 0.15)',
  },
  diagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.sm,
  },
  diagTitle: {
    fontFamily: FONT_FAMILY,
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gridItem: {
    width: '46%',
  },
  gridLabel: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gridVal: {
    fontFamily: FONT_FAMILY,
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
  },
  noticeText: {
    fontFamily: FONT_FAMILY,
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
    lineHeight: 14,
  },
});
