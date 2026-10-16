import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { internalLayout, createThemedStyles, rounded, typography } from '../theme';
import { Button, Icon } from './ui';

export function AccountPrompt({ returnTo, title = 'Entra en tu cuenta', description = 'Inicia sesión para consultar y gestionar tus viviendas.' }: { returnTo: string; title?: string; description?: string }) {
  const { colors, styles } = useStyles();
  return <View style={styles.card}>
    <View style={styles.symbol}><Icon name="person-outline" size={25} color={colors.primary} /></View>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
    <View style={styles.actions}>
    <Button label="Entrar o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo } })} style={styles.button} />
  </View></View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'flex-start', padding: 20, borderRadius: rounded.cardLg, backgroundColor: colors.surface, gap: 12 },
  symbol: { width: 44, height: 44, borderRadius: rounded.pill, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.section, color: colors.ink },
  description: { fontSize: 15, lineHeight: 22, color: colors.body, maxWidth: 540 },
  actions: { marginTop: 8, gap: 12, width: '100%', maxWidth: 360 },
  button: { paddingHorizontal: 12 },
}));
