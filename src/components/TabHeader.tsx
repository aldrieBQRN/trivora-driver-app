import React, { ReactNode, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';

interface TabHeaderProps {
  title: string;
  subtitle?: string;
  /** White card that straddles the panel's curved bottom edge (e.g. a filter or identity card). */
  children?: ReactNode;
}

/**
 * Same component as the Passenger app's TabHeader (keep the two in sync), except it reads the
 * status-bar inset itself, as this app's screens do.
 *
 * Navy tab-page header — same treatment as Home's: a brand-navy panel with rounded bottom
 * corners, white title/subtitle, and an optional card whose vertical centre sits on the panel's
 * bottom edge. Light status-bar icons while mounted (sub-pages that replace the screen unmount it).
 */
export default function TabHeader({ title, subtitle, children }: TabHeaderProps) {
  const insets = useSafeAreaInsets();
  const [cardHeight, setCardHeight] = useState(0);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + SPACING.sm }]}>
      <StatusBar style="light" />
      <View style={[styles.bg, { bottom: children ? cardHeight / 2 : 0 }]} pointerEvents="none" />
      <View style={[styles.titleBlock, !children && styles.titleBlockAlone]}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {children ? <View onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  bg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.xxl,
    borderBottomRightRadius: RADIUS.xxl,
    ...SHADOWS.md,
    // No Android elevation: it would lift this layer above the title (elevation outranks render
    // order there). The iOS shadow still applies.
    elevation: 0,
  },
  titleBlock: {
    paddingTop: SPACING.xs,
  },
  titleBlockAlone: {
    paddingBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textInverse,
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
});
