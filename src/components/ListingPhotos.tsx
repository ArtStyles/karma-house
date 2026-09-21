import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import type { PhotoDraft } from '../domain/listings';
import { draftToken } from '../domain/draftPersistence';
import { colors } from '../theme';
import { Button, IconButton } from './ui';

export function ListingPhotos({ photos, busy, disabled, onBusy, onChange, onError }: {
  photos: PhotoDraft[]; busy: boolean; disabled: boolean; onBusy(value: boolean): void;
  onChange(photos: PhotoDraft[]): void; onError(message: string): void;
}) {
  async function pick() {
    if (busy || disabled || photos.length >= 6) return;
    onBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 6 - photos.length, quality: 1 });
      if (result.canceled) return;
      const additions: PhotoDraft[] = [];
      for (const asset of result.assets.slice(0, 6 - photos.length)) {
        const uploadId = draftToken();
        const context = ImageManipulator.manipulate(asset.uri);
        if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600, height: null } : { height: 1600, width: null });
        const rendered = await context.renderAsync();
        const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: .72, base64: Platform.OS === 'web' });
        let uri = image.uri;
        if (Platform.OS === 'web') {
          if (!image.base64 || image.base64.length * .75 > 4 * 1024 * 1024) throw new Error('Esta foto es demasiado grande. Prueba con otra imagen.');
          uri = `data:image/jpeg;base64,${image.base64}`;
        } else {
          const { Directory, File, Paths } = await import('expo-file-system');
          const source = new File(uri);
          if (source.size > 4 * 1024 * 1024) throw new Error('Esta foto debe ocupar menos de 4 MB.');
          const directory = new Directory(Paths.document, 'karmahouse', 'listing-photos');
          directory.create({ idempotent: true, intermediates: true });
          const destination = new File(directory, `${uploadId}.jpg`);
          source.copy(destination);
          uri = destination.uri;
        }
        additions.push({ uri, uploadId });
      }
      onChange([...photos, ...additions]);
    } catch (error) { onError(error instanceof Error ? error.message : 'No pudimos preparar las fotos. Inténtalo otra vez.'); }
    finally { onBusy(false); }
  }
  return <View style={styles.container}>
    <Text style={styles.title}>Fotos de tu vivienda</Text>
    <Text style={styles.caption}>Hasta 6 fotos. La primera será la portada.</Text>
    <View style={styles.grid}>{photos.map((photo, index) => <View key={photo.uploadId ?? photo.storagePath ?? index} style={styles.tile}>
      <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Foto ${index + 1}`} />
      {!disabled && !busy && <IconButton name="close" label={`Quitar foto ${index + 1}`} onPress={() => onChange(photos.filter((_, i) => i !== index))} style={styles.remove} />}
      <Text style={styles.number}>{index === 0 ? 'Portada' : `${index + 1}`}</Text>
    </View>)}</View>
    {photos.length < 6 && <Button label={photos.length ? 'Añadir fotos' : 'Elegir fotos'} secondary icon="images-outline" onPress={() => void pick()} loading={busy} disabled={disabled} />}
    <Text style={styles.caption}>Las fotos se optimizan para consumir menos datos.</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 12 }, title: { fontSize: 17, fontWeight: '600', color: colors.ink }, caption: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 10 }, tile: { width: '49%', aspectRatio: 1.35, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.paper },
  image: { width: '100%', height: '100%' }, remove: { position: 'absolute', right: 4, top: 4, backgroundColor: colors.white },
  number: { position: 'absolute', left: 8, bottom: 8, backgroundColor: '#FFFFFFEE', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, fontSize: 12, color: colors.ink },
});
