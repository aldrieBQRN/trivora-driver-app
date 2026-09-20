import { TodaZone } from '../types';

export const MUNICIPAL_SPEED_LIMIT_KMH = 40.0;

export const COLOR_CODING_RULES: Record<string, number[]> = {
  Monday: [1, 2],
  Tuesday: [3, 4],
  Wednesday: [5, 6],
  Thursday: [7, 8],
  Friday: [9, 0],
  Saturday: [],
  Sunday: [],
};

export const TODA_ZONES: TodaZone[] = [
  {
    id: 1,
    code: 'TODA-BRGY8',
    name: 'TODA Barangay 8',
    terminal: 'Brgy 8 Public Market Terminal',
    badgeColor: '#1B3A69',
    centerLat: 14.0715,
    centerLng: 120.6330,
    coverageKm: 3.0,
    baseFare: 20.0,
    perKmRate: 10.0,
  },
  {
    id: 2,
    code: 'TODA-BRGY10',
    name: 'TODA Barangay 10',
    terminal: 'North Terminal Crossing',
    badgeColor: '#059669',
    centerLat: 14.0725,
    centerLng: 120.6322,
    coverageKm: 3.0,
    baseFare: 20.0,
    perKmRate: 10.0,
  },
  {
    id: 3,
    code: 'TODA-BRGY4',
    name: 'TODA Barangay 4',
    terminal: 'Brgy 4 Baywalk Junction',
    badgeColor: '#D97706',
    centerLat: 14.0673,
    centerLng: 120.6331,
    coverageKm: 3.0,
    baseFare: 20.0,
    perKmRate: 10.0,
  },
  {
    id: 4,
    code: 'TODA-BUCANA',
    name: 'TODA Bucana',
    terminal: 'Bucana Bridge Terminal',
    badgeColor: '#7C3AED',
    centerLat: 14.0645,
    centerLng: 120.6298,
    coverageKm: 3.5,
    baseFare: 25.0,
    perKmRate: 10.0,
  },
];

export function checkColorCodingViolation(plateOrBodyNumber?: string): {
  isViolation: boolean;
  day: string;
  lastDigit?: number;
  description?: string;
} {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = days[new Date().getDay()];
  const restrictedDigits = COLOR_CODING_RULES[todayName] || [];

  if (!plateOrBodyNumber) return { isViolation: false, day: todayName };

  const cleanNo = plateOrBodyNumber.trim();
  const lastDigit = parseInt(cleanNo.slice(-1), 10);

  if (!isNaN(lastDigit) && restrictedDigits.includes(lastDigit)) {
    return {
      isViolation: true,
      day: todayName,
      lastDigit,
      description: `Operating on restricted coding day (${todayName}, ending digit ${lastDigit}). Municipal Fine: ₱500.00.`,
    };
  }

  return { isViolation: false, day: todayName };
}
