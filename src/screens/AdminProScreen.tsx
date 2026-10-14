import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAdminApi } from '../admin/useAdminApi';
import { ActionGroup, Button, EmptyState, Notice, PageTitle, Pill } from '../components/ui';
import { isUuid } from '../messaging/domain';
import { decodeCreatedCode, decodeGrant, decodeProAccounts, decodeProCodes, formatProDate, proErrorMessage, type ProAccountRow, type ProCodeRow } from '../pro/domain';
import { createThemedStyles, internalLayout } from '../theme';

type Subject = { kind: 'user' | 'agency'; id: string; name: string };
type Pending = { kind: 'cancel'; row: ProCodeRow } | { kind: 'revoke'; row: ProAccountRow };
const stateLabel: Record<ProCodeRow['state'], string> = { unused: 'Sin usar', redeemed: 'Canjeado', expired: 'Caducado', cancelled: 'Anulado' };
const subjectArgs = (subject: { kind: 'user' | 'agency'; id: string } | null) => subject ? subject.kind === 'user' ? { p_user_id: subject.id } : { p_agency_id: subject.id } : {};

export default function AdminProScreen() {
  const { colors, styles } = useStyles();
  const { isOwner, user, session } = useAuth();
  const call = useAdminApi();
  const params = useLocalSearchParams<{ userId?: string; agencyId?: string; name?: string }>();
  const target: Subject | null = isUuid(params.userId) ? { kind: 'user', id: params.userId as string, name: params.name || 'Cuenta' }
    : isUuid(params.agencyId) ? { kind: 'agency', id: params.agencyId as string, name: params.name || 'Inmobiliaria' } : null;
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<{ code: string; expiresAt: string } | null>(null);
  const [codes, setCodes] = useState<ProCodeRow[]>([]);
  const [accounts, setAccounts] = useState<ProAccountRow[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const validNote = note.trim().length >= 3;

  const load = useCallback(async () => {
    if (!isOwner) return;
    try {
      const [codePage, accountPage] = await Promise.all([call('kh_admin_list_pro_codes', { p_offset: 0 }), call('kh_admin_list_pro_accounts', { p_offset: 0 })]);
      setCodes(decodeProCodes(codePage).items); setAccounts(decodeProAccounts(accountPage).items);
    } catch (failure) { setError(proErrorMessage(failure)); }
  }, [call, isOwner]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => { setCreated(null); setPending(null); setNote(''); setError(''); setNotice(''); }, [user?.id, session?.access_token]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); setNote(''); await load(); } catch (failure) { setError(proErrorMessage(failure)); } finally { setBusy(false); }
  }
  const createCode = () => run(async () => {
    setCreated(decodeCreatedCode(await call('kh_admin_create_pro_code', { p_days: days, p_note: note.trim(), ...subjectArgs(target) })));
  });
  const grant = () => run(async () => {
    const result = decodeGrant(await call('kh_admin_grant_pro', { p_days: days, p_note: note.trim(), ...subjectArgs(target) }));
    setNotice(`${target!.name}: Pro activo hasta el ${formatProDate(result.until)}.`);
  });
  const confirm = () => run(async () => {
    if (!pending) return;
    if (pending.kind === 'cancel') await call('kh_admin_cancel_pro_code', { p_code_id: pending.row.id, p_note: note.trim() });
    else await call('kh_admin_revoke_pro', { p_note: note.trim(), ...subjectArgs(pending.row) });
    setNotice(pending.kind === 'cancel' ? 'Código anulado.' : `${pending.row.name} ya no tiene Pro.`);
    setPending(null);
  });

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Códigos, activaciones y cuentas Pro." back fallback="/administration" />
      {!isOwner ? <EmptyState plain title="Acceso reservado" description="Solo el propietario de KarmaHouse gestiona Pro." /> : <>
        {error ? <Notice error>{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {created && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Código creado</Text>
          <Text selectable style={styles.code}>{created.code}</Text>
          <Notice>No se podrá volver a ver. Caduca sin usar el {formatProDate(created.expiresAt)}.</Notice>
          <ActionGroup>
            <Button label="Compartir" icon="share-outline" onPress={() => void Share.share({ message: `Tu código de KarmaHouse Pro: ${created.code}. Canjéalo en Mi espacio › KarmaHouse Pro.` })} />
            <Button label="Listo" secondary onPress={() => setCreated(null)} />
          </ActionGroup>
        </View>}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{target ? `Para ${target.name}` : 'Código libre'}</Text>
          <Text style={styles.muted}>{target ? 'Solo esta cuenta podrá canjear el código.' : 'Lo canjea la primera cuenta que lo escriba. Para atarlo a alguien, ábrelo desde Cuentas o Inmobiliarias.'}</Text>
          <View style={styles.choices}>{([30, 90, 365] as const).map(value => <Pill key={value} label={`${value} días`} active={days === value} onPress={() => setDays(value)} />)}</View>
          <TextInput accessibilityLabel="Nota privada" value={note} onChangeText={setNote} multiline maxLength={500} editable={!busy}
            placeholder="Cliente, zona y forma de pago" placeholderTextColor={colors.muted} style={[styles.input, styles.note]} />
          <ActionGroup>
            <Button label="Crear código" onPress={() => void createCode()} loading={busy && !pending} disabled={!validNote || !!pending} />
            {target && <Button label="Activar ahora" secondary onPress={() => void grant()} disabled={busy || !validNote || !!pending} />}
          </ActionGroup>
        </View>
        {pending && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{pending.kind === 'cancel' ? 'Anular código' : `Quitar Pro a ${pending.row.name}`}</Text>
          <Text style={styles.muted}>Escribe el motivo en la nota de arriba. Queda en el Historial.</Text>
          <ActionGroup>
            <Button label="Confirmar" onPress={() => void confirm()} loading={busy} disabled={!validNote} />
            <Button label="Cancelar" secondary disabled={busy} onPress={() => setPending(null)} />
          </ActionGroup>
        </View>}
        <Text accessibilityRole="header" style={styles.section}>Cuentas Pro</Text>
        {accounts.length === 0 ? <Text style={styles.muted}>Ninguna cuenta tiene Pro activo.</Text> : accounts.map(row => <View key={`${row.kind}:${row.id}`} style={styles.card}>
          <Text style={styles.title}>{row.name}</Text>
          <Text style={styles.muted}>{row.kind === 'agency' ? 'Inmobiliaria' : 'Cuenta personal'} · hasta el {formatProDate(row.until)}{row.effective ? '' : ' · sin efecto: la inmobiliaria no está aprobada'}</Text>
          {row.note ? <Text style={styles.body}>{row.note}</Text> : null}
          <Button label="Quitar Pro" secondary disabled={busy} onPress={() => setPending({ kind: 'revoke', row })} />
        </View>)}
        <Text accessibilityRole="header" style={styles.section}>Códigos recientes</Text>
        {codes.length === 0 ? <Text style={styles.muted}>Todavía no hay códigos.</Text> : codes.map(row => <View key={row.id} style={styles.card}>
          <Text style={styles.title}>{stateLabel[row.state]} · {row.days} días</Text>
          <Text style={styles.body}>{row.note}</Text>
          {row.cancelNote ? <Text style={styles.muted}>Anulado: {row.cancelNote}</Text> : null}
          <Text style={styles.muted}>{row.boundName ? `Para ${row.boundName}` : 'Código libre'} · creado el {formatProDate(row.createdAt)}{row.redeemedAt ? ` · canjeado el ${formatProDate(row.redeemedAt)} para ${row.redeemedFor}` : ''}</Text>
          {row.state === 'unused' && <Button label="Anular" secondary disabled={busy} onPress={() => setPending({ kind: 'cancel', row })} />}
        </View>)}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  section: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.muted },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: 2, color: colors.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 14, fontSize: 16, color: colors.ink },
  note: { minHeight: 96, textAlignVertical: 'top' },
}));
