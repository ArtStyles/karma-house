// Disposable loopback UI harness. Business RPC/RLS is real PostgreSQL; Auth,
// email confirmation and image delivery are explicitly synthetic providers.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,readdir,mkdir,unlink} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client,Pool} from 'pg';
import {migrationArtifacts} from './agency-activation.mjs';
import {createAgencyLocaleClone} from './local-sql/agency-locale-clone.mjs';

const SOURCE='postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const task=process.env.KH_AGENCY_UI_TASK??'14';assert.ok(['14','15'].includes(task),'Unknown fixture owner');
const RECEIPT=resolve(ROOT,`.superpowers/sdd/2026-10-07-agency-closure-release/task-${task}-fixture-receipt.json`);
const ENV=resolve(ROOT,'.env.local'),ORIGIN='http://127.0.0.1:56434';
const config=`EXPO_PUBLIC_SUPABASE_URL=${ORIGIN}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-local-agency-fixture-only\n`;
const hash=value=>createHash('sha256').update(value).digest('hex');
export function assertFixtureTarget(value){assert.equal(value,SOURCE,'Explicit approved KH_LOCAL_DATABASE_URL required');return new URL(value);}
export function fixturePage(params){const offset=Number(params.get('offset')??0),limit=Number(params.get('limit')??100);assert.ok(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=200,'Invalid synthetic REST page');return {offset,limit};}
export function assertFixtureReceipt(value){
 assert.equal(value.kind,'agency-ui-synthetic-v1');assertFixtureTarget(value.source);
 assert.match(value.database,/^kh_agency_test_legacy_[a-f0-9]{32}$/);
 assert.match(value.runId,/^[a-f0-9-]{36}$/);assert.equal(value.origin,ORIGIN);
 assert.ok(Number.isSafeInteger(value.pid)&&value.pid>0);assert.match(value.controlToken,/^[a-f0-9]{64}$/);return value;
}
async function optional(path){try{return await readFile(path)}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function inventory(db){
 const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by schemaname collate \"C\",tablename collate \"C\"")).rows;
 const result=[];for(const {schemaname,tablename}of tables){const q=v=>'"'+v.replaceAll('"','""')+'"';const state=(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from ${q(schemaname)}.${q(tablename)} t`)).rows[0];result.push({schemaname,tablename,...state});}return result;
}
async function main(action){
 const source=assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
 if(!['setup','status','cleanup'].includes(action))throw Error('Use setup | status | cleanup; setup never resumes an existing receipt');
 if(action!=='setup'){
  const receipt=assertFixtureReceipt(JSON.parse(await readFile(RECEIPT,'utf8')));
  if(receipt.state==='cleaned'){console.log(JSON.stringify(receipt));return;}
  const result=await fetch(`${receipt.origin}/__fixture/${action}`,{method:'POST',headers:{'x-fixture-control':receipt.controlToken}});
  const value=await result.json();if(!result.ok)throw Error(JSON.stringify(value));console.log(JSON.stringify(value));return;
 }
 await mkdir(dirname(RECEIPT),{recursive:true});
 const receipt={kind:'agency-ui-synthetic-v1',protocolVersion:2,source:source.href,runId:randomUUID(),origin:ORIGIN,pid:process.pid,controlToken:randomBytes(32).toString('hex'),state:'preparing',startedAt:new Date().toISOString(),uuids:[],actors:{},properties:{},calls:[],config:{path:ENV,previous:(await optional(ENV))?.toString('base64')??null,installedHash:hash(config)}};
 // Exclusive ownership: even a cleaned receipt must be archived deliberately.
 await writeFile(RECEIPT,JSON.stringify(receipt,null,2),{flag:'wx'});
 let receiptWrites=Promise.resolve();
 const persist=()=>{const data=JSON.stringify(receipt,null,2);receiptWrites=receiptWrites.then(()=>writeFile(RECEIPT,data));return receiptWrites;};
 const sourceDb=new Client({connectionString:source.href});await sourceDb.connect();
 let clone,pool,server,cleaning=false;
 const sessions=new Map(),refreshes=new Map(),signed=new Map();
 async function status(){
  const db=await pool.connect();try{return {kind:receipt.kind,runId:receipt.runId,state:receipt.state,database:receipt.database,origin:ORIGIN,actors:receipt.actors,properties:receipt.properties,agencies:receipt.agencies,
   persisted:(await db.query(`select jsonb_build_object('agencies',(select jsonb_agg(to_jsonb(a)) from kh_private.agencies a),'verifications',(select jsonb_agg(to_jsonb(a)) from kh_private.agency_verifications a),'memberships',(select jsonb_agg(to_jsonb(a)) from kh_private.agency_memberships a),'properties',(select jsonb_agg(jsonb_build_object('id',id,'title',title,'moderation',moderation,'availability',availability,'version',version)) from public.properties)) value`)).rows[0].value,
   calls:receipt.calls,inventory:await inventory(db)}}finally{db.release()}
 }
 async function cleanup(){
  if(cleaning)throw Error('Cleanup already running');cleaning=true;
  try{
   if(receipt.config.installed){const current=await optional(ENV);assert.ok(current&&hash(current)===receipt.config.installedHash,'Config changed externally: refusing overwrite');if(receipt.config.previous===null)await unlink(ENV);else await writeFile(ENV,Buffer.from(receipt.config.previous,'base64'));receipt.config.restored=true;}
   if(pool){receipt.finalStatus=await status();await pool.end();pool=null;}
   if(clone){await clone.cleanup();receipt.databaseDropped=true;}
   assert.deepEqual(await inventory(sourceDb),receipt.sourceBefore);receipt.sourceUnchanged=true;
   await sourceDb.end();receipt.state='cleaned';receipt.cleanedAt=new Date().toISOString();await persist();return {runId:receipt.runId,state:receipt.state,databaseDropped:receipt.databaseDropped,sourceUnchanged:true,configRestored:receipt.config.restored??false};
  }catch(e){cleaning=false;throw e;}
 }
 try{
  receipt.sourceBefore=await inventory(sourceDb);
  assert.equal((await sourceDb.query("select to_regclass('kh_private.agency_settings') t")).rows[0].t,null);
  clone=await createAgencyLocaleClone(source);receipt.database=clone.url.pathname.slice(1);await persist();
  pool=new Pool({connectionString:clone.url.href});const db=await pool.connect();
  try{
   assert.deepEqual(await inventory(db),receipt.sourceBefore);
   assert.equal((await db.query("select lower(U&'\\00c1') value")).rows[0].value,'á');
   const migrations=await migrationArtifacts();
   await db.query('create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);create table if not exists supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version),sha256 text not null,applied_at timestamptz default now())');
   for(const m of migrations){await db.query('begin');try{await db.query(m.sql);await db.query('insert into supabase_migrations.schema_migrations(version,statements,name)values($1,$2,$3)',[m.version,[m.sql],m.file.slice(15,-4)]);await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256)values($1,$2)',[m.version,m.sha256]);await db.query('commit')}catch(error){await db.query('rollback');throw error}}

   await db.query(`create or replace function kh_private.push_http_post(p_kind text,p_payload jsonb) returns bigint language plpgsql security definer set search_path='' as $$begin raise exception 'UI fixture prohibits provider transport';end$$;`);
   await db.query('begin');await db.query(await readFile(resolve(ROOT,'supabase/tests/helpers/agency_fixture.sql'),'utf8'));
   const actorRoles=['owner','coordinator-a','moderator','manager-a','manager-b','buyer-one','buyer-two','invitee','admin-a','admin-b'];
   for(const n of [9,10])await db.query('select pg_temp.kh_agency_signup($1)',[n]);
   receipt.agencies={};
   for(const [index,name]of actorRoles.entries()){
    const id=`45000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`;receipt.actors[name]={id,email:`${name}@example.invalid`};receipt.uuids.push(id);
    await db.query('update auth.users set email=$2 where id=$1',[id,`${name}@example.invalid`]);
    await db.query('update public.profiles set display_name=$2 where id=$1',[id,`Prueba ${name}`]);
   }
   for(const [letter,n]of [['A',9],['B',10]]){
    const actor=receipt.actors[`admin-${letter.toLowerCase()}`].id;
    const a=(await db.query('select agency_id from kh_private.agency_applications where responsible_id=$1',[actor])).rows[0].agency_id;
    receipt.agencies[letter]=a;receipt.uuids.push(a);await db.query('select pg_temp.kh_agency_approve($1)',[a]);
    await db.query('update kh_private.agencies set trade_name=$2 where id=$1',[a,`Inmobiliaria ${letter} · Prueba local`]);
   }
   for(const [letter,name,role]of [['A','coordinator-a','coordinator'],['A','manager-a','manager'],['B','manager-b','manager']])await db.query('insert into kh_private.agency_memberships(agency_id,user_id,role) values($1,$2,$3)',[receipt.agencies[letter],receipt.actors[name].id,role]);
   // Prepared drafts are fixture seeds, never counted as UI publication evidence.
   for(const title of ['Casa principal compartida','Casa para revisión inicial','Casa para retirar verificación']){
    const actor=receipt.actors['admin-a'].id,key=randomUUID(),path=`${actor}/${key}/photo.jpg`;
    await db.query('select pg_temp.kh_as($1)',[actor]);await db.query("insert into storage.objects(bucket_id,name) values('property-photos',$1)",[path]);
    const value=(await db.query('select public.kh_agency_save_property($1,$2,$3::jsonb) value',[actor,receipt.agencies.A,JSON.stringify({clientRequestId:key,sourceReference:`Origen sintético ${key}`,consentReference:'Autorización sintética registrada',publicationIntent:'draft',draft:{title,location:'Vedado',province:'La Habana',type:'Casa',price:30000,bedrooms:2,bathrooms:1,description:'Vivienda de prueba sintética con patio y habitaciones amplias. No es un anuncio comercial real.',photoPaths:[path]}})])).rows[0].value;
    receipt.properties[title]=value.property.id;receipt.uuids.push(value.property.id,key);
   }
   await db.query('commit');
  }catch(e){await db.query('rollback');throw e}finally{db.release()}
  async function withRole(actor,sessionId,work){const db=await pool.connect();try{await db.query('begin');await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role',$2::text,'session_id',$3::text)::text,true)",[actor??'',actor?'authenticated':'anon',sessionId??'']);await db.query(`set local role ${actor?'authenticated':'anon'}`);const result=await work(db);await db.query('commit');return result}catch(e){await db.query('rollback');throw e}finally{db.release()}}
  async function getUser(id){const row=(await pool.query('select id,email,email_confirmed_at,raw_user_meta_data from auth.users where id=$1',[id])).rows[0];return row?{id:row.id,email:row.email,email_confirmed_at:row.email_confirmed_at,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:row.raw_user_meta_data,created_at:receipt.startedAt}:null}
  async function session(id){const sid=randomUUID(),exp=Math.floor(Date.now()/1000)+3600,token=`${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,session_id:sid,exp})).toString('base64url')}.synthetic`,refresh=randomUUID();await pool.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour')",[sid,id]);sessions.set(token,{id,sid});refreshes.set(refresh,id);receipt.uuids.push(sid);await persist();return {access_token:token,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:exp,user:await getUser(id)}}
  server=createServer(async(req,res)=>{
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');res.setHeader('Cache-Control','no-store');
   if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),url=new URL(req.url,ORIGIN),auth=sessions.get((req.headers.authorization??'').replace(/^Bearer /,'')),actor=auth?.id;
   const json=(value,statusCode=200)=>{res.writeHead(statusCode,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
   try{
    const body=raw.length&&(req.headers['content-type']??'').includes('application/json')?JSON.parse(raw.toString()):{};
    if(url.pathname.startsWith('/__fixture/')){
     if(req.headers['x-fixture-control']!==receipt.controlToken)return json({message:'Receipt control required'},403);
     if(url.pathname==='/__fixture/status')return json(await status());
     if(url.pathname==='/__fixture/cleanup'){json(await cleanup());server.close();return;}
     // Explicit provider test operations, recorded separately from UI actions.
     if(url.pathname==='/__fixture/confirm-email'){assert.ok(receipt.uuids.includes(body.userId));await pool.query('update auth.users set email_confirmed_at=now() where id=$1',[body.userId]);receipt.calls.push({kind:'synthetic-email-confirmation',userId:body.userId,at:new Date().toISOString()});await persist();return json({confirmed:true})}
     return json({message:'Unknown control'},404);
    }
    if(url.pathname==='/auth/v1/token'){
     if(url.searchParams.get('grant_type')==='refresh_token'){const id=refreshes.get(body.refresh_token);return id?json(await session(id)):json({msg:'Expired synthetic session'},401)}
     const row=(await pool.query('select id,email_confirmed_at from auth.users where email=$1',[body.email])).rows[0];
     if(!row||!receipt.uuids.includes(row.id)||body.password!=='Fixture123!')return json({msg:'Synthetic credentials only'},400);
     if(!row.email_confirmed_at)return json({msg:'Email not confirmed',error_code:'email_not_confirmed'},400);return json(await session(row.id));
    }
    if(url.pathname==='/auth/v1/signup'){
     if(!/^[a-z0-9.-]+@example\.invalid$/.test(body.email)||body.password!=='Fixture123!')return json({msg:'Fixture123! and example.invalid required'},400);
     const id=randomUUID();await pool.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,body.email,JSON.stringify(body.data??{})]);receipt.uuids.push(id);receipt.actors[body.email]={id,email:body.email};receipt.calls.push({kind:'synthetic-signup',id,email:body.email,at:new Date().toISOString()});await persist();return json(await getUser(id));
    }
    if(url.pathname==='/auth/v1/user')return actor?json(await getUser(actor)):json({msg:'Missing synthetic session'},401);
    if(url.pathname==='/auth/v1/logout'){if(auth){await pool.query('delete from auth.sessions where id=$1',[auth.sid]);sessions.delete((req.headers.authorization??'').replace(/^Bearer /,''))}res.writeHead(204);return res.end()}
    if(url.pathname.startsWith('/rest/v1/rpc/')){
     const name=url.pathname.split('/').at(-1),keys=Object.keys(body);assert.match(name,/^kh_[a-z_]+$/);for(const k of keys)assert.match(k,/^p_[a-z_]+$/);
     const entry={kind:'browser-rpc',actor:actor??null,name,args:body,at:new Date().toISOString()};
     try{const value=await withRole(actor,auth?.sid,async db=>(await db.query(`select public."${name}"(${keys.map((k,n)=>`"${k}"=>$${n+1}`).join(',')}) result`,keys.map(k=>typeof body[k]==='object'&&body[k]!==null?JSON.stringify(body[k]):body[k]))).rows[0].result);entry.result=value;receipt.calls.push(entry);await persist();return json(value)}catch(e){entry.error={message:e.message,code:e.code};receipt.calls.push(entry);await persist();throw e}
    }
    if(url.pathname.startsWith('/storage/v1/object/sign/')){
     if(req.method==='GET'){const item=signed.get(url.searchParams.get('token'));if(!item||item.expires<Date.now()||url.pathname!==item.pathname)return json({message:'Expired synthetic URL'},403);res.writeHead(200,{'Content-Type':'image/png'});return res.end(await readFile(resolve(ROOT,'assets/images/vedado-demo.png')))}
     const tail=url.pathname.slice('/storage/v1/object/sign/'.length),bucket=tail.split('/')[0],paths=body.paths??[tail.slice(bucket.length+1)];
     const rows=await withRole(actor,auth?.sid,async db=>(await db.query('select name from storage.objects where bucket_id=$1 and name=any($2::text[])',[bucket,paths])).rows);
     const output=paths.map(path=>{if(!rows.some(r=>r.name===path))return {path,error:'Not authorized',signedURL:null};const token=randomUUID(),pathname=`/storage/v1/object/sign/${bucket}/${path}`;signed.set(token,{pathname,expires:Date.now()+Math.min(body.expiresIn??300,3600)*1000});return {path,signedURL:`/object/sign/${bucket}/${path}?token=${token}`}});return json(body.paths?output:output[0]);
    }
    if(/^\/rest\/v1\/(properties|favorites)$/.test(url.pathname)&&req.method==='GET'){
     const table=url.pathname.split('/').at(-1),allowed=table==='properties'?['id','owner_id','moderation','availability']:['user_id','property_id'],filters=[],values=[];
     for(const [key,value]of url.searchParams){if(!allowed.includes(key))continue;assert.ok(value.startsWith('eq.')||value.startsWith('in.('));const many=value.startsWith('in.(');values.push(many?value.slice(4,-1).split(',').map(v=>v.replaceAll('"','')):value.slice(3));filters.push(many?`"${key}"=any($${values.length})`:`"${key}"=$${values.length}`)}
     const {offset,limit}=fixturePage(url.searchParams);
     const rows=await withRole(actor,auth?.sid,async db=>(await db.query(`select * from public.${table}${filters.length?' where '+filters.join(' and '):''} order by ${table==='properties'?'created_at desc,id':'property_id'} limit ${limit} offset ${offset}`,values)).rows);return json(rows);
    }
    return json({message:`Unsupported synthetic endpoint: ${req.method} ${url.pathname}`},404);
   }catch(e){return json({message:e.message,code:e.code??'FIXTURE_ERROR'},400)}
  });
  await new Promise((done,fail)=>{server.once('error',fail);server.listen(56434,'127.0.0.1',done)});
  await writeFile(ENV,config);receipt.config.installed=true;receipt.state='ready';await persist();console.log(JSON.stringify({state:'ready',origin:ORIGIN,receipt:RECEIPT,actors:receipt.actors,agencies:receipt.agencies,properties:receipt.properties,password:'Fixture123!',evidence:'real SQL/RLS; synthetic Auth/email/images'}));
 }catch(e){receipt.error=e.message;await persist();await cleanup().catch(error=>console.error('CLEANUP FAILED',error.message));throw e}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main(process.argv[2]);
