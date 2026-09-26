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
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { useDriverAuth } from '../context/DriverAuthContext';
import { ShieldCheck, CreditCard, Info } from 'lucide-react-native';
import AuthProgressSteps from '../components/AuthProgressSteps';
import FormField from '../components/FormField';
import Button from '../components/Button';
import { useToast } from '../components/Toast';

interface DriverFranchiseVerificationScreenProps {
  onBack: () => void;
  onVerified: () => void;
}

/**
 * Step 1 of registration — "Verify Franchise": the franchise permit number is the ONLY
 * field. No date of birth, name, or any other personal detail is asked for (the old DOB
 * entry is gone entirely, which also removes its local-Date/UTC round-trip that could show
 * a selected day as one day earlier). On success the backend returns the franchise's
 * registered people, which the next step displays for the user to select who this Driver
 * App account belongs to.
 */
export default function DriverFranchiseVerificationScreen({
  onBack,
  onVerified,
}: DriverFranchiseVerificationScreenProps) {
  const { verifyFranchiseEligibility } = useDriverAuth();
  const { showToast } = useToast();

  const [franchiseNumber, setFranchiseNumber] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    // Alert.alert is a documented no-op on react-native-web, so these use the same in-app Toast
    // the rest of the app already relies on for web-visible feedback — Alert.alert would silently
    // swallow the message, making the button look completely unresponsive.
    if (!franchiseNumber.trim()) {
      showToast('Please enter your franchise permit number.', 'info');
      return;
    }

    setVerifying(true);
    try {
      // The tricycle plate, TODA assignment, franchise number, and the registered people are
      // never collected here — they're resolved server-side from the franchise permit number
      // and shown for confirmation/selection on the next screen.
      const result = await verifyFranchiseEligibility(franchiseNumber.trim());
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

        <View style={styles.infoBox}>
          <Info size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Your franchise number will be matched against municipal MTOP records, then you'll
            choose which registered person will use this account.
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
