import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, FlatList, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X, Search, MapPin } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { searchPlaces, PlaceSearchResult } from '../services/routingService';

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
 * Destination search for a Manual Ride — a trimmed version of the Passenger app's picker: live
 * place search (the same Nominatim search, biased to Nasugbu) and a result list. No saved places
 * (those belong to a passenger account) and no pin-on-map.
 */
export default function DestinationSearchModal({ visible, onClose, onSelect }: DestinationSearchModalProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setResults([]);
      setHasSearched(false);
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
          {isSearching ? <ActivityIndicator size="small" color={COLORS.primary} /> : null}
        </View>

        <FlatList
          data={results}
          keyExtractor={(item, i) => `${item.lat},${item.lng},${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {query.trim().length < 2
                ? 'Type at least 2 letters to search.'
                : isSearching
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
  list: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, flexGrow: 1 },
  separator: { height: 1, backgroundColor: COLORS.borderLight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: SPACING.sm },
  rowIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.dangerLight, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowName: { ...TYPOGRAPHY.bodyLarge, color: COLORS.textPrimary },
  rowAddress: { ...TYPOGRAPHY.caption, color: COLORS.textSecondary, marginTop: 2 },
  empty: { ...TYPOGRAPHY.bodySmall, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: SPACING.xl },
});
