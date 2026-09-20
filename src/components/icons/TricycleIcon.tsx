import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, {
  Path,
  Circle,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';

interface TricycleIconProps {
  size?: number;
  color?: string;
  accentColor?: string;
  roofColor?: string;
  style?: ViewStyle;
}

/**
 * Authentic Philippine Motorized Tricycle vector icon for Driver App.
 */
export default function TricycleIcon({
  size = 24,
  color = '#1B3A69',
  accentColor = '#3B82F6',
  roofColor,
  style,
}: TricycleIconProps) {
  const actualRoof = roofColor || color;

  return (
    <View style={[{ width: size, height: size }, styles.container, style]}>
      <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <Defs>
          <LinearGradient id="driverTrikeBody" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={accentColor} />
            <Stop offset="1" stopColor={color} />
          </LinearGradient>
        </Defs>

        {/* --- SIDECAR CABIN --- */}
        {/* Roof Canopy */}
        <Path
          d="M6 16 C6 14 8 13 11 13 L29 13 C32 13 34 14.5 34 17 L33 19 L5 19 Z"
          fill={actualRoof}
        />
        {/* Roof Rack Rails */}
        <Line x1="9" y1="12" x2="31" y2="12" stroke={actualRoof} strokeWidth="1.5" strokeLinecap="round" />
        <Line x1="13" y1="10" x2="27" y2="10" stroke={actualRoof} strokeWidth="1.2" strokeLinecap="round" />

        {/* Windshield & Canopy Pillars */}
        <Path
          d="M7 19 L9 26 L23 26 L23 19 Z"
          fill="#93C5FD"
          opacity={0.65}
        />
        <Line x1="7" y1="19" x2="9" y2="26" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Line x1="23" y1="19" x2="23" y2="26" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Line x1="33" y1="19" x2="32" y2="26" stroke={color} strokeWidth="1.6" strokeLinecap="round" />

        {/* Sidecar Main Body Tub */}
        <Path
          d="M6 26 L23 26 L23 32 C23 34 21 35 19 35 L9 35 C7 35 6 33.5 6 32 Z"
          fill="url(#driverTrikeBody)"
        />
        <Path
          d="M23 26 L33 26 L32 33 C32 34.5 30.5 35 29 35 L23 35 Z"
          fill={color}
          opacity={0.88}
        />

        {/* Sidecar Fender & Mudguard */}
        <Path
          d="M8 32 Q13 28 18 32"
          stroke={actualRoof}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Sidecar Wheel */}
        <Circle cx="13" cy="36" r="6" fill="#1E293B" />
        <Circle cx="13" cy="36" r="3.2" fill="#E2E8F0" />
        <Circle cx="13" cy="36" r="1.4" fill="#0F172A" />

        {/* --- MOTORCYCLE UNIT --- */}
        <Path
          d="M37 20 L40 18 M38 20 L35 22"
          stroke={color}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <Circle cx="41" cy="22" r="2.2" fill="#FBBF24" stroke={color} strokeWidth="0.8" />
        <Line x1="37" y1="20" x2="41" y2="35" stroke={color} strokeWidth="2.2" strokeLinecap="round" />

        <Path
          d="M32 23 C32 21 35 21 37 22 L36 26 L30 26 Z"
          fill={accentColor}
        />
        <Path
          d="M28 25 L32 25 L31 27 L27 27 Z"
          fill="#0F172A"
        />

        <Circle cx="41" cy="36" r="6" fill="#1E293B" />
        <Circle cx="41" cy="36" r="3.2" fill="#E2E8F0" />
        <Circle cx="41" cy="36" r="1.4" fill="#0F172A" />

        <Line x1="18" y1="34" x2="35" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
