import test from 'node:test';import assert from 'node:assert/strict';
import {handleAgencyProfile} from '../web/api/agency.ts';
import {mkdtemp,mkdir,readFile,readdir,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,dirname,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const id='45000000-0000-4000-8000-000000000001';
const profile={agencyId:id,tradeName:'Casas <seguras> & "Tom\'s"',businessPhone:'+5351234567',province:'La Habana',municipality:'Plaza',serviceAreas:['Vedado'],description:'Servicios públicos de una agencia aprobada.',logoPath:null,verified:true};
test('public commercial page uses anon RPC, escapes fields and never renders excluded office',async()=>{
 const calls:string[]=[];const res=await handleAgencyProfile(new Request(`https://example.invalid/agency/${id}`),{supabaseUrl:'https://db.invalid',anonKey:'public-fixture',publicOrigin:'https://example.invalid'},async(url,init)=>{calls.push(String(url));assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer public-fixture');return Response.json(profile);});
 const html=await res.text();assert.equal(res.status,200);assert.match(html,/Casas &lt;seguras&gt;/);assert.match(html,/5351234567/);assert.doesNotMatch(html,/Dirección de oficina/);assert.equal(calls.length,1);
});
test('emitted WEB-only JavaScript package serves agency and listing GET without source TS or loaders',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kh-web-profile-'));
 try{
  // Emit real web function sources; keep import specifiers as emitted by the
  // TypeScript compiler, so a stale .ts import fails under the Node ESM loader.
  for(const folder of ['api','lib']){
   const sources=await readdir(join('web',folder),{recursive:true}).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
   for(const source of sources.filter(path=>path.endsWith('.ts')&&!path.endsWith('.d.ts'))){
    const path=join(folder,source),output=join(dir,path.replace(/\.ts$/,'.js'));
    const emitted=ts.transpileModule(await readFile(join('web',path),'utf8'),{fileName:path,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
    await mkdir(dirname(output),{recursive:true});await writeFile(output,emitted.outputText);
   }
  }
  await writeFile(join(dir,'package.json'),JSON.stringify({type:'module'}));
  for(const path of ['src','node_modules'])await assert.rejects(access(join(dir,path)));
  assert.ok((await readdir(dir,{recursive:true})).every(path=>!path.endsWith('.ts')));
  const code=`
   import assert from 'node:assert/strict';
   import {GET} from './api/agency.js';
   import {GET as listingGET} from './api/p.js';
   const profile=${JSON.stringify(profile)};
   const request=new Request('https://example.invalid/agency/${id}');
   globalThis.fetch=async()=>Response.json(profile);
   const response=await GET(request);
   assert.equal(response.status,200);
   const html=await response.text();
   assert.ok(html.includes('Casas &lt;seguras&gt; &amp; &quot;Tom&#39;s&quot;'));
   assert.ok(html.includes('✓ Inmobiliaria verificada por KarmaHouse'));console.log(html);
   globalThis.fetch=async()=>Response.json({...profile,verified:false});
   const unverified=await GET(request);
   assert.equal(unverified.status,200);assert.doesNotMatch(await unverified.text(),/✓ Inmobiliaria verificada/);
   globalThis.fetch=async()=>Response.json(null);
   assert.equal((await GET(request)).status,404);
   globalThis.fetch=async()=>Response.json({...profile,responsibleFullName:'PRIVATE'});
   const privateResponse=await GET(request);
   assert.equal(privateResponse.status,503);assert.doesNotMatch(await privateResponse.text(),/PRIVATE/);
   assert.equal((await listingGET(new Request('https://example.invalid/p/not-a-uuid'))).status,404);
   delete process.env.SUPABASE_ANON_KEY;
   assert.equal((await GET(request)).status,503);
  `;
  // No inherited NODE_OPTIONS, TS loaders, credentials or source-tree modules.
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:dir,encoding:'utf8',env:{SystemRoot:process.env.SystemRoot,SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'synthetic'},timeout:10000});
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
