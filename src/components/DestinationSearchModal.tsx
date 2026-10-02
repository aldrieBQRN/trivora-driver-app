import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, MapPin } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { searchPlaces, PlaceSearchResult } from '../services/routingService';
import PlaceCategoryChips from './PlaceCategoryChips';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { getCategoryDefinition } from '../constants/placeCategories';
import { useDriverShift } from '../context/DriverShiftContext';
import { haversineKm } from '../utils/geo';

export interface SelectedDestination {
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

interface DestinationSearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (destination: SelectedDestination) => void;
}

const SEARCH_DEBOUNCE_MS = 400;

/**
 * Destination search for a Manual Ride — enhanced with category filter discovery
 * (Restaurants, Coffee, Hotels, Gas Stations, Hospitals, Schools, Banks, etc.)
 * alongside live Nominatim text search.
 */
export default function DestinationSearchModal({ visible, onClose, onSelect }: DestinationSearchModalProps) {
  const insets = useSafeAreaInsets();
  const { currentLat, currentLng } = useDriverShift();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const requestIdRef = useRef(0);

  const searchCenter =
    currentLat != null && currentLng != null
      ? { lat: currentLat, lng: currentLng }
      : { lat: 14.0718, lng: 120.6325 };

  const {
    selectedCategory,
    setSelectedCategory,
    places: nearbyPlaces,
    isLoading: isLoadingNearby,
  } = useNearbyPlaces({
    searchCenter,
    enabled: visible,
    initialCategory: 'all',
  });

  const isSearchMode = query.trim().length >= 2;

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setSelectedCategory('all');
    }
  }, [visible]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      requestIdRef.current++;
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsSearching(true);
    const timer = setTimeout(() => {
      searchPlaces(trimmed).then((found) => {
        if (requestId !== requestIdRef.current) return;
        setResults(found);
        setIsSearching(false);
        setHasSearched(true);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>Where is the passenger going?</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchBox}>
          <Search size={18} color={COLORS.textMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search a destination in Nasugbu…"
            placeholderTextColor={COLORS.textMuted}
            autoFocus
            returnKeyType="search"
            accessibilityLabel="Search destination"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Clear query">
              <X size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
          {isSearching ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        </View>

        {/* Category filter row directly below search input */}
        {!isSearchMode && (
          <View style={styles.categoryChipsWrapper}>
            <PlaceCategoryChips
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              isLoading={isLoadingNearby}
            />
          </View>
        )}

        {isSearchMode ? (
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListEmptyComponent={
              <Text style={styles.empty}>
                {isSearching
                  ? 'Searching…'
                  : hasSearched
                  ? 'No places found. Check your connection or try another name.'
                  : ''}
              </Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => onSelect({ name: item.name, address: item.address, lat: item.lat, lng: item.lng })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.address}`}
              >
                <View style={styles.rowIcon}>
                  <MapPin size={16} color={COLORS.danger} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.rowAddress} numberOfLines={2}>{item.address}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        ) : selectedCategory !== 'all' ? (
          <FlatList
            data={nearbyPlaces}
            keyExtractor={(item, i) => `${item.id || item.name}-${i}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              <Text style={styles.sectionHeader}>
                {`Nearby ${getCategoryDefinition(selectedCategory).label}`}
              </Text>
            }
            ListEmptyComponent={
              isLoadingNearby ? (
                <View style={styles.centerStatus}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.empty}>Finding nearby {getCategoryDefinition(selectedCategory).label.toLowerCase()}…</Text>
                </View>
              ) : (
                <Text style={styles.empty}>No {getCategoryDefinition(selectedCategory).label.toLowerCase()} found nearby.</Text>
              )
            }
            renderItem={({ item }) => {
              const catDef = getCategoryDefinition(item.category || selectedCategory);
              const CatIcon = catDef.icon;
              const dist = haversineKm(searchCenter, { lat: item.latitude, lng: item.longitude });

              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onSelect({ name: item.name, address: item.address, lat: item.latitude, lng: item.longitude })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.address}`}
                >
                  <View style={[styles.rowIcon, { backgroundColor: catDef.tintColor || COLORS.surfaceInput }]}>
                    <CatIcon size={16} color={catDef.color} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowAddress} numberOfLines={1}>{item.address || 'Nasugbu, Batangas'}</Text>
                  </View>
                  {Number.isFinite(dist) && (
                    <Text style={styles.rowDistance}>{dist.toFixed(1)} km</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        ) : (
          <FlatList
            data={nearbyPlaces}
            keyExtractor={(item, i) => `${item.id || item.name}-${i}`}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListHeaderComponent={
              nearbyPlaces.length > 0 ? (
                <Text style={styles.sectionHeader}>Suggested Places Nearby</Text>
              ) : null
            }
            ListEmptyComponent={
              isLoadingNearby ? (
                <View style={styles.centerStatus}>
                  <ActivityIndicator color={COLORS.primary} />
                  <Text style={styles.empty}>Loading places…</Text>
                </View>
              ) : (
                <Text style={styles.empty}>Type to search or choose a category above.</Text>
              )
            }
            renderItem={({ item }) => {
              const catDef = getCategoryDefinition(item.category || 'places');
              const CatIcon = catDef.icon;
              const dist = haversineKm(searchCenter, { lat: item.latitude, lng: item.longitude });

              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => onSelect({ name: item.name, address: item.address, lat: item.latitude, lng: item.longitude })}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.address}`}
                >
                  <View style={[styles.rowIcon, { backgroundColor: catDef.tintColor || COLORS.surfaceInput }]}>
                    <CatIcon size={16} color={catDef.color} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowAddress} numberOfLines={1}>{item.address || 'Nasugbu, Batangas'}</Text>
                  </View>
                  {Number.isFinite(dist) && (
                    <Text style={styles.rowDistance}>{dist.toFixed(1)} km</Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  title: { ...TYPOGRAPHY.h2, color: COLORS.textPrimary, flex: 1 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surfaceInput, alignItems: 'center', justifyContent: 'center' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginHorizontal: SPACING.lg, paddingHorizontal: SPACING.md, height: 52,
    borderRadius: RADIUS.lg, backgroundColor: COLORS.surfaceInput,
  },
  input: { flex: 1, ...TYPOGRAPHY.body, color: COLORS.textPrimary, height: '100%' },
  categoryChipsWrapper: {
    paddingVertical: SPACING.xs,
    marginTop: 4,
  },
  sectionHeader: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    paddingVertical: SPACING.xs,
    marginBottom: 4,
  },
  list: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, flexGrow: 1 },
  separator: { height: 1, backgroundColor: COLORS.borderLight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: SPACING.sm },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowName: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary },
  rowAddress: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
  rowDistance: { ...TYPOGRAPHY.caption, fontWeight: '600', color: COLORS.textSecondary, marginLeft: 8 },
  centerStatus: { paddingVertical: SPACING.xl, alignItems: 'center', gap: 8 },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.xl },
});
