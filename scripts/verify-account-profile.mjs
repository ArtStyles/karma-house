import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';

const env=path=>Object.fromEntries(readFileSync(new URL(path,import.meta.url),'utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const config=env('../infra/.env.local'),publicConfig=env('../.env.local');
const origin=config.SUPABASE_URL.replace(/\/$/,'');
const db=createDatabaseClient(),users=[],paths=[],checks=[];
const runId=`account-verify-${randomUUID()}`;
let stage='connect',failure,baseline,cleanup;
const pass=label=>checks.push(label);
async function request(path,{method='GET',actor,admin=false,body,headers={}}={}) {
  const key=admin?config.SUPABASE_SECRET_KEY:publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(30000),headers:{apikey:key,...(actor||admin?{Authorization:`Bearer ${actor?.token??key}`} :{}),...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  const raw=await response.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
  return {ok:response.ok,status:response.status,data};
}
function ok(result,label){assert(result.ok,`${label}: HTTP ${result.status} (${result.data?.code??result.data?.error_code??'failed'})`);return result.data;}
function denied(result,label,code){assert(!result.ok,`${label}: unexpected permission`);if(code)assert(String(result.data?.message).includes(code),`${label}: wrong rejection ${result.data?.code??result.status}`);pass(label);}
const rpc=(actor,name,args={})=>request(`/rest/v1/rpc/${name}`,{method:'POST',actor,body:{p_actor_id:actor.id,...args}});
const get=actor=>rpc(actor,'kh_get_account_profile');
const update=(actor,args)=>rpc(actor,'kh_update_account_profile',args);
const sign=(actor,path)=>request(`/storage/v1/object/sign/account-avatars/${path}`,{method:'POST',actor,body:{expiresIn:300}});
async function createUser(label){
  const email=`${runId}-${label}@example.invalid`,password=`Kh!${randomBytes(24).toString('base64url')}`;
  const created=ok(await request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true,user_metadata:{display_name:`QA ${label}`}}}),'synthetic account');
  const user={id:created.id,token:null};users.push(user);
  user.token=ok(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),'synthetic login').access_token;
  return user;
}
async function inventory(){
  const values={};
  for(const table of ['auth.users','public.profiles','public.properties','public.favorites','public.kh_admins','kh_private.admin_invites','kh_private.property_save_requests','storage.objects','kh_private.account_avatars','public.kh_conversations','public.kh_messages','public.kh_conversation_reads','public.kh_user_blocks','public.kh_message_reports']) values[table]=(await db.query(`select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from ${table} t`)).rows[0];
  return values;
}
try{
  await db.connect();baseline=await inventory();
  stage='auth';const owner=await createUser('owner'),other=await createUser('other');
  pass('Two isolated synthetic accounts authenticate');
  assert.equal(ok(await get(owner),'load initial profile').avatarPath,null);
  denied(await rpc(owner,'kh_get_account_profile',{p_actor_id:other.id}),'Captured actor cannot read another profile','KH_ACCOUNT_CHANGED');
  denied(await update(owner,{p_actor_id:other.id,p_display_name:'Wrong account'}),'Captured actor cannot mutate another profile','KH_ACCOUNT_CHANGED');
  denied(await request('/rest/v1/rpc/kh_get_account_profile',{method:'POST',body:{p_actor_id:owner.id}}),'Anonymous profile RPC denied');
  stage='storage';const photo=`${owner.id}/${randomUUID()}.jpg`;paths.push(photo);
  // A deterministic JPEG fixture; no user image is read or uploaded during this check.
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABQb/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCVABm/9k=','base64');
  ok(await request(`/storage/v1/object/account-avatars/${photo}`,{method:'POST',actor:owner,body:jpeg,headers:{'Content-Type':'image/jpeg','x-upsert':'false'}}),'own upload');
  pass('Owner uploads a JPEG to own immutable UUID path');
  const crossPath=`${owner.id}/${randomUUID()}.jpg`;paths.push(crossPath);
  denied(await request(`/storage/v1/object/account-avatars/${crossPath}`,{method:'POST',actor:other,body:jpeg,headers:{'Content-Type':'image/jpeg'}}),'Other account cannot upload in owner folder');
  const wrongMime=`${owner.id}/${randomUUID()}.jpg`;paths.push(wrongMime);
  denied(await request(`/storage/v1/object/account-avatars/${wrongMime}`,{method:'POST',actor:owner,body:Buffer.from('<svg/>'),headers:{'Content-Type':'image/svg+xml'}}),'Bucket rejects non-JPEG MIME');
  const oversized=`${owner.id}/${randomUUID()}.jpg`;paths.push(oversized);
  denied(await request(`/storage/v1/object/account-avatars/${oversized}`,{method:'POST',actor:owner,body:Buffer.alloc(1048577),headers:{'Content-Type':'image/jpeg'}}),'Bucket rejects files above one MiB');
  denied(await request(`/storage/v1/object/account-avatars/${photo}`,{method:'POST',actor:owner,body:jpeg,headers:{'Content-Type':'image/jpeg','x-upsert':'true'}}),'Existing avatar cannot be overwritten');
  stage='profile';
  const first=ok(await update(owner,{p_display_name:'  Nombre editado  ',p_avatar_path:photo,p_replace_avatar:true}),'attach photo');
  assert.equal(first.displayName,'Nombre editado');assert.equal(first.avatarPath,photo);
  assert.deepEqual(ok(await get(owner),'reload profile'),first);pass('Name and avatar survive independent RPC reload');
  assert.equal(ok(await update(owner,{p_display_name:'Solo nombre'}),'name-only update').avatarPath,photo);pass('Name-only change preserves the current photo');
  denied(await update(other,{p_display_name:'Other',p_avatar_path:photo,p_replace_avatar:true}),'Other account cannot attach the owner photo','KH_PROFILE_AVATAR');
  denied(await update(owner,{p_display_name:'x'}),'Invalid short name rejected','KH_PROFILE_NAME');
  denied(await request(`/rest/v1/profiles?id=eq.${owner.id}`,{method:'PATCH',actor:owner,body:{display_name:'Direct'}}),'Direct profile writes cannot bypass actor validation');
  assert.equal(ok(await request('/rest/v1/rpc/kh_is_admin',{method:'POST',actor:owner,body:{}}),'admin check'),false);pass('Profile editing confers no administrator role');
  stage='privacy';
  denied(await sign(other,photo),'Another account cannot sign owner photo');
  denied(await request(`/storage/v1/object/public/account-avatars/${photo}`),'Photo has no public URL');
  const signed=ok(await sign(owner,photo),'owner signed URL').signedURL;assert.equal(typeof signed,'string');
  const signedPath=signed.startsWith('/object/')?`/storage/v1${signed}`:signed;
  const imageResponse=await fetch(new URL(signedPath,origin),{signal:AbortSignal.timeout(30000)});assert(imageResponse.ok);assert.equal(imageResponse.headers.get('content-type')?.split(';')[0],'image/jpeg');
  assert.equal((await imageResponse.arrayBuffer()).byteLength,jpeg.length);pass('Owner signed URL loads the uploaded JPEG');
  const deleteAttached=await request('/storage/v1/object/account-avatars',{method:'DELETE',actor:owner,body:{prefixes:[photo]}});
  assert(!deleteAttached.ok||Array.isArray(deleteAttached.data)&&deleteAttached.data.length===0);ok(await sign(owner,photo),'attached photo survives attempted delete');pass('Referenced avatar cannot be deleted before unlinking');
  assert.equal(ok(await update(owner,{p_display_name:'Sin foto',p_avatar_path:null,p_replace_avatar:true}),'remove reference').avatarPath,null);
  ok(await request('/storage/v1/object/account-avatars',{method:'DELETE',actor:owner,body:{prefixes:[photo]}}),'remove unlinked photo');
  denied(await sign(owner,photo),'Unlinked and removed photo is no longer readable');
  assert.equal(ok(await get(owner),'reload removed photo').avatarPath,null);pass('Photo removal persists');
  console.log(JSON.stringify({result:'account_profile_rest_passed',count:checks.length,checks}));
}catch(error){failure={stage,message:error.message};process.exitCode=1;}
finally{
  try{
    const ids=users.map(user=>user.id);
    if(ids.length){
      const found=(await db.query("select name from storage.objects where bucket_id='account-avatars' and split_part(name,'/',1)=any($1::text[])",[ids])).rows;
      const prefixes=[...new Set([...paths,...found.map(row=>row.name)])];
      if(prefixes.length)ok(await request('/storage/v1/object/account-avatars',{method:'DELETE',admin:true,body:{prefixes}}),'synthetic avatar cleanup');
      for(const user of users)ok(await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',admin:true}),'synthetic user cleanup');
      const remaining=(await db.query("select (select count(*)::int from auth.users where id=any($1::uuid[])) as users,(select count(*)::int from public.profiles where id=any($1::uuid[])) as profiles,(select count(*)::int from kh_private.account_avatars where owner_id=any($1::uuid[])) as avatars,(select count(*)::int from storage.objects where bucket_id='account-avatars' and split_part(name,'/',1)=any($2::text[])) as objects",[ids,ids])).rows[0];
      assert(Object.values(remaining).every(n=>n===0),'Synthetic account fixtures remain');
      const after=await inventory();assert.deepEqual(after,baseline,'Existing account/catalog/chat data changed');
      cleanup={result:'account_profile_cleanup_verified',remaining,inventory:after};
    }else cleanup={result:'no_synthetic_accounts_created'};
  }catch(error){cleanup={result:'account_profile_cleanup_failed',message:error.message};process.exitCode=1;}
  await db.end();
  if(failure)console.error(JSON.stringify({result:'account_profile_rest_failed',...failure,completedChecks:checks}));
  console.log(JSON.stringify(cleanup));
}
