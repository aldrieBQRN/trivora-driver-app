import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check } from 'lucide-react-native';
import { COLORS, TYPOGRAPHY } from '../constants/theme';

interface AuthProgressStepsProps {
  currentStep: 1 | 2 | 3;
}

const STEPS = [
  { step: 1, label: 'Verify Franchise' },
  { step: 2, label: 'Account Info' },
  { step: 3, label: 'Create Password' },
];

/** 3-step progress indicator shared by Franchise Verification, Account Info, and Create Password. */
export default function AuthProgressSteps({ currentStep }: AuthProgressStepsProps) {
  return (
    <View style={styles.row}>
      {STEPS.map((s, index) => {
        const isDone = s.step < currentStep;
        const isActive = s.step === currentStep;
        const isFilled = isDone || isActive;

        return (
          <React.Fragment key={s.step}>
            <View style={styles.stepCol}>
              <View style={[styles.circle, isFilled && styles.circleFilled]}>
                {isDone ? (
                  <Check size={14} color="#FFFFFF" strokeWidth={3} />
                ) : (
                  <Text style={[styles.circleText, isActive && styles.circleTextActive]}>
                    {s.step}
                  </Text>
                )}
              </View>
              <Text style={[styles.label, isFilled && styles.labelActive]}>{s.label}</Text>
            </View>

            {index < STEPS.length - 1 && (
              <View style={[styles.connector, isDone && styles.connectorDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  stepCol: {
    alignItems: 'center',
    gap: 6,
    width: 96,
  },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFilled: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  circleText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  circleTextActive: {
    color: '#FFFFFF',
  },
  label: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
  connector: {
    height: 2,
    flex: 1,
    backgroundColor: COLORS.border,
    marginTop: 13,
    marginHorizontal: -8,
  },
  connectorDone: {
    backgroundColor: COLORS.primary,
  },
});
