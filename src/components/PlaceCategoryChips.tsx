import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';
import { PLACE_CATEGORIES, PlaceCategoryDef } from '../constants/placeCategories';
import { COLORS, RADIUS, SHADOWS, SPACING } from '../constants/theme';

interface PlaceCategoryChipsProps {
  selectedCategory: string;
  onSelectCategory: (categoryKey: string) => void;
  isLoading?: boolean;
}

export default function PlaceCategoryChips({
  selectedCategory,
  onSelectCategory,
  isLoading = false,
}: PlaceCategoryChipsProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {PLACE_CATEGORIES.map((cat: PlaceCategoryDef) => {
          const isSelected = selectedCategory === cat.key;
          const Icon = cat.icon;

          return (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.chip,
                isSelected ? styles.chipSelected : styles.chipUnselected,
              ]}
              onPress={() => onSelectCategory(cat.key)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${cat.label} category filter`}
            >
              <Icon
                size={14}
                color={isSelected ? '#FFFFFF' : cat.color}
                strokeWidth={isSelected ? 2.2 : 2.0}
              />
              <Text
                style={[
                  styles.label,
                  isSelected ? styles.labelSelected : styles.labelUnselected,
                ]}
                numberOfLines={1}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 44,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: SPACING.md,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    gap: 6,
  },
  chipUnselected: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...SHADOWS.sm,
  },
  chipSelected: {
    backgroundColor: COLORS.primary,
    borderWidth: 1,
    borderColor: COLORS.primary,
    ...SHADOWS.sm,
  },
  icon: {
    marginRight: 2,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  labelUnselected: {
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  labelSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
