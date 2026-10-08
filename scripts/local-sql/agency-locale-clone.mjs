import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,access,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {Client} from 'pg';

// The preserved Windows baseline uses libc C, which cannot lowercase accented
// capitals. Historical catalogue tests need the hosted database's ICU en-US
// behavior. Reconstruct an owned clone; preserve the real owners and ACLs.
export async function createAgencyLocaleClone(source){
 assert.equal(source.href,'postgresql://agency_test@127.0.0.1:55487/kh_agency_test_suites_20261007');
 const dumpTool='C:/Program Files/PostgreSQL/17/bin/pg_dump.exe';
 const restoreTool='C:/Program Files/PostgreSQL/17/bin/pg_restore.exe';
 await access(dumpTool);await access(restoreTool); // Explicit prerequisite, no fallback.
 const name=`kh_agency_test_legacy_${randomUUID().replaceAll('-','')}`;
 const url=new URL(`/${name}`,source),admin=new Client({connectionString:new URL('/postgres',source).href});
 const dir=await mkdtemp(join(tmpdir(),'kh_agency_test_dump_'));let created=false;
 await admin.connect();
 async function cleanup(){
  try{
   if(created){
    assert.match(name,/^kh_agency_test_legacy_[a-f0-9]{32}$/);
    assert.equal((await admin.query('select pg_get_userbyid(datdba)=current_user owned from pg_database where datname=$1',[name])).rows[0].owned,true);
    await admin.query(`drop database "${name}"`);
    assert.equal((await admin.query('select 1 from pg_database where datname=$1',[name])).rowCount,0);
   }
  }finally{await admin.end();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.match(basename(dir),/^kh_agency_test_dump_[A-Za-z0-9]+$/);await rm(dir,{recursive:true,force:true})}
 }
 try{
  assert.equal((await admin.query('select 1 from pg_database where datname=$1',[name])).rowCount,0);
  await admin.query(`create database "${name}" template template0 encoding 'UTF8' locale_provider icu icu_locale 'en-US'`);created=true;
  const file=join(dir,'baseline.dump'),exec=promisify(execFile);
  await exec(dumpTool,['--format=custom',`--file=${file}`,`--dbname=${source.href}`],{windowsHide:true,maxBuffer:2**20});
  // PostgreSQL cannot discover dependencies inside string-form SQL bodies.
  // The generated search column inlines kh_search_source during CREATE TABLE;
  // restore its unchanged kh_unaccent dependency first, retaining all TOC ACLs.
  const toc=(await exec(restoreTool,['--list',file],{windowsHide:true,maxBuffer:2**20})).stdout.split('\n');
  const dependency=toc.filter(line=>line.includes(' FUNCTION kh_private kh_unaccent(text) '));assert.equal(dependency.length,1);
  const ordered=toc.filter(line=>line!==dependency[0]);const index=ordered.findIndex(line=>line.includes(' FUNCTION kh_private kh_search_source('));assert.ok(index>=0);
  ordered.splice(index,0,dependency[0]);const list=join(dir,'restore.list');await writeFile(list,ordered.join('\n'));
  await exec(restoreTool,['--exit-on-error',`--use-list=${list}`,`--dbname=${url.href}`,file],{windowsHide:true,maxBuffer:2**20});
  return {url,cleanup};
 }catch(error){await cleanup();throw error}
}
