// Shared operator contract. Importing this file never reads configuration or opens a connector.
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
export const migrationRoot=new URL('../supabase/migrations/',import.meta.url);
export const manifestFile=new URL('../supabase/agency-activation-manifest.json',import.meta.url);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function parseAgencyCommand(args,verify=false){
 const result={action:verify?'verify':null,target:null,reason:null,config:null};
 const bad=()=>{throw Error('Invalid agency command. Explicit --target and exactly one action required; writes need --reason.');};
 for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(['--status','--enable','--disable'].includes(arg)){if(result.action)bad();result.action=arg.slice(2)}
  else if(['--target','--reason','--config'].includes(arg)){const key=arg.slice(2);if(result[key]!==null||!args[i+1]||args[i+1].startsWith('--'))bad();result[key]=args[++i]}
  else bad();
 }
 if(!['local','hosted'].includes(result.target)||!result.action)bad();
 if(['enable','disable'].includes(result.action)&&(!result.reason?.trim()||result.reason.length>500))bad();
 if(['status','verify'].includes(result.action)&&result.reason!==null)bad();
 if(result.target==='local'&&result.config!==null)bad();
 if(result.config!==null&&!isAbsolute(result.config))bad();
 return result;
}
export async function agencyConnection(command,env=process.env){
 let connectionString,ssl;
 if(command.target==='local'){
  const value=env.KH_LOCAL_DATABASE_URL;let url;try{url=new URL(value)}catch{throw Error('Explicit local fixture URL required')}
  if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='55487'||url.username!=='agency_test'||url.password||url.search||url.hash||!/^\/kh_agency_test_legacy_[a-f0-9]{32}$/.test(url.pathname))throw Error('Strict owned local clone required');
  connectionString=url.href;
 }else{
  if(!command.config)throw Error('Hosted target requires explicit --config <absolute private JSON file>');
  let config;try{config=JSON.parse(await readFile(command.config,'utf8'))}catch{throw Error('Hosted private configuration unavailable')}
  let url;try{url=new URL(config.databaseUrl)}catch{throw Error('Invalid hosted configuration')}
  if(!['postgres:','postgresql:'].includes(url.protocol)||['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.search||url.hash||!isAbsolute(config.caFile??'')||config.expectedHost!==url.hostname||config.expectedDatabase!==url.pathname.slice(1))throw Error('Invalid hosted configuration');
  connectionString=url.href;ssl={rejectUnauthorized:true,ca:await readFile(config.caFile,'utf8')};
 }
 return {connectionString,ssl,application_name:'karmahouse-agency-operator',connectionTimeoutMillis:10000};
}
export async function migrationArtifacts(){
 const files=(await readdir(migrationRoot)).filter(n=>/^20261007\d{6}_.*\.sql$/.test(n)).sort();
 if(files.length!==10||files.some((n,i)=>!n.startsWith(`20261007${String(i+1).padStart(4,'0')}00_`)))throw Error('Ten ordered agency migrations required');
 return Promise.all(files.map(async file=>{const bytes=await readFile(new URL(file,migrationRoot));if(bytes.includes(13))throw Error('New agency migrations must use LF bytes');return {file,version:file.slice(0,14),sha256:digest(bytes),sql:bytes.toString('utf8')}}));
}
export function assertMigrationLedger(migrations,rows){
 if(migrations.length!==10||rows.length!==10)throw Error('Incomplete agency migration ledger');
 for(const m of migrations){const row=rows.find(r=>r.version===m.version);if(!row||row.sha256!==m.sha256||!Array.isArray(row.statements)||row.statements.length!==1||row.statements[0]!==m.sql)throw Error('Agency migration ledger differs from reviewed bytes')}
}
export async function schemaInventory(db,names){
 const functions=(await db.query(`select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' signature,
 pg_get_functiondef(p.oid) definition,has_function_privilege('anon',p.oid,'execute') anon,has_function_privilege('authenticated',p.oid,'execute') authenticated,has_function_privilege('service_role',p.oid,'execute') service_role
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=any($1) order by (n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')') collate "C"`,[names.functions])).rows.map(({definition,...rest})=>({...rest,sha256:digest(definition)}));
 const tables=[];
 for(const name of names.tables){
  const row=(await db.query(`select c.relrowsecurity rls,c.relforcerowsecurity force_rls,
   (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'nullable',not a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns,
   (select jsonb_agg(pg_get_constraintdef(oid,true) order by pg_get_constraintdef(oid,true) collate "C") from pg_constraint where conrelid=c.oid) constraints,
   (select jsonb_agg(pg_get_indexdef(indexrelid) order by pg_get_indexdef(indexrelid) collate "C") from pg_index where indrelid=c.oid) indexes,
   (select jsonb_agg(pg_get_triggerdef(oid,true) order by tgname collate "C") from pg_trigger where tgrelid=c.oid and not tgisinternal) triggers,
   (select jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid),'roles',(select jsonb_agg(case when r=0 then 'public' else pg_get_userbyid(r) end order by (case when r=0 then 'public' else pg_get_userbyid(r) end) collate "C") from unnest(polroles)r)) order by polname collate "C") from pg_policy where polrelid=c.oid) policies
   from pg_class c where c.oid=to_regclass($1)`,[name])).rows[0];
  if(!row)throw Error('Required agency table missing');
  const grants=(await db.query(`select r,p,has_table_privilege(r,$1,p) allowed from unnest(array['anon','authenticated','service_role'])r cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])p order by r collate "C",p collate "C"`,[name])).rows;
  const columns=(await db.query(`select a.attname column,r,p,has_column_privilege(r,$1,a.attname,p) allowed from pg_attribute a cross join unnest(array['anon','authenticated','service_role'])r cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES'])p where a.attrelid=to_regclass($1) and a.attnum>0 and not a.attisdropped order by a.attname collate "C",r collate "C",p collate "C"`,[name])).rows;
  tables.push({name,sha256:digest(JSON.stringify(row)),grants,columnGrantsSha256:digest(JSON.stringify(columns))});
 }
 // Supabase owns the rest of auth/storage. Pin only our attachments there.
 const managed=[];
 for(const {table,kind,name}of names.managed){
  const row=kind==='trigger'?(await db.query('select pg_get_triggerdef(oid,true) definition,tgenabled enabled from pg_trigger where tgrelid=to_regclass($1) and tgname=$2',[table,name])).rows[0]
   :(await db.query(`select polcmd command,polpermissive permissive,pg_get_expr(polqual,polrelid) using,pg_get_expr(polwithcheck,polrelid) check,
    (select jsonb_agg(case when r=0 then 'public' else pg_get_userbyid(r) end order by (case when r=0 then 'public' else pg_get_userbyid(r) end) collate "C") from unnest(polroles)r) roles
    from pg_policy where polrelid=to_regclass($1) and polname=$2`,[table,name])).rows[0];
  if(!row)throw Error('Required agency trigger/policy missing');
  const security=(await db.query('select relrowsecurity rls,relforcerowsecurity force_rls from pg_class where oid=to_regclass($1)',[table])).rows[0];
  managed.push({table,kind,name,sha256:digest(JSON.stringify({row,security}))});
 }
 return {functions,tables,managed};
}
export function inventoryNames(migrations){
 const sql=migrations.map(m=>m.sql).join('\n'),functions=new Set(),tables=new Set(),managed=[];
 for(const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+((?:public|kh_private)\.[a-z_]+)/gi))functions.add(m[1]);
 for(const m of sql.matchAll(/alter function\s+((?:public|kh_private))\.[a-z_]+\([^;]+?rename to\s+([a-z_]+)/gi))functions.add(`${m[1]}.${m[2]}`);
 for(const m of sql.matchAll(/(?:create table|alter table)\s+((?:public|kh_private|storage)\.[a-z_]+)/gi))tables.add(m[1]);
 for(const m of sql.matchAll(/create\s+(policy|trigger)\s+([a-z_]+)\s+[^;]*?\bon\s+((?:public|kh_private|storage|auth)\.[a-z_]+)/gi)){
  if(/^(auth|storage)\./.test(m[3]))managed.push({table:m[3],kind:m[1].toLowerCase(),name:m[2]});else tables.add(m[3]);
 }
 return {functions:[...functions].sort(),tables:[...tables].sort(),managed:managed.sort((a,b)=>`${a.table}.${a.name}`<`${b.table}.${b.name}`?-1:1)};
}
export async function verifyAgencies(db){
 const migrations=await migrationArtifacts(),manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 if(JSON.stringify(migrations.map(({file,version,sha256})=>({file,version,sha256})))!==JSON.stringify(manifest.migrations))throw Error('Reviewed agency manifest differs from local bytes');
 if(JSON.stringify(inventoryNames(migrations))!==JSON.stringify(manifest.names))throw Error('Agency manifest omits required SQL inventory');
 const rows=(await db.query('select m.version,m.statements,c.sha256 from supabase_migrations.schema_migrations m left join supabase_migrations.karmahouse_migration_checksums c using(version) where m.version=any($1) order by m.version',[migrations.map(m=>m.version)])).rows;
 assertMigrationLedger(migrations,rows);
 const actual=await schemaInventory(db,manifest.names);
 if(JSON.stringify(actual)!==JSON.stringify(manifest.schema))throw Error('Agency schema/function/grant inventory differs from reviewed manifest');
 const setting=(await db.query('select enabled from kh_private.agency_settings where singleton')).rows;
 if(setting.length!==1||typeof setting[0].enabled!=='boolean')throw Error('Agency flag missing');
 const bucket=(await db.query("select public from storage.buckets where id='agency-assets'")).rows[0];if(bucket?.public!==false)throw Error('Agency assets must remain private');
 return {complete:true,migrations:10,functions:actual.functions.length,tables:actual.tables.length,permissions:'reviewed',enabled:setting[0].enabled};
}
export async function disableAgencies(db,reason){
 const flag=await db.query('update kh_private.agency_settings set enabled=false where singleton');
 if(flag.rowCount!==1)throw Error('Agency singleton missing; OFF not confirmed');
 const counts={},failures=[];
 const jobs={
  reminders:"update kh_private.agency_reminders set state='cancelled',reason='module_disabled' where state in('pending','failed')",
  events:"update kh_private.agency_events set delivery_state='cancelled' where delivery_state='pending'",
  terminations:"update kh_private.commercial_termination_events set state='cancelled' where state in('pending','failed') and subject_kind='agency_deal'",
  push:"update kh_private.push_outbox j set state='cancelled',last_error='AGENCY_MODULE_DISABLED',active_attempt_id=null,updated_at=clock_timestamp() from kh_private.notifications n where n.id=j.notification_id and n.category='agency' and j.state in('pending','retry','ticketed','sending','checking_receipt')",
 };
 for(const [key,sql]of Object.entries(jobs)){
  await db.query('savepoint agency_cancel');
  try{counts[key]=(await db.query(sql)).rowCount;}catch{await db.query('rollback to savepoint agency_cancel');counts[key]=null;failures.push(key);}
  await db.query('release savepoint agency_cancel');
 }
 await db.query('savepoint agency_audit');
 try{await db.query("insert into kh_private.agency_events(kind,payload,delivery_state) values('module_disabled',jsonb_build_object('reason',$1::text),'cancelled')",[reason]);}
 catch{await db.query('rollback to savepoint agency_audit');failures.push('audit');}
 await db.query('release savepoint agency_audit');
 return {counts,cancellationComplete:failures.length===0,failed:failures};
}
export async function runAgencyCommand(command){
 // Target and action were validated before this config read or connector import.
 const config=await agencyConnection(command),{Client}=await import('pg'),db=new Client(config);let connected=false;
 try{
  await db.connect();connected=true;
  if(command.target==='local'&&!(await db.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=current_database()')).rows[0]?.owned)throw Error('Local clone ownership required');
  const readonly=['status','verify'].includes(command.action);
  await db.query(readonly?'begin isolation level repeatable read read only':'begin');
  await db.query("set local statement_timeout='30s';set local lock_timeout='15s'");
  if(!readonly){
   // Module operations serialize with each other and with the transport worker.
   await db.query("select pg_advisory_xact_lock(hashtextextended('kh:push:worker',0))");
   await db.query("select pg_advisory_xact_lock(hashtextextended('kh:agency:module',0))");
  }
  let status;
  if(command.action==='disable'){
   await db.query('savepoint agency_inventory');
   try{status=await verifyAgencies(db);}catch{await db.query('rollback to savepoint agency_inventory');status={complete:false,permissions:'unverified'};}
   await db.query('release savepoint agency_inventory');
  }else status=await verifyAgencies(db);
  let cancelled;
  if(command.action==='enable'){
   await db.query('update kh_private.agency_settings set enabled=true where singleton');
   await db.query("insert into kh_private.agency_events(kind,payload,delivery_state) values('module_enabled',jsonb_build_object('reason',$1::text),'cancelled')",[command.reason]);
  }else if(command.action==='disable')cancelled=await disableAgencies(db,command.reason);
  await db.query('commit');return {...status,target:command.target,action:command.action,enabled:command.action==='enable'?true:command.action==='disable'?false:status.enabled,...(cancelled?{disabled:true,cancelled:cancelled.counts,cancellationComplete:cancelled.cancellationComplete,failed:cancelled.failed}:{})};
 }catch(error){if(connected)await db.query('rollback').catch(()=>{});throw error}finally{await db.end().catch(()=>{})}
}
