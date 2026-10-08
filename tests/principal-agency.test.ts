import test from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {decodeAgencySummary,decodeAgencyApplication} from '../src/agencies/repository.ts';
import {createAgencyProfileRepository,decodePublicAgencyProfile,commercialInput} from '../src/agencies/profile.ts';
import {decodePublicContact} from '../src/agencies/messaging/repository.ts';
import {decodePublicContact as decodeWebContact,renderListing} from '../web/api/p.ts';
import {handleAgencyProfile} from '../web/api/agency.ts';

const id='45000000-0000-4000-8001-000000000001';
const actor='45000000-0000-4000-8000-000000000001';
const summary={id,tradeName:'KarmaHouse',state:'approved',version:1,logoPath:null,verified:true,verificationVersion:1};
const minimal={agencyId:id,tradeName:'KarmaHouse',logoPath:null,verified:true,isPrincipal:true,identityOnly:true};
const draft={tradeName:'KarmaHouse',businessPhone:'',province:'',municipality:'',serviceAreas:[],description:'',officeAddress:null,publishOfficeAddress:false};
const complete={agencyId:id,tradeName:'Casas confirmadas',logoPath:null,verified:true,businessPhone:'+5351234567',province:'La Habana',municipality:'Plaza',serviceAreas:['Vedado'],description:'Servicios comerciales confirmados por la agencia.'};

test('principal status accepts only a server boolean and absent legacy status is false',()=>{
 assert.equal(decodeAgencySummary({...summary,isPrincipal:true}).isPrincipal,true);
 assert.equal(decodeAgencySummary(summary).isPrincipal,false);
 for(const isPrincipal of ['true',1,null])assert.throws(()=>decodeAgencySummary({...summary,isPrincipal}),/interpretar/);
 assert.throws(()=>decodeAgencySummary({...summary,isPrincipal:true,verified:false}),/interpretar/);
});

test('protected principal application reads empty evidence without inventing responsible or commercial data',()=>{
 const decoded=decodeAgencyApplication({agency:{...summary,isPrincipal:true},input:{},reviewNote:null,emailConfirmed:false});
 assert.deepEqual(decoded.input,{...draft,responsibleFullName:'',evidenceReferences:[]});
 assert.throws(()=>decodeAgencyApplication({agency:summary,input:{},reviewNote:null,emailConfirmed:false}));
});

test('principal public identity allows no fabricated commercial fields and rejects private or inconsistent projections',()=>{
 assert.deepEqual(decodePublicAgencyProfile(minimal),minimal);
 assert.equal(decodePublicAgencyProfile(complete).isPrincipal,false);
 for(const extra of [{businessPhone:'+5351234567'},{responsibleFullName:'PRIVATE'},{isPrincipal:false},{verified:false}])assert.throws(()=>decodePublicAgencyProfile({...minimal,...extra}));
});

test('principal commercial draft can be loaded for configuration while save still validates real fields',async()=>{
 const context={userId:actor,accessToken:'owner-token',signal:new AbortController().signal,checkpoint(){},agencyId:id,generation:1};
 const client=createClient('https://fixture.invalid','fixture-key',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>Response.json({agencyId:id,version:1,logoPath:null,isPrincipal:true,commercialProfileComplete:false,input:draft})}});
 const record=await createAgencyProfileRepository(client).get(context);
 assert.equal(record.commercialProfileComplete,false);
 assert.deepEqual(record.input,draft);
 assert.throws(()=>commercialInput(draft),/teléfono/);
 await assert.rejects(createAgencyProfileRepository(client).save({input:draft,expectedVersion:1,clientRequestId:actor},context),/teléfono/);
});

test('contact projection carries principal status and legacy agencies cannot gain it by matching name',()=>{
 const contact={propertyId:id,personalContact:false,agencies:[{agencyId:id,tradeName:'KarmaHouse',verified:true,contactAvailable:true,isPrincipal:true}]};
 for(const decode of [decodePublicContact,decodeWebContact]){
  assert.equal(decode(contact).agencies[0].isPrincipal,true);
  const {isPrincipal:_,...legacy}=contact.agencies[0];
  assert.equal(decode({...contact,agencies:[legacy]}).agencies[0].isPrincipal,false);
  assert.throws(()=>decode({...contact,agencies:[{...legacy,isPrincipal:'true'}]}));
  assert.throws(()=>decode({...contact,agencies:[{...legacy,isPrincipal:true,verified:false}]}));
 }
});

test('public web principal page displays golden identity without contact links or unconfirmed location',async()=>{
 const request=new Request(`https://example.invalid/agency/${id}`);
 const env={supabaseUrl:'https://fixture.invalid',anonKey:'fixture-key',publicOrigin:'https://example.invalid'};
 const initial=await handleAgencyProfile(request,env,async()=>Response.json(minimal));
 assert.equal(initial.status,200);
 const html=await initial.text();assert.match(html,/Inmobiliaria principal/);assert.match(html,/class="principal"/);
 assert.doesNotMatch(html,/tel:|Contacto comercial|Zonas:|undefined|null|La Habana/);
 const principal=await handleAgencyProfile(request,env,async()=>Response.json({...complete,isPrincipal:true}));
 assert.equal(principal.status,200);assert.match(await principal.text(),/class="principal"/);
 const normal=await handleAgencyProfile(request,env,async()=>Response.json(complete));
 assert.match(await normal.text(),/class="verified"/);
});
