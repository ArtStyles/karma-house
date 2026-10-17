import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Listing } from '../domain/listings';
import { createThemedStyles, rounded, typography } from '../theme';
import { PropertyImage } from './PropertyImage';
import { IconButton } from './ui';

/** Every photo of a home at full size: the whole photo on photo-ground, arrows and thumbnails to move between them. */
export function PhotoGallery({ listing, count, index, onIndex, visible, onClose }: {
  listing: Listing; count: number; index: number; onIndex(index: number): void; visible: boolean; onClose(): void;
}) {
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const go = (delta: number) => onIndex((index + delta + count) % count);
  return <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <View accessibilityViewIsModal style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <IconButton name="close" label="Cerrar fotos" onPress={onClose} />
        <Text accessibilityLiveRegion="polite" style={styles.count}>{index + 1} / {count}</Text>
        <View style={styles.spacer} />
      </View>
      <View style={styles.stage}>
        <PropertyImage listing={listing} photoIndex={index} eager fit="contain" style={styles.photo} />
        {count > 1 && <>
          <IconButton name="chevron-back" label="Foto anterior" onPress={() => go(-1)} color={colors.onDark} style={[styles.arrow, styles.previous]} />
          <IconButton name="chevron-forward" label="Foto siguiente" onPress={() => go(1)} color={colors.onDark} style={[styles.arrow, styles.next]} />
        </>}
      </View>
      {count > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbsRow} contentContainerStyle={styles.thumbs}>
        {Array.from({ length: count }, (_, position) => <Pressable key={position} accessibilityRole="button" accessibilityLabel={`Ver foto ${position + 1} de ${count}`}
          accessibilityState={{ selected: position === index }} onPress={() => onIndex(position)} style={[styles.thumb, position === index && styles.thumbOn]}>
          <PropertyImage listing={listing} photoIndex={position} onReveal={() => onIndex(position)} style={styles.fill} />
        </Pressable>)}
      </ScrollView>}
    </View>
  </Modal>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.photoGround, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  count: { ...typography.cardTitle, color: colors.ink, fontVariant: ['tabular-nums'] }, spacer: { width: 44 },
  stage: { flex: 1, justifyContent: 'center' },
  photo: { width: '100%', height: '100%', backgroundColor: colors.photoGround },
  arrow: { position: 'absolute', top: '50%', marginTop: -22, backgroundColor: colors.photoOverlay }, previous: { left: 12 }, next: { right: 12 },
  thumbsRow: { flexGrow: 0 }, thumbs: { gap: 8, paddingHorizontal: 16 },
  thumb: { width: 62, height: 62, borderRadius: rounded.thumb, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', opacity: .65 },
  thumbOn: { borderColor: colors.sol, opacity: 1 },
  fill: { width: '100%', height: '100%' },
}));
