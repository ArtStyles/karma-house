import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { internalLayout, createThemedStyles, rounded, typography } from '../theme';
import { Mediopunto } from './Mediopunto';
import { Button, Icon } from './ui';

/** «Entra en tu cuenta»: the lit window, what the account gives, and the privacy every account keeps. */
export function AccountPrompt({ returnTo, title = 'Entra en tu cuenta', description = 'Inicia sesión para consultar y gestionar tus viviendas.' }: { returnTo: string; title?: string; description?: string }) {
  const { colors, styles } = useStyles();
  return <View style={styles.card}>
    <Mediopunto width={120} ground={colors.surface} />
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
    <Button label="Entrar o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo } })} style={styles.button} />
    <View style={styles.privacy}><Icon name="lock-closed-outline" size={15} color={colors.muted} /><Text style={styles.privacyText}>Nadie ve tu teléfono ni tu correo.</Text></View>
  </View>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  card: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', alignItems: 'center', paddingVertical: 28, paddingHorizontal: 22, borderRadius: rounded.cardLg, backgroundColor: colors.surface, gap: 12 },
  title: { ...typography.sheetTitle, color: colors.ink, textAlign: 'center', marginTop: 8 },
  description: { fontSize: 15, lineHeight: 22, color: colors.body, maxWidth: 420, textAlign: 'center' },
  button: { marginTop: 8, width: '100%', maxWidth: 360 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6 }, privacyText: { fontSize: 12, lineHeight: 16, color: colors.muted },
}));
