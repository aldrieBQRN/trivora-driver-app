import React from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS } from '../constants/theme';

export interface CurvedTab<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

interface CurvedTabBarProps<K extends string> {
  tabs: CurvedTab<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  /** Space below the tabs (device safe area / minimum gap). */
  bottomInset: number;
}

/**
 * Flat bottom nav: inactive tabs are icon-only; the active tab expands into a tinted pill with its
 * icon and label. Tabs size to their content so a long active label still fits.
 */
export default function CurvedTabBar<K extends string>({ tabs, activeKey, onSelect, bottomInset }: CurvedTabBarProps<K>) {
  const handleSelect = (key: K) => {
    if (key === activeKey) return;
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    onSelect(key);
  };

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset }]} accessibilityRole="tablist">
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const Icon = tab.icon;
        return (
          <Pressable
            key={tab.key}
            style={({ pressed }) => [styles.tab, isActive && styles.tabActive, pressed && !isActive && styles.tabPressed]}
            onPress={() => handleSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
            hitSlop={6}
          >
            <Icon
              size={22}
              color={isActive ? COLORS.primary : COLORS.textMuted}
              strokeWidth={isActive ? 2.3 : 1.9}
            />
            {isActive && (
              <Text style={styles.label} numberOfLines={1}>
                {tab.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingTop: 8,
    paddingHorizontal: 8,
    backgroundColor: COLORS.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    minWidth: 44,
    paddingHorizontal: 11,
    borderRadius: 20,
  },
  tabActive: {
    paddingHorizontal: 14,
    backgroundColor: COLORS.primaryTint,
  },
  tabPressed: {
    backgroundColor: COLORS.primaryTint,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 0.1,
  },
});
