import { View, type ColorValue, type ViewStyle } from 'react-native';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../theme';

type State = 'lit' | 'off' | 'progress';
const ease = Easing.bezier(.22, 1, .36, 1);

/**
 * The Havana fan window, drawn with Views (no SVG dependency). DESIGN.md gives the drawn window three roles
 * (the arch frame is the third, on photos): progress (3–4 panes, `progress`: done in blue, `step` in sol, the rest
 * off), empty states (`off`: one pane on) and finished states (`lit`). Panes light one after another on mount.
 * `ground` is the surface it sits on: the leading between panes and the hub take its colour.
 */
export function Mediopunto({ panes = 5, state = 'lit', step = 0, width = 36, ground, label }: {
  panes?: 3 | 4 | 5; state?: State; step?: number; width?: number; ground?: ColorValue; label?: string;
}) {
  const { colors } = useTheme();
  const r = width / 2, sweep = 180 / panes, lead = Math.max(1.5, r * .05), hub = r * .28;
  const leadColor = ground ?? colors.paper;
  const pane = (i: number): [ColorValue, number] | null =>
    state === 'lit' ? [i % 2 ? colors.primary : colors.sol, 1]
      : state === 'off' ? i === Math.floor(panes / 2) ? [colors.sol, .55] : null
        : i < step ? [colors.primary, 1] : i === step ? [colors.sol, 1] : null;
  // A half-plane hinged at the centre: rotating it and clipping a second one inside leaves one wedge.
  const half: ViewStyle = { position: 'absolute', left: r, top: 0, width: r, height: width, transformOrigin: 'left center' };
  const a11y = state === 'progress' && label
    ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: label, accessibilityValue: { min: 1, max: panes, now: Math.min(panes, step + 1) } }
    : { accessible: false, 'aria-hidden': true, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
  return <View pointerEvents="none" {...a11y} style={{ width, height: r, borderTopLeftRadius: r, borderTopRightRadius: r, overflow: 'hidden', backgroundColor: colors.softBlue }}>
    {Array.from({ length: panes }, (_, i) => {
      const tone = pane(i);
      return tone && <View key={i} style={[half, { overflow: 'hidden', opacity: tone[1], transform: [{ rotate: `${i * sweep - 90}deg` }] }]}>
        <Animated.View entering={FadeIn.delay(i * 80).duration(240).easing(ease)}
          style={[half, { left: 0, backgroundColor: tone[0], transform: [{ rotate: `${sweep - 180}deg` }] }]} />
      </View>;
    })}
    {Array.from({ length: panes - 1 }, (_, i) => <View key={`lead${i}`}
      style={{ position: 'absolute', left: r, top: r - lead / 2, width: r, height: lead, backgroundColor: leadColor, transformOrigin: 'left center', transform: [{ rotate: `${180 + (i + 1) * sweep}deg` }] }} />)}
    <View style={{ position: 'absolute', left: r - hub, top: r - hub, width: hub * 2, height: hub * 2, borderRadius: hub, backgroundColor: leadColor }} />
  </View>;
}
