import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, TYPOGRAPHY } from '../constants/theme';

export type RideStep = 'to_pickup' | 'arrived' | 'in_transit' | 'completed';

const STEPS: { key: RideStep; label: string }[] = [
  { key: 'to_pickup', label: 'To Pick-up' },
  { key: 'arrived', label: 'Arrived' },
  { key: 'in_transit', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
];

const FILL_BY_STEP: Record<RideStep, `${number}%`> = {
  to_pickup: '15%',
  arrived: '40%',
  in_transit: '75%',
  completed: '100%',
};

interface RideProgressStepperProps {
  currentStep: RideStep;
}

/** 4-step To Pick-up → Arrived → In Progress → Completed progress bar for the active-ride screens. */
export default function RideProgressStepper({ currentStep }: RideProgressStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <View style={styles.container}>
      <View style={styles.line}>
        <View style={[styles.fill, { width: FILL_BY_STEP[currentStep] }]} />
      </View>

      <View style={styles.stepsRow}>
        {STEPS.map((step, index) => {
          const isDone = index <= currentIndex;
          return (
            <View key={step.key} style={styles.stepCol}>
              <View style={[styles.dot, isDone && styles.dotDone]} />
              <Text style={[styles.label, isDone && styles.labelActive]}>{step.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
    position: 'relative',
    paddingVertical: 6,
  },
  line: {
    position: 'absolute',
    top: 11,
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: COLORS.border,
  },
  fill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepCol: {
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  dotDone: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  label: {
    ...TYPOGRAPHY.micro,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
