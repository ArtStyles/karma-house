import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { internalLayout, createThemedStyles } from '../theme';
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
  card: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', padding: 20, borderRadius: internalLayout.radius, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  symbol: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '600', color: colors.ink },
  description: { fontSize: 15, lineHeight: 22, color: colors.muted, maxWidth: 540 },
  actions: { marginTop: 8, gap: 12, width: '100%', maxWidth: 360 },
  button: { paddingHorizontal: 12 },
}));
