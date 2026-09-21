import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { PropertyImage } from '../components/PropertyImage';
import { Button, EmptyState, Notice, PageTitle } from '../components/ui';
import type { Listing } from '../domain/listings';
import { useMarketplace } from '../state/MarketplaceProvider';
import { remoteErrorMessage, type ReviewDecision } from '../state/remoteMarketplaceStore';
import { colors, formatMoney } from '../theme';

type Review = { listing: Listing; decision: ReviewDecision; actorId: string };

export default function AdminScreen() {
  const { user, isAdmin } = useAuth();
  const { mode, moderationQueue, loadModerationQueue, reviewListing } = useMarketplace();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState('');
  const selectedReview = review?.actorId === user?.id && isAdmin ? review : null;

  useFocusEffect(useCallback(() => {
    setReview(null); setNote(''); setError('');
    if (!isAdmin || !user || mode !== 'cloud') return;
    let active = true;
    let inFlight = false;
    const renew = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try { await loadModerationQueue(); }
      catch (failure) { if (active) setError(remoteErrorMessage(failure)); }
      finally { inFlight = false; if (active) setLoading(false); }
    };
    void renew();
    // Queue photographs have the same one-hour signed URL lifetime as the catalog.
    // Reload on returning to this screen/app and renew during long review sessions.
    const appSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void renew();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void renew();
    }, 15 * 60 * 1000);
    return () => { active = false; appSubscription.remove(); clearInterval(timer); };
  }, [user?.id, isAdmin, mode, loadModerationQueue]));

  async function reload() {
    if (loading || busy) return;
    setLoading(true); setError('');
    try { await loadModerationQueue(); } catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { setLoading(false); }
  }
  async function confirmReview() {
    if (!selectedReview || busy || selectedReview.listing.ownerId === user?.id) return;
    if (selectedReview.decision === 'rejected' && !note.trim()) { setError('Explica qué debe corregir el propietario.'); return; }
    setBusy(true); setError('');
    try {
      await reviewListing(selectedReview.listing.id, selectedReview.decision, note.trim(), selectedReview.listing.version!);
      setReview(null); setNote('');
    } catch (failure) { setError(remoteErrorMessage(failure)); }
    finally { setBusy(false); }
  }
  function openReview(listing: Listing, decision: ReviewDecision) {
    if (!user || listing.ownerId === user.id) return;
    setError(''); setNote(''); setReview({ listing, decision, actorId: user.id });
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Revisión" subtitle="Viviendas pendientes de publicación." back />
      {!user ? <AccountPrompt returnTo="/admin" /> : !isAdmin || mode !== 'cloud' ?
        <EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Esta sección está disponible para las cuentas administradoras de KarmaHouse." /> : <>
          <Button label="Actualizar pendientes" secondary icon="refresh-outline" loading={loading} disabled={busy} onPress={reload} />
          {error && !selectedReview ? <Notice error>{error}</Notice> : null}
          {loading && moderationQueue.length === 0 ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : moderationQueue.length === 0 ?
            error ? <EmptyState icon="cloud-offline-outline" title="No pudimos cargar los anuncios" description="Actualiza la lista cuando recuperes la conexión para comprobar los pendientes." /> :
            <EmptyState icon="checkmark-circle-outline" title="Todo revisado" description="No hay anuncios pendientes de revisión en este momento." /> :
            <View style={styles.list}>
              <Text style={styles.count}>{moderationQueue.length} {moderationQueue.length === 1 ? 'anuncio pendiente' : 'anuncios pendientes'}</Text>
              {moderationQueue.map((listing) => <View key={listing.id} style={styles.card}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                  {(listing.photos ?? []).map((photo, index) => <PropertyImage key={photo.storagePath ?? index} listing={listing} photoIndex={index} style={styles.photo} />)}
                </ScrollView>
                <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
                <Text style={styles.price}>{formatMoney(listing.price)} USD</Text>
                <Text style={styles.meta}>{listing.type} · {listing.location}, {listing.province}</Text>
                <Text style={styles.meta}>{listing.bedrooms} hab. · {listing.bathrooms} baños · {listing.area} m²</Text>
                <Text style={styles.description}>{listing.description}</Text>
                {listing.amenities.length > 0 && <Text style={styles.meta}>{listing.amenities.join(' · ')}</Text>}
                {listing.ownerId === user.id ? <Notice>Este anuncio es tuyo. Otra cuenta administradora debe revisarlo.</Notice> :
                  <View style={styles.actions}>
                    <Button label="Aprobar" icon="checkmark-outline" onPress={() => openReview(listing, 'approved')} disabled={loading || busy} style={styles.action} />
                    <Button label="Pedir cambios" secondary icon="create-outline" onPress={() => openReview(listing, 'rejected')} disabled={loading || busy} style={styles.action} />
                  </View>}
              </View>)}
            </View>}
        </>}
    </ScrollView>
    <Modal visible={!!selectedReview} transparent animationType="fade" onRequestClose={() => !busy && setReview(null)}>
      <View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}>
        <Text accessibilityRole="header" style={styles.modalTitle}>{selectedReview?.decision === 'approved' ? 'Aprobar anuncio' : 'Solicitar cambios'}</Text>
        <Text style={styles.description}>{selectedReview?.listing.title}</Text>
        {selectedReview?.decision === 'approved' ? <Text style={styles.meta}>El anuncio estará disponible en el catálogo mientras su propietario lo mantenga activo.</Text> : <>
          <Text style={styles.label}>Motivo para el propietario</Text>
          <TextInput accessibilityLabel="Motivo del rechazo" value={note} onChangeText={setNote} multiline maxLength={1000} editable={!busy} placeholder="Explica qué información o fotografía debe corregir." placeholderTextColor={colors.muted} style={styles.input} />
        </>}
        {error ? <Notice error>{error}</Notice> : null}
        <Button label={selectedReview?.decision === 'approved' ? 'Confirmar aprobación' : 'Enviar motivo'} loading={busy} disabled={selectedReview?.decision === 'rejected' && !note.trim()} onPress={confirmReview} />
        <Button label="Cancelar" secondary disabled={busy} onPress={() => setReview(null)} />
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: 820, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 28, gap: 10 },
  loader: { marginVertical: 40 }, list: { gap: 20, marginTop: 12 }, count: { color: colors.muted, fontSize: 14, marginLeft: 4 },
  card: { backgroundColor: colors.white, padding: 20, borderRadius: 24, gap: 10 },
  photos: { gap: 10, marginBottom: 8 }, photo: { width: 232, height: 172, borderRadius: 16 },
  title: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -.5 },
  price: { color: colors.ink, fontSize: 20, fontWeight: '600' }, meta: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  description: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, action: { flex: 1, minWidth: 150 },
  backdrop: { flex: 1, backgroundColor: '#00000050', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: colors.white, borderRadius: 26, padding: 24, gap: 15, width: '100%', maxWidth: 480, alignSelf: 'center' },
  modalTitle: { fontSize: 24, fontWeight: '600', letterSpacing: -.5, color: colors.ink }, label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  input: { minHeight: 128, backgroundColor: colors.paper, borderRadius: 16, padding: 15, fontSize: 16, lineHeight: 23, color: colors.ink, textAlignVertical: 'top' },
});
