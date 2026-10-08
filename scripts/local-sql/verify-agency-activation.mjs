import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {createAgencyLocaleClone} from './agency-locale-clone.mjs';
import {fixtureDatabaseUrl} from './agency-env.mjs';
import {migrationArtifacts,inventoryNames,schemaInventory,manifestFile,verifyAgencies,runAgencyCommand,disableAgencies} from '../agency-activation.mjs';
import {randomUUID} from 'node:crypto';
assert.ok(process.argv.slice(2).every(x=>x==='--record-manifest'));
const source=fixtureDatabaseUrl();assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
const baseline=new Client({connectionString:source.href});await baseline.connect();
async function inventory(db){const rows=(await db.query("select schemaname,tablename from pg_tables where schemaname in('public','kh_private','auth','storage') order by 1,2")).rows;const output=[];for(const {schemaname,tablename}of rows)output.push({schemaname,tablename,...(await db.query(`select count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,'|' order by to_jsonb(t)::text collate "C"),'')) hash from "${schemaname}"."${tablename}" t`)).rows[0]});return output}
const before=await inventory(baseline);let clone,db;
try{
 clone=await createAgencyLocaleClone(source);db=new Client({connectionString:clone.url.href});await db.connect();
 const migrations=await migrationArtifacts();
 for(const m of migrations)await db.query(m.sql);
 await db.query('create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,statements text[],name text);create table if not exists supabase_migrations.karmahouse_migration_checksums(version text primary key references supabase_migrations.schema_migrations(version),sha256 text not null,applied_at timestamptz default now())');
 for(const m of migrations){await db.query('insert into supabase_migrations.schema_migrations(version,statements,name)values($1,$2,$3)',[m.version,[m.sql],m.file.slice(15,-4)]);await db.query('insert into supabase_migrations.karmahouse_migration_checksums(version,sha256)values($1,$2)',[m.version,m.sha256]);}
 const names=inventoryNames(migrations),schema=await schemaInventory(db,names);
 if(process.argv.includes('--record-manifest')){
  const {profiles}=JSON.parse(await readFile(manifestFile,'utf8'));
  await writeFile(manifestFile,JSON.stringify({format:1,migrations:migrations.map(({file,version,sha256})=>({file,version,sha256})),names,schema,...(profiles?{profiles}:{})},null,2)+'\n');
 }
 assert.equal((await verifyAgencies(db)).enabled,false);console.log('ten byte hashes, ledger SQL, schema, functions and effective grants verified; default OFF');
 // Drift must fail closed even with a complete settings row.
 for(const damage of ["delete from supabase_migrations.karmahouse_migration_checksums where version='20261007000500'", "alter function public.kh_list_agency_members(uuid,uuid,integer,integer) rename to broken_members", "grant select on kh_private.agency_events to authenticated", "alter table kh_private.agency_settings alter column enabled set default true"]){await db.query('begin');await db.query(damage);await assert.rejects(verifyAgencies(db));await db.query('rollback');}
 console.log('missing ledger / missing RPC / excess grants / default-on schema drift all rejected');
 for(const damage of ['drop policy kh_agency_photo_read on storage.objects','alter table auth.users disable trigger kh_agency_auth_signup','grant select(payload) on kh_private.agency_events to authenticated']){await db.query('begin');await db.query(damage);await assert.rejects(verifyAgencies(db));await db.query('rollback');}
 await db.query('begin');await db.query('alter table auth.users add column unrelated_provider_metadata text;alter table storage.objects add column unrelated_provider_metadata text');await verifyAgencies(db);await db.query('rollback');
 console.log('managed agency policy/trigger drift rejected; unrelated Supabase baseline columns accepted');
 process.env.KH_LOCAL_DATABASE_URL=clone.url.href;
 await db.query('alter table public.properties disable trigger kh_agency_property_guard');
 assert.equal((await db.query("select tgenabled from pg_trigger where tgrelid='public.properties'::regclass and tgname='kh_agency_property_guard'")).rows[0].tgenabled,'D');
 await assert.rejects(verifyAgencies(db),/inventory differs/,'disabled property guard must fail verification');
 await assert.rejects(runAgencyCommand({target:'local',action:'enable',reason:'must reject disabled property guard',config:null}),/inventory differs/);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 await db.query('update kh_private.agency_settings set enabled=true');
 const disabledGuard=await runAgencyCommand({target:'local',action:'disable',reason:'emergency off with disabled property guard',config:null});
 assert.equal(disabledGuard.disabled,true);assert.equal(disabledGuard.enabled,false);assert.equal(disabledGuard.complete,false);assert.equal(disabledGuard.cancellationComplete,true);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 await db.query('alter table public.properties enable trigger kh_agency_property_guard');
 assert.equal((await verifyAgencies(db)).complete,true);
 console.log('disabled affected-table property guard: verify and enable rejected; emergency disable confirmed OFF with complete=false; restored guard verifies');
 await db.query('grant select on kh_private.agency_events to authenticated');
 await assert.rejects(runAgencyCommand({target:'local',action:'enable',reason:'must reject drift',config:null}));
 assert.equal((await runAgencyCommand({target:'local',action:'disable',reason:'emergency off despite drift',config:null})).enabled,false);
 await db.query('revoke select on kh_private.agency_events from authenticated');
 await db.query('alter table kh_private.agency_reminders rename to withheld_reminders');
 const incomplete=await runAgencyCommand({target:'local',action:'disable',reason:'emergency off despite absent queue',config:null});
 assert.equal(incomplete.disabled,true);assert.equal(incomplete.complete,false);assert.equal(incomplete.cancellationComplete,false);assert.deepEqual(incomplete.failed,['reminders']);
 assert.equal((await db.query('select enabled from kh_private.agency_settings')).rows[0].enabled,false);
 await db.query('alter table kh_private.withheld_reminders rename to agency_reminders');
 console.log('emergency disable confirms OFF despite inventory drift / absent queue; complete=false and cancellationComplete=false are explicit');
 await db.query('delete from kh_private.agency_settings');
 await assert.rejects(runAgencyCommand({target:'local',action:'disable',reason:'missing singleton must not claim OFF',config:null}),/singleton missing/);
 await db.query('insert into kh_private.agency_settings(singleton,enabled) values(true,false)');
 await db.query('begin');await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_fixture.sql',import.meta.url),'utf8'));await db.query(await readFile(new URL('../../supabase/tests/helpers/agency_scheduling_fixture.sql',import.meta.url),'utf8'));
 const f=(await db.query('select pg_temp.schedule_fixture(71) f')).rows[0].f;const actor=f.actor,agency=f.agency;
 const task=(await db.query("insert into kh_private.agency_tasks(deal_id,kind,title,assignee_id,due_at) values($1,'external_notification','Comunicacion historica',$2,clock_timestamp()+interval '1 day') returning id",[f.deal,actor])).rows[0].id;
 await db.query("select public.kh_request_agency_sale($1,$2,jsonb_build_object('winningDealId',$3::uuid,'executingManagerId',$1::uuid,'amountUsd',29000,'occurredAt',clock_timestamp()-interval '1 hour','expectedPropertyVersion',(select version from public.properties where id=$4),'expectedAuthorityVersion',1,'clientRequestId',gen_random_uuid()))",[actor,agency,f.deal,f.property]);
 const sale=(await db.query('select id from kh_private.agency_sale_requests where winning_deal_id=$1',[f.deal])).rows[0].id;
 await db.query("select public.kh_decide_agency_sale($1,$2,jsonb_build_object('requestId',$3::uuid,'action','confirm','expectedRequestVersion',1,'expectedPropertyVersion',(select version from public.properties where id=$4),'expectedAuthorityVersion',1,'note','Confirmed local fixture','clientRequestId',gen_random_uuid()))",[actor,agency,sale,f.property]);
 // Add a separate pending reminder to a live case; closure already cancelled its own.
 const live=(await db.query('select pg_temp.schedule_fixture(72) f')).rows[0].f;
 await db.query("select pg_temp.kh_as($1)",[live.actor]);
 const taskPayload={dealId:live.deal,title:'Pending reminder',assigneeId:live.actor,dueAt:new Date(Date.now()+86400000).toISOString(),clientRequestId:randomUUID()};
 await db.query('select public.kh_save_agency_task($1,$2,$3)',[live.actor,live.agency,taskPayload]);
 // Queue snapshots cover every cancellable state and legacy rows, without any provider call.
 const event=(await db.query("insert into kh_private.agency_events(agency_id,kind,subject_id) values($1,'deal_assigned',$2) returning id",[live.agency,live.deal])).rows[0].id;
 const notices=[];
 for(const category of ['agency','alert'])notices.push((await db.query("insert into kh_private.notifications(seq,recipient_id,actor_id,category,actor_name,property_title,title,body,agency_event_id,event_kind,agency_target,property_id) values(nextval('kh_private.notification_seq'),$1,$2,$3,'Fixture','Casa','Fixture','Fixture',$4,$5,$6,$7) returning id",[live.actor,actor,category,category==='agency'?event:null,category==='agency'?'deal_assignment':null,category==='agency'?{kind:'deal',agencyId:live.agency,dealId:live.deal}:null,category==='alert'?live.property:null])).rows[0].id);
 for(const notification of notices)for(const state of ['pending','retry','ticketed','sending','checking_receipt','provider_accepted','failed','cancelled'])await db.query("insert into kh_private.push_outbox(notification_id,installation_id,recipient_id,session_id,device_revision,token_hash,state,expires_at,active_attempt_id)values($1,gen_random_uuid(),$2,gen_random_uuid(),1,decode('aabb','hex'),$3,clock_timestamp()+interval '1 day',gen_random_uuid())",[notification,live.actor,state]);
 const personalTermination=(await db.query("insert into kh_private.commercial_termination_events(closure_id,property_id,subject_kind,subject_id,recipient_id) select id,property_id,'personal_conversation',gen_random_uuid(),$1 from kh_private.property_sale_closures limit 1 returning id",[actor])).rows[0].id;
 const personalJobs=(await db.query('select to_jsonb(j) row from kh_private.push_outbox j where notification_id=$1 order by id',[notices[1]])).rows;
 const personalEvent=(await db.query('select to_jsonb(t) row from kh_private.commercial_termination_events t where id=$1',[personalTermination])).rows;
 const completedJobs=(await db.query("select to_jsonb(j) row from kh_private.push_outbox j where notification_id=$1 and state in('provider_accepted','failed','cancelled') order by id",[notices[0]])).rows;
 const preserved=await inventory(db);await db.query('commit');
 process.env.KH_LOCAL_DATABASE_URL=clone.url.href;
 const command={target:'local',action:'disable',reason:'owned local activation test',config:null};
 const result=await runAgencyCommand(command);assert.equal(result.enabled,false);assert.ok(result.cancelled.reminders>0);assert.ok(result.cancelled.events>0);assert.ok(result.cancelled.terminations>0);
 assert.equal(result.cancelled.push,5);assert.deepEqual((await db.query('select to_jsonb(j) row from kh_private.push_outbox j where notification_id=$1 order by id',[notices[1]])).rows,personalJobs);assert.deepEqual((await db.query('select to_jsonb(t) row from kh_private.commercial_termination_events t where id=$1',[personalTermination])).rows,personalEvent);
 assert.deepEqual((await db.query("select to_jsonb(j) row from kh_private.push_outbox j where notification_id=$1 and state in('provider_accepted','failed','cancelled') and id=any($2::uuid[]) order by id",[notices[0],completedJobs.map(x=>x.row.id)])).rows,completedJobs);
 const after=await inventory(db),mutable=new Set(['agency_settings','agency_events','agency_reminders','commercial_termination_events','push_outbox']);
 assert.deepEqual(after.filter(t=>!mutable.has(t.tablename)),preserved.filter(t=>!mutable.has(t.tablename)),'disable preserves ALL business, receipt, sales and legacy rows');
 const unchanged=await inventory(db);await runAgencyCommand({...command,action:'status',reason:null});await runAgencyCommand({...command,action:'verify',reason:null});assert.deepEqual(await inventory(db),unchanged,'status/verify are read-only');
 console.log('explicit disable preserved all sales/history/receipts/legacy; pending agency jobs cancelled; status+verify wrote nothing');
 await db.query('begin');
 await db.query('update kh_private.agency_settings set enabled=false');await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');
 await db.query('select public.kh_list_agency_members($1,$2)',[actor,agency]);
 await db.query('select public.kh_agency_verification_request($1,$2)',[actor,agency]);
 await db.query('select public.kh_agency_properties($1,$2)',[actor,agency]);
 const photo=(await db.query('select public.kh_agency_property($1,$2,$3) p',[actor,agency,f.property])).rows[0].p.property.photo_paths[0];
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='property-photos' and name=$1",[photo])).rows[0].n,1,'current authorized portfolio photo remains readable OFF');
 await db.query("select public.kh_list_agency_sale_requests($1,$2,'incoming')",[actor,agency]);
 await db.query('select public.kh_list_agency_proposals($1,$2,$3)',[actor,agency,f.deal]);
 await db.query('select public.kh_list_agency_tasks($1,$2,$3)',[actor,agency,f.deal]);
 await db.query('select public.kh_list_agency_followup_events($1,$2,$3)',[actor,agency,f.deal]);
 await db.query('select public.kh_list_agency_deal_visits($1,$2,$3)',[actor,agency,f.deal]);
 console.log('OFF current member team/verification/portfolio/closure read permissions pass');
 await db.query('rollback');
 await db.query('begin');await db.query("update kh_private.agency_mandates set state='withdrawn' where property_id=$1 and agency_id=$2",[f.property,agency]);
 await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');
 await db.query('select public.kh_get_agency_deal($1,$2,$3)',[actor,agency,f.deal]);await db.query('select public.kh_list_agency_tasks($1,$2,$3)',[actor,agency,f.deal]);await db.query('select public.kh_list_agency_proposals($1,$2,$3)',[actor,agency,f.deal]);await db.query("select public.kh_list_agency_sale_requests($1,$2,'incoming')",[actor,agency]);
 assert.equal((await db.query("select count(*)::int n from storage.objects where bucket_id='property-photos' and name=$1",[photo])).rows[0].n,0,'withdrawn mandate cannot read private current property photo');
 await assert.rejects(db.query('select public.kh_agency_property($1,$2,$3)',[actor,agency,f.property]),/PROPERTY_NOT_FOUND/);await db.query('rollback');
 console.log('withdrawn mandate retains own case/tasks/proposals/closure but denies private current portfolio/photo');
 // Direct authenticated endpoints reject before receipt replay, including external notices.
 const funcs=(await db.query("select p.proname,pg_get_function_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute') and p.prosrc like '%perform kh_private.agency_require_enabled();%'")).rows;
 for(const fn of funcs){
  const params=fn.args.split(',').map(a=>a.trim().split(/\s+/).slice(0,2));
  const values=params.map(([name,type])=>name==='p_actor_id'?actor:name==='p_agency_id'?agency:type==='jsonb'?{}:null);
  await db.query('begin');await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');
  await assert.rejects(db.query(`select public.${fn.proname}(${params.map(([name,type],i)=>`$${i+1}::${type}`).join(',')})`,values),/KH_AGENCY_DISABLED/,fn.proname);await db.query('rollback');
 }
 await db.query('begin');await db.query('select pg_temp.kh_as($1)',[live.actor]);await db.query('set local role authenticated');await assert.rejects(db.query('select public.kh_save_agency_task($1,$2,$3)',[live.actor,live.agency,taskPayload]),/KH_AGENCY_DISABLED/);await db.query('rollback');
 await db.query('begin');await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');await assert.rejects(db.query("select public.kh_finish_agency_task($1,$2,jsonb_build_object('taskId',$3::uuid,'expectedVersion',1,'state','done','clientRequestId',gen_random_uuid()))",[actor,agency,task]),/KH_AGENCY_DISABLED/);await db.query('rollback');
 console.log(`${funcs.length} direct authenticated mutation gates + original receipt replay + external-notice completion reject OFF`);
 // Current-member read authorization also applies to suspended agencies, never removed staff.
 await db.query("update kh_private.agencies set state='suspended' where id=$1",[agency]);await db.query('begin');await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');assert.equal((await db.query("select jsonb_array_length(public.kh_list_agency_sale_requests($1,$2,'incoming')->'items') n",[actor,agency])).rows[0].n,1);await db.query('rollback');
 await db.query("update kh_private.agency_memberships set state='removed' where agency_id=$1 and user_id=$2",[agency,actor]);await db.query('begin');await db.query('select pg_temp.kh_as($1)',[actor]);await db.query('set local role authenticated');await assert.rejects(db.query('select public.kh_list_agency_members($1,$2)',[actor,agency]),/MEMBERSHIP_REQUIRED/);await db.query('rollback');
 console.log('suspended current source reads sale history; removed member denied');
 // Two real sessions and pg_blocking_pids prove both orderings; no timing-only assertion.
 const writer=new Client({connectionString:clone.url.href});await writer.connect();
 const writerPid=(await writer.query('select pg_backend_pid() pid')).rows[0].pid;
 const operatorPid=(await db.query('select pg_backend_pid() pid')).rows[0].pid;
 async function writerBegin(user=live.actor){await writer.query('begin');await writer.query("set local statement_timeout='10s'");await writer.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);await writer.query('set local role authenticated');}
 async function blocked(check){const until=Date.now()+5000;while(Date.now()<until){if(await check())return;await new Promise(r=>setTimeout(r,25));}throw Error('Required database lock barrier not reached');}
 try{
  await runAgencyCommand({...command,action:'enable'});
  await writerBegin();const first={...taskPayload,title:'Before disable barrier',clientRequestId:randomUUID()};
  await writer.query('select public.kh_save_agency_task($1,$2,$3)',[live.actor,live.agency,first]);
  const disabling=runAgencyCommand(command);
  await blocked(async()=>Boolean((await db.query("select 1 from pg_stat_activity where application_name='karmahouse-agency-operator' and $1=any(pg_blocking_pids(pid))",[writerPid])).rowCount));
  await writer.query('commit');await disabling;
  assert.equal((await db.query("select count(*)::int n from kh_private.agency_write_receipts where request_id=$1",[first.clientRequestId])).rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from kh_private.agency_reminders where state='pending'")).rows[0].n,0);
  console.log('barrier operation-before-disable: waiting exclusive lock observed; committed receipt retained; reminder cancelled');
  await runAgencyCommand({...command,action:'enable'});
  await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");await db.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");await disableAgencies(db,'held disable barrier');
  await writerBegin();const second={...taskPayload,title:'After disable barrier',clientRequestId:randomUUID()};
  const writing=writer.query('select public.kh_save_agency_task($1,$2,$3)',[live.actor,live.agency,second]).then(()=>({ok:true}),error=>({error}));
  await blocked(async()=>Boolean((await db.query('select $1=any(pg_blocking_pids($2)) blocked',[operatorPid,writerPid])).rows[0].blocked));
  await db.query('commit');const written=await writing;assert.match(written.error?.message??'',/KH_AGENCY_DISABLED/);await writer.query('rollback');
  assert.equal((await db.query('select count(*)::int n from kh_private.agency_write_receipts where request_id=$1',[second.clientRequestId])).rows[0].n,0);
  console.log('barrier disable-before-operation: waiting shared lock observed; no receipt or task written after OFF');
  await runAgencyCommand({...command,action:'enable'});
  const owner='45000000-0000-4000-8000-000000000001',linkBefore=await inventory(db);
  await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");await db.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");await disableAgencies(db,'held assisted-link barrier');
  await writerBegin(owner);const linking=writer.query('select public.kh_admin_link_assisted_agency($1,$2)',[owner,{propertyId:live.property,agencyId:live.agency,clientRequestId:randomUUID()}]).then(()=>({ok:true}),error=>({error}));
  await blocked(async()=>Boolean((await db.query('select $1=any(pg_blocking_pids($2)) blocked',[operatorPid,writerPid])).rows[0].blocked));
  await db.query('commit');assert.match((await linking).error?.message??'',/KH_AGENCY_DISABLED/);await writer.query('rollback');
  assert.deepEqual((await inventory(db)).filter(t=>!mutable.has(t.tablename)),linkBefore.filter(t=>!mutable.has(t.tablename)));
  console.log('barrier disable-before-owner-assisted-link: shared wait before account/provenance locks; no origin/link/receipt changed');
 }finally{await db.query('rollback');await writer.query('rollback');await writer.end();}

}finally{if(db)await db.end();if(clone)await clone.cleanup();assert.deepEqual(await inventory(baseline),before,'immutable source inventory');await baseline.end();console.log('owned clone dropped; source unchanged')}
