import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAdminApi } from '../admin/useAdminApi';
import { ActionGroup, Button, EmptyState, Notice, PageTitle, Pill } from '../components/ui';
import { isUuid } from '../messaging/domain';
import { decodeCreatedCode, decodeGrant, decodeProAccounts, decodeProCodes, decodeProSubject, formatProDate, proErrorMessage, proWriteErrorMessage, type ProAccountRow, type ProCodeRow, type ProCreatedCode, type ProPage, type ProSubject } from '../pro/domain';
import { createThemedStyles, internalLayout } from '../theme';

type Target = { kind: 'user' | 'agency'; id: string };
type Pending = { kind: 'cancel'; row: ProCodeRow } | { kind: 'revoke'; row: ProAccountRow };
type Created = ProCreatedCode & { days: number };
const stateLabel: Record<ProCodeRow['state'], string> = { unused: 'Sin usar', redeemed: 'Canjeado', expired: 'Caducado', cancelled: 'Anulado' };
const subjectArgs = (subject: Target | null) => subject ? subject.kind === 'user' ? { p_user_id: subject.id } : { p_agency_id: subject.id } : {};
const accountKey = (row: Target) => `${row.kind}:${row.id}`;
const validText = (value: string) => value.trim().length >= 3;
const empty = { items: [], hasMore: false };
const subjectStatus = (subject: ProSubject) => !subject.until ? 'Sin Pro'
  : subject.effective ? `Pro activo hasta el ${formatProDate(subject.until)}` : `Pro hasta el ${formatProDate(subject.until)} · sin efecto: la inmobiliaria no está aprobada`;

export default function AdminProScreen() {
  const { colors, styles } = useStyles();
  const { isOwner, user, ready, profileReady } = useAuth();
  const call = useAdminApi();
  // The link carries ids only; the name always comes from the server.
  const params = useLocalSearchParams<{ userId?: string; agencyId?: string }>();
  const hasRecipient = !!params.userId || !!params.agencyId;
  const target: Target | null = isUuid(params.userId) ? { kind: 'user', id: params.userId } : isUuid(params.agencyId) ? { kind: 'agency', id: params.agencyId } : null;
  const accountId = user?.id;
  const live = useRef(accountId); live.current = accountId;
  const [days, setDays] = useState<30 | 90 | 365>(30);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [created, setCreated] = useState<Created | null>(null);
  const [codes, setCodes] = useState<ProPage<ProCodeRow>>(empty);
  const [accounts, setAccounts] = useState<ProPage<ProAccountRow>>(empty);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyAction, setBusyAction] = useState<'create' | 'grant' | 'confirm' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saving = useRef(false);
  const busy = busyAction !== null;

  // Keyed by account and recipient so a stale answer is never shown for another one.
  const subjectKey = target ? `${accountId}:${accountKey(target)}` : '';
  const [subject, setSubject] = useState<{ key: string; value: ProSubject | null; error: string }>({ key: '', value: null, error: '' });
  const [subjectTick, setSubjectTick] = useState(0);
  const recipient = target && subject.key === subjectKey ? subject : null;
  const named = recipient?.value ?? null;
  const recipientError = hasRecipient && !target ? 'El enlace no indica un destinatario válido. Ábrelo de nuevo desde Cuentas o Inmobiliarias.' : recipient?.error ?? '';
  useEffect(() => {
    if (!target || !isOwner) return;
    let active = true; const controller = new AbortController();
    call('kh_admin_pro_subject', subjectArgs(target), controller.signal)
      .then(value => { if (active) setSubject({ key: subjectKey, value: decodeProSubject(value), error: '' }); })
      .catch(failure => { if (active) setSubject({ key: subjectKey, value: null, error: proErrorMessage(failure) }); });
    return () => { active = false; controller.abort(); };
  }, [subjectKey, call, isOwner, subjectTick]); // target is encoded in subjectKey

  const loads = useRef(0);
  const load = useCallback(async () => {
    if (!isOwner) return;
    const ticket = ++loads.current, owner = accountId;
    try {
      const [codePage, accountPage] = await Promise.all([call('kh_admin_list_pro_codes', { p_offset: 0 }), call('kh_admin_list_pro_accounts', { p_offset: 0 })]);
      const nextCodes = decodeProCodes(codePage), nextAccounts = decodeProAccounts(accountPage);
      if (ticket !== loads.current || live.current !== owner) return;
      setCodes(nextCodes); setAccounts(nextAccounts); setLoaded(true); setLoadError('');
    } catch (failure) { if (ticket === loads.current && live.current === owner) setLoadError(proErrorMessage(failure)); }
  }, [call, isOwner, accountId]);
  const loadRef = useRef(load); loadRef.current = load;
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // Only a change of account clears the screen; a token refresh keeps it (useAdminApi drops in-flight requests).
  const seen = useRef(accountId);
  useEffect(() => {
    if (seen.current === accountId) return;
    seen.current = accountId; saving.current = false;
    setBusyAction(null); setCreated(null); setPending(null); setReason(''); setNote(''); setError(''); setNotice('');
    setCodes(empty); setAccounts(empty); setLoaded(false); setLoadError('');
  }, [accountId]);

  // A confirmation whose row left the list (used, expired, reloaded) is closed.
  const open = pending && (pending.kind === 'cancel' ? codes.items.some(row => row.id === pending.row.id && row.state === 'unused')
    : accounts.items.some(row => accountKey(row) === accountKey(pending.row))) ? pending : null;

  async function run(action: 'create' | 'grant' | 'confirm', work: () => Promise<void>, failureMessage: (failure: unknown) => string = proErrorMessage) {
    if (saving.current) return;
    const owner = live.current;
    saving.current = true; setBusyAction(action); setError(''); setNotice('');
    try { await work(); } catch (failure) { if (live.current === owner) setError(failureMessage(failure)); }
    finally {
      if (live.current === owner) { saving.current = false; setBusyAction(null); setSubjectTick(tick => tick + 1); void loadRef.current(); }
    }
  }
  const createCode = () => {
    if (hasRecipient && !named) return;
    void run('create', async () => {
      const result = decodeCreatedCode(await call('kh_admin_create_pro_code', { p_days: days, p_note: note.trim(), ...subjectArgs(named) }));
      setCreated({ ...result, days }); setNote('');
    }, proWriteErrorMessage);
  };
  const grant = () => {
    if (!named) return;
    void run('grant', async () => {
      const result = decodeGrant(await call('kh_admin_grant_pro', { p_days: days, p_note: note.trim(), ...subjectArgs(named) }));
      setNotice(`${result.name}: Pro activo hasta el ${formatProDate(result.until)}.`); setNote('');
    }, proWriteErrorMessage);
  };
  const confirm = () => {
    if (!open) return;
    void run('confirm', async () => {
      if (open.kind === 'cancel') await call('kh_admin_cancel_pro_code', { p_code_id: open.row.id, p_note: reason.trim() });
      else await call('kh_admin_revoke_pro', { p_note: reason.trim(), ...subjectArgs(open.row) });
      setNotice(open.kind === 'cancel' ? 'Código anulado.' : `${open.row.name} ya no tiene Pro.`);
      setPending(null); setReason('');
    });
  };
  const choose = (next: Pending) => { setPending(next); setReason(''); setError(''); setNotice(''); };
  const share = (code: Created) => {
    const owner = live.current;
    Share.share({ message: `Tu código de KarmaHouse Pro (${code.days} días): ${code.code}. Canjéalo antes del ${formatProDate(code.expiresAt)} en Mi espacio › KarmaHouse Pro.` })
      .catch(() => { if (live.current === owner) setError('Copia el código para enviarlo.'); });
  };
  // Called, not rendered as a component: a component defined here would remount the input on every keystroke.
  const confirmation = (title: string, details: ReactNode) => <View style={[styles.card, styles.confirm]}>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    {details}
    <View style={styles.field}>
      <Text style={styles.label}>Motivo privado · obligatorio (3 a 500 caracteres)</Text>
      <TextInput accessibilityLabel="Motivo privado" accessibilityHint="Obligatorio, de 3 a 500 caracteres. Solo lo ves tú; el Historial registra la gestión sin el motivo."
        value={reason} onChangeText={setReason} multiline maxLength={500} editable={!busy} placeholder="Por qué lo haces" placeholderTextColor={colors.muted} style={[styles.input, styles.note]} />
    </View>
    {error ? <Notice error>{error}</Notice> : null}
    <ActionGroup>
      <Button label="Confirmar" onPress={confirm} loading={busyAction === 'confirm'} disabled={!validText(reason)} />
      <Button label="Cancelar" secondary disabled={busy} onPress={() => { setPending(null); setError(''); }} />
    </ActionGroup>
  </View>;

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <PageTitle compact title="KarmaHouse Pro" subtitle="Códigos, activaciones y cuentas Pro." back fallback="/administration" />
      {!ready || (user && !profileReady) ? <ActivityIndicator color={colors.primary} style={styles.loading} />
        : !isOwner ? <EmptyState plain title="Acceso reservado" description="Solo el propietario de KarmaHouse gestiona Pro." /> : <>
        {loadError ? <Notice error>{loadError}</Notice> : null}
        {error && !open ? <Notice error>{error}</Notice> : null}
        {notice ? <Notice>{notice}</Notice> : null}
        {created && <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>Código creado</Text>
          <Text style={styles.muted}>{created.name ? `Para ${created.name}` : 'Código libre'} · {created.days} días</Text>
          <Text selectable numberOfLines={1} adjustsFontSizeToFit style={styles.code}>{created.code}</Text>
          <Notice>No se podrá volver a ver. Si no se usa, caduca el {formatProDate(created.expiresAt)}.</Notice>
          <ActionGroup>
            <Button label="Compartir" icon="share-outline" onPress={() => share(created)} />
            <Button label="Listo" secondary onPress={() => setCreated(null)} />
          </ActionGroup>
        </View>}
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>{!hasRecipient ? 'Código libre' : named ? `Para ${named.name}` : 'Destinatario'}</Text>
          {!hasRecipient ? <Text style={styles.muted}>Lo canjea la primera cuenta que lo escriba. Para atarlo a alguien, ábrelo desde Cuentas o Inmobiliarias.</Text>
            : named ? <>
              <Text style={styles.body}>{subjectStatus(named)}</Text>
              <Text style={styles.muted}>{named.kind === 'agency' ? 'Solo quien administre esta inmobiliaria podrá canjear el código.' : 'Solo esta cuenta podrá canjear el código.'}</Text>
            </> : recipientError ? <>
              <Notice error>{recipientError}</Notice>
              {target ? <Button label="Reintentar" secondary onPress={() => setSubjectTick(tick => tick + 1)} /> : null}
            </> : <Text style={styles.muted}>Cargando destinatario…</Text>}
          <View style={styles.choices}>{([30, 90, 365] as const).map(value => <Pill key={value} label={`${value} días`} active={days === value} onPress={() => setDays(value)} />)}</View>
          <View style={styles.field}>
            <Text style={styles.label}>Nota privada · obligatoria (3 a 500 caracteres)</Text>
            <TextInput accessibilityLabel="Nota privada" accessibilityHint="Obligatoria, de 3 a 500 caracteres. Solo la ves tú; el Historial registra la gestión sin la nota."
              value={note} onChangeText={setNote} multiline maxLength={500} editable={!busy}
              placeholder="Cliente, zona y forma de pago" placeholderTextColor={colors.muted} style={[styles.input, styles.note]} />
          </View>
          <ActionGroup>
            <Button label="Crear código" onPress={createCode} loading={busyAction === 'create'} disabled={busy || !validText(note) || !!open || !!created || (hasRecipient && !named)} />
            {hasRecipient && <Button label="Activar ahora" secondary onPress={grant} loading={busyAction === 'grant'} disabled={busy || !validText(note) || !!open || !named} />}
          </ActionGroup>
        </View>
        <Text accessibilityRole="header" style={styles.section}>Cuentas Pro</Text>
        {loaded && !loadError && accounts.items.length === 0 ? <Text style={styles.muted}>Ninguna cuenta tiene Pro activo.</Text> : null}
        {accounts.items.map(row => <Fragment key={accountKey(row)}>
          <View style={styles.card}>
            <Text style={styles.title}>{row.name}</Text>
            <Text style={styles.muted}>{row.kind === 'agency' ? 'Inmobiliaria' : 'Cuenta personal'} · hasta el {formatProDate(row.until)}{row.effective ? '' : ' · sin efecto: la inmobiliaria no está aprobada'}</Text>
            {row.note ? <Text style={styles.body}>{row.note}</Text> : null}
            <Button label="Quitar Pro" secondary disabled={busy || !!open} onPress={() => choose({ kind: 'revoke', row })} />
          </View>
          {open?.kind === 'revoke' && accountKey(open.row) === accountKey(row) ? confirmation(`Quitar Pro a ${row.name}`,
            <Text style={styles.muted}>El Pro termina ahora. La gestión queda en el Historial.</Text>) : null}
        </Fragment>)}
        {accounts.hasMore ? <Text style={styles.muted}>Se muestran 30. Hay más.</Text> : null}
        <Text accessibilityRole="header" style={styles.section}>Códigos recientes</Text>
        {loaded && !loadError && codes.items.length === 0 ? <Text style={styles.muted}>Todavía no hay códigos.</Text> : null}
        {codes.items.map(row => <Fragment key={row.id}>
          <View style={styles.card}>
            <Text style={styles.title}>{stateLabel[row.state]} · {row.days} días</Text>
            <Text style={styles.body}>{row.note}</Text>
            {row.cancelNote ? <Text style={styles.muted}>Anulado: {row.cancelNote}</Text> : null}
            <Text style={styles.muted}>{row.boundName ? `Para ${row.boundName}` : 'Código libre'} · creado el {formatProDate(row.createdAt)}{row.redeemedAt ? ` · canjeado el ${formatProDate(row.redeemedAt)} para ${row.redeemedFor}` : ''}</Text>
            {row.state === 'unused' && <Button label="Anular" secondary disabled={busy || !!open} onPress={() => choose({ kind: 'cancel', row })} />}
          </View>
          {open?.kind === 'cancel' && open.row.id === row.id ? confirmation('Anular código', <>
            <Text style={styles.body}>{row.days} días · {row.boundName ? `Para ${row.boundName}` : 'Código libre'} · creado el {formatProDate(row.createdAt)}</Text>
            <Text style={styles.muted}>{row.note}</Text>
          </>) : null}
        </Fragment>)}
        {codes.hasMore ? <Text style={styles.muted}>Se muestran 30. Hay más.</Text> : null}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  loading: { padding: 28 },
  card: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 12 },
  confirm: { borderColor: colors.primary },
  title: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: colors.ink },
  section: { fontSize: 13, lineHeight: 20, fontWeight: '600', color: colors.muted },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 21, color: colors.muted },
  code: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: 2, color: colors.ink },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { gap: 8 },
  label: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: colors.ink },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, minHeight: 48, padding: 14, fontSize: 16, color: colors.ink },
  note: { minHeight: 96, textAlignVertical: 'top' },
}));
