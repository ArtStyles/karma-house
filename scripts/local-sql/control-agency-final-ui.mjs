// Explicit mutations of this turn's disposable fixture; no browser-state injection.
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
import {Client} from 'pg';
import {assertFixtureReceipt,assertFixtureTarget} from '../agency-ui-fixture.mjs';
const root=new URL('../../.superpowers/sdd/2026-10-07-agency-closure-release/',import.meta.url);
const r=assertFixtureReceipt(JSON.parse(await readFile(new URL('task-final-fixture-receipt.json',root),'utf8')));
assert.equal(r.state,'ready');const source=assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const live=await fetch(r.origin+'/__fixture/status',{method:'POST',headers:{'x-fixture-control':r.controlToken}}).then(x=>x.json());assert.equal(live.runId,r.runId);
const db=new Client({connectionString:new URL('/'+r.database,source).href});await db.connect();
try{
 const action=process.argv[2];assert.ok(['manager','coordinator','admin','remove','proof'].includes(action));
 if(action!=='proof')await db.query("update kh_private.agency_memberships set state=$3,role=$4,version=version+1 where agency_id=$1 and user_id=$2",[r.agencies.A,r.actors['admin-a'].id,action==='remove'?'removed':'active',action==='remove'?'manager':action]);
 const proof={runId:r.runId,action,at:new Date().toISOString(),profile:(await db.query('select id,commercial_profile,logo_path from kh_private.agencies')).rows,application:(await db.query('select agency_id,input from kh_private.agency_applications')).rows,members:(await db.query('select agency_id,user_id,role,state,version from kh_private.agency_memberships')).rows,mandateRequests:(await db.query('select id,property_id,agency_id,state from kh_private.agency_mandate_requests')).rows,properties:(await db.query('select id,title,moderation from public.properties')).rows,messages:(await db.query('select conversation_id,seq,sender_id,body from kh_private.agency_messages order by conversation_id,seq')).rows,events:(await db.query("select agency_id,kind,subject_id,payload from kh_private.agency_events where kind in('property_saved','commercial_profile_updated','mandate_requested') order by created_at")).rows};
 await appendFile(new URL('final-evidence/ui-control.jsonl',root),JSON.stringify(proof)+'\n');
 if(action==='proof')await writeFile(new URL('final-evidence/ui-persisted-final.json',root),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{await db.end();}
