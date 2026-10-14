import { StyleSheet, Text, View } from 'react-native';
import { createThemedStyles } from '../theme';

/** Paid service mark, never a verification: no check icon and no green (BRAND.md). */
export function ProBadge() {
  const { styles } = useStyles();
  return <View accessible accessibilityLabel="Cuenta Pro de KarmaHouse" style={styles.badge}><Text style={styles.text}>Pro</Text></View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  text: { color: colors.primary, fontSize: 12, lineHeight: 16, fontWeight: '600' },
}));
