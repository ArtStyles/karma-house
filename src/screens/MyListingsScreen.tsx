import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import type { Listing, ListingStatus } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore';
import { colors, formatMoney } from '../theme';

const statusNames = { active: 'Activo', paused: 'En pausa', sold: 'Vendido' };
const statusColors = { active: colors.green, paused: colors.amber, sold: colors.muted };
const moderationNames = { draft: 'Borrador', pending: 'En revisión', approved: 'Aprobado', rejected: 'Necesita cambios' };

export default function MyListingsScreen() {
  const { ownListings: own, setStatus, mode, refresh, submitForReview } = useMarketplace();
  const { user } = useAuth();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Listing | null>(null);
  const effectiveConfirm = confirm && (mode === 'demo' || confirm.ownerId === user?.id) ? confirm : null;

  useEffect(() => { setConfirm(null); setError(''); setPending(''); }, [user?.id]);

  async function update(id: string, status: ListingStatus) {
    if (pending) return;
    setPending(id);
    setError('');
    try { await setStatus(id, status); setConfirm(null); }
    catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { setPending(''); }
  }

  async function reload() {
    if (pending) return;
    setPending('refresh'); setError('');
    try { await refresh(); } catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { setPending(''); }
  }

  async function submit(id: string) {
    if (pending) return;
    setPending(id); setError('');
    try { await submitForReview(id); } catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { setPending(''); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Mis anuncios" subtitle="Administra tus viviendas." back />
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/my-listings" /> : <>
      <Notice>{mode === 'cloud' ? 'Tus anuncios aparecen en el catálogo cuando están aprobados y activos. Los cambios de contenido se revisan antes de publicarse.' : 'Los anuncios de prueba se guardan en este dispositivo. Los activos aparecen en tu catálogo local.'}</Notice>
      {error ? <Notice error>{error}</Notice> : null}
      {mode === 'cloud' && <Button label="Actualizar mis anuncios" icon="refresh-outline" secondary loading={pending === 'refresh'} disabled={!!pending} onPress={reload} />}

      {own.length ? <View style={styles.list}>
        <Text style={styles.sectionLabel}>{own.length} {own.length === 1 ? 'anuncio' : 'anuncios'}</Text>
        {own.map(item => <View key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${item.title}`} onPress={() => router.push(`/property/${item.id}`)} style={({ pressed }) => [styles.overview, pressed && styles.pressed]}>
            <PropertyImage listing={item} style={styles.image} />
            <View style={styles.details}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] }]} />
                <Text style={[styles.status, { color: statusColors[item.status] }]}>{statusNames[item.status]}</Text>
              </View>
              {item.moderationStatus && <Text style={[styles.moderation, item.moderationStatus === 'rejected' && { color: colors.danger }]}>{moderationNames[item.moderationStatus]}</Text>}
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.price}>{formatMoney(item.price)} <Text style={styles.currency}>USD</Text></Text>
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {item.reviewNote && <Notice error>{item.reviewNote}</Notice>}

          <View style={styles.actions}>
            <Button label="Editar" secondary icon="create-outline" onPress={() => router.push(`/edit/${item.id}`)} style={styles.actionButton} disabled={!!pending} />
            {item.status === 'active'
              ? <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />
              : <Button label="Reactivar" secondary icon="play-outline" onPress={() => update(item.id, 'active')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
          </View>
          {(item.moderationStatus === 'draft' || item.moderationStatus === 'rejected') && <Button label="Enviar a revisión" secondary icon="paper-plane-outline" loading={pending === item.id} disabled={!!pending} onPress={() => submit(item.id)} style={styles.reviewButton} />}
          {item.status !== 'sold' && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!pending }} disabled={!!pending} onPress={() => setConfirm(item)} style={({ pressed }) => [styles.soldButton, pressed && styles.pressed, !!pending && styles.disabled]}>
            <Icon name="checkmark-circle-outline" color={colors.primary} size={19} />
            <Text style={styles.soldText}>Marcar como vendido</Text>
          </Pressable>}
        </View>)}
        <Button label="Crear otro anuncio" onPress={() => router.push('/publish')} icon="add-outline" style={styles.createButton} />
      </View> : <EmptyState icon="key-outline" title="Tu primera vivienda, aquí." description={mode === 'cloud' ? 'Añade los detalles y las fotos de tu vivienda. Revisaremos el anuncio antes de mostrarlo en el catálogo.' : 'Crea un anuncio de prueba con sus detalles y una foto. Podrás editarlo cuando quieras.'} action={<Button label="Crear mi primer anuncio" onPress={() => router.push('/publish')} />} />}
      </>}
    </ScrollView>

    <Modal visible={!!effectiveConfirm} transparent animationType="fade" onRequestClose={() => !pending && setConfirm(null)}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.modalIcon}><Icon name="checkmark-circle-outline" color={colors.primary} size={30} /></View>
          <Text style={styles.modalTitle}>¿Marcar como vendido?</Text>
          <Text style={styles.modalText}>El anuncio saldrá del catálogo y quedará como vendido en Mis anuncios. Podrás reactivarlo cuando quieras.</Text>
          {error ? <Notice error>{error}</Notice> : null}
          <Button label="Confirmar vendido" loading={!!pending} onPress={() => effectiveConfirm && update(effectiveConfirm.id, 'sold')} />
          <Button label="Cancelar" secondary disabled={!!pending} onPress={() => setConfirm(null)} />
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 24, gap: 8 },
  list: { gap: 16, marginTop: 18 },
  sectionLabel: { color: colors.muted, fontSize: 14, marginLeft: 4, marginBottom: -4 },
  card: { backgroundColor: colors.white, padding: 16, borderRadius: 22 },
  overview: { flexDirection: 'row', gap: 13, alignItems: 'center', borderRadius: 12 },
  pressed: { opacity: .65 },
  image: { width: 92, height: 114, borderRadius: 14 },
  details: { flex: 1, gap: 6 },
  statusRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  status: { fontSize: 12, fontWeight: '500' },
  moderation: { fontSize: 12, fontWeight: '600', color: colors.primary },
  reviewButton: { marginTop: 10, minHeight: 44 },
  title: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -.3 },
  price: { color: colors.ink, fontSize: 16, fontWeight: '600', letterSpacing: -.2 },
  currency: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  location: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  actionButton: { flex: 1, minWidth: 100, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.paper, borderWidth: 0, borderRadius: 12 },
  soldButton: { flexDirection: 'row', gap: 7, minHeight: 46, justifyContent: 'center', alignItems: 'center', marginTop: 8, borderRadius: 12 },
  soldText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  disabled: { opacity: .5 },
  createButton: { marginTop: 6 },
  backdrop: { flex: 1, backgroundColor: '#00000050', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.white, borderRadius: 28, padding: 24, gap: 14, width: '100%', maxWidth: 420, alignSelf: 'center' },
  modalIcon: { width: 58, height: 58, backgroundColor: colors.softBlue, borderRadius: 29, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 4 },
  modalTitle: { color: colors.ink, fontSize: 23, lineHeight: 29, fontWeight: '600', letterSpacing: -.5, textAlign: 'center' },
  modalText: { color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 8 },
});
