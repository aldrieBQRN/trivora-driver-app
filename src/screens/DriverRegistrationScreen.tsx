import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { PendingAccountInfo } from '../types';
import { CheckCircle2, ArrowLeft, Cpu, User, Calendar, Phone, MapPin } from 'lucide-react-native';
import AuthProgressSteps from '../components/AuthProgressSteps';
import FloatingIconButton from '../components/FloatingIconButton';
import FormField from '../components/FormField';
import Button from '../components/Button';

interface DriverRegistrationScreenProps {
  onBack: () => void;
  onNext: (info: PendingAccountInfo) => void;
  /** Repopulates the form when returning from the Create Password step via Back, so nothing
   * already entered here is lost. */
  initialValues?: PendingAccountInfo | null;
}

/**
 * Step 2 of registration — "Select Person": shows the people registered to the verified
 * franchise (the Tricycle Owner always, plus the separate assigned Tricycle Driver when
 * one exists) as selectable cards — Full Name, Birthday, Mobile Number, Barangay, all
 * READ-ONLY from the franchise/application record — and the user must pick which of them
 * will use this Driver App account. The chosen person is re-validated server-side at
 * registration, so the account can only ever belong to an actual owner/driver of this
 * franchise. Also shows the verified franchise/unit and the GPS tracking method choice.
 * No email, name, mobile number, or birthday is ever collected here: those details belong
 * to the existing person records and are confirmed, never re-entered.
 * Password creation and the Terms & Privacy Policy agreement live on their own separate step
 * (DriverSetPasswordScreen).
 */
export default function DriverRegistrationScreen({ onBack, onNext, initialValues }: DriverRegistrationScreenProps) {
  const { verifiedFranchise } = useDriverAuth();
  const tricycle = verifiedFranchise?.tricycle;
  // The franchise's registered people — owner (+ separate assigned driver) — read straight
  // off the record the backend just verified against. The user picks one of these.
  const people = verifiedFranchise?.people ?? [];

  const [personType, setPersonType] = useState<'owner' | 'driver' | null>(
    initialValues?.personType ?? (people.length === 1 ? people[0].type : null)
  );
  const [trackingMode, setTrackingMode] = useState<'mobile_app' | 'iot_device'>(
    initialValues?.trackingMode ?? 'mobile_app'
  );
  const [iotDeviceId, setIotDeviceId] = useState(initialValues?.iotDeviceId ?? '');
  const [errors, setErrors] = useState<{ personType?: string; iotDeviceId?: string }>({});

  // Switching back to Mobile clears any typed device id so a stray value from a prior IoT
  // selection can never linger in state and get accidentally submitted.
  const handleSelectTrackingMode = (mode: 'mobile_app' | 'iot_device') => {
    setTrackingMode(mode);
    if (mode === 'mobile_app') {
      setIotDeviceId('');
      if (errors.iotDeviceId) setErrors((e) => ({ ...e, iotDeviceId: undefined }));
    }
  };

  const handleSelectPerson = (type: 'owner' | 'driver') => {
    setPersonType(type);
    if (errors.personType) setErrors((e) => ({ ...e, personType: undefined }));
  };

  const handleNext = () => {
    if (!personType) {
      setErrors({ personType: 'Select which registered person will use this Driver App.' });
      return;
    }

    const nextErrors: typeof errors = {};
    if (trackingMode === 'iot_device' && !iotDeviceId.trim()) {
      nextErrors.iotDeviceId = 'Enter the IoT hardware device ID.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onNext({
      personType,
      trackingMode,
      iotDeviceId: trackingMode === 'iot_device' ? iotDeviceId.trim() : undefined,
    });
  };

  const detailRows = (person: (typeof people)[number]) => [
    { label: 'Full Name', icon: User, value: person.full_name },
    // Exact server-formatted strings — never re-parsed through a local Date/UTC conversion,
    // so the recorded day always displays as recorded.
    { label: 'Birthday', icon: Calendar, value: person.birthday || person.date_of_birth },
    { label: 'Mobile Number', icon: Phone, value: person.mobile_number },
    { label: 'Barangay', icon: MapPin, value: person.barangay },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FloatingIconButton onPress={onBack} accessibilityLabel="Back" style={styles.backButton}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </FloatingIconButton>

        <AuthProgressSteps currentStep={2} />

        {/* Franchise Verified Card */}
        <View style={styles.verifiedCard}>
          <View style={styles.verifiedIconCircle}>
            <CheckCircle2 size={28} color="#FFFFFF" />
          </View>
          <Text style={styles.verifiedTitle}>Franchise Verified!</Text>
          <Text style={styles.verifiedSub}>
            {verifiedFranchise?.owner_is_driver
              ? 'You are the registered owner and driver of this unit.'
              : 'A separate tricycle driver is assigned to this unit.'}
          </Text>

          <View style={styles.verifiedDetailsBox}>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Franchise Permit No.</Text>
              <Text style={styles.verifiedValue}>{verifiedFranchise?.franchise_number || '—'}</Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Status</Text>
              {/* The registry's own status field (active/suspended) straight off the API
                  response — the same tricycle.status the TMO Active Tricycle Registry shows. */}
              <Text style={styles.verifiedValue}>
                {tricycle?.status
                  ? tricycle.status.charAt(0).toUpperCase() + tricycle.status.slice(1)
                  : '—'}
              </Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Plate / Sticker Number</Text>
              <Text style={styles.verifiedValue}>
                {tricycle ? `${tricycle.plate_number} / ${tricycle.coding_scheme_number || tricycle.body_number}` : '—'}
              </Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Unit</Text>
              <Text style={styles.verifiedValue}>{tricycle?.make_model || '—'}</Text>
            </View>
          </View>
        </View>

        {/* The franchise's registered people — READ-ONLY existing records offered as choices.
            The user picks which of them this Driver App account belongs to; no detail is ever
            typed, edited, or invented here, and registration re-validates the choice
            server-side against this same franchise. Deliberately without email addresses. */}
        <Text style={styles.sectionTitle}>Who will use this Driver App?</Text>
        <Text style={styles.sectionSubtitle}>
          Choose one of the people registered to this franchise.
        </Text>
        {people.map((registeredPerson) => {
          const isSelected = personType === registeredPerson.type;
          return (
            <TouchableOpacity
              key={registeredPerson.type}
              style={[styles.personCard, isSelected && styles.personCardSelected]}
              onPress={() => handleSelectPerson(registeredPerson.type)}
              activeOpacity={0.8}
            >
              <View style={styles.personCardHeader}>
                <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
                <Text style={styles.personRole}>{registeredPerson.role}</Text>
              </View>
              {detailRows(registeredPerson).map((row, index, rows) => {
                const RowIcon = row.icon;
                return (
                  <View
                    key={row.label}
                    style={[styles.personRow, index < rows.length - 1 && styles.personRowDivider]}
                  >
                    <View style={styles.personRowLabel}>
                      <RowIcon size={15} color={COLORS.primary} />
                      <Text style={styles.personRowLabelText}>{row.label}</Text>
                    </View>
                    <Text style={styles.personRowValue} numberOfLines={2}>
                      {row.value || '—'}
                    </Text>
                  </View>
                );
              })}
            </TouchableOpacity>
          );
        })}
        {errors.personType && <Text style={styles.errorText}>{errors.personType}</Text>}
        <Text style={styles.personCardNote}>
          These details come from your existing franchise record and cannot be edited here.
        </Text>

        <Text style={styles.label}>GPS Telematics Tracking Method</Text>
        <View style={styles.trackingOptionsRow}>
          <TouchableOpacity
            style={[styles.trackingOption, trackingMode === 'mobile_app' && styles.trackingOptionActive]}
            onPress={() => handleSelectTrackingMode('mobile_app')}
            activeOpacity={0.8}
          >
            <View style={[styles.radioCircle, trackingMode === 'mobile_app' && styles.radioCircleActive]}>
              {trackingMode === 'mobile_app' && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.trackingOptionText}>Mobile</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.trackingOption, trackingMode === 'iot_device' && styles.trackingOptionActive]}
            onPress={() => handleSelectTrackingMode('iot_device')}
            activeOpacity={0.8}
          >
            <View style={[styles.radioCircle, trackingMode === 'iot_device' && styles.radioCircleActive]}>
              {trackingMode === 'iot_device' && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.trackingOptionText}>IoT Hardware</Text>
          </TouchableOpacity>
        </View>

        {trackingMode === 'iot_device' && (
          <FormField
            label="IoT Hardware Device ID"
            icon={Cpu}
            placeholder="e.g. TRV-GPS-1234"
            value={iotDeviceId}
            onChangeText={(v) => {
              setIotDeviceId(v);
              if (errors.iotDeviceId) setErrors((e) => ({ ...e, iotDeviceId: undefined }));
            }}
            autoCapitalize="characters"
            error={errors.iotDeviceId}
          />
        )}

        <Button label="Next" onPress={handleNext} style={styles.submitBtn} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  backButton: {
    marginBottom: SPACING.md,
  },
  verifiedCard: {
    alignItems: 'center',
    backgroundColor: COLORS.successLight,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  verifiedIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...SHADOWS.sm,
  },
  verifiedTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.success,
  },
  verifiedSub: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  verifiedDetailsBox: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    gap: 6,
  },
  verifiedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  verifiedLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  verifiedValue: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
    marginBottom: SPACING.sm,
  },
  sectionSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
  },
  personCard: {
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    marginBottom: 10,
  },
  personCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  personCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    marginBottom: 2,
  },
  personRole: {
    ...TYPOGRAPHY.body,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    marginTop: 2,
    marginBottom: 6,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
  },
  personRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  personRowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  personRowLabelText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  personRowValue: {
    ...TYPOGRAPHY.bodySmall,
    fontWeight: '800',
    color: COLORS.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  personCardNote: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  submitBtn: {
    marginTop: SPACING.xl,
  },
  trackingOptionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  trackingOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surfaceInput,
  },
  trackingOptionActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: COLORS.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  trackingOptionText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
});
