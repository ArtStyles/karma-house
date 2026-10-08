import { randomUUID } from 'expo-crypto';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { agencyPropertyRepository as repository } from '../agencies/properties/client';
import { createAgencyScreenRequestScope } from '../agencies/screenRequests';
import { agencyError } from '../agencies/domain';
import { sharedPropertyId } from '../agencies/properties/domain';
import type { AgencyMandateRequest, PropertyChangeRequest, CurrentAgencyMandate } from '../agencies/properties/types';
import type { CapturedAccountContext } from '../agencies/controller';
import { Button, Notice, PageTitle } from '../components/ui';
import { AgencyTextField, useAgencyFormStyles } from '../components/agencies/AgencyRegistrationFields';
export default function AgencyPropertyRequestsScreen() { const auth = useAuth(), w = useAgencyWorkspace(), { personal } = useLocalSearchParams<{
    personal?: string;
}>(); return <Requests key={`${auth.user?.id}:${w.activeAgencyId}:${w.generation}:${auth.suspended}:${Boolean(auth.session)}:${personal}`} personal={personal === '1'}/>; }
function Requests({ personal }: {
    personal: boolean;
}) {
    const auth = useAuth(), w = useAgencyWorkspace(), { styles: s } = useAgencyFormStyles(), scope = useRef(createAgencyScreenRequestScope()).current;
    const [mandates, setMandates] = useState<AgencyMandateRequest[]>([]), [changes, setChanges] = useState<PropertyChangeRequest[]>([]), [offset, setOffset] = useState(0), [more, setMore] = useState(false), [busy, setBusy] = useState(false), [issue, setIssue] = useState(''), [link, setLink] = useState(''), [reference, setReference] = useState('');
    const [authorizations,setAuthorizations]=useState<CurrentAgencyMandate[]>([]);
    const pending = useRef<{
        body: string;
        request: string;
    } | null>(null);
    const allowed = Boolean(w.ready && auth.session && !auth.suspended && (personal || w.activeAgency && w.membership?.role === 'admin'));
    const operational = w.enabled && (personal || w.activeAgency?.state==='approved');
    const load = useCallback(async () => {
        if (!repository || !allowed)
            return;
        const ticket = scope.begin();
        let c: CapturedAccountContext | undefined;
        setBusy(true);
        setIssue('');
        try {
            let m, ch, current;
            if (personal) {
                c = w.captureAccountContext();
                m = await repository.listPersonalMandates(offset, c);
                ch = await repository.listPersonalChanges(offset, c);
                current=await repository.listPersonalAuthorizations(offset,c);
            }
            else {
                const agency = w.captureAgencyReadContext();
                c = agency;
                m = await repository.listMandates(offset, agency);
                ch = await repository.listChanges(offset, agency);
                current=await repository.listAuthorizations(offset,agency);
            }
            ticket.checkpoint(c);
            setMandates(m.items);
            setChanges(ch.items);
            setAuthorizations(current.items);
            setMore(m.hasMore || ch.hasMore || current.hasMore);
        }
        catch (e) {
            try {
                ticket.checkpoint(c);
                setIssue(agencyError(e));
                setMandates([]);setAuthorizations([]);
                setChanges([]);
            }
            catch { }
        }
        finally {
            try {
                ticket.checkpoint(c);
                setBusy(false);
            }
            catch { }
            c?.release();
        }
    }, [allowed, offset, personal, scope, w.captureAccountContext, w.captureAgencyReadContext]);
    useFocusEffect(useCallback(() => { scope.enter(`${personal}:${offset}`); setMandates([]);setAuthorizations([]); setChanges([]); pending.current = null; void load(); return () => scope.leave(); }, [load, offset, personal, scope]));
    async function act(action: 'request' | 'accept' | 'reject' | 'withdraw', item?: AgencyMandateRequest | PropertyChangeRequest | CurrentAgencyMandate) {
        if (!repository || !allowed || busy)
            return;
        const ticket = scope.begin();
        let c: CapturedAccountContext | undefined;
        setBusy(true);
        setIssue('');
        let done = false;
        try {
            const body = JSON.stringify({ action, id: item&&'id'in item?item.id:item?.propertyId, agencyId:item?.agencyId, version: item?.version, link, reference });
            if (pending.current?.body !== body)
                pending.current = { body, request: randomUUID() };
            const clientRequestId = pending.current.request;
            const decision = { requestId: item&&'id'in item?item.id:'', expectedVersion: item?.version ?? 1, decision: action === 'accept' ? 'accept' as const : 'reject' as const, clientRequestId };
            const withdrawal = { propertyId: item?.propertyId ?? '', requestingAgencyId: item?.agencyId ?? '', expectedVersion: item && 'mandateVersion' in item && item.state === 'accepted' ? item.mandateVersion ?? 1 : item?.version ?? 1, ...(item&&'state'in item&&item.state === 'pending' ? { requestId: item.id } : {}), clientRequestId };
            if (personal) {
                c = w.captureAccountContext();
                if (action === 'withdraw')
                    await repository.withdrawPersonalMandate(withdrawal, c);
                else if (item && 'kind' in item)
                    await repository.decidePersonalChange(decision, c);
                else
                    await repository.decidePersonalMandate(decision, c);
            }
            else {
                const agency = w.captureAgencyContext();
                c = agency;
                if (action === 'request')
                    await repository.requestMandate({ propertyId: sharedPropertyId(link), internalReference: reference.trim(), clientRequestId }, agency);
                else if (action === 'withdraw')
                    await repository.withdrawMandate(withdrawal, agency);
                else if (item && 'kind' in item)
                    await repository.decideChange(decision, agency);
                else
                    await repository.decideMandate(decision, agency);
            }
            ticket.checkpoint(c);
            pending.current = null;
            done = true;
        }
        catch (e) {
            try {
                ticket.checkpoint(c);
                setIssue(agencyError(e));
            }
            catch { }
        }
        finally {
            try {
                ticket.checkpoint(c);
                setBusy(false);
            }
            catch { }
            c?.release();
        }
        if (done)
            await load();
    }
    const fieldLabels: Record<string, string> = { price: 'Precio (USD)', priceNegotiable: 'Precio negociable', description: 'Descripción', title: 'Título', location: 'Zona', province: 'Provincia', type: 'Tipo', area: 'Superficie', bedrooms: 'Habitaciones', bathrooms: 'Baños', amenities: 'Características', condition: 'Estado', floor: 'Planta', mapLocation: 'Ubicación en mapa' };
    const states = { pending: 'Pendiente', accepted: 'Aceptada', rejected: 'Rechazada', withdrawn: 'Retirada' };
    return <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}><ScrollView contentContainerStyle={s.content}><PageTitle title="Autorizaciones y cambios" subtitle={personal ? 'Tus viviendas personales' : w.activeAgency?.tradeName ?? 'Inmobiliaria'} back/>
 {!allowed ? <Notice>Inicia sesión y selecciona el contexto autorizado para revisar estas solicitudes.</Notice> : <>
 {Boolean(issue) && <Notice error>{issue}</Notice>}<Button label="Actualizar solicitudes" secondary loading={busy} onPress={() => void load()}/>
 {operational && !personal && <View style={s.card}><Text style={s.title}>Solicitar una vivienda compartida</Text><AgencyTextField label="Enlace público o UUID de la vivienda" value={link} onChangeText={setLink} editable={!busy}/><AgencyTextField label="Referencia interna de tu inmobiliaria" value={reference} onChangeText={setReference} maxLength={100} editable={!busy}/><Button label="Solicitar autorización al origen" disabled={busy || !link.trim() || !reference.trim()} onPress={() => void act('request')}/></View>}
 {authorizations.map(item=><View key={`${item.propertyId}:${item.agencyId}`} style={s.card}><Text style={s.title}>Autorización vigente · {item.agencyName}</Text><Text selectable style={s.copy}>{item.propertyId}</Text>{item.internalReference&&<Text style={s.copy}>Tu referencia: {item.internalReference}</Text>}<Button label="Ver vivienda autorizada" secondary onPress={()=>router.push(`/property/${item.propertyId}`)}/><Button label="Retirar autorización vigente" secondary disabled={busy||!operational} onPress={()=>void act('withdraw',item)}/></View>)}
 {mandates.map(item => <View key={item.id} style={s.card}><Text style={s.title}>{item.agencyName}</Text><Text style={s.copy}>Autorización · {states[item.state]}</Text><Text selectable style={s.copy}>{item.propertyId}</Text>{item.internalReference && <Text style={s.copy}>Tu referencia: {item.internalReference}</Text>}<Button label="Ver vivienda" secondary onPress={() => router.push(`/property/${item.propertyId}`)}/>{operational && item.canDecide && <><Button label="Autorizar colaboración" disabled={busy} onPress={() => void act('accept', item)}/><Button label="Rechazar solicitud" secondary disabled={busy} onPress={() => void act('reject', item)}/></>}{operational && item.canWithdraw && item.state==='pending' && <Button label="Retirar solicitud pendiente" secondary disabled={busy} onPress={() => void act('withdraw', item)}/>}</View>)}
 {changes.map(item => <View key={item.id} style={s.card}><Text style={s.title}>Cambio de {item.kind === 'price' ? 'precio' : 'contenido'} · {item.agencyName}</Text><Text style={s.copy}>{states[item.state]} · Versión de vivienda {item.expectedPropertyVersion}</Text><Text selectable style={s.copy}>{item.propertyId}</Text>{Object.entries(item.proposedPayload).map(([key, value]) => <Text key={key} style={s.copy}>{fieldLabels[key] ?? key}: {typeof value === 'string' ? value : JSON.stringify(value)}</Text>)}{operational && item.canDecide && <><Notice>Al aceptar se envía el cambio a publicación. El origen y los bloqueos de KarmaHouse determinan si requiere revisión.</Notice><Button label="Aceptar y enviar cambio" disabled={busy} onPress={() => void act('accept', item)}/><Button label="Rechazar cambio" secondary disabled={busy} onPress={() => void act('reject', item)}/></>}</View>)}
 {!busy && !mandates.length && !changes.length && !authorizations.length && <Notice>No hay solicitudes en esta página.</Notice>}{offset > 0 && <Button label="Página anterior" secondary disabled={busy} onPress={() => setOffset(offset - 30)}/>}{more && <Button label="Siguiente página" secondary disabled={busy} onPress={() => setOffset(offset + 30)}/>}</>}
 </ScrollView></SafeAreaView>;
}
