import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

/** The tab bar is opaque, in the search field's surface colour: the screen never shows through it. */
export function NavigationMaterial() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigation }]} />;
}
