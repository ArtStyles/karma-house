import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { selectedAvatarAsset, validateAvatarUpload, type AvatarUpload } from './accountProfile';

export interface PreparedAvatar extends AvatarUpload { previewUri: string }

export async function pickAccountAvatar(checkpoint: () => void): Promise<PreparedAvatar | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1, allowsMultipleSelection: false });
  checkpoint();
  const asset = selectedAvatarAsset(result);
  if (!asset) return null;
  const edge = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  context.crop({ originX: Math.floor((asset.width - edge) / 2), originY: Math.floor((asset.height - edge) / 2), width: edge, height: edge });
  context.resize({ width: 512, height: 512 });
  const image = await context.renderAsync();
  checkpoint();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  checkpoint();
  let data: ArrayBuffer;
  if (Platform.OS === 'web') data = await (await fetch(saved.uri)).arrayBuffer();
  else { const { File } = await import('expo-file-system'); data = await new File(saved.uri).arrayBuffer(); }
  checkpoint();
  const prepared: PreparedAvatar = { data, contentType: 'image/jpeg', previewUri: saved.uri };
  validateAvatarUpload(prepared);
  return prepared;
}
