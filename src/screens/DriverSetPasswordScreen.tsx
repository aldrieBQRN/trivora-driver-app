import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY, FONT_FAMILY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { driverApi, mapAuthResponseToDriverProfile } from '../services/api';
import { PendingAccountInfo } from '../types';
import { Lock, Eye, EyeOff, ArrowLeft, Check, KeyRound } from 'lucide-react-native';
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

const RESEND_SECONDS = 60;

/**
 * Step 3 of registration — "Create Password", for a person with NO account yet: a 6-digit code
 * is emailed to their email on file when this page opens; the code + a new password + the Terms
 * & Privacy Policy agreement create the account. The code proves the person really receives mail
 * at the address on the franchise record — knowing the franchise number alone is never enough.
 */
export default function DriverSetPasswordScreen({ onBack, accountInfo }: DriverSetPasswordScreenProps) {
  const { verifiedFranchise, login } = useDriverAuth();
  const franchiseNumber = verifiedFranchise?.franchise_number ?? '';

  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [emailMasked, setEmailMasked] = useState<string | null>(accountInfo.emailMasked);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ code?: string; password?: string; confirmPassword?: string; terms?: string; form?: string }>({});

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    setSending(true);
    setErrors((e) => ({ ...e, form: undefined }));
    try {
      const res: any = await driverApi.sendRegistrationCode(franchiseNumber, accountInfo.personType);
      setEmailMasked(res?.email_masked ?? emailMasked);
      setCodeSent(true);
      setCode('');
      setResendIn(res?.resend_after_seconds ?? RESEND_SECONDS);
    } catch (err: any) {
      setErrors({
        form:
          err?.status !== undefined
            ? err.message || 'Could not send the code. Please try again.'
            : 'Could not reach the registration server. Please check your connection and try again.',
      });
    } finally {
      setSending(false);
    }
  };

  // The code is sent as soon as this step opens.
  useEffect(() => {
    sendCode();
  }, []);

  const handleCreateAccount = async () => {
    const nextErrors: typeof errors = {};
    if (!/^\d{6}$/.test(code)) nextErrors.code = 'Enter the 6-digit code from your email.';
    if (password.length < 8) nextErrors.password = 'Password must be at least 8 characters.';
    if (confirmPassword !== password) nextErrors.confirmPassword = 'Passwords do not match.';
    if (!agreedToTerms) {
      nextErrors.terms = 'You must agree to the Terms of Service and Privacy Policy to continue.';
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      // Only the franchise, the selected person, the emailed code and the new password — no
      // name, email, mobile, or birthday: the backend re-verifies the franchise, sends nothing
      // to an address the user typed, and builds the account from the EXISTING person record.
      const res = await driverApi.register({
        franchise_number: franchiseNumber,
        person_type: accountInfo.personType,
        code,
        password,
        confirm_password: confirmPassword,
        tracking_mode: accountInfo.trackingMode,
        iot_device_id: accountInfo.trackingMode === 'iot_device' ? accountInfo.iotDeviceId : undefined,
      });
      login(mapAuthResponseToDriverProfile(res), res.token);
    } catch (err: any) {
      if (err?.status !== undefined) {
        // The backend was reached and rejected the request (wrong/expired code, franchise
        // already registered, ...) — show its message; a wrong code goes under the code field.
        const codeError = err?.data?.errors?.code?.[0];
        setErrors(
          codeError
            ? { code: codeError }
            : { form: err.message || 'Could not create your account. Please check your details and try again.' }
        );
        return;
      }
      // The backend could not be reached — registration has no local/demo data source, so
      // the failure is reported honestly instead of signing the driver into fabricated data.
      setErrors({ form: 'Could not reach the registration server. Please check your connection and try again.' });
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
        <Text style={styles.subtitle}>
          {sending && !codeSent
            ? 'Sending a code to your email on file…'
            : codeSent
            ? `Enter the 6-digit code we sent to ${emailMasked || 'your email on file'}, then set your password.`
            : 'We need to send a code to your email on file first.'}
        </Text>

        {errors.form && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{errors.form}</Text>
          </View>
        )}

        <FormField
          label="6-digit code"
          icon={KeyRound}
          placeholder="123456"
          value={code}
          onChangeText={(v) => {
            setCode(v.replace(/\D/g, '').slice(0, 6));
            if (errors.code) setErrors((e) => ({ ...e, code: undefined }));
          }}
          keyboardType="number-pad"
          error={errors.code}
        />
        <View style={styles.resendRow}>
          <Text style={styles.resendText}>Didn't get the code? </Text>
          {resendIn > 0 ? (
            <Text style={styles.resendText}>Resend in {resendIn}s</Text>
          ) : (
            <TouchableOpacity onPress={sendCode} disabled={sending} activeOpacity={0.7}>
              <Text style={styles.resendLink}>{codeSent ? 'Resend code' : 'Send code'}</Text>
            </TouchableOpacity>
          )}
        </View>

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
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: SPACING.sm,
  },
  resendText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  resendLink: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
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
    fontFamily: FONT_FAMILY,
    color: COLORS.primary,
    fontWeight: '700',
  },
});
