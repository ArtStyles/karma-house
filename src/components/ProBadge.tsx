import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { createThemedStyles } from '../theme';

/** Paid service mark, never a verification: no check icon and no green (BRAND.md). `decorative` hides it when the parent already announces it. */
export function ProBadge({ decorative = false, style }: { decorative?: boolean; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  return <View accessible={!decorative} accessibilityLabel={decorative ? undefined : 'Cuenta Pro de KarmaHouse'} accessibilityElementsHidden={decorative} importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'} style={[styles.badge, style]}><Text style={styles.text}>Pro</Text></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '600' },
}));
