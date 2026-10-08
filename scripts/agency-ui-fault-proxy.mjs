// One-shot transport faults around real fixture RPC commits. Loopback only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertFixtureReceipt,assertFixtureTarget,fixturePage} from './agency-ui-fixture.mjs';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'.superpowers/sdd/2026-10-07-agency-closure-release'),file=resolve(dir,'task-14-proxy-receipt.json'),env=resolve(root,'.env.local');
assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const parent=assertFixtureReceipt(JSON.parse(await readFile(resolve(dir,'task-14-fixture-receipt.json'),'utf8')));
assert.equal(parent.state,'ready');
const live=await fetch(parent.origin+'/__fixture/status',{method:'POST',headers:{'x-fixture-control':parent.controlToken}}).then(response=>response.json());
assert.equal(live.runId,parent.runId);assert.equal(live.database,parent.database);
const hash=v=>createHash('sha256').update(v).digest('hex');
const action=process.argv[2];
if(action!=='setup'){
 const r=JSON.parse(await readFile(file,'utf8'));assert.equal(r.runId,parent.runId);assert.equal(r.origin,'http://127.0.0.1:56435');
 const response=await fetch(r.origin+'/__fault',{method:'POST',headers:{'x-control':r.token,'content-type':'application/json'},body:JSON.stringify({action,rpc:process.argv[3]})});assert.equal(response.status,200);console.log(await response.text());
}else{
 const current=await readFile(env);assert.equal(hash(current),parent.config.installedHash);
 const config='EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:56435\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-local-agency-fixture-only\n';
 const r={runId:parent.runId,pid:process.pid,origin:'http://127.0.0.1:56435',upstream:parent.origin,token:randomBytes(32).toString('hex'),previous:current.toString('base64'),installedHash:hash(config),state:'starting',events:[]};
 await writeFile(file,JSON.stringify(r,null,2),{flag:'wx'});let fault=null;let serial=Promise.resolve();const persist=()=>{const data=JSON.stringify(r,null,2);serial=serial.then(()=>writeFile(file,data));return serial};
 const server=createServer(async(req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','*');if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);
  if(req.url==='/__fault'){try{
   if(req.headers['x-control']!==r.token){res.writeHead(403);return res.end()}
   const data=JSON.parse(body);if(data.action==='cleanup'){
    assert.equal(hash(await readFile(env)),r.installedHash);await writeFile(env,Buffer.from(r.previous,'base64'));r.state='cleaned';r.cleanedAt=new Date().toISOString();await persist();res.end(JSON.stringify({state:r.state,configRestored:true}));server.close();return;
   }
   assert.ok(['before','after'].includes(data.action));assert.match(data.rpc,/^kh_[a-z_]+$/);fault={mode:data.action,rpc:data.rpc};r.events.push({armed:fault,at:new Date().toISOString()});await persist();res.end(JSON.stringify(fault));return;
  }catch(error){res.writeHead(400);res.end(JSON.stringify({message:error.message}));return;}
  }
  const use=fault&&req.url===`/rest/v1/rpc/${fault.rpc}`?fault:null;if(use)fault=null;
  if(use?.mode==='before'){r.events.push({...use,phase:'dropped-before-forward',at:new Date().toISOString()});await persist();res.writeHead(use.mode==='before'?503:504,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Failed to fetch: synthetic gateway interruption'}));return;}
  try{const response=await fetch(r.upstream+req.url,{method:req.method,headers:Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length'].includes(k))),...(body.length?{body}:{})});const bytes=Buffer.from(await response.arrayBuffer());
   if(use?.mode==='after'){r.events.push({...use,phase:'dropped-after-upstream-response',status:response.status,response:bytes.toString(),at:new Date().toISOString()});await persist();res.writeHead(use.mode==='before'?503:504,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Failed to fetch: synthetic gateway interruption'}));return;}
   // The first, already-running fixture predates paging support. Adapt only that
   // recorded run; newer setups page inside SQL and must never be sliced twice.
   if((parent.protocolVersion??1)===1&&/^\/rest\/v1\/(properties|favorites)\?/.test(req.url)&&response.ok){const params=new URL(req.url,r.origin).searchParams,{offset,limit}=fixturePage(params),rows=JSON.parse(bytes);const headers=Object.fromEntries(response.headers);delete headers['content-length'];res.writeHead(response.status,headers);res.end(JSON.stringify(rows.slice(offset,offset+limit)));return;}
   // Older running synthetic providers omitted the legacy Auth error-code key.
   // This is provider protocol adaptation, never a product/Auth-server claim.
   if(req.url.startsWith('/auth/v1/')&&response.status===400){const data=JSON.parse(bytes);if(data.code==='email_not_confirmed'&&!data.error_code){data.error_code=data.code;const headers=Object.fromEntries(response.headers);delete headers['content-length'];res.writeHead(response.status,headers);res.end(JSON.stringify(data));return;}}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(bytes);
  }catch(e){res.writeHead(502);res.end(JSON.stringify({message:'Synthetic network interruption'}))}
 });
 await new Promise((done,fail)=>{server.once('error',fail);server.listen(56435,'127.0.0.1',done)});await writeFile(env,config);r.state='ready';await persist();console.log(JSON.stringify({pid:r.pid,origin:r.origin,state:r.state}));
}
