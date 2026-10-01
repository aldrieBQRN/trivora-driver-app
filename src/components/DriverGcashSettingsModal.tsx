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
import { useToast } from './Toast';
import { driverApi } from '../services/api';
import { DriverGcashQrStatus } from '../types';

interface DriverGcashSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdated?: (status: DriverGcashQrStatus) => void;
}

export default function DriverGcashSettingsModal({
  visible,
  onClose,
  onUpdated,
}: DriverGcashSettingsModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [qrStatus, setQrStatus] = useState<DriverGcashQrStatus | null>(null);
  const [pickedImage, setPickedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [gcashName, setGcashName] = useState('');
  const [gcashNumber, setGcashNumber] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await driverApi.getGcashQr();
      setQrStatus(res);
      setGcashName(res.gcash_name || '');
      setGcashNumber(res.gcash_number || '');
      setPickedImage(null);
      if (onUpdated) onUpdated(res);
    } catch {
      showToast('Could not load GCash settings.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      fetchStatus();
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
                      />
                      {hasQr && (
                        <Button
                          label="Remove"
                          variant="dangerOutline"
                          size="md"
                          icon={Trash2}
                          onPress={() => setShowDeleteConfirm(true)}
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
    gap: SPACING.sm,
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
