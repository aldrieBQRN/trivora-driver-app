import React, { useEffect, useRef, useState } from 'react';
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { LucideIcon } from 'lucide-react-native';
import { COLORS, SHADOWS } from '../constants/theme';

export interface CurvedTab<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
}

interface CurvedTabBarProps<K extends string> {
  tabs: CurvedTab<K>[];
  activeKey: K;
  onSelect: (key: K) => void;
  /** Space below the labels (device safe area / minimum gap). */
  bottomInset: number;
}

/** Active tab circle (diameter) and the gap between it and the notch cut into the bar. */
const CIRCLE = 52;
const NOTCH_GAP = 6;
/** Transparent strip above the bar so the raised circle doesn't overlap the screen content. */
const TOP_SPACE = 14;
/** Circle centre, measured from the bar's top edge (slightly inside the bar). */
const CIRCLE_CY = 4;
const BAR_HEIGHT = 64;

/**
 * Bottom nav with a "curved notch": the active tab is a raised navy circle and the bar's top edge
 * dips around it. The notch + circle slide to the tapped tab. The bar background is one SVG three
 * times the bar's width with the notch in its centre, slid with translateX — so only transforms
 * animate (native driver), never the path itself.
 */
export default function CurvedTabBar<K extends string>({ tabs, activeKey, onSelect, bottomInset }: CurvedTabBarProps<K>) {
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === activeKey));
  const tabWidth = width / tabs.length;
  const targetX = tabWidth * (activeIndex + 0.5);

  // Centre x of the active tab, animated.
  const cx = useRef(new Animated.Value(0)).current;
  const placedRef = useRef(false);
  useEffect(() => {
    if (!width) return;
    if (!placedRef.current) {
      cx.setValue(targetX); // first layout: no slide-in from the left edge
      placedRef.current = true;
      return;
    }
    Animated.spring(cx, { toValue: targetX, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
  }, [targetX, width, cx]);

  const handleLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const barHeight = BAR_HEIGHT + bottomInset;
  const svgWidth = width * 3;
  const c = svgWidth / 2;
  const r = CIRCLE / 2 + NOTCH_GAP;
  // Flat top edge, a smooth shoulder into a round dip around the circle, back out, then the bar body.
  const notchPath = width
    ? [
        `M0 0`,
        `L${c - r - 14} 0`,
        `Q${c - r - 2} 0 ${c - r + 1} ${CIRCLE_CY + 6}`,
        `A${r} ${r} 0 0 0 ${c + r - 1} ${CIRCLE_CY + 6}`,
        `Q${c + r + 2} 0 ${c + r + 14} 0`,
        `L${svgWidth} 0`,
        `L${svgWidth} ${barHeight}`,
        `L0 ${barHeight}`,
        'Z',
      ].join(' ')
    : '';

  const ActiveIcon = tabs[activeIndex]?.icon;

  return (
    <View style={[styles.wrap, { height: TOP_SPACE + barHeight }]} onLayout={handleLayout} accessibilityRole="tablist">
      {width > 0 && (
        <>
          {/* Bar background with the notch */}
          <View style={[styles.bgClip, { top: TOP_SPACE, height: barHeight }]} pointerEvents="none">
            <Animated.View style={{ width: svgWidth, transform: [{ translateX: Animated.add(cx, -c) }] }}>
              <Svg width={svgWidth} height={barHeight}>
                <Path d={notchPath} fill={COLORS.background} stroke={COLORS.border} strokeWidth={1} />
              </Svg>
            </Animated.View>
          </View>

          {/* Raised active circle */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.circle,
              { top: TOP_SPACE + CIRCLE_CY - CIRCLE / 2, transform: [{ translateX: Animated.add(cx, -CIRCLE / 2) }] },
            ]}
          >
            {ActiveIcon ? <ActiveIcon size={22} color={COLORS.textInverse} strokeWidth={2.3} /> : null}
          </Animated.View>
        </>
      )}

      {/* Tabs: inactive ones show their icon; the active one leaves room for the circle above its label */}
      <View style={[styles.row, { top: TOP_SPACE, paddingBottom: bottomInset }]}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [styles.tab, pressed && !isActive && styles.tabPressed]}
              onPress={() => onSelect(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              hitSlop={4}
            >
              <View style={styles.iconSlot}>
                {!isActive && <Icon size={21} color={COLORS.textMuted} strokeWidth={1.9} />}
              </View>
              <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Solid (screen colour) so the strip above the bar covers the shadow the screen above it casts
  // downward — otherwise a faint line shows between the screen content and the nav.
  wrap: {
    backgroundColor: COLORS.background,
  },
  bgClip: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  circle: {
    position: 'absolute',
    left: 0,
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    ...SHADOWS.md,
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    paddingTop: 10,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabPressed: {
    opacity: 0.55,
  },
  iconSlot: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
});
