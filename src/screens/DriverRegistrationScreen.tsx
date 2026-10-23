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
import { CheckCircle2, ArrowLeft, User, Calendar, Phone, MapPin, Mail } from 'lucide-react-native';
import AuthProgressSteps from '../components/AuthProgressSteps';
import FloatingIconButton from '../components/FloatingIconButton';
import Button from '../components/Button';

interface DriverRegistrationScreenProps {
  onBack: () => void;
  onNext: (info: PendingAccountInfo) => void;
  /** The selected person already has an account: go sign in, then the tricycle is added. */
  onSignIn: () => void;
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
 * Nothing personal is typed here. What happens next depends on the selected person:
 *  - already has a Trivora account → "Sign in" (the tricycle is added to that account);
 *  - no account yet → a code goes to their email ON FILE (shown masked) on the next step;
 *  - no usable email on file → they must update it at the TMO first.
 */
export default function DriverRegistrationScreen({ onBack, onNext, onSignIn, initialValues }: DriverRegistrationScreenProps) {
  const { verifiedFranchise, setPendingLink } = useDriverAuth();
  const tricycle = verifiedFranchise?.tricycle;
  // The franchise's registered people — owner (+ separate assigned driver) — read straight
  // off the record the backend just verified against. The user picks one of these.
  const people = verifiedFranchise?.people ?? [];

  const [personType, setPersonType] = useState<'owner' | 'driver' | null>(
    initialValues?.personType ?? (people.length === 1 ? people[0].type : null)
  );
  // No GPS tracking choice here: the tracking method is set by TMO at Final Confirmation.
  const [errors, setErrors] = useState<{ personType?: string }>({});

  const selectedPerson = people.find((p) => p.type === personType);
  const hasAccount = !!selectedPerson?.has_account;
  const cannotReceiveCode = !!selectedPerson && !hasAccount && !selectedPerson.can_receive_code;

  const handleSelectPerson = (type: 'owner' | 'driver') => {
    setPersonType(type);
    setErrors((e) => ({ ...e, personType: undefined }));
  };

  const handleSignIn = () => {
    if (!personType || !verifiedFranchise) return;
    setPendingLink({
      franchiseNumber: verifiedFranchise.franchise_number,
      personType,
      emailMasked: selectedPerson?.email_masked ?? null,
    });
    onSignIn();
  };

  const handleNext = () => {
    if (!personType) {
      setErrors({ personType: 'Select which registered person will use this Driver App.' });
      return;
    }
    if (hasAccount) {
      handleSignIn();
      return;
    }
    if (cannotReceiveCode) return;

    onNext({
      personType,
      emailMasked: selectedPerson?.email_masked ?? null,
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
            server-side against this same franchise. The sign-in email is entered below. */}
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

        {/* Sign-in email for the selected person — always the one on file, shown masked. */}
        {personType && (
          <View style={styles.lockedEmailBox}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.lockedEmailRow}>
              <Mail size={16} color={COLORS.primary} />
              <Text style={styles.lockedEmailText} numberOfLines={1}>
                {selectedPerson?.email_masked || 'No email on file'}
              </Text>
            </View>
            {hasAccount ? (
              <Text style={styles.personCardNote}>
                This person already has a Trivora account. Sign in with that email and password, and this
                tricycle will be added to the account.
              </Text>
            ) : cannotReceiveCode ? (
              <Text style={styles.errorText}>
                There is no email on file that can receive a code. Please visit the Municipal Tricycle
                Office (TMO) to update the email on your franchise record.
              </Text>
            ) : (
              <Text style={styles.personCardNote}>
                We'll send a 6-digit code to this email to confirm it's you. It will also be your
                sign-in email.
              </Text>
            )}
          </View>
        )}

        <Button
          label={hasAccount ? 'Sign In to Add Tricycle' : 'Next'}
          onPress={handleNext}
          disabled={cannotReceiveCode}
          style={styles.submitBtn}
        />
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
  },
  personCardNote: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  lockedEmailBox: {
    marginTop: SPACING.md,
  },
  lockedEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
  },
  lockedEmailText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flexShrink: 1,
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
});
