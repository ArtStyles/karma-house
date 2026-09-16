import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import type { Listing, ListingStatus } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { colors, formatMoney } from '../theme';

const statusNames = { active: 'Activo', paused: 'En pausa', sold: 'Vendido' };
export default function MyListingsScreen() {
  const { listings, setStatus } = useMarketplace();
  const own = listings.filter(item => item.owner === 'local');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Listing | null>(null);
  async function update(id: string, status: ListingStatus) { if (pending) return; setPending(id); setError(''); try { await setStatus(id, status); setConfirm(null); } catch { setError('No se pudo guardar el cambio. Vuelve a intentarlo.'); } finally { setPending(''); } }
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}><ScrollView contentContainerStyle={styles.content}><PageTitle title="Mis anuncios" subtitle="Cada vivienda, en tus manos." back />
    <Notice>Estos anuncios de prueba se guardan solo en este dispositivo. Los activos aparecen en tu catálogo local.</Notice>
    {error ? <Notice error>{error}</Notice> : null}
    {own.length ? <View style={styles.list}>{own.map(item => <View key={item.id} style={styles.card}><Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.title}`} onPress={() => router.push(`/property/${item.id}`)} style={styles.overview}><PropertyImage listing={item} style={styles.image} /><View style={{ flex: 1, gap: 7 }}><Text style={[styles.status, item.status === 'active' && { color: colors.green }]}>{statusNames[item.status]} · Local</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.price}>{formatMoney(item.price)} USD</Text><Text style={styles.location}>{item.location}</Text></View></Pressable>
      <View style={styles.actions}><Button label="Editar" secondary icon="create-outline" onPress={() => router.push(`/edit/${item.id}`)} style={{ flex: 1, minWidth: 100 }} disabled={!!pending} />
        {item.status === 'active' ? <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id} disabled={!!pending} style={{ flex: 1, minWidth: 100 }} /> : <Button label="Reactivar" secondary icon="play-outline" onPress={() => update(item.id, 'active')} loading={pending === item.id} disabled={!!pending} style={{ flex: 1, minWidth: 100 }} />}
      </View>{item.status !== 'sold' && <Pressable accessibilityRole="button" disabled={!!pending} onPress={() => setConfirm(item)} style={styles.soldButton}><Icon name="checkmark-circle-outline" color={colors.green} size={18} /><Text style={styles.soldText}>Marcar como vendido</Text></Pressable>}
    </View>)}<Button label="Crear otro anuncio" onPress={() => router.push('/publish')} icon="add-outline" /></View> : <EmptyState icon="key-outline" title="Tu primera publicación empieza aquí" description="Crea un anuncio de prueba y descubre cómo será mostrar tu vivienda en KarmaHouse." action={<Button label="Crear mi primer anuncio" onPress={() => router.push('/publish')} />} />}
    </ScrollView><Modal visible={!!confirm} transparent animationType="fade" onRequestClose={() => !pending && setConfirm(null)}><View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}><Text style={styles.modalTitle}>Un nuevo comienzo para esta casa</Text><Text style={styles.modalText}>El anuncio saldrá del catálogo y quedará como vendido en Mis anuncios. Podrás reactivarlo cuando quieras.</Text>{error ? <Notice error>{error}</Notice> : null}<Button label="Confirmar vendido" loading={!!pending} onPress={() => confirm && update(confirm.id, 'sold')} /><Button label="Volver" secondary disabled={!!pending} onPress={() => setConfirm(null)} /></View></View></Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 30, gap: 8 }, list: { gap: 20, marginTop: 20 }, card: { backgroundColor: colors.white, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: colors.border }, overview: { flexDirection: 'row', gap: 14, alignItems: 'center' }, image: { width: 95, height: 108, borderRadius: 12 }, status: { color: colors.amber, fontSize: 11, fontWeight: '600' }, title: { color: colors.ink, fontSize: 17, fontWeight: '600' }, price: { color: colors.ink, fontSize: 15 }, location: { fontSize: 12, color: colors.muted }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }, soldButton: { flexDirection: 'row', gap: 7, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 6 }, soldText: { color: colors.green, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: '#10293D70', justifyContent: 'center', padding: 24 }, modal: { backgroundColor: colors.white, borderRadius: 24, padding: 26, gap: 18, width: '100%', maxWidth: 420, alignSelf: 'center' }, modalTitle: { color: colors.ink, fontSize: 24, fontWeight: '600' }, modalText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
});
