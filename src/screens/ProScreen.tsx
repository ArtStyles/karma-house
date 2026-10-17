import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { formatProDate, isProActive, isProCodeShape, proContactMailto, proErrorMessage } from '../pro/domain';
import { usePro } from '../pro/usePro';
import { createThemedStyles, internalLayout, rounded, typography } from '../theme';

/** Keyed by account, so a redeem or reload still running for the previous one cannot write onto the next. */
export default function ProScreen() {
  const { user } = useAuth();
  return <ProBody key={user?.id ?? ''} />;
}
function ProBody() {
  const { colors, styles } = useStyles();
  const { user } = useAuth();
  const pro = usePro();
  const [code, setCode] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const adminAgencies = pro.status?.agencies.filter(agency => agency.role === 'admin') ?? [];

  async function redeem() {
    if (!pro.repository || busy) return;
    if (!isProCodeShape(code)) { setError('Escribe el código completo: KH y 12 letras o números.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await pro.repository.redeem(code, target);
      const agency = result.kind === 'agency' ? pro.status?.agencies.find(item => item.id === result.id) : undefined;
      // An old code retried after its Pro was revoked still answers ok, with a date already past.
      setCode(''); setNotice(isProActive(result.until) ? `KarmaHouse Pro activo${agency ? ` para ${agency.tradeName}` : ''} hasta el ${formatProDate(result.until)}.` : 'Este código ya se usó y ese Pro terminó.');
      await pro.reload();
    } catch (failure) { setError(proErrorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Para quien publica mucho." back fallback="/profile" />
      {!user ? <AccountPrompt returnTo="/pro" title="KarmaHouse Pro" description="Inicia sesión para ver tu Pro o canjear un código." /> : <>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Tu estado</Text>
          {pro.status ? <>
            <Text style={styles.body}>{isProActive(pro.status.personalUntil) ? `Pro activo hasta el ${formatProDate(pro.status.personalUntil!)}.` : 'No tienes Pro.'}</Text>
            {pro.status.agencies.map(agency => <Text key={agency.id} style={styles.body}>{agency.tradeName}: {isProActive(agency.until) ? `Pro activo hasta el ${formatProDate(agency.until!)}` : 'sin Pro'}.</Text>)}
          </> : pro.loading ? <ActivityIndicator accessibilityLabel="Consultando KarmaHouse Pro" color={colors.primary} /> : null}
          {pro.error ? <Notice error>{pro.error}</Notice> : null}
          {pro.error && !pro.status ? <Button label="Reintentar" secondary onPress={() => void pro.reload()} /> : null}
        </View>
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.title}>Qué incluye</Text>
          <View style={[styles.card, styles.feature]}>
            <View style={styles.featureIcon}><Icon name="arrow-up" size={20} color={colors.amber} /></View>
            <Text style={[styles.body, styles.flex]}><Text style={styles.strong}>Subir anuncio:</Text> una vez por semana, cada anuncio activo vuelve arriba en «Más recientes».</Text>
          </View>
          <Text style={styles.muted}>Tu Pro solo lo ves tú: tus anuncios y tu perfil no muestran ninguna etiqueta. Publicar, buscar y conversar siguen siendo gratis.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Canjear código</Text>
          {adminAgencies.length > 0 && <>
            <Text style={styles.muted}>¿Para quién es el código?</Text>
            <View style={styles.choices}>
              <Pill label="Mi cuenta" active={target === null} onPress={() => setTarget(null)} />
              {adminAgencies.map(agency => <Pill key={agency.id} label={agency.tradeName} active={target === agency.id} onPress={() => setTarget(agency.id)} />)}
            </View>
          </>}
          <TextInput accessibilityLabel="Código de KarmaHouse Pro" value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false}
            placeholder="KH-XXXX-XXXX-XXXX" placeholderTextColor={colors.muted} editable={!busy} style={styles.input} />
          {error ? <Notice error>{error}</Notice> : null}
          {notice ? <Notice>{notice}</Notice> : null}
          <Button label="Canjear código" onPress={() => void redeem()} loading={busy} disabled={!code.trim()} />
        </View>
        {/* The one cream card: an invitation, with its button in the day blue. */}
        <View style={[styles.card, styles.paper]}>
          <Text accessibilityRole="header" style={[styles.title, styles.paperInk]}>¿Quieres Pro?</Text>
          <Text style={[styles.body, styles.paperInk]}>Pro se contrata hablando con KarmaHouse. Cuando acordemos el pago, te enviamos tu código.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Escríbenos" onPress={() => void Linking.openURL(proContactMailto())} style={({ pressed }) => [styles.write, pressed && { opacity: .8 }]}>
            <Icon name="mail-outline" size={18} color={colors.onDark} /><Text style={styles.writeText}>Escríbenos</Text>
          </Pressable>
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, flex: { flex: 1 },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: 32, gap: 16 },
  card: { padding: 16, borderRadius: rounded.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  section: { gap: 10 },
  title: { ...typography.section, color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink }, strong: { fontWeight: '700' },
  muted: { fontSize: 13, lineHeight: 19, color: colors.muted, paddingHorizontal: 4 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  featureIcon: { width: 44, height: 44, borderRadius: rounded.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.softAmber },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: rounded.pill, minHeight: 52, paddingHorizontal: 18, paddingVertical: 13, fontSize: 16, color: colors.ink, letterSpacing: 1 },
  paper: { backgroundColor: colors.cream, borderColor: colors.cream }, paperInk: { color: colors.creamInk },
  write: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: rounded.pill, backgroundColor: colors.creamBlue },
  writeText: { color: colors.onDark, fontSize: 15, fontWeight: '600' },
}));
