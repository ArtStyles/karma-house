-- Run as the database owner after the migration. All fixtures are rolled back.
-- These assertions cover PostgreSQL/RLS, not stored image bytes or Auth email delivery.
begin;

create function pg_temp.assert_true(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'ASSERTION FAILED: %', description; end if;
end $$;

create function pg_temp.assert_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin
    execute statement;
  exception when others then
    if position(expected_message in sqlerrm) > 0 then return; end if;
    raise exception 'Unexpected error (%): %', expected_message, sqlerrm;
  end;
  raise exception 'ASSERTION FAILED: expected error %', expected_message;
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
 ('11000000-0000-4000-8000-000000000001', 'kh-seller@example.invalid', '{"display_name":"Vendedor prueba"}'),
 ('11000000-0000-4000-8000-000000000002', 'kh-buyer@example.invalid', '{"display_name":"Comprador prueba"}'),
 ('11000000-0000-4000-8000-000000000003', 'kh-admin@example.invalid', '{"display_name":"Revisor prueba","role":"admin"}');

insert into kh_private.admin_invites (email) values ('kh-admin@example.invalid');
update auth.users set raw_user_meta_data = '{"role":"admin"}' where id = '11000000-0000-4000-8000-000000000003';
update auth.users set email_confirmed_at = null where id = '11000000-0000-4000-8000-000000000003';
select pg_temp.assert_true(not exists(select 1 from public.kh_admins where user_id = '11000000-0000-4000-8000-000000000003'), 'unverified metadata cannot assign admin');
update auth.users set email_confirmed_at = now() where id = '11000000-0000-4000-8000-000000000003';
select pg_temp.assert_true(exists(select 1 from public.kh_admins where user_id = '11000000-0000-4000-8000-000000000003'), 'verified invite assigns admin');
select pg_temp.assert_true(not exists(select 1 from kh_private.admin_invites where email = 'kh-admin@example.invalid'), 'admin invite consumed');

create temporary table kh_test_context (payload jsonb, property_id uuid);
insert into kh_test_context(payload) values ('{
 "clientRequestId":"regression-1", "title":"Casa de prueba", "location":"Vedado", "province":"La Habana",
 "price":"50000", "bedrooms":"2", "bathrooms":"1", "area":"80", "type":"Casa",
 "description":"Una vivienda de prueba para comprobar permisos.", "amenities":["Patio"],
 "photoPaths":["11000000-0000-4000-8000-000000000001/regression-1/photo.jpg"], "moderation":"pending"
}');
grant select, update on kh_test_context to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"ownerId":"11000000-0000-4000-8000-000000000002"}''::jsonb) from kh_test_context', 'KH_ACCOUNT_CHANGED');
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"bedrooms":"1.5"}''::jsonb) from kh_test_context', 'KH_INVALID_PROPERTY');
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"price":"100000001"}''::jsonb) from kh_test_context', 'KH_INVALID_PROPERTY');
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"photoPaths":[]}''::jsonb) from kh_test_context', 'KH_INVALID_PHOTOS');
select pg_temp.assert_error('select public.kh_save_property(payload) from kh_test_context', 'KH_PHOTO_NOT_FOUND');
insert into storage.objects (bucket_id,name,owner_id) values
 ('property-photos', '11000000-0000-4000-8000-000000000001/regression-1/photo.jpg', '11000000-0000-4000-8000-000000000001'),
 ('property-photos', '11000000-0000-4000-8000-000000000001/regression-1/unused.jpg', '11000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*) = 2 from storage.objects where bucket_id='property-photos'), 'owner reads unreferenced uploads');
update kh_test_context set property_id = (public.kh_save_property(payload)->>'id')::uuid;
select pg_temp.assert_true((select count(*) = 1 from public.properties), 'owner sees pending row');
select pg_temp.assert_true((select moderation='pending' and version=1 from public.properties), 'new row is pending version one');
select pg_temp.assert_true((select public.kh_save_property(payload)->>'id' = property_id::text from kh_test_context), 'create retry returns same id');
select pg_temp.assert_true((select count(*) = 1 from public.properties), 'retry never duplicates');
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"title":"Changed retry"}''::jsonb) from kh_test_context', 'KH_REQUEST_CONFLICT');
select pg_temp.assert_error('select public.kh_save_property(payload || ''{"clientRequestId":"bad-photo","photoPaths":["11000000-0000-4000-8000-000000000002/bad-photo/photo.jpg"]}''::jsonb) from kh_test_context', 'KH_INVALID_PHOTO_PATH');
select pg_temp.assert_error('update public.properties set moderation=''approved''', 'permission denied');
select pg_temp.assert_error('insert into public.kh_admins(user_id) values (auth.uid())', 'permission denied');
select pg_temp.assert_error('select public.kh_review_property(property_id,''approved'',null,1) from kh_test_context', 'KH_ADMIN_REQUIRED');
-- Storage prohibits raw SQL DELETE even for fixtures. Verify the policy predicate here;
-- verify-cloud.mjs proves deletion/nondeletion through the actual Storage API.
select pg_temp.assert_true(not kh_private.photo_delete_allowed('11000000-0000-4000-8000-000000000001/regression-1/photo.jpg'), 'attached photo is ineligible for deletion');
select pg_temp.assert_true(kh_private.photo_delete_allowed('11000000-0000-4000-8000-000000000001/regression-1/unused.jpg'), 'unattached owner photo is eligible for deletion');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(not exists(select 1 from public.properties), 'buyer cannot see pending row');
select pg_temp.assert_true(not exists(select 1 from storage.objects where bucket_id='property-photos'), 'buyer cannot read pending photos');
select pg_temp.assert_error('insert into public.favorites(user_id, property_id) select auth.uid(), property_id from kh_test_context', 'row-level security');
select pg_temp.assert_error('select public.kh_set_property_status(property_id,''sold'') from kh_test_context', 'KH_PROPERTY_NOT_FOUND');
select pg_temp.assert_error('insert into storage.objects(bucket_id,name,owner_id) values (''property-photos'',''11000000-0000-4000-8000-000000000001/regression-1/attack.jpg'',auth.uid()::text)', 'row-level security');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_true(public.kh_is_admin(), 'admin recognition');
select pg_temp.assert_true((select count(*)=1 from public.properties), 'admin sees pending row');
select public.kh_review_property(property_id,'approved',null,1) from kh_test_context;
select pg_temp.assert_error('select public.kh_review_property(property_id,''rejected'',''Stale review'',1) from kh_test_context', 'KH_VERSION_CONFLICT');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_true((select count(*)=1 from public.properties), 'anonymous reader sees approved active row');
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='property-photos'), 'anonymous reader sees approved photo');
select pg_temp.assert_true((select count(*)=1 from public.profiles), 'only public seller profile exposed anonymously');
select pg_temp.assert_error('select public.kh_save_property(payload) from kh_test_context', 'permission denied');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
insert into public.favorites(user_id,property_id) select auth.uid(),property_id from kh_test_context;
select pg_temp.assert_true((select count(*)=1 from public.favorites), 'buyer stores favorite');
select pg_temp.assert_error('insert into public.favorites(user_id,property_id) select ''11000000-0000-4000-8000-000000000001'',property_id from kh_test_context', 'row-level security');
update storage.objects set metadata='{}' where bucket_id='property-photos';
select pg_temp.assert_true(not exists(select 1 from storage.objects where metadata='{}'), 'buyer cannot overwrite photo metadata');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true(not exists(select 1 from public.favorites), 'favorites remain private to buyer');
select pg_temp.assert_true((select (public.kh_save_property(payload)->>'moderation')='approved' from kh_test_context), 'original creation retry preserves approval');
select public.kh_set_property_status(property_id,'paused') from kh_test_context;
select pg_temp.assert_true((select moderation='approved' and availability='paused' and version=3 from public.properties), 'availability independent of moderation');
select public.kh_set_property_status(property_id,'active') from kh_test_context;
select pg_temp.assert_error('select public.kh_save_property(payload || jsonb_build_object(''id'',property_id,''expectedVersion'',1,''title'',''Stale edit'')) from kh_test_context', 'KH_VERSION_CONFLICT');
update kh_test_context set payload = payload || jsonb_build_object('id',property_id,'expectedVersion',4,'title','Casa editada');
select public.kh_save_property(payload) from kh_test_context;
select pg_temp.assert_true((select moderation='pending' and version=5 and review_note is null from public.properties), 'edit resets moderation and increments version');
select public.kh_save_property(payload) from kh_test_context;
select pg_temp.assert_true((select version=5 from public.properties), 'immediate repeated edit does not increment version');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(not exists(select 1 from public.properties), 'edited pending property disappears for buyer');
select pg_temp.assert_true(not exists(select 1 from storage.objects where bucket_id='property-photos'), 'edited pending photos disappear for buyer');
select pg_temp.assert_true((select count(*)=1 from public.favorites), 'saved favorite survives visibility change');
delete from public.favorites where user_id=auth.uid();
select pg_temp.assert_true(not exists(select 1 from public.favorites), 'favorite can be removed while listing hidden');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.assert_error('select public.kh_review_property(property_id,''rejected'','''',5) from kh_test_context', 'KH_REVIEW_NOTE_REQUIRED');
select public.kh_review_property(property_id,'rejected','Completar los detalles de la vivienda.',5) from kh_test_context;
select pg_temp.assert_true((select moderation='rejected' and review_note is not null and version=6 from public.properties), 'rejection stores required note');

select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.kh_submit_property(property_id) from kh_test_context;
select public.kh_submit_property(property_id) from kh_test_context;
select pg_temp.assert_true((select moderation='pending' and review_note is null and version=7 from public.properties), 'resubmission clears rejection and retry is safe');
select public.kh_save_property((payload - 'id' - 'expectedVersion') || '{"clientRequestId":"regression-draft","photoPaths":[],"moderation":"draft"}'::jsonb) from kh_test_context;
select pg_temp.assert_true((select count(*)=1 from public.properties where moderation='draft'), 'draft can have zero photos');
select pg_temp.assert_error('select public.kh_submit_property(id) from public.properties where moderation=''draft''', 'KH_INVALID_PHOTOS');

reset role;
select pg_temp.assert_true((select public=false and file_size_limit=4194304 from storage.buckets where id='property-photos'), 'private 4MB bucket');
select 'cloud_marketplace SQL assertions passed; fixtures will roll back' as result;
rollback;
