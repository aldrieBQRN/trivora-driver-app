import React from 'react';
import {
  Compass,
  Utensils,
  Coffee,
  Hotel,
  Fuel,
  Hospital,
  GraduationCap,
  Landmark,
  ShoppingBag,
  Building2,
  MapPin,
} from 'lucide-react-native';

export interface PlaceCategoryDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  tintColor: string;
  svgPath: string;
}

export const PLACE_CATEGORIES: PlaceCategoryDef[] = [
  {
    key: 'all',
    label: 'All',
    icon: Compass,
    color: '#1D2542',
    tintColor: '#EDEEF3',
    svgPath: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  },
  {
    key: 'restaurants',
    label: 'Restaurants',
    icon: Utensils,
    color: '#EA580C', // Vibrant Coral / Orange
    tintColor: '#FFF7ED',
    svgPath: '<path d="M18 2v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V2"/><path d="M15 2v12"/><path d="M15 14v8"/><path d="M6 2v20"/><path d="M3 2v4a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2"/>',
  },
  {
    key: 'coffee',
    label: 'Coffee',
    icon: Coffee,
    color: '#92400E', // Warm Caramel / Brown
    tintColor: '#FEF3C7',
    svgPath: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>',
  },
  {
    key: 'hotels',
    label: 'Hotels',
    icon: Hotel,
    color: '#7C3AED', // Royal Violet
    tintColor: '#F5F3FF',
    svgPath: '<path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="m9 16 .348-.24c1.465-1.013 3.84-1.013 5.304 0L15 16"/><path d="M8 7h.01"/><path d="M16 7h.01"/><path d="M12 7h.01"/><path d="M12 11h.01"/><path d="M16 11h.01"/><path d="M8 11h.01"/>',
  },
  {
    key: 'gas_stations',
    label: 'Gas Stations',
    icon: Fuel,
    color: '#0284C7', // Sky Blue
    tintColor: '#F0F9FF',
    svgPath: '<line x1="3" y1="22" x2="15" y2="22"/><line x1="4" y1="9" x2="14" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>',
  },
  {
    key: 'hospitals',
    label: 'Hospitals',
    icon: Hospital,
    color: '#DC2626', // Medical Crimson Red
    tintColor: '#FEF2F2',
    svgPath: '<path d="M12 6v12"/><path d="M6 12h12"/><rect width="18" height="18" x="3" y="3" rx="2"/>',
  },
  {
    key: 'schools',
    label: 'Schools',
    icon: GraduationCap,
    color: '#4F46E5', // Academic Indigo
    tintColor: '#EEF2FF',
    svgPath: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  },
  {
    key: 'banks',
    label: 'Banks',
    icon: Landmark,
    color: '#059669', // Currency Emerald
    tintColor: '#ECFDF5',
    svgPath: '<line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  },
  {
    key: 'shops',
    label: 'Shops',
    icon: ShoppingBag,
    color: '#0D9488', // Commercial Teal
    tintColor: '#F0FDFA',
    svgPath: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  },
  {
    key: 'government',
    label: 'Government',
    icon: Building2,
    color: '#334155', // Civic Slate Navy
    tintColor: '#F1F5F9',
    svgPath: '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>',
  },
  {
    key: 'places',
    label: 'Places',
    icon: MapPin,
    color: '#D97706', // Discovery Amber
    tintColor: '#FFFBEB',
    svgPath: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  },
];

export function getCategoryDefinition(key: string): PlaceCategoryDef {
  return (
    PLACE_CATEGORIES.find((cat) => cat.key === key) || {
      key,
      label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
      icon: MapPin,
      color: '#D97706',
      tintColor: '#FFFBEB',
      svgPath: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    }
  );
}
