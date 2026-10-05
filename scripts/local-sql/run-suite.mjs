import {Client} from 'pg';import {readFile} from 'node:fs/promises';
const url=process.env.KH_LOCAL_DATABASE_URL;if(!url)throw new Error('KH_LOCAL_DATABASE_URL required');
const parsed=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||!parsed.pathname.startsWith('/kh_assisted_test'))throw new Error('Only disposable loopback fixture database allowed');
const db=new Client({connectionString:url});await db.connect();
try{for(const name of process.argv.slice(2)){
 if(!/^[a-z0-9_]+$/.test(name))throw new Error('Invalid suite name');let sql=await readFile(new URL(`../../supabase/tests/${name}.sql`,import.meta.url),'utf8');
 if(sql.includes('Fixture helper is prepended')){const helper=await readFile(new URL('../../supabase/tests/helpers/assisted_fixture.sql',import.meta.url),'utf8');sql=sql.replace(/begin;/i,()=> 'begin;\n'+helper);}
 await db.query(sql);console.log(`PASS ${name} (rollback)`);
}}catch(e){await db.query('rollback').catch(()=>{});console.error(e.message,e.where??'',e.detail??'');process.exitCode=1;}finally{await db.end();}
