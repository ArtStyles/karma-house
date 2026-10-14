import { useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, Notice, PageTitle, Pill } from '../components/ui';
import { formatProDate, isProActive, isProCodeShape, proContactMailto, proErrorMessage } from '../pro/domain';
import { usePro } from '../pro/usePro';
import { createThemedStyles, internalLayout } from '../theme';

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
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Qué incluye</Text>
          <Text style={styles.body}>El sello Pro en tus anuncios y en tu perfil público.</Text>
          <Text style={styles.body}>Subir anuncio: una vez por semana, cada anuncio activo vuelve arriba en «Más recientes».</Text>
          <Text style={styles.muted}>Publicar, buscar y conversar siguen siendo gratis.</Text>
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
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>¿Quieres Pro?</Text>
          <Text style={styles.body}>Pro se contrata hablando con KarmaHouse. Cuando acordemos el pago, te enviamos tu código.</Text>
          <Button label="Escríbenos" secondary icon="mail-outline" onPress={() => void Linking.openURL(proContactMailto())} />
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 14, fontSize: 16, color: colors.ink, letterSpacing: 1 },
}));
