import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { supabase } from '../lib/supabase';
import { createReportModerationRepository } from '../messaging/reportModeration';
import type { ChatReport, ReportReason } from '../messaging/types';
import { colors } from '../theme';

const reasonLabels: Record<ReportReason, string> = { spam: 'Spam', fraud: 'Posible fraude', harassment: 'Acoso', other: 'Otro motivo' };
const dateLabel = (value: string) => new Date(value).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
type QueueState = { owner: string; status: 'open' | 'reviewed'; reports: ChatReport[]; hasMore: boolean; loading: boolean; error: string };
const initial = (owner = '', status: 'open' | 'reviewed' = 'open'): QueueState => ({ owner, status, reports: [], hasMore: false, loading: false, error: '' });

export default function MessageReportsScreen() {
  const { user, session, isAdmin } = useAuth();
  const owner = isAdmin ? user?.id ?? '' : '';
  const [status, setStatus] = useState<'open' | 'reviewed'>('open');
  const [state, setState] = useState<QueueState>(initial);
  const [selection, setSelection] = useState<{ owner: string; report: ChatReport; note: string; error: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const scope = `${owner}:${status}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  const requestId = useRef(0);
  const loadingRef = useRef(false);
  const busyRef = useRef(false);
  const focused = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const repository = useMemo(() => supabase && owner && session?.access_token ? createReportModerationRepository(supabase, { actorId: owner, accessToken: session.access_token }) : null, [owner, session?.access_token]);
  const visible = state.owner === owner && state.status === status ? state : initial(owner, status);
  const selected = selection?.owner === owner && owner ? selection : null;
  const visibleRef = useRef(visible); visibleRef.current = visible;

  useLayoutEffect(() => {
    requests.current.forEach(request => request.abort()); requests.current.clear();
    requestId.current++; loadingRef.current = false; busyRef.current = false;
    setState(initial(owner, status)); setSelection(null); setBusy(false);
  }, [owner, status]);

  const load = useCallback(async (append = false) => {
    if (!repository || !focused.current || loadingRef.current) return;
    loadingRef.current = true;
    const version = ++requestId.current;
    const request = new AbortController(); requests.current.add(request);
    const offset = append ? visibleRef.current.reports.length : 0;
    setState(old => ({ ...(old.owner === owner && old.status === status ? old : initial(owner, status)), loading: true, error: '' }));
    try {
      const page = await repository.list(status, offset, request.signal);
      if (focused.current && currentScope.current === scope && version === requestId.current) setState(old => ({ owner, status, loading: false, error: '', reports: append ? [...old.reports, ...page.filter(item => !old.reports.some(existing => existing.id === item.id))] : page, hasMore: page.length === 50 }));
    } catch (error) {
      if (focused.current && currentScope.current === scope && version === requestId.current) setState(old => ({ ...old, loading: false, error: error instanceof Error ? error.message : 'No pudimos cargar los reportes.' }));
    } finally {
      requests.current.delete(request);
      if (currentScope.current === scope && version === requestId.current) loadingRef.current = false;
    }
  }, [repository, owner, status, scope]);

  useFocusEffect(useCallback(() => {
    focused.current = true; void load();
    return () => {
      focused.current = false; requestId.current++; loadingRef.current = false;
      requests.current.forEach(request => request.abort()); requests.current.clear();
      setSelection(null); busyRef.current = false; setBusy(false);
    };
  }, [load]));

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
    <ScrollView contentContainerStyle={styles.content}>
      <PageTitle title="Reportes" subtitle="Cuida las conversaciones de KarmaHouse." back />
      {!user ? <AccountPrompt returnTo="/message-reports" /> : !owner || !repository ? <EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Solo las cuentas administradoras pueden revisar reportes." /> : <>
        <View style={styles.filters}><Pill label="Pendientes" active={status === 'open'} onPress={() => setStatus('open')} /><Pill label="Revisados" active={status === 'reviewed'} onPress={() => setStatus('reviewed')} /></View>
        <Text style={styles.meta}>Cada reporte incluye el contexto de la conversación en el momento de enviarlo.</Text>
        <Button label="Actualizar reportes" secondary icon="refresh-outline" loading={visible.loading} disabled={busy} onPress={() => void load()} />
        {visible.error ? <Notice error>{visible.error}</Notice> : null}
        {visible.loading && visible.reports.length === 0 ? <ActivityIndicator color={colors.primary} style={{ margin: 40 }} /> : !visible.error && visible.reports.length === 0 ? <EmptyState icon="shield-checkmark-outline" title={status === 'open' ? 'Sin reportes pendientes' : 'Aún no hay revisiones'} description={status === 'open' ? 'Aquí aparecerán las conversaciones que necesiten atención.' : 'Los reportes revisados se conservarán aquí.'} /> : null}
        {visible.reports.map(report => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Revisar reporte: ${reasonLabels[report.reason]}, ${report.propertyTitle}`} style={({ pressed }) => [styles.card, pressed && { opacity: .75 }]} onPress={() => setSelection({ owner, report, note: '', error: '' })}>
          <View style={styles.row}><View style={styles.flag}><Icon name="flag-outline" color={colors.primary} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.title}>{reasonLabels[report.reason]}</Text><Text style={styles.meta}>{dateLabel(report.createdAt)}</Text></View><Icon name="chevron-forward" color={colors.muted} size={18} /></View>
          <Text style={styles.property}>{report.propertyTitle}</Text>
          {report.details ? <Text numberOfLines={3} style={styles.body}>{report.details}</Text> : null}
          <Text style={styles.meta}>{report.context.length} mensajes de contexto · {report.status === 'open' ? 'Pendiente' : 'Revisado'}</Text>
        </Pressable>)}
        {visible.hasMore && <Button label="Cargar más reportes" secondary loading={visible.loading} onPress={() => void load(true)} />}
      </>}
    </ScrollView>
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => !busy && setSelection(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <View style={styles.row}><Text style={[styles.label, { flex: 1 }]}>{message.senderId === selected.report.reporterId ? 'Quien reporta' : 'Cuenta reportada'}</Text><Text style={styles.time}>{dateLabel(message.createdAt)}</Text></View>
              <Text selectable style={styles.body}>{message.body}</Text>
            </View>)}
            {selected?.report.status === 'reviewed' ? <Notice>{selected.report.reviewNote || 'Este reporte ya fue revisado.'}</Notice> : selected && (selected.report.reporterId === owner || selected.report.reportedUserId === owner) ? <Notice>Formas parte de esta conversación. Otra cuenta administradora debe revisar el reporte.</Notice> : <>
              <Text style={styles.label}>Nota de revisión · opcional</Text>
              <TextInput accessibilityLabel="Nota de revisión del reporte" value={selected?.note ?? ''} onChangeText={note => setSelection(old => old ? { ...old, note } : null)} multiline maxLength={1000} editable={!busy} placeholder="Deja constancia de lo revisado." placeholderTextColor={colors.muted} style={styles.input} />
              <Text style={styles.meta}>Marcar como revisado conserva el contexto. No bloquea ni suspende cuentas automáticamente.</Text>
              {selected?.error ? <Notice error>{selected.error}</Notice> : null}
              <Button label="Marcar como revisado" icon="checkmark-outline" loading={busy} disabled={visible.loading} onPress={() => void review()} />
            </>}
            <Button label="Cerrar reporte" secondary disabled={busy} onPress={() => setSelection(null)} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingBottom: 28, gap: 14 },
  filters: { flexDirection: 'row', gap: 10 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  card: { backgroundColor: colors.white, borderRadius: 24, padding: 20, gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flag: { width: 44, height: 44, backgroundColor: colors.softBlue, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: colors.ink }, property: { fontSize: 16, fontWeight: '600', lineHeight: 23, color: colors.ink },
  body: { fontSize: 15, lineHeight: 23, color: colors.ink }, label: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: '#00000055', padding: 16, justifyContent: 'center' }, modal: { width: '100%', maxWidth: 580, maxHeight: '94%', alignSelf: 'center', backgroundColor: colors.white, borderRadius: 28, overflow: 'hidden' },
  modalContent: { padding: 22, gap: 16 }, modalTitle: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -.6, color: colors.ink },
  message: { backgroundColor: colors.paper, borderRadius: 16, padding: 14, gap: 8 }, time: { fontSize: 11, color: colors.muted },
  input: { minHeight: 100, borderRadius: 16, padding: 14, backgroundColor: colors.paper, color: colors.ink, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' },
});
