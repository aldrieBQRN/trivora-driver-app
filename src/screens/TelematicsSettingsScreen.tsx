import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';
import { useDriverShift } from '../context/DriverShiftContext';
import { Cpu, Smartphone, Radio, ShieldCheck, Check } from 'lucide-react-native';
import ScreenHeader from '../components/ScreenHeader';
import StatusBadge from '../components/StatusBadge';
import Button from '../components/Button';

interface TelematicsSettingsScreenProps {
  onBack: () => void;
}

export default function TelematicsSettingsScreen({ onBack }: TelematicsSettingsScreenProps) {
  const {
    trackingMode,
    iotDeviceId,
    updateTrackingMode,
    currentLat,
    currentLng,
    headingDeg,
  } = useDriverShift();

  // Selecting a card only stages a choice — it no longer saves instantly. The card's border
  // reflects this pending selection; the "ACTIVE" badge stays on whichever source is actually
  // saved (trackingMode) until Save is pressed, so the two states can't be confused.
  const [selectedMode, setSelectedMode] = useState<'mobile_app' | 'iot_device'>(trackingMode);
  const [inputIotId, setInputIotId] = useState<string>(iotDeviceId);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    };
  }, []);

  const hasChanges =
    selectedMode !== trackingMode || (selectedMode === 'iot_device' && inputIotId.trim() !== iotDeviceId);

  const handleSave = () => {
    updateTrackingMode(selectedMode, inputIotId.trim());
    setJustSaved(true);
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current);
    savedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tracking Settings" onBack={onBack} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>SELECT ACTIVE TELEMETRY SOURCE</Text>

        {/* Mode 1: Mobile Phone GPS — tapping only stages the choice; it no longer saves. */}
        <TouchableOpacity
          style={[styles.card, selectedMode === 'mobile_app' && styles.cardSelected]}
          onPress={() => setSelectedMode('mobile_app')}
          activeOpacity={0.8}
        >
          <View style={styles.iconBox}>
            <Smartphone size={22} color={selectedMode === 'mobile_app' ? COLORS.primary : COLORS.textMuted} />
          </View>
          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.modeName}>Smartphone Mobile GPS</Text>
              {trackingMode === 'mobile_app' && <StatusBadge label="ACTIVE" tone="success" size="sm" />}
            </View>
            <Text style={styles.modeDesc}>
              Streams real-time coordinates and speed pings from your smartphone's background GPS receiver.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Mode 2: IoT Tracker Hardware */}
        <TouchableOpacity
          style={[styles.card, selectedMode === 'iot_device' && styles.cardSelected]}
          onPress={() => setSelectedMode('iot_device')}
          activeOpacity={0.8}
        >
          <View style={styles.iconBox}>
            <Cpu size={22} color={selectedMode === 'iot_device' ? COLORS.primary : COLORS.textMuted} />
          </View>
          <View style={styles.infoCol}>
            <View style={styles.titleRow}>
              <Text style={styles.modeName}>Onboard IoT Tracker Hardware</Text>
              {trackingMode === 'iot_device' && <StatusBadge label="ACTIVE" tone="success" size="sm" />}
            </View>
            <Text style={styles.modeDesc}>
              Receives telemetry directly from the municipal-certified GPS tracker installed on your tricycle unit.
            </Text>
          </View>
        </TouchableOpacity>

        {/* IoT Serial Form — only relevant once IoT hardware is the staged selection */}
        {selectedMode === 'iot_device' && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>IOT TRACKER SERIAL ID</Text>
            <Text style={styles.formDesc}>
              Enter the device ID etched on your tricycle's onboard GPS unit:
            </Text>

            <TextInput
              style={styles.input}
              value={inputIotId}
              onChangeText={setInputIotId}
              placeholder="e.g. TRV-IOT-0842"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
        )}

        {/* One explicit save action for whichever source is staged above — replaces the old
            instant-save-on-tap and the mismatched "Save IoT Configuration" button that could
            save the wrong mode. */}
        <Button
          label={justSaved ? 'Saved' : 'Save Tracking Source'}
          icon={justSaved ? Check : undefined}
          onPress={handleSave}
          disabled={!hasChanges && !justSaved}
        />
        {justSaved && (
          <Text style={styles.savedHint}>
            {selectedMode === 'iot_device'
              ? `Tricycle telemetry connected to IoT Hardware Tracker (${inputIotId.trim()}).`
              : 'Tricycle telemetry is now powered by Smartphone GPS.'}
          </Text>
        )}

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
  savedHint: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.success,
    textAlign: 'center',
  },
  sectionLabel: {
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
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary,
    flexShrink: 1,
  },
  modeDesc: {
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
  formTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  formDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  input: {
    backgroundColor: COLORS.surfaceInput,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    fontSize: 13,
    color: COLORS.textPrimary,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: COLORS.border,
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
    color: COLORS.textSecondary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  gridVal: {
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
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
    lineHeight: 14,
  },
});
