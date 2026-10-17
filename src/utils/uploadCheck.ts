import type { ImagePickerAsset } from 'expo-image-picker';

// Mirrors the server's upload rules (Laravel App\Services\SecureUpload plus each endpoint's size
// limit), so an unsupported or oversized photo is caught before it uses the driver's mobile data.
// The server still validates and re-encodes every upload.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** A user-facing problem with the picked photo, or null when it can be uploaded. */
export function checkPickedPhoto(asset: ImagePickerAsset, maxMb = 5): string | null {
  const type = (asset.mimeType || '').toLowerCase();
  if (type && !ACCEPTED_TYPES.includes(type)) {
    return 'Please choose a JPG or PNG photo.';
  }
  if (asset.fileSize && asset.fileSize > maxMb * 1024 * 1024) {
    return `This photo is larger than ${maxMb} MB. Please choose a smaller one.`;
  }
  return null;
}

/** Generated upload name, so the device's own file name never leaves the phone. */
export function uploadFileFor(asset: ImagePickerAsset, prefix: string) {
  const type = asset.mimeType || 'image/jpeg';
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  return { uri: asset.uri, name: `${prefix}-${Date.now()}.${extension}`, type };
}
