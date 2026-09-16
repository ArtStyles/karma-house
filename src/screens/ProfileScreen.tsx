import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, Notice, PageTitle } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, typefaces } from '../theme';

export default function ProfileScreen() {
  const { listings, favoriteIds } = useMarketplace();
  const own = listings.filter(item => item.owner === 'local');
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><ScrollView contentContainerStyle={styles.content}><PageTitle title="Mi espacio" subtitle="Cada hogar comienza con una historia." />
    <View style={styles.welcome}><View style={styles.avatar}><Icon name="person-outline" size={32} color={colors.primary} /></View><Text style={styles.heading}>Bienvenido a KarmaHouse</Text><Text style={styles.welcomeText}>Este es tu espacio para probar la app.{ '\n' }Tus cambios se quedan en este dispositivo.</Text><Text style={styles.tag}>MODO DEMOSTRACIÓN</Text></View>
    <View style={styles.stats}><View style={styles.stat}><Text style={styles.number}>{own.length}</Text><Text style={styles.statLabel}>Anuncios locales</Text></View><View style={styles.stat}><Text style={styles.number}>{favoriteIds.length}</Text><Text style={styles.statLabel}>Favoritos</Text></View></View>
    <Pressable accessibilityRole="button" onPress={() => router.push('/my-listings')} style={styles.row}><Icon name="home-outline" /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Mis anuncios</Text><Text style={styles.rowDescription}>Gestiona tus viviendas de prueba</Text></View><Icon name="chevron-forward" size={18} /></Pressable>
    <Pressable accessibilityRole="button" onPress={() => router.push('/favorites')} style={styles.row}><Icon name="heart-outline" /><View style={{ flex: 1 }}><Text style={styles.rowTitle}>Mis favoritos</Text><Text style={styles.rowDescription}>Los lugares que te han gustado</Text></View><Icon name="chevron-forward" size={18} /></Pressable>
    <View style={styles.publish}><Text style={styles.publishTitle}>¿Una casa esperando su próxima historia?</Text><Text style={styles.publishText}>Prueba cómo sería publicarla, paso a paso.</Text><Button label="Crear anuncio de prueba" onPress={() => router.push('/publish')} icon="add-outline" /></View>
    <Notice>Las cuentas, los mensajes y la publicación pública se incorporarán en la siguiente etapa. Esta demo no solicita datos de identidad.</Notice>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 30 }, welcome: { paddingVertical: 26, alignItems: 'center', gap: 15 }, avatar: { width: 80, height: 80, backgroundColor: colors.softBlue, borderRadius: 40, alignItems: 'center', justifyContent: 'center' }, heading: { color: colors.ink, fontSize: 24, fontFamily: typefaces.display, textAlign: 'center' }, welcomeText: { color: colors.muted, lineHeight: 22, textAlign: 'center', fontSize: 14 }, tag: { fontSize: 9, color: colors.green, letterSpacing: 1.2, backgroundColor: colors.softGreen, borderRadius: 5, padding: 9 },
  stats: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: 17, borderWidth: 1, borderColor: colors.border, marginVertical: 17 }, stat: { flex: 1, alignItems: 'center', padding: 20, gap: 6 }, number: { color: colors.ink, fontSize: 27, fontWeight: '700' }, statLabel: { color: colors.muted, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 22, borderBottomWidth: 1, borderColor: colors.border }, rowTitle: { fontSize: 16, fontWeight: '600', color: colors.ink }, rowDescription: { fontSize: 12, color: colors.muted, marginTop: 6 }, publish: { padding: 24, backgroundColor: '#E8EEE7', borderRadius: 20, gap: 15, marginVertical: 26 }, publishTitle: { fontFamily: typefaces.display, fontSize: 25, lineHeight: 32, color: colors.ink }, publishText: { fontSize: 13, color: colors.muted, lineHeight: 21 },
});
