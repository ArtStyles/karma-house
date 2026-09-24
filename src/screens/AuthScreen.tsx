import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { safeReturnTo } from '../auth/callback';
import { Brand, Button, goBack, Icon, IconButton, Notice, type IconName } from '../components/ui';
import { isSupabaseConfigured } from '../lib/supabase';
import { colors, typefaces } from '../theme';
import { PRIVACY_URL, TERMS_URL } from '../lib/publicSite';

type Mode = 'signin' | 'signup' | 'forgot' | 'recovery';
const initialMode = (value: unknown): Mode => value === 'signup' || value === 'recovery' || value === 'forgot' ? value : 'signin';

export default function AuthScreen() {
  const params = useLocalSearchParams<{ mode?: string; returnTo?: string }>();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(() => initialMode(params.mode));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [notice, setNotice] = useState<'confirmation' | 'reset' | 'updated' | null>(null);
  const returnTo = safeReturnTo(params.returnTo) as Href;
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmationRef = useRef<TextInput>(null);

  useEffect(() => { setMode(initialMode(params.mode)); }, [params.mode]);
  useEffect(() => {
    if (auth.ready && auth.user && mode !== 'recovery' && mode !== 'forgot' && !submitting && !notice) router.replace(returnTo);
  }, [auth.ready, auth.user, mode, returnTo, submitting, notice]);

  function changeMode(next: Mode) {
    if (submitting) return;
    setMode(next); setIssue(null); setNotice(null); setPassword(''); setConfirmation('');
  }

  async function submit() {
    if (submitting || !auth.ready) return;
    setIssue(null); setSubmitting(true);
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await auth.signUp(name, email, password);
        if (needsConfirmation) { setNotice('confirmation'); setPassword(''); } else router.replace(returnTo);
      } else if (mode === 'forgot') {
        await auth.requestPasswordReset(email); setNotice('reset');
      } else if (mode === 'recovery') {
        if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
        await auth.updatePassword(password); setNotice('updated'); setPassword(''); setConfirmation('');
      } else { await auth.signIn(email, password); router.replace(returnTo); }
    } catch (error) {
      setIssue(error instanceof Error ? error.message : 'No se pudo completar la operación. Inténtalo de nuevo.');
    } finally { setSubmitting(false); }
  }

  const title = mode === 'signup' ? 'Tu próximo hogar\nempieza aquí.' : mode === 'forgot' ? 'Volvamos a\ntu cuenta.' : mode === 'recovery' ? 'Una nueva\ncontraseña.' : 'Qué bueno\nverte de nuevo.';
  const subtitle = mode === 'signup' ? 'Guarda tus favoritos y publica tu vivienda con una sola cuenta.' : mode === 'forgot' ? 'Escribe tu correo para solicitar un enlace de recuperación.' : mode === 'recovery' ? 'Elige una contraseña segura para volver a tu espacio.' : 'Entra para continuar con tus favoritos y tus anuncios.';
  const submitLabel = mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Solicitar enlace' : mode === 'recovery' ? 'Guardar contraseña' : 'Entrar';
  const hasRecoverySession = mode !== 'recovery' || Boolean(auth.user);

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <KeyboardAvoidingView style={styles.flex} behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.topBar}>
          <IconButton name="chevron-back" label="Volver" onPress={() => mode === 'forgot' ? changeMode('signin') : goBack('/profile')} />
          <Brand height={22} />
          <View style={styles.backSpace} />
        </View>
        <View style={styles.content}>
          <View style={styles.symbol}><Icon name={mode === 'forgot' || mode === 'recovery' ? 'key-outline' : 'person-outline'} size={29} color={colors.primary} /></View>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {!isSupabaseConfigured ? <View style={styles.form}>
            <Notice>Estás en la demostración local. Las cuentas estarán disponibles cuando se conecte el servicio.</Notice>
            <Button label="Seguir explorando" onPress={() => router.replace('/')} />
          </View> : !auth.ready ? <ActivityIndicator style={{ marginTop: 36 }} size="large" color={colors.primary} /> : notice ? <View style={styles.successCard}>
            <View style={styles.successIcon}><Icon name={notice === 'updated' ? 'checkmark' : 'mail-outline'} color={colors.green} size={26} /></View>
            <Text style={styles.cardTitle}>{notice === 'updated' ? 'Contraseña actualizada' : 'Revisa tu correo'}</Text>
            <Text style={styles.cardCopy}>{notice === 'confirmation'
              ? 'Si el registro puede completarse con esta dirección, encontrarás un enlace para confirmar tu cuenta. Revisa también spam y ábrelo en este dispositivo.'
              : notice === 'reset' ? 'Si existe una cuenta con ese correo, busca el enlace de recuperación. Revisa también spam y ábrelo en este dispositivo.'
                : 'Ya puedes continuar en tu espacio con tu nueva contraseña.'}</Text>
            <Button label={notice === 'updated' ? 'Ir a mi espacio' : 'Volver a entrar'} onPress={() => notice === 'updated' ? router.replace(returnTo) : changeMode('signin')} />
          </View> : !hasRecoverySession ? <View style={styles.form}>
            <Notice error>Abre el enlace de recuperación que solicitaste para elegir tu nueva contraseña.</Notice>
            <Button label="Solicitar otro enlace" onPress={() => changeMode('forgot')} />
          </View> : <View style={styles.form}>
            {(mode === 'signin' || mode === 'signup') && <View style={styles.segment}>
              {(['signin', 'signup'] as const).map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: mode === item, disabled: submitting }} disabled={submitting} onPress={() => changeMode(item)} style={[styles.segmentItem, mode === item && styles.segmentSelected]}>
                <Text style={[styles.segmentText, mode === item && styles.segmentTextSelected]}>{item === 'signin' ? 'Entrar' : 'Crear cuenta'}</Text>
              </Pressable>)}
            </View>}
            {mode === 'signup' && <Field label="Nombre público" icon="person-outline" value={name} onChangeText={setName} editable={!submitting} autoComplete="name" textContentType="name" autoCapitalize="words" maxLength={80} placeholder="Cómo quieres que te llamemos" returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => emailRef.current?.focus()} />}
            {mode !== 'recovery' && <Field label="Correo electrónico" icon="mail-outline" value={email} onChangeText={setEmail} editable={!submitting} autoComplete="email" textContentType="emailAddress" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" maxLength={254} placeholder="tu@correo.com" inputRef={emailRef} returnKeyType={mode === 'forgot' ? 'go' : 'next'} submitBehavior={mode === 'forgot' ? 'blurAndSubmit' : 'submit'} onSubmitEditing={mode === 'forgot' ? submit : () => passwordRef.current?.focus()} />}
            {mode !== 'forgot' && <Field label={mode === 'recovery' ? 'Nueva contraseña' : 'Contraseña'} icon="lock-closed-outline" value={password} onChangeText={setPassword} editable={!submitting} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} textContentType={mode === 'signin' ? 'password' : 'newPassword'} maxLength={128} placeholder={mode === 'signin' ? 'Tu contraseña' : 'Al menos 8 caracteres'} inputRef={passwordRef} returnKeyType={mode === 'recovery' ? 'next' : 'go'} submitBehavior={mode === 'recovery' ? 'submit' : 'blurAndSubmit'} onSubmitEditing={mode === 'recovery' ? () => confirmationRef.current?.focus() : submit}
              accessory={<Pressable style={styles.eye} accessibilityRole="button" accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onPress={() => setShowPassword(value => !value)}><Icon name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={colors.muted} /></Pressable>} />}
            {mode === 'recovery' && <Field label="Repite la contraseña" icon="lock-closed-outline" value={confirmation} onChangeText={setConfirmation} editable={!submitting} secureTextEntry={!showPassword} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false} maxLength={128} placeholder="La misma contraseña" inputRef={confirmationRef} returnKeyType="go" onSubmitEditing={submit} />}
            {mode === 'signin' && <Pressable accessibilityRole="button" disabled={submitting} onPress={() => changeMode('forgot')} style={styles.forgot}><Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text></Pressable>}
            <Button label={submitLabel} loading={submitting} onPress={submit} style={{ marginTop: 5 }} />
            {/* Under the button the error appears where the tap was, and never pushes the button away. */}
            {issue && <Notice error>{issue}</Notice>}
            {mode === 'signup' && <Text style={styles.helper}>Te pediremos confirmar tu correo antes de entrar.</Text>}
            {mode === 'signup' && <Text style={styles.helper}>Al crear tu cuenta aceptas los <Text accessibilityRole="link" style={styles.linkText} onPress={() => void Linking.openURL(TERMS_URL)}>Términos de uso</Text> y la <Text accessibilityRole="link" style={styles.linkText} onPress={() => void Linking.openURL(PRIVACY_URL)}>Política de privacidad</Text>.</Text>}
            {mode === 'forgot' && <Button label="Volver a entrar" secondary disabled={submitting} onPress={() => changeMode('signin')} />}
          </View>}
          <Pressable accessibilityRole="button" onPress={() => router.replace('/')} disabled={submitting} style={styles.explore}><Text style={styles.exploreText}>Seguir explorando</Text><Icon name="arrow-forward" size={17} color={colors.muted} /></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Field({ label, icon, accessory, inputRef, ...input }: TextInputProps & { label: string; icon: IconName; accessory?: React.ReactNode; inputRef?: React.Ref<TextInput> }) {
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputRow, focused && styles.inputFocused]}>
      <Icon name={icon} size={20} color={colors.muted} />
      <TextInput {...input} ref={inputRef} accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      {accessory}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 },
  scroll: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 40, flexGrow: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, paddingBottom: 24 },
  backSpace: { width: 44 },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', paddingTop: 12 },
  symbol: { width: 62, height: 62, borderRadius: 20, backgroundColor: colors.softBlue, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontFamily: typefaces.display, color: colors.ink, fontSize: 39, lineHeight: 44, fontWeight: '700', letterSpacing: -1.4 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24, marginTop: 14, maxWidth: 385 },
  form: { marginTop: 30, gap: 17 },
  segment: { flexDirection: 'row', backgroundColor: '#E9E9ED', padding: 4, borderRadius: 15, marginBottom: 7 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.white, boxShadow: '0 1px 5px rgba(0, 0, 0, 0.06)' },
  segmentText: { fontSize: 15, fontWeight: '500', color: colors.muted }, segmentTextSelected: { color: colors.ink, fontWeight: '600' },
  field: { gap: 9 }, label: { fontSize: 14, fontWeight: '500', color: colors.ink, marginLeft: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.white, borderRadius: 15, paddingLeft: 16, paddingRight: 8, borderWidth: 1, borderColor: colors.border },
  inputFocused: { borderColor: colors.primary },
  input: { flex: 1, minWidth: 0, minHeight: 56, fontSize: 16, color: colors.ink, paddingVertical: 15, outlineWidth: 0 },
  eye: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: -10 }, linkText: { color: colors.primary, fontSize: 14, fontWeight: '500' },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingHorizontal: 14 },
  explore: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, minHeight: 48, marginTop: 28 },
  exploreText: { fontSize: 14, fontWeight: '500', color: colors.muted },
  successCard: { marginTop: 30, padding: 24, borderRadius: 24, backgroundColor: colors.white, gap: 16 },
  successIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.softGreen, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 23, fontWeight: '600', letterSpacing: -.5, color: colors.ink },
  cardCopy: { color: colors.muted, fontSize: 15, lineHeight: 23, marginBottom: 7 },
});
