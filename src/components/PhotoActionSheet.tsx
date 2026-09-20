import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Camera, ImagePlus, Trash2 } from 'lucide-react-native';
import { COLORS, RADIUS, SHADOWS, SPACING, TYPOGRAPHY } from '../constants/theme';

interface PhotoActionSheetProps {
  visible: boolean;
  /** Shows "Remove Photo" only when there's an actual photo to remove. */
  hasPhoto: boolean;
  onClose: () => void;
  onTakePhoto: () => void;
  onChooseFromGallery: () => void;
  onRemovePhoto: () => void;
}

/**
 * Small bottom-sheet action menu for the profile picture — deliberately not `Alert.alert`, which
 * is a documented no-op on react-native-web, so this needs to be a real in-app sheet to work on
 * every platform (same lesson already learned from this app's GPS-watcher/Alert work).
 */
export default function PhotoActionSheet({
  visible,
  hasPhoto,
  onClose,
  onTakePhoto,
  onChooseFromGallery,
  onRemovePhoto,
}: PhotoActionSheetProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Profile Picture</Text>

          <TouchableOpacity style={styles.row} onPress={onTakePhoto} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <Camera size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.rowText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={onChooseFromGallery} activeOpacity={0.7}>
            <View style={styles.iconBox}>
              <ImagePlus size={18} color={COLORS.primary} />
            </View>
            <Text style={styles.rowText}>Choose from Gallery</Text>
          </TouchableOpacity>

          {hasPhoto && (
            <TouchableOpacity style={styles.row} onPress={onRemovePhoto} activeOpacity={0.7}>
              <View style={styles.iconBox}>
                <Trash2 size={18} color={COLORS.dangerDark} />
              </View>
              <Text style={[styles.rowText, styles.removeText]}>Remove Photo</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    ...SHADOWS.sheet,
  },
  title: {
    ...TYPOGRAPHY.label,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.backgroundSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  removeText: {
    color: COLORS.dangerDark,
  },
  cancelBtn: {
    marginTop: SPACING.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    ...TYPOGRAPHY.body,
    fontWeight: '800',
    color: COLORS.textSecondary,
  },
});
