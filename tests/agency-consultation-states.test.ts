import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {havanaDateTime as realHavanaDateTime,NEGOTIATION_TIME_ZONE} from '../src/negotiations/domain.ts';
import {createFollowupViewScope} from '../src/agencies/deals/viewScope.ts';
import {bumpErrorMessage,canBumpNow,formatProDate,isProActive,nextBumpAt} from '../src/pro/domain.ts';
import {filterPortfolio,shownReference} from '../src/agencies/properties/portfolio.ts';
import {listingBoardLabels,listingBoardState} from '../src/domain/listings.ts';

type Element={type:any;props:any};
function elements(node:any):Element[]{return !node?[]:Array.isArray(node)?node.flatMap(elements):typeof node==='object'?[node,...elements(node.props?.children)]:[];}
const settle=async()=>{for(let n=0;n<4;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(screen:string,name:string,options:{propertyId?:string;occupancy?:unknown[];workspaceError?:string;realClock?:boolean;serviceUnavailable?:boolean;pro?:any;role?:string;enabled?:boolean}={}){
 const states:any[]=[],refs:any[]=[];let stateIndex=0,refIndex=0,focus:(()=>void)|undefined,followupLoad:(()=>Promise<void>)|undefined;
 let finish!:(page:any)=>void,fail!:(error:unknown)=>void;
 const response=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});
 const counters={list:0},context={userId:'actor',agencyId:'agency',signal:new AbortController().signal,checkpoint(){},release(){}};
 const w={error:options.workspaceError??'',ready:true,enabled:options.enabled??true,activeAgencyId:'agency',generation:1,activeAgency:{tradeName:'Casas',state:'approved'},membership:{userId:'actor',role:options.role??'admin'},captureAccountContext:()=>context,captureAgencyReadContext:()=>context,captureAgencyContext:()=>context,refreshAgencies:async()=>{},repository:{application:()=>response,listMembers:async()=>({items:[],hasMore:false})}};
 const bindings:any={repository:{list:()=>(counters.list++,response),personalList:()=>response,calendar:()=>response,occupancy:async()=>options.occupancy??[],get:()=>response,listTasks:async()=>({items:[],hasMore:false}),visits:async()=>({items:[],hasMore:false}),history:async()=>({items:[],hasMore:false}),conversationId:async()=>null},useAuth:()=>({user:{id:'actor'},session:{access_token:'captured'}}),useAgencyWorkspace:()=>w,useAgencyFormStyles:()=>({styles:{},colors:{}}),usePro:()=>options.pro??{repository:null,status:null,error:'',loading:false,reload:async()=>{}},bumpErrorMessage,canBumpNow,formatProDate,isProActive,nextBumpAt,filterPortfolio,shownReference,listingBoardLabels,listingBoardState,LOAD_ALL_LIMIT:300,formatMoney:()=>'$ 1',priceSuffix:()=>'',useState(initial:any){const i=stateIndex++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],(value:any)=>{states[i]=typeof value==='function'?value(states[i]):value;}];},useRef(initial:any){const i=refIndex++;return refs[i]??(refs[i]={current:initial});},useMemo:(work:any)=>work(),useCallback:(work:any)=>work,useFocusEffect:(work:any)=>{focus=work;},useEffect(){},useFollowupScope(load:any){followupLoad=()=>load(()=>context);return {capture:()=>context,isActive:()=>true};},useConsultationRefresh:()=>({refreshing:false,isRefreshing:()=>false}),createFollowupViewScope,havanaDateTime:options.realClock?realHavanaDateTime:()=>({date:'2026-10-12',time:'10:00'}),havanaAgendaRange:()=>({from:'2026-10-12T00:00:00Z',to:'2026-10-19T00:00:00Z'}),agencyError:()=> 'No se pudo consultar.',schedulingError:()=> 'No se pudo consultar.',closureError:()=> 'No se pudo consultar.',AbortController,AppState:{currentState:'active',addEventListener:()=>({remove(){}})},router:{push(){}},isUuid:()=>true,followupError:()=> 'No se pudo consultar.',useStyles:()=>({styles:{},colors:{}}),useLocalSearchParams:()=>({id:'conversation'}),useMessagingActivity:()=>false,supabase:options.serviceUnavailable?null:{},createAgencyMessagingRepository:()=>({get:()=>response,markRead:async()=>{}}),readIncomingAgencyMessages:async()=>({items:[],hasMore:false}),mergeAgencyMessages:(_:unknown,items:unknown)=>items,agencyConversationCounterparts:()=>[],isAgencyReadAccessFailure:()=>false,emptyAgencyApplication:()=>({}),agencyPropertyRepository:null,dealStageLabel:{},visitOutcomeLabel:()=>'Realizada',NEGOTIATION_TIME_ZONE,Platform:{OS:'web'},React:{createElement(type:any,props:any,...children:any[]){return {type,props:{...props,children}};}}};
 for(const control of ['SafeAreaView','ScrollView','RefreshControl','Text','View','TextInput','ActivityIndicator','PageTitle','Notice','EmptyState','Button','Pill','ActionGroup','AgencyTextField','VisitDateTimeFields','AccountPrompt','Image','AgencyRegistrationFields','KeyboardAvoidingView','AgencyProposalPanel','ReportConversationSheet','AgencyShareButton','AgencyShareActions','Icon','Pressable','ListingStateChip','PropertyImage'])bindings[control]=control;
 const path=`src/screens/${screen}.tsx`,tree=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),fn=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);assert.ok(fn);
 const presentation=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>['format','day','hour','intervalEnd'].includes(d.name.getText(tree)))).map(n=>n.getText(tree)).join('\n');
 vm.runInNewContext(ts.transpileModule(`${presentation}\nglobalThis.screen=${fn.getText(tree).replace(/^export default |^export /,'')}`,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText,bindings);
 const render=()=>{stateIndex=0;refIndex=0;return bindings.screen({id:'deal',personal:false,propertyId:options.propertyId});};
 render();if(followupLoad)void followupLoad();else focus?.();
 return {render,finish,fail,counters};
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

// Pro: the server lets any active member of the origin agency bump, so the gate follows the origin, not canEditCommon.
const day=864e5,ago=(days:number)=>new Date(Date.now()-days*day).toISOString(),ahead=new Date(Date.now()+30*day).toISOString();
const agencyPro=(until:string|null,extra:any={})=>({repository:null,status:{personalUntil:null,agencies:[{id:'agency',tradeName:'Casas',role:'manager',until}]},error:'',loading:false,reload:async()=>{},...extra});
const entry=(property:any={},origin:string|null='agency')=>({property:{id:'home',title:'Casa',location:'Vedado',moderationStatus:'approved',status:'active',createdAt:ago(8),...property},originAgencyId:origin,canEditCommon:false,mandate:{reference:'R-1'}});
async function portfolio(item:any,options:any={}){const f=fixture('AgencyPortfolioScreen','Portfolio',options);await settle();f.finish({items:[item],hasMore:false});await settle();return f;}
const buttons=(f:any)=>elements(f.render()).filter(e=>e.type==='Button').map(e=>e.props.label);
const texts=(f:any)=>elements(f.render()).filter(e=>e.type==='Text').map(e=>e.props.children.join('')).join(' | ');
const notices=(f:any)=>elements(f.render()).filter(e=>e.type==='Notice').map(e=>e.props.children.join(''));
test('AgencyPortfolioScreen: a manager of the origin agency with agency Pro can bump an eligible listing',async()=>{
 const f=await portfolio(entry(),{role:'manager',pro:agencyPro(ahead)});
 assert.ok(buttons(f).includes('Subir anuncio'));assert.equal(texts(f).includes('Podrás subirlo el'),false);
});
test('AgencyPortfolioScreen: without agency Pro, for a listing of another agency or in read-only mode there is no bump',async()=>{
 for(const [label,item,options]of [['no Pro',entry(),{pro:agencyPro(null)}],['expired Pro',entry(),{pro:agencyPro(ago(1))}],['another origin',entry({},'other'),{pro:agencyPro(ahead)}],['no origin',entry({},null),{pro:agencyPro(ahead)}],['read-only',entry(),{pro:agencyPro(ahead),enabled:false}]]as const){
  const f=await portfolio(item,options);assert.equal(buttons(f).includes('Subir anuncio'),false,label);assert.equal(texts(f).includes('Podrás subirlo el'),false,label);
 }
});
test('AgencyPortfolioScreen: a listing bumped yesterday says when it can go up again',async()=>{
 const f=await portfolio(entry({bumpedAt:ago(1)}),{pro:agencyPro(ahead)});
 assert.equal(buttons(f).includes('Subir anuncio'),false);assert.ok(texts(f).includes('Podrás subirlo el'));
});
test('AgencyPortfolioScreen: a bump is locked, patches the card in place and does not reload the pages',async()=>{
 let bumps=0;const repository={bump:async()=>{bumps++;return {bumpedAt:new Date().toISOString(),nextBumpAt:ago(-7)};}};
 const f=await portfolio(entry(),{pro:agencyPro(ahead,{repository})});
 const press=elements(f.render()).find(e=>e.type==='Button'&&e.props.label==='Subir anuncio')!.props.onPress;
 press();press();await settle();
 assert.equal(bumps,1,'The second tap lands before React re-renders and must not start another bump.');
 assert.equal(f.counters.list,1,'Patching in place keeps the loaded pages; no reload.');
 assert.equal(buttons(f).includes('Subir anuncio'),false);assert.ok(texts(f).includes('Podrás subirlo el'));
});
test('AgencyPortfolioScreen: a refused bump is explained on its card without the pull-to-refresh hint and re-reads Pro',async()=>{
 let reloads=0;const repository={bump:async()=>{throw {message:'KH_PRO_REQUIRED'};}};
 const f=await portfolio(entry(),{pro:agencyPro(ahead,{repository,reload:async()=>{reloads++;}})});
 elements(f.render()).find(e=>e.type==='Button'&&e.props.label==='Subir anuncio')!.props.onPress();await settle();
 assert.ok(notices(f).some(text=>text.includes('parte de KarmaHouse Pro')));assert.equal(notices(f).some(text=>text.includes('Desliza hacia abajo')),false);assert.equal(reloads,1);
});
test('AgencyPortfolioScreen: a card opens the listing, offers Interesados and plain «Compartir», and hides automatic references',async()=>{
 const f=await portfolio(entry({},'agency'));const tree=elements(f.render());
 assert.ok(buttons(f).includes('Interesados'));
 const actions=tree.find(e=>e.type==='AgencyShareActions');assert.equal(actions?.props.shareable,true);
 assert.equal(JSON.stringify(f.render()).includes('mi inmobiliaria y mi contacto'),false);
 assert.ok(tree.some(e=>e.type==='Pressable'&&/^Casa\. En el catálogo\. Propia\./.test(e.props.accessibilityLabel)));
 assert.ok(texts(f).includes('Ref. R-1'));
 const auto=await portfolio({...entry({},null),mandate:{reference:'kh-9aaad6e2-76c6-427b-b744-781fe7c165b5'}});
 assert.equal(texts(auto).includes('kh-'),false);assert.equal(texts(auto).includes('Ref.'),false);
});
