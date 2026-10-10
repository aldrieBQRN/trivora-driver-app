import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  User,
  QrCode,
  ChevronRight,
  X,
} from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';
import ScreenHeader from '../components/ScreenHeader';
import Button from '../components/Button';
import ConfirmModal from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { useDriverAuth } from '../context/DriverAuthContext';
import { driverApi } from '../services/api';
import { DriverGcashQrStatus } from '../types';

interface DriverGcashQrScreenProps {
  onBack: () => void;
}

// In-memory module cache for GCash status
let cachedGcashState: { driverId: number; data: DriverGcashQrStatus } | null = null;

export function getCachedGcashStatus(driverId?: number): DriverGcashQrStatus | null {
  if (!driverId) return null;
  return cachedGcashState && cachedGcashState.driverId === driverId ? cachedGcashState.data : null;
}

export function saveCachedGcashStatus(driverId: number, status: DriverGcashQrStatus): void {
  cachedGcashState = { driverId, data: status };
  AsyncStorage.setItem(`@trivora_driver_gcash_status_${driverId}`, JSON.stringify(status)).catch(() => {});
}

export function clearDriverGcashCache(): void {
  cachedGcashState = null;
}

export async function prefetchDriverGcashQr(driverId?: number): Promise<DriverGcashQrStatus | null> {
  if (!driverId) return null;

  // Return in-memory cache immediately if fresh
  if (cachedGcashState && cachedGcashState.driverId === driverId) {
    driverApi
      .getGcashQr()
      .then((res) => {
        if (res) saveCachedGcashStatus(driverId, res);
      })
      .catch(() => {});
    return cachedGcashState.data;
  }

  // Check persistent AsyncStorage cache
  try {
    const raw = await AsyncStorage.getItem(`@trivora_driver_gcash_status_${driverId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as DriverGcashQrStatus;
        if (parsed) {
          cachedGcashState = { driverId, data: parsed };
          driverApi
            .getGcashQr()
            .then((res) => {
              if (res) saveCachedGcashStatus(driverId, res);
            })
            .catch(() => {});
          return parsed;
        }
      } catch {}
    }
  } catch {}

  // Fallback to direct network fetch
  try {
    const res = await driverApi.getGcashQr();
    if (res) {
      saveCachedGcashStatus(driverId, res);
      return res;
    }
  } catch {}

  return null;
}

export default function DriverGcashQrScreen({ onBack }: DriverGcashQrScreenProps) {
  const { showToast } = useToast();
  const { driver } = useDriverAuth();
  const driverId = driver?.id;

  const cachedInitial = driverId ? getCachedGcashStatus(driverId) : null;
  const [loading, setLoading] = useState(!cachedInitial);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [qrStatus, setQrStatus] = useState<DriverGcashQrStatus | null>(cachedInitial);

  // Modal state for Recipient Details
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [modalName, setModalName] = useState('');
  const [modalNumber, setModalNumber] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);

  // Deletion confirm modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchStatus = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await driverApi.getGcashQr();
      setQrStatus(res);
      if (driverId) {
        saveCachedGcashStatus(driverId, res);
      }
    } catch {
      if (!qrStatus && !cachedInitial) {
        showToast('Could not load GCash settings.', 'info');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    const cached = driverId ? getCachedGcashStatus(driverId) : null;
    if (cached) {
      setQrStatus(cached);
      setLoading(false);
      fetchStatus(true); // silent background revalidation
    } else {
      fetchStatus(false);
    }
  }, [driverId]);

  const handlePickAndUploadImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showToast('Photo library permission is required to select a QR code.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.9,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setUploadingQr(true);
        try {
          const file = {
            uri: asset.uri,
            name: asset.fileName || `gcash-qr-${Date.now()}.jpg`,
            type: asset.mimeType || 'image/jpeg',
          };
          const res = await driverApi.uploadGcashQr(file);
          showToast('GCash QR code updated successfully.', 'success');
          const updatedStatus: DriverGcashQrStatus = (res as any)?.driver || res;
          setQrStatus(updatedStatus);
          if (driverId) {
            saveCachedGcashStatus(driverId, updatedStatus);
          }
        } catch (err: any) {
          showToast(err?.message || 'Could not upload GCash QR.', 'info');
        } finally {
          setUploadingQr(false);
        }
      }
    } catch {
      showToast('Could not open photo library.', 'info');
    }
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    setUploadingQr(true);
    try {
      await driverApi.removeGcashQr();
      showToast('GCash QR removed. Your rides are now Cash Only.', 'success');
      const updated: DriverGcashQrStatus = {
        has_gcash_qr: false,
        configured: false,
        gcash_qr_url: null,
        gcash_name: null,
        gcash_number: null,
      };
      setQrStatus(updated);
      if (driverId) {
        saveCachedGcashStatus(driverId, updated);
      }
    } catch (err: any) {
      showToast(err?.message || 'Could not remove GCash QR.', 'info');
    } finally {
      setUploadingQr(false);
    }
  };

  const openDetailsModal = () => {
    setModalName(qrStatus?.gcash_name || '');
    setModalNumber(qrStatus?.gcash_number || '');
    setShowDetailsModal(true);
  };

  const handleSaveDetails = async () => {
    setSavingDetails(true);
    try {
      const res = await driverApi.uploadGcashQr(null, modalName.trim(), modalNumber.trim());
      showToast('Recipient details saved.', 'success');
      const updatedStatus: DriverGcashQrStatus = (res as any)?.driver || res;
      setQrStatus(updatedStatus);
      if (driverId) {
        saveCachedGcashStatus(driverId, updatedStatus);
      }
      setShowDetailsModal(false);
    } catch (err: any) {
      showToast(err?.message || 'Could not save recipient details.', 'info');
    } finally {
      setSavingDetails(false);
    }
  };

  const hasQr = Boolean(qrStatus?.has_gcash_qr || qrStatus?.configured || qrStatus?.gcash_qr_url);
  const qrUrl = qrStatus?.gcash_qr_url || null;
  const gcashName = qrStatus?.gcash_name || '';
  const gcashNumber = qrStatus?.gcash_number || '';
  const hasDetails = Boolean(gcashName || gcashNumber);

  return (
    <View style={styles.container}>
      <ScreenHeader title="Driver GCash QR" onBack={onBack} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading GCash settings…</Text>
          </View>
        ) : (
          <>
            {/* UNBOXED HERO QR SECTION */}
            <View style={styles.heroSection}>
              {/* Status Pill Badge */}
              <View style={styles.badgeRow}>
                {hasQr ? (
                  <View style={[styles.statusPill, styles.statusPillActive]}>
                    <CheckCircle2 size={13} color={COLORS.success} />
                    <Text style={styles.statusPillTextActive}>GCash QR Configured</Text>
                  </View>
                ) : (
                  <View style={[styles.statusPill, styles.statusPillMuted]}>
                    <QrCode size={13} color={COLORS.textMuted} />
                    <Text style={styles.statusPillTextMuted}>Cash Only (No QR)</Text>
                  </View>
                )}
              </View>

              {/* QR Image Stage */}
              <View style={styles.qrStage}>
                {qrUrl ? (
                  <View style={styles.qrFrame}>
                    <Image
                      source={{ uri: qrUrl }}
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                    {uploadingQr && (
                      <View style={styles.uploadOverlay}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                      </View>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.uploadStage}
                    onPress={handlePickAndUploadImage}
                    disabled={uploadingQr}
                    activeOpacity={0.7}
                  >
                    {uploadingQr ? (
                      <ActivityIndicator size="large" color={COLORS.primary} />
                    ) : (
                      <>
                        <View style={styles.uploadIconWrap}>
                          <Upload size={24} color={COLORS.primary} />
                        </View>
                        <Text style={styles.uploadTitle}>Tap to upload QR image</Text>
                        <Text style={styles.uploadSubtitle}>From your photo library</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Title & Subtitle */}
              <Text style={styles.heroTitle}>GCash QR Payment</Text>
              <Text style={styles.heroSubtitle}>
                Passengers scan this code to pay directly to your personal GCash account.
              </Text>

              {/* QR Actions */}
              {qrUrl && (
                <View style={styles.actionRow}>
                  <Button
                    label={uploadingQr ? 'Uploading…' : 'Change QR'}
                    icon={Upload}
                    variant="outline"
                    size="md"
                    onPress={handlePickAndUploadImage}
                    loading={uploadingQr}
                    disabled={uploadingQr}
                    fullWidth={false}
                    style={styles.actionBtn}
                  />
                  <Button
                    label="Remove"
                    icon={Trash2}
                    variant="dangerOutline"
                    size="md"
                    onPress={() => setShowDeleteConfirm(true)}
                    disabled={uploadingQr}
                    fullWidth={false}
                    style={styles.actionBtn}
                  />
                </View>
              )}
            </View>

            {/* RECIPIENT DETAILS LINK CARD (OPENS MODAL) */}
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>RECIPIENT DETAILS (OPTIONAL)</Text>
            </View>

            <TouchableOpacity
              style={styles.detailsCard}
              onPress={openDetailsModal}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Edit Recipient Details"
            >
              <View style={styles.detailsIconWrap}>
                <User size={18} color={COLORS.primary} />
              </View>
              <View style={styles.detailsInfoText}>
                <Text style={styles.detailsTitle}>
                  {gcashName || 'Recipient Name Not Set'}
                </Text>
                <Text style={styles.detailsSubtitle}>
                  {gcashNumber || 'Tap to configure name & mobile number'}
                </Text>
              </View>
              <ChevronRight size={18} color={COLORS.textMuted} />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* RECIPIENT DETAILS MODAL */}
      <Modal
        visible={showDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDetailsModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowDetailsModal(false)}
          />

          <View style={styles.modalSheet}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.modalTitle}>Recipient Details</Text>
                <Text style={styles.modalSubtitle}>
                  Optional name and number displayed to passengers
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowDetailsModal(false)}
                activeOpacity={0.7}
                accessibilityLabel="Close"
              >
                <X size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Modal Body */}
            <View style={styles.modalBody}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GCASH ACCOUNT NAME</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="e.g. JUAN D."
                  placeholderTextColor={COLORS.textMuted}
                  value={modalName}
                  onChangeText={setModalName}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>GCASH MOBILE NUMBER</Text>
                <TextInput
                  style={styles.modalTextInput}
                  placeholder="e.g. 0917 123 4567"
                  placeholderTextColor={COLORS.textMuted}
                  value={modalNumber}
                  onChangeText={setModalNumber}
                  keyboardType="phone-pad"
                />
              </View>

              <Text style={styles.modalHint}>
                Passengers review your name and number upon scanning to confirm the recipient.
              </Text>
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionsRow}>
              <Button
                label="Cancel"
                variant="outline"
                size="md"
                onPress={() => setShowDetailsModal(false)}
                disabled={savingDetails}
                style={styles.modalActionBtn}
                fullWidth={false}
              />
              <Button
                label={savingDetails ? 'Saving…' : 'Save Details'}
                variant="primary"
                size="md"
                onPress={handleSaveDetails}
                loading={savingDetails}
                disabled={savingDetails}
                style={styles.modalActionBtn}
                fullWidth={false}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* REMOVE QR CONFIRM MODAL */}
      <ConfirmModal
        visible={showDeleteConfirm}
        title="Remove GCash QR?"
        message="Passengers will not be able to pay with GCash for rides assigned to you. Your rides will revert to Cash Only."
        confirmLabel="Remove QR"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xxl,
    gap: SPACING.lg,
  },
  loadingBox: {
    paddingVertical: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },

  // Hero Section (Unboxed, clean)
  heroSection: {
    alignItems: 'center',
    paddingTop: 0,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: COLORS.successLight,
    borderColor: COLORS.successBorder,
  },
  statusPillMuted: {
    backgroundColor: COLORS.backgroundSubtle,
    borderColor: COLORS.borderLight,
  },
  statusPillTextActive: {
    ...TYPOGRAPHY.caption,
    color: COLORS.success,
    fontWeight: '600',
  },
  statusPillTextMuted: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    fontWeight: '600',
  },

  // QR Stage
  qrStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.xs,
  },
  qrFrame: {
    position: 'relative',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.md,
  },
  qrImage: {
    width: 210,
    height: 210,
    borderRadius: RADIUS.md,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadStage: {
    width: 210,
    height: 210,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: SPACING.md,
  },
  uploadIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.primary,
    textAlign: 'center',
  },
  uploadSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    textAlign: 'center',
  },

  heroTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },

  // QR Action Row
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.md,
    width: '100%',
  },
  actionBtn: {
    flex: 1,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.xs,
    marginBottom: -SPACING.xs,
  },
  sectionLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    letterSpacing: 0.6,
  },

  // Details Row Card (Opens modal)
  detailsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.md,
    gap: 12,
  },
  detailsIconWrap: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsInfoText: {
    flex: 1,
    gap: 2,
  },
  detailsTitle: {
    ...TYPOGRAPHY.bodyLarge,
    color: COLORS.textPrimary,
  },
  detailsSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: Platform.OS === 'ios' ? SPACING.xxl : SPACING.lg,
    gap: SPACING.md + 2,
    ...SHADOWS.sheet,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    ...TYPOGRAPHY.h2,
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surfaceInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    gap: 16,
    paddingVertical: SPACING.xs,
  },
  inputGroup: {
    width: '100%',
    gap: 6,
  },
  inputLabel: {
    ...TYPOGRAPHY.label,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  modalTextInput: {
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  modalHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: SPACING.sm,
    width: '100%',
  },
  modalActionBtn: {
    flex: 1,
  },
});
