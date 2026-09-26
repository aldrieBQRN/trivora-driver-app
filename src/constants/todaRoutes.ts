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

export const TODA_ZONES: TodaZone[] = [];

export function checkColorCodingViolation(plateOrStickerNumber?: string): {
  isViolation: boolean;
  day: string;
  lastDigit?: number;
  description?: string;
} {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = days[new Date().getDay()];
  const restrictedDigits = COLOR_CODING_RULES[todayName] || [];

  if (!plateOrStickerNumber) return { isViolation: false, day: todayName };

  const cleanNo = plateOrStickerNumber.trim();
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
