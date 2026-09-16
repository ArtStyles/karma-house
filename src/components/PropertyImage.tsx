import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Listing } from '../domain/listings';
import { colors } from '../theme';
import { Icon } from './ui';
import { useEffect, useState } from 'react';

export function PropertyImage({ listing, style }: { listing: Pick<Listing, 'photoUri' | 'imageKey' | 'title'>; style?: StyleProp<ViewStyle> }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [listing.photoUri, listing.imageKey]);
  const source = listing.photoUri ? { uri: listing.photoUri } : listing.imageKey === 'interior' ? require('../../assets/images/interior-demo.png') : require('../../assets/images/vedado-demo.png');
  return <View style={[styles.container, style]}>{failed ? <Icon name="image-outline" size={38} color={colors.muted} /> : <Image key={listing.photoUri || listing.imageKey} source={source} accessibilityLabel={listing.title} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />}</View>;
}
const styles = StyleSheet.create({
  container: { backgroundColor: '#E5E9E3', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});
