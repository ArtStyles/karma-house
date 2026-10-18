import { useEffect, useRef, useState, type RefObject } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sheet } from '../components/Sheet';
import { setDataSaver, useDataSaver } from '../settings/useDataSaver';
import { useReducedMotion } from '../settings/useReducedMotion';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { accountProfileError } from '../auth/accountProfile';
import { pickAccountAvatar, type PreparedAvatar } from '../auth/prepareAvatar';
import { isSupabaseConfigured } from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { UserAvatar } from '../components/account/UserAvatar';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { ActionGroup, Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/publicSite';

export default function AccountSettingsScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const editing = useRef(false), formBusy = useRef(false);
  const reload = useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}`, auth.refreshProfile, () => !auth.user || editing.current || formBusy.current);
  // A new object each time, so the same text twice still restarts its timer.
  const [toast, setToast] = useState<{ text: string } | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 3000); return () => clearTimeout(timer); }, [toast]);
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!!auth.user && !editing.current && !formBusy.current} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
        <PageTitle compact title="Ajustes de cuenta" subtitle="Identidad, preferencias y privacidad." back fallback="/profile" />
        <AppearanceSettings />
        <DevicePreferences />
        {!isSupabaseConfigured ? <EmptyState plain title="Perfil no disponible" description="La foto y el nombre de tu cuenta estarán disponibles con el servicio conectado." /> : !auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !auth.user ? <AccountPrompt returnTo="/account-settings" title="Personaliza tu cuenta" description="Inicia sesión para cambiar el nombre y la foto de tu cuenta." /> : !auth.profileReady ? <View style={styles.card}>{auth.error ? <Notice error onRetry={() => void reload.refresh()}>{auth.error}</Notice> : <ActivityIndicator accessibilityLabel="Cargando tu perfil" color={colors.primary} />}</View> : <AccountSettingsForm key={auth.user.id} ownerId={auth.user.id} editing={editing} locked={formBusy} refreshing={reload.isRefreshing} onPhotoSaved={text => setToast({ text })} />}
      </ScrollView>
      {toast && <View pointerEvents="none" style={styles.toast}><Icon name="checkmark-circle" size={19} color={colors.inverseInk} /><Text accessibilityLiveRegion="polite" style={styles.toastText}>{toast.text}</Text></View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AccountSettingsForm({ ownerId, editing, locked, refreshing, onPhotoSaved }: { ownerId: string; editing: RefObject<boolean>; locked: RefObject<boolean>; refreshing(): boolean; onPhotoSaved(text: string): void }) {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const [name, setName] = useState(auth.displayName);
  // The photo on its way to the server: shown while it uploads, dropped if it fails.
  const [uploading, setUploading] = useState<PreparedAvatar | null | undefined>(undefined);
  const [busy, setBusy] = useState<'photo' | 'upload' | 'remove' | 'save' | null>(null);
  const [photoError, setPhotoError] = useState('');
  // What «Reintentar» sends again; undefined reopens the gallery.
  const failedPhoto = useRef<PreparedAvatar | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mounted = useRef(true);
  const previousProfileName = useRef(auth.displayName);
  const currentActor = useRef(auth.user?.id); currentActor.current = auth.user?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const previous = previousProfileName.current;
    previousProfileName.current = auth.displayName;
    // A screen below the current route can stay mounted while another instance saves the profile.
    // Adopt fresh account data only when the local name still matches its original value.
    setName(current => current.trim() === previous ? auth.displayName : current);
  }, [auth.displayName]);
  function checkpoint() { if (!mounted.current || currentActor.current !== ownerId) throw new Error('KH_ACCOUNT_CHANGED'); }
  /** A photo saves the moment it is chosen (`null` removes it); with no argument, the gallery opens first. */
  async function changePhoto(chosen?: PreparedAvatar | null) {
    if (locked.current || refreshing()) return;
    locked.current = true; setPhotoError(''); setSaved(false);
    let next = chosen;
    try {
      if (next === undefined) { setBusy('photo'); next = await pickAccountAvatar(checkpoint); checkpoint(); if (!next) return; }
      setBusy(next ? 'upload' : 'remove'); setUploading(next);
      await auth.saveAvatar(next); checkpoint();
      failedPhoto.current = undefined;
      onPhotoSaved(next ? 'Foto actualizada.' : 'Foto quitada.');
    } catch (failure) {
      if (mounted.current) { failedPhoto.current = next; setPhotoError(accountProfileError(failure, 'No pudimos preparar la foto. Elige otra y vuelve a intentarlo.')); }
    } finally { locked.current = false; if (mounted.current) { setBusy(null); setUploading(undefined); } }
  }
  async function save() {
    if (locked.current || refreshing()) return;
    locked.current = true; setBusy('save'); setError(''); setSaved(false);
    try { checkpoint(); await auth.saveProfile({ displayName: name }); checkpoint(); setName(name.trim()); setSaved(true); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No pudimos guardar los cambios.'); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  const changed = name.trim() !== auth.displayName;
  editing.current = changed || deleting;
  const preview = uploading === undefined ? auth.avatarUrl : uploading?.previewUri ?? null;
  const sending = busy === 'upload' || busy === 'remove';
  return <View style={styles.form}>
    <View style={styles.card}>
      <View style={styles.photoCard}>
        <View accessibilityState={{ busy: sending }}>
          <UserAvatar size={64} name={name} avatarUrl={preview} />
          {sending && <View style={styles.avatarBusy}><ActivityIndicator color={colors.onDark} /></View>}
        </View>
        <View style={styles.photoCopy}><Text accessibilityRole="header" style={styles.cardTitle}>Foto de la cuenta</Text><Text accessibilityLiveRegion="polite" style={styles.description}>{busy === 'upload' ? 'Subiendo foto…' : busy === 'remove' ? 'Quitando foto…' : 'Se recorta en cuadrado, se optimiza y se guarda en cuanto la eliges.'}</Text></View>
      </View>
      {photoError ? <Notice error onRetry={() => void changePhoto(failedPhoto.current)}>{photoError}</Notice> : null}
      <ActionGroup><Button label={preview || auth.hasAvatar ? 'Cambiar foto' : 'Elegir foto'} secondary icon="image-outline" onPress={() => void changePhoto()} loading={busy === 'photo' || busy === 'upload'} disabled={!!busy} />{auth.hasAvatar && <Button label="Quitar foto" secondary onPress={() => void changePhoto(null)} loading={busy === 'remove'} disabled={!!busy} />}</ActionGroup>
      <Text style={styles.privacy}>La foto se muestra solo en tu cuenta.</Text>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Información personal</Text>
      <View style={styles.field}><Text style={styles.label}>Nombre</Text><TextInput accessibilityLabel="Nombre de tu cuenta" value={name} onChangeText={value => { setName(value); setSaved(false); }} editable={!busy} maxLength={80} autoCapitalize="words" style={styles.input} placeholder="Tu nombre" placeholderTextColor={colors.muted} /><Text style={styles.description}>Tu nombre en las conversaciones de KarmaHouse.</Text></View>
      <View style={styles.field}><Text style={styles.label}>Correo electrónico</Text><View style={styles.locked}><Text selectable numberOfLines={1} style={styles.email}>{auth.user?.email}</Text><Icon name="lock-closed-outline" size={16} color={colors.muted} /></View><Text style={styles.description}>Correo asociado a tu cuenta.</Text></View>
    </View>
    {error || auth.error ? <Notice error>{error || auth.error}</Notice> : null}
    {saved && <View accessibilityLiveRegion="polite" style={styles.success}><Icon name="checkmark-circle" size={19} color={colors.green} /><Text style={styles.successText}>Cambios guardados.</Text></View>}
    <ActionGroup><Button label="Guardar cambios" onPress={save} loading={busy === 'save'} disabled={!!busy || !changed} />
    {changed && <Button label="Descartar cambios" secondary disabled={!!busy} onPress={() => { setName(auth.displayName); setError(''); setSaved(false); }} />}</ActionGroup>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Notificaciones</Text>
      <Text style={styles.description}>Elige qué novedades quieres ver en la bandeja de KarmaHouse.</Text>
      <Button label="Preferencias de notificaciones" secondary icon="notifications-outline" onPress={() => router.push('/notification-settings')} />
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Privacidad</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" style={styles.legalRow} onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={styles.link}>Política de privacidad</Text><Icon name="open-outline" size={18} color={colors.muted} /></Pressable>
        <Pressable accessibilityRole="link" style={styles.legalRow} onPress={() => void Linking.openURL(TERMS_URL)}><Text style={styles.link}>Términos de uso</Text><Icon name="open-outline" size={18} color={colors.muted} /></Pressable>
      </View>
    </View>
    <View style={[styles.card, styles.dangerCard]}>
      <Text accessibilityRole="header" style={[styles.cardTitle, styles.dangerTitle]}>Eliminar cuenta</Text>
      <Text style={styles.description}>La eliminación borra tus datos de forma permanente.</Text>
      {auth.isOwner ? <Notice>La cuenta propietaria está protegida. Para eliminarla, primero debe transferirse la propiedad de KarmaHouse.</Notice> : <Pressable accessibilityRole="button" disabled={!!busy} onPress={() => setDeleting(true)} style={({ pressed }) => [styles.danger, pressed && { opacity: .7 }]}>
        <Icon name="trash-outline" size={19} color={colors.danger} /><Text style={styles.dangerText}>Eliminar cuenta</Text>
      </Pressable>}
    </View>
    <DeleteAccountSheet visible={deleting} onClose={() => setDeleting(false)} />
  </View>;
}

function DeleteAccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const { agencies, error: agenciesError } = useAgencyWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Once the server began, listings and agency memberships are already gone: the account can only be finished.
  const [started, setStarted] = useState(false);
  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { await auth.deleteAccount(); onClose(); router.replace('/'); }
    catch (failure) {
      if ((failure as { started?: unknown })?.started === true) setStarted(true);
      setError(failure instanceof Error ? failure.message : 'No pudimos eliminar tu cuenta. Vuelve a intentarlo.');
    }
    finally { setBusy(false); }
  }
  const teams = agencies.map(agency => agency.tradeName).join(', ');
  return <Sheet visible={visible} onClose={() => { if (!busy) onClose(); }}>
    <View style={styles.warning}><Icon name="trash-outline" size={22} color={colors.danger} /></View>
    <Text accessibilityRole="header" style={styles.sheetTitle}>¿Eliminar tu cuenta?</Text>
    <Text style={styles.sheetText}>Se borran para siempre tus anuncios y sus fotos, tus favoritos, tus conversaciones, visitas y ofertas, tus avisos y tu perfil. <Text style={styles.irreversible}>No se puede deshacer.</Text></Text>
    {/* A suspended account or a failed load has no list here, but the server still removes the memberships. */}
    {teams || auth.suspended || agenciesError ? <View style={styles.fact}><Icon name="information-circle-outline" size={16} color={colors.muted} /><Text style={styles.factText}>{teams ? `También sales de ${teams}.` : 'Si perteneces a alguna inmobiliaria, también sales de su equipo.'} Si eres la única persona que administra una inmobiliaria, quedará suspendida hasta que KarmaHouse la recupere.</Text></View> : null}
    <View style={styles.fact}><Icon name="information-circle-outline" size={16} color={colors.muted} /><Text style={styles.factText}>Los reportes enviados a moderación se conservan sin tus datos de cuenta.</Text></View>
    {error ? <Notice error>{error}</Notice> : null}
    {started ? <Text style={styles.description}>Si sales ahora, podrás terminar después en Ajustes de cuenta › Eliminar cuenta.</Text> : null}
    <ActionGroup direction="vertical"><Pressable accessibilityRole="button" accessibilityLabel={error ? 'Reintentar eliminación' : 'Eliminar definitivamente'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={({ pressed }) => [styles.dangerFilled, (pressed || busy) && { opacity: .7 }]}>
      {busy ? <ActivityIndicator color={colors.onDark} /> : <Text style={styles.dangerFilledText}>{error ? 'Reintentar eliminación' : 'Eliminar definitivamente'}</Text>}
    </Pressable>
    <Button label={started ? 'Terminar más tarde' : 'Cancelar'} secondary disabled={busy} onPress={onClose} /></ActionGroup>
  </Sheet>;
}

/** Device settings, for guests too: they live on this phone, not in the account. */
function DevicePreferences() {
  const { colors, styles } = useStyles();
  const dataSaver = useDataSaver();
  const reduced = useReducedMotion();
  return <View style={styles.devices}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>En este dispositivo</Text>
    <View style={styles.group}>
      <View style={[styles.preference, styles.preferenceBorder]}>
        <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Ahorro de datos</Text><Text style={styles.description}>Fotos al tocar; mapa al pedirlo.</Text></View>
        <Switch accessibilityLabel="Ahorro de datos" accessibilityHint="Carga fotos solo cuando las tocas y no descarga el mapa hasta que lo pidas." hitSlop={10} value={dataSaver} onValueChange={setDataSaver} trackColor={{ false: colors.switchTrack, true: colors.primary }} thumbColor={colors.switchThumb} ios_backgroundColor={colors.switchTrack} />
      </View>
      {/* KarmaHouse has no switch of its own: it follows the device, so the row says which way it is set. */}
      <View accessible accessibilityLabel={`Reducir movimiento: ${reduced ? 'activado' : 'desactivado'} en tu dispositivo`} style={styles.preference}>
        <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>Reducir movimiento</Text><Text style={styles.description}>KarmaHouse sigue el ajuste de tu dispositivo: sin desplazamientos, solo fundidos.</Text></View>
        <Text style={[styles.state, reduced && styles.stateOn]}>{reduced ? 'Activado' : 'Desactivado'}</Text>
      </View>
    </View>
  </View>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 36 }, loading: { padding: 40 },
  form: { gap: 20 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.card, padding: 16, gap: 14 }, photoCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  photoCopy: { flex: 1, minWidth: 0, gap: 6 }, cardTitle: { ...typography.section, color: colors.ink }, description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  field: { gap: 8 }, label: { color: colors.body, fontSize: 13, lineHeight: 18, fontWeight: '600', paddingHorizontal: 4 },
  input: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.pill, backgroundColor: colors.paper, color: colors.ink, fontSize: 16 },
  locked: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderRadius: rounded.pill, backgroundColor: colors.softNeutral }, email: { flex: 1, minWidth: 0, color: colors.body, fontSize: 16, lineHeight: 22 },
  links: { gap: 0 }, legalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, link: { flex: 1, color: colors.primary, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  dangerCard: { backgroundColor: colors.softDanger, borderColor: colors.softDanger }, dangerTitle: { color: colors.danger },
  danger: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: rounded.pill, borderWidth: 1, borderColor: colors.danger }, dangerText: { color: colors.danger, fontSize: 15, fontWeight: '600' },
  warning: { width: 52, height: 52, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softDanger },
  sheetTitle: { ...typography.sheetTitle, color: colors.ink }, sheetText: { color: colors.ink, fontSize: 15, lineHeight: 22 }, irreversible: { color: colors.danger, fontWeight: '700' },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, factText: { flex: 1, color: colors.body, fontSize: 13, lineHeight: 18 },
  dangerFilled: { minHeight: 56, borderRadius: rounded.pill, backgroundColor: colors.dangerFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 }, dangerFilledText: { color: colors.onDark, fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  success: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }, successText: { color: colors.green, fontSize: 14, fontWeight: '500' },
  avatarBusy: { ...StyleSheet.absoluteFill, borderRadius: rounded.pill, backgroundColor: colors.photoOverlay, alignItems: 'center', justifyContent: 'center' },
  // The inverted toast of DESIGN.md: ink ground, floating at the foot of the screen.
  toast: { position: 'absolute', left: 16, right: 16, bottom: 16, maxWidth: 560, alignSelf: 'center', minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: rounded.pill, backgroundColor: colors.inverseSurface, boxShadow: '0 12px 28px rgba(0,0,0,0.35)' },
  toastText: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.inverseInk },
  devices: { gap: 10, marginBottom: 24 }, sectionTitle: { ...typography.section, color: colors.ink, paddingHorizontal: 4 },
  group: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.card, overflow: 'hidden' },
  preference: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 }, preferenceBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  preferenceCopy: { flex: 1, minWidth: 0, gap: 2 }, preferenceTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  state: { color: colors.muted, fontSize: 13, fontWeight: '600' }, stateOn: { color: colors.primary },
}));
