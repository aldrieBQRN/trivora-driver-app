import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';

export interface FilterTabOption {
  key: string;
  label: string;
}

interface FilterTabsProps {
  options: FilterTabOption[];
  value: string;
  onChange: (key: string) => void;
}

/**
 * One segmented-tab filter for every list/period switcher in the app — a bordered track holding
 * flex-equal tabs, the active one filled solid. This is the Earnings screen's period-tab design
 * (Daily/Weekly/Monthly), generalized so Ride History, Violations, and Earnings all draw their
 * filter control the same way instead of each screen having its own pill/segment variant.
 *
 * The outer padding is baked in here (not left to each screen) so every screen gets identical
 * spacing below the header and identical horizontal alignment with its content for free — the
 * space below the filter is intentionally left to the content below it (its existing top padding
 * already supplies the matching gap), so this only reserves the "header to filter" side.
 */
export default function FilterTabs({ options, value, onChange }: FilterTabsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.track}>
        {options.map((option) => {
          const isActive = option.key === value;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onChange(option.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.md,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: RADIUS.sm,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
