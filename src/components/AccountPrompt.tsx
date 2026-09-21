import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Button, EmptyState, Icon } from './ui';

export function AccountPrompt({ returnTo, title = 'Un espacio para ti', description = 'Inicia sesión para guardar tus favoritos y gestionar tus viviendas desde cualquier dispositivo.' }: { returnTo: string; title?: string; description?: string }) {
  return <EmptyState icon="person-outline" title={title} description={description} action={<View style={styles.actions}>
    <View style={styles.benefits}>
      <View style={styles.benefit}><Icon name="heart-outline" size={14} color="#A56473" /><Text style={styles.benefitText}>Favoritos</Text></View>
      <View style={styles.benefit}><Icon name="chatbubble-outline" size={14} color={colors.primary} /><Text style={styles.benefitText}>Mensajes</Text></View>
      <View style={styles.benefit}><Icon name="home-outline" size={14} color="#537866" /><Text style={styles.benefitText}>Anuncios</Text></View>
    </View>
    <Button label="Iniciar sesión o crear cuenta" onPress={() => router.push({ pathname: '/auth', params: { returnTo } })} style={styles.button} />
  </View>} />;
}

const styles = StyleSheet.create({
  actions: { gap: 18 },
  button: { paddingHorizontal: 12 },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 15, rowGap: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  benefitText: { color: colors.muted, fontSize: 11, lineHeight: 16 },
});
