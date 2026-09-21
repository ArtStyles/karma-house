import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Listing } from '../domain/listings';
import { colors } from '../theme';
import { Icon } from './ui';
import { useEffect, useState } from 'react';

export function PropertyImage({ listing, style, photoIndex = 0 }: { listing: Pick<Listing, 'photoUri' | 'imageKey' | 'title' | 'owner' | 'photos'>; style?: StyleProp<ViewStyle>; photoIndex?: number }) {
  const [failed, setFailed] = useState(false);
  const uri = listing.photos?.[photoIndex]?.uri || (photoIndex === 0 ? listing.photoUri : undefined);
  useEffect(() => setFailed(false), [uri, listing.imageKey, listing.owner]);
  const source = uri ? { uri } : listing.owner === 'remote' ? null : listing.imageKey === 'interior' ? require('../../assets/images/interior-demo.png') : require('../../assets/images/vedado-demo.png');
  return <View style={[styles.container, style]}>{failed || !source ? <View style={styles.placeholder} accessibilityLabel={failed ? 'No se pudo cargar la fotografía' : 'Sin fotografía disponible'}><Icon name="image-outline" size={32} color={colors.muted} /><Text style={styles.placeholderText}>{failed ? 'Foto no disponible' : 'Sin fotografía'}</Text></View> : <Image key={uri || listing.imageKey} source={source} accessibilityLabel={`${listing.title}${listing.photos && listing.photos.length > 1 ? `, foto ${photoIndex + 1}` : ''}`} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />}</View>;
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#E5E9E3', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  placeholder: { alignItems: 'center', gap: 7, padding: 4 }, placeholderText: { fontSize: 11, textAlign: 'center', color: colors.muted },
});
