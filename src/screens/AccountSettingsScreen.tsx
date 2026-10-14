import { useEffect, useRef, useState, type RefObject } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useConsultationRefresh } from '../lib/useConsultationRefresh';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { accountProfileError } from '../auth/accountProfile';
import { pickAccountAvatar, type PreparedAvatar } from '../auth/prepareAvatar';
import { isSupabaseConfigured } from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { UserAvatar } from '../components/account/UserAvatar';
import { AppearanceSettings } from '../components/AppearanceSettings';
import { ActionGroup, Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { createThemedStyles, internalLayout } from '../theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/publicSite';

export default function AccountSettingsScreen() {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const editing = useRef(false), formBusy = useRef(false);
  const reload = useConsultationRefresh(`${auth.user?.id}:${auth.session?.access_token}`, auth.refreshProfile, () => !auth.user || editing.current || formBusy.current);
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView alwaysBounceVertical contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={reload.refreshing} enabled={!!auth.user && !editing.current && !formBusy.current} onRefresh={() => void reload.refresh()} tintColor={colors.primary} colors={[colors.primary]} />}>
        <PageTitle compact title="Ajustes de cuenta" subtitle="Identidad, preferencias y privacidad." back />
        <AppearanceSettings />
        {!isSupabaseConfigured ? <EmptyState plain title="Perfil no disponible" description="La foto y el nombre de tu cuenta estarán disponibles con el servicio conectado." /> : !auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !auth.user ? <AccountPrompt returnTo="/account-settings" title="Personaliza tu cuenta" description="Inicia sesión para cambiar el nombre y la foto de tu cuenta." /> : !auth.profileReady ? <View style={styles.card}><Notice error={!!auth.error}>{auth.error || 'Cargando tu perfil…'} Desliza hacia abajo para volver a cargarlo.</Notice></View> : <AccountSettingsForm key={auth.user.id} ownerId={auth.user.id} editing={editing} locked={formBusy} refreshing={reload.isRefreshing} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AccountSettingsForm({ ownerId, editing, locked, refreshing }: { ownerId: string; editing: RefObject<boolean>; locked: RefObject<boolean>; refreshing(): boolean }) {
  const { colors, styles } = useStyles();
  const auth = useAuth();
  const [name, setName] = useState(auth.displayName);
  const [avatar, setAvatar] = useState<PreparedAvatar | null | undefined>(undefined);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
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
  async function selectPhoto() {
    if (locked.current || refreshing()) return;
    locked.current = true; setBusy('photo'); setError(''); setSaved(false);
    try { const next = await pickAccountAvatar(checkpoint); checkpoint(); if (next) setAvatar(next); }
    catch (failure) { if (mounted.current) setError(accountProfileError(failure)); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  async function save() {
    if (locked.current || refreshing()) return;
    locked.current = true; setBusy('save'); setError(''); setSaved(false);
    try { checkpoint(); await auth.saveProfile({ displayName: name, avatar }); checkpoint(); setName(name.trim()); setAvatar(undefined); setSaved(true); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No pudimos guardar los cambios.'); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  const changed = name.trim() !== auth.displayName || avatar !== undefined;
  editing.current = changed || deleting;
  const preview = avatar === undefined ? auth.avatarUrl : avatar?.previewUri ?? null;
  return <View style={styles.form}>
    <View style={styles.card}>
      <View style={styles.photoCard}>
        <UserAvatar size={64} name={name} avatarUrl={preview} />
        <View style={styles.photoCopy}><Text accessibilityRole="header" style={styles.cardTitle}>Foto de la cuenta</Text><Text style={styles.description}>Se recorta en formato cuadrado y se optimiza antes de guardar.</Text></View>
      </View>
      <ActionGroup><Button label={preview || auth.hasAvatar ? 'Cambiar foto' : 'Elegir foto'} secondary icon="image-outline" onPress={selectPhoto} loading={busy === 'photo'} disabled={!!busy} />{(avatar ? true : avatar === undefined && auth.hasAvatar) && <Button label="Quitar foto" secondary onPress={() => { setAvatar(null); setSaved(false); }} disabled={!!busy} />}</ActionGroup>
      <Text style={styles.privacy}>La foto se muestra solo en tu cuenta.</Text>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Información personal</Text>
      <View style={styles.field}><Text style={styles.label}>Nombre</Text><TextInput accessibilityLabel="Nombre de tu cuenta" value={name} onChangeText={value => { setName(value); setSaved(false); }} editable={!busy} maxLength={80} autoCapitalize="words" style={styles.input} placeholder="Tu nombre" placeholderTextColor={colors.muted} /><Text style={styles.description}>Tu nombre en las conversaciones de KarmaHouse.</Text></View>
      <View style={styles.field}><Text style={styles.label}>Correo electrónico</Text><Text selectable style={styles.email}>{auth.user?.email}</Text><Text style={styles.description}>Correo asociado a tu cuenta.</Text></View>
    </View>
    {error || auth.error ? <Notice error>{error || auth.error}</Notice> : null}
    {saved && <View accessibilityLiveRegion="polite" style={styles.success}><Icon name="checkmark-circle" size={19} color={colors.green} /><Text style={styles.successText}>Cambios guardados.</Text></View>}
    <ActionGroup><Button label="Guardar cambios" onPress={save} loading={busy === 'save'} disabled={!!busy || !changed} />
    {changed && <Button label="Descartar cambios" secondary disabled={!!busy} onPress={() => { setName(auth.displayName); setAvatar(undefined); setError(''); setSaved(false); }} />}</ActionGroup>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Notificaciones</Text>
      <Text style={styles.description}>Elige qué novedades quieres ver en la bandeja de KarmaHouse.</Text>
      <Button label="Preferencias de notificaciones" secondary icon="notifications-outline" onPress={() => router.push('/notification-settings')} />
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>KarmaHouse Pro</Text>
      <Text style={styles.description}>Consulta tu estado o canjea un código.</Text>
      <Button label="Ver mi Pro" secondary icon="star-outline" onPress={() => router.push('/pro')} />
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Privacidad</Text>
      <View style={styles.links}>
        <Pressable accessibilityRole="link" style={styles.legalRow} onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={styles.link}>Política de privacidad</Text><Icon name="open-outline" size={18} color={colors.muted} /></Pressable>
        <Pressable accessibilityRole="link" style={styles.legalRow} onPress={() => void Linking.openURL(TERMS_URL)}><Text style={styles.link}>Términos de uso</Text><Icon name="open-outline" size={18} color={colors.muted} /></Pressable>
      </View>
    </View>
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>Eliminar cuenta</Text>
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
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (busy) return;
    setBusy(true); setError('');
    try { await auth.deleteAccount(); onClose(); router.replace('/'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'No pudimos eliminar tu cuenta. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onClose()}>
    <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
        <Text accessibilityRole="header" style={styles.sheetTitle}>¿Eliminar tu cuenta?</Text>
        <Text style={styles.sheetText}>Se borran para siempre tus anuncios y sus fotos, tus favoritos, tus conversaciones, visitas y ofertas, tus avisos y tu perfil. No se puede deshacer.</Text>
        <Text style={styles.description}>Los reportes enviados a moderación se conservan sin tus datos de cuenta.</Text>
        {error ? <Notice error>{error}</Notice> : null}
        <ActionGroup direction="vertical"><Pressable accessibilityRole="button" accessibilityLabel={error ? 'Reintentar eliminación' : 'Eliminar definitivamente'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={({ pressed }) => [styles.dangerFilled, (pressed || busy) && { opacity: .7 }]}>
          {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.dangerFilledText}>{error ? 'Reintentar eliminación' : 'Eliminar definitivamente'}</Text>}
        </Pressable>
        <Button label="Cancelar" secondary disabled={busy} onPress={onClose} /></ActionGroup>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 36 }, loading: { padding: 40 },
  form: { gap: 20 }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: internalLayout.radius, padding: 16, gap: 16 }, photoCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  photoCopy: { flex: 1, minWidth: 0, gap: 6 }, cardTitle: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3 }, description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  privacy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  field: { gap: 8 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' }, input: { minHeight: 52, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, fontSize: 17 }, email: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  links: { gap: 0 }, legalRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, link: { flex: 1, color: colors.primary, fontSize: 16, lineHeight: 23, fontWeight: '500' },
  danger: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }, dangerText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay, justifyContent: 'center', paddingHorizontal: 20 }, sheet: { width: '100%', maxWidth: 520, maxHeight: '100%', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: internalLayout.radius, overflow: 'hidden' }, sheetContent: { padding: 20, gap: 16 },
  sheetTitle: { color: colors.ink, fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -.5 }, sheetText: { color: colors.ink, fontSize: 16, lineHeight: 24 },
  dangerFilled: { minHeight: 52, borderRadius: 14, backgroundColor: colors.dangerFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12 }, dangerFilledText: { color: colors.onPrimary, fontSize: 16, lineHeight: 23, fontWeight: '600', textAlign: 'center' },
  success: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }, successText: { color: colors.green, fontSize: 14, fontWeight: '500' },
}));
