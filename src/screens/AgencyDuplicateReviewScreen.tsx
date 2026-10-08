import { randomUUID } from 'expo-crypto';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthProvider';
import { useAgencyWorkspace } from '../agencies/useAgencyWorkspace';
import { agencyPropertyRepository as repository } from '../agencies/properties/client';
import { sharedPropertyId } from '../agencies/properties/domain';
import type { CapturedAccountContext } from '../agencies/controller';
import type { DuplicateCandidate } from '../agencies/properties/types';
import { createAgencyScreenRequestScope } from '../agencies/screenRequests';
import { agencyError } from '../agencies/domain';
import { Button, Notice, PageTitle } from '../components/ui';
import { AgencyTextField, useAgencyFormStyles } from '../components/agencies/AgencyRegistrationFields';
export default function AgencyDuplicateReviewScreen() { const auth = useAuth(), w = useAgencyWorkspace(); return <Review key={`${auth.user?.id}:${w.generation}:${auth.isOwner}:${auth.suspended}:${Boolean(auth.session)}`}/>; }
function Review() {
    const auth = useAuth(), w = useAgencyWorkspace(), { styles: s } = useAgencyFormStyles(), scope = useRef(createAgencyScreenRequestScope()).current;
    const [id, setId] = useState(''), [canonical, setCanonical] = useState<DuplicateCandidate | null>(null), [items, setItems] = useState<DuplicateCandidate[]>([]), [selected, setSelected] = useState<DuplicateCandidate[]>([]), [evidence, setEvidence] = useState(''), [reason, setReason] = useState(''), [issue, setIssue] = useState(''), [busy, setBusy] = useState(false), [offset, setOffset] = useState(0), [more, setMore] = useState(false), [loadedId, setLoadedId] = useState('');
    const pending = useRef<{
        body: string;
        request: string;
    } | null>(null), allowed = auth.isOwner && Boolean(auth.session) && !auth.suspended;
    useFocusEffect(useCallback(() => { scope.enter('duplicates'); setBusy(false);setItems([]);setSelected([]);setCanonical(null);setIssue('');return () => scope.leave(); }, [scope]));
    async function load(next = 0) { if (!repository || !allowed || busy)
        return; const ticket = scope.begin(); let c: CapturedAccountContext | undefined; setBusy(true); setIssue(''); try {
        c = w.captureAccountContext();
        const pid = sharedPropertyId(id), page = await repository.duplicateCandidates(pid, next, c);
        ticket.checkpoint(c);
        setItems(page.items);
        setCanonical(page.canonical);
        setMore(page.hasMore);
        setOffset(next);
        if (loadedId !== pid) {
            setSelected([]);
            setLoadedId(pid);
        }
    }
    catch (e) {
        try {
            ticket.checkpoint(c);
            setIssue(String(e&&typeof e==='object'&&'message'in e?e.message:e).includes('KH_PROPERTY_MODERATION_CONFLICT')?'KarmaHouse debe revisar por separado la retirada de la copia antes de consolidarla con una ficha sin bloqueo.':agencyError(e));
            setItems([]);
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
    } }
    async function merge() { if (!repository || !allowed || busy)
        return; const ticket = scope.begin(); let c: CapturedAccountContext | undefined; setBusy(true); setIssue(''); try {
        c = w.captureAccountContext();
        const canonicalId = sharedPropertyId(id);
        if (canonicalId !== loadedId || !canonical)
            throw Error('Vuelve a consultar las coincidencias de esta vivienda.');
        const expectedVersions = Object.fromEntries([[canonicalId, canonical?.version], ...selected.map(item => [item.id, item.version])]);
        const payload = { canonicalId, duplicateIds: selected.map(item => item.id), expectedVersions, originEvidence: evidence, reason };
        const body = JSON.stringify(payload);
        if (pending.current?.body !== body)
            pending.current = { body, request: randomUUID() };
        await repository.mergeDuplicates({ ...payload, clientRequestId: pending.current.request }, c);
        ticket.checkpoint(c);
        setItems([]);
        setSelected([]);
        pending.current = null;
        setIssue('Consolidación guardada. Los enlaces anteriores conservan su acceso a la ficha canónica.');
    }
    catch (e) {
        try {
            ticket.checkpoint(c);
            setIssue(String(e&&typeof e==='object'&&'message'in e?e.message:e).includes('KH_PROPERTY_MODERATION_CONFLICT')?'KarmaHouse debe revisar por separado la retirada de la copia antes de consolidarla con una ficha sin bloqueo.':agencyError(e));
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
    } }
    return <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}><ScrollView contentContainerStyle={s.content}><PageTitle title="Revisar duplicados" subtitle="Consolidación por el propietario de KarmaHouse" back/>{!allowed ? <Notice>Esta revisión requiere al propietario de KarmaHouse.</Notice> : <>{issue && <Notice>{issue}</Notice>}<AgencyTextField label="UUID o enlace de la vivienda canónica" value={id} onChangeText={setId} editable={!busy}/>{canonical && <Text style={s.title}>Conservar: {canonical.title}</Text>}<Button label="Consultar coincidencias para revisar" loading={busy} onPress={() => void load()}/><Notice>Una coincidencia requiere revisión manual. Solo se pueden consolidar orígenes compatibles. Los historiales y conversaciones conservan sus identificadores.</Notice>{items.map(item => <View key={item.id} style={s.card}><Text style={s.title}>{item.title}</Text><Text style={s.copy}>{item.location} · Versión {item.version}</Text><Text selectable style={s.copy}>{item.id}</Text><Button secondary label={selected.some(x => x.id === item.id) ? 'Quitar de la consolidación' : 'Marcar duplicado'} disabled={busy || selected.length >= 20 && !selected.some(x => x.id === item.id)} onPress={() => setSelected(old => old.some(x => x.id === item.id) ? old.filter(x => x.id !== item.id) : [...old, item])}/></View>)}{offset > 0 && <Button label="Página anterior" secondary disabled={busy} onPress={() => void load(offset - 30)}/>} {more && <Button label="Más coincidencias" secondary disabled={busy} onPress={() => void load(offset + 30)}/>}<Text style={s.copy}>{selected.length} duplicados seleccionados</Text><AgencyTextField label="Evidencia de origen compatible" value={evidence} onChangeText={setEvidence} multiline editable={!busy} maxLength={2000}/><AgencyTextField label="Motivo de consolidación" value={reason} onChangeText={setReason} multiline editable={!busy} maxLength={500}/><Button label="Consolidar los duplicados seleccionados" disabled={busy || !selected.length || evidence.trim().length < 10 || reason.trim().length < 10 || !canonical} onPress={() => void merge()}/></>}</ScrollView></SafeAreaView>;
}
