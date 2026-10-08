import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import type { CapturedAccountContext, CapturedAgencyContext } from '../../agencies/controller';
import type { AgencyConversation } from '../../agencies/messaging/types';
import type { AgencyProposal, AgencyProposalEvent, CreateAgencyProposal, RespondAgencyProposal } from '../../agencies/scheduling/types';
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
export function AgencyProposalPanel({ conversation: c, actorId, staff, capture, onChanged }: {
    conversation: AgencyConversation;
    actorId: string;
    staff: boolean;
    capture: () => CapturedAccountContext | CapturedAgencyContext;
    onChanged: () => Promise<void>;
}) {
    const { styles: s, colors } = useAgencyFormStyles();
    const [items, setItems] = useState<AgencyProposal[]>([]), [events, setEvents] = useState<AgencyProposalEvent[]>([]), [eventTarget, setEventTarget] = useState<string | null>(null), [moreEvents, setMoreEvents] = useState(false), [hasMore, setHasMore] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const [kind, setKind] = useState<'visit' | 'offer'>('visit'), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(havanaDateTime().date), [time, setTime] = useState('10:00'), [duration, setDuration] = useState(60), [parent, setParent] = useState<AgencyProposal | null>(null), [jointToken, setJointToken] = useState('');
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
    async function save() { await run(async (ctx) => { if (!repository)
        return; if (!attempt.current)
        attempt.current = { kind: 'create', payload: validateAgencyProposal({ dealId: c.dealId, kind, note, clientRequestId: createMessageId(), ...(kind === 'offer' ? { amountUsd: amount } : { visitDate: date, visitTime: time, durationMinutes: duration }), ...(parent ? { replacesId: parent.id, expectedVersion: parent.version } : {}) }) }; await submitAttempt(ctx); }); }
    async function submitAttempt(ctx: ReturnType<typeof capture>) { if (!repository || !attempt.current)
        return; const a = attempt.current; if (a.kind === 'create')
        await repository.create(a.payload, ctx);
    else
        await repository.respond(a.payload, ctx); ctx.checkpoint(); if (!mounted.current)
        return; attempt.current = null; setParent(null); setNote(''); setEvents([]); setEventTarget(null); await load(); await onChanged(); }
    async function respond(p: AgencyProposal, action: RespondAgencyProposal['action']) { await run(async (ctx) => { attempt.current = { kind: 'respond', payload: { proposalId: p.id, expectedVersion: p.version, action, clientRequestId: createMessageId(), ...(action === 'accept' && p.kind === 'visit' && jointToken.trim() ? { jointVisitToken: jointToken.trim() } : {}) } }; await submitAttempt(ctx); }); }
    const editable = c.canSend && !busy && !attempt.current;
    return <View style={s.card}><Text style={s.title}>Visitas y ofertas</Text><Notice>Las horas se muestran en Cuba. Una visita pasada sigue pendiente de resultado hasta que el equipo lo registre.</Notice>
 {error ? <Notice error>{error}</Notice> : null}
 <Button secondary label="Actualizar propuestas" disabled={busy} onPress={() => void run(async () => { await load(); await onChanged(); })}/>
 {items.map(p => {
            const ownSide = staff ? p.createdBy !== c.buyerId : p.createdBy === actorId;
            const respondable = p.status === 'pending' && !ownSide && c.canSend;
            return <View key={p.id} style={s.card}>
 <Text style={s.title}>{p.kind === 'offer' ? `${p.amountUsd?.toLocaleString('es')} USD` : new Date(p.visitAt!).toLocaleString('es', { timeZone: NEGOTIATION_TIME_ZONE }) + ` · ${p.durationMinutes} min`}</Text><Text style={s.copy}>{statusLabel[p.status]}{p.parentId ? ' · Alternativa' : ''}</Text>{p.note ? <Text style={s.copy}>{p.note}</Text> : null}
 {p.kind === 'offer' && p.status === 'accepted' && <><Text style={s.title}>Acuerdo de negociación</Text><Notice>El acuerdo queda registrado. La venta se confirma por separado.</Notice>{staff && <Button label="Solicitar cierre" disabled onPress={() => { }}/>}</>}
 {respondable && <><Button label="Aceptar propuesta" disabled={!!attempt.current || p.kind === 'visit' && !c.assigneeId} loading={busy} onPress={() => void respond(p, 'accept')}/>{p.kind === 'visit' && !c.assigneeId && <Notice>El equipo debe asignar un responsable antes de confirmar la visita.</Notice>}<Button secondary label="Rechazar propuesta" disabled={!!attempt.current || busy} onPress={() => void respond(p, 'decline')}/><Button secondary label={p.kind === 'visit' ? 'Proponer otra fecha' : 'Hacer contraoferta'} disabled={!editable} onPress={() => { setParent(p); setKind(p.kind); setAmount(String(p.amountUsd ?? '')); if (p.visitAt) {
                const wall = havanaDateTime(new Date(p.visitAt));
                setDate(wall.date);
                setTime(wall.time);
                setDuration(p.durationMinutes ?? 60);
            } }}/></>}
 {(p.status === 'accepted' || p.status === 'pending' && ownSide) && <Button secondary label={p.kind === 'visit' ? 'Cancelar visita' : 'Retirar oferta'} disabled={busy || !!attempt.current} onPress={() => void respond(p, 'cancel')}/>}
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
 {attempt.current ? <><Notice>Conservamos el envío para reintentarlo con el mismo contenido.</Notice><Button label="Reintentar propuesta" loading={busy} onPress={() => void run(submitAttempt)}/><Button secondary label="Descartar intento" disabled={busy} onPress={() => { attempt.current = null; setError(''); }}/></> : <>
 <Text style={s.title}>{parent ? 'Preparar alternativa' : 'Preparar propuesta'}</Text><View style={s.wrap}>{(['visit', 'offer'] as const).map(k => <Pill key={k} label={k === 'visit' ? 'Visita' : 'Oferta'} active={kind === k} onPress={() => { if (editable) {
            setKind(k);
            setParent(null);
        } }}/>)}</View>
 {kind === 'visit' ? <><VisitDateTimeFields date={date} time={time} disabled={!editable} onDate={setDate} onTime={setTime}/><View style={s.wrap}>{[30, 60, 90, 120].map(n => <Pill key={n} label={`${n} min`} active={duration === n} onPress={() => { if (editable)
            setDuration(n); }}/>)}</View></> : <TextInput style={s.input} accessibilityLabel="Oferta en USD" keyboardType="decimal-pad" placeholder="Importe en USD" placeholderTextColor={colors.muted} value={amount} editable={editable} onChangeText={setAmount}/>}
 <TextInput style={s.input} accessibilityLabel="Nota de la propuesta" value={note} editable={editable} multiline maxLength={500} placeholder="Nota opcional" placeholderTextColor={colors.muted} onChangeText={setNote}/>
 <TextInput style={s.input} accessibilityLabel="Código de visita conjunta" value={jointToken} editable={!busy} autoCapitalize="none" placeholder="Código de visita conjunta (si corresponde)" placeholderTextColor={colors.muted} onChangeText={setJointToken}/>
 <Button label={parent ? 'Enviar alternativa' : 'Enviar propuesta'} disabled={!editable} onPress={() => void save()}/>{parent && <Button secondary label="Descartar alternativa" disabled={busy} onPress={() => setParent(null)}/>}
 </>}
 </View>;
}
