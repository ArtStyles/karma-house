import test from 'node:test';import assert from 'node:assert/strict';
import {handleAgencyProfile} from '../web/api/agency.ts';
import {mkdtemp,mkdir,copyFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
const id='45000000-0000-4000-8000-000000000001';
const profile={agencyId:id,tradeName:'Casas <seguras>',businessPhone:'+5351234567',province:'La Habana',municipality:'Plaza',serviceAreas:['Vedado'],description:'Servicios públicos de una agencia aprobada.',logoPath:null,verified:true};
test('public commercial page uses anon RPC, escapes fields and never renders excluded office',async()=>{
 const calls:string[]=[];const res=await handleAgencyProfile(new Request(`https://example.invalid/agency/${id}`),{supabaseUrl:'https://db.invalid',anonKey:'public-fixture',publicOrigin:'https://example.invalid'},async(url,init)=>{calls.push(String(url));assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer public-fixture');return Response.json(profile);});
 const html=await res.text();assert.equal(res.status,200);assert.match(html,/Casas &lt;seguras&gt;/);assert.match(html,/5351234567/);assert.doesNotMatch(html,/Dirección de oficina/);assert.equal(calls.length,1);
});
test('WEB-only deployment dependency closure serves GET with no root src directory',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kh-web-profile-'));
 try{
  for(const path of ['api/agency.ts','api/p.ts','lib/public-agency-profile.ts']){await mkdir(dirname(join(dir,path)),{recursive:true});await copyFile(join('web',path),join(dir,path));}
  await assert.rejects(access(join(dir,'src')));
  const code=`import {GET} from './api/agency.ts';globalThis.fetch=async()=>Response.json(${JSON.stringify(profile)});const r=await GET(new Request('https://example.invalid/agency/${id}'));if(r.status!==200)throw Error('status '+r.status);console.log(await r.text());`;
  const child=spawnSync(process.execPath,['--experimental-strip-types','--input-type=module','-e',code],{cwd:dir,encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'synthetic'},timeout:10000});
  assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/Casas &lt;seguras&gt;/);assert.doesNotMatch(child.stdout,/responsibleFullName|evidenceReferences/);
 }finally{assert.equal(dirname(resolve(dir)),resolve(tmpdir()));await rm(dir,{recursive:true,force:true});}
});
test('malformed/private projection and unavailable agency fail closed',async()=>{
 for(const raw of [null,{...profile,responsibleFullName:'PRIVATE'}]){const res=await handleAgencyProfile(new Request(`https://example.invalid/agency/${id}`),{supabaseUrl:'https://db.invalid',anonKey:'public-fixture',publicOrigin:'https://example.invalid'},async()=>Response.json(raw));assert.notEqual(res.status,200);assert.doesNotMatch(await res.text(),/PRIVATE/);}
});
test('public opt-in office and same-origin signed logo render; foreign signing URL is omitted',async()=>{
 const path=`${id}/logos/${id}.jpg`;
 for(const foreign of [false,true]){
  const res=await handleAgencyProfile(new Request(`https://example.invalid/agency/${id}`),{supabaseUrl:'https://db.invalid',anonKey:'public-fixture',publicOrigin:'https://example.invalid'},async(url)=>String(url).includes('/rpc/')?Response.json({...profile,logoPath:path,officeAddress:'Oficina pública'}):Response.json({signedURL:foreign?'https://foreign.invalid/image.jpg':`/object/sign/agency-assets/${path}?token=synthetic`}));
  const html=await res.text();assert.equal(res.status,200);assert.match(html,/Oficina pública/);assert.equal(html.includes('<img'),!foreign);assert.doesNotMatch(html,/foreign.invalid/);
 }
});
