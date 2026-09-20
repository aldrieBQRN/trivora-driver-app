import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { COLORS } from '../constants/theme';
import Avatar, { AvatarTone } from './Avatar';
import PhotoActionSheet from './PhotoActionSheet';
import { driverApi } from '../services/api';
import { useToast } from './Toast';

interface EditableAvatarProps {
  name: string;
  imageUri?: string | null;
  size?: number;
  tone?: AvatarTone;
  /** Called with the new photo URL after a successful upload, or null after a successful
   * removal — the caller owns updating its own profile state (e.g. DriverAuthContext.updateProfile). */
  onPhotoChanged: (url: string | null) => void;
}

/**
 * The one place profile-photo upload/replace/remove actually happens for the Driver app — a thin
 * wrapper around the existing Avatar component (unchanged default design) plus a small edit badge
 * and the upload flow. Feedback goes through the same Toast used by the Passenger app (ported
 * here) rather than inline text, which pushed the surrounding header layout around whenever an
 * error appeared.
 */
export default function EditableAvatar({
  name,
  imageUri,
  size = 60,
  tone = 'passenger',
  onPhotoChanged,
}: EditableAvatarProps) {
  const { showToast } = useToast();
  const [showSheet, setShowSheet] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const applyAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setIsUploading(true);
    try {
      const res: any = await driverApi.uploadProfilePhoto({
        uri: asset.uri,
        name: asset.fileName || `avatar-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      onPhotoChanged(res?.profile_photo_url ?? null);
      showToast('Profile picture updated.');
    } catch (err: any) {
      showToast(err?.message || 'Could not upload your photo. Please try again.', 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    setShowSheet(false);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        showToast('Camera access is needed to take a profile picture.', 'info');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [1, 1] });
      if (result.canceled) return;
      await applyAsset(result.assets[0]);
    } catch {
      showToast('Could not open the camera. Please try again.', 'info');
    }
  };

  const handleChooseFromGallery = async () => {
    setShowSheet(false);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast('Photo library access is needed to choose a profile picture.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (result.canceled) return;
      await applyAsset(result.assets[0]);
    } catch {
      showToast('Could not open your photo library. Please try again.', 'info');
    }
  };

  const handleRemovePhoto = async () => {
    setShowSheet(false);
    setIsUploading(true);
    try {
      await driverApi.removeProfilePhoto();
      onPhotoChanged(null);
      showToast('Profile picture removed.');
    } catch (err: any) {
      showToast(err?.message || 'Could not remove your photo. Please try again.', 'info');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={{ width: size, height: size }}>
      <TouchableOpacity
        onPress={() => setShowSheet(true)}
        activeOpacity={0.8}
        accessibilityLabel="Change profile picture"
        disabled={isUploading}
      >
        <Avatar name={name} size={size} tone={tone} imageUri={imageUri} />
        <View style={styles.editBadge}>
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Camera size={12} color="#FFFFFF" />
          )}
        </View>
      </TouchableOpacity>

      <PhotoActionSheet
        visible={showSheet}
        hasPhoto={!!imageUri}
        onClose={() => setShowSheet(false)}
        onTakePhoto={handleTakePhoto}
        onChooseFromGallery={handleChooseFromGallery}
        onRemovePhoto={handleRemovePhoto}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  editBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.background,
  },
});
