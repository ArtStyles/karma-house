-- Swap and wanted listings through the RPCs. Reserved synthetic actors; everything rolls back.
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'OPS ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'OPS ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('26000000-0000-4000-8000-000000000001','kh-ops-seller@example.invalid','{}'),
 ('26000000-0000-4000-8000-000000000002','kh-ops-admin@example.invalid','{}');
insert into public.kh_admins(user_id) values('26000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name,owner_id) values
 ('property-photos','26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg','26000000-0000-4000-8000-000000000001');
create temporary table ops_context(swap_id uuid, wanted_id uuid, sale_id uuid);
insert into ops_context default values;
grant select,update on ops_context to authenticated;

set local role authenticated;
select pg_temp.ops_as('26000000-0000-4000-8000-000000000001');

-- A swap with everything.
update ops_context set swap_id=(public.kh_save_property('{
 "clientRequestId":"ops-swap","title":"Casa para permutar","location":"Vedado","province":"La Habana","type":"Casa",
 "description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,
 "photoPaths":["26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg"],"operation":"swap",
 "swapWants":"Apartamento en Playa o Vedado con dos habitaciones.","swapProvinces":["La Habana","Artemisa"],"swapBalance":"pay","swapAmount":5000}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='swap' and swap_balance='pay' and swap_amount=5000 and swap_provinces=array['La Habana','Artemisa']
  from public.properties where id=(select swap_id from ops_context)),'the swap row keeps its fields');
-- A swap without what it wants, or with an amount and no balance, is rejected.
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-swap-2","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":[],"operation":"swap","swapBalance":"none"}')$q$,'KH_INVALID_SWAP');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-swap-3","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":[],"operation":"swap","swapWants":"Apartamento en Playa o Vedado con dos habitaciones.","swapBalance":"none","swapAmount":100}')$q$,'KH_INVALID_SWAP');
-- A wanted ad: no photos, no area, no bathrooms, no type, no map.
update ops_context set wanted_id=(public.kh_save_property('{
 "clientRequestId":"ops-wanted","title":"Busco apartamento en Playa","location":"Playa o Vedado","province":"La Habana","type":null,
 "description":"Busco apartamento con balcón, planta baja o con ascensor.","price":40000,"area":null,"bedrooms":2,"bathrooms":null,
 "photoPaths":[],"operation":"wanted","mapLocation":{"latitude":23.1,"longitude":-82.4,"precision":"exact"}}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='wanted' and type is null and area is null and bathrooms is null and latitude is null and cardinality(photo_paths)=0 and moderation='pending'
  from public.properties where id=(select wanted_id from ops_context)),'the wanted row drops what it does not describe');
-- An old payload without operation is a sale, and an unknown operation is rejected.
update ops_context set sale_id=(public.kh_save_property('{
 "clientRequestId":"ops-sale","title":"Casa en venta","location":"Vedado","province":"La Habana","type":"Casa",
 "description":"Casa amplia con patio y garaje, lista para entrar.","price":90000,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"moderation":"draft"}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='sale' from public.properties where id=(select sale_id from ops_context)),'no operation means a sale');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"ops-rent","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio y garaje, lista para entrar.","price":90000,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"operation":"rent"}')$q$,'KH_INVALID_OPERATION');
-- The operation cannot change on edit.
select pg_temp.ops_error((select format($q$select public.kh_save_property('{"id":"%s","expectedVersion":1,"clientRequestId":"ops-swap","title":"Casa para permutar","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio, la cambio por apartamento.","price":80000,"area":120,"bedrooms":3,"bathrooms":2,"photoPaths":["26000000-0000-4000-8000-000000000001/ops-swap/photo.jpg"],"operation":"sale"}')$q$, swap_id) from ops_context),'KH_OPERATION_LOCKED');

-- An admin approves the swap and the wanted ad through the review RPC; a wanted ad has no photos to check.
select pg_temp.ops_as('26000000-0000-4000-8000-000000000002');
select public.kh_review_property(swap_id,'approved',null,1) from ops_context;
select public.kh_review_property(wanted_id,'approved',null,1) from ops_context;
create temporary table ops_results as
  select 'default' as name, public.kh_search_properties('{"limit":48}') as r
  union all select 'wanted', public.kh_search_properties('{"limit":48,"operations":["wanted"]}')
  union all select 'swap', public.kh_search_properties('{"limit":48,"operations":["swap"]}');
select pg_temp.ops_assert((select not exists (select 1 from ops_results, jsonb_array_elements(r->'rows') row where name='default' and row->>'id'=(select wanted_id::text from ops_context))
  and exists (select 1 from ops_results, jsonb_array_elements(r->'rows') row where name='default' and row->>'id'=(select swap_id::text from ops_context))),
  'without operations the catalogue shows offers and hides wanted ads');
select pg_temp.ops_assert((select count(*)=1 and bool_and(row->>'id'=(select wanted_id::text from ops_context)) from ops_results, jsonb_array_elements(r->'rows') row where name='wanted'),'operations=[wanted] returns only the wanted ad');
select pg_temp.ops_assert((select count(*)=1 and bool_and(row->>'operation'='swap') from ops_results, jsonb_array_elements(r->'rows') row where name='swap'),'operations=[swap] returns only the swap');
select pg_temp.ops_error($q$select public.kh_search_properties('{"operations":["rent"]}')$q$,'KH_INVALID_OPERATION');
select pg_temp.ops_assert((select (public.kh_map_clusters('{"west":-180,"south":-90,"east":180,"north":90,"zoom":3,"operations":["wanted"]}')->'items') = '[]'::jsonb),'a wanted ad never lands on the map');
rollback;
