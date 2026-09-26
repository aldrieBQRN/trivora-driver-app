import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, RADIUS, SPACING, TYPOGRAPHY } from '../constants/theme';
import { Camera, XCircle, AlertCircle } from 'lucide-react-native';
import Button from './Button';

export interface ProofPhoto {
  uri: string;
  name: string;
  type: string;
}

interface AppealFormFieldsProps {
  onSubmit: (reason: string, proof?: ProofPhoto) => Promise<void>;
}

const MIN_REASON_LENGTH = 10;

/**
 * The interactive appeal controls — reason input + optional evidence photo taken with the device
 * camera (gallery/file selection is deliberately unavailable) — embedded directly inside
 * ViolationDetailModal's own scroll content, not presented as a separate modal. No outer
 * Modal/header/violation-reference chrome here; the violation itself is already fully visible
 * above wherever this is rendered.
 */
export default function AppealFormFields({ onSubmit }: AppealFormFieldsProps) {
  const [reason, setReason] = useState('');
  const [photo, setPhoto] = useState<ProofPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyAsset = (asset: ImagePicker.ImagePickerAsset) => {
    setPhoto({
      uri: asset.uri,
      name: asset.fileName || `evidence-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    });
  };

  const handleTakePhoto = async () => {
    setError(null);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(
          "Camera access is needed to take an evidence photo. Enable camera permission for Trivora in your phone's Settings, then try again."
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
      });
      if (result.canceled) return;
      applyAsset(result.assets[0]);
    } catch {
      setError('Could not open the camera. Please try again.');
    }
  };

  const trimmedLength = reason.trim().length;
  const isValid = trimmedLength >= MIN_REASON_LENGTH;
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(reason.trim(), photo || undefined);
    } catch (err: any) {
      setError(err?.message || 'Could not submit your appeal. Please check your connection and try again.');
      setIsSubmitting(false);
    }
    // No `finally` — on success the parent swaps this whole section out for the "Under Review"
    // panel, so there's nothing left here to un-set isSubmitting on.
  };

  return (
    <View>
      <Text style={styles.fieldLabel}>Reason / Explanation</Text>
      <TextInput
        style={styles.reasonInput}
        placeholder="Explain why this violation should be reconsidered..."
        placeholderTextColor={COLORS.textMuted}
        value={reason}
        onChangeText={setReason}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={2000}
        editable={!isSubmitting}
      />

      <View style={styles.counterRow}>
        {!isValid ? (
          <Text style={styles.helperText}>Minimum 10 characters required.</Text>
        ) : (
          <Text style={styles.validText}>Minimum met</Text>
        )}
        <Text style={[styles.counterText, isValid && styles.counterTextValid]}>
          {isValid ? `${trimmedLength} characters` : `${trimmedLength} / ${MIN_REASON_LENGTH} minimum`}
        </Text>
      </View>

      <Text style={styles.fieldLabel}>Evidence Photo (Optional)</Text>

      {photo ? (
        <View style={styles.photoPreviewBox}>
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
          <View style={styles.photoActionsRow}>
            <TouchableOpacity style={styles.photoActionBtn} onPress={handleTakePhoto} activeOpacity={0.7} disabled={isSubmitting}>
              <Camera size={13} color={COLORS.primary} />
              <Text style={styles.photoActionText}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoActionBtn} onPress={() => setPhoto(null)} activeOpacity={0.7} disabled={isSubmitting}>
              <XCircle size={13} color={COLORS.dangerDark} />
              <Text style={[styles.photoActionText, { color: COLORS.dangerDark }]}>Remove</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.photoHint}>This photo will be submitted as appeal evidence.</Text>
        </View>
      ) : (
        <View style={styles.photoPickerRow}>
          <TouchableOpacity style={styles.photoPickerBtn} onPress={handleTakePhoto} activeOpacity={0.7} disabled={isSubmitting}>
            <Camera size={15} color={COLORS.primary} />
            <Text style={styles.photoPickerText}>Take Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <AlertCircle size={14} color={COLORS.dangerDark} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Button
        label="Submit Appeal"
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={!canSubmit}
        style={styles.submitBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.textMuted,
    marginBottom: 8,
    marginTop: SPACING.sm,
  },
  reasonInput: {
    backgroundColor: COLORS.surfaceInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    minHeight: 90,
    ...TYPOGRAPHY.body,
    color: COLORS.textPrimary,
  },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  helperText: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
  },
  validText: {
    ...TYPOGRAPHY.micro,
    color: COLORS.success,
    fontWeight: '700',
  },
  counterText: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
    marginLeft: 'auto',
  },
  counterTextValid: {
    color: COLORS.textSecondary,
  },
  photoPickerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryTint,
  },
  photoPickerText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.primary,
  },
  photoPreviewBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
  },
  photoPreview: {
    width: '100%',
    height: 140,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.border,
  },
  photoActionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: SPACING.sm,
  },
  photoActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  photoActionText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '800',
    color: COLORS.primary,
  },
  photoHint: {
    ...TYPOGRAPHY.micro,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.dangerLight,
    borderRadius: RADIUS.md,
    padding: SPACING.sm + 2,
    marginTop: SPACING.md,
  },
  errorText: {
    flex: 1,
    ...TYPOGRAPHY.caption,
    color: COLORS.dangerDark,
    lineHeight: 16,
  },
  submitBtn: {
    marginTop: SPACING.md,
  },
});
