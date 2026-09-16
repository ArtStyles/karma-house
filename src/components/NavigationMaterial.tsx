import { BlurView } from 'expo-blur';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';

export function NavigationMaterial() {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (mounted) setReduceTransparency(value);
    }).catch(() => { if (mounted) setReduceTransparency(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  if (Platform.OS === 'android' || reduceTransparency) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF' }]} />;
  }
  return <BlurView pointerEvents="none" tint="light" intensity={80} style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFFB8' }]} />;
}
