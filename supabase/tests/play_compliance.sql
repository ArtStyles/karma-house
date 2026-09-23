-- Listing reports and account deletion. Everything rolls back; no real account is touched.
begin;
create or replace function pg_temp.play_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'PLAY ASSERTION FAILED: %',label; end if; end $$;
create or replace function pg_temp.play_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if position(expected in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected,sqlerrm;
  end;
  raise exception 'PLAY ASSERTION FAILED: expected %',expected;
end $$;
create or replace function pg_temp.play_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;

-- 1 seller, 2 buyer, 3 second reporter, 4 administrator.
insert into auth.users(id,email,raw_user_meta_data) values
 ('68000000-0000-4000-8000-000000000001','play-seller@example.invalid','{"display_name":"Vendedor temporal"}'),
 ('68000000-0000-4000-8000-000000000002','play-buyer@example.invalid','{"display_name":"Comprador temporal"}'),
 ('68000000-0000-4000-8000-000000000003','play-other@example.invalid','{"display_name":"Tercero temporal"}'),
 ('68000000-0000-4000-8000-000000000004','play-admin@example.invalid','{"display_name":"Revisor temporal"}');
insert into public.kh_admins(user_id) values('68000000-0000-4000-8000-000000000004');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values
 ('68000000-0000-4000-8000-000000000011','68000000-0000-4000-8000-000000000001','play-a','Casa reportada','Vedado','La Habana','Casa','Vivienda temporal usada en pruebas aisladas.',50000,80,2,1,array['68000000-0000-4000-8000-000000000001/play-a/p.jpg'],'approved'),
 ('68000000-0000-4000-8000-000000000012','68000000-0000-4000-8000-000000000001','play-b','Casa conversada','Playa','La Habana','Casa','Vivienda temporal usada en pruebas aisladas.',60000,90,2,1,array['68000000-0000-4000-8000-000000000001/play-b/p.jpg'],'approved'),
 ('68000000-0000-4000-8000-000000000013','68000000-0000-4000-8000-000000000001','play-c','Casa en revisión','Centro','La Habana','Casa','Vivienda temporal usada en pruebas aisladas.',70000,95,2,1,array['68000000-0000-4000-8000-000000000001/play-c/p.jpg'],'pending');
insert into storage.objects(bucket_id,name) values
 ('property-photos','68000000-0000-4000-8000-000000000001/play-a/p.jpg'),
 ('property-photos','68000000-0000-4000-8000-000000000001/play-b/p.jpg'),
 ('property-photos','68000000-0000-4000-8000-000000000001/play-c/p.jpg'),
 ('account-avatars','68000000-0000-4000-8000-000000000001/6a1b2c3d-0000-4000-8000-000000000001.jpg'),
 ('property-photos','68000000-0000-4000-8000-000000000002/other/keep.jpg');
insert into kh_private.account_avatars(owner_id,avatar_path) values('68000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001/6a1b2c3d-0000-4000-8000-000000000001.jpg');
create temporary table play_context(first_report uuid, conversation_id uuid, files jsonb);
insert into play_context default values;
grant select,update on play_context to authenticated;
set local role authenticated;

-- Reporting a listing.
select pg_temp.play_as('68000000-0000-4000-8000-000000000002');
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000011',gen_random_uuid(),'fraud','','68000000-0000-4000-8000-000000000003')$s$,'KH_ACCOUNT_CHANGED');
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000011',gen_random_uuid(),'spam','','68000000-0000-4000-8000-000000000002')$s$,'KH_REPORT_INVALID');
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000013',gen_random_uuid(),'fraud','','68000000-0000-4000-8000-000000000002')$s$,'KH_PROPERTY_NOT_FOUND');
update play_context set first_report=public.kh_report_property('68000000-0000-4000-8000-000000000011','6b000000-0000-4000-8000-000000000001','fraud','  Pide pago por adelantado  ','68000000-0000-4000-8000-000000000002');
select pg_temp.play_assert((select public.kh_report_property('68000000-0000-4000-8000-000000000011','6b000000-0000-4000-8000-000000000001','fraud','Pide pago por adelantado','68000000-0000-4000-8000-000000000002')=first_report from play_context),'a retry returns the same report');
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000011','6b000000-0000-4000-8000-000000000001','fraud','Otro texto','68000000-0000-4000-8000-000000000002')$s$,'KH_REPORT_CONFLICT');
select pg_temp.play_error($s$select * from public.kh_property_reports$s$,'permission denied');
select pg_temp.play_error($s$select public.kh_list_property_reports('68000000-0000-4000-8000-000000000002')$s$,'KH_ADMIN_REQUIRED');
select pg_temp.play_as('68000000-0000-4000-8000-000000000001');
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000011',gen_random_uuid(),'fraud','','68000000-0000-4000-8000-000000000001')$s$,'KH_REPORT_OWN_PROPERTY');
select pg_temp.play_as('68000000-0000-4000-8000-000000000003');
select public.kh_report_property('68000000-0000-4000-8000-000000000011',gen_random_uuid(),'misleading','','68000000-0000-4000-8000-000000000003');

-- Rate limit: ten reports a day per account.
select public.kh_report_property('68000000-0000-4000-8000-000000000012',gen_random_uuid(),'other','','68000000-0000-4000-8000-000000000003') from generate_series(1,9);
select pg_temp.play_error($s$select public.kh_report_property('68000000-0000-4000-8000-000000000012',gen_random_uuid(),'other','','68000000-0000-4000-8000-000000000003')$s$,'KH_REPORT_LIMIT');

-- Moderation: withdrawing the listing settles every open report about it.
select pg_temp.play_as('68000000-0000-4000-8000-000000000004');
select pg_temp.play_assert(jsonb_array_length(public.kh_list_property_reports('68000000-0000-4000-8000-000000000004'))=11,'the queue lists every open report');
select pg_temp.play_assert((select bool_and((r->>'propertyLive')::boolean) from jsonb_array_elements(public.kh_list_property_reports('68000000-0000-4000-8000-000000000004')) r),'reported listings are still live');
select pg_temp.play_error($s$select public.kh_review_property_report(first_report,'  ',true,'68000000-0000-4000-8000-000000000004') from play_context$s$,'KH_REVIEW_NOTE_REQUIRED');
select public.kh_review_property_report(first_report,'Retirado: pedía pagos por adelantado.',true,'68000000-0000-4000-8000-000000000004') from play_context;
select public.kh_review_property_report(first_report,'Retirado: pedía pagos por adelantado.',true,'68000000-0000-4000-8000-000000000004') from play_context;
select pg_temp.play_error($s$select public.kh_review_property_report(first_report,'Otra nota',false,'68000000-0000-4000-8000-000000000004') from play_context$s$,'KH_REPORT_ALREADY_REVIEWED');
select pg_temp.play_assert((select moderation='rejected' and review_note='Retirado: pedía pagos por adelantado.' from public.properties where id='68000000-0000-4000-8000-000000000011'),'the withdrawn listing tells its owner why');
select pg_temp.play_assert(jsonb_array_length(public.kh_list_property_reports('68000000-0000-4000-8000-000000000004'))=9,'both reports on the withdrawn listing left the queue');
select pg_temp.play_assert((select count(*)=2 and bool_and((r->>'unpublished')::boolean and not (r->>'propertyLive')::boolean) from jsonb_array_elements(public.kh_list_property_reports('68000000-0000-4000-8000-000000000004','reviewed')) r),'reviewed reports record the withdrawal');
select public.kh_review_property_report((public.kh_list_property_reports('68000000-0000-4000-8000-000000000004')->0->>'id')::uuid,'',false,'68000000-0000-4000-8000-000000000004');
select pg_temp.play_assert((select moderation='approved' from public.properties where id='68000000-0000-4000-8000-000000000012'),'dismissing a report leaves the listing published');

-- Account deletion, with a conversation and a favourite that must go with it.
select pg_temp.play_as('68000000-0000-4000-8000-000000000002');
update play_context set conversation_id=(public.kh_start_conversation('68000000-0000-4000-8000-000000000012','68000000-0000-4000-8000-000000000002')->>'id')::uuid;
select public.kh_send_message(conversation_id,gen_random_uuid(),'¿Sigue disponible?','68000000-0000-4000-8000-000000000002') from play_context;
insert into public.favorites(user_id,property_id) values('68000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000012');
select pg_temp.play_error($s$select public.kh_begin_account_deletion('68000000-0000-4000-8000-000000000001')$s$,'KH_ACCOUNT_CHANGED');
select pg_temp.play_error($s$select public.kh_delete_account('68000000-0000-4000-8000-000000000001')$s$,'KH_ACCOUNT_CHANGED');
select pg_temp.play_as('68000000-0000-4000-8000-000000000001');
select pg_temp.play_error($s$select public.kh_delete_account('68000000-0000-4000-8000-000000000001')$s$,'KH_ACCOUNT_FILES_REMAIN');
update play_context set files=public.kh_begin_account_deletion('68000000-0000-4000-8000-000000000001');
select pg_temp.play_assert((select jsonb_array_length(files->'property-photos')=3 and jsonb_array_length(files->'account-avatars')=1 from play_context),'begin returns only the owner''s own files');
select pg_temp.play_assert(public.kh_begin_account_deletion('68000000-0000-4000-8000-000000000001')=(select files from play_context),'begin can be retried');
select pg_temp.play_error($s$select public.kh_delete_account('68000000-0000-4000-8000-000000000001')$s$,'KH_ACCOUNT_FILES_REMAIN');
-- The client removes those files through the Storage API, which is allowed to delete rows.
reset role;
set local storage.allow_delete_query='true';
delete from storage.objects where name like '68000000-0000-4000-8000-000000000001/%';
set local role authenticated;
select pg_temp.play_as('68000000-0000-4000-8000-000000000001');
select public.kh_delete_account('68000000-0000-4000-8000-000000000001');
reset role;
select pg_temp.play_assert(not exists(select 1 from auth.users where id='68000000-0000-4000-8000-000000000001'),'the auth account is gone');
select pg_temp.play_assert(not exists(select 1 from public.profiles where id='68000000-0000-4000-8000-000000000001'),'the profile is gone');
select pg_temp.play_assert(not exists(select 1 from public.properties where owner_id='68000000-0000-4000-8000-000000000001'),'the listings are gone');
select pg_temp.play_assert(not exists(select 1 from public.kh_conversations where id=(select conversation_id from play_context)),'the conversation is gone');
select pg_temp.play_assert(not exists(select 1 from public.favorites where user_id='68000000-0000-4000-8000-000000000002'),'the buyer''s favourite of a deleted listing is gone');
select pg_temp.play_assert(exists(select 1 from storage.objects where name='68000000-0000-4000-8000-000000000002/other/keep.jpg'),'another account''s files are untouched');
select pg_temp.play_assert((select count(*) from public.kh_property_reports where owner_id='68000000-0000-4000-8000-000000000001')=11,'report evidence stays for moderation');
rollback;
