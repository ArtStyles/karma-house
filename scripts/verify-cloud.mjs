import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';

function readEnv(path) {
  return Object.fromEntries(readFileSync(new URL(path, import.meta.url), 'utf8').split(/\r?\n/)
    .filter(line => /^[A-Z_]+=/.test(line)).map(line => [line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
}
const privateConfig = readEnv('../infra/.env.local');
const publicConfig = readEnv('../.env.local');
const origin = privateConfig.SUPABASE_URL.replace(/\/$/,'');
const publishableKey = publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = privateConfig.SUPABASE_SECRET_KEY;
if (!origin || !publishableKey || !secretKey) throw new Error('Required Supabase configuration is missing.');
const runId = `kh-verify-${randomUUID()}`;
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1QAAAAASUVORK5CYII=','base64');
const client = createDatabaseClient();
const testUsers = [];
const testPaths = [];
const syntheticEmails = [];
const checks = [];
let stage = 'connect';
let failure;
let cleanup;

async function request(path,{ method='GET',token,admin=false,body,headers={} }={}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: {
      apikey:admin ? secretKey : publishableKey,
      'User-Agent':'KarmaHouse-CloudVerification/1.0 (Node.js)',
      ...(token || admin ? { Authorization:`Bearer ${token ?? secretKey}` } : {}),
      ...(body && !Buffer.isBuffer(body) ? {'Content-Type':'application/json'} : {}),
      ...headers,
    },
    body:body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
  });
  const text=await response.text();
  let data;
  try { data=JSON.parse(text); } catch { data=text; }
  return {status:response.status,ok:response.ok,data};
}
function ok(result,label) {
  assert(result.ok,`${label}: HTTP ${result.status} (${result.data?.code ?? result.data?.error_code ?? result.data?.error ?? 'request failed'})`);
  return result.data;
}
function denied(result,label,message) {
  assert(!result.ok,`${label}: request was unexpectedly permitted`);
  if(message) assert(String(result.data?.message ?? result.data?.error).includes(message),`${label}: expected ${message}, got ${result.data?.code ?? result.status}`);
  checks.push(label);
}
function pass(label) { checks.push(label); }
const rpc=(actor,name,body)=>request(`/rest/v1/rpc/${name}`,{method:'POST',token:actor?.token,body:name==='kh_save_property' ? {p_payload:body} : body});
const objectPath=path=>`property-photos/${path.split('/').map(encodeURIComponent).join('/')}`;
async function login(user) {
  const session=ok(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:user.password}}),'password login');
  assert.equal(session.user.id,user.id);
  user.token=session.access_token;
}
async function createUser(label,admin=false) {
  const email=`${runId}-${label}@example.invalid`;
  syntheticEmails.push(email);
  if(admin) await client.query('insert into kh_private.admin_invites(email) values($1)',[email]);
  const password=`Kh!${randomBytes(24).toString('base64url')}`;
  const created=ok(await request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true,user_metadata:{display_name:`Verificación ${label}`}}}),'synthetic confirmed user creation');
  const user={id:created.id,email,password,token:null};
  assert(user.id,'Admin API should return a user id');
  testUsers.push(user);
  await login(user);
  return user;
}
async function queryProperty(actor,id) {
  return ok(await request(`/rest/v1/properties?id=eq.${id}&select=*`,{token:actor?.token}),'property query');
}
async function upload(actor,path) {
  testPaths.push(path);
  ok(await request(`/storage/v1/object/${objectPath(path)}`,{method:'POST',token:actor.token,body:imageBytes,headers:{'Content-Type':'image/png','x-upsert':'false'}}),'image upload');
}
async function remove(actor,path,admin=false) {
  return request('/storage/v1/object/property-photos',{method:'DELETE',token:actor?.token,admin,body:{prefixes:[path]}});
}
async function signed(actor,path) {
  return request(`/storage/v1/object/sign/${objectPath(path)}`,{method:'POST',token:actor?.token,body:{expiresIn:60}});
}
async function assertBytes(actor,path) {
  const value=ok(await signed(actor,path),'signed image access');
  const signedPath=value.signedURL ?? value.signedUrl;
  assert(signedPath,'Storage should return a signed path');
  const url=signedPath.startsWith('http') ? signedPath : `${origin}/storage/v1${signedPath}`;
  const response=await fetch(url,{headers:{'User-Agent':'KarmaHouse-CloudVerification/1.0 (Node.js)'}});
  assert(response.ok,'Signed image download should succeed');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),imageBytes,'Downloaded bytes should equal uploaded PNG');
}

try {
  await client.connect();
  stage='auth';
  const owner=await createUser('owner');
  const buyer=await createUser('buyer');
  const admin=await createUser('reviewer',true);
  pass('Three confirmed synthetic Auth accounts sign in without SMTP');
  assert.equal(ok(await rpc(owner,'kh_is_admin',{}),'owner role'),false);
  assert.equal(ok(await rpc(admin,'kh_is_admin',{}),'admin role'),true);
  pass('Only verified private-invitation account receives admin role');
  const profile=ok(await request(`/rest/v1/profiles?id=eq.${owner.id}&select=*`,{token:owner.token}),'owner profile');
  assert.equal(profile[0].display_name,'Verificación owner');
  assert(!('email' in profile[0]));
  pass('Public profile contains display name and no email');

  stage='storage_upload';
  const photo=`${owner.id}/${runId}/photo.png`;
  const unused=`${owner.id}/${runId}/unused.png`;
  await upload(owner,photo);
  await upload(owner,unused);
  await assertBytes(owner,photo);
  denied(await signed(buyer,photo),'Unreferenced private photo hidden from buyer');
  denied(await signed(null,photo),'Unreferenced private photo hidden from anonymous reader');
  const ownerInfo=await request(`/storage/v1/object/info/${objectPath(photo)}`,{token:owner.token});
  ok(ownerInfo,'owner upload retry info');
  pass('Owner can inspect uploaded object for retry recovery');
  denied(await request(`/storage/v1/object/${objectPath(photo)}`,{method:'POST',token:owner.token,body:imageBytes,headers:{'Content-Type':'image/png','x-upsert':'false'}}),'Duplicate upload cannot overwrite image');
  denied(await request(`/storage/v1/object/${objectPath(photo)}`,{method:'POST',token:owner.token,body:imageBytes,headers:{'Content-Type':'image/png','x-upsert':'true'}}),'Owner cannot upsert existing image');
  denied(await request(`/storage/v1/object/${objectPath(`${owner.id}/${runId}/attack.png`)}`,{method:'POST',token:buyer.token,body:imageBytes,headers:{'Content-Type':'image/png','x-upsert':'false'}}),'Buyer cannot upload to seller prefix');

  stage='pending_property';
  const payload={ownerId:owner.id,clientRequestId:runId,title:'Casa de verificación sintética',location:'Vedado',province:'La Habana',type:'Casa',price:'50000',area:'80',bedrooms:'2',bathrooms:'1',description:'Anuncio sintético temporal para comprobar permisos de la aplicación.',amenities:['Patio'],photoPaths:[photo],moderation:'pending',mapLocation:{latitude:23.13587,longitude:-82.395,precision:'approximate'}};
  denied(await rpc(owner,'kh_save_property',{...payload,mapLocation:{latitude:23,longitude:181,precision:'exact'}}),'Invalid map coordinate rejected through REST','KH_INVALID_MAP_LOCATION');
  denied(await rpc(buyer,'kh_save_property',{...payload,photoPaths:[]}), 'Account switch blocks cross-account create', 'KH_ACCOUNT_CHANGED');
  const initialSaves=await Promise.all([rpc(owner,'kh_save_property',payload),rpc(owner,'kh_save_property',payload)]);
  const property=ok(initialSaves[0],'save property');
  assert.equal(ok(initialSaves[1],'concurrent creation retry').id,property.id);
  pass('Simultaneous creation retries produce one property');
  assert.equal(property.version,1);
  assert.equal(property.moderation,'pending');
  assert.equal(property.latitude,23.14);
  assert.equal(property.longitude,-82.39);
  assert.equal(property.location_precision,'approximate');
  pass('Server rounds approximate input before returning it to the seller');
  assert.equal(ok(await rpc(owner,'kh_save_property',payload),'idempotent create').id,property.id);
  denied(await rpc(owner,'kh_save_property',{...payload,title:'Conflicting original request'}),'Changed creation retry cannot overwrite listing','KH_REQUEST_CONFLICT');
  assert.equal((await queryProperty(buyer,property.id)).length,0);
  assert.equal((await queryProperty(null,property.id)).length,0);
  denied(await signed(buyer,photo),'Pending image hidden from buyer');
  await assertBytes(admin,photo);
  pass('Pending property and photo only visible to owner and admin');
  denied(await request(`/rest/v1/properties?id=eq.${property.id}`,{method:'PATCH',token:owner.token,body:{moderation:'approved'}}),'Owner cannot self-approve by direct table mutation');
  denied(await request(`/rest/v1/properties?id=eq.${property.id}`,{method:'PATCH',token:buyer.token,body:{title:'Unauthorized change'}}),'Buyer cannot change seller listing');
  denied(await request('/rest/v1/kh_admins',{method:'POST',token:owner.token,body:{user_id:owner.id}}),'Client cannot self-assign admin');
  denied(await rpc(owner,'kh_review_property',{p_id:property.id,p_decision:'approved',p_note:null,p_expected_version:1}),'Owner cannot review listing','KH_ADMIN_REQUIRED');
  denied(await request('/rest/v1/favorites',{method:'POST',token:buyer.token,body:{user_id:buyer.id,property_id:property.id}}),'Buyer cannot favorite pending listing');
  ok(await remove(owner,photo),'attached photo deletion attempt');
  await assertBytes(owner,photo);
  pass('Storage API preserves attached photo against owner deletion');
  ok(await remove(buyer,photo),'buyer photo deletion attempt');
  await assertBytes(owner,photo);
  pass('Storage API preserves seller photo against buyer deletion');
  ok(await remove(owner,unused),'unused photo cleanup');
  denied(await signed(owner,unused),'Storage API deletes unattached owner photo');

  stage='approval_and_favorites';
  denied(await rpc(admin,'kh_review_property',{p_id:property.id,p_decision:'approved',p_note:null,p_expected_version:0}),'Stale admin review rejected','KH_VERSION_CONFLICT');
  ok(await rpc(admin,'kh_review_property',{p_id:property.id,p_decision:'approved',p_note:null,p_expected_version:1}),'admin approval');
  assert.equal((await queryProperty(null,property.id))[0]?.moderation,'approved');
  const publicMap=(await queryProperty(null,property.id))[0];
  assert.deepEqual([publicMap.latitude,publicMap.longitude,publicMap.location_precision],[23.14,-82.39,'approximate']);
  assert(!JSON.stringify(publicMap).includes('23.13587'));
  assert(!JSON.stringify(publicMap).includes('-82.395'));
  pass('Public REST row exposes rounded location and contains no exact approximate-input point');
  await assertBytes(null,photo);
  pass('Approved active property and actual PNG bytes visible anonymously');
  assert.equal(ok(await rpc(owner,'kh_save_property',payload),'creation retry after approval').moderation,'approved');
  pass('Creation retry preserves approval');
  ok(await request('/rest/v1/favorites',{method:'POST',token:buyer.token,body:{user_id:buyer.id,property_id:property.id}}),'buyer favorite');
  denied(await request('/rest/v1/favorites',{method:'POST',token:buyer.token,body:{user_id:owner.id,property_id:property.id}}),'Buyer cannot create another account favorite');
  const favoritesPath=`/rest/v1/favorites?property_id=eq.${property.id}&select=*`;
  assert.equal(ok(await request(favoritesPath,{token:owner.token}),'seller favorites').length,0);
  ok(await request('/auth/v1/logout',{method:'POST',token:buyer.token}),'buyer logout');
  await login(buyer);
  assert.equal(ok(await request(favoritesPath,{token:buyer.token}),'buyer favorites after sign in').length,1);
  pass('Favorite remains private and survives a new authenticated session');

  stage='availability_and_edit';
  ok(await rpc(owner,'kh_set_property_status',{p_id:property.id,p_status:'paused'}),'pause property');
  assert.equal((await queryProperty(null,property.id)).length,0);
  denied(await signed(null,photo),'Paused listing prevents new public signed photo URLs');
  assert.equal((await queryProperty(owner,property.id))[0]?.moderation,'approved');
  ok(await rpc(owner,'kh_set_property_status',{p_id:property.id,p_status:'active'}),'resume property');
  denied(await rpc(owner,'kh_save_property',{...payload,id:property.id,expectedVersion:1,title:'Stale title'}),'Stale seller edit rejected','KH_VERSION_CONFLICT');
  const edit={...payload,id:property.id,expectedVersion:4,title:'Casa sintética editada'};
  const edited=ok(await rpc(owner,'kh_save_property',edit),'edit property');
  assert.equal(edited.version,5);
  assert.equal(edited.moderation,'pending');
  assert.equal(ok(await rpc(owner,'kh_save_property',edit),'repeat identical edit').version,5);
  assert.equal((await queryProperty(buyer,property.id)).length,0);
  denied(await signed(buyer,photo),'Editing approved listing hides photos pending another review');
  assert.equal(ok(await request(favoritesPath,{token:buyer.token}),'hidden property favorite').length,1);
  pass('Content edit returns to review; retry is safe and favorite survives');
  ok(await rpc(admin,'kh_review_property',{p_id:property.id,p_decision:'approved',p_note:null,p_expected_version:5}),'approve edit');
  denied(await rpc(owner,'kh_save_property',edit),'Old edit retry cannot undo a later approval','KH_VERSION_CONFLICT');
  const replacement=`${owner.id}/${runId}/replacement.png`;
  await upload(owner,replacement);
  ok(await rpc(owner,'kh_save_property',{...edit,expectedVersion:6,photoPaths:[replacement]}),'replace photo');
  ok(await remove(owner,photo),'delete removed photo');
  denied(await signed(owner,photo),'Detached former listing photo can be removed');
  await assertBytes(owner,replacement);
  pass('Replacement image remains protected after detached image cleanup');
  stage='map_edits';
  const mappedEdit={...edit,expectedVersion:7,photoPaths:[replacement],mapLocation:{latitude:23.12345678,longitude:-82.12345678,precision:'exact'}};
  const exact=ok(await rpc(owner,'kh_save_property',mappedEdit),'exact location edit');
  assert.deepEqual([exact.latitude,exact.longitude,exact.location_precision,exact.version],[23.123457,-82.123457,'exact',8]);
  assert.equal(ok(await rpc(owner,'kh_save_property',mappedEdit),'exact location retry').version,8);
  pass('Exact location persists to six decimals and identical retry preserves version');
  const {mapLocation: _oldPoint,...legacyEdit}=mappedEdit;
  const preserved=ok(await rpc(owner,'kh_save_property',{...legacyEdit,expectedVersion:8,title:'Cliente antiguo conserva el mapa'}),'legacy edit with omitted map');
  assert.deepEqual([preserved.latitude,preserved.longitude,preserved.location_precision,preserved.version],[23.123457,-82.123457,'exact',9]);
  pass('Old client omission preserves previously saved coordinates');
  const removed=ok(await rpc(owner,'kh_save_property',{...mappedEdit,expectedVersion:9,mapLocation:null}),'remove map location');
  assert.deepEqual([removed.latitude,removed.longitude,removed.location_precision,removed.version],[null,null,null,10]);
  pass('Explicit null removes map coordinates through REST');
  console.log(JSON.stringify({result:'remote_rest_checks_passed',count:checks.length,checks}));
} catch(error) {
  failure={stage,message:error.message};
  process.exitCode=1;
} finally {
  try {
    // Only UUIDs created by this invocation are deleted. Storage bytes use the API.
    // Include unexpected test-prefix uploads too, so a failing authorization assertion
    // cannot leave its attempted object behind.
    if(testUsers.length) {
      const discovered=await client.query("select name from storage.objects where bucket_id='property-photos' and split_part(name,'/',1)=any($1::text[])",[testUsers.map(user=>user.id)]);
      for(const {name} of discovered.rows) if(!testPaths.includes(name)) testPaths.push(name);
    }
    if(testUsers.length) await client.query('delete from public.properties where owner_id=any($1::uuid[])',[testUsers.map(user=>user.id)]);
    for(const path of testPaths) ok(await remove(null,path,true),'synthetic image cleanup');
    for(const user of testUsers) ok(await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',admin:true}),'synthetic auth cleanup');
    if(syntheticEmails.length) await client.query('delete from kh_private.admin_invites where email=any($1::text[])',[syntheticEmails]);
    const remaining=(await client.query(`select
      (select count(*)::int from auth.users where id=any($1::uuid[])) as users,
      (select count(*)::int from public.properties where owner_id=any($1::uuid[])) as properties,
      (select count(*)::int from public.profiles where id=any($1::uuid[])) as profiles,
      (select count(*)::int from public.favorites where user_id=any($1::uuid[])) as favorites,
      (select count(*)::int from public.kh_admins where user_id=any($1::uuid[])) as admins,
      (select count(*)::int from storage.objects where bucket_id='property-photos' and name=any($2::text[])) as photos,
      (select count(*)::int from kh_private.admin_invites where email=any($3::text[])) as invites`,[testUsers.map(user=>user.id),testPaths,syntheticEmails])).rows[0];
    assert(Object.values(remaining).every(value=>value===0),'Synthetic fixtures should all be removed');
    cleanup={result:'synthetic_cleanup_verified',remaining};
  } catch(error) {
    cleanup={result:'cleanup_failed',message:error.message};
    process.exitCode=1;
  }
  await client.end();
  if(failure) console.error(JSON.stringify({result:'remote_rest_checks_failed',...failure,completedChecks:checks}));
  console.log(JSON.stringify(cleanup));
}
