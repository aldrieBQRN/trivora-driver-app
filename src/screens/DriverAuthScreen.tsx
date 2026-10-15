import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { useNetwork } from '../context/NetworkContext';
import { driverApi, mapAuthResponseToDriverProfile, getApiBaseUrl } from '../services/api';
import { DriverProfile } from '../types';
import { Lock, Eye, EyeOff, Check, Mail } from 'lucide-react-native';
import { TricycleIcon } from '../components/icons';
import FormField from '../components/FormField';
import Button from '../components/Button';

interface DriverAuthScreenProps {
  onBack: () => void;
  onGoToRegister: () => void;
  onForgotPassword: () => void;
}

const DEMO_DRIVER: DriverProfile = {
  id: 1,
  name: 'Juan Dela Cruz',
  email: 'juan@example.com',
  mobile: '+63 917 555 0192',
  licenseNumber: 'D01-12-345678',
  todaZone: {
    id: 1,
    code: 'GENERAL',
    name: 'General Service',
    terminal: 'Nasugbu',
    badgeColor: COLORS.primary,
    centerLat: 14.0638,
    centerLng: 120.6289,
    coverageKm: 3.0,
    baseFare: 20.0,
    perKmRate: 5.0,
  },
  tricycle: {
    id: 1,
    plateNumber: 'ABC 1234',
    codingNumber: '04-128',
    model: 'Kawasaki Barako II (Blue)',
    activeTrackingMode: 'mobile_app',
  },
  rating: 4.92,
  totalTrips: 128,
  todayEarnings: 540.0,
};

/** Driver sign-in screen — reached via the splash's "Login with Account" button (not pictured in the 12-screen mockup).
 * Login is email-only: the account email + password — the same credential the web portal
 * uses. The email is the one entered when the Driver App account was registered. */
export default function DriverAuthScreen({ onGoToRegister, onForgotPassword }: DriverAuthScreenProps) {
  const { login } = useDriverAuth();
  const { isConnected, checkConnection } = useNetwork();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const handleLogin = async () => {
    const nextErrors: typeof errors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) nextErrors.email = 'Email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Enter a valid email address (e.g. name@example.com).';
    }
    if (!password.trim()) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      let res;
      try {
        res = await driverApi.login(trimmedEmail, password);
      } catch (firstErr: any) {
        if (firstErr?.status !== undefined) {
          throw firstErr;
        }
        // Brief pause and auto-retry once in case of mobile network handshake delay
        await new Promise((r) => setTimeout(r, 1500));
        res = await driverApi.login(trimmedEmail, password);
      }
      login(mapAuthResponseToDriverProfile(res), res.token);
    } catch (err: any) {
      if (err?.status !== undefined) {
        // The backend was reached and rejected the credentials
        setErrors({ form: err.message || 'Incorrect email or password. Please try again.' });
        return;
      }
      // Backend unreachable or offline — alert user with retry or demo mode option
      Alert.alert(
        'Cloud Server Unreachable',
        `Unable to connect to the Trivora cloud backend.\n\nDetails: ${err?.message || 'Network Timeout'}\nServer: ${getApiBaseUrl()}\n\nPlease verify your phone has an active internet connection and tap Retry.`,
        [
          { text: 'Retry', onPress: () => handleLogin() },
          {
            text: 'Continue in Demo Mode',
            onPress: () => {
              login({ ...DEMO_DRIVER, email: trimmedEmail });
            },
          },
        ]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Image
          source={require('../../assets/branding/trivora-logo-transparent.png')}
          style={styles.brandLogo}
          resizeMode="contain"
        />

        {/* Identifies this as the Driver app at a glance — both Trivora apps share the same
            logo/layout, so without this the two login screens are visually indistinguishable.
            Styled in the shared brand navy to match the Passenger app's badge. */}
        <View style={styles.appBadge}>
          <TricycleIcon size={13} color={COLORS.primary} />
          <Text style={styles.appBadgeText}>DRIVER APP</Text>
        </View>

        <Text style={styles.title}>Welcome back, Driver!</Text>
        <Text style={styles.subtitle}>Log in to continue your shift.</Text>

        <View style={styles.form}>
          {errors.form && (
            <View style={styles.formErrorBox}>
              <Text style={styles.formErrorText}>{errors.form}</Text>
            </View>
          )}

          <FormField
            label="Email Address"
            icon={Mail}
            placeholder="e.g. juan@example.com"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            error={errors.email}
          />

          <FormField
            label="Password"
            icon={Lock}
            placeholder="Enter your password"
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

          <View style={styles.optionsRow}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setRememberMe((v) => !v)}
              activeOpacity={0.7}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
              </View>
              <Text style={styles.checkboxLabel}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onForgotPassword} activeOpacity={0.7}>
              <Text style={styles.forgotLinkText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <Button
            label="Log In"
            onPress={handleLogin}
            loading={loading}
            style={styles.submitBtn}
          />

          <TouchableOpacity style={styles.switchLink} onPress={onGoToRegister} activeOpacity={0.7}>
            <Text style={styles.switchLinkText}>
              <Text style={styles.switchLinkPrefix}>New driver? </Text>
              Register with MTOP franchise check
            </Text>
          </TouchableOpacity>
        </View>
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
    flexGrow: 1,
    padding: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLogo: {
    width: 180,
    height: 180,
  },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryTint,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 4,
  },
  appBadgeText: {
    ...TYPOGRAPHY.label,
    color: COLORS.primary,
  },
  title: {
    ...TYPOGRAPHY.h1,
    color: COLORS.textPrimary,
    marginTop: SPACING.sm,
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: SPACING.md,
  },
  form: {
    width: '100%',
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
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
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
  checkboxLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  forgotLinkText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '700',
  },
  submitBtn: {
    marginTop: SPACING.sm,
  },
  switchLink: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingVertical: 6,
  },
  switchLinkText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  switchLinkPrefix: {
    color: COLORS.textSecondary,
    fontWeight: '400',
  },
});
