import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { createDatabaseClient } from './cloud-db.mjs';
const readEnv=path=>Object.fromEntries(readFileSync(new URL(path,import.meta.url),'utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const privateConfig=readEnv('../infra/.env.local');
const publicConfig=readEnv('../.env.local');
const origin=privateConfig.SUPABASE_URL.replace(/\/$/,'');
const db=createDatabaseClient();
const users=[];const paths=[];const checks=[];
const runId=`chat-verify-${randomUUID()}`;
let stage='connect',failure,baseline,cleanup;
const pass=label=>checks.push(label);
async function request(path,{method='GET',actor,admin=false,body,headers={}}={}){
  const key=admin?privateConfig.SUPABASE_SECRET_KEY:publicConfig.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(30000),headers:{apikey:key,...(actor||admin?{Authorization:`Bearer ${actor?.token??key}`} :{}),'User-Agent':'KarmaHouse-Messaging-QA/1.0',...(body&&!Buffer.isBuffer(body)?{'Content-Type':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?body:JSON.stringify(body)});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text}
  return {ok:response.ok,status:response.status,data};
}
function ok(result,label){assert(result.ok,`${label}: HTTP ${result.status} (${result.data?.code??result.data?.error_code??'failed'})`);return result.data;}
function denied(result,label,code){assert(!result.ok,`${label}: unexpected permission`);if(code)assert(String(result.data?.message).includes(code),`${label}: wrong rejection ${result.data?.code??result.status}`);pass(label);}
const rpc=(actor,name,args={})=>request(`/rest/v1/rpc/${name}`,{method:'POST',actor,body:{...args,p_actor_id:actor?.id}});
const send=(actor,id,clientId,body)=>rpc(actor,'kh_send_message',{p_conversation_id:id,p_client_message_id:clientId,p_body:body});
async function createUser(role){
  const email=`${runId}-${role}@example.invalid`;const password=`Kh!${randomBytes(24).toString('base64url')}`;
  const created=ok(await request('/auth/v1/admin/users',{method:'POST',admin:true,body:{email,password,email_confirm:true,user_metadata:{display_name:`QA ${role}`}}}),'create synthetic account');
  const user={id:created.id,role,email,password,token:null};users.push(user);
  const session=ok(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}),'synthetic login');user.token=session.access_token;
  if(role==='reviewer')await db.query('insert into public.kh_admins(user_id) values($1)',[user.id]);
  return user;
}
async function inventory(){
  const result={};
  for(const [schema,table] of [['public','profiles'],['public','properties'],['public','favorites'],['public','kh_admins'],['kh_private','admin_invites'],['kh_private','property_save_requests'],['storage','objects'],...['kh_conversations','kh_messages','kh_conversation_reads','kh_user_blocks','kh_message_reports'].map(table=>['public',table])]){
    result[`${schema}.${table}`]=(await db.query(`select count(*)::int as count,md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text)::text,'[]')) as digest from ${schema}.${table} t`)).rows[0];
  }
  return result;
}
try{
  await db.connect();baseline=await inventory();
  stage='auth';
  const seller=await createUser('seller'),buyer=await createUser('buyer'),outsider=await createUser('outsider'),admin=await createUser('reviewer');
  pass('Four synthetic confirmed accounts authenticate without SMTP');
  stage='property';
  const photo=`${seller.id}/${runId}/photo.png`;paths.push(photo);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1QAAAAASUVORK5CYII=','base64');
  ok(await request(`/storage/v1/object/property-photos/${photo}`,{method:'POST',actor:seller,body:png,headers:{'Content-Type':'image/png','x-upsert':'false'}}),'synthetic property photo upload');
  const property=ok(await request('/rest/v1/rpc/kh_save_property',{method:'POST',actor:seller,body:{p_payload:{ownerId:seller.id,clientRequestId:runId,title:'Casa temporal para chat',location:'Vedado',province:'La Habana',type:'Casa',price:50000,area:80,bedrooms:2,bathrooms:1,description:'Anuncio sintético aislado para verificar mensajería.',amenities:[],photoPaths:[photo],moderation:'pending'}}}),'save synthetic property');
  denied(await rpc(buyer,'kh_start_conversation',{p_property_id:property.id}),'Pending listing cannot start chat','KH_CHAT_PROPERTY_UNAVAILABLE');
  ok(await request('/rest/v1/rpc/kh_review_property',{method:'POST',actor:admin,body:{p_id:property.id,p_decision:'approved',p_note:null,p_expected_version:1}}),'approve synthetic property');
  denied(await rpc(seller,'kh_start_conversation',{p_property_id:property.id}),'Seller cannot contact self','KH_CHAT_SELF_CONTACT');
  stage='conversation';
  const starts=await Promise.all([rpc(buyer,'kh_start_conversation',{p_property_id:property.id}),rpc(buyer,'kh_start_conversation',{p_property_id:property.id})]);
  const conversation=ok(starts[0],'start conversation');assert.equal(ok(starts[1],'concurrent start retry').id,conversation.id);pass('Concurrent start produces one conversation');
  const conversationId=conversation.id;
  assert.equal(ok(await rpc(buyer,'kh_list_conversations'),'buyer inbox').length,1);
  assert.equal(ok(await rpc(seller,'kh_list_conversations'),'seller empty inbox').length,0);pass('Only buyer sees a conversation with no messages');
  assert.equal(conversation.otherName,'QA seller');assert.equal(conversation.propertyTitle,'Casa temporal para chat');assert.equal(conversation.unreadCount,0);
  pass('Conversation contract contains participant public name and property snapshot');
  denied(await request('/rest/v1/kh_messages',{method:'POST',actor:buyer,body:{conversation_id:conversationId,sender_id:buyer.id,client_message_id:randomUUID(),seq:1,body:'Direct'}}),'Direct message mutation denied');
  denied(await request('/rest/v1/kh_conversations',{method:'PATCH',actor:buyer,body:{last_seq:999}}),'Direct conversation mutation denied');
  stage='actor_checks';
  const actorCases=[
    ['kh_start_conversation',{p_property_id:property.id}],['kh_list_conversations',{}],['kh_get_conversation',{p_conversation_id:conversationId}],
    ['kh_list_messages',{p_conversation_id:conversationId}],['kh_send_message',{p_conversation_id:conversationId,p_client_message_id:randomUUID(),p_body:'Actor test'}],
    ['kh_find_sent_messages',{p_client_message_ids:[]}],['kh_mark_conversation_read',{p_conversation_id:conversationId,p_last_seq:0}],
    ['kh_set_user_block',{p_other_user_id:seller.id,p_blocked:true}],['kh_report_conversation',{p_conversation_id:conversationId,p_client_report_id:randomUUID(),p_reason:'spam',p_details:''}],
    ['kh_list_message_reports',{}],['kh_review_message_report',{p_report_id:randomUUID(),p_note:''}],
  ];
  for(const [name,args] of actorCases)denied(await request(`/rest/v1/rpc/${name}`,{method:'POST',actor:buyer,body:{...args,p_actor_id:seller.id}}),`${name} rejects retained request from another actor`,'KH_ACCOUNT_CHANGED');
  stage='messages';
  const firstId=randomUUID();const body='Hola, me interesa esta vivienda.';
  const sends=await Promise.all([send(buyer,conversationId,firstId,body),send(buyer,conversationId,firstId,body)]);
  const first=ok(sends[0],'send first message');assert.equal(ok(sends[1],'concurrent retry').id,first.id);assert.equal(first.seq,1);pass('Concurrent message retry returns one accepted message');
  denied(await send(buyer,conversationId,firstId,'Changed'),'Changed body with reused ID rejected','KH_CHAT_MESSAGE_CONFLICT');
  denied(await send(buyer,conversationId,randomUUID(),'a'.repeat(2001)),'Oversized body rejected','KH_CHAT_INVALID_MESSAGE');
  assert.equal(ok(await rpc(seller,'kh_list_conversations'),'seller inbox after message')[0].unreadCount,1);pass('First accepted message appears in seller inbox with one unread');
  ok(await send(seller,conversationId,randomUUID(),'Hola, puedo darte más detalles.'),'seller reply');
  const concurrent=await Promise.all([
    send(buyer,conversationId,randomUUID(),'Consulta A'),send(buyer,conversationId,randomUUID(),'Consulta B'),
    rpc(seller,'kh_mark_conversation_read',{p_conversation_id:conversationId,p_last_seq:1}),
  ]);concurrent.forEach((r,i)=>ok(r,`concurrent send/read ${i}`));
  const history=ok(await rpc(buyer,'kh_list_messages',{p_conversation_id:conversationId}),'history after race');assert.deepEqual(history.map(m=>m.seq),[1,2,3,4]);
  assert.equal(ok(await rpc(seller,'kh_get_conversation',{p_conversation_id:conversationId}),'unread after race').unreadCount,2);pass('Concurrent sends and bounded read preserve sequence and new unreads');
  stage='privacy';
  for(const actor of [outsider,admin]){
    assert.equal(ok(await request(`/rest/v1/kh_messages?conversation_id=eq.${conversationId}&select=*`,{actor}),'RLS messages').length,0);
    denied(await rpc(actor,'kh_list_messages',{p_conversation_id:conversationId}),`${actor.role} cannot read private history via RPC`,'KH_CHAT_NOT_FOUND');
  }
  pass('Admin has no blanket private-message access');
  denied(await request('/rest/v1/rpc/kh_list_conversations',{method:'POST',body:{p_actor_id:buyer.id}}),'Anonymous RPC access denied');
  assert.equal(ok(await rpc(outsider,'kh_find_sent_messages',{p_client_message_ids:[firstId]}),'outsider ACK lookup').length,0);pass('ACK lookup is scoped to original sender');
  stage='global_block';
  const secondPropertyId=randomUUID();
  await db.query("insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values($1,$2,$3,'Segunda casa temporal','Vedado','La Habana','Casa','Segunda propiedad temporal para comprobar bloqueo global.',40000,80,2,1,$4,'approved')",[secondPropertyId,seller.id,`${runId}-2`,[photo]]);
  const second=ok(await rpc(buyer,'kh_start_conversation',{p_property_id:secondPropertyId}),'second conversation');
  ok(await rpc(buyer,'kh_set_user_block',{p_other_user_id:seller.id,p_blocked:true}),'buyer blocks seller');
  denied(await send(seller,second.id,randomUUID(),'Global block'),'Block applies to other property conversation','KH_CHAT_BLOCKED');
  denied(await send(buyer,conversationId,randomUUID(),'Blocked'),'Blocking sender also cannot send','KH_CHAT_BLOCKED');
  assert.equal(ok(await send(buyer,conversationId,firstId,body),'ACK after block').id,first.id);pass('Accepted message ACK survives later block');
  ok(await rpc(seller,'kh_set_user_block',{p_other_user_id:buyer.id,p_blocked:false}),'cannot undo someone else block');
  denied(await send(seller,conversationId,randomUUID(),'Still blocked'),'Other party cannot remove existing block','KH_CHAT_BLOCKED');
  assert.equal(ok(await rpc(buyer,'kh_list_messages',{p_conversation_id:conversationId}),'blocked history').length,4);pass('Blocked history remains readable');
  ok(await rpc(buyer,'kh_set_user_block',{p_other_user_id:seller.id,p_blocked:false}),'unblock');
  ok(await send(seller,second.id,randomUUID(),'Mensaje después de desbloquear.'),'message after unblock');pass('Own unblock restores pair messaging');
  stage='availability';
  ok(await request('/rest/v1/rpc/kh_set_property_status',{method:'POST',actor:seller,body:{p_id:property.id,p_status:'paused'}}),'pause property');
  denied(await send(buyer,conversationId,randomUUID(),'Paused'),'Unavailable listing freezes new messages','KH_CHAT_PROPERTY_UNAVAILABLE');
  assert.equal(ok(await send(buyer,conversationId,firstId,body),'ACK after pause').id,first.id);pass('Accepted ACK and history survive property pause');
  await db.query("update public.properties set title='Título privado posterior',moderation='pending' where id=$1",[property.id]);
  const unavailable=ok(await rpc(buyer,'kh_get_conversation',{p_conversation_id:conversationId}),'private title snapshot');assert.equal(unavailable.propertyTitle,'Casa temporal para chat');assert.equal(unavailable.canSend,false);pass('Conversation snapshot never reveals subsequent private listing edits');
  await db.query("update public.properties set availability='active',moderation='approved' where id=$1",[property.id]);
  stage='pagination_and_reports';
  await db.query("insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at) select $1,$2,gen_random_uuid(),n,'Contexto temporal '||n,now()-interval '2 hours'+n*interval '1 second' from generate_series(5,65)n",[conversationId,buyer.id]);
  await db.query('update public.kh_conversations set last_seq=65 where id=$1',[conversationId]);
  const recent=ok(await rpc(buyer,'kh_list_messages',{p_conversation_id:conversationId}),'latest page');assert.equal(recent.length,50);assert.equal(recent[0].seq,16);assert.equal(recent.at(-1).seq,65);
  const older=ok(await rpc(buyer,'kh_list_messages',{p_conversation_id:conversationId,p_before_seq:16}),'older page');assert.equal(older.length,15);assert.equal(older[0].seq,1);assert.equal(older.at(-1).seq,15);pass('Exclusive message paging has no overlap or loss');
  assert.equal(ok(await rpc(buyer,'kh_find_sent_messages',{p_client_message_ids:[firstId]}),'old ACK reconciliation')[0].id,first.id);pass('Lost ACK is found outside latest fifty messages');
  const clientReportId=randomUUID();const reportArgs={p_conversation_id:conversationId,p_client_report_id:clientReportId,p_reason:'spam',p_details:'Reporte temporal de verificación.'};
  const reportId=ok(await rpc(buyer,'kh_report_conversation',reportArgs),'submit report');assert.equal(ok(await rpc(buyer,'kh_report_conversation',reportArgs),'retry report'),reportId);pass('Report persists once with stable retry identifier');
  denied(await rpc(buyer,'kh_report_conversation',{...reportArgs,p_reason:'fraud'}),'Changed report retry rejected','KH_CHAT_REPORT_CONFLICT');
  denied(await rpc(buyer,'kh_list_message_reports'),'Ordinary user cannot read report queue','KH_ADMIN_REQUIRED');
  const report=ok(await rpc(admin,'kh_list_message_reports'),'admin queue').find(r=>r.id===reportId);assert(report);assert.equal(report.context.length,20);assert.equal(report.context[0].seq,46);assert.equal(report.context.at(-1).seq,65);pass('Admin gets actual last twenty server messages in ascending snapshot');
  await db.query("update public.kh_messages set body='Edited fixture after report' where conversation_id=$1 and seq=65",[conversationId]);
  const preserved=ok(await rpc(admin,'kh_list_message_reports'),'snapshot after source change').find(r=>r.id===reportId);assert.deepEqual(preserved.context,report.context);pass('Report evidence survives later source changes');
  await db.query('insert into public.kh_admins(user_id) values($1)',[buyer.id]);
  denied(await rpc(buyer,'kh_review_message_report',{p_report_id:reportId,p_note:'Self review'}),'Administrator involved in report cannot review it','KH_CHAT_CANNOT_REVIEW_OWN_REPORT');
  await db.query('delete from public.kh_admins where user_id=$1',[buyer.id]);
  ok(await rpc(admin,'kh_review_message_report',{p_report_id:reportId,p_note:'Revisado como prueba sintética.'}),'review report');
  ok(await rpc(admin,'kh_review_message_report',{p_report_id:reportId,p_note:'Revisado como prueba sintética.'}),'retry review');
  const reviewed=ok(await rpc(admin,'kh_list_message_reports',{p_status:'reviewed'}),'reviewed queue').find(r=>r.id===reportId);assert.equal(reviewed.status,'reviewed');assert.deepEqual(reviewed.context,report.context);pass('Review retry preserves evidence and reviewed state');
  console.log(JSON.stringify({result:'messaging_rest_passed',count:checks.length,checks}));
}catch(error){failure={stage,message:error.message};process.exitCode=1;}
finally{
  try{
    const ids=users.map(u=>u.id);
    if(ids.length){
      await db.query('delete from public.kh_message_reports where reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[])',[ids]);
      await db.query('delete from public.kh_conversations where buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[])',[ids]);
      await db.query('delete from public.properties where owner_id=any($1::uuid[])',[ids]);
      const objects=(await db.query("select name from storage.objects where bucket_id='property-photos' and split_part(name,'/',1)=any($1::text[])",[ids])).rows;
      const prefixes=[...new Set([...paths,...objects.map(o=>o.name)])];
      if(prefixes.length)ok(await request('/storage/v1/object/property-photos',{method:'DELETE',admin:true,body:{prefixes}}),'synthetic image cleanup');
      for(const user of users)ok(await request(`/auth/v1/admin/users/${user.id}`,{method:'DELETE',admin:true}),'synthetic account cleanup');
      const remaining=(await db.query(`select
        (select count(*)::int from auth.users where id=any($1::uuid[])) as users,
        (select count(*)::int from public.properties where owner_id=any($1::uuid[])) as properties,
        (select count(*)::int from public.kh_conversations where buyer_id=any($1::uuid[]) or seller_id=any($1::uuid[])) as conversations,
        (select count(*)::int from public.kh_messages where sender_id=any($1::uuid[])) as messages,
        (select count(*)::int from public.kh_message_reports where reporter_id=any($1::uuid[]) or reported_user_id=any($1::uuid[])) as reports,
        (select count(*)::int from public.kh_user_blocks where blocker_id=any($1::uuid[]) or blocked_id=any($1::uuid[])) as blocks,
        (select count(*)::int from public.kh_admins where user_id=any($1::uuid[])) as admins,
        (select count(*)::int from storage.objects where bucket_id='property-photos' and split_part(name,'/',1)=any($2::text[])) as photos`,[ids,ids])).rows[0];
      assert(Object.values(remaining).every(n=>n===0),'Synthetic messaging fixtures should all be removed');
      const after=await inventory();assert.deepEqual(after,baseline,'Existing catalog, roles, photos and messaging must remain unchanged');
      cleanup={result:'messaging_synthetic_cleanup_verified',remaining,inventory:after};
    }else cleanup={result:'no_synthetic_accounts_created'};
  }catch(error){cleanup={result:'messaging_cleanup_failed',message:error.message};process.exitCode=1;}
  await db.end();
  if(failure)console.error(JSON.stringify({result:'messaging_rest_failed',...failure,completedChecks:checks}));
  console.log(JSON.stringify(cleanup));
}
