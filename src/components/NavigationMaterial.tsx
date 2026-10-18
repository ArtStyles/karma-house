import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';

/** The tab bar is the search field's surface at 92 %: nearly opaque, with the screen just showing through. */
export function NavigationMaterial() {
  const { colors } = useTheme();
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.navigationGlass }]} />;
}
