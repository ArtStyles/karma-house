import { useState } from 'react';
import { Pressable, type PressableProps } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useReducedMotion } from '../settings/useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({ style, onPressIn, onPressOut, ...props }: PressableProps) {
  const reduced = useReducedMotion();
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: reduced ? 1 : scale.value }] }));
  const feedback = (value: number) => { scale.value = withTiming(value, { duration: 100, reduceMotion: reduced ? ReduceMotion.Always : ReduceMotion.System }); };
  // Reanimated flattens styles before Pressable sees them; resolve its callback first.
  return <AnimatedPressable {...props} style={[typeof style === 'function' ? style({ pressed }) : style, animated]}
    onPressIn={event => { setPressed(true); feedback(.98); onPressIn?.(event); }}
    onPressOut={event => { setPressed(false); feedback(1); onPressOut?.(event); }} />;
}
