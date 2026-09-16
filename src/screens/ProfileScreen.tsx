import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon, PageTitle } from '../components/ui';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, layout } from '../theme';

export default function ProfileScreen() {
  const { listings, favoriteIds } = useMarketplace();
  const own = listings.filter(item => item.owner === 'local');
  const favorites = listings.filter(item => favoriteIds.includes(item.id) && item.status === 'active');

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Mi espacio" />

      <View style={styles.identity}>
        <View style={styles.avatar}><Icon name="person" size={28} color={colors.primary} /></View>
        <View style={styles.identityText}>
          <Text style={styles.heading}>Tu espacio personal</Text>
          <Text style={styles.identityDescription}>Demostración local</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Tu actividad</Text>
      <View style={styles.group}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Mis anuncios, ${own.length}`} onPress={() => router.push('/my-listings')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><Icon name="home-outline" size={21} color={colors.primary} /></View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Mis anuncios</Text>
            <View style={styles.accessory}><Text style={styles.count}>{own.length}</Text><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
          </View>
        </Pressable>
        <View style={styles.separator} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Favoritos, ${favorites.length}`} onPress={() => router.push('/favorites')} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
          <View style={styles.rowIcon}><Icon name="heart-outline" size={21} color={colors.primary} /></View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>Favoritos</Text>
            <View style={styles.accessory}><Text style={styles.count}>{favorites.length}</Text><Icon name="chevron-forward" size={17} color={colors.muted} /></View>
          </View>
        </Pressable>
      </View>

      <View style={styles.publish}>
        <View style={styles.publishIcon}><Icon name="key-outline" color={colors.primary} size={25} /></View>
        <Text style={styles.publishTitle}>Dale un lugar a tu vivienda.</Text>
        <Text style={styles.publishText}>Añade los detalles, elige una foto y prepara tu primer anuncio.</Text>
        <Button label="Crear anuncio de prueba" onPress={() => router.push('/publish')} icon="add-outline" />
      </View>

      <Text style={styles.demoNote}>Tus cambios se guardan en este dispositivo. Esta demo todavía no incluye cuentas, mensajes ni publicaciones públicas.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: layout.tabContentBottom },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: colors.white, borderRadius: 22, padding: 20 },
  avatar: { width: 58, height: 58, backgroundColor: colors.softBlue, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  identityText: { flex: 1, gap: 5 },
  heading: { color: colors.ink, fontSize: 18, fontWeight: '600', letterSpacing: -.35 },
  identityDescription: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  sectionLabel: { color: colors.muted, fontSize: 14, marginTop: 30, marginBottom: 10, marginLeft: 16 },
  group: { backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 13, paddingLeft: 16, paddingRight: 18, paddingVertical: 13 },
  pressed: { backgroundColor: colors.paper },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { flex: 1, fontSize: 17, color: colors.ink, letterSpacing: -.25 },
  accessory: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  count: { color: colors.muted, fontSize: 16, fontVariant: ['tabular-nums'] },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 65 },
  publish: { padding: 22, backgroundColor: colors.white, borderRadius: 22, gap: 14, marginTop: 26 },
  publishIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softBlue, borderRadius: 15, marginBottom: 2 },
  publishTitle: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -.5, color: colors.ink },
  publishText: { fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 6 },
  demoNote: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingHorizontal: 16, marginTop: 18 },
});
