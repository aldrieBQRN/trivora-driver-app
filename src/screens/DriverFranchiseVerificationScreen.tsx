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
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { ShieldCheck, CreditCard, Calendar, Info } from 'lucide-react-native';
import AuthProgressSteps from '../components/AuthProgressSteps';
import FormField from '../components/FormField';
import Button from '../components/Button';
import { useToast } from '../components/Toast';

interface DriverFranchiseVerificationScreenProps {
  onBack: () => void;
  onVerified: () => void;
}

export default function DriverFranchiseVerificationScreen({
  onBack,
  onVerified,
}: DriverFranchiseVerificationScreenProps) {
  const { verifyFranchiseEligibility } = useDriverAuth();
  const { showToast } = useToast();

  const [franchiseNumber, setFranchiseNumber] = useState('');
  const [dob, setDob] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const dobLabel = dob
    ? dob.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
    : 'MM/DD/YYYY';

  const handleDateChange = (_event: unknown, selectedDate?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selectedDate) setDob(selectedDate);
  };

  const handleVerify = async () => {
    // Alert.alert is a documented no-op on react-native-web, so these use the same in-app Toast
    // the rest of the app already relies on for web-visible feedback — Alert.alert would silently
    // swallow the message, making the button look completely unresponsive.
    if (!franchiseNumber.trim() || !dob) {
      showToast('Please fill in your franchise permit number and date of birth.', 'info');
      return;
    }

    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (age < 18) {
      showToast('You must be at least 18 years old to register as a tricycle driver.', 'info');
      return;
    }

    setVerifying(true);
    try {
      const dobIso = dob.toISOString().slice(0, 10);
      // The tricycle plate, TODA assignment, and franchise number are never collected here —
      // they're resolved server-side from the franchise permit number and shown for confirmation
      // on the next screen.
      const result = await verifyFranchiseEligibility(franchiseNumber.trim(), dobIso);
      if (result.eligible) {
        onVerified();
      }
    } catch (err: any) {
      showToast(
        err?.message || 'No active MTOP municipal franchise found for this record. Visit the Nasugbu BPLO.',
        'info'
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthProgressSteps currentStep={1} />

        <Text style={styles.title}>Verify Your Franchise Eligibility</Text>
        <Text style={styles.subtitle}>
          Only accredited and franchised tricycle operators can register.
        </Text>

        <FormField
          label="Franchise Permit No."
          icon={CreditCard}
          placeholder="e.g. FS-2026-00004"
          value={franchiseNumber}
          onChangeText={setFranchiseNumber}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>Date of Birth</Text>
        {Platform.OS === 'web' ? (
          // @react-native-community/datetimepicker has no web implementation at all (it renders
          // null and just console.warns "not supported on: web") — tapping the field below did
          // nothing visible, dob could never be set, and every "Verify" tap silently hit the
          // Alert.alert('Missing Information', ...) branch, which is itself a documented no-op on
          // react-native-web, so the button appeared completely unresponsive. A real HTML date
          // input is the only thing that actually works here on web.
          <View style={styles.dobField}>
            <Calendar size={18} color={COLORS.primary} />
            <input
              type="date"
              value={dob ? dob.toISOString().slice(0, 10) : ''}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e: any) => {
                const val = e.target.value;
                setDob(val ? new Date(`${val}T00:00:00`) : null);
              }}
              style={webDateInputStyle}
            />
          </View>
        ) : (
          <TouchableOpacity style={styles.dobField} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <Calendar size={18} color={COLORS.primary} />
            <Text style={[styles.dobText, !dob && styles.dobPlaceholder]}>{dobLabel}</Text>
          </TouchableOpacity>
        )}
        {showPicker && Platform.OS !== 'web' && (
          <View>
            <DateTimePicker
              value={dob || new Date(1995, 0, 1)}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
            {/* The iOS spinner is inline and has no built-in way to dismiss itself — without
                this it stays open indefinitely once opened. */}
            {Platform.OS === 'ios' && (
              <TouchableOpacity style={styles.dobDoneBtn} onPress={() => setShowPicker(false)} activeOpacity={0.7}>
                <Text style={styles.dobDoneText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.infoBox}>
          <Info size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Your information will be verified with the MTOP and TODA records.
          </Text>
        </View>

        <Button
          label={verifying ? 'Verifying...' : 'Verify Franchise'}
          onPress={handleVerify}
          loading={verifying}
          icon={ShieldCheck}
          style={styles.submitBtn}
        />

        <TouchableOpacity style={styles.switchLink} onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.switchLinkText}>Already have an account? Login</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// A plain DOM style object (not StyleSheet.create) — this is a real HTML <input>, not an RN
// component, so it needs genuine CSS values rather than RN's StyleSheet registry.
const webDateInputStyle = {
  flex: 1,
  height: 48,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 14,
  fontWeight: 700,
  color: COLORS.textPrimary,
  fontFamily: 'inherit',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
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
  label: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginTop: SPACING.sm,
  },
  dobField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    height: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dobText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '700',
  },
  dobPlaceholder: {
    color: COLORS.textMuted,
    fontWeight: '500',
  },
  dobDoneBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dobDoneText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '800',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.primaryTint,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(27, 58, 105, 0.15)',
  },
  infoText: {
    flex: 1,
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.primary,
    fontWeight: '600',
  },
  submitBtn: {
    marginTop: SPACING.xl,
  },
});
