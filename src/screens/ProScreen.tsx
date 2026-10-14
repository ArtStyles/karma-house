import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, Notice, PageTitle, Pill } from '../components/ui';
import { formatProDate, isProActive, isProCodeShape, proContactMailto, proErrorMessage } from '../pro/domain';
import { usePro } from '../pro/usePro';
import { createThemedStyles, internalLayout } from '../theme';

export default function ProScreen() {
  const { colors, styles } = useStyles();
  const { user } = useAuth();
  const pro = usePro();
  const [code, setCode] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const adminAgencies = pro.status?.agencies.filter(agency => agency.role === 'admin') ?? [];
  useEffect(() => { setCode(''); setTarget(null); setNotice(''); setError(''); }, [user?.id]);

  async function redeem() {
    if (!pro.repository || busy) return;
    if (!isProCodeShape(code)) { setError('Escribe el código completo: KH y 12 letras o números.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await pro.repository.redeem(code, target);
      setCode(''); setNotice(`KarmaHouse Pro activo hasta el ${formatProDate(result.until)}.`);
      await pro.reload();
    } catch (failure) { setError(proErrorMessage(failure)); }
    finally { setBusy(false); }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Para quien publica mucho." back fallback="/profile" />
      {!user ? <AccountPrompt returnTo="/pro" /> : <>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Tu estado</Text>
          {pro.loading && !pro.status ? <ActivityIndicator accessibilityLabel="Consultando KarmaHouse Pro" color={colors.primary} /> : <>
            <Text style={styles.body}>{isProActive(pro.status?.personalUntil) ? `Pro activo hasta el ${formatProDate(pro.status!.personalUntil!)}.` : 'No tienes Pro.'}</Text>
            {pro.status?.agencies.map(agency => <Text key={agency.id} style={styles.body}>{agency.tradeName}: {isProActive(agency.until) ? `Pro activo hasta el ${formatProDate(agency.until!)}` : 'sin Pro'}.</Text>)}
          </>}
          {pro.error ? <Notice error>{pro.error}</Notice> : null}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Qué incluye</Text>
          <Text style={styles.body}>El sello Pro en tus anuncios y en tu perfil público.</Text>
          <Text style={styles.body}>Subir anuncio: una vez por semana, cada anuncio activo vuelve arriba en «Más recientes».</Text>
          <Text style={styles.muted}>Publicar, buscar y conversar siguen siendo gratis.</Text>
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Canjear código</Text>
          {adminAgencies.length > 0 && <View style={styles.choices}>
            <Pill label="Mi cuenta" active={target === null} onPress={() => setTarget(null)} />
            {adminAgencies.map(agency => <Pill key={agency.id} label={agency.tradeName} active={target === agency.id} onPress={() => setTarget(agency.id)} />)}
          </View>}
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
