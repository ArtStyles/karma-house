import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { agencyPropertyRepository as repository } from '../agencies/properties/client';
import type { AgencyProperty,AgencyPropertyMatches } from '../agencies/properties/types';
import { agencyError } from '../agencies/domain';
import { isUuid } from '../messaging/domain';
import ListingForm from '../components/ListingForm';
import { toDraft } from './EditScreen';
import { emptyDraft, type ListingDraft } from '../domain/listings';
import { Button, Notice, PageTitle } from '../components/ui';
import { AgencyTextField, useAgencyFormStyles } from '../components/agencies/AgencyRegistrationFields';
import { useMarketplace } from '../state/MarketplaceProvider';
export default function AgencyPropertyScreen() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>(), a = useAuth(), w = useAgencyWorkspace();
    return <Property key={`${a.user?.id}:${w.activeAgencyId}:${w.generation}:${a.suspended}:${Boolean(a.session)}:${id}`} id={id}/>;
}
function Property({ id }: {
    id: string;
}) {
    const w = useAgencyWorkspace(), auth = useAuth(), market = useMarketplace(), { styles: s } = useAgencyFormStyles();
    const [item, setItem] = useState<AgencyProperty | null>(null), [issue, setIssue] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(id === 'new');
    const [matches,setMatches]=useState<(AgencyPropertyMatches&{draft:ListingDraft;intent:'draft'|'submit'})|null>(null);
    const mandateAttempt=useRef<{id:string;request:string}|null>(null);
    const [source, setSource] = useState(''), [consent, setConsent] = useState('');
    const [proposedPrice,setProposedPrice]=useState(''),[proposedDescription,setProposedDescription]=useState('');
    const focused = useRef(false), sequence = useRef(0), pending = useRef<{
        body: string;
        request: string;
    } | null>(null);
    const allowed = w.ready && Boolean(w.activeAgency) && Boolean(auth.session && !auth.suspended && w.membership);
    const load = useCallback(async () => {
        if (!repository || !allowed)
            return;
        if (id === 'new') {
            setLoaded(true);
            return;
        }
        if (!isUuid(id)) {
            setIssue('No se encontró esta vivienda.');
            return;
        }
        const seq = ++sequence.current;
        let c: ReturnType<typeof w.captureAgencyContext> | undefined;
        const check = () => {
            c?.checkpoint();
            if (!focused.current || seq !== sequence.current)
                throw Error('KH_AGENCY_CONTEXT_CHANGED');
        };
        setBusy(true);
        setIssue('');
        setLoaded(false);
        try {
            c = w.captureAgencyReadContext();
            const result = await repository.get(id, c);
            check();
            setItem(result);
            setSource(result.mandate.reference);
            setLoaded(true);
        }
        catch (e) {
            try {
                check();
                setItem(null);
                setIssue(agencyError(e));
            }
            catch {
            }
        }
        finally {
            try {
                check();
                setBusy(false);
            }
            catch {
            }
            c?.release();
        }
    }, [allowed, id, w.captureAgencyReadContext]);
    useFocusEffect(useCallback(() => {
        focused.current = true;
        setItem(null);
        setSource('');
        setConsent('');
        setIssue('');
        pending.current = null;
        void load();
    return () => {
            focused.current = false;
            sequence.current++;
        };
    }, [load]));
    const editable = allowed && w.enabled && w.activeAgency?.state==='approved' && loaded && (id === 'new' ? w.membership?.role === 'admin' : item?.canEditCommon), direct = item ? item.publicationPolicy === 'direct' : w.activeAgency?.verified === true;
    async function propose(kind:'price'|'content'){
        if(!repository||!item||busy||!allowed||w.membership?.role!=='admin')return;
        const proposedPayload=kind==='price'?{price:Number(proposedPrice)}:{description:proposedDescription};
        const body=JSON.stringify({kind,proposedPayload,version:item.property.version});if(pending.current?.body!==body)pending.current={body,request:randomUUID()};
        let c:ReturnType<typeof w.captureAgencyContext>|undefined;const seq=sequence.current;const check=()=>{c?.checkpoint();if(!focused.current||seq!==sequence.current)throw Error('KH_AGENCY_CONTEXT_CHANGED')};setBusy(true);setIssue('');
        try{c=w.captureAgencyContext();await repository.proposeChange({propertyId:item.property.id,kind,proposedPayload,expectedPropertyVersion:item.property.version??1,clientRequestId:pending.current.request},c);check();pending.current=null;router.push('/agency-property-requests')}
        catch(e){try{check();setIssue(agencyError(e))}catch{}}
        finally{try{check();setBusy(false)}catch{}c?.release()}
    }
    async function save(draft: ListingDraft, intent: 'draft' | 'submit',duplicateDecision?:Record<string,unknown>) {
        if (!repository || !editable || busy)
            throw Error('La vivienda no está disponible para editar.');
        if (!source.trim() || !consent.trim())
            throw Error('Completa las referencias de origen y autorización antes de guardar.');
        const body = JSON.stringify({ draft, intent, source, consent, version: item?.property.version });
        if (pending.current?.body !== body)
            pending.current = { body, request: randomUUID() };
        const c = w.captureAgencyContext(), seq = sequence.current;
        const check = () => {
            c.checkpoint();
            if (!focused.current || sequence.current !== seq)
                throw Error('KH_AGENCY_CONTEXT_CHANGED');
        };
        setBusy(true);
        try {
            if(!item||intent==='submit'){const found=await repository.findMatches({draft,clientRequestId:pending.current.request,...(item?{propertyId:item.property.id}:{})},c);check();if(found.items.length&&JSON.stringify(duplicateDecision)!==JSON.stringify(found.review)){setMatches({...found,draft,intent});throw Error('Revisa las posibles coincidencias antes de crear o publicar esta vivienda.');}}
            const result = await repository.save({
                ...(duplicateDecision?{duplicateDecision}:{}),
                draft,
                publicationIntent: intent,
                sourceReference: source,
                consentReference: consent,
                clientRequestId: pending.current.request,
                ...(item ? { propertyId: item.property.id, expectedVersion: item.property.version } : {}),
            }, c);
            check();
            await market.invalidateListingManagement([result.property.id]);
            check();
            pending.current = null;
            router.replace('/agency-portfolio');
        }
        finally {
            try {
                check();
                setBusy(false);
            }
            catch {
            }
            c.release();
        }
    }
    async function requestExisting(propertyId:string){
        if(!repository||busy)return;
        const c=w.captureAgencyContext(),seq=sequence.current;setBusy(true);
        const check=()=>{c.checkpoint();if(!focused.current||seq!==sequence.current)throw Error('KH_AGENCY_CONTEXT_CHANGED');};
        try{
            if(mandateAttempt.current?.id!==propertyId)mandateAttempt.current={id:propertyId,request:randomUUID()};
            await repository.requestMandate({propertyId,internalReference:source.trim(),clientRequestId:mandateAttempt.current.request},c);
            check();router.replace('/agency-property-requests');
        }catch(e){try{check();setIssue(agencyError(e));}catch{}}
        finally{c.release();if(focused.current&&seq===sequence.current)setBusy(false);}
    }
    return (
        <SafeAreaView style={[s.safe, { flex: 1 }]} edges={['top', 'bottom', 'left', 'right']}>
            <View style={[s.content, { paddingBottom: 8 }]}>
                <PageTitle
                    title={id === 'new' ? 'Añadir vivienda en venta' : item?.property.title ?? 'Vivienda'}
                    subtitle={w.activeAgency?.tradeName ?? 'Cartera empresarial'}
                    back fallback="/agency-portfolio"
                />
                {Boolean(issue) && <Notice error>{issue}</Notice>}
                {!allowed && <Notice>Selecciona una inmobiliaria aprobada para continuar.</Notice>}
                {item?.moderationHold && (
                    <Notice error>{item.property.reviewNote ?? 'KarmaHouse retiró esta ficha. Corregirla y enviarla de nuevo requiere revisión.'}</Notice>
                )}
                {matches&&<ScrollView style={{maxHeight:360}} contentContainerStyle={s.card}><Text style={s.title}>Posibles viviendas coincidentes</Text><Notice>Comprueba estas fichas públicas. Puedes solicitar autorización sobre la vivienda existente o declarar que se trata de otra casa.</Notice>{matches.items.map(candidate=><View key={candidate.id}><Text style={s.copy}>{candidate.title} · {candidate.location}</Text><Button label={`Solicitar autorización: ${candidate.title}`} secondary disabled={busy} onPress={()=>void requestExisting(candidate.id)}/></View>)}<Button label="He revisado las coincidencias: es otra vivienda" disabled={busy} onPress={()=>{const seq=sequence.current;void save(matches.draft,matches.intent,matches.review).catch(e=>{if(focused.current&&seq===sequence.current)setIssue(agencyError(e));});}}/><Button label="Volver a corregir la ficha" secondary disabled={busy} onPress={()=>{setMatches(null);setIssue('');}}/></ScrollView>}
                {editable ? (
                    <>
                        <AgencyTextField label="Referencia de origen" value={source} onChangeText={setSource} editable={!busy && !matches && id === 'new'} />
                        <AgencyTextField label="Referencia de autorización para publicar" value={consent} onChangeText={setConsent} editable={!busy && !matches} />
                    </>
                ) : item && (
                    <>
                        <Text style={s.copy}>{item.property.description}</Text>
                        <Notice>El responsable de origen conserva la edición de los datos comunes y la confirmación de venta.</Notice>
                        {w.enabled&&w.activeAgency?.state==='approved'&&w.membership?.role==='admin'&&item.property.status!=='sold'&&<>
                            <AgencyTextField label="Proponer precio (USD)" value={proposedPrice} onChangeText={setProposedPrice} keyboardType="numeric" editable={!busy}/>
                            <Button label="Proponer cambio de precio" secondary disabled={busy||!(Number(proposedPrice)>0)} onPress={()=>void propose('price')}/>
                            <AgencyTextField label="Proponer descripción" value={proposedDescription} onChangeText={setProposedDescription} multiline maxLength={2000} editable={!busy}/>
                            <Button label="Proponer cambio de descripción" secondary disabled={busy||proposedDescription.trim().length<20} onPress={()=>void propose('content')}/>
                        </>}
                    </>
                )}
                {item&&<Button label="Agenda y ocupación" secondary onPress={()=>router.push({pathname:'/agency-agenda',params:{propertyId:item.property.id}})}/>}
                {item&&w.membership?.role==='admin'&&<Button label="Ver autorizaciones y cambios" secondary onPress={()=>router.push('/agency-property-requests')}/>}
                {!loaded && allowed && <Button label="Volver a cargar" secondary loading={busy} onPress={() => void load()} />}
            </View>
            {editable && (
                <View style={{flex:1,display:matches?'none':'flex'}} pointerEvents={matches?'none':'auto'}><ListingForm
                    key={`${id}:${item?.property.version ?? 0}`}
                    initialDraft={item ? toDraft(item.property) : { ...emptyDraft, operation: 'sale' }}
                    cloud directPublication={direct}
                    submitLabel={direct ? 'Publicar' : 'Enviar a revisión'}
                    onSubmit={draft => save(draft, 'submit')}
                    onSaveDraft={draft => save(draft, 'draft')}
                    onCancel={() => router.back()}
                /></View>
            )}
        </SafeAreaView>
    );
}
