import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { PendingAccountInfo } from '../types';
import { CheckCircle2, Mail, ArrowLeft, Cpu } from 'lucide-react-native';
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
 * Step 2 of registration — "Account Info": confirms the verified franchise/vehicle, then collects
 * the driver's email, mobile number, and GPS tracking method. Password creation and the Terms &
 * Privacy Policy agreement live on their own separate step (DriverSetPasswordScreen) so this step
 * stays focused on account/vehicle info only.
 */
export default function DriverRegistrationScreen({ onBack, onNext, initialValues }: DriverRegistrationScreenProps) {
  const { verifiedFranchise } = useDriverAuth();
  const operator = verifiedFranchise?.operator;
  const tricycle = verifiedFranchise?.tricycle;

  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [mobile, setMobile] = useState(initialValues?.mobile ?? '');
  const [trackingMode, setTrackingMode] = useState<'mobile_app' | 'iot_device'>(
    initialValues?.trackingMode ?? 'mobile_app'
  );
  const [iotDeviceId, setIotDeviceId] = useState(initialValues?.iotDeviceId ?? '');
  const [errors, setErrors] = useState<{ email?: string; mobile?: string; iotDeviceId?: string }>({});

  // Switching back to Mobile clears any typed device id so a stray value from a prior IoT
  // selection can never linger in state and get accidentally submitted.
  const handleSelectTrackingMode = (mode: 'mobile_app' | 'iot_device') => {
    setTrackingMode(mode);
    if (mode === 'mobile_app') {
      setIotDeviceId('');
      if (errors.iotDeviceId) setErrors((e) => ({ ...e, iotDeviceId: undefined }));
    }
  };

  const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
  const MOBILE_DIGITS_PATTERN = /^9\d{9}$/;

  const handleNext = () => {
    const nextErrors: typeof errors = {};
    const mobileDigits = mobile.replace(/\D/g, '');
    if (!email.trim()) nextErrors.email = 'Email address is required.';
    else if (!EMAIL_PATTERN.test(email.trim())) nextErrors.email = 'Enter a valid email address.';
    if (!MOBILE_DIGITS_PATTERN.test(mobileDigits)) {
      nextErrors.mobile = 'Enter a valid 10-digit mobile number (e.g. 912 345 6789).';
    }
    if (trackingMode === 'iot_device' && !iotDeviceId.trim()) {
      nextErrors.iotDeviceId = 'Enter the IoT hardware device ID.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onNext({
      email: email.trim(),
      mobile: `+63 ${mobile.trim()}`,
      trackingMode,
      iotDeviceId: trackingMode === 'iot_device' ? iotDeviceId.trim() : undefined,
    });
  };

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
          <Text style={styles.verifiedSub}>You are an approved Tricycle Operator.</Text>

          <View style={styles.verifiedDetailsBox}>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Name</Text>
              <Text style={styles.verifiedValue}>{operator?.full_name || 'Juan Dela Cruz'}</Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>TODA Zone</Text>
              <Text style={styles.verifiedValue}>{operator?.toda_zone || 'TODA Bucana'}</Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Franchise Permit No.</Text>
              <Text style={styles.verifiedValue}>{verifiedFranchise?.franchise_number || 'MTOP-2024-0089'}</Text>
            </View>
            <View style={styles.verifiedRow}>
              <Text style={styles.verifiedLabel}>Plate / Body No.</Text>
              <Text style={styles.verifiedValue}>{tricycle?.plate_number || 'ABC 1234'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Account Info</Text>

        <FormField
          label="Email Address"
          icon={Mail}
          placeholder="juan@example.com"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
        />

        <Text style={styles.label}>Mobile Number</Text>
        <View style={[styles.inputBox, errors.mobile && styles.inputBoxError]}>
          <Text style={styles.prefixText}>+63</Text>
          <View style={styles.prefixDivider} />
          <TextInput
            style={styles.input}
            placeholder="912 345 6789"
            placeholderTextColor={COLORS.textMuted}
            value={mobile}
            onChangeText={(v) => {
              setMobile(v);
              if (errors.mobile) setErrors((e) => ({ ...e, mobile: undefined }));
            }}
            keyboardType="phone-pad"
          />
        </View>
        {errors.mobile ? <Text style={styles.errorText}>{errors.mobile}</Text> : null}

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
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 50,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inputBoxError: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerLight,
  },
  errorText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.danger,
    marginTop: 4,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  prefixText: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  prefixDivider: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.border,
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
