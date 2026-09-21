import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { accountProfileError } from '../auth/accountProfile';
import { pickAccountAvatar, type PreparedAvatar } from '../auth/prepareAvatar';
import { isSupabaseConfigured } from '../lib/supabase';
import { AccountPrompt } from '../components/AccountPrompt';
import { UserAvatar } from '../components/account/UserAvatar';
import { Button, EmptyState, Icon, Notice, PageTitle } from '../components/ui';
import { colors } from '../theme';

export default function AccountSettingsScreen() {
  const auth = useAuth();
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PageTitle title="Ajustes de cuenta" back />
        {!isSupabaseConfigured ? <EmptyState icon="person-outline" title="Tu perfil, a tu manera" description="La foto y el nombre de tu cuenta estarán disponibles con el servicio conectado." /> : !auth.ready ? <ActivityIndicator color={colors.primary} style={styles.loading} /> : !auth.user ? <AccountPrompt returnTo="/account-settings" title="Tu perfil, a tu manera" description="Inicia sesión para personalizar el nombre y la foto de tu cuenta." /> : !auth.profileReady ? <View style={styles.card}><Notice error={!!auth.error}>{auth.error || 'Cargando tu perfil…'}</Notice><Button label="Volver a cargar perfil" secondary onPress={() => void auth.refreshProfile()} /></View> : <AccountSettingsForm key={auth.user.id} ownerId={auth.user.id} />}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function AccountSettingsForm({ ownerId }: { ownerId: string }) {
  const auth = useAuth();
  const [name, setName] = useState(auth.displayName);
  const [avatar, setAvatar] = useState<PreparedAvatar | null | undefined>(undefined);
  const [busy, setBusy] = useState<'photo' | 'save' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const mounted = useRef(true);
  const locked = useRef(false);
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
    if (locked.current) return;
    locked.current = true; setBusy('photo'); setError(''); setSaved(false);
    try { const next = await pickAccountAvatar(checkpoint); checkpoint(); if (next) setAvatar(next); }
    catch (failure) { if (mounted.current) setError(accountProfileError(failure)); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  async function save() {
    if (locked.current) return;
    locked.current = true; setBusy('save'); setError(''); setSaved(false);
    try { checkpoint(); await auth.saveProfile({ displayName: name, avatar }); checkpoint(); setName(name.trim()); setAvatar(undefined); setSaved(true); }
    catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : 'No pudimos guardar los cambios.'); }
    finally { locked.current = false; if (mounted.current) setBusy(null); }
  }
  const changed = name.trim() !== auth.displayName || avatar !== undefined;
  const preview = avatar === undefined ? auth.avatarUrl : avatar?.previewUri ?? null;
  return <View style={styles.form}>
    <View style={[styles.card, styles.photoCard]}>
      <View style={styles.avatarFrame}><UserAvatar size={104} name={name} avatarUrl={preview} /><View pointerEvents="none" style={styles.photoAccent}><Icon name="camera-outline" size={17} color={colors.primary} /></View></View>
      <View style={styles.photoCopy}><Text style={styles.cardTitle}>Tu foto de perfil</Text><Text style={styles.description}>Elige una foto para tu cuenta. Se recorta en formato cuadrado y se optimiza antes de guardar.</Text></View>
      <View style={styles.photoActions}><Button label={preview || auth.hasAvatar ? 'Cambiar foto' : 'Elegir foto'} secondary icon="image-outline" onPress={selectPhoto} loading={busy === 'photo'} disabled={!!busy} style={styles.photoButton} />{(avatar ? true : avatar === undefined && auth.hasAvatar) && <Button label="Quitar foto" secondary onPress={() => { setAvatar(null); setSaved(false); }} disabled={!!busy} style={styles.photoButton} />}</View>
      <Text style={styles.privacy}>La foto se muestra solo en tu cuenta.</Text>
    </View>
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Información de tu cuenta</Text>
      <View style={styles.field}><Text style={styles.label}>Nombre</Text><TextInput accessibilityLabel="Nombre de tu cuenta" value={name} onChangeText={value => { setName(value); setSaved(false); }} editable={!busy} maxLength={80} autoCapitalize="words" style={styles.input} placeholder="Tu nombre" placeholderTextColor={colors.muted} /><Text style={styles.description}>Tu nombre en las conversaciones de KarmaHouse.</Text></View>
      <View style={styles.field}><Text style={styles.label}>Correo electrónico</Text><Text selectable style={styles.email}>{auth.user?.email}</Text><Text style={styles.description}>Correo asociado a tu cuenta.</Text></View>
    </View>
    {error || auth.error ? <Notice error>{error || auth.error}</Notice> : null}
    {saved && <View accessibilityLiveRegion="polite" style={styles.success}><Icon name="checkmark-circle" size={19} color={colors.green} /><Text style={styles.successText}>Cambios guardados.</Text></View>}
    <Button label="Guardar cambios" onPress={save} loading={busy === 'save'} disabled={!!busy || !changed} />
    {changed && <Button label="Descartar cambios" secondary disabled={!!busy} onPress={() => { setName(auth.displayName); setAvatar(undefined); setError(''); setSaved(false); }} />}
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Tus avisos</Text>
      <Text style={styles.description}>Elige qué novedades quieres ver en la bandeja de KarmaHouse.</Text>
      <Button label="Preferencias de notificaciones" secondary icon="notifications-outline" onPress={() => router.push('/notification-settings')} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 36 }, loading: { padding: 40 },
  form: { gap: 18 }, card: { backgroundColor: colors.white, borderWidth: 1, borderColor: '#E5ECF5', borderRadius: 25, padding: 22, gap: 22 }, photoCard: { backgroundColor: '#EFF5FD', alignItems: 'center', gap: 17 },
  avatarFrame: { position: 'relative' }, photoAccent: { position: 'absolute', bottom: 0, right: -3, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, borderWidth: 2, borderColor: '#EFF5FD', alignItems: 'center', justifyContent: 'center' },
  photoCopy: { alignItems: 'center', gap: 7, maxWidth: 360 }, cardTitle: { color: colors.ink, fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.35 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' }, photoButton: { flexGrow: 1, flexBasis: 140 }, privacy: { color: '#526B89', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  field: { gap: 8 }, label: { color: colors.muted, fontSize: 13, fontWeight: '500' }, input: { minHeight: 48, paddingVertical: 8, color: colors.ink, fontSize: 17, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, email: { color: colors.ink, fontSize: 16, lineHeight: 23 },
  success: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }, successText: { color: colors.green, fontSize: 14, fontWeight: '500' },
});
