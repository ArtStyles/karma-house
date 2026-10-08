import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/AgencyProvider';
import { agencyPropertyRepository } from '../agencies/properties/client';
import { createAgencySchedulingRepository } from '../agencies/scheduling/repository';
import type { AgencyCalendarVisit, AgencyReservation, BusyInterval, JointVisitSlot } from '../agencies/scheduling/types';
import { schedulingError, visitOutcomeLabel, havanaAgendaRange } from '../agencies/scheduling/domain';
import { havanaDateTime, havanaVisitInstant, NEGOTIATION_TIME_ZONE } from '../negotiations/domain';
import { createMessageId, isUuid } from '../messaging/domain';
import { supabase } from '../lib/supabase';
import { Button, Notice, PageTitle, Pill } from '../components/ui';
import { VisitDateTimeFields } from '../components/negotiations/VisitDateTimeFields';
import { useAgencyFormStyles } from '../components/agencies/AgencyRegistrationFields';
const repository = supabase ? createAgencySchedulingRepository(supabase) : null;
const format = (date: string) => new Date(date).toLocaleString('es', { timeZone: NEGOTIATION_TIME_ZONE });
export default function AgencyAgendaScreen() { const auth = useAuth(), w = useAgencyWorkspace(), { propertyId } = useLocalSearchParams<{
    propertyId?: string;
}>(); return <Agenda key={`${auth.user?.id}:${auth.session?.access_token}:${w.activeAgencyId}:${w.generation}:${propertyId}`} propertyId={propertyId}/>; }
function Agenda({ propertyId }: {
    propertyId?: string;
}) {
    const w = useAgencyWorkspace(), { styles: s, colors } = useAgencyFormStyles();
    const [date, setDate] = useState(havanaDateTime().date), [range, setRange] = useState(havanaDateTime().date), [items, setItems] = useState<AgencyCalendarVisit[]>([]), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [occupancy, setOccupancy] = useState<BusyInterval[]>([]), [originAdmin, setOriginAdmin] = useState(false), [reservation, setReservation] = useState<AgencyReservation | null>(null), [joint, setJoint] = useState<JointVisitSlot | null>(null);
    const [actionDate, setActionDate] = useState(havanaDateTime().date), [actionTime, setActionTime] = useState('18:00'), [duration, setDuration] = useState(60);
    const focused = useRef(false), epoch = useRef(0), locked = useRef(false), pending = useRef<{
        key: string;
        id: string;
    } | null>(null);
    const allowed = w.enabled && w.activeAgency?.state === 'approved' && !!w.membership;
    const capture = useCallback(() => { const c = w.captureAgencyContext(), version = epoch.current; return { ...c, checkpoint() { c.checkpoint(); if (!focused.current || version !== epoch.current)
            throw Error('KH_AGENCY_CONTEXT_CHANGED'); } }; }, [w.captureAgencyContext]);
    const bounds = useCallback(() => havanaAgendaRange(range), [range]);
    const load = useCallback(async () => { if (!repository || !allowed)
        return; let c: ReturnType<typeof capture> | undefined; try {
        c = capture();
        const { from, to } = bounds(), page = await repository.calendar(from, to, 0, c);
        let intervals: BusyInterval[] = [], canReserve = false, current: AgencyReservation | null = null;
        if (propertyId) {
            if (!isUuid(propertyId))
                throw Error('Vivienda inválida.');
            intervals = await repository.occupancy(propertyId, from, to, c);
            if (agencyPropertyRepository) {
                const property = await agencyPropertyRepository.get(propertyId, c);
                canReserve = property.canConfirmSale && w.membership?.role === 'admin';
                if (canReserve)
                    current = await repository.reservation(propertyId, c);
            }
        }
        c.checkpoint();
        setItems(page.items);
        setMore(page.hasMore);
        setOccupancy(intervals);
        setOriginAdmin(canReserve);
        setReservation(current);
        setError('');
    }
    catch (e) {
        try {
            c?.checkpoint();
            if (focused.current)
                setError(schedulingError(e));
        }
        catch { }
    }
    finally {
        c?.release();
    } }, [allowed, capture, bounds, propertyId, w.membership?.role]);
    useFocusEffect(useCallback(() => { focused.current = true; epoch.current++; setItems([]); setOccupancy([]); setOriginAdmin(false); setReservation(null); setJoint(null); pending.current = null; void load(); return () => { focused.current = false; epoch.current++; }; }, [load]));
    async function act(key: string, work: (c: ReturnType<typeof capture>, request: string) => Promise<void>, refresh = true) { if (locked.current)
        return; locked.current = true; setBusy(true); let c: ReturnType<typeof capture> | undefined; try {
        c = capture();
        if (pending.current?.key !== key)
            pending.current = { key, id: createMessageId() };
        await work(c, pending.current.id);
        c.checkpoint();
        pending.current = null;
        if (refresh)
            await load();
    }
    catch (e) {
        try {
            c?.checkpoint();
            if (focused.current)
                setError(schedulingError(e));
        }
        catch { }
    }
    finally {
        c?.release();
        locked.current = false;
        if (focused.current)
            setBusy(false);
    } }
    return <SafeAreaView style={s.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}><PageTitle title="Agenda" subtitle={w.activeAgency?.tradeName ?? 'Selecciona una inmobiliaria'} back/>
 {!allowed ? <Notice>Selecciona una inmobiliaria aprobada para consultar su agenda.</Notice> : <>
 <Notice>Horario de Cuba · America/Havana. El resultado de una visita se registra expresamente, aunque su hora ya haya pasado.</Notice>{error ? <Notice error>{error}</Notice> : null}
 <TextInput style={s.input} accessibilityLabel="Fecha inicial de agenda" value={date} editable={!busy} onChangeText={setDate} placeholder="AAAA-MM-DD" placeholderTextColor={colors.muted}/><Button label="Consultar semana" loading={busy} onPress={() => { try {
            havanaAgendaRange(date);
            if (date === range)
                void load();
            else
                setRange(date);
        }
        catch (e) {
            setError(schedulingError(e));
        } }}/>
 {items.length === 0 && <Notice>No hay visitas en esta semana.</Notice>}
 {items.map(v => <View key={v.proposalId} style={s.card}><Text style={s.title}>{v.propertyTitle}</Text><Text style={s.copy}>{v.contactName} · {format(v.startsAt)} — {format(v.endsAt)}</Text><Text style={s.copy}>{v.assigneeId === w.membership?.userId ? 'Responsable: tú' : 'Responsable: ' + v.assigneeName} · {visitOutcomeLabel(v.outcome)}</Text>{v.existingConflict && <Notice error>Esta cita coincide con otro compromiso anterior. Coordina una nueva fecha.</Notice>}
 <Button secondary label="Abrir expediente privado" onPress={() => router.push({ pathname: '/agency-deal/[id]', params: { id: v.dealId } })}/><Button secondary label="Ver ocupación de esta vivienda" onPress={() => router.push({ pathname: '/agency-agenda', params: { propertyId: v.propertyId } })}/>
 {v.outcome === 'unrecorded' && (['performed', 'no_show', 'cancelled'] as const).map(outcome => <Button key={outcome} secondary label={visitOutcomeLabel(outcome)} disabled={busy || outcome !== 'cancelled' && Date.parse(v.startsAt) > Date.now()} onPress={() => void act(`${v.proposalId}:${v.version}:${outcome}`, async (c, clientRequestId) => { await repository!.recordOutcome({ proposalId: v.proposalId, expectedVersion: v.version, outcome, clientRequestId }, c); })}/>)}
 </View>)}
 {more && <Button secondary label="Ver más visitas" loading={busy} onPress={() => void act('page', async (c) => { const { from, to } = bounds(), page = await repository!.calendar(from, to, items.length, c); c.checkpoint(); setItems(old => [...old, ...page.items]); setMore(page.hasMore); }, false)}/>}
 {propertyId && <View style={s.card}><Text style={s.title}>Ocupación de la vivienda</Text><Notice>Las citas de otras agencias muestran únicamente el intervalo ocupado.</Notice>{occupancy.length ? occupancy.map((o, i) => <Text key={i} style={s.copy}>Ocupado · {format(o.startsAt)} — {format(o.endsAt)}</Text>) : <Text style={s.copy}>Sin intervalos ocupados en esta semana.</Text>}</View>}
 {originAdmin && propertyId && <View style={s.card}><Text style={s.title}>Reserva y visita conjunta</Text><Notice>Una reserva bloquea nuevas citas hasta su vencimiento, durante un máximo de siete días. La vivienda conserva su estado de venta.</Notice>
 {reservation ? <><Text style={s.copy}>Reserva vigente hasta {format(reservation.expiresAt)}</Text><Button label="Liberar reserva" loading={busy} onPress={() => void act(`release:${reservation.id}:${reservation.version}`, async (c, clientRequestId) => { await repository!.releaseReservation({ reservationId: reservation.id, expectedVersion: reservation.version, clientRequestId }, c); })}/></> : <>
 <Text style={s.copy}>Fecha y hora de vencimiento de reserva, o inicio de visita conjunta</Text><VisitDateTimeFields date={actionDate} time={actionTime} disabled={busy} onDate={setActionDate} onTime={setActionTime}/>
 <Button label="Reservar hasta esta fecha" loading={busy} onPress={() => void act(`reserve:${propertyId}:${actionDate}:${actionTime}`, async (c, clientRequestId) => { await repository!.setReservation({ propertyId, expiresAt: havanaVisitInstant(actionDate, actionTime), clientRequestId }, c); })}/>
 <View style={s.wrap}>{[30, 60, 90, 120].map(n => <Pill key={n} label={`${n} min`} active={duration === n} onPress={() => { if (!busy)
                    setDuration(n); }}/>)}</View><Button secondary label="Autorizar visita conjunta" loading={busy} onPress={() => void act(`joint:${propertyId}:${actionDate}:${actionTime}:${duration}`, async (c, clientRequestId) => { const result = await repository!.createJointSlot({ propertyId, visitDate: actionDate, visitTime: actionTime, durationMinutes: duration, clientRequestId }, c); c.checkpoint(); setJoint(result); })}/>
 {joint && <><Notice>Comparte este código solo con quienes coordinen esta visita. Cada agencia confirma sus propios interesados en el horario autorizado.</Notice><Text selectable style={s.copy}>{joint.token}</Text><Text style={s.copy}>{format(joint.startsAt)} — {format(joint.endsAt)}</Text></>}
 </>}
 </View>}
 </>}
 </ScrollView></SafeAreaView>;
}
