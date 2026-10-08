import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import type { CapturedAccountContext, CapturedAgencyContext } from '../../agencies/controller';
import type { AgencyConversation } from '../../agencies/messaging/types';
import type { AgencyProposal, AgencyProposalEvent, CreateAgencyProposal, RespondAgencyProposal, ExternalResponse } from '../../agencies/scheduling/types';
import { createAgencySchedulingRepository } from '../../agencies/scheduling/repository';
import { schedulingError, validateAgencyProposal } from '../../agencies/scheduling/domain';
import { havanaDateTime, NEGOTIATION_TIME_ZONE } from '../../negotiations/domain';
import { createMessageId } from '../../messaging/domain';
import { supabase } from '../../lib/supabase';
import { Button, Notice, Pill } from '../ui';
import { useAgencyFormStyles } from './AgencyRegistrationFields';
import { VisitDateTimeFields } from '../negotiations/VisitDateTimeFields';
const repository = supabase ? createAgencySchedulingRepository(supabase) : null;
const statusLabel = { pending: 'Pendiente', accepted: 'Aceptada', declined: 'Rechazada', cancelled: 'Cancelada', superseded: 'Sustituida', expired: 'Caducada' };
export function AgencyProposalPanel({ conversation: c, actorId, staff, capture, onChanged, onRequestClosure, external=false }: {
    conversation: Pick<AgencyConversation,'dealId'|'buyerId'|'assigneeId'|'canSend'>;
    actorId: string;
    staff: boolean;
    capture: () => CapturedAccountContext | CapturedAgencyContext;
    onChanged: () => Promise<void>;
    external?: boolean;
    onRequestClosure?: () => void;
}) {
    const { styles: s, colors } = useAgencyFormStyles();
    const [items, setItems] = useState<AgencyProposal[]>([]), [events, setEvents] = useState<AgencyProposalEvent[]>([]), [eventTarget, setEventTarget] = useState<string | null>(null), [moreEvents, setMoreEvents] = useState(false), [hasMore, setHasMore] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [kind, setKind] = useState<'visit' | 'offer'>('visit'), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(havanaDateTime().date), [time, setTime] = useState('10:00'), [duration, setDuration] = useState(60), [parent, setParent] = useState<AgencyProposal | null>(null), [jointToken, setJointToken] = useState('');
    const [channel,setChannel]=useState<ExternalResponse['channel']>('phone'),[reference,setReference]=useState(''),[manualBuyer,setManualBuyer]=useState(false),[buyerResponse,setBuyerResponse]=useState(true);
    const mounted = useRef(false), lock = useRef(false), attempt = useRef<{
        kind: 'create';
        payload: CreateAgencyProposal;
    } | {
        kind: 'respond';
        payload: RespondAgencyProposal;
    } | null>(null);
    const load = useCallback(async () => { if (!repository)
        return; const ctx = capture(); try {
        const page = await repository.list(c.dealId, 0, ctx);
        ctx.checkpoint();
        if (mounted.current) {
            setItems(page.items);
            setHasMore(page.hasMore);
        }
    }
    finally {
        ctx.release();
    } }, [c.dealId, capture]);
    useFocusEffect(useCallback(() => { mounted.current = true; void load().catch(e => { if (mounted.current)
        setError(schedulingError(e)); }); return () => { mounted.current = false; }; }, [load]));
    async function run(work: (ctx: ReturnType<typeof capture>) => Promise<void>) { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); let ctx: ReturnType<typeof capture> | undefined; try {
        ctx = capture();
        await work(ctx);
        ctx.checkpoint();
    }
    catch (e) {
        try {
            ctx?.checkpoint();
            if (mounted.current)
                setError(schedulingError(e));
        }
        catch { }
    }
    finally {
        ctx?.release();
        lock.current = false;
        if (mounted.current)
            setBusy(false);
    } }
    async function save() { if (!c.canSend) return; await run(async (ctx) => { if (!repository)
        return; if (!attempt.current)
        attempt.current = { kind: 'create', payload: validateAgencyProposal({ dealId: c.dealId, kind, note, clientRequestId: createMessageId(), ...(kind === 'offer' ? { amountUsd: amount } : { visitDate: date, visitTime: time, durationMinutes: duration }), ...(parent ? { replacesId: parent.id, expectedVersion: parent.version } : {}),...(external&&manualBuyer?{externalResponse:manualResponse()}: {}) }) }; await submitAttempt(ctx); }); }
    async function submitAttempt(ctx: ReturnType<typeof capture>) { if (!c.canSend || !repository || !attempt.current)
        return; const a = attempt.current; if (a.kind === 'create')
        await repository.create(a.payload, ctx);
    else
        await repository.respond(a.payload, ctx); ctx.checkpoint(); if (!mounted.current)
        return; attempt.current = null; setParent(null); setNote(''); setEvents([]); setEventTarget(null); await load(); await onChanged(); }
    function manualResponse():ExternalResponse {const trimmed=reference.trim();if(trimmed.length<2||trimmed.length>500)throw Error('Revisa la referencia de la respuesta del interesado.');return {channel,reference:trimmed};}
    async function respond(p: AgencyProposal, action: RespondAgencyProposal['action']) { if (!c.canSend) return; await run(async (ctx) => { attempt.current = { kind: 'respond', payload: { proposalId: p.id, expectedVersion: p.version, action, clientRequestId: createMessageId(), ...(action === 'accept' && p.kind === 'visit' && jointToken.trim() ? { jointVisitToken: jointToken.trim() } : {}),...(external&&buyerResponse?{externalResponse:manualResponse()}: {}) } }; await submitAttempt(ctx); }); }
    const editable = c.canSend && !busy && !attempt.current;
    return <View style={s.card}><Text style={s.title}>Visitas y ofertas</Text><Notice>Las horas se muestran en Cuba. Una visita pasada sigue pendiente de resultado hasta que el equipo lo registre.</Notice>
 {error ? <Notice error>{error}</Notice> : null}
 {external&&<><Notice>Selecciona quién respondió según la propuesta registrada. La aceptación o el rechazo corresponden a la otra parte; consulta el historial si tienes dudas.</Notice><View style={s.wrap}><Pill label="Respuesta del interesado" active={buyerResponse} onPress={()=>{if(!busy&&!attempt.current)setBuyerResponse(true);}}/><Pill label="Decisión de la agencia" active={!buyerResponse} onPress={()=>{if(!busy&&!attempt.current)setBuyerResponse(false);}}/></View><Notice>Las respuestas del interesado conservan tu autoría, el canal y la referencia recibida.</Notice><View style={s.wrap}>{(['phone','in_person','whatsapp','other'] as const).map(ch=><Pill key={ch} label={{phone:'Teléfono',in_person:'En persona',whatsapp:'WhatsApp',other:'Otro'}[ch]} active={channel===ch} onPress={()=>{if(!busy&&!attempt.current)setChannel(ch);}}/>)}</View><TextInput style={s.input} accessibilityLabel="Referencia de respuesta externa" value={reference} onChangeText={setReference} maxLength={500} editable={!busy&&!attempt.current} placeholder="Cuándo y cómo respondió el interesado" placeholderTextColor={colors.muted}/></>}
 <Button secondary label="Actualizar propuestas" disabled={busy} onPress={() => void run(async () => { await load(); await onChanged(); })}/>
 {items.map(p => {
            const ownSide = staff ? p.createdBy !== c.buyerId : p.createdBy === actorId;
            const respondable = p.status === 'pending' && (external||!ownSide) && c.canSend;
            return <View key={p.id} style={s.card}>
 <Text style={s.title}>{p.kind === 'offer' ? `${p.amountUsd?.toLocaleString('es')} USD` : new Date(p.visitAt!).toLocaleString('es', { timeZone: NEGOTIATION_TIME_ZONE }) + ` · ${p.durationMinutes} min`}</Text><Text style={s.copy}>{statusLabel[p.status]}{p.parentId ? ' · Alternativa' : ''}</Text>{p.note ? <Text style={s.copy}>{p.note}</Text> : null}
 {p.kind === 'offer' && p.status === 'accepted' && <><Text style={s.title}>Acuerdo de negociación</Text><Notice>El acuerdo queda registrado. La venta se confirma por separado.</Notice>{staff && onRequestClosure && <Button label="Solicitar cierre" onPress={onRequestClosure}/>}</>}
 {respondable && <><Button label={external?(buyerResponse?'Registrar aceptación del interesado':'Aceptar como agencia'):'Aceptar propuesta'} disabled={!!attempt.current || p.kind === 'visit' && !c.assigneeId} loading={busy} onPress={() => void respond(p, 'accept')}/>{p.kind === 'visit' && !c.assigneeId && <Notice>El equipo debe asignar un responsable antes de confirmar la visita.</Notice>}<Button secondary label={external?(buyerResponse?'Registrar rechazo del interesado':'Rechazar como agencia'):'Rechazar propuesta'} disabled={!!attempt.current || busy} onPress={() => void respond(p, 'decline')}/><Button secondary label={p.kind === 'visit' ? 'Proponer otra fecha' : 'Hacer contraoferta'} disabled={!editable} onPress={() => { setParent(p); setKind(p.kind); setAmount(String(p.amountUsd ?? '')); if (p.visitAt) {
                const wall = havanaDateTime(new Date(p.visitAt));
                setDate(wall.date);
                setTime(wall.time);
                setDuration(p.durationMinutes ?? 60);
            } }}/></>}
 {(p.status === 'accepted' || p.status === 'pending' && ownSide) && <Button secondary label={p.kind === 'visit' ? 'Cancelar visita' : 'Retirar oferta'} disabled={!editable} onPress={() => void respond(p, 'cancel')}/>}
 <Button secondary label="Ver historial de la propuesta" disabled={busy} onPress={() => void run(async (ctx) => { if (!repository)
                return; const page = await repository.events(p.id, 0, ctx); ctx.checkpoint(); if (mounted.current) {
                setEvents(page.items);
                setEventTarget(p.id);
                setMoreEvents(page.hasMore);
            } })}/>
 </View>;
        })}
 {hasMore && <Button secondary label="Ver propuestas anteriores" disabled={busy} onPress={() => void run(async (ctx) => { if (!repository)
        return; const page = await repository.list(c.dealId, items.length, ctx); ctx.checkpoint(); if (mounted.current) {
        setItems(old => [...old, ...page.items.filter(x => !old.some(y => y.id === x.id))]);
        setHasMore(page.hasMore);
    } })}/>}
 {events.map(e => <Text key={e.id} style={s.copy}>{new Date(e.createdAt).toLocaleString('es', { timeZone: NEGOTIATION_TIME_ZONE })} · {e.responseSource === 'manual' ? `Confirmación manual · ${e.externalResponse?.channel} · ${e.externalResponse?.reference} · Registró: ${e.actorId ?? 'cuenta eliminada'}` : e.party === 'buyer' ? 'Respuesta del comprador' : e.party === 'team' ? 'Respuesta del equipo' : 'Cambio de estado'} · {e.action}</Text>)}
 {moreEvents && eventTarget && <Button secondary label="Ver eventos anteriores" onPress={() => void run(async (ctx) => { if (!repository || !eventTarget)
        return; const page = await repository.events(eventTarget, events.length, ctx); ctx.checkpoint(); if (mounted.current) {
        setEvents(old => [...old, ...page.items]);
        setMoreEvents(page.hasMore);
    } })}/>}
 {attempt.current ? <><Notice>Conservamos el envío para reintentarlo con el mismo contenido.</Notice><Button label="Reintentar propuesta" disabled={!c.canSend} loading={busy} onPress={() => void run(submitAttempt)}/><Button secondary label="Descartar intento" disabled={busy} onPress={() => { attempt.current = null; setError(''); }}/></> : <>
 <Text style={s.title}>{parent ? 'Preparar alternativa' : 'Preparar propuesta'}</Text><View style={s.wrap}>{(['visit', 'offer'] as const).map(k => <Pill key={k} label={k === 'visit' ? 'Visita' : 'Oferta'} active={kind === k} onPress={() => { if (editable) {
            setKind(k);
            setParent(null);
        } }}/>)}</View>
 {external&&<View style={s.wrap}><Pill label="Propuesta del equipo" active={!manualBuyer} onPress={()=>{if(editable)setManualBuyer(false);}}/><Pill label="Propuesta recibida del interesado" active={manualBuyer} onPress={()=>{if(editable)setManualBuyer(true);}}/></View>}
 {kind === 'visit' ? <><VisitDateTimeFields date={date} time={time} disabled={!editable} onDate={setDate} onTime={setTime}/><View style={s.wrap}>{[30, 60, 90, 120].map(n => <Pill key={n} label={`${n} min`} active={duration === n} onPress={() => { if (editable)
            setDuration(n); }}/>)}</View></> : <TextInput style={s.input} accessibilityLabel="Oferta en USD" keyboardType="decimal-pad" placeholder="Importe en USD" placeholderTextColor={colors.muted} value={amount} editable={editable} onChangeText={setAmount}/>}
 <TextInput style={s.input} accessibilityLabel="Nota de la propuesta" value={note} editable={editable} multiline maxLength={500} placeholder="Nota opcional" placeholderTextColor={colors.muted} onChangeText={setNote}/>
 <TextInput style={s.input} accessibilityLabel="Código de visita conjunta" value={jointToken} editable={editable} autoCapitalize="none" placeholder="Código de visita conjunta (si corresponde)" placeholderTextColor={colors.muted} onChangeText={setJointToken}/>
 <Button label={parent ? 'Enviar alternativa' : 'Enviar propuesta'} disabled={!editable} onPress={() => void save()}/>{parent && <Button secondary label="Descartar alternativa" disabled={busy} onPress={() => setParent(null)}/>}
 </>}
 </View>;
}
