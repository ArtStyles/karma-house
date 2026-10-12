import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {havanaDateTime as realHavanaDateTime,NEGOTIATION_TIME_ZONE} from '../src/negotiations/domain.ts';
import {createFollowupViewScope} from '../src/agencies/deals/viewScope.ts';

type Element={type:any;props:any};
function elements(node:any):Element[]{return !node?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'?[node,...elements(node.props?.children)]:[];}
const settle=async()=>{for(let n=0;n<4;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(screen:string,name:string,options:{propertyId?:string;occupancy?:unknown[];workspaceError?:string;realClock?:boolean;serviceUnavailable?:boolean}={}){
 const states:any[]=[],refs:any[]=[];let stateIndex=0,refIndex=0,focus:(()=>void)|undefined,followupLoad:(()=>Promise<void>)|undefined;
 let finish!:(page:any)=>void,fail!:(error:unknown)=>void;
 const response=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
 const context={userId:'actor',agencyId:'agency',signal:new AbortController().signal,checkpoint(){},release(){}};
 const w={error:options.workspaceError??'',ready:true,enabled:true,activeAgencyId:'agency',generation:1,activeAgency:{tradeName:'Casas',state:'approved'},membership:{userId:'actor',role:'admin'},captureAccountContext:()=>context,captureAgencyReadContext:()=>context,captureAgencyContext:()=>context,refreshAgencies:async()=>{},repository:{application:()=>response,listMembers:async()=>({items:[],hasMore:false})}};
 const bindings:any={repository:{list:()=>response,personalList:()=>response,calendar:()=>response,occupancy:async()=>options.occupancy??[],get:()=>response,listTasks:async()=>({items:[],hasMore:false}),visits:async()=>({items:[],hasMore:false}),history:async()=>({items:[],hasMore:false}),conversationId:async()=>null},useAuth:()=>({user:{id:'actor'},session:{access_token:'captured'}}),useAgencyWorkspace:()=>w,useAgencyFormStyles:()=>({styles:{},colors:{}}),useState(initial:any){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial:any){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useMemo:(work:any)=>work(),useCallback:(work:any)=>work,useFocusEffect:(work:any)=>{focus=work;},useEffect(){},useFollowupScope(load:any){followupLoad=()=>load(()=>context);return {capture:()=>context,isActive:()=>true};},useConsultationRefresh:()=>({refreshing:false,isRefreshing:()=>false}),createFollowupViewScope,havanaDateTime:options.realClock?realHavanaDateTime:()=>({date:'2026-10-12',time:'10:00'}),havanaAgendaRange:()=>({from:'2026-10-12T00:00:00Z',to:'2026-10-19T00:00:00Z'}),agencyError:()=> 'No se pudo consultar.',schedulingError:()=> 'No se pudo consultar.',closureError:()=> 'No se pudo consultar.',AbortController,AppState:{currentState:'active',addEventListener:()=>({remove(){}})},router:{push(){}},isUuid:()=>true,followupError:()=> 'No se pudo consultar.',useStyles:()=>({styles:{},colors:{}}),useLocalSearchParams:()=>({id:'conversation'}),useMessagingActivity:()=>false,supabase:options.serviceUnavailable?null:{},createAgencyMessagingRepository:()=>({get:()=>response,markRead:async()=>{}}),readIncomingAgencyMessages:async()=>({items:[],hasMore:false}),mergeAgencyMessages:(_:unknown,items:unknown)=>items,agencyConversationCounterparts:()=>[],isAgencyReadAccessFailure:()=>false,emptyAgencyApplication:()=>({}),agencyPropertyRepository:null,dealStageLabel:{},visitOutcomeLabel:()=>'Realizada',NEGOTIATION_TIME_ZONE,Platform:{OS:'web'},React:{createElement(type:any,props:any,...children:any[]){return {type,props:{...props,children}};}}};
 for(const control of ['SafeAreaView','ScrollView','RefreshControl','Text','View','TextInput','ActivityIndicator','PageTitle','Notice','EmptyState','Button','Pill','ActionGroup','AgencyTextField','VisitDateTimeFields','AccountPrompt','Image','AgencyRegistrationFields','KeyboardAvoidingView','AgencyProposalPanel','ReportConversationSheet'])bindings[control]=control;
 const path=`src/screens/${screen}.tsx`,tree=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn);
 const presentation=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['format','day','hour','intervalEnd'].includes(d.name.getText(tree)))).map(n=>n.getText(tree)).join('\n');
 vm.runInNewContext(ts.transpileModule(`${presentation}\nglobalThis.screen=${fn.getText(tree).replace(/^export default |^export /,'')}`,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText,bindings);
 const render=()=>{stateIndex=0;refIndex=0;return bindings.screen({id:'deal',personal:false,propertyId:options.propertyId});};
 render();if(followupLoad)void followupLoad();else focus?.();
 return {render,finish,fail};
}
for(const [screen,name]of [['AgencyAgendaScreen','Agenda'],['AgencyDealsScreen','Deals'],['AgencyClosuresScreen','Closures'],['AgencyPortfolioScreen','Portfolio'],['AgencyApplicationScreen','AgencyApplicationScreen'],['AgencyDealScreen','Deal'],['AgencyConversationScreen','AgencyConversationScreen']]){
 test(`${screen}: a pending consultation does not claim an empty result`,async()=>{
  const f=fixture(screen,name);await settle();const pending=elements(f.render());
  assert.ok(pending.some(e=>e.type==='ActivityIndicator'),'Show the in-progress consultation.');
  assert.equal(pending.some(e=>e.type==='EmptyState'),false,'An empty result requires a completed read.');
  if(screen==='AgencyConversationScreen')assert.equal(pending.some(e=>e.props?.accessibilityLabel==='Mensaje a la inmobiliaria'),false,'Wait for authorized conversation context before showing its composer.');
  const detail=screen==='AgencyDealScreen'?{id:'deal',buyerName:'Ana',propertyTitle:'Casa',assigneeId:'actor',stage:'inquiry',contactKind:'account'}:screen==='AgencyConversationScreen'?{id:'conversation',agencyName:'Casas',propertyTitle:'Casa',lastSeq:0,canSend:true,buyerId:'actor',dealId:'deal'}:null;
  f.finish(detail??(screen==='AgencyApplicationScreen'?null:{items:[],hasMore:false}));await settle();
  const ready=elements(f.render());assert.equal(ready.some(e=>e.type==='ActivityIndicator'),false);
  if(detail)assert.equal(ready.some(e=>e.type==='EmptyState'),false);else assert.ok(ready.some(e=>e.type==='EmptyState'));
 });
 test(`${screen}: a failed consultation shows an error without claiming no records`,async()=>{
  const f=fixture(screen,name);await settle();f.fail(Error('network'));await settle();const failed=elements(f.render());
  assert.ok(failed.some(e=>e.type==='Notice'&&e.props.error));assert.equal(failed.some(e=>e.type==='EmptyState'||e.type==='Notice'&&String(e.props.children).includes('todavía no tiene viviendas')),false);assert.equal(failed.some(e=>e.type==='ActivityIndicator'),false);
 });
}

test('AgencyApplicationScreen: a workspace error is visible and does not claim no application',async()=>{
 const f=fixture('AgencyApplicationScreen','AgencyApplicationScreen',{workspaceError:'No se pudo consultar el espacio.'});await settle();f.finish(null);await settle();const failed=elements(f.render());
 assert.ok(failed.some(e=>e.type==='Notice'&&e.props.error));assert.equal(failed.some(e=>e.type==='EmptyState'),false);
});
const localHour=(date:string)=>new Date(date).toLocaleTimeString('es-CU',{timeZone:NEGOTIATION_TIME_ZONE,hour:'2-digit',minute:'2-digit'});
const localDateTime=(date:string)=>new Date(date).toLocaleString('es',{timeZone:NEGOTIATION_TIME_ZONE});
for(const [label,startsAt,endsAt,multiDay]of [
 ['same Havana day','2026-10-12T22:00:00Z','2026-10-12T23:00:00Z',false],
 ['multi-day reservation','2026-10-12T22:00:00Z','2026-10-15T22:00:00Z',true],
 ['UTC midnight within the same Havana day','2026-10-13T01:00:00Z','2026-10-13T02:00:00Z',false],
]as const)test(`AgencyAgendaScreen: occupancy preserves ${label}`,async()=>{
 const f=fixture('AgencyAgendaScreen','Agenda',{propertyId:'property',realClock:true,occupancy:[{startsAt,endsAt}]});await settle();f.finish({items:[],hasMore:false});await settle();
 const occupied=elements(f.render()).find(e=>e.type==='Text'&&String(e.props.children).includes('Ocupado'));
 assert.ok(occupied);const text=occupied.props.children.join('');assert.ok(text.includes(localHour(startsAt)));
 assert.ok(text.includes(multiDay?localDateTime(endsAt):localHour(endsAt)),'The end of the interval must keep its Havana date when that date changes.');
 if(!multiDay)assert.equal(text.includes(localDateTime(endsAt)),false,'A same-day interval keeps the compact time range.');
});
test('AgencyAgendaScreen: a visit crossing Havana midnight preserves its ending date',async()=>{
 const startsAt='2026-10-13T03:30:00Z',endsAt='2026-10-13T04:30:00Z';
 const f=fixture('AgencyAgendaScreen','Agenda',{realClock:true});await settle();f.finish({items:[{proposalId:'visit',dealId:'deal',propertyId:'property',propertyTitle:'Casa',contactName:'Ana',assigneeId:'actor',startsAt,endsAt,outcome:'performed'}],hasMore:false});await settle();
 const text=elements(f.render()).filter(e=>e.type==='Text').map(e=>e.props.children.join('')).join('\n');
 assert.ok(text.includes(localDateTime(endsAt)),'The visit must show the next Havana date, not only the ending clock time.');
});

test('AgencyConversationScreen: an unavailable service has an explicit state without a composer',async()=>{
 const f=fixture('AgencyConversationScreen','AgencyConversationScreen',{serviceUnavailable:true});await settle();const unavailable=elements(f.render());
 assert.ok(unavailable.some(e=>e.type==='EmptyState'));assert.equal(unavailable.some(e=>e.type==='ActivityIndicator'),false);assert.equal(unavailable.some(e=>e.props?.accessibilityLabel==='Mensaje a la inmobiliaria'),false);
});
