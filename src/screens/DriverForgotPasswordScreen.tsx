import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { ArrowLeft, Mail, Lock, Eye, EyeOff, KeyRound } from 'lucide-react-native';
import { driverApi } from '../services/api';
import FloatingIconButton from '../components/FloatingIconButton';
import FormField from '../components/FormField';
import Button from '../components/Button';

interface DriverForgotPasswordScreenProps {
  onBack: () => void;
}

type Step = 'email' | 'code' | 'password';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const RESEND_SECONDS = 60;

/** Pulls the server's message out of a failed request, or a connection fallback. */
function errorMessage(err: any): string {
  if (err?.status !== undefined) return err.message || 'Something went wrong. Please try again.';
  return 'Unable to reach Trivora. Please check your internet connection and try again.';
}

/**
 * Forgot password by emailed 6-digit code: enter email -> enter code -> choose a new password.
 * The backend checks the email is registered. Drivers added by their franchise owner only have
 * a system placeholder address, so the backend tells them to contact the TMO instead.
 */
export default function DriverForgotPasswordScreen({ onBack }: DriverForgotPasswordScreenProps) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async (isResend = false) => {
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await driverApi.forgotPassword(trimmed);
      setResendIn(RESEND_SECONDS);
      setInfo(isResend ? 'A new code has been sent to your email.' : null);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await driverApi.verifyResetCode(email.trim(), code);
      setStep('password');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (confirmPassword !== password) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await driverApi.resetPassword(email.trim(), code, password);
      setLoading(false);
      Alert.alert('Password Reset', 'Your password has been reset. You can now log in with your new password.');
      onBack();
    } catch (err) {
      setLoading(false);
      setError(errorMessage(err));
    }
  };

  const goBack = () => {
    setError(null);
    setInfo(null);
    if (step === 'password') setStep('code');
    else if (step === 'code') setStep('email');
    else onBack();
  };

  const titles: Record<Step, { title: string; subtitle: string }> = {
    email: {
      title: 'Forgot password?',
      subtitle: "Enter the email address on your Trivora account and we'll send you a 6-digit code.",
    },
    code: {
      title: 'Check your email',
      subtitle: `Enter the 6-digit code we sent to ${email.trim()}. It expires in 10 minutes.`,
    },
    password: {
      title: 'Set a new password',
      subtitle: 'Choose a new password for your account.',
    },
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <FloatingIconButton onPress={goBack} accessibilityLabel="Back" style={styles.backButton}>
          <ArrowLeft size={20} color={COLORS.textPrimary} />
        </FloatingIconButton>

        <View style={styles.iconCircle}>
          <KeyRound size={26} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>{titles[step].title}</Text>
        <Text style={styles.subtitle}>{titles[step].subtitle}</Text>

        {error && (
          <View style={styles.formErrorBox}>
            <Text style={styles.formErrorText}>{error}</Text>
          </View>
        )}
        {info && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>{info}</Text>
          </View>
        )}

        {step === 'email' && (
          <FormField
            label="Email Address"
            icon={Mail}
            placeholder="you@example.com"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (error) setError(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        )}

        {step === 'code' && (
          <FormField
            label="6-digit code"
            icon={KeyRound}
            placeholder="123456"
            value={code}
            onChangeText={(v) => {
              setCode(v.replace(/\D/g, '').slice(0, 6));
              if (error) setError(null);
            }}
            keyboardType="number-pad"
          />
        )}

        {step === 'password' && (
          <>
            <FormField
              label="New Password"
              icon={Lock}
              placeholder="At least 8 characters"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
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
              label="Confirm New Password"
              icon={Lock}
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChangeText={(v) => {
                setConfirmPassword(v);
                if (error) setError(null);
              }}
              secureTextEntry={!showPassword}
            />
          </>
        )}

        {step === 'email' && (
          <Button label="Send Code" onPress={() => sendCode()} loading={loading} style={styles.submitBtn} />
        )}
        {step === 'code' && (
          <Button label="Verify Code" onPress={verifyCode} loading={loading} style={styles.submitBtn} />
        )}
        {step === 'password' && (
          <Button label="Reset Password" onPress={resetPassword} loading={loading} style={styles.submitBtn} />
        )}

        {step === 'code' && (
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Didn't get the code? </Text>
            {resendIn > 0 ? (
              <Text style={styles.footerText}>Resend in {resendIn}s</Text>
            ) : (
              <TouchableOpacity onPress={() => sendCode(true)} disabled={loading} activeOpacity={0.7}>
                <Text style={styles.linkText}>Resend code</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
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
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: SPACING.md,
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
  infoBox: {
    backgroundColor: COLORS.successLight,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginBottom: SPACING.sm,
  },
  infoText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: SPACING.sm,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  footerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  linkText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
});
