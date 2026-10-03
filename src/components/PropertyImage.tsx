import { Image, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Listing } from '../domain/listings';
import { useDataSaverState } from '../settings/useDataSaver';
import { colors } from '../theme';
import { Icon } from './ui';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Photos revealed under «Ahorro de datos» stay revealed for the session, on every screen that shows them.
const revealed = new Set<string>();
const listeners = new Set<() => void>();
function reveal(key: string) {
  if (revealed.has(key)) return;
  revealed.add(key);
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/**
 * `thumb` prefers the small cover copy lists need; either variant falls back to the other when only one was signed.
 * Under «Ahorro de datos» the photo waits for a tap unless `eager` (the detail's selected photo); `onReveal` runs after that tap.
 */
export function PropertyImage({ listing, style, photoIndex = 0, variant = 'full', eager = false, onReveal }: {
  listing: Pick<Listing, 'id' | 'photoUri' | 'imageKey' | 'title' | 'owner' | 'photos' | 'coverThumb'>; style?: StyleProp<ViewStyle>; photoIndex?: number; variant?: 'thumb' | 'full'; eager?: boolean; onReveal?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const full = listing.photos?.[photoIndex]?.uri || (photoIndex === 0 ? listing.photoUri : undefined);
  const thumb = photoIndex === 0 ? listing.coverThumb?.uri : undefined;
  const uri = variant === 'thumb' ? thumb || full : full || thumb;
  useEffect(() => setFailed(false), [uri, listing.imageKey, listing.owner]);
  const source = uri ? { uri } : listing.owner === 'remote' ? null : listing.imageKey === 'interior' ? require('../../assets/images/interior-demo.png') : require('../../assets/images/vedado-demo.png');
  const key = uri || `${listing.id}:${listing.imageKey}`;
  const { enabled: dataSaver, ready } = useDataSaverState();
  const shown = useSyncExternalStore(subscribe, () => revealed.has(key), () => revealed.has(key));
  useEffect(() => { if (dataSaver && eager && source) reveal(key); }, [dataSaver, eager, key, !!source]);
  const waiting = !!source && (!ready || (dataSaver && !shown && !eager));
  return <View style={[styles.container, style]}>{waiting
    // Cards, thumbnails and the map card already render as a <button> on the web, which cannot nest another.
    ? <Pressable accessibilityRole={Platform.OS === 'web' ? undefined : 'button'} accessibilityLabel={`Ver la foto de ${listing.title}`}
      onPress={(event) => { event.stopPropagation(); reveal(key); onReveal?.(); }} style={({ pressed }) => [styles.tap, pressed && { opacity: .7 }]}>
      <Icon name="image-outline" size={28} color={colors.muted} /><Text style={styles.placeholderText}>Tocar para ver la foto</Text>
    </Pressable>
    : failed || !source ? <View style={styles.placeholder} accessibilityLabel={failed ? 'No se pudo cargar la fotografía' : 'Sin fotografía disponible'}><Icon name="image-outline" size={32} color={colors.muted} /><Text style={styles.placeholderText}>{failed ? 'Foto no disponible' : 'Sin fotografía'}</Text></View> : <Image key={uri || listing.imageKey} source={source} accessibilityLabel={`${listing.title}${listing.photos && listing.photos.length > 1 ? `, foto ${photoIndex + 1}` : ''}`} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />}</View>;
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#E5E9E3', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 7, padding: 4 }, placeholderText: { fontSize: 11, textAlign: 'center', color: colors.muted },
  tap: { alignSelf: 'stretch', flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 4 },
});
