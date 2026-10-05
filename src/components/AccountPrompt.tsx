import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { accountLayout, colors } from '../theme';
import { Button, Icon } from './ui';

export function AccountPrompt({ returnTo, title = 'Un espacio para ti', description = 'Inicia sesión para guardar tus favoritos y gestionar tus viviendas desde cualquier dispositivo.' }: { returnTo: string; title?: string; description?: string }) {
  return <View style={styles.card}>
    <View style={styles.symbol}><Icon name="person-outline" size={25} color={colors.primary} /></View>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
    <View style={styles.actions}>
    <View style={styles.benefits}>
      <View style={styles.benefit}><Icon name="heart-outline" size={14} color="#A56473" /><Text style={styles.benefitText}>Favoritos</Text></View>
      <View style={styles.benefit}><Icon name="chatbubble-outline" size={14} color={colors.primary} /><Text style={styles.benefitText}>Mensajes</Text></View>
      <View style={styles.benefit}><Icon name="home-outline" size={14} color="#537866" /><Text style={styles.benefitText}>Anuncios</Text></View>
    </View>
    <Button label="Entrar o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo } })} style={styles.button} />
  </View></View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: accountLayout.maxWidth, alignSelf: 'center', padding: accountLayout.gutter, borderRadius: accountLayout.radius, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, alignItems: 'center', gap: accountLayout.gap },
  symbol: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 22, color: colors.muted, textAlign: 'center', maxWidth: 370 },
  actions: { gap: accountLayout.gap, width: '100%', maxWidth: accountLayout.actionWidth },
  button: { paddingHorizontal: 12 },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 15, rowGap: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  benefitText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
