import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, MapPin, ChevronRight } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { searchPlaces, PlaceSearchResult } from '../services/routingService';
import PlaceCategoryChips from './PlaceCategoryChips';
import TabHeader from './TabHeader';
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
  /** Shows the "Pin location on map" row (the caller opens its pin map). */
  onPinOnMap?: () => void;
}

const SEARCH_DEBOUNCE_MS = 400;

/**
 * "Where is the passenger going?" for a Manual Ride — the same page as the Passenger app's
 * destination search: navy header with the search bar on its curve, a "Pin location on map" row,
 * then nearby places by category, or live Nominatim results while typing.
 */
export default function DestinationSearchModal({ visible, onClose, onSelect, onPinOnMap }: DestinationSearchModalProps) {
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

  const categoryLabel = getCategoryDefinition(selectedCategory).label;
  const nearbyLabel = selectedCategory === 'all' ? 'All Nearby Places' : `Nearby ${categoryLabel}`;
  const nearbyStatus = isLoadingNearby
    ? selectedCategory === 'all'
      ? 'Finding nearby places in Nasugbu…'
      : `Finding nearby ${categoryLabel.toLowerCase()}…`
    : selectedCategory === 'all'
    ? 'No nearby places found.'
    : `No ${categoryLabel.toLowerCase()} found nearby.`;
  const listContent = [styles.listContent, { paddingBottom: SPACING.lg + insets.bottom }];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Navy header with the search bar as the card on its curve, as in the Passenger app */}
        <TabHeader title="Where is the passenger going?" subtitle="From your current location" onBack={onClose}>
          <View style={styles.searchBar}>
            <Search size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search destination in Nasugbu..."
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="search"
              accessibilityLabel="Search destination"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Clear search"
              >
                <X size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </TabHeader>

        {!isSearchMode && onPinOnMap ? (
          <TouchableOpacity style={styles.pinOnMapRow} onPress={onPinOnMap} activeOpacity={0.7} accessibilityRole="button">
            <View style={styles.placeIconBox}>
              <MapPin size={18} color={COLORS.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.pinRowTitle}>Pin location on map</Text>
              <Text style={styles.pinRowSub}>Set the exact drop-off point</Text>
            </View>
            <ChevronRight size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}

        {isSearchMode ? (
          <>
            <Text style={styles.listSectionLabel}>Search Results</Text>
            {isSearching ? (
              <View style={styles.statusBox}>
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : (
              <FlatList
                data={results}
                keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={listContent}
                ListEmptyComponent={
                  hasSearched ? (
                    <View style={styles.statusBox}>
                      <Text style={styles.emptyText}>No places found. Check your connection or try another name.</Text>
                    </View>
                  ) : null
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.placeItem}
                    onPress={() => onSelect({ name: item.name, address: item.address, lat: item.lat, lng: item.lng })}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.address}`}
                  >
                    <View style={styles.placeIconBox}>
                      <MapPin size={16} color={COLORS.primary} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.placeAddress} numberOfLines={1}>{item.address}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </>
        ) : (
          <>
            <View style={styles.categoryChipsWrapper}>
              <PlaceCategoryChips
                selectedCategory={selectedCategory}
                onSelectCategory={setSelectedCategory}
                isLoading={isLoadingNearby}
              />
            </View>

            <Text style={styles.listSectionLabel}>{nearbyLabel}</Text>

            <FlatList
              data={nearbyPlaces}
              keyExtractor={(item, i) => `${item.id || item.name}-${i}`}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={listContent}
              ListEmptyComponent={
                <View style={styles.statusBox}>
                  {isLoadingNearby ? <ActivityIndicator color={COLORS.primary} /> : null}
                  <Text style={styles.emptyText}>{nearbyStatus}</Text>
                </View>
              }
              renderItem={({ item }) => {
                const catDef = getCategoryDefinition(item.category || selectedCategory);
                const CatIcon = catDef.icon;
                const dist = haversineKm(searchCenter, { lat: item.latitude, lng: item.longitude });

                return (
                  <TouchableOpacity
                    style={styles.placeItem}
                    onPress={() => onSelect({ name: item.name, address: item.address, lat: item.latitude, lng: item.longitude })}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name}, ${item.address}`}
                  >
                    <View style={[styles.placeIconBox, { backgroundColor: catDef.tintColor || COLORS.primaryTint }]}>
                      <CatIcon size={17} color={catDef.color} />
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.placeName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.placeAddress} numberOfLines={1}>{item.address || 'Nasugbu, Batangas'}</Text>
                    </View>
                    {Number.isFinite(dist) && <Text style={styles.placeDistance}>{dist.toFixed(1)} km</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Same measurements as the Passenger app's DestinationSearchScreen.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  flex: { flex: 1 },
  // White card on the navy header's curve.
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    height: 52,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.card,
  },
  searchInput: { flex: 1, ...TYPOGRAPHY.body, fontSize: 15, color: COLORS.textPrimary },
  pinOnMapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  pinRowTitle: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  pinRowSub: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 1 },
  categoryChipsWrapper: { marginTop: SPACING.sm, marginBottom: SPACING.xs },
  listSectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  listContent: { paddingHorizontal: SPACING.lg, flexGrow: 1 },
  placeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    gap: 12,
  },
  placeIconBox: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeName: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.textPrimary },
  placeAddress: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 1 },
  placeDistance: { ...TYPOGRAPHY.caption, fontWeight: '600', color: COLORS.textSecondary },
  statusBox: { paddingVertical: SPACING.lg, paddingHorizontal: SPACING.lg, alignItems: 'center', gap: SPACING.sm },
  emptyText: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center' },
});
