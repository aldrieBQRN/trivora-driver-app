import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { NearbyPlace } from '../types';
import { getCategoryDefinition } from '../constants/placeCategories';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import Button from './Button';

interface PlaceDetailCardProps {
  place: NearbyPlace;
  onUseLocation: (place: NearbyPlace) => void;
  onClose: () => void;
  bottomOffset?: number;
}

export default function PlaceDetailCard({
  place,
  onUseLocation,
  onClose,
  bottomOffset = 0,
}: PlaceDetailCardProps) {
  const categoryDef = getCategoryDefinition(place.category);
  const CategoryIcon = categoryDef.icon;

  return (
    <View style={[styles.container, { bottom: bottomOffset + 12 }]}>
      <View style={styles.card}>
        {/* Top meta row */}
        <View style={styles.topRow}>
          <View style={styles.categoryBadge}>
            <CategoryIcon size={12} color={COLORS.primary} strokeWidth={2} />
            <Text style={styles.categoryLabel}>{place.category_label || categoryDef.label}</Text>
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close place details"
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <X size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Place title & address */}
        <View style={styles.content}>
          <Text style={styles.placeName} numberOfLines={2}>
            {place.name}
          </Text>
          {place.address ? (
            <Text style={styles.placeAddress} numberOfLines={2}>
              {place.address}
            </Text>
          ) : (
            <Text style={styles.coords}>
              {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
            </Text>
          )}
        </View>

        {/* Attribution note */}
        <Text style={styles.attribution}>Places via OpenStreetMap</Text>

        {/* Action Button */}
        <Button
          label="Use This Location"
          onPress={() => onUseLocation(place)}
          icon={Check}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: SPACING.md,
    right: SPACING.md,
    zIndex: 25,
  },
  card: {
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.sheet,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primaryTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    marginBottom: SPACING.sm,
  },
  placeName: {
    ...TYPOGRAPHY.h3,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  placeAddress: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  coords: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  attribution: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
    fontStyle: 'italic',
  },
});
