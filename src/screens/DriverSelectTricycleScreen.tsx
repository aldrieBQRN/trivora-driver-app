import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { driverApi, mapAuthResponseToDriverProfile } from '../services/api';
import { TricycleIcon } from '../components/icons';
import FloatingIconButton from '../components/FloatingIconButton';
import Button from '../components/Button';

interface DriverSelectTricycleScreenProps {
  /** Called once the chosen tricycle is saved (or kept). */
  onDone: () => void;
  /** Shown when opened from Home ("Change tricycle"); right after login there is no back. */
  onBack?: () => void;
}

/**
 * "Which tricycle are you driving today?" — for an account with 2+ tricycles. Shown right after
 * login (Login → Select → Home) and from Home's "Change tricycle" while Offline. The backend
 * refuses a change while Online or during a ride, since bookings, GPS, QR rides and earnings all
 * attach to the selected tricycle.
 */
export default function DriverSelectTricycleScreen({ onDone, onBack }: DriverSelectTricycleScreenProps) {
  const { driver, updateProfile } = useDriverAuth();
  const insets = useSafeAreaInsets();
  const tricycles = driver?.tricycles ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(
    tricycles.find((t) => t.is_current)?.id ?? driver?.tricycle?.id ?? tricycles[0]?.id ?? null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (selectedId == null) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await driverApi.selectTricycle(selectedId);
      updateProfile(mapAuthResponseToDriverProfile(res, driver?.email));
      onDone();
    } catch (err: any) {
      setError(
        err?.status !== undefined
          ? err.message || 'Could not select this tricycle. Please try again.'
          : 'Could not reach the server. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.lg }]}
    >
      {onBack && (
        <FloatingIconButton onPress={onBack} accessibilityLabel="Back" style={styles.backButton}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </FloatingIconButton>
      )}

      <Text style={styles.title}>Which tricycle are you driving today?</Text>
      <Text style={styles.subtitle}>
        Rides, GPS tracking and earnings will be recorded under the tricycle you choose. You can change it
        later from Home while Offline.
      </Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {tricycles.map((t) => {
        const isSelected = selectedId === t.id;
        const restricted = !t.can_operate;
        return (
          <TouchableOpacity
            key={t.id}
            style={[styles.card, isSelected && styles.cardSelected]}
            onPress={() => setSelectedId(t.id)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={[styles.radio, isSelected && styles.radioActive]}>
              {isSelected && <View style={styles.radioDot} />}
            </View>
            <View style={styles.iconCircle}>
              <TricycleIcon size={20} color={COLORS.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.plate}>{t.plate_number}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[t.make_model, t.sticker_number ? `Sticker ${t.sticker_number}` : null].filter(Boolean).join(' · ')}
              </Text>
              {t.franchise_number ? <Text style={styles.meta}>Franchise {t.franchise_number}</Text> : null}
              {restricted && (
                <Text style={styles.restricted}>
                  Franchise {t.franchise_status === 'revoked' ? 'revoked' : 'suspended'} · can't go online
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}

      <Button label="Continue" onPress={handleContinue} loading={loading} disabled={selectedId == null} style={styles.submitBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
  },
  backButton: {
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
  },
  errorBox: {
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.sm,
  },
  errorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.dangerDark,
    fontWeight: '700',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 4,
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginBottom: SPACING.sm + 2,
  },
  cardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  plate: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  meta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  restricted: {
    ...TYPOGRAPHY.caption,
    color: COLORS.dangerDark,
    fontWeight: '700',
    marginTop: 4,
  },
  submitBtn: {
    marginTop: SPACING.lg,
  },
});
