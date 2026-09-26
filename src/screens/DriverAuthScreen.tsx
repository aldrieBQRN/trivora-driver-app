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
import { Lock, Eye, EyeOff, Check, Phone } from 'lucide-react-native';
import { TricycleIcon } from '../components/icons';
import FormField from '../components/FormField';
import Button from '../components/Button';

interface DriverAuthScreenProps {
  onBack: () => void;
  onGoToRegister: () => void;
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
 * Login uses the driver's EXISTING registered mobile number + password — the same credential
 * the owner web portal uses; email-based login was removed from the flow entirely. */
export default function DriverAuthScreen({ onGoToRegister }: DriverAuthScreenProps) {
  const { login } = useDriverAuth();
  const { isConnected, checkConnection } = useNetwork();

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ mobile?: string; password?: string; form?: string }>({});

  // There's no password-reset endpoint in the backend, so this doesn't pretend to send a reset
  // link — it points to the same real support contact already shown on the Profile screen.
  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password?',
      'For assistance, contact the Nasugbu TMO or the Nasugbu BPLO.'
    );
  };

  const handleLogin = async () => {
    const nextErrors: typeof errors = {};
    const digits = mobile.replace(/\D/g, '');
    if (!digits) nextErrors.mobile = 'Mobile number is required.';
    // Accepts the local 09… form, the bare 9… form, and the +63…/63… forms — the backend
    // resolves every equivalent of the same stored number to the same account.
    else if (!/^(?:09\d{9}|9\d{9}|639\d{9})$/.test(digits)) {
      nextErrors.mobile = 'Enter a valid mobile number (e.g. 0917 123 4567).';
    }
    if (!password.trim()) nextErrors.password = 'Password is required.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      let res;
      try {
        res = await driverApi.login(mobile.trim(), password);
      } catch (firstErr: any) {
        if (firstErr?.status !== undefined) {
          throw firstErr;
        }
        // Brief pause and auto-retry once in case of mobile network handshake delay
        await new Promise((r) => setTimeout(r, 1500));
        res = await driverApi.login(mobile.trim(), password);
      }
      login(mapAuthResponseToDriverProfile(res), res.token);
    } catch (err: any) {
      if (err?.status !== undefined) {
        // The backend was reached and rejected the credentials
        setErrors({ form: err.message || 'Incorrect mobile number or password. Please try again.' });
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
              login({ ...DEMO_DRIVER, mobile: mobile.trim() });
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
            Amber is otherwise unused chrome here (only ever a star-rating fill elsewhere),
            reserved so this badge reads as this app's own identity accent. The Passenger app's
            own login screen carries the equivalent badge in the shared brand navy instead. */}
        <View style={styles.appBadge}>
          <TricycleIcon size={13} color={COLORS.amber} />
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
            label="Mobile Number"
            icon={Phone}
            placeholder="0917 123 4567"
            value={mobile}
            onChangeText={(v) => {
              setMobile(v);
              if (errors.mobile) setErrors((e) => ({ ...e, mobile: undefined }));
            }}
            keyboardType="phone-pad"
            error={errors.mobile}
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

            <TouchableOpacity onPress={handleForgotPassword} activeOpacity={0.7}>
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
            <Text style={styles.switchLinkText}>New driver? Register with MTOP franchise check</Text>
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
    width: 136,
    height: 136,
  },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.amberLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    marginTop: 4,
  },
  appBadgeText: {
    ...TYPOGRAPHY.label,
    color: COLORS.textPrimary,
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
});
