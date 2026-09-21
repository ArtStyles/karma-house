-- Database-owner regression; isolated fixtures are always rolled back by the runner.
begin;
create or replace function pg_temp.map_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'MAP ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.map_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'MAP ASSERTION FAILED: expected %',expected_message;
end $$;

select pg_temp.map_assert(kh_private.normalize_map_location('{"latitude":23.13587,"longitude":-82.395,"precision":"approximate"}') = '{"latitude":23.14,"longitude":-82.39,"precision":"approximate"}', 'server normalizes negative ties and strips precision');
select pg_temp.map_assert(kh_private.normalize_map_location('{"latitude":23.12345678,"longitude":-82.12345678,"precision":"exact"}') = '{"latitude":23.123457,"longitude":-82.123457,"precision":"exact"}', 'exact points use six decimals');
select pg_temp.map_assert(kh_private.normalize_map_location('null') = 'null', 'optional point');
select pg_temp.map_assert(kh_private.normalize_map_location('{"latitude":20.025,"longitude":-81.915,"precision":"approximate"}') = '{"latitude":20.02,"longitude":-81.92,"precision":"approximate"}', 'raw RPC normalization matches JavaScript binary coordinate ties');

insert into auth.users(id,email,raw_user_meta_data) values
 ('22000000-0000-4000-8000-000000000001','kh-map-seller@example.invalid','{"display_name":"Map test seller"}'),
 ('22000000-0000-4000-8000-000000000002','kh-map-buyer@example.invalid','{}'),
 ('22000000-0000-4000-8000-000000000003','kh-map-admin@example.invalid','{}');
insert into public.kh_admins(user_id) values('22000000-0000-4000-8000-000000000003');
create temporary table kh_map_context(payload jsonb, property_id uuid, legacy_id uuid);
insert into kh_map_context(payload) values ('{
 "clientRequestId":"map-regression","title":"Casa de prueba de mapa","location":"Vedado","province":"La Habana",
 "price":50000,"bedrooms":2,"bathrooms":1,"area":80,"type":"Casa",
 "description":"Vivienda ficticia para verificar la ubicación pública.","amenities":[],
 "photoPaths":["22000000-0000-4000-8000-000000000001/map-regression/photo.jpg"],"moderation":"pending",
 "mapLocation":{"latitude":23.13587,"longitude":-82.395,"precision":"approximate"}
}');
grant select,update on kh_map_context to anon,authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into storage.objects(bucket_id,name,owner_id) values ('property-photos','22000000-0000-4000-8000-000000000001/map-regression/photo.jpg','22000000-0000-4000-8000-000000000001');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":23}}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":"23","longitude":-82,"precision":"exact"}}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":91,"longitude":-82,"precision":"exact"}}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":23,"longitude":-181,"precision":"exact"}}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":23,"longitude":-82,"precision":"secret"}}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":[]}'') from kh_map_context','KH_INVALID_MAP_LOCATION');
update kh_map_context set property_id=(public.kh_save_property(payload)->>'id')::uuid;
select pg_temp.map_assert((select latitude=23.14 and longitude=-82.39 and location_precision='approximate' and moderation='pending' and version=1 from public.properties where id=(select property_id from kh_map_context)), 'only approximate public point stored');
select pg_temp.map_assert((select (public.kh_save_property(payload || '{"mapLocation":{"latitude":23.139,"longitude":-82.391,"precision":"approximate"}}')->>'version')::int=1 from kh_map_context),'equivalent approximate create retry does not duplicate');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":{"latitude":23.2,"longitude":-82.39,"precision":"approximate"}}'') from kh_map_context','KH_REQUEST_CONFLICT');
select pg_temp.map_error('update public.properties set latitude=23.13587 where id=(select property_id from kh_map_context)','permission denied');

select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select pg_temp.map_assert(not exists(select 1 from public.properties where id=(select property_id from kh_map_context)),'pending position hidden from buyer');
select pg_temp.map_error('select public.kh_save_property(payload || jsonb_build_object(''id'',property_id,''expectedVersion'',1)) from kh_map_context','KH_PROPERTY_NOT_FOUND');
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.kh_review_property(property_id,'approved',null,1) from kh_map_context;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);
select pg_temp.map_assert((select latitude=23.14 and longitude=-82.39 and location_precision='approximate' from public.properties where id=(select property_id from kh_map_context)),'anonymous API can read only rounded point after approval');
select pg_temp.map_error('select * from kh_private.property_save_requests','permission denied');
reset role;
select pg_temp.map_assert((select initial_payload->'mapLocation'='{"latitude":23.14,"longitude":-82.39,"precision":"approximate"}'::jsonb from kh_private.property_save_requests where property_id=(select property_id from kh_map_context)),'receipt never retains precise approximate input');
select pg_temp.map_error('update public.properties set latitude=null where id=(select property_id from kh_map_context)','KH_INVALID_MAP_LOCATION');
select pg_temp.map_error('update public.properties set longitude=''NaN''::numeric where id=(select property_id from kh_map_context)','KH_INVALID_MAP_LOCATION');

set local role authenticated;
select set_config('request.jwt.claim.sub','22000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update kh_map_context set payload=(payload-'mapLocation') || jsonb_build_object('id',property_id,'expectedVersion',2,'title','Casa editada por cliente antiguo');
select public.kh_save_property(payload) from kh_map_context;
select pg_temp.map_assert((select latitude=23.14 and longitude=-82.39 and location_precision='approximate' and moderation='pending' and version=3 from public.properties where id=(select property_id from kh_map_context)), 'omission preserves point and edit requires new moderation');
select pg_temp.map_assert((select (public.kh_save_property(payload)->>'version')::int=3 from kh_map_context),'legacy edit retry remains idempotent');
update kh_map_context set payload=payload || '{"expectedVersion":3,"mapLocation":{"latitude":23.12345678,"longitude":-82.12345678,"precision":"exact"}}';
select public.kh_save_property(payload) from kh_map_context;
select pg_temp.map_assert((select latitude=23.123457 and longitude=-82.123457 and location_precision='exact' and version=4 from public.properties where id=(select property_id from kh_map_context)), 'exact edit stores chosen point at six decimals');
select pg_temp.map_assert((select (public.kh_save_property(payload)->>'version')::int=4 from kh_map_context),'exact edit retry remains idempotent');
select pg_temp.map_error('select public.kh_save_property(payload || ''{"mapLocation":null}'') from kh_map_context','KH_VERSION_CONFLICT');
update kh_map_context set payload=payload || '{"expectedVersion":4,"mapLocation":null}';
select public.kh_save_property(payload) from kh_map_context;
select pg_temp.map_assert((select latitude is null and longitude is null and location_precision is null and version=5 from public.properties where id=(select property_id from kh_map_context)),'explicit null removes all coordinate fields');
select pg_temp.map_assert((select (public.kh_save_property(payload)->>'version')::int=5 from kh_map_context),'removal retry remains idempotent');
update kh_map_context set legacy_id=(public.kh_save_property((payload-'id'-'expectedVersion'-'mapLocation') || '{"clientRequestId":"map-legacy","moderation":"draft","photoPaths":[]}')->>'id')::uuid;
select pg_temp.map_assert((select latitude is null and longitude is null and location_precision is null from public.properties where id=(select legacy_id from kh_map_context)),'old clients can create listings without map coordinates');
select pg_temp.map_assert((select public.kh_save_property((payload-'id'-'expectedVersion'-'mapLocation') || '{"clientRequestId":"map-legacy","moderation":"draft","photoPaths":[]}')->>'id'=legacy_id::text from kh_map_context),'old creation retry remains idempotent');
reset role;
update public.properties set latitude=23.13587,longitude=-82.395,location_precision='approximate' where id=(select legacy_id from kh_map_context);
select pg_temp.map_assert((select latitude=23.14 and longitude=-82.39 from public.properties where id=(select legacy_id from kh_map_context)),'server trigger also normalizes privileged writes');
rollback;
