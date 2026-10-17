import { BlurView } from 'expo-blur';
import { useEffect, useState,type RefObject } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

export function NavigationMaterial({blurTarget}:{blurTarget?:RefObject<View|null>}={}) {
  const { colors, scheme } = useTheme();
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [highContrast,setHighContrast]=useState(false);
  useEffect(() => {
    if(Platform.OS==='web'&&typeof window!=='undefined'){
      const transparency=window.matchMedia('(prefers-reduced-transparency: reduce)'),contrast=window.matchMedia('(prefers-contrast: more)');
      const update=()=>{setReduceTransparency(transparency.matches);setHighContrast(contrast.matches)};
      update();transparency.addEventListener('change',update);contrast.addEventListener('change',update);
      return()=>{transparency.removeEventListener('change',update);contrast.removeEventListener('change',update)};
    }
    if(Platform.OS==='android'){
      let mounted=true;
      AccessibilityInfo.isHighTextContrastEnabled().then(value=>{if(mounted)setHighContrast(value)}).catch(()=>{if(mounted)setHighContrast(true)});
      const subscription=AccessibilityInfo.addEventListener('highTextContrastChanged',setHighContrast);
      return()=>{mounted=false;subscription.remove()};
    }
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled().then(value => {
      if (mounted) setReduceTransparency(value);
    }).catch(() => { if (mounted) setReduceTransparency(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduceTransparency);
    AccessibilityInfo.isDarkerSystemColorsEnabled().then(value=>{if(mounted)setHighContrast(value)}).catch(()=>{if(mounted)setHighContrast(true)});
    const contrast=AccessibilityInfo.addEventListener('darkerSystemColorsChanged',setHighContrast);
    return () => { mounted = false; subscription.remove(); contrast.remove(); };
  }, []);
  if (reduceTransparency||highContrast) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigation }]} />;
  // Without a blur target Android cannot blur; the tinted glass alone still lets the screen show through.
  if (Platform.OS === 'android'&&(Number(Platform.Version)<31||!blurTarget)) return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigationGlass }]} />;
  return <BlurView pointerEvents="none" tint={scheme} intensity={55} blurTarget={blurTarget} blurMethod="dimezisBlurViewSdk31Plus" style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigationGlass }]} />;
}
