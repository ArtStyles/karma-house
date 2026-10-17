import { router,useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import {useAdminQuery} from '../admin/useAdminQuery';
import {AdminPagination,AdminStatus,AdminToolbar,options} from '../components/admin/AdminControls';
import { AccountPrompt } from '../components/AccountPrompt';
import { ActionGroup, Button, EmptyState, Icon, Notice, PageTitle, Pill } from '../components/ui';
import { createPropertyReportRepository, PROPERTY_REPORT_REASONS, type PropertyReport } from '../data/propertyReports';
import { supabase } from '../lib/supabase';
import {createThemedStyles,internalLayout,rounded,typography} from '../theme';

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
      <PageTitle compact title="Reportes de anuncios" subtitle="Incidencias y decisiones sobre viviendas." back fallback="/administration" />
      {!user ? <AccountPrompt returnTo="/property-reports" /> : !repository ? <EmptyState plain title="Acceso reservado" description="Solo las cuentas administradoras pueden revisar reportes." /> : <>
        <View style={styles.filters}><Pill label="Pendientes" active={status === 'open'} onPress={() => setStatus('open')} /><Pill label="Revisados" active={status === 'reviewed'} onPress={() => setStatus('reviewed')} /></View>
        <AdminToolbar query={query} onSearch={setQuery} filters={filters} onFilters={setFilters} fields={[{key:'reason',label:'Motivo',options:PROPERTY_REPORT_REASONS},{key:'from',label:'Desde',kind:'date'},{key:'to',label:'Hasta',kind:'date'}]} sort={sort} onSort={value=>setSort(value as typeof sort)} allowName={false} disabled={!!busy}/>

        {error ? <Notice error>{error}</Notice> : null}
        {loading && reports.length === 0 ? <ActivityIndicator color={colors.primary} style={{ margin: 32 }} /> : !error && reports.length === 0 ? <EmptyState plain title={status === 'open' ? 'Sin reportes pendientes' : 'Sin reportes revisados'} description={status === 'open' ? 'No hay anuncios denunciados pendientes en esta vista.' : 'No hay revisiones que coincidan con los filtros.'} /> : null}
        {!!reports.length&&<View style={styles.reportList}>{reports.map(report => <Pressable key={report.id} accessibilityRole="button" accessibilityLabel={`Revisar reporte: ${reasonLabel(report.reason)}, ${report.propertyTitle}`} style={({ pressed }) => [styles.card, pressed && { opacity: .75 }]} onPress={() => setSelected({ scope,report, note: '', error: '' })}>
          <View style={styles.row}><View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={styles.title}>{reasonLabel(report.reason)}</Text><Text style={styles.meta}>{dateLabel(report.createdAt)}</Text></View><Icon name="chevron-forward" color={colors.muted} size={18} /></View>
          <Text style={styles.property}>{report.propertyTitle}</Text>
          {report.details ? <Text numberOfLines={3} style={styles.body}>{report.details}</Text> : null}
          <AdminStatus label={report.status==='open'?'Pendiente':report.unpublished?'Anuncio retirado':'Descartado'} tone={report.status==='open'?'amber':'neutral'}/>
        </Pressable>)}</View>}
        <AdminPagination {...list} loading={loading||!!busy}/>
      </>}
    </ScrollView>
    <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => !busy && setSelected(null)}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <SafeAreaView style={styles.modalSafe} edges={['top','bottom','left','right']}>
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
                <ActionGroup direction="vertical">{selected.report.propertyLive && <Button label="Retirar anuncio" icon="eye-off-outline" loading={busy === 'withdraw'} disabled={!!busy || !selected.note.trim()} onPress={() => void review(true)} />}
                <Button label="Descartar reporte" secondary icon="checkmark-outline" loading={busy === 'dismiss'} disabled={!!busy} onPress={() => void review(false)} /></ActionGroup>
              </>}
              <Button label="Cerrar" secondary disabled={!!busy} onPress={() => setSelected(null)} />
            </>}
          </ScrollView>
        </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper }, content: { width: '100%', maxWidth: internalLayout.maxWidth, alignSelf: 'center', paddingHorizontal: internalLayout.gutter, paddingBottom: 32, gap: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, meta: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  reportList:{backgroundColor:colors.surface,borderRadius:rounded.card,borderWidth:1,borderColor:colors.border,overflow:'hidden'},
  card: { padding: 16, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title:{...typography.cardTitle,color:colors.ink}, property:{...typography.cardTitle,color:colors.ink},
  body: { fontSize: 15, lineHeight: 23, color: colors.ink }, label: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: colors.photoOverlay }, modalSafe:{flex:1,justifyContent:'flex-end'}, modal:{width:'100%',maxWidth:580,maxHeight:'94%',alignSelf:'center',backgroundColor:colors.sheet,borderTopLeftRadius:rounded.sheet,borderTopRightRadius:rounded.sheet,borderWidth:1,borderBottomWidth:0,borderColor:colors.border,overflow:'hidden'},
  modalContent: { padding: 20, gap: 16 }, modalTitle:{...typography.sheetTitle,color:colors.ink},
  input:{minHeight:112,borderRadius:rounded.card,borderWidth:1,borderColor:colors.border,paddingVertical:14,paddingHorizontal:18,backgroundColor:colors.surface,color:colors.ink,fontSize:16,lineHeight:23,textAlignVertical:'top'},
}));
