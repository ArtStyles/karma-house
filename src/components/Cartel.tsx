import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { createThemedStyles, rounded, typography } from '../theme';

/**
 * The street sign on cal paper: «Se vende», «Se alquila», «Se permuta», «Se busca», and «Vendida» at the end.
 * It names a home's operation and nothing else; the only shape in the app that is not a pill.
 */
export function Cartel({ label, tilt = -3, style }: { label: string; tilt?: number; style?: StyleProp<ViewStyle> }) {
  const { styles } = useStyles();
  return <View style={[styles.sign, { transform: [{ rotate: `${Math.max(-4, Math.min(3, tilt))}deg` }] }, style]}>
    <Text numberOfLines={1} style={styles.text}>{label}</Text>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  sign: { alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderRadius: rounded.sign, backgroundColor: colors.cream, boxShadow: '0 8px 18px rgba(0,0,0,0.35)' },
  text: { ...typography.cardTitle, fontSize: 16, lineHeight: 20, color: colors.creamInk },
}));
