import {Client} from 'pg';import {readFile,readdir} from 'node:fs/promises';import assert from 'node:assert/strict';
const url=new URL(process.env.KH_LOCAL_DATABASE_URL??'invalid:');
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||!url.pathname.startsWith('/kh_assisted_test'))throw Error('Disposable loopback database required');
const db=new Client({connectionString:url.href});await db.connect();
try{
 assert.equal((await db.query("select to_regclass('kh_private.assisted_listing_settings') t")).rows[0].t,null,'needs historical baseline only');
 await db.query('begin');
 await db.query("insert into auth.users(id,email,email_confirmed_at) values('44000000-0000-4000-8000-000000000001','upgrade-owner@example.invalid',now()),('44000000-0000-4000-8000-000000000002','upgrade-buyer@example.invalid',now());insert into kh_private.platform_owner(singleton,user_id) values(true,'44000000-0000-4000-8000-000000000001');select set_config('request.jwt.claim.sub','44000000-0000-4000-8000-000000000001',true);insert into storage.objects(bucket_id,name,owner_id) values('property-photos','44000000-0000-4000-8000-000000000001/upgrade/photo.jpg','44000000-0000-4000-8000-000000000001'),('property-photos','44000000-0000-4000-8000-000000000001/upgrade/thumb.jpg','44000000-0000-4000-8000-000000000001')");
 const payload={ownerId:'44000000-0000-4000-8000-000000000001',clientRequestId:'upgrade',title:'Historic synthetic listing',location:'Vedado',province:'La Habana',type:'Casa',description:'Synthetic historical material for upgrade verification.',price:50000,area:70,bedrooms:2,bathrooms:1,amenities:[],photoPaths:['44000000-0000-4000-8000-000000000001/upgrade/photo.jpg'],coverThumbPath:'44000000-0000-4000-8000-000000000001/upgrade/thumb.jpg',moderation:'pending',operation:'sale'};
 const before=(await db.query('select public.kh_save_property($1::jsonb) r',[JSON.stringify(payload)])).rows[0].r;
 await db.query("insert into public.favorites(user_id,property_id) values('44000000-0000-4000-8000-000000000002',$1)",[before.id]);
 const receipt=(await db.query('select to_jsonb(r) r from kh_private.property_save_requests r where property_id=$1',[before.id])).rows[0].r;
 const root=new URL('../../supabase/migrations/',import.meta.url),files=(await readdir(root)).filter(x=>x.startsWith('20261005')).sort();
 // First prove that missing historical bytes stop the whole migration transaction.
 await db.query('savepoint missing_media');await db.query('delete from storage.objects where name=$1',[payload.photoPaths[0]]);
 await assert.rejects(db.query(await readFile(new URL(files[0],root),'utf8')),/KH_ASSISTED_BACKFILL_MISSING_MEDIA/);
 await db.query('rollback to savepoint missing_media');assert.equal((await db.query("select to_regclass('kh_private.assisted_listing_settings') t")).rows[0].t,null);
 for(const file of files)await db.query(await readFile(new URL(file,root),'utf8'));
 assert.deepEqual((await db.query('select to_jsonb(p) r from public.properties p where id=$1',[before.id])).rows[0].r,before);
 assert.deepEqual((await db.query('select to_jsonb(r) r from kh_private.property_save_requests r where property_id=$1',[before.id])).rows[0].r,receipt);
 assert.equal((await db.query('select count(*)::int n from public.favorites where property_id=$1',[before.id])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from kh_private.property_media_assets where property_id=$1',[before.id])).rows[0].n,2);
 assert.equal((await db.query('select transfers_enabled from kh_private.assisted_listing_settings')).rows[0].transfers_enabled,false);
 assert.deepEqual((await db.query('select public.kh_save_property($1::jsonb) r',[JSON.stringify(payload)])).rows[0].r,before);
 await db.query('rollback');console.log('PASS historical upgrade preserves exact row, receipt, media, favorite and creation replay; missing media blocks atomically; flag false (rollback)');
}finally{await db.query('rollback').catch(()=>{});await db.end();}
