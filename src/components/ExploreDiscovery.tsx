import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { Listing } from '../domain/listings';
import { cartelLabel, listingFacts, priceSuffix } from '../domain/operations';
import { useReducedMotion } from '../settings/useReducedMotion';
import { createThemedStyles, formatMoney, rounded, typography } from '../theme';
import { ArchImage } from './ArchImage';
import { Cartel } from './Cartel';
import { MotionPressable } from './MotionPressable';
import { PropertyImage } from './PropertyImage';

const ease = Easing.bezier(.22, 1, .36, 1);
// A neighbour is the centre arch at this scale, lifted so it rests 30 px above the centre's foot.
const SIDE = .79;

/** Signed distance from `from` to slide `to` on a ring of `count`, in [-count/2, count/2). */
function offset(to: number, from: number, count: number) {
  'worklet';
  return ((((to - from) % count) + count + count / 2) % count) - count / 2;
}

/**
 * The arch carousel that opens Explorar: the first homes of the search, the centre one large and lit,
 * its neighbours dimmed at the edges. The strip follows the finger and settles on the nearest home;
 * a tap on a neighbour or a dot slides it there. Only the centre opens a home.
 */
export function ExploreDiscovery({ listings, onOpen }: { listings: readonly Listing[]; onOpen(listing: Listing): void }) {
  const { styles } = useStyles();
  const reduced = useReducedMotion();
  const [viewport, setViewport] = useState(358);
  const [index, setIndex] = useState(0);
  const count = listings.length;
  // Where the strip stands, in slides: whole at rest, fractional under the finger. It never wraps, so a slide never jumps.
  const position = useSharedValue(0);
  const start = useRef(0);
  const archWidth = Math.min(240, Math.round(viewport * .62)), archHeight = Math.round(archWidth * 1.55);
  const centreLeft = Math.round((viewport - archWidth) / 2);
  const spacing = archWidth / 2 + 17 + Math.round(archWidth * SIDE) / 2;
  const spacingRef = useRef(spacing);
  spacingRef.current = spacing;
  const settle = useRef((_target: number) => {});
  // Reduced motion keeps the slide, which the person started, and only shortens it.
  settle.current = target => {
    position.value = withTiming(target, { duration: reduced ? 160 : 360, easing: ease, reduceMotion: ReduceMotion.Never }, finished => {
      if (finished) scheduleOnRN(setIndex, ((target % count) + count) % count);
    });
  };
  const goTo = (slide: number) => {
    const here = Math.round(position.value);
    settle.current(here + offset(slide, here, count));
  };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
    onPanResponderGrant: () => { cancelAnimation(position); start.current = position.value; },
    onPanResponderMove: (_event, gesture) => { position.value = start.current - gesture.dx / spacingRef.current; },
    onPanResponderRelease: (_event, gesture) => {
      const flick = Math.abs(gesture.vx) > .3 || Math.abs(gesture.dx) > spacingRef.current * .25;
      settle.current(Math.round(start.current) + (flick ? (gesture.dx < 0 ? 1 : -1) : 0));
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => settle.current(Math.round(start.current)),
  })).current;
  if (!count) return null;
  return <View>
    <View {...pan.panHandlers} onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0) setViewport(next); }} style={[styles.stage, { height: archHeight + 22 }]}>
      <View pointerEvents="none" style={[styles.ring, { top: 1, left: centreLeft - 7, width: archWidth + 14, height: archHeight + 14, borderTopLeftRadius: (archWidth + 14) / 2, borderTopRightRadius: (archWidth + 14) / 2 }]} />
      {listings.map((listing, slide) => {
        const place = offset(slide, index, count);
        return <Slide key={listing.id} listing={listing} slide={slide} count={count} position={position} place={place}
          frame={{ left: centreLeft, width: archWidth, height: archHeight, spacing }}
          onPress={() => place === 0 ? onOpen(listing) : goTo(slide)} />;
      })}
    </View>
    {count > 1 && <View style={styles.dots}>{listings.map((listing, slide) => <MotionPressable key={listing.id} accessibilityRole="button" accessibilityLabel={`Ver ${listing.title}`}
      accessibilityState={{ selected: slide === index }} onPress={() => goTo(slide)} style={styles.dotTarget}>
      <View style={[styles.dot, slide === index && styles.currentDot]} />
    </MotionPressable>)}</View>}
  </View>;
}

function Slide({ listing, slide, count, position, place, frame, onPress }: {
  listing: Listing; slide: number; count: number; position: SharedValue<number>; place: number;
  frame: { left: number; width: number; height: number; spacing: number }; onPress(): void;
}) {
  const { styles } = useStyles();
  const lift = frame.height / 2 * (1 - SIDE) - 30;
  const moving = useAnimatedStyle(() => {
    const r = offset(slide, position.value, count), a = Math.min(Math.abs(r), 1.5);
    return {
      opacity: interpolate(a, [0, 1, 1.5], [1, .42, 0], 'clamp'),
      zIndex: Math.round(10 - a * 4),
      transform: [{ translateX: r * frame.spacing }, { translateY: interpolate(a, [0, 1], [0, lift], 'clamp') }, { scale: interpolate(a, [0, 1], [1, SIDE], 'clamp') }],
    };
  });
  // The caption and the sign belong to the centre: they fade as a home leaves it.
  const centreOnly = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(offset(slide, position.value, count)), [0, .5], [1, 0], 'clamp') }));
  const hidden = Math.abs(place) > 1;
  const label = place === 0
    ? `Ver ${listing.title}, ${cartelLabel(listing)}, ${formatMoney(listing.price)} USD${priceSuffix(listing)}, ${listing.location}`
    : `${place < 0 ? 'Anterior' : 'Siguiente'}: ${listing.title}`;
  return <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    style={[styles.slide, { left: frame.left, width: frame.width, height: frame.height }, moving]}>
    <MotionPressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
      <ArchImage width={frame.width} height={frame.height} bottom={28} glow={place === 0}>
        <PropertyImage listing={listing} variant="thumb" style={styles.fill} />
        <Animated.View pointerEvents="none" style={[styles.info, centreOnly]}>
          <Text numberOfLines={2} style={styles.title}>{listing.title}</Text>
          <Text numberOfLines={1} style={styles.place}>{listing.location}, {listing.province}</Text>
          <View style={styles.priceRow}>
            <Text numberOfLines={1} style={styles.price}>{formatMoney(listing.price)}<Text style={styles.small}> USD{priceSuffix(listing)}</Text></Text>
            <Text numberOfLines={1} style={styles.small}>{listingFacts(listing)}</Text>
          </View>
        </Animated.View>
      </ArchImage>
    </MotionPressable>
    <Animated.View pointerEvents="none" style={[styles.sign, { top: Math.round(frame.height * .38) }, centreOnly]}><Cartel label={cartelLabel(listing)} tilt={-4} /></Animated.View>
  </Animated.View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  // Bleeds over the list's 16 px gutter so on a phone the neighbours reach the screen edges.
  stage: { marginHorizontal: -16, overflow: 'hidden' },
  slide: { position: 'absolute', top: 8 },
  fill: { width: '100%', height: '100%' },
  ring: { position: 'absolute', borderBottomLeftRadius: 34, borderBottomRightRadius: 34, borderWidth: 1, borderColor: colors.outline },
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
