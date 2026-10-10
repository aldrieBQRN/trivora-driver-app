import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { X, QrCode, Upload, Trash2, CheckCircle2, AlertCircle } from 'lucide-react-native';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import Button from './Button';
import ConfirmModal from './ConfirmModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useToast } from './Toast';
import { driverApi } from '../services/api';
import { DriverGcashQrStatus } from '../types';

interface DriverGcashSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdated?: (status: DriverGcashQrStatus) => void;
  initialStatus?: DriverGcashQrStatus | null;
  driverId?: number;
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
    // Silent background sync
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
          // Revalidate in background
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

export default function DriverGcashSettingsModal({
  visible,
  onClose,
  onUpdated,
  initialStatus,
  driverId,
}: DriverGcashSettingsModalProps) {
  const { showToast } = useToast();
  const cachedInitial = initialStatus || (driverId ? getCachedGcashStatus(driverId) : null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrStatus, setQrStatus] = useState<DriverGcashQrStatus | null>(cachedInitial);
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [gcashName, setGcashName] = useState(cachedInitial?.gcash_name || '');
  const [gcashNumber, setGcashNumber] = useState(cachedInitial?.gcash_number || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchStatus = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const res = await driverApi.getGcashQr();
      setQrStatus(res);
      setGcashName(res.gcash_name || '');
      setGcashNumber(res.gcash_number || '');
      setPickedImage(null);
      if (driverId) {
        saveCachedGcashStatus(driverId, res);
      }
      if (onUpdated) onUpdated(res);
    } catch {
      if (!qrStatus && !cachedInitial) {
        showToast('Could not load GCash settings.', 'info');
      }
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      const cached = initialStatus || (driverId ? getCachedGcashStatus(driverId) : null);
      if (cached) {
        setQrStatus(cached);
        setGcashName(cached.gcash_name || '');
        setGcashNumber(cached.gcash_number || '');
        setPickedImage(null);
        setLoading(false);
        fetchStatus(true); // silent background revalidation
      } else {
        fetchStatus(false);
      }
    }
  }, [visible]);

  const handlePickImage = async () => {
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
        setPickedImage(result.assets[0]);
      }
    } catch {
      showToast('Could not open photo library.', 'info');
    }
  };

  const hasQr = Boolean(qrStatus?.has_gcash_qr || qrStatus?.configured || qrStatus?.gcash_qr_url);

  const handleSave = async () => {
    if (!pickedImage && !hasQr) {
      showToast('Please select a GCash QR image to upload.', 'info');
      return;
    }

    setSaving(true);
    try {
      const file = pickedImage
        ? {
            uri: pickedImage.uri,
            name: pickedImage.fileName || `gcash-qr-${Date.now()}.jpg`,
            type: pickedImage.mimeType || 'image/jpeg',
          }
        : null;

      const res = await driverApi.uploadGcashQr(file, gcashName.trim(), gcashNumber.trim());
      showToast('GCash settings updated successfully.');
      const updatedStatus: DriverGcashQrStatus = (res as any)?.driver || res;
      setQrStatus(updatedStatus);
      setPickedImage(null);
      if (driverId) {
        saveCachedGcashStatus(driverId, updatedStatus);
      }
      if (onUpdated) onUpdated(updatedStatus);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not save GCash settings.', 'info');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    setSaving(true);
    try {
      await driverApi.removeGcashQr();
      showToast('GCash QR removed. Your rides are now Cash Only.');
      const updated: DriverGcashQrStatus = {
        has_gcash_qr: false,
        configured: false,
        gcash_qr_url: null,
        gcash_name: null,
        gcash_number: null,
      };
      setQrStatus(updated);
      setGcashName('');
      setGcashNumber('');
      setPickedImage(null);
      if (driverId) {
        saveCachedGcashStatus(driverId, updated);
      }
      if (onUpdated) onUpdated(updated);
      onClose();
    } catch (err: any) {
      showToast(err?.message || 'Could not remove GCash QR.', 'info');
    } finally {
      setSaving(false);
    }
  };

  const previewUri = pickedImage?.uri || qrStatus?.gcash_qr_url || null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <QrCode size={20} color={COLORS.primary} />
              <Text style={styles.title}>Driver GCash QR</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading GCash settings…</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <Text style={styles.instruction}>
                Upload your personal GCash QR so passengers can pay you directly via GCash. If not configured, rides with you are Cash Only.
              </Text>

              {/* QR Preview or Upload Box */}
              <View style={styles.qrSection}>
                {previewUri ? (
                  <View style={styles.qrPreviewContainer}>
                    <Image source={{ uri: previewUri }} style={styles.qrImage} resizeMode="contain" />
                    <View style={styles.qrActionsRow}>
                      <Button
                        label="Change QR"
                        variant="secondary"
                        size="md"
                        icon={Upload}
                        onPress={handlePickImage}
                        fullWidth={false}
                        style={styles.qrActionBtn}
                      />
                      {hasQr && (
                        <Button
                          label="Remove"
                          variant="dangerOutline"
                          size="md"
                          icon={Trash2}
                          onPress={() => setShowDeleteConfirm(true)}
                          fullWidth={false}
                          style={styles.qrActionBtn}
                        />
                      )}
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.uploadPlaceholder} onPress={handlePickImage} activeOpacity={0.7}>
                    <Upload size={32} color={COLORS.primary} />
                    <Text style={styles.uploadTitle}>Upload GCash QR</Text>
                    <Text style={styles.uploadSubtitle}>Tap to choose image from photo library</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Status info */}
              <View style={styles.statusRow}>
                {hasQr || pickedImage ? (
                  <>
                    <CheckCircle2 size={16} color={COLORS.success} />
                    <Text style={[styles.statusText, { color: COLORS.success }]}>
                      {pickedImage ? 'New QR selected — save to apply' : 'GCash QR active & accepting payments'}
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertCircle size={16} color={COLORS.textMuted} />
                    <Text style={[styles.statusText, { color: COLORS.textMuted }]}>
                      No QR uploaded — Cash Only mode
                    </Text>
                  </>
                )}
              </View>

              {/* Form fields */}
              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>GCash Account Name (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. Juan D."
                    placeholderTextColor={COLORS.textMuted}
                    value={gcashName}
                    onChangeText={setGcashName}
                    autoCapitalize="words"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>GCash Mobile Number (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. 09171234567"
                    placeholderTextColor={COLORS.textMuted}
                    value={gcashNumber}
                    onChangeText={setGcashNumber}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.footerBtns}>
                <Button
                  label={saving ? 'Saving…' : 'Save GCash Settings'}
                  onPress={handleSave}
                  loading={saving}
                  disabled={saving || (!pickedImage && !hasQr && !gcashName && !gcashNumber)}
                />
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>

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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...TYPOGRAPHY.h3,
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  loadingContainer: {
    padding: SPACING.xl * 2,
    alignItems: 'center',
    gap: SPACING.md,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },
  scrollContent: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  instruction: {
    ...TYPOGRAPHY.bodySmall,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  qrSection: {
    alignItems: 'center',
    marginVertical: SPACING.xs,
  },
  qrPreviewContainer: {
    alignItems: 'center',
    width: '100%',
    padding: SPACING.md,
    backgroundColor: COLORS.backgroundSubtle,
    borderRadius: RADIUS.lg,
    gap: SPACING.md,
  },
  qrImage: {
    width: 200,
    height: 200,
    borderRadius: RADIUS.md,
    backgroundColor: '#FFFFFF',
  },
  qrActionsRow: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.sm,
    justifyContent: 'center',
  },
  qrActionBtn: {
    flex: 1,
    paddingHorizontal: SPACING.xs,
  },
  uploadPlaceholder: {
    width: '100%',
    height: 180,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.borderLight,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundSubtle,
    gap: 6,
  },
  uploadTitle: {
    ...TYPOGRAPHY.h3,
    color: COLORS.primary,
  },
  uploadSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textMuted,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  form: {
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  footerBtns: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
});
