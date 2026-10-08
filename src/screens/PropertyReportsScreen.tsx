import { router,useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import { AccountPrompt } from '../components/AccountPrompt';
import { Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { createPropertyReportRepository, PROPERTY_REPORT_REASONS, type PropertyReport } from '../data/propertyReports';
import { supabase } from '../lib/supabase';
import { createThemedStyles } from '../theme';

const reasonLabel = (reason: PropertyReport['reason']) => PROPERTY_REPORT_REASONS.find(item => item.value === reason)?.label ?? reason;
const dateLabel = (value: string) => new Date(value).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function PropertyReportsScreen() {
  const { colors, styles } = useStyles();
  const { user, session, isAdmin } = useAuth();
  const owner = isAdmin ? user?.id ?? '' : '';
  const repository = useMemo(() => supabase && owner && session?.access_token ? createPropertyReportRepository(supabase, { actorId: owner, accessToken: session.access_token }) : null, [owner, session?.access_token]);
  const [status, setStatus] = useState<'open' | 'reviewed'>('open');
  const [query,setQuery]=useState(''),[filters,setFilters]=useState<Record<string,string>>({}),[sort,setSort]=useState<'newest'|'oldest'>('newest');
  const list=useAdminQuery('propertyReports',query,{...filters,status},sort);
  const reports=list.items as PropertyReport[],loading=list.loading,error=list.error;
  const [selection, setSelected] = useState<{ scope:string;report: PropertyReport; note: string; error: string } | null>(null);
  const [busy, setBusy] = useState<'withdraw' | 'dismiss' | null>(null);
  const scope=JSON.stringify([owner,session?.access_token,status,query,filters,sort]);
  const current=useRef(scope);current.current=scope;
  const selected=selection?.scope===scope&&owner?selection:null;
  const focused=useRef(false);
  useFocusEffect(useCallback(()=>{focused.current=true;return()=>{focused.current=false;setSelected(null);};},[]));
  const saving=useRef(false);
  useEffect(()=>{setSelected(null);setBusy(null);saving.current=false;},[scope]);
  const load=list.reload;

  async function review(unpublish: boolean) {
    if (!selected || !repository || saving.current || loading) return;
    const captured=scope;saving.current=true;
    const saved = selected;
    setBusy(unpublish ? 'withdraw' : 'dismiss'); setSelected({ ...saved, error: '' });
    try {
      await repository.review(saved.report.id, saved.note, unpublish);
      if(!focused.current||current.current!==captured)return;
      setSelected(null);
      await load();
    } catch (failure) {
      if(focused.current&&current.current===captured)setSelected({ ...saved, error: failure instanceof Error ? failure.message : 'No se pudo guardar la revisión.' });
    } finally { if(focused.current&&current.current===captured){saving.current=false;setBusy(null);} }
  }

  const own = selected && (selected.report.reporterId === owner || selected.report.ownerId === owner);
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={list.refreshing} enabled={!!repository&&!busy} onRefresh={()=>{if(!saving.current)void list.refresh();}} tintColor={colors.primary}/>}>
      <PageTitle title="Reportes de anuncios" subtitle="Viviendas que alguien señaló como problemáticas." back />
      {!user ? <AccountPrompt returnTo="/property-reports" /> : !repository ? <EmptyState icon="lock-closed-outline" title="Acceso reservado" description="Solo las cuentas administradoras pueden revisar reportes." /> : <>
        <View style={styles.filters}><Pill label="Pendientes" active={status === 'open'} onPress={() => setStatus('open')} /><Pill label="Revisados" active={status === 'reviewed'} onPress={() => setStatus('reviewed')} /></View>
        <AdminToolbar query={query} onSearch={setQuery} filters={filters} onFilters={setFilters} fields={[{key:'reason',label:'Motivo',options:PROPERTY_REPORT_REASONS},{key:'from',label:'Desde',kind:'date'},{key:'to',label:'Hasta',kind:'date'}]} sort={sort} onSort={value=>setSort(value as typeof sort)} allowName={false} disabled={!!busy}/>

        {error ? <Notice error>{error}</Notice> : null}
        {loading && reports.length === 0 ? <ActivityIndicator color={colors.primary} style={{ margin: 40 }} /> : !error && reports.length === 0 ? <EmptyState icon="shield-checkmark-outline" title={status === 'open' ? 'Sin reportes pendientes' : 'Aún no hay revisiones'} description={status === 'open' ? 'Aquí aparecerán los anuncios que necesiten atención.' : 'Los reportes revisados se conservarán aquí.'} /> : null}
        {reports.map(report => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Revisar reporte: ${reasonLabel(report.reason)}, ${report.propertyTitle}`} style={({ pressed }) => [styles.card, pressed && { opacity: .75 }]} onPress={() => setSelected({ scope,report, note: '', error: '' })}>
          <View style={styles.row}><View style={styles.flag}><Icon name="flag-outline" color={colors.primary} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.title}>{reasonLabel(report.reason)}</Text><Text style={styles.meta}>{dateLabel(report.createdAt)}</Text></View><Icon name="chevron-forward" color={colors.muted} size={18} /></View>
          <Text style={styles.property}>{report.propertyTitle}</Text>
          {report.details ? <Text numberOfLines={3} style={styles.body}>{report.details}</Text> : null}
          <AdminStatus label={report.status==='open'?'Pendiente':report.unpublished?'Anuncio retirado':'Descartado'} tone={report.status==='open'?'amber':'neutral'}/>
        </Pressable>)}
        <AdminPagination {...list} loading={loading||!!busy}/>
      </>}
    </ScrollView>
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => !busy && setSelected(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <View accessibilityViewIsModal style={styles.modal}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
            {selected && <>
              <Text accessibilityRole="header" style={styles.modalTitle}>{reasonLabel(selected.report.reason)}</Text>
              <Text style={styles.property}>{selected.report.propertyTitle}</Text>
              <Text style={styles.meta}>{dateLabel(selected.report.createdAt)}</Text>
              <Text style={styles.body}>{selected.report.details || 'Sin comentario adicional.'}</Text>
              {selected.report.propertyLive && <Button label="Ver anuncio" secondary icon="open-outline" disabled={!!busy} onPress={() => { setSelected(null); router.push(`/property/${selected.report.propertyId}`); }} />}
              {selected.report.status === 'reviewed' ? <Notice>{selected.report.reviewNote || 'Este reporte ya fue revisado.'}</Notice> : own ? <Notice>Formas parte de este reporte. Otra cuenta administradora debe revisarlo.</Notice> : <>
                <Text style={styles.label}>Motivo para quien publicó</Text>
                <TextInput accessibilityLabel="Motivo de la revisión" value={selected.note} onChangeText={note => setSelected(old => old ? { ...old, note } : null)} multiline maxLength={1000} editable={!busy} placeholder="Obligatorio al retirar: lo verá el propietario en Mis anuncios." placeholderTextColor={colors.muted} style={styles.input} />
                <Text style={styles.meta}>Retirar devuelve el anuncio a «Necesita cambios» y cierra todos sus reportes pendientes. No suspende la cuenta.</Text>
                {selected.error ? <Notice error>{selected.error}</Notice> : null}
                {selected.report.propertyLive && <Button label="Retirar anuncio" icon="eye-off-outline" loading={busy === 'withdraw'} disabled={!!busy || !selected.note.trim()} onPress={() => void review(true)} />}
                <Button label="Descartar reporte" secondary icon="checkmark-outline" loading={busy === 'dismiss'} disabled={!!busy} onPress={() => void review(false)} />
              </>}
              <Button label="Cerrar" secondary disabled={!!busy} onPress={() => setSelected(null)} />
            </>}
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
  input: { minHeight: 100, borderRadius: 16, padding: 14, backgroundColor: colors.paper, color: colors.ink, fontSize: 15, lineHeight: 23, textAlignVertical: 'top' },
}));
