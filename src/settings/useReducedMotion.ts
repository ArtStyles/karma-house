import { useEffect, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import { createMotionPreference } from './motionPreference';

const preference = createMotionPreference({
  read: () => Platform.OS === 'web' && typeof window !== 'undefined'
    ? Promise.resolve(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    : AccessibilityInfo.isReduceMotionEnabled(),
  listen(listener) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)');
      const changed = () => listener(query.matches);
      query.addEventListener('change', changed);
      return () => query.removeEventListener('change', changed);
    }
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', listener);
    return () => subscription.remove();
  },
});
let users = 0;
let stop: (() => void) | undefined;
export function useReducedMotion() {
  useEffect(() => {
    if (users++ === 0) stop = preference.start();
    return () => { if (--users === 0) { stop?.(); stop = undefined; } };
  }, []);
  return useSyncExternalStore(preference.subscribe, preference.getState, () => true);
}
