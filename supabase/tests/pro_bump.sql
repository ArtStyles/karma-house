-- KarmaHouse Pro: weekly bump, catalogue order, alerts and price history. Everything rolls back.
-- O owner (…01), S seller (…02), X stranger (…03), G agency admin (…04), M agency manager (…05),
-- W watcher with a saved search (…06), Y admin of another agency (…07). Listings b1-b5 sit in a
-- province no real listing uses. Every email is confirmed: agency bumps require it.
begin;
create function pg_temp.pro_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'BUMP ASSERTION: %',label; end if; end $$;
create function pg_temp.pro_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'BUMP ASSERTION: missing error %',expected;
end $$;
create function pg_temp.pro_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('44000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'bump-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Bump '||n)
 from generate_series(1,7) n;
insert into kh_private.platform_owner(singleton,user_id) values(true,'44000000-0000-4000-8000-000000000001')
 on conflict(singleton) do update set user_id=excluded.user_id;
update kh_private.agency_settings set enabled=true;
insert into kh_private.agencies(id,trade_name,state) values('44000000-0000-4000-8000-0000000000a1','Casas Bump Ficticias','approved'),
 ('44000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Ficticia','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000004','admin'),
 ('44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000005','manager'),
 ('44000000-0000-4000-8000-0000000000a2','44000000-0000-4000-8000-000000000007','admin');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability,created_at,updated_at) values
 ('44000000-0000-4000-8000-0000000000b1','44000000-0000-4000-8000-000000000002','pro-b1','Casa antigua para subir','Vedado','Zona Pro Prueba','Casa','Vivienda ficticia para probar la subida semanal.',50000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b1/photo.jpg'],'approved','active',now()-interval '8 days',now()-interval '8 days'),
 ('44000000-0000-4000-8000-0000000000b2','44000000-0000-4000-8000-000000000002','pro-b2','Casa reciente','Playa','Zona Pro Prueba','Casa','Vivienda ficticia publicada ayer para la prueba.',60000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b2/photo.jpg'],'approved','active',now()-interval '1 day',now()),
 ('44000000-0000-4000-8000-0000000000b3','44000000-0000-4000-8000-000000000002','pro-b3','Casa en revisión','Cerro','Zona Pro Prueba','Casa','Vivienda ficticia que todavía espera revisión.',70000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b3/photo.jpg'],'pending','active',now()-interval '8 days',now()),
 ('44000000-0000-4000-8000-0000000000b4','44000000-0000-4000-8000-000000000004','pro-b4','Casa de la inmobiliaria','Centro','Zona Pro Prueba','Casa','Vivienda ficticia publicada por la inmobiliaria.',80000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000004/pro-b4/photo.jpg'],'approved','active',now()-interval '9 days',now()),
 ('44000000-0000-4000-8000-0000000000b5','44000000-0000-4000-8000-000000000002','pro-b5','Casa en pausa','Kohly','Zona Pro Prueba','Casa','Vivienda ficticia pausada por quien la publica.',90000,100,2,1,'{}',array['44000000-0000-4000-8000-000000000002/pro-b5/photo.jpg'],'approved','paused',now()-interval '8 days',now());
insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)
 values('44000000-0000-4000-8000-0000000000b4','44000000-0000-4000-8000-0000000000a1','44000000-0000-4000-8000-000000000004','ref-b4','consent-b4');
-- b4 predates media assets: its legacy photo path would fail revalidation under the bump permit.
delete from kh_private.property_media_assets where property_id='44000000-0000-4000-8000-0000000000b4';
create temporary table bump_ctx(page jsonb,before_alerts bigint,owner_ad uuid);
insert into bump_ctx default values;
grant all on bump_ctx to authenticated;
create function pg_temp.bump_page(p_cursor text default null) returns jsonb language sql as $$
 select public.kh_search_properties(jsonb_build_object('sort','recent','query','','min_bedrooms',0,'amenities','[]'::jsonb,
  'with_total',true,'limit',2,'province','Zona Pro Prueba')||case when p_cursor is null then '{}'::jsonb else jsonb_build_object('cursor',p_cursor) end)
$$;

set local role authenticated;
-- Personal Pro: required, once a week, only for live listings of one's own.
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_PRO_REQUIRED');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Pago de prueba','44000000-0000-4000-8000-000000000002');
select pg_temp.pro_assert(public.kh_pro_badge('44000000-0000-4000-8000-000000000002'),'a Pro seller with a live listing shows the profile badge');
-- An account being deleted cannot bump; the same call works once the deletion is gone.
reset role;
insert into kh_private.account_deletions(user_id) values('44000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_ACCOUNT_DELETING');
reset role;
delete from kh_private.account_deletions where user_id='44000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.pro_assert((public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')->>'nextBumpAt')::timestamptz=now()+interval '7 days','a bump allows the next one in a week');
select pg_temp.pro_assert((select bumped_at=now() and version=1 and created_at=now()-interval '8 days' and updated_at=now()-interval '8 days' from public.properties where id='44000000-0000-4000-8000-0000000000b1'),'a bump moves only bumped_at');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_BUMP_TOO_SOON');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b2')$q$,'KH_BUMP_TOO_SOON');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b3')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b5')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b4')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000003','44000000-0000-4000-8000-0000000000b1')$q$,'KH_BUMP_NOT_ELIGIBLE');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000002','44000000-0000-4000-8000-0000000000b1')$q$,'KH_ACCOUNT_CHANGED');

-- «Más recientes» puts the bumped listing first, marks Pro rows and pages by the same key.
update bump_ctx set page=pg_temp.bump_page();
select pg_temp.pro_assert((select array_agg(r->>'id' order by o) from bump_ctx,jsonb_array_elements(page->'rows') with ordinality t(r,o))
 =array['44000000-0000-4000-8000-0000000000b1','44000000-0000-4000-8000-0000000000b2'],'the bumped listing leads «Más recientes»');
select pg_temp.pro_assert((select bool_and((r->>'is_pro')::boolean) from bump_ctx,jsonb_array_elements(page->'rows') r),'personal Pro marks both listings of the seller');
select pg_temp.pro_assert((select split_part(page->>'next_cursor','|',4)::timestamptz=now()-interval '1 day' from bump_ctx),'the cursor carries the ordering key');
update bump_ctx set page=pg_temp.bump_page(page->>'next_cursor');
select pg_temp.pro_assert((select page->'rows'->0->>'id'='44000000-0000-4000-8000-0000000000b4' and (page->'rows'->0->>'is_pro')::boolean is false
 and jsonb_array_length(page->'rows')=1 from bump_ctx),'the next page brings the agency listing, without Pro');

-- Agency Pro: any active member bumps what the agency published; no write permit is left behind.
select pg_temp.pro_as('44000000-0000-4000-8000-000000000005');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4')$q$,'KH_PRO_REQUIRED');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Pago inmobiliaria',null,'44000000-0000-4000-8000-0000000000a1');
-- Membership of another approved agency does not count.
select pg_temp.pro_as('44000000-0000-4000-8000-000000000007');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000007','44000000-0000-4000-8000-0000000000b4')$q$,'KH_BUMP_NOT_ELIGIBLE');
-- The agency module checks apply: kill switch, then a confirmed email.
reset role;
update kh_private.agency_settings set enabled=false;
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000005');
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4')$q$,'KH_AGENCY_DISABLED');
reset role;
update kh_private.agency_settings set enabled=true;
update auth.users set email_confirmed_at=null where id='44000000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.pro_error($q$select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4')$q$,'KH_EMAIL_UNCONFIRMED');
reset role;
update auth.users set email_confirmed_at=now() where id='44000000-0000-4000-8000-000000000005';
set local role authenticated;
select pg_temp.pro_assert((select bumped_at is null from public.properties where id='44000000-0000-4000-8000-0000000000b4'),'refused agency bumps change nothing');
select public.kh_bump_property('44000000-0000-4000-8000-000000000005','44000000-0000-4000-8000-0000000000b4');
reset role;
select pg_temp.pro_assert((select bumped_at=now() from public.properties where id='44000000-0000-4000-8000-0000000000b4')
 and not exists(select 1 from kh_private.agency_property_write_permits where property_id='44000000-0000-4000-8000-0000000000b4'),'a manager bumps an agency listing and no permit remains');

-- The official account's own listing alerts once when published and never again when bumped.
insert into storage.objects(bucket_id,name,owner_id) values('property-photos','44000000-0000-4000-8000-000000000001/pro-owner/photo.jpg','44000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000006');
select public.kh_save_search('44000000-0000-4000-8000-000000000006','{"name":"Todo La Habana","filters":{"province":"La Habana"},"enabled":true}');
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
update bump_ctx set owner_ad=(public.kh_save_property(jsonb_build_object('clientRequestId','pro-owner','title','Casa de la cuenta oficial','location','Vedado',
 'province','La Habana','type','Casa','description','Casa ficticia de la cuenta oficial para probar alertas.','price',70000,'area',90,'bedrooms',2,'bathrooms',1,
 'photoPaths',jsonb_build_array('44000000-0000-4000-8000-000000000001/pro-owner/photo.jpg'),'operation','sale'))->>'id')::uuid;
reset role;
select pg_temp.pro_as(null);
update public.properties set created_at=now()-interval '8 days' where id=(select owner_ad from bump_ctx);
update bump_ctx set before_alerts=(select count(*) from kh_private.notifications where recipient_id='44000000-0000-4000-8000-000000000006' and category='alert');
select pg_temp.pro_assert((select before_alerts>=1 from bump_ctx),'publishing alerted the watcher');
-- kh_notifications_alert_once would swallow a repeat, so clear the first alert and expect none.
delete from kh_private.notifications where recipient_id='44000000-0000-4000-8000-000000000006' and category='alert';
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000001');
select public.kh_admin_grant_pro('44000000-0000-4000-8000-000000000001',30,'Cuenta oficial','44000000-0000-4000-8000-000000000001');
select public.kh_bump_property('44000000-0000-4000-8000-000000000001',(select owner_ad from bump_ctx));
reset role;
select pg_temp.pro_assert((select count(*) from kh_private.notifications where recipient_id='44000000-0000-4000-8000-000000000006' and category='alert')
 =0,'a bump never alerts again');

-- Price history: inserts and price or availability changes, nothing else.
select pg_temp.pro_as(null);
select pg_temp.pro_assert((select count(*) from kh_private.property_price_history where property_id='44000000-0000-4000-8000-0000000000b2')=1,'an insert records the first price');
update public.properties set price=58000 where id='44000000-0000-4000-8000-0000000000b2';
update public.properties set description='Vivienda ficticia con otra descripción para la prueba.' where id='44000000-0000-4000-8000-0000000000b2';
update public.properties set availability='sold' where id='44000000-0000-4000-8000-0000000000b2';
update public.properties set price=price,availability=availability where id='44000000-0000-4000-8000-0000000000b2';
select pg_temp.pro_assert((select array_agg(price::int||':'||availability order by id) from kh_private.property_price_history where property_id='44000000-0000-4000-8000-0000000000b2')
 =array['60000:active','58000:active','58000:sold'],'only real price and availability changes are recorded, not a same-value write');
set local role authenticated;
select pg_temp.pro_as('44000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select * from kh_private.property_price_history$q$,'permission denied');
rollback;
