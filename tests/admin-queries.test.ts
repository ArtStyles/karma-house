import test from 'node:test';
import assert from 'node:assert/strict';
import {mapRemoteListing} from '../src/data/remoteMapping.ts';

const queries = await import('../src/admin/queries.ts').catch(() => null);
const api = () => { assert.ok(queries, 'administration query contract is implemented'); return queries; };
const id='a2000000-0000-4000-8000-000000000001';
const account={id,displayName:'Cuenta de prueba',role:'member',suspended:false,reason:null};
const review={id,owner_id:id,client_request_id:'request',title:'Busco una casa',location:'Vedado',province:'La Habana',latitude:null,longitude:null,location_precision:null,condition:null,floor:null,price_negotiable:false,price:90000,bedrooms:2,bathrooms:null,area:null,type:null,description:'Busco una casa en esta localidad.',amenities:[],photo_paths:[],availability:'active',moderation:'pending',review_note:null,version:1,created_at:'2026-10-08T12:00:00Z',operation:'wanted',swap_wants:null,swap_provinces:null,swap_balance:null,swap_amount:null,rent_period:null,rent_min_stay:null,wanted_operations:['sale','swap'],cover_thumb_path:null};

test('query builder sends a normalized server query with a fixed page and without an actor override',()=>{
  const args=api().buildAdminQueryArgs({section:'listings',query:'  Vedado  ',offset:20,filters:{province:'La Habana',moderation:'pending',availability:'all'},sort:'oldest'});
  assert.deepEqual(args,{p_section:'listings',p_query:'Vedado',p_filters:{province:'La Habana',moderation:'pending'},p_offset:20,p_limit:20,p_sort:'oldest'});
  assert.equal('p_actor_id' in args,false);
});

test('query builder rejects fractional pages, cross-section filters and malformed filter values',()=>{
  const build=api().buildAdminQueryArgs;
  for(const offset of [-20,1,19,21,20.5,100020,Infinity]) assert.throws(()=>build({section:'accounts',offset}));
  for(const filters of [{source:'agency'},{toString:'unexpected'},{status:'deleted'},{role:'superadmin'},{status:1},{status:null}]) assert.throws(()=>build({section:'accounts',filters:filters as Record<string,string>}));
  assert.throws(()=>build({section:'history',sort:'name'}));
  assert.throws(()=>build({section:'history',filters:{from:'2026-02-30'}}));
  assert.throws(()=>build({section:'history',filters:{from:'2026-10-09',to:'2026-10-08'}}));
  assert.throws(()=>build({section:'assistedListings',filters:{collaboratorId:'not-a-uuid'}}));
  assert.throws(()=>build({section:'review',query:'x'.repeat(101)}));
});

test('query builder preserves actor IDs, boolean string filters and report source',()=>{
  assert.deepEqual(api().buildAdminQueryArgs({section:'messageReports',filters:{source:'agency',reason:'harassment',from:'2026-10-01',to:'2026-10-08'}}).p_filters,{source:'agency',reason:'harassment',from:'2026-10-01',to:'2026-10-08'});
  assert.deepEqual(api().buildAdminQueryArgs({section:'assistedListings',filters:{collaboratorId:id,eligible:'false'}}).p_filters,{collaboratorId:id,eligible:'false'});
  assert.deepEqual(api().buildAdminQueryArgs({section:'history',filters:{actor:id,action:'verify'}}).p_filters,{actor:id,action:'verify'});
});

test('page decoder retains total from the complete server query rather than counting the visible page',()=>{
  assert.deepEqual(api().decodeAdminQueryPage('accounts',{items:[account],total:47,hasMore:true}),{items:[account],total:47,hasMore:true});
  assert.deepEqual(api().decodeAdminQueryPage('accounts',{items:[],total:47,hasMore:false}),{items:[],total:47,hasMore:false});
});

test('page decoder rejects extra private fields and invalid totals or oversized pages',()=>{
  const decode=api().decodeAdminQueryPage;
  for(const total of [-1,1.5,'1',Infinity]) assert.throws(()=>decode('accounts',{items:[account],total,hasMore:false}));
  assert.throws(()=>decode('accounts',{items:[{...account,email:'private@example.invalid'}],total:1,hasMore:false}));
  assert.throws(()=>decode('accounts',{items:Array(21).fill(account),total:21,hasMore:false}));
  assert.throws(()=>decode('accounts',{items:[account],total:0,hasMore:false}));
  assert.throws(()=>decode('accounts',{items:[],total:0,hasMore:true}));
  assert.throws(()=>decode('accounts',{items:[account],total:1,hasMore:false,debug:{}}));
});

test('review rows remain compatible with property mapping while rejecting unrelated provenance',()=>{
  const page=api().decodeAdminQueryPage('review',{items:[review],total:1,hasMore:false});
  assert.equal(mapRemoteListing(page.items[0],new Map()).title,'Busco una casa');
  assert.throws(()=>api().decodeAdminQueryPage('review',{items:[{...review,consent_text:'Private proof'}],total:1,hasMore:false}));
  assert.throws(()=>api().decodeAdminQueryPage('review',{items:[{...review,photo_paths:[null]}],total:1,hasMore:false}));
});

test('report decoder accepts retained evidence with a deleted agency sender and rejects malformed context',()=>{
  const report={id,conversationId:id,propertyTitle:'Casa',reporterId:id,reportedUserId:id,reason:'fraud',details:'Reporte',status:'open',createdAt:'2026-10-08T12:00:00Z',reviewNote:null,context:[{id,conversationId:id,clientMessageId:id,senderId:null,body:'Mensaje retenido',seq:1,createdAt:'2026-10-08T12:00:00Z'}]};
  assert.equal(api().decodeAdminQueryPage('messageReports',{items:[report],total:1,hasMore:false}).items[0].context[0].senderId,null);
  assert.throws(()=>api().decodeAdminQueryPage('messageReports',{items:[{...report,context:[{...report.context[0],seq:0}]}],total:1,hasMore:false}));
});

test('assisted list decoder preserves incomplete private drafts and refuses evidence outside its projection',()=>{
  const row={id,title:'Borrador',ownerId:id,version:1,provenanceVersion:1,moderation:'draft',availability:'paused',collaboratorId:id,collaboratorReference:'Ref',lastConfirmedAt:null,eligible:false};
  assert.equal(api().decodeAdminQueryPage('assistedListings',{items:[row],total:1,hasMore:false}).items[0].lastConfirmedAt,null);
  assert.throws(()=>api().decodeAdminQueryPage('assistedListings',{items:[{...row,consentText:'Private'}],total:1,hasMore:false}));
});

test('agency query decodes existing application and verification request shapes',()=>{
  const application={agency:{id,tradeName:'Agencia sintética',state:'approved',version:1,logoPath:null,verified:false,verificationVersion:1},input:{tradeName:'Agencia sintética',responsibleFullName:'Responsable sintético',businessPhone:'+5355555555',province:'La Habana',municipality:'Plaza',serviceAreas:['Vedado'],description:'Descripción comercial sintética de prueba.',officeAddress:null,publishOfficeAddress:false,evidenceReferences:[]},reviewNote:null,emailConfirmed:true};
  const request={id,agencyId:id,input:{message:'Solicitud sintética de verificación.',evidenceReferences:[]},state:'pending',reviewNote:null,version:1,createdAt:'2026-10-08T12:00:00Z',reviewedAt:null};
  assert.deepEqual(api().decodeAdminQueryPage('agencies',{items:[{application,request}],total:1,hasMore:false}).items[0],{application:{...application,agency:{...application.agency,isPrincipal:false}},request});
  assert.throws(()=>api().decodeAdminQueryPage('agencies',{items:[{application,request:{...request,agencyId:'a2000000-0000-4000-8000-000000000002'}}],total:1,hasMore:false}));
  assert.deepEqual(api().buildAdminQueryArgs({section:'agencies',filters:{review:'verification',verificationState:'pending'}}).p_filters,{review:'verification',verificationState:'pending'});
  assert.throws(()=>api().buildAdminQueryArgs({section:'agencies',filters:{verificationState:'pending'}}));
});

test('dashboard keeps global counts while preserving the owner-only count boundary',()=>{
  assert.deepEqual(api().decodeAdminDashboard({review:23,propertyReports:4,messageReports:6,agencies:null,verification:null}),{review:23,propertyReports:4,messageReports:6,agencies:null,verification:null});
  for(const row of [{review:-1,propertyReports:4,messageReports:6,agencies:1,verification:2},{review:1,propertyReports:4,messageReports:6,agencies:'1',verification:2},{review:1,propertyReports:4,messageReports:6,agencies:1,verification:2,email:'private'}])assert.throws(()=>api().decodeAdminDashboard(row));
});

test('history actor options accept only distinct identities and names without private account fields',()=>{
  assert.deepEqual(api().decodeAdminHistoryActors([{id,displayName:'Administrador de prueba'}]),[{id,displayName:'Administrador de prueba'}]);
  assert.deepEqual(api().decodeAdminHistoryActors([]),[]);
  for(const value of [[{id,displayName:'Admin',email:'private@example.invalid'}],[{id:'bad-id',displayName:'Admin'}],[{id,displayName:1}],[{id,displayName:'Admin'},{id,displayName:'Otro nombre'}],{items:[]}])assert.throws(()=>api().decodeAdminHistoryActors(value));
});
