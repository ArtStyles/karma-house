import {saleOccurredAt} from '../agencies/closures/domain';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, ScrollView, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../auth/AuthProvider';
import {useAgencyWorkspace} from '../agencies/AgencyProvider';
import type {CapturedAccountContext, CapturedAgencyContext} from '../agencies/controller';
import {createFollowupViewScope} from '../agencies/deals/viewScope';
import {createAgencyClosureRepository} from '../agencies/closures/repository';
import {closureError} from '../agencies/closures/domain';
import type {SaleRequest, DecideSale, RequestSale, SalePreparation} from '../agencies/closures/types';
import {createAgencyDealRepository} from '../agencies/deals/repository';
import type {AgencyDeal} from '../agencies/deals/types';
import {createMessageId, isUuid} from '../messaging/domain';
import {havanaDateTime, NEGOTIATION_TIME_ZONE} from '../negotiations/domain';
import {supabase} from '../lib/supabase';
import {Button, Notice, PageTitle, Pill} from '../components/ui';
import {useAgencyFormStyles} from '../components/agencies/AgencyRegistrationFields';
import {VisitDateTimeFields} from '../components/negotiations/VisitDateTimeFields';

const repository = supabase ? createAgencyClosureRepository(supabase) : null;
const deals = supabase ? createAgencyDealRepository(supabase) : null;
type Context = CapturedAccountContext | CapturedAgencyContext;
const states = {pending: 'Pendiente', confirmed: 'Venta confirmada', rejected: 'Rechazada', cancelled: 'Cancelada'};

export default function AgencyClosuresScreen() {
    const a = useAuth(), w = useAgencyWorkspace();
    const p = useLocalSearchParams<{personal?: string; dealId?: string}>();
    return <Closures
        key={`${a.user?.id}:${a.session?.access_token}:${w.activeAgencyId}:${w.generation}:${p.personal}:${p.dealId}`}
        personal={p.personal === '1'}
        dealId={p.dealId}
    />;
}

function Closures({personal, dealId}: {personal: boolean; dealId?: string}) {
    const auth = useAuth(), w = useAgencyWorkspace(), {styles: s, colors} = useAgencyFormStyles();
    const scope = useRef(createFollowupViewScope()).current;
    const focused = useRef(false), sequence = useRef(0), lock = useRef(false);
    const controllers = useRef(new Set<AbortController>()).current;
    const [items, setItems] = useState<SaleRequest[]>([]);
    const [more, setMore] = useState(false), [outgoing, setOutgoing] = useState(false);
    const [busy, setBusy] = useState(false), [issue, setIssue] = useState(''), [feedback, setFeedback] = useState('');
    const [deal, setDeal] = useState<AgencyDeal | null>(null);
    const [property, setProperty] = useState<SalePreparation | null>(null);
    const [manager, setManager] = useState<string | null>(null), [amount, setAmount] = useState('');
    const [date, setDate] = useState(havanaDateTime().date), [time, setTime] = useState(havanaDateTime().time);
    const [note, setNote] = useState(''), [review, setReview] = useState<SaleRequest | null>(null);
    const pending = useRef<
        {kind: 'request'; input: RequestSale} | {kind: 'decide'; input: DecideSale} | null
    >(null);
    const allowed = !!auth.session && !auth.suspended && w.enabled
        && (personal || w.activeAgency?.state === 'approved' && !!w.membership);

    const capture = useCallback((latest = false): Context => {
        const check = scope.capture(latest);
        const base = personal ? w.captureAccountContext() : w.captureAgencyContext();
        const controller = new AbortController(), abort = () => controller.abort();
        controllers.add(controller);
        base.signal.addEventListener('abort', abort, {once: true});
        if (base.signal.aborted) abort();
        return {
            ...base,
            signal: controller.signal,
            checkpoint() {
                base.checkpoint();
                check();
                if (controller.signal.aborted) throw Error('KH_AGENCY_CONTEXT_CHANGED');
            },
            release() {
                base.signal.removeEventListener('abort', abort);
                controllers.delete(controller);
                base.release();
            },
        };
    }, [personal, scope, w.captureAccountContext, w.captureAgencyContext, controllers]);

    const clear = useCallback(() => {
        setItems([]);
        setDeal(null);
        setProperty(null);
        setManager(null);
        setAmount('');
        setNote('');
        setReview(null);
        setIssue('');
        setFeedback('');
        setBusy(false);
        setMore(false);
        pending.current = null;
    }, []);
    const invalidate = useCallback(() => {
        scope.invalidate();
        controllers.forEach(c => c.abort());
        controllers.clear();
        clear();
    }, [scope, controllers, clear]);

    const load = useCallback(async (offset = 0) => {
        if (!repository || !allowed) return;
        let c: Context | undefined;
        try {
            c = capture(true);
            const page = personal
                ? await repository.personalList(offset, c)
                : await repository.list({scope: outgoing ? 'outgoing' : 'incoming', offset}, c as CapturedAgencyContext);
            let d: AgencyDeal | null = null, p: SalePreparation | null = null;
            if (dealId && !personal) {
                if (!isUuid(dealId)) throw Error('Expediente inválido');
                d = await deals!.get(dealId, c as CapturedAgencyContext);
                if (!d.closedReason) p = await repository.prepare(d.id, c as CapturedAgencyContext);
            }
            c.checkpoint();
            setItems(old => offset ? [...old, ...page.items] : page.items);
            setMore(page.hasMore);
            setDeal(d);
            setProperty(p);
            setManager(old => old === p?.executingManagerId ? old : null);
            setIssue('');
        } catch (e) {
            try {
                c?.checkpoint();
                setItems([]);
                setDeal(null);
                setProperty(null);
                setIssue(closureError(e));
            } catch { /* Discard responses from an invalidated scope. */ }
        } finally {
            c?.release();
        }
    }, [allowed, capture, dealId, outgoing, personal]);

    const refreshRef = useRef(w.refreshAgencies), loadRef = useRef(load);
    refreshRef.current = w.refreshAgencies;
    loadRef.current = load;
    const refresh = useCallback(async () => {
        const n = ++sequence.current;
        invalidate();
        await refreshRef.current();
        if (n === sequence.current && focused.current && AppState.currentState === 'active') {
            scope.activate();
            await loadRef.current();
        }
    }, [invalidate, scope]);
    useFocusEffect(useCallback(() => {
        focused.current = true;
        void refresh();
        return () => {
            focused.current = false;
            sequence.current++;
            invalidate();
        };
    }, [refresh]));
    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            sequence.current++;
            invalidate();
            if (state === 'active' && focused.current) void refresh();
        });
        return () => sub.remove();
    }, [invalidate, refresh]);
    useEffect(() => {
        if (scope.isActive()) void load();
    }, [load, scope]);

    async function execute(attempt: NonNullable<typeof pending.current>) {
        if (lock.current || !repository) return;
        lock.current = true;
        setBusy(true);
        setIssue('');
        pending.current = attempt;
        let c: Context | undefined;
        try {
            c = capture();
            if (attempt.kind === 'request') {
                if (!('agencyId' in c)) throw Error('KH_AGENCY_CONTEXT_REQUIRED');
                const r = await repository.request(attempt.input, c);
                c.checkpoint();
                setFeedback(`Solicitud ${r.id} enviada al origen.`);
            } else {
                const result = personal
                    ? await repository.personalDecide(attempt.input, c)
                    : await repository.decide(attempt.input, c as CapturedAgencyContext);
                c.checkpoint();
                setFeedback(result.closure
                    ? `Venta confirmada. Recibo único: ${result.closure.id}`
                    : 'Solicitud actualizada.');
            }
            pending.current = null;
            setReview(null);
            setNote('');
            setManager(null);
            setAmount('');
            await load();
        } catch (e) {
            try {
                c?.checkpoint();
                setIssue(closureError(e));
            } catch { /* Discard responses from an invalidated scope. */ }
        } finally {
            c?.release();
            lock.current = false;
            if (scope.isActive()) setBusy(false);
        }
    }

    function request() {
        if (!deal || !property || !manager) return;
        if (!property.expectedPropertyVersion) {
            setIssue('Actualiza la vivienda antes de solicitar el cierre.');
            return;
        }
        try {
            void execute({
                kind: 'request',
                input: {
                    winningDealId: deal.id,
                    executingManagerId: manager,
                    amountUsd: Number(amount),
                    occurredAt: saleOccurredAt(date, time),
                    expectedPropertyVersion: property.expectedPropertyVersion,
                    expectedAuthorityVersion: property.expectedAuthorityVersion,
                    clientRequestId: createMessageId(),
                },
            });
        } catch (e) {
            setIssue(closureError(e));
        }
    }
    function decide(r: SaleRequest, action: DecideSale['action']) {
        void execute({
            kind: 'decide',
            input: {
                requestId: r.id,
                action,
                expectedRequestVersion: r.version,
                expectedPropertyVersion: r.expectedPropertyVersion,
                expectedAuthorityVersion: r.expectedAuthorityVersion,
                note,
                clientRequestId: createMessageId(),
            },
        });
    }
    const disabled = busy || !!pending.current;

    function facts(r: SaleRequest) {
        return <>
            <Text style={s.title}>{r.propertyTitle} · {states[r.state]}</Text>
            <Text selectable style={s.copy}>
                Agencia ejecutora: {r.executingAgencyName}{'\n'}Gestor ejecutor: {r.executingManagerName}{'\n'}Comprador: {r.buyerLabel}{'\n'}Importe final: {r.amountUsd.toLocaleString('es')} USD{'\n'}Fecha: {new Date(r.occurredAt).toLocaleString('es', {timeZone: NEGOTIATION_TIME_ZONE})}
            </Text>
            <Text style={s.copy}>{r.evidenceSummary}</Text>
            {r.state === 'pending' && <Notice>
                Se cancelarán {r.affectedVisits} citas futuras y terminarán {r.affectedDeals} expedientes abiertos de esta vivienda. Se conserva el historial.
            </Notice>}
            {r.closure && <Text selectable style={s.copy}>
                Recibo único: {r.closure.id}{'\n'}Confirmado: {new Date(r.closure.confirmedAt).toLocaleString('es', {timeZone: NEGOTIATION_TIME_ZONE})}
            </Text>}
        </>;
    }

    return <SafeAreaView style={s.safe}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
            <PageTitle title={personal ? 'Cierres de mis viviendas' : 'Cierres'}
                subtitle={personal ? 'Solicitudes para tu confirmación personal' : w.activeAgency?.tradeName}
                back fallback={personal ? '/requests' : '/agency-workspace'}/>
            {!allowed ? <Notice>Inicia sesión y selecciona un espacio autorizado para consultar los cierres.</Notice> : <>
                {Boolean(issue) && <Notice error>{issue}</Notice>}
                {Boolean(feedback) && <Notice>{feedback}</Notice>}
                {pending.current && <>
                    <Notice>El intento conserva su contenido e identificador originales.</Notice>
                    <Button label="Reintentar" loading={busy} onPress={() => void execute(pending.current!)}/>
                    <Button label="Descartar intento y actualizar" secondary disabled={busy} onPress={() => {
                        pending.current = null;
                        setReview(null);
                        void load();
                    }}/>
                </>}
                <Button label="Actualizar cierres" secondary disabled={disabled} onPress={() => {
                    setReview(null);
                    void load();
                }}/>
                {deal && property && !deal.closedReason && <View style={s.card}>
                    <Text style={s.title}>Solicitar cierre · {property.propertyTitle}</Text>
                    <Notice>Declara los ejecutores y el importe final. La autoridad del origen revisará la operación antes de marcar la vivienda como vendida.</Notice>
                    <Text style={s.copy}>Agencia ejecutora: {w.activeAgency?.tradeName}</Text>
                    <Text selectable style={s.copy}>Responsable actual: {property.executingManagerName ?? 'Sin responsable elegible'}</Text>
                    {property.executingManagerId ? <Pill
                        label={(manager ? 'Gestor ejecutor confirmado: ' : 'Confirmar gestor ejecutor: ') + property.executingManagerName}
                        active={!!manager}
                        onPress={() => { if (!disabled) setManager(property.executingManagerId); }}
                    /> : <Notice>Asigna primero un responsable al expediente.</Notice>}
                    <Button label="Consultar o cambiar responsable" secondary disabled={disabled}
                        onPress={() => router.push({pathname: '/agency-deal/[id]', params: {id: deal.id}})}/>
                    <TextInput accessibilityLabel="Importe final en USD" placeholder="Importe final en USD"
                        placeholderTextColor={colors.muted} style={s.input} keyboardType="decimal-pad"
                        value={amount} onChangeText={setAmount} editable={!disabled}/>
                    <VisitDateTimeFields purpose="sale" date={date} time={time} disabled={disabled} onDate={setDate} onTime={setTime}/>
                    <Button label="Enviar solicitud de venta al origen" disabled={disabled || !manager || !amount} onPress={request}/>
                </View>}
                {review ? <View style={s.card}>
                    {facts(review)}
                    <Notice error>Confirmar registra una venta única y termina la comercialización de la vivienda en todas sus agencias.</Notice>
                    <TextInput style={s.input} accessibilityLabel="Nota de decisión" placeholder="Nota de decisión (opcional)"
                        value={note} maxLength={500} onChangeText={setNote} editable={!disabled}/>
                    <Button label="Confirmar venta y terminar los procesos" disabled={disabled} onPress={() => decide(review, 'confirm')}/>
                    <Button label="Volver sin confirmar" secondary disabled={disabled} onPress={() => setReview(null)}/>
                </View> : <>
                    {!personal && <View style={s.wrap}>
                        <Pill label="Recibidas como origen" active={!outgoing} onPress={() => { if (!disabled) setOutgoing(false); }}/>
                        <Pill label="Enviadas por mi agencia" active={outgoing} onPress={() => { if (!disabled) setOutgoing(true); }}/>
                    </View>}
                    {items.map(r => <View key={r.id} style={s.card}>
                        {facts(r)}
                        {r.canDecide && <>
                            <Button label="Revisar y confirmar venta" disabled={disabled} onPress={() => setReview(r)}/>
                            <Button label="Rechazar solicitud" secondary disabled={disabled} onPress={() => decide(r, 'reject')}/>
                        </>}
                        {r.canCancel && <Button label="Cancelar solicitud" secondary disabled={disabled} onPress={() => decide(r, 'cancel')}/>}
                    </View>)}
                    {!items.length && <Notice>No hay solicitudes en esta vista.</Notice>}
                    {more && <Button label="Más cierres" secondary disabled={disabled} onPress={() => void load(items.length)}/>}
                </>}
            </>}
        </ScrollView>
    </SafeAreaView>;
}
