import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PhotoDraft } from '../domain/listings';
import { draftToken } from '../domain/draftPersistence';
import { choosePhotoCover, prepareCoverPhoto } from '../domain/photoCover';
import { createThemedStyles } from '../theme';
import { Button, IconButton } from './ui';

/** Copies a rendered file out of the cache folder so a saved draft still finds it after a restart. */
async function keepLocally(uri: string, name: string): Promise<string> {
  const { Directory, File, Paths } = await import('expo-file-system');
  const directory = new Directory(Paths.document, 'karmahouse', 'listing-photos');
  directory.create({ idempotent: true, intermediates: true });
  const destination = new File(directory, name);
  new File(uri).copy(destination);
  return destination.uri;
}

/** The catalogue card's copy of the cover: longest side 480 px. Best effort, the card falls back to the cover. */
async function coverThumb(source: string | ImageRef, name: string): Promise<string | undefined> {
  try {
    const image = typeof source === 'string' ? await ImageManipulator.manipulate(source).renderAsync() : source;
    const context = ImageManipulator.manipulate(image);
    if (Math.max(image.width, image.height) > 480) context.resize(image.width >= image.height ? { width: 480 } : { height: 480 });
    const thumb = await (await context.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: .6, base64: Platform.OS === 'web' });
    if (Platform.OS === 'web') return thumb.base64 ? `data:image/jpeg;base64,${thumb.base64}` : undefined;
    return await keepLocally(thumb.uri, `${name}_t.jpg`);
  } catch { return undefined; }
}

export function ListingPhotos({ photos, busy, disabled, required = false, onBusy, onChange, onError }: {
  photos: PhotoDraft[]; busy: boolean; disabled: boolean; required?: boolean; onBusy(value: boolean): void;
  onChange(photos: PhotoDraft[]): void; onError(message: string): void;
}) {
  const { styles } = useStyles();
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
        // Leave the other side out: the web resizer reads `null` as a zero height.
        if (Math.max(asset.width, asset.height) > 1600) context.resize(asset.width >= asset.height ? { width: 1600 } : { height: 1600 });
        const rendered = await context.renderAsync();
        const image = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: .72, base64: Platform.OS === 'web' });
        let uri = image.uri;
        if (Platform.OS === 'web') {
          if (!image.base64 || image.base64.length * .75 > 4 * 1024 * 1024) throw new Error('Esta foto es demasiado grande. Prueba con otra imagen.');
          uri = `data:image/jpeg;base64,${image.base64}`;
        } else {
          const { File } = await import('expo-file-system');
          if (new File(uri).size > 4 * 1024 * 1024) throw new Error('Esta foto debe ocupar menos de 4 MB.');
          uri = await keepLocally(uri, `${uploadId}.jpg`);
        }
        // Only the cover gets a thumbnail.
        const thumbUri = photos.length === 0 && additions.length === 0 ? await coverThumb(rendered, uploadId) : undefined;
        additions.push({ uri, uploadId, ...(thumbUri ? { thumbUri } : {}) });
      }
      onChange([...photos, ...additions]);
    } catch (error) { onError(error instanceof Error ? error.message : 'No pudimos preparar las fotos. Inténtalo otra vez.'); }
    finally { onBusy(false); }
  }
  async function setPreparedCover(next: PhotoDraft[]) {
    onBusy(true);
    try {
      const prepared = await prepareCoverPhoto(next[0], coverThumb, draftToken);
      onChange([prepared, ...next.slice(1)]);
    } catch (error) { onError(error instanceof Error ? error.message : 'No pudimos preparar la portada.'); }
    finally { onBusy(false); }
  }
  async function remove(index: number) {
    if (busy || disabled) return;
    const next = photos.filter((_, i) => i !== index);
    if (index !== 0 || !next[0] || next[0].thumbUri) { onChange(next); return; }
    await setPreparedCover(next);
  }
  async function chooseCover(index: number) {
    if (busy || disabled) return;
    const next = choosePhotoCover(photos, index);
    if (next === photos) return;
    if (next[0].thumbUri) { onChange(next); return; }
    await setPreparedCover(next);
  }
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.title}>Fotos de tu vivienda{required ? <Text style={styles.caption}> *</Text> : null}</Text>
    <Text style={styles.caption}>Hasta 6 fotos. Elige como portada una foto individual, nítida y representativa de la vivienda.</Text>
    <View style={styles.grid}>{photos.map((photo, index) => <View key={photo.uploadId ?? photo.storagePath ?? index} style={styles.tile}>
      <View style={styles.frame}>
        <Image source={{ uri: photo.uri }} style={styles.image} accessibilityLabel={`Foto ${index + 1}${index === 0 ? ', portada' : ''}`} />
        {!disabled && !busy && <IconButton name="close" label={`Quitar foto ${index + 1}`} onPress={() => void remove(index)} style={styles.remove} />}
        <Text style={styles.number}>{index === 0 ? 'Portada' : `${index + 1}`}</Text>
      </View>
      {index > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Usar foto ${index + 1} como portada`} accessibilityState={{ disabled: disabled || busy }} disabled={disabled || busy} onPress={() => void chooseCover(index)} style={({ pressed }) => [styles.coverChoice, pressed && { opacity: .7 }, (disabled || busy) && { opacity: .5 }]}><Text style={styles.coverChoiceText}>Usar como portada</Text></Pressable>}
    </View>)}</View>
    {photos.length < 6 && <Button label={photos.length ? 'Añadir fotos' : 'Elegir fotos'} secondary icon="images-outline" onPress={() => void pick()} loading={busy} disabled={disabled} />}
    <Text style={styles.caption}>Las fotos se optimizan para consumir menos datos.</Text>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  container: { gap: 12 }, title: { fontSize: 17, fontWeight: '600', color: colors.ink }, caption: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: '2%', rowGap: 10 }, tile: { width: '49%', borderRadius: 14, overflow: 'hidden', backgroundColor: colors.paper }, frame: { aspectRatio: 1.35 },
  coverChoice: { minHeight: 44, justifyContent: 'center', alignItems: 'center', padding: 8, backgroundColor: colors.softBlue }, coverChoiceText: { fontSize: 12, color: colors.primary, fontWeight: '600', textAlign: 'center' },
  image: { width: '100%', height: '100%' }, remove: { position: 'absolute', right: 4, top: 4, backgroundColor: colors.surface },
  number: { position: 'absolute', left: 8, bottom: 8, backgroundColor: colors.navigationGlass, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, fontSize: 12, color: colors.ink },
}));
