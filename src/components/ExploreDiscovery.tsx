import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import type { Listing } from '../domain/listings';
import { cartelLabel, listingFacts, priceSuffix } from '../domain/operations';
import { useReducedMotion } from '../settings/useReducedMotion';
import { createThemedStyles, formatMoney, rounded, typography } from '../theme';
import { ArchImage } from './ArchImage';
import { Cartel } from './Cartel';
import { MotionPressable } from './MotionPressable';
import { PropertyImage } from './PropertyImage';

const ease = Easing.bezier(.22, 1, .36, 1);

/**
 * The arch carousel that opens Explorar: the first homes of the search, the centre one large and lit,
 * its neighbours dimmed at the edges. A swipe, a tap on a neighbour or a dot moves it; only the centre opens a home.
 */
export function ExploreDiscovery({ listings, onOpen }: { listings: readonly Listing[]; onOpen(listing: Listing): void }) {
  const { styles } = useStyles();
  const reduced = useReducedMotion();
  const [viewport, setViewport] = useState(358);
  const [index, setIndex] = useState(0);
  const count = listings.length;
  const step = useRef((_delta: number) => {});
  step.current = delta => setIndex(current => (current + delta + count) % count);
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderRelease: (_event, gesture) => { if (Math.abs(gesture.dx) > 40) step.current(gesture.dx < 0 ? 1 : -1); },
  })).current;
  if (!count) return null;
  const current = listings[Math.min(index, count - 1)];
  const at = (delta: number) => listings[(index + delta + count) % count];
  const archWidth = Math.min(240, Math.round(viewport * .62)), archHeight = Math.round(archWidth * 1.55);
  const sideWidth = Math.round(archWidth * .79), sideHeight = Math.round(sideWidth * 1.53);
  const centreLeft = Math.round((viewport - archWidth) / 2);
  // How much of each neighbour shows beside the centre arch.
  const peek = centreLeft - 17;
  const side = (delta: -1 | 1) => {
    const listing = at(delta);
    return <MotionPressable key={delta} accessibilityRole="button" accessibilityLabel={`${delta < 0 ? 'Anterior' : 'Siguiente'}: ${listing.title}`} onPress={() => step.current(delta)}
      style={[styles.side, { top: 8 + archHeight - sideHeight - 30, width: sideWidth }, delta < 0 ? { left: peek - sideWidth } : { left: viewport - peek }]}>
      <ArchImage width={sideWidth} height={sideHeight} bottom={22}><PropertyImage listing={listing} variant="thumb" style={styles.fill} /></ArchImage>
    </MotionPressable>;
  };
  return <View>
    <View {...pan.panHandlers} onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0) setViewport(next); }} style={[styles.stage, { height: archHeight + 22 }]}>
      {count > 1 && peek > 24 && [side(-1), side(1)]}
      <View style={{ position: 'absolute', top: 8, left: centreLeft, width: archWidth }}>
        <View pointerEvents="none" style={[styles.ring, { width: archWidth + 14, height: archHeight + 14, borderTopLeftRadius: (archWidth + 14) / 2, borderTopRightRadius: (archWidth + 14) / 2 }]} />
        <Animated.View key={current.id} entering={FadeIn.duration(reduced ? 120 : 320).easing(ease)}>
          <MotionPressable accessibilityRole="button" accessibilityLabel={`Ver ${current.title}, ${cartelLabel(current)}, ${formatMoney(current.price)} USD${priceSuffix(current)}, ${current.location}`} onPress={() => onOpen(current)}>
            <ArchImage width={archWidth} height={archHeight} bottom={28} glow>
              <PropertyImage listing={current} variant="thumb" style={styles.fill} />
              <View pointerEvents="none" style={styles.info}>
                <Text numberOfLines={2} style={styles.title}>{current.title}</Text>
                <Text numberOfLines={1} style={styles.place}>{current.location}, {current.province}</Text>
                <View style={styles.priceRow}>
                  <Text numberOfLines={1} style={styles.price}>{formatMoney(current.price)}<Text style={styles.small}> USD{priceSuffix(current)}</Text></Text>
                  <Text numberOfLines={1} style={styles.small}>{listingFacts(current)}</Text>
                </View>
              </View>
            </ArchImage>
          </MotionPressable>
        </Animated.View>
        <View pointerEvents="none" style={[styles.sign, { top: Math.round(archHeight * .38) }]}><Cartel label={cartelLabel(current)} tilt={-4} /></View>
      </View>
    </View>
    {count > 1 && <View style={styles.dots}>{listings.map((listing, position) => <MotionPressable key={listing.id} accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}`}
      accessibilityState={{ selected: position === index }} onPress={() => setIndex(position)} style={styles.dotTarget}>
      <View style={[styles.dot, position === index && styles.currentDot]} />
    </MotionPressable>)}</View>}
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  // Bleeds over the list's 16 px gutter so on a phone the neighbours reach the screen edges.
  stage: { marginHorizontal: -16, overflow: 'hidden' },
  side: { position: 'absolute', opacity: .42 },
  fill: { width: '100%', height: '100%' },
  ring: { position: 'absolute', left: -7, top: -7, borderBottomLeftRadius: 34, borderBottomRightRadius: 34, borderWidth: 1, borderColor: colors.outline },
  info: { position: 'absolute', left: 10, right: 10, bottom: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: rounded.inner, backgroundColor: colors.photoOverlay },
  title: { ...typography.section, color: colors.onDark },
  place: { marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.onDark, opacity: .82 },
  priceRow: { marginTop: 8, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  price: { flexShrink: 0, fontSize: 17, lineHeight: 22, fontWeight: '700', color: colors.onDark, fontVariant: ['tabular-nums'] },
  small: { flexShrink: 1, fontSize: 12, fontWeight: '500', color: colors.onDark, opacity: .82 },
  sign: { position: 'absolute', left: -16 },
  dots: { flexDirection: 'row', justifyContent: 'center' },
  dotTarget: { height: 44, minWidth: 30, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.outline },
  currentDot: { width: 22, backgroundColor: colors.sol },
}));
