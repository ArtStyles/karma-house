import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { listingBoardState, type Listing, type ListingBoardState, type ListingStatus } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage } from '../state/remoteMarketplaceStore';
import { colors, formatMoney } from '../theme';

const boardLabels: Record<ListingBoardState, string> = {
  sold: 'Vendido', rejected: 'Necesita cambios', draft: 'Borrador',
  pending: 'En revisión', paused: 'En pausa', live: 'En el catálogo',
};
const boardTones: Record<ListingBoardState, { color: string; background: string }> = {
  sold: { color: colors.muted, background: colors.paper },
  rejected: { color: colors.danger, background: colors.softDanger },
  draft: { color: colors.muted, background: colors.paper },
  pending: { color: colors.amber, background: '#FFF3DA' },
  paused: { color: colors.amber, background: '#FFF3DA' },
  live: { color: colors.green, background: colors.softGreen },
};

export default function MyListingsScreen() {
  const { ownListings: own, setStatus, mode, refresh, submitForReview } = useMarketplace();
  const { user } = useAuth();
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ listing: Listing; next: 'sold' | 'active' } | null>(null);
  const effectiveConfirm = confirm && (mode === 'demo' || confirm.listing.ownerId === user?.id) ? confirm : null;
  // iOS keeps the modal mounted through the fade, so the direction has to outlive the state that closed it.
  const lastDirection = useRef<'sold' | 'active'>('sold');
  if (effectiveConfirm) lastDirection.current = effectiveConfirm.next;
  const sellingOff = lastDirection.current === 'sold';

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
      <PageTitle title="Mis anuncios" subtitle="Administra tus viviendas." back fallback="/profile" />
      {mode === 'cloud' && !user ? <AccountPrompt returnTo="/my-listings" /> : <>
      <Notice>{mode === 'cloud' ? 'Tus anuncios aparecen en el catálogo cuando están aprobados y activos. Los cambios de contenido se revisan antes de publicarse.' : 'Los anuncios de prueba se guardan en este dispositivo. Los activos aparecen en tu catálogo local.'}</Notice>
      {error ? <Notice error>{error}</Notice> : null}
      {mode === 'cloud' && <Button label="Actualizar mis anuncios" icon="refresh-outline" secondary loading={pending === 'refresh'} disabled={!!pending} onPress={reload} />}

      {own.length ? <View style={styles.list}>
        <Text style={styles.sectionLabel}>{own.length} {own.length === 1 ? 'anuncio' : 'anuncios'}</Text>
        {own.map(item => {
          const state = listingBoardState(item);
          const tone = boardTones[state];
          return <View key={item.id} style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${boardLabels[state]}. ${formatMoney(item.price)} USD. ${item.location}.`} onPress={() => router.push(`/property/${item.id}`)} style={({ pressed }) => [styles.overview, pressed && styles.pressed]}>
            <PropertyImage listing={item} style={styles.image} />
            <View style={styles.details}>
              <View style={[styles.chip, { backgroundColor: tone.background }]}>
                <View style={[styles.statusDot, { backgroundColor: tone.color }]} />
                <Text style={[styles.status, { color: tone.color }]}>{boardLabels[state]}</Text>
              </View>
              <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.price}>{formatMoney(item.price)} <Text style={styles.currency}>USD</Text></Text>
              <Text style={styles.location} numberOfLines={1}>{item.location}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={colors.muted} />
          </Pressable>
          {item.reviewNote && <Notice error>{item.reviewNote}</Notice>}

          {(state === 'draft' || state === 'rejected') && <Button label="Enviar a revisión" icon="paper-plane-outline" loading={pending === item.id} disabled={!!pending} onPress={() => submit(item.id)} style={styles.reviewButton} />}
          <View style={styles.actions}>
            <Button label="Editar" secondary icon="create-outline" onPress={() => router.push(`/edit/${item.id}`)} style={styles.actionButton} disabled={!!pending} />
            {/* Pausing only means anything once the listing can actually reach the catalogue. */}
            {state === 'live' && <Button label="Pausar" secondary icon="pause-outline" onPress={() => update(item.id, 'paused')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
            {/* Gated on the raw status, not the chip: a paused listing under review still has to be un-pausable. */}
            {item.status === 'paused' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => update(item.id, 'active')} loading={pending === item.id} disabled={!!pending} style={styles.actionButton} />}
            {state === 'sold' && <Button label="Reactivar" secondary icon="play-outline" onPress={() => setConfirm({ listing: item, next: 'active' })} disabled={!!pending} style={styles.actionButton} />}
          </View>
          {state !== 'sold' && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!pending }} disabled={!!pending} onPress={() => setConfirm({ listing: item, next: 'sold' })} style={({ pressed }) => [styles.soldButton, pressed && styles.pressed, !!pending && styles.disabled]}>
            <Icon name="checkmark-circle-outline" color={colors.primary} size={19} />
            <Text style={styles.soldText}>Marcar como vendido</Text>
          </Pressable>}
        </View>;
        })}
        <Button label="Crear otro anuncio" onPress={() => router.push('/publish')} icon="add-outline" style={styles.createButton} />
      </View> : <EmptyState icon="key-outline" title="Tu primera vivienda, aquí." description={mode === 'cloud' ? 'Añade los detalles y las fotos de tu vivienda. Revisaremos el anuncio antes de mostrarlo en el catálogo.' : 'Crea un anuncio de prueba con sus detalles y una foto. Podrás editarlo cuando quieras.'} action={<Button label="Crear mi primer anuncio" onPress={() => router.push('/publish')} />} />}
      </>}
    </ScrollView>

    <Modal visible={!!effectiveConfirm} transparent animationType="fade" onRequestClose={() => !pending && setConfirm(null)}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.modal}>
          <View style={styles.modalIcon}><Icon name={sellingOff ? 'checkmark-circle-outline' : 'play-outline'} color={colors.primary} size={30} /></View>
          <Text accessibilityRole="header" style={styles.modalTitle}>{sellingOff ? '¿Marcar como vendido?' : '¿Volver a poner en venta?'}</Text>
          <Text style={styles.modalText}>{sellingOff
            ? 'El anuncio saldrá del catálogo y quedará como vendido en Mis anuncios. Podrás reactivarlo cuando quieras.'
            : 'El anuncio dejará de estar vendido y volverá al catálogo mientras esté aprobado.'}</Text>
          {error ? <Notice error>{error}</Notice> : null}
          <Button label={sellingOff ? 'Confirmar vendido' : 'Confirmar reactivación'} loading={!!pending} onPress={() => effectiveConfirm && update(effectiveConfirm.listing.id, effectiveConfirm.next)} />
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
  chip: { alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 9, borderRadius: 12 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  status: { fontSize: 12, fontWeight: '600' },
  reviewButton: { marginTop: 16 },
  title: { color: colors.ink, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -.3 },
  price: { color: colors.ink, fontSize: 16, fontWeight: '600', letterSpacing: -.2 },
  currency: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  location: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  actionButton: { flex: 1, minWidth: 100 },
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
