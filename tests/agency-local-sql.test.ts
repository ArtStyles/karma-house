import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for(const script of ['setup.mjs','run-agency-suites.mjs']) {
 test(`${script} rejects missing or remote database configuration before opening a connection`,()=>{
  for(const url of [undefined,'postgresql://user:secret@remote.invalid/kh_agency_test','postgresql://user:secret@127.0.0.1/production','postgresql://user:secret@localhost/kh_agency_test%2Fother']) {
   const env={...process.env};delete env.KH_LOCAL_DATABASE_URL;if(url)env.KH_LOCAL_DATABASE_URL=url;
   const child=spawnSync(process.execPath,[`scripts/local-sql/${script}`],{env,encoding:'utf8',timeout:5000});
   assert.notEqual(child.status,0); assert.match(child.stderr,/KH_LOCAL_DATABASE_URL required|disposable loopback|Invalid fixture database/);
   assert.doesNotMatch(child.stderr,/user:secret|ECONNREFUSED|ENOTFOUND/);
  }
 });
}
