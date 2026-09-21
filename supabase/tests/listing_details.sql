-- Reserved synthetic actors; this entire suite must run inside a rolled-back transaction.
begin;
create or replace function pg_temp.details_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'DETAILS ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.details_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'DETAILS ASSERTION FAILED: expected %',expected_message;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('24000000-0000-4000-8000-000000000001','kh-details-seller@example.invalid','{}'),
 ('24000000-0000-4000-8000-000000000002','kh-details-buyer@example.invalid','{}'),
 ('24000000-0000-4000-8000-000000000003','kh-details-admin@example.invalid','{}');
insert into public.kh_admins(user_id) values('24000000-0000-4000-8000-000000000003');
create temporary table kh_details_context(payload jsonb, property_id uuid, legacy_id uuid);
insert into kh_details_context(payload) values ('{
 "clientRequestId":"details-regression","title":"Casa de prueba de detalles","location":"Vedado","province":"La Habana",
 "price":10000,"bedrooms":2,"bathrooms":1,"area":80,"type":"Casa",
 "description":"Vivienda ficticia para verificar datos opcionales.","amenities":["Patio"],
 "photoPaths":["24000000-0000-4000-8000-000000000001/details-regression/photo.jpg"],"moderation":"pending",
 "condition":"good","floor":0,"priceNegotiable":false
}');
grant select,update on kh_details_context to anon,authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name,owner_id) values ('property-photos','24000000-0000-4000-8000-000000000001/details-regression/photo.jpg','24000000-0000-4000-8000-000000000001');
update kh_details_context set property_id=(public.kh_save_property(payload)->>'id')::uuid;
select pg_temp.details_assert((select (public.kh_save_property(payload)->>'condition')='good' from kh_details_context), 'RPC persists condition rather than silently dropping new fields');
select pg_temp.details_assert((select condition='good' and floor=0 and price_negotiable=false and moderation='pending' and version=1 from public.properties where id=(select property_id from kh_details_context)), 'zero and false are explicit published values');
select pg_temp.details_assert((select (public.kh_save_property(payload)->>'version')::int=1 from kh_details_context),'create retry is idempotent');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"condition":"new"}'') from kh_details_context','KH_REQUEST_CONFLICT');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"condition":"bad"}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"condition":true}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"floor":-1}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"floor":100}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"floor":1.5}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"floor":"2"}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"priceNegotiable":"false"}'') from kh_details_context','KH_INVALID_PROPERTY_DETAILS');
select pg_temp.details_error('update public.properties set floor=2 where id=(select property_id from kh_details_context)','permission denied');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"ownerId":"24000000-0000-4000-8000-000000000002"}'') from kh_details_context','KH_ACCOUNT_CHANGED');

select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.details_assert(not exists(select 1 from public.properties where id=(select property_id from kh_details_context)), 'pending details stay private');
select pg_temp.details_error('select public.kh_save_property(payload || jsonb_build_object(''id'',property_id,''expectedVersion'',1)) from kh_details_context','KH_PROPERTY_NOT_FOUND');
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select pg_temp.details_error('select public.kh_save_property(payload || jsonb_build_object(''id'',property_id,''expectedVersion'',1)) from kh_details_context','KH_PROPERTY_NOT_FOUND');
select public.kh_review_property(property_id,'approved',null,1) from kh_details_context;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.details_assert((select condition='good' and floor=0 and price_negotiable=false from public.properties where id=(select property_id from kh_details_context)), 'public details are visible after approval');
select pg_temp.details_error('select public.kh_save_property(payload) from kh_details_context','permission denied');
reset role;
select pg_temp.details_error('update public.properties set condition=''invalid'' where id=(select property_id from kh_details_context)','properties_condition_valid');
select pg_temp.details_error('update public.properties set floor=100 where id=(select property_id from kh_details_context)','properties_floor_valid');

set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update kh_details_context set payload=(payload-'condition'-'floor'-'priceNegotiable') || jsonb_build_object('id',property_id,'expectedVersion',2,'title','Casa editada con app anterior');
select public.kh_save_property(payload) from kh_details_context;
select pg_temp.details_assert((select condition='good' and floor=0 and price_negotiable=false and moderation='pending' and version=3 from public.properties where id=(select property_id from kh_details_context)), 'legacy edits preserve details and require moderation again');
select pg_temp.details_assert((select (public.kh_save_property(payload)->>'version')::int=3 from kh_details_context), 'legacy edit retry is idempotent');
update kh_details_context set payload=payload || '{"expectedVersion":3,"condition":"needs-renovation","floor":99,"priceNegotiable":true}';
select public.kh_save_property(payload) from kh_details_context;
select pg_temp.details_assert((select condition='needs-renovation' and floor=99 and price_negotiable=true and version=4 from public.properties where id=(select property_id from kh_details_context)), 'updated values round trip');
select pg_temp.details_error('select public.kh_save_property(payload || ''{"floor":2}'') from kh_details_context','KH_VERSION_CONFLICT');
update kh_details_context set payload=payload || '{"expectedVersion":4,"condition":null,"floor":null,"priceNegotiable":null}';
select public.kh_save_property(payload) from kh_details_context;
select pg_temp.details_assert((select condition is null and floor is null and price_negotiable is null and version=5 from public.properties where id=(select property_id from kh_details_context)), 'null explicitly removes optional details');
select pg_temp.details_assert((select (public.kh_save_property(payload)->>'version')::int=5 from kh_details_context), 'clear retry is idempotent');
update kh_details_context set legacy_id=(public.kh_save_property((payload-'id'-'expectedVersion'-'condition'-'floor'-'priceNegotiable') || '{"clientRequestId":"details-legacy","moderation":"draft","photoPaths":[]}')->>'id')::uuid;
select pg_temp.details_assert((select condition is null and floor is null and price_negotiable is null from public.properties where id=(select legacy_id from kh_details_context)), 'legacy creation invents no values');
select pg_temp.details_assert((select public.kh_save_property((payload-'id'-'expectedVersion'-'condition'-'floor'-'priceNegotiable') || '{"clientRequestId":"details-legacy","moderation":"draft","photoPaths":[]}')->>'id'=legacy_id::text from kh_details_context), 'legacy creation retry returns same ID');
reset role;
rollback;
