import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as live from '../src/agencies/messaging/live.ts';
import { createAgencyMessagingRepository, mergeAgencyMessages } from '../src/agencies/messaging/repository.ts';
import { createAgencyController } from '../src/agencies/controller.ts';
import { agencyError } from '../src/agencies/domain.ts';
import { agencyConversationCounterparts } from '../src/agencies/messaging/counterparts.ts';
import { validateAgencyProposal, schedulingError } from '../src/agencies/scheduling/domain.ts';
import { createConsultationRefreshGate } from '../src/lib/consultationRefresh.ts';

// Execute the actual TSX function bodies. This deterministic hook/element harness
// observes state and keyed child continuity; it is not a rendered React/native proof.
type Element = { type: any; props: any };
class Hooks {
    slots: any[] = [];
    cursor = 0;
    focuses: (() => void)[] = [];
    cleanups: (() => void)[] = [];
    render(work: () => Element) { this.cursor = 0; return work(); }
    useState = (initial: any) => {
        const i = this.cursor++;
        if (!(i in this.slots)) this.slots[i] = initial;
        return [this.slots[i], (value: any) => { this.slots[i] = typeof value === 'function' ? value(this.slots[i]) : value; }];
    };
    useRef = (initial: any) => {
        const i = this.cursor++;
        return this.slots[i] ??= { current: initial };
    };
    useMemo = (work: () => any, deps: any[]) => {
        const i = this.cursor++, old = this.slots[i];
        if (!old || deps.some((d, n) => d !== old.deps[n])) this.slots[i] = { deps, value: work() };
        return this.slots[i].value;
    };
    useCallback = (work: any, deps: any[]) => this.useMemo(() => work, deps);
    useFocusEffect = (work: any) => {
        const i = this.cursor++;
        if (this.slots[i]?.work === work) return;
        this.slots[i]?.cleanup?.();
        const entry = this.slots[i] = { work, cleanup: undefined };
        this.focuses.push(() => { entry.cleanup = work(); if (entry.cleanup) this.cleanups.push(entry.cleanup); });
    };
    focus() { for (const work of this.focuses.splice(0)) work(); }
    blur() { for (const work of this.cleanups.splice(0)) work(); }
}
const id = (n: number) => `45000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), agency = id(2), chat = id(3);
const message = (seq: number) => ({ id: id(100 + seq), conversationId: chat, seq, clientMessageId: id(200 + seq), senderId: actor, body: `Message ${seq}`, createdAt: '2026-10-08T00:00:00Z' });
const conversation = (n = 0) => ({ id: n ? id(1000 + n) : chat, agencyId: agency, dealId: id(4), propertyId: id(5), buyerId: actor, canSend: true, closedReason: null, lastSeq: 90, agencyName: 'Agency', propertyTitle: `Home ${n}`, assigneeId: actor, dealVersion: 1, unreadCount: 0, blockedUserIds: [] });
function elements(root: any): Element[] {
    if (!root) return [];
    if (Array.isArray(root)) return root.flatMap(elements);
    if (typeof root !== 'object') return [];
    return [root, ...elements(root.props?.children)];
}
function control(tree: Element, label: string) {
    const found = elements(tree).find(e => e.props?.label === label || e.props?.accessibilityLabel === label);
    assert.ok(found, `Missing control ${label}`);
    return found.props;
}
const settle = async () => { for (let n = 0; n < 6; n++) await new Promise(r => setImmediate(r)); };
function execute(path: string, name: string, hooks: Hooks, bindings: Record<string, any>) {
    const sf = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const fn = sf.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(fn);
    const source = `globalThis.component = ${fn.getText(sf).replace(/^export default |^export /, '')}`;
    const context = { ...bindings, ...Object.fromEntries(['useState', 'useRef', 'useMemo', 'useCallback', 'useFocusEffect'].map(k => [k, (hooks as any)[k]])), useEffect() {}, React: { createElement(type: any, props: any, ...children: any[]) { return { type, props: { ...props, children } }; } } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText, context);
    return (context as any).component;
}
async function fixture(staff = false, inbox = false) {
    const summaries = [agency, id(9)].map(id => ({ id, tradeName: 'Agency', state: 'approved', version: 1, verified: false, verificationVersion: 1, logoPath: null }));
    const controller = createAgencyController({ capabilities: async () => ({ enabled: true }), listMine: async () => summaries, membership: async (agencyId: string) => ({ agencyId, userId: actor, role: 'admin', state: 'active', version: 1 }) } as any);
    controller.setSession({ userId: actor, accessToken: 'captured' });
    await controller.refreshAgencies(); await controller.setActiveAgency(agency);
    const auth = { user: { id: actor }, session: { access_token: 'captured' } };
    const w = { ...controller, get activeAgencyId() { return controller.getSnapshot().activeAgencyId; }, get generation() { return controller.getSnapshot().generation; }, activeAgency: summaries[0], enabled: true, membership: { role: 'admin' } };
    let fault: { method: string; error: any } | null = null, delay: { method: string; finish: (value: any) => void; promise: Promise<any> } | null = null;
    const proposalPayloads: any[] = [], messagePayloads: any[] = [];
    const reads:Record<string,number>={};
    const client = { rpc(method: string, args: any) { return { setHeader() { return this; }, async abortSignal() {
        reads[method]=(reads[method]??0)+1;
        if (delay?.method === method) return delay.promise;
        if (fault?.method === method) return { data: null, error: fault.error };
        let data: any = null;
        if (method === 'kh_get_agency_conversation') data = conversation();
        if (method === 'kh_list_agency_messages') { const end = args.p_before_seq ? args.p_before_seq - 1 : 90; data = { items: Array.from({ length: 30 }, (_, i) => message(end - 29 + i)), hasMore: end > 30 }; }
        if (method === 'kh_list_agency_conversations') data = { items: Array.from({ length: 30 }, (_, i) => conversation(args.p_offset + i + 1)), hasMore: true };
        if (method === 'kh_send_agency_message') { messagePayloads.push(args.p_payload); return { data: null, error: { message: 'temporary send failure' } }; }
        return { data, error: null };
    } }; } };
    const hooks = new Hooks(), panelHooks = new Hooks();
    const panelType = 'ActualProposalPanel';
    let requests = 800;
    const bindings: any = { ...live, mergeAgencyMessages, agencyError, agencyConversationCounterparts, createAgencyMessagingRepository, supabase: client, useAuth: () => auth, useAgencyWorkspace: () => w, useMessagingActivity: () => false, useLocalSearchParams: () => ({ id: chat, ...(staff ? { agencyId: agency } : {}) }), useStyles: () => ({ styles: {}, colors: {} }), isUuid: () => true, createMessageId: () => id(requests++), router: { push() {} }, ScrollView: 'ScrollView', SafeAreaView: 'SafeAreaView', View: 'View', Text: 'Text', TextInput: 'TextInput', Button: 'Button', Notice: 'Notice', PageTitle: 'PageTitle', AccountPrompt: 'AccountPrompt', ReportConversationSheet: 'ReportConversationSheet', AgencyProposalPanel: panelType, Pill: 'Pill', Pressable: 'Pressable' };
    bindings.useConsultationRefresh=execute('src/lib/useConsultationRefresh.ts','useConsultationRefresh',hooks,{createConsultationRefreshGate});
    bindings.RefreshControl='RefreshControl';
    const inboxRefresh={current:async()=>{}};
    const component = execute(inbox ? 'src/screens/InboxScreen.tsx' : 'src/screens/AgencyConversationScreen.tsx', inbox ? 'AgencyInbox' : 'AgencyConversationScreen', hooks, bindings);
    const panel = execute('src/components/agencies/AgencyProposalPanel.tsx', 'AgencyProposalPanel', panelHooks, { ...bindings, useAgencyFormStyles: bindings.useStyles, havanaDateTime: () => ({ date: '2026-10-09', time: '10:00' }), validateAgencyProposal, schedulingError, VisitDateTimeFields: 'DateTime', statusLabel: {}, repository: { list: async () => ({ items: [], hasMore: false }), create: async (payload: any) => { proposalPayloads.push(payload); throw Error('temporary proposal failure'); } } });
    let tree: Element, panelTree: Element | undefined, childKey: string | undefined, mounts = 0;
    function render() {
        tree = hooks.render(() => inbox ? component({refreshRef:inboxRefresh}) : component());
        const child = elements(tree).find(e => e.type === panelType);
        if (!child) { if (childKey !== undefined) { panelHooks.blur(); panelHooks.slots = []; } childKey = undefined; panelTree = undefined; }
        else { if (childKey !== child.props.key) { panelHooks.blur(); panelHooks.slots = []; mounts++; childKey = child.props.key; } panelTree = panelHooks.render(() => panel(child.props)); panelHooks.focus(); }
        return tree;
    }
    render(); hooks.focus(); await settle(); render(); await settle(); render();
    if (staff && inbox) { control(tree!, 'Equipo de mi agencia').onPress(); render(); hooks.focus(); await settle(); render(); }
    return { controller, auth, w, hooks, render, reads, proposalPayloads, messagePayloads, get tree() { return tree!; }, get panelTree() { return panelTree; }, get mounts() { return mounts; }, get proposals() { return proposalPayloads.length; }, get sends() { return messagePayloads.length; }, fail(method: string, error: any = Error('temporary network failure')) { fault = { method, error }; }, recover() { fault = null; }, delayed(method: string) { let finish!: (v: any) => void; const promise = new Promise(r => finish = r); delay = { method, finish, promise }; return finish; }, async refresh() { if(inbox)void inboxRefresh.current();else {const scroll=elements(tree!).find(e=>e.type==='ScrollView'&&e.props.refreshControl);assert.ok(scroll);scroll.props.refreshControl.props.onRefresh();}await settle();render(); }, async press(label: string, onPanel = false) { control(onPanel ? panelTree! : tree!, label).onPress(); await settle(); render(); }, input(label: string, value: string, onPanel = false) { control(onPanel ? panelTree! : tree!, label).onChangeText(value); render(); } };
}
function chatMessages(f: Awaited<ReturnType<typeof fixture>>) { return elements(f.tree).filter(e => e.type === 'Text' && e.props?.selectable).map(e => e.props.children[0]); }
function inboxHomes(f: Awaited<ReturnType<typeof fixture>>) { return elements(f.tree).filter(e => e.type === 'Text' && String(e.props.children[0]).startsWith('Home ')).map(e => e.props.children[0]); }

async function dealFixture(){
 const hooks=new Hooks(),context={userId:actor,agencyId:agency,signal:new AbortController().signal,checkpoint(){},release(){}};
 let hold=false,finish!:()=>void,mutations=0,failure:unknown=null;
 const wait=new Promise<void>(done=>finish=done);
 const deal={id:chat,agencyId:agency,buyerId:id(22),assigneeId:null,buyerName:'Buyer',propertyTitle:'Home',propertyId:id(5),stage:'inquiry',version:1,closedReason:null,contactKind:'account'};
 const capture=()=>context;
 const repository={get:async()=>{if(hold)await wait;if(failure)throw failure;return deal;},listTasks:async()=>({items:[],hasMore:false}),visits:async()=>({items:[],hasMore:false}),history:async()=>({items:[],hasMore:false}),conversationId:async()=>null,assign:async()=>{mutations++;}};
 const w={activeAgencyId:agency,generation:1,activeAgency:{tradeName:'Agency',state:'approved'},ready:true,enabled:true,membership:{userId:actor,role:'admin'},repository:{listMembers:async()=>({items:[],hasMore:false})}};
 const bindings:any={repository,...live,isUuid:()=>true,useAgencyWorkspace:()=>w,useAgencyFormStyles:()=>({styles:{},colors:{}}),useFollowupScope:(load:any)=>{hooks.useFocusEffect(hooks.useCallback(()=>{void load(capture);},[]));return {capture,isActive:()=>true};},followupError:()=>'',createMessageId:()=>id(44),havanaDateTime:()=>({date:'2026-10-08',time:'10:00'}),dealStageLabel:{inquiry:'Consulta'},AgencyProposalPanel:'ProposalPanel',ScrollView:'ScrollView',RefreshControl:'RefreshControl',SafeAreaView:'SafeAreaView',View:'View',Text:'Text',TextInput:'TextInput',PageTitle:'PageTitle',Button:'Button',Notice:'Notice',Pill:'Pill',VisitDateTimeFields:'DateTime'};
 bindings.useConsultationRefresh=execute('src/lib/useConsultationRefresh.ts','useConsultationRefresh',hooks,{createConsultationRefreshGate});
 const screen=execute('src/screens/AgencyDealScreen.tsx','Deal',hooks,bindings);
 const render=()=>hooks.render(()=>screen({id:chat}));
 render();hooks.focus();await settle();render();
 return {render,get mutations(){return mutations;},pause(){hold=true;},resume(){finish();},fail(error:unknown){failure=error;},refresh(){elements(render()).find(e=>e.type==='ScrollView')!.props.refreshControl.props.onRefresh();}};
}

test('a deal refresh blocks a stale action event until the refreshed authority is ready',async()=>{
 const f=await dealFixture(),tree=f.render();
 const staleAction=control(tree,'Tomar este caso');
 f.pause();f.refresh();
 staleAction.onPress();await settle();
 assert.equal(f.mutations,0);
 f.resume();await settle();
 control(f.render(),'Tomar este caso').onPress();await settle();assert.equal(f.mutations,1);
});

test('a transient deal refresh failure retains the case and its task draft',async()=>{
 const f=await dealFixture();
 control(f.render(),'Añadir seguimiento').onPress();
 control(f.render(),'Título del seguimiento').onChangeText('Conservar el borrador');
 f.fail(Error('temporary network failure'));f.refresh();await settle();
 assert.equal(control(f.render(),'Título del seguimiento').value,'Conservar el borrador');
 assert.ok(elements(f.render()).some(e=>e.type==='Text'&&e.props.children[0]==='Buyer'));
});

test('an explicit deal access denial clears the previously authorized case',async()=>{
 const f=await dealFixture();f.fail({code:'42501',message:'KH_AGENCY_DEAL_NOT_FOUND'});f.refresh();await settle();
 assert.equal(elements(f.render()).some(e=>e.type==='Text'&&e.props.children[0]==='Buyer'),false);
});

for (const method of ['kh_read_agency_conversation', 'kh_get_agency_conversation', 'kh_list_agency_messages']) test(`actual chat preserves 60 loaded messages and proposal/message attempts after transient ${method}`, async () => {
    const f = await fixture();
    await f.press('Ver mensajes anteriores');
    assert.equal(chatMessages(f).length, 60);
    f.input('Mensaje a la inmobiliaria', 'Unsent message');
    await f.press('Enviar mensaje');
    f.input('Nota de la propuesta', 'Unsent offer', true);
    await f.press('Enviar propuesta', true);
    const initialMounts = f.mounts;
    f.fail(method, method === 'kh_get_agency_conversation' ? { status: 503, message: 'upstream unavailable' } : Error('temporary network failure'));
    await f.refresh();
    assert.equal(chatMessages(f).length, 60);
    assert.equal(new Set(chatMessages(f)).size, 60);
    control(f.tree, 'Ver mensajes anteriores');
    assert.equal(f.mounts, initialMounts);
    assert.ok(f.panelTree);
    control(f.panelTree!, 'Reintentar propuesta');
    assert.equal(control(f.tree, 'Mensaje a la inmobiliaria').value, 'Unsent message');
    control(f.tree, 'Reintentar el mismo mensaje');
    assert.ok(elements(f.tree).some(e => e.type === 'Notice' && e.props.error));
    assert.equal(f.proposals, 1); assert.equal(f.sends, 1);
    f.recover(); await f.refresh();
    assert.equal(chatMessages(f).length, 60); assert.equal(f.mounts, initialMounts);
    control(f.tree, 'Ver mensajes anteriores');
    control(f.panelTree!, 'Reintentar propuesta'); assert.equal(f.proposals, 1); assert.equal(f.sends, 1);
    await f.press('Reintentar propuesta', true); await f.press('Reintentar el mismo mensaje');
    assert.equal(f.proposals, 2); assert.equal(f.sends, 2);
    assert.deepEqual(f.proposalPayloads[0], f.proposalPayloads[1]);
    assert.deepEqual(f.messagePayloads[0], f.messagePayloads[1]);
});
test('actual chat keeps an unsent proposal draft on transient read failure', async () => {
    const f = await fixture(); f.input('Nota de la propuesta', 'Preserved note', true);
    f.fail('kh_get_agency_conversation'); await f.refresh();
    assert.ok(f.panelTree); assert.equal(control(f.panelTree!, 'Nota de la propuesta').value, 'Preserved note');
});
test('actual inbox keeps pages and hasMore through list failure and healthy recovery', async () => {
    const f = await fixture(false, true); await f.press('Más conversaciones de agencia');
    assert.equal(inboxHomes(f).length, 60);
    f.fail('kh_list_agency_conversations'); await f.refresh();
    assert.equal(inboxHomes(f).length, 60); control(f.tree, 'Más conversaciones de agencia');
    f.recover(); await f.refresh();
    assert.equal(inboxHomes(f).length, 60); assert.equal(new Set(inboxHomes(f)).size, 60); control(f.tree, 'Más conversaciones de agencia');
});
for (const inbox of [false, true]) for (const staff of [false, true]) test(`actual ${inbox ? 'inbox' : 'chat'} clears current explicit denial (${staff ? 'staff invalidation' : 'buyer'})`, async () => {
    const f = await fixture(staff, inbox);
    f.fail(inbox ? 'kh_list_agency_conversations' : 'kh_get_agency_conversation', { code: '42501', message: 'KH_AGENCY_DEAL_NOT_FOUND' });
    await f.refresh();
    assert.equal((inbox ? inboxHomes(f) : chatMessages(f)).length, 0);
    assert.equal(f.panelTree, undefined);
    if (staff) assert.equal(f.controller.getSnapshot().activeAgencyId, null);
});
for (const error of [{ code: 'P0001', message: 'KH_AGENCY_DEAL_NOT_FOUND' }, { code: '42501', message: 'KH_AGENCY_DEAL_NOT_FOUND' }, { status: 403, message: 'forbidden' }, { code: 'PGRST301', message: 'JWT expired' }]) test(`actual buyer chat clears successful reads if markRead definitively denies ${error.code ?? error.status}`, async () => {
    const f = await fixture(); f.input('Mensaje a la inmobiliaria', 'Private draft'); await f.press('Enviar mensaje');
    f.fail('kh_read_agency_conversation', error); await f.refresh();
    assert.equal(chatMessages(f).length, 0); assert.equal(f.panelTree, undefined);
    assert.equal(control(f.tree, 'Mensaje a la inmobiliaria').value, '');
    assert.equal(elements(f.tree).some(e => e.props?.label === 'Reintentar el mismo mensaje'), false);
});
for (const inbox of [false, true]) test(`actual ${inbox ? 'inbox' : 'chat'} clears private state on blur and discards late read`, async () => {
    const f = await fixture(false, inbox);
    const finish = f.delayed(inbox ? 'kh_list_agency_conversations' : 'kh_get_agency_conversation');
    await f.refresh();
    f.hooks.blur(); f.render();
    assert.equal((inbox ? inboxHomes(f) : chatMessages(f)).length, 0); assert.equal(f.panelTree, undefined);
    finish({ data: inbox ? { items: [conversation()], hasMore: false } : conversation(), error: null });
    await settle(); f.render(); assert.equal((inbox ? inboxHomes(f) : chatMessages(f)).length, 0);
});
for (const inbox of [false, true]) for (const fail of [false, true]) test(`actual ${inbox ? 'inbox' : 'chat'} rejects old account ${fail ? 'error' : 'success'}`, async () => {
    const f = await fixture(false, inbox);
    const finish = f.delayed(inbox ? 'kh_list_agency_conversations' : 'kh_get_agency_conversation');
    await f.refresh();
    f.controller.setSession({ userId: id(10), accessToken: 'new account' }); f.auth.user.id = id(10); f.auth.session.access_token = 'new account'; f.render();
    finish(fail ? { data: null, error: { code: '42501', message: 'KH_ACCOUNT_CHANGED' } } : { data: inbox ? { items: [conversation()], hasMore: false } : conversation(), error: null });
    await settle(); f.render(); assert.equal((inbox ? inboxHomes(f) : chatMessages(f)).length, 0);
    assert.equal(f.panelTree, undefined); assert.equal(elements(f.tree).some(e => e.type === 'Notice' && e.props.error), false);
});
for (const inbox of [false, true]) for (const fail of [false, true]) test(`actual ${inbox ? 'inbox' : 'chat'} discards delayed ${fail ? 'error' : 'success'} after context change`, async () => {
    const f = await fixture(true, inbox);
    const finish = f.delayed(inbox ? 'kh_list_agency_conversations' : 'kh_get_agency_conversation');
    await f.refresh();
    await f.controller.setActiveAgency(id(9)); f.render();
    finish(fail ? { data: null, error: { code: '42501', message: 'KH_AGENCY_DEAL_NOT_FOUND' } } : { data: inbox ? { items: [conversation()], hasMore: false } : conversation(), error: null });
    await settle(); f.render();
    assert.equal((inbox ? inboxHomes(f) : chatMessages(f)).length, 0);
    assert.equal(f.controller.getSnapshot().activeAgencyId, id(9));
    assert.equal(elements(f.tree).some(e => e.type === 'Notice' && e.props.error), false);
});
