import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { driverApi, mapAuthResponseToDriverProfile } from '../services/api';
import { DriverProfile, PendingAccountInfo } from '../types';
import { Lock, Eye, EyeOff, ArrowLeft, Check } from 'lucide-react-native';
import AuthProgressSteps from '../components/AuthProgressSteps';
import FloatingIconButton from '../components/FloatingIconButton';
import FormField from '../components/FormField';
import Button from '../components/Button';
import LegalDocumentModal from '../components/LegalDocumentModal';
import { LEGAL_LAST_UPDATED, TERMS_OF_SERVICE_SECTIONS, PRIVACY_POLICY_SECTIONS } from '../constants/legalDocuments';

interface DriverSetPasswordScreenProps {
  onBack: () => void;
  accountInfo: PendingAccountInfo;
}

/**
 * Step 3 of registration — "Create Password": the final step, kept separate from the Account
 * Info step so password creation and the Terms & Privacy Policy agreement get their own focused
 * page rather than being bundled onto an already-busy form.
 */
export default function DriverSetPasswordScreen({ onBack, accountInfo }: DriverSetPasswordScreenProps) {
  const { verifiedFranchise, login } = useDriverAuth();
  const operator = verifiedFranchise?.operator;
  const tricycle = verifiedFranchise?.tricycle;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; terms?: string; form?: string }>({});

  const handleCreateAccount = async () => {
    const nextErrors: typeof errors = {};
    if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match.';
    if (!agreedToTerms) {
      nextErrors.terms = 'You must agree to the Terms of Service and Privacy Policy to continue.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    const newDriver: DriverProfile = {
      id: operator?.id || Date.now(),
      name: operator?.full_name || 'Juan Dela Cruz',
      email: accountInfo.email,
      mobile: accountInfo.mobile,
      licenseNumber: operator?.license_number || '',
      todaZone: {
        id: 1,
        code: 'TODA-BUCANA',
        name: tricycle?.toda_zone || operator?.toda_zone || 'TODA Bucana',
        terminal: 'Bucana Terminal',
        badgeColor: COLORS.primary,
        centerLat: 14.0638,
        centerLng: 120.6289,
        coverageKm: 3.0,
        baseFare: 20.0,
        perKmRate: 10.0,
      },
      tricycle: {
        id: tricycle?.id || 1,
        plateNumber: tricycle?.plate_number || 'ABC 1234',
        bodyNumber: tricycle?.body_number || '04-128',
        model: tricycle?.make_model || 'Kawasaki Barako II (Blue)',
        iotDeviceId: accountInfo.trackingMode === 'iot_device' ? accountInfo.iotDeviceId : undefined,
        activeTrackingMode: accountInfo.trackingMode,
      },
      rating: 4.92,
      totalTrips: 128,
      todayEarnings: 540.0,
    };

    try {
      const res = await driverApi.register({
        name: newDriver.name,
        email: newDriver.email,
        mobile_number: newDriver.mobile,
        password,
        franchise_number: verifiedFranchise?.franchise_number,
        date_of_birth: verifiedFranchise?.date_of_birth,
        verification_token: verifiedFranchise?.verification_token,
        tracking_mode: accountInfo.trackingMode,
        iot_device_id: accountInfo.trackingMode === 'iot_device' ? accountInfo.iotDeviceId : undefined,
      });
      login(res.driver ? mapAuthResponseToDriverProfile(res, newDriver.email) : newDriver, res.token);
    } catch (err: any) {
      if (err?.status !== undefined) {
        // The backend was reached and rejected the request outright (e.g. email already taken,
        // invalid verification token) — a real failure, not a connectivity issue.
        setErrors({ form: err.message || 'Could not create your account. Please check your details and try again.' });
        return;
      }
      // Backend unreachable — fall back to local demo data so the flow stays testable offline.
      login(newDriver);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FloatingIconButton onPress={onBack} accessibilityLabel="Back" style={styles.backButton}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </FloatingIconButton>

        <AuthProgressSteps currentStep={3} />

        <Text style={styles.title}>Create Your Password</Text>
        <Text style={styles.subtitle}>Almost done — secure your account with a password.</Text>

        {errors.form && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{errors.form}</Text>
          </View>
        )}

        <FormField
          label="Password"
          icon={Lock}
          placeholder="At least 8 characters"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
          }}
          secureTextEntry={!showPassword}
          error={errors.password}
          rightElement={
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} activeOpacity={0.7}>
              {showPassword ? (
                <EyeOff size={18} color={COLORS.textSecondary} />
              ) : (
                <Eye size={18} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          }
        />

        <FormField
          label="Confirm Password"
          icon={Lock}
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChangeText={(v) => {
            setConfirmPassword(v);
            if (errors.confirmPassword) setErrors((e) => ({ ...e, confirmPassword: undefined }));
          }}
          secureTextEntry={!showConfirmPassword}
          error={errors.confirmPassword}
          rightElement={
            <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)} activeOpacity={0.7}>
              {showConfirmPassword ? (
                <EyeOff size={18} color={COLORS.textSecondary} />
              ) : (
                <Eye size={18} color={COLORS.textSecondary} />
              )}
            </TouchableOpacity>
          }
        />

        <View style={styles.termsRow}>
          <TouchableOpacity
            style={styles.checkboxTouchable}
            onPress={() => {
              setAgreedToTerms((v) => !v);
              if (errors.terms) setErrors((e) => ({ ...e, terms: undefined }));
            }}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
              {agreedToTerms && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
            </View>
          </TouchableOpacity>
          <Text style={styles.termsLabel}>
            I agree to the{' '}
            <Text style={styles.termsLink} onPress={() => setLegalModal('terms')}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.termsLink} onPress={() => setLegalModal('privacy')}>
              Privacy Policy
            </Text>
          </Text>
        </View>
        {errors.terms ? <Text style={styles.errorText}>{errors.terms}</Text> : null}

        <Button
          label="Create Account"
          onPress={handleCreateAccount}
          loading={loading}
          style={styles.submitBtn}
        />
      </ScrollView>

      <LegalDocumentModal
        visible={legalModal === 'terms'}
        onClose={() => setLegalModal(null)}
        title="Terms of Service"
        updatedLabel={LEGAL_LAST_UPDATED}
        sections={TERMS_OF_SERVICE_SECTIONS}
      />
      <LegalDocumentModal
        visible={legalModal === 'privacy'}
        onClose={() => setLegalModal(null)}
        title="Privacy Policy"
        updatedLabel={LEGAL_LAST_UPDATED}
        sections={PRIVACY_POLICY_SECTIONS}
      />
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
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: SPACING.lg,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: SPACING.lg,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    marginTop: 4,
  },
  formErrorBox: {
    backgroundColor: COLORS.dangerLight,
    borderWidth: 1,
    borderColor: COLORS.dangerBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.sm,
  },
  formErrorText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.dangerDark,
    fontWeight: '700',
  },
  submitBtn: {
    marginTop: SPACING.xl,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: SPACING.lg,
  },
  checkboxTouchable: {
    padding: 4,
    margin: -4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.xs,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  termsLabel: {
    flex: 1,
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
