import { useEffect, useState, type ComponentProps } from 'react';
import { Pressable } from 'react-native';
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../settings/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({ style, onPressIn, onPressOut, disabled, pressedScale = .98, ...props }: ComponentProps<typeof Pressable> & { pressedScale?: number }) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : scale.value }] }));
  useEffect(() => {
    if (disabled || reduced) {
      cancelAnimation(scale);
      scale.value = 1;
      if (disabled) setPressed(false);
    }
  }, [disabled, reduced, scale]);
  const press = () => {
    scale.value = reduced ? 1 : withTiming(pressedScale, { duration: 80, reduceMotion: ReduceMotion.System });
  };
  const release = () => {
    // Retarget from the live value; a new press can interrupt this return.
    scale.value = reduced ? 1 : withSpring(1, { duration: 220, dampingRatio: 1, overshootClamping: true, reduceMotion: ReduceMotion.System });
  };
  // Reanimated flattens styles before Pressable sees them; resolve its callback first.
  return <AnimatedPressable {...props} disabled={disabled} style={[typeof style === 'function' ? style({ pressed }) : style, animated]}
    onPressIn={event => { if (disabled) return; setPressed(true); press(); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); release(); onPressOut?.(event); }} />;
}
