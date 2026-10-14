import assert from 'node:assert/strict';import {setTimeout as delay} from 'node:timers/promises';import {Client} from 'pg';
// Single-use Pro codes under two real connections (spec §10). Needs a fresh setup.mjs database: it commits its seed.
const url=process.env.KH_LOCAL_DATABASE_URL;if(!url)throw new Error('KH_LOCAL_DATABASE_URL required');
const parsed=new URL(url);if(!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname)||!parsed.pathname.startsWith('/kh_assisted_test'))throw new Error('Only disposable loopback fixture database allowed');
const uid=n=>`46000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=uid(1),one=uid(2),two=uid(3);
const clients=[];
async function connect(){const db=new Client({connectionString:url});await db.connect();clients.push(db);await db.query("set lock_timeout='7s';set statement_timeout='11s'");return db;}
async function act(db,actor,query,params){
 await db.query('begin');
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',jsonb_build_object('sub',$1::text,'role','authenticated')::text,true)",[actor]);
 await db.query('set local role authenticated');return (await db.query(query,params)).rows[0].r;
}
try{
 const db=await connect(),left=await connect(),right=await connect();
 await db.query('begin');
 await db.query("insert into auth.users(id,email,raw_user_meta_data) select id,'pro-race-'||n||'@example.invalid',jsonb_build_object('display_name','Carrera Pro '||n) from unnest($1::uuid[]) with ordinality u(id,n)",[[owner,one,two]]);
 await db.query('insert into kh_private.platform_owner(singleton,user_id) values(true,$1) on conflict(singleton) do update set user_id=excluded.user_id',[owner]);
 await db.query('commit');
 const code=async()=>{const c=await act(db,owner,"select public.kh_admin_create_pro_code($1,30,'Carrera de prueba')->>'code' r",[owner]);await db.query('commit');return c;};
 // Both calls run at once; the one that gets the lock first stays open until the other is proven to wait on it.
 async function race(c,actors){
  const calls=[left,right].map((cl,i)=>act(cl,actors[i],'select public.kh_redeem_pro_code($1,$2) r',[actors[i],c]));
  const first=await Promise.race(calls.map((p,i)=>p.then(()=>i)));
  const [holder,waiter]=first?[right,left]:[left,right];
  for(const end=Date.now()+5000;!(await db.query('select $1::int=any(pg_blocking_pids($2)) b',[holder.processID,waiter.processID])).rows[0].b;await delay(10))
   if(Date.now()>end)throw new Error('the second redemption never waited on the first');
  await holder.query('commit');const results=await Promise.all(calls);await waiter.query('commit');return results;
 }
 const a=await race(await code(),[one,two]);
 assert.deepEqual(a.map(r=>r.ok).sort(),[false,true],'exactly one person redeems a code');
 assert.equal(a.find(r=>!r.ok).error,'KH_PRO_CODE_INVALID');
 const loser=a[0].ok?two:one,b=await race(await code(),[loser,loser]);
 assert.ok(b.every(r=>r.ok)&&b[0].until===b[1].until,'a parallel retry by the same person succeeds with the same date');
 const once=(await db.query("select s.pro_until=$2::timestamptz and s.pro_until=c.redeemed_at+interval '30 days' r from kh_private.pro_status s join kh_private.pro_codes c on c.redeemed_by=s.user_id where s.user_id=$1",[loser,b[0].until])).rows;
 assert.deepEqual(once,[{r:true}],'Pro was extended once: 30 days from the redemption');
 console.log('PASS verify-pro-concurrency');
}catch(e){console.error('FAIL verify-pro-concurrency:',e.message);process.exitCode=1;}
finally{await Promise.allSettled(clients.map(db=>db.query('rollback')));await Promise.allSettled(clients.map(db=>db.end()));}
