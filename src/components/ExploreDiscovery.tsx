import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { createThemedStyles } from '../theme';
import { Icon, type IconName } from './ui';

type DiscoveryOperation = 'sale' | 'rent' | 'swap';
const cards: { title: string; description: string; action: string; icon: IconName; accent: IconName; operation?: DiscoveryOperation }[] = [
  { title: 'Un hogar para ti', description: 'Viviendas en venta', action: 'Comprar', icon: 'home-outline', accent: 'key-outline', operation: 'sale' },
  { title: 'Vive a tu manera', description: 'Opciones de alquiler', action: 'Alquilar', icon: 'log-in-outline', accent: 'key-outline', operation: 'rent' },
  { title: 'Cambia de hogar', description: 'Descubre permutas', action: 'Permutar', icon: 'home-outline', accent: 'swap-horizontal-outline', operation: 'swap' },
  { title: 'Tu vivienda, aquí', description: 'Dale su próximo capítulo', action: 'Publicar anuncio', icon: 'document-text-outline', accent: 'camera-outline' },
];

/** Scrolling discovers options; only a deliberate press changes the search. */
export function ExploreDiscovery({ offline, onOperation, onPublish }: {
  offline: boolean; onOperation(operation: DiscoveryOperation): void; onPublish(): void;
}) {
  const { colors, styles } = useStyles();
  const { width } = useWindowDimensions();
  const [viewport, setViewport] = useState(Math.min(640, width - 40));
  const [page, setPage] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const cardWidth = Math.max(1, viewport - 24);
  const interval = cardWidth + 10;
  const narrow = viewport < 320;
  // Rotation and desktop breakpoints keep the same option at the front.
  useEffect(() => { scroll.current?.scrollTo({ x: page * interval, animated: false }); }, [interval]);
  return <View style={styles.root} onLayout={event => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) setViewport(next);
  }}>
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false}
      directionalLockEnabled nestedScrollEnabled keyboardShouldPersistTaps="handled"
      pagingEnabled={Platform.OS === 'web'}
      snapToInterval={interval} snapToAlignment="start" decelerationRate="fast"
      contentContainerStyle={styles.track} scrollEventThrottle={32}
      onScroll={event => setPage(Math.max(0, Math.min(cards.length - 1, Math.round(event.nativeEvent.contentOffset.x / interval))))}>
      {cards.map(card => {
        const disabled = offline && !!card.operation;
        return <Pressable key={card.action} accessibilityRole="button"
          accessibilityLabel={`${card.action}: ${card.title}`}
          accessibilityHint={card.operation ? 'Selecciona esta operación para tu búsqueda' : 'Abre el formulario para publicar una vivienda'}
          accessibilityState={{ disabled }} disabled={disabled}
          onPress={() => card.operation ? onOperation(card.operation) : onPublish()}
          style={({ pressed }) => [styles.card, { width: cardWidth }, narrow && styles.narrowCard, disabled && { opacity: .45 }, pressed && { opacity: .7 }]}>
          <View pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.scene, narrow && styles.narrowScene]}>
            <View style={styles.halo} />
            <Icon name={card.icon} size={34} color={colors.primary} />
            <View style={styles.accent}><Icon name={card.accent} size={19} color={colors.primary} /></View>
          </View>
          <View style={styles.copy}>
            <Text style={[styles.title, narrow && styles.narrowTitle]}>{card.title}</Text>
            <Text style={styles.description}>{card.description}</Text>
            <Text style={styles.action}>{card.action}</Text>
          </View>
          <View style={styles.arrow}><Icon name="arrow-up-outline" size={14} color={colors.primary} /></View>
        </Pressable>;
      })}
    </ScrollView>
    <View accessible accessibilityLabel={`Tarjeta ${page + 1} de ${cards.length}: ${cards[page].action}`} style={styles.status}>
      <View style={styles.dots}>{cards.map(card => <View key={card.action} style={[styles.dot, cards[page] === card && styles.currentDot]} />)}</View>
      <View style={styles.cue}><Text style={styles.cueText}>Desliza</Text><Icon name="arrow-back" size={12} color={colors.muted} /></View>
    </View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  root: { marginBottom: 2 },
  track: { gap: 10, paddingRight: 24 },
  card: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 16 },
  narrowCard: { gap: 7 },
  scene: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' }, narrowScene: { width: 50 },
  halo: { position: 'absolute', width: 52, height: 48, borderRadius: 20, backgroundColor: colors.softBlue, transform: [{ rotate: '-10deg' }] },
  accent: { position: 'absolute', right: 0, bottom: 3, padding: 2, borderRadius: 8, backgroundColor: colors.paper },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  arrow: { transform: [{ rotate: '45deg' }] },
  title: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '500' }, narrowTitle: { fontSize: 14, lineHeight: 20 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  action: { color: colors.primary, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  status: { minHeight: 18, marginTop: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.border },
  currentDot: { width: 14, backgroundColor: colors.primary },
  cue: { flexDirection: 'row', alignItems: 'center', gap: 5 }, cueText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
}));
