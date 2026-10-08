// Receipt-bound local rendering of the real public API; no production config.
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertFixtureReceipt,assertFixtureTarget} from './agency-ui-fixture.mjs';
import {handle} from '../web/api/p.ts';
assertFixtureTarget(process.env.KH_LOCAL_DATABASE_URL);
const dir=resolve(import.meta.dirname,'../.superpowers/sdd/2026-10-07-agency-closure-release');
const r=assertFixtureReceipt(JSON.parse(await readFile(resolve(dir,'task-14-fixture-receipt.json'),'utf8')));
assert.equal(r.state,'ready');
const live=await fetch(r.origin+'/__fixture/status',{method:'POST',headers:{'x-fixture-control':r.controlToken}}).then(response=>response.json());
assert.equal(live.runId,r.runId);assert.equal(live.database,r.database);
const origin='http://127.0.0.1:8098';
const server=createServer(async(req,res)=>{try{
 const response=await handle(new Request(origin+req.url),{supabaseUrl:r.origin,anonKey:'synthetic-local-agency-fixture-only',publicOrigin:origin});
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
}catch(e){res.writeHead(500);res.end(e.message)}});
await new Promise((done,fail)=>{server.once('error',fail);server.listen(8098,'127.0.0.1',done)});
await writeFile(resolve(dir,'task-14-public-preview-receipt.json'),JSON.stringify({runId:r.runId,pid:process.pid,origin,startedAt:new Date().toISOString(),script:'scripts/agency-public-ui-preview.mjs'},null,2),{flag:'wx'});
console.log('Public API preview ready '+origin);
