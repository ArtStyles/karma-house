import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { supabase } from '../lib/supabase';
import { createReportModerationRepository,type ModerationReport as ChatReport } from '../messaging/reportModeration';
import type { ReportReason } from '../messaging/types';
import { createThemedStyles } from '../theme';

const reasonLabels: Record<ReportReason, string> = { spam: 'Spam', fraud: 'Posible fraude', harassment: 'Acoso', other: 'Otro motivo' };
const dateLabel = (value: string) => new Date(value).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
type QueueState = { owner: string; status: 'open' | 'reviewed'; reports: ChatReport[]; hasMore: boolean; loading: boolean; error: string };
const initial = (owner = '', status: 'open' | 'reviewed' = 'open'): QueueState => ({ owner, status, reports: [], hasMore: false, loading: false, error: '' });

export default function MessageReportsScreen() {
  const { colors, styles } = useStyles();
  const { user, session, isAdmin } = useAuth();
  const owner = isAdmin ? user?.id ?? '' : '';
  const [source,setSource]=useState<'personal'|'agency'>('personal');
  const queueOwner=`${owner}:${session?.access_token}:${source}`;
  const [status, setStatus] = useState<'open' | 'reviewed'>('open');
  const [query,setQuery]=useState(''),[filters,setFilters]=useState<Record<string,string>>({}),[sort,setSort]=useState<'newest'|'oldest'>('newest');
  const list=useAdminQuery('messageReports',query,{...filters,status,source},sort);
  const [selection, setSelection] = useState<{ owner: string; report: ChatReport; note: string; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = JSON.stringify([queueOwner,status,query,filters,sort]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const requestId = useRef(0);
  const loadingRef = useRef(false);
  const busyRef = useRef(false);
  const focused = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const repository = useMemo(() => supabase && owner && session?.access_token ? createReportModerationRepository(supabase, { actorId: owner, accessToken: session.access_token },source) : null, [owner, session?.access_token,source]);
  const visible={reports:list.items as ChatReport[],loading:list.loading,error:list.error,hasMore:list.hasMore};
  loadingRef.current=list.loading;
  const selected = selection?.owner === queueOwner && owner ? selection : null;
  useLayoutEffect(() => {
    requests.current.forEach(request => request.abort()); requests.current.clear();
    busyRef.current = false;setSelection(null);setBusy(false);
  }, [scope]);
  const load=list.reload;
  useFocusEffect(useCallback(() => {focused.current=true;return ()=>{focused.current=false;requests.current.forEach(request=>request.abort());requests.current.clear();setSelection(null);};},[]));

  async function review() {
    if (!selected || !repository || busyRef.current || loadingRef.current || selected.report.reporterId === owner || selected.report.reportedUserId === owner) return;
    const saved = selected;
    busyRef.current = true; setBusy(true); setSelection({ ...saved, error: '' });
    const request = new AbortController(); requests.current.add(request);
    try {
      await repository.review(saved.report.id, saved.note, request.signal);
      if (focused.current && currentScope.current === scope && !request.signal.aborted) {
        setSelection(null);
        // Reload the current page after the server has confirmed the review.
        await load();
      }
    } catch (error) {
      if (focused.current && currentScope.current === scope && !request.signal.aborted) setSelection({ ...saved, error: error instanceof Error ? error.message : 'No se pudo guardar la revisión.' });
    } finally {
      requests.current.delete(request);
      if (currentScope.current === scope) { busyRef.current = false; setBusy(false); }
    }
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={!!repository&&!busy} onRefresh={()=>{if(!busyRef.current)void list.refresh();}} tintColor={colors.primary}/>}>
      <PageTitle title="Reportes" subtitle="Cuida las conversaciones de KarmaHouse." back />
      <View style={styles.filters}><Pill label="Personales" active={source==='personal'} onPress={()=>setSource('personal')}/><Pill label="Inmobiliarias" active={source==='agency'} onPress={()=>setSource('agency')}/></View>
      {!user ? <AccountPrompt returnTo="/message-reports" /> : !owner || !repository ? <EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Solo las cuentas administradoras pueden revisar reportes." /> : <>
        <View style={styles.filters}><Pill label="Pendientes" active={status === 'open'} onPress={() => setStatus('open')} /><Pill label="Revisados" active={status === 'reviewed'} onPress={() => setStatus('reviewed')} /></View>
        <Text style={styles.meta}>Cada reporte incluye el contexto de la conversación en el momento de enviarlo.</Text>
        <AdminToolbar query={query} onSearch={setQuery} filters={filters} onFilters={setFilters} fields={[{key:'reason',label:'Motivo',options:options(reasonLabels)},{key:'from',label:'Desde',kind:'date'},{key:'to',label:'Hasta',kind:'date'}]} sort={sort} onSort={value=>setSort(value as typeof sort)} allowName={false} disabled={busy}/>
        {visible.error ? <Notice error>{visible.error}</Notice> : null}
        {visible.loading && visible.reports.length === 0 ? <ActivityIndicator color={colors.primary} style={{ margin: 40 }} /> : !visible.error && visible.reports.length === 0 ? <EmptyState icon="shield-checkmark-outline" title={status === 'open' ? 'Sin reportes pendientes' : 'Aún no hay revisiones'} description={status === 'open' ? 'Aquí aparecerán las conversaciones que necesiten atención.' : 'Los reportes revisados se conservarán aquí.'} /> : null}
        {visible.reports.map(report => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Revisar reporte: ${reasonLabels[report.reason]}, ${report.propertyTitle}`} style={({ pressed }) => [styles.card, pressed && { opacity: .75 }]} onPress={() => setSelection({ owner:queueOwner, report, note: '', error: '' })}>
          <View style={styles.row}><View style={styles.flag}><Icon name="flag-outline" color={colors.primary} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.title}>{reasonLabels[report.reason]}</Text><Text style={styles.meta}>{dateLabel(report.createdAt)}</Text></View><Icon name="chevron-forward" color={colors.muted} size={18} /></View>
          <Text style={styles.property}>{report.propertyTitle}</Text>
          {report.details ? <Text numberOfLines={3} style={styles.body}>{report.details}</Text> : null}
          <View style={styles.row}><AdminStatus label={report.status==='open'?'Pendiente':'Revisado'} tone={report.status==='open'?'amber':'neutral'}/><Text style={styles.meta}>{report.context.length} mensajes de contexto</Text></View>
        </Pressable>)}
        <AdminPagination {...list} loading={list.loading||busy}/>
      </>}
    </ScrollView>
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => !busy && setSelection(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View accessibilityViewIsModal style={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            <Text accessibilityRole="header" style={styles.modalTitle}>{selected ? reasonLabels[selected.report.reason] : 'Reporte'}</Text>
            <Text style={styles.property}>{selected?.report.propertyTitle}</Text>
            <Text style={styles.meta}>{selected ? dateLabel(selected.report.createdAt) : ''}</Text>
            <Text style={styles.body}>{selected?.report.details || 'Sin comentario adicional.'}</Text>
            <Text style={styles.label}>Contexto reportado</Text>
            <Text style={styles.meta}>Últimos mensajes guardados al enviar el reporte.</Text>
            {selected?.report.context.length === 0 ? <Text style={styles.meta}>Esta conversación todavía no tenía mensajes enviados.</Text> : null}
            {selected?.report.context.map(message => <View key={message.id} style={styles.message}>
              <View style={styles.row}><Text style={[styles.label, { flex: 1 }]}>{message.senderId === null ? 'Cuenta eliminada' : message.senderId === selected.report.reporterId ? 'Quien reporta' : message.senderId === selected.report.reportedUserId ? 'Cuenta reportada' : 'Otro participante'}</Text><Text style={styles.time}>{dateLabel(message.createdAt)}</Text></View>
              <Text selectable style={styles.body}>{message.body}</Text>
            </View>)}
            {selected?.report.status === 'reviewed' ? <Notice>{selected.report.reviewNote || 'Este reporte ya fue revisado.'}</Notice> : selected && (selected.report.reporterId === owner || selected.report.reportedUserId === owner) ? <Notice>Formas parte de esta conversación. Otra cuenta administradora debe revisar el reporte.</Notice> : <>
              <Text style={styles.label}>Nota de revisión {source==='personal'?'· opcional':'· obligatoria'}</Text>
              <TextInput accessibilityLabel="Nota de revisión del reporte" value={selected?.note ?? ''} onChangeText={note => setSelection(old => old ? { ...old, note } : null)} multiline maxLength={1000} editable={!busy} placeholder="Deja constancia de lo revisado." placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.meta}>Marcar como revisado conserva el contexto. No bloquea ni suspende cuentas automáticamente.</Text>
              {selected?.error ? <Notice error>{selected.error}</Notice> : null}
              <Button label="Marcar como revisado" icon="checkmark-outline" loading={busy} disabled={visible.loading||(source==='agency'&&!selected?.note.trim())} onPress={() => void review()} />
            </>}
            <Button label="Cerrar reporte" secondary disabled={busy} onPress={() => setSelection(null)} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 28, gap: 14 },
  filters: { flexDirection: 'row', gap: 10 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 20, borderWidth:1,borderColor:colors.border, padding: 18, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flag: { width: 44, height: 44, backgroundColor: colors.softBlue, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: colors.ink }, property: { fontSize: 16, fontWeight: '600', lineHeight: 23, color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink }, label: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay, padding: 16, justifyContent: 'center' }, modal: { width: '100%', maxWidth: 580, maxHeight: '94%', alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 28, overflow: 'hidden' },
  modalContent: { padding: 22, gap: 16 }, modalTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -.6, color: colors.ink },
  message: { backgroundColor: colors.paper, borderRadius: 16, padding: 14, gap: 8 }, time: { fontSize: 11, color: colors.muted },
  input: { minHeight: 100, borderRadius: 16, padding: 14, backgroundColor: colors.paper, color: colors.ink, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' },
}));
