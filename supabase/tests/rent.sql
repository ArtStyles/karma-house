-- Rentals and what a wanted ad is after, through the RPCs. Reserved synthetic actors; everything rolls back.
-- L landlord (…0001), W looks for a home (…0002), A admin (…0003), S keeps saved searches (…0004).
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'RENT ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'RENT ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
-- Reads the private table for assertions only; every write goes through an RPC.
create function pg_temp.rent_alerts(p_recipient uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.seq),'[]'::jsonb) from kh_private.notifications n
  where n.recipient_id=p_recipient and n.category='alert';
$$;
create function pg_temp.rent_wanted(p_request text,p_price numeric,p_extra jsonb) returns uuid language sql as $$
  select (public.kh_save_property(jsonb_build_object('clientRequestId',p_request,'title','Busco '||p_request,'location','Vedado o Playa',
    'province','La Habana','type',null,'description','Busco vivienda ficticia para las pruebas de alquiler.','price',p_price,'area',null,
    'bedrooms',2,'bathrooms',null,'photoPaths','[]'::jsonb,'operation','wanted') || p_extra)->>'id')::uuid;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('29000000-0000-4000-8000-000000000001','kh-rent-landlord@example.invalid','{"display_name":"Arrendadora L"}'),
 ('29000000-0000-4000-8000-000000000002','kh-rent-wanted@example.invalid','{"display_name":"Inquilino W"}'),
 ('29000000-0000-4000-8000-000000000003','kh-rent-admin@example.invalid','{}'),
 ('29000000-0000-4000-8000-000000000004','kh-rent-searcher@example.invalid','{"display_name":"Buscadora S"}');
insert into public.kh_admins(user_id) values('29000000-0000-4000-8000-000000000003');
insert into storage.objects(bucket_id,name,owner_id) values
 ('property-photos','29000000-0000-4000-8000-000000000001/rent-month/photo.jpg','29000000-0000-4000-8000-000000000001');
create temporary table rent_context(month_id uuid, day_id uuid, w_rent uuid, w_old uuid, w_rent2 uuid, s_rent uuid, s_sale uuid);
insert into rent_context default values;
grant select,update on rent_context to authenticated;

set local role authenticated;

-- 1. L rents by the month with a three-month minimum, and by the night with no minimum (a draft).
select pg_temp.ops_as('29000000-0000-4000-8000-000000000001');
update rent_context set month_id=(public.kh_save_property('{
 "clientRequestId":"rent-month","title":"Apartamento en alquiler","location":"Vedado","province":"La Habana","type":"Apartamento",
 "description":"Apartamento amueblado con balcón, cerca del Malecón.","price":300,"area":80,"bedrooms":2,"bathrooms":1,
 "photoPaths":["29000000-0000-4000-8000-000000000001/rent-month/photo.jpg"],"operation":"rent","rentPeriod":"month","rentMinStay":3}')->>'id')::uuid;
update rent_context set day_id=(public.kh_save_property('{
 "clientRequestId":"rent-day","title":"Casa por noches","location":"Trinidad","province":"Sancti Spíritus","type":"Casa",
 "description":"Casa colonial con patio para estancias cortas.","price":40,"area":90,"bedrooms":2,"bathrooms":1,
 "photoPaths":[],"moderation":"draft","operation":"rent","rentPeriod":"day","rentMinStay":null}')->>'id')::uuid;
select pg_temp.ops_assert((select operation='rent' and rent_period='month' and rent_min_stay=3 and wanted_operations='{sale,swap}'
  from public.properties where id=(select month_id from rent_context)),'a monthly rental keeps its period and minimum stay');
select pg_temp.ops_assert((select operation='rent' and rent_period='day' and rent_min_stay is null
  from public.properties where id=(select day_id from rent_context)),'a nightly rental needs no minimum stay');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"rent-bad-1","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio y garaje, lista para entrar.","price":300,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"moderation":"draft","operation":"rent"}')$q$,'KH_INVALID_RENT');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"rent-bad-2","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio y garaje, lista para entrar.","price":300,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"moderation":"draft","operation":"rent","rentPeriod":"month","rentMinStay":400}')$q$,'KH_INVALID_RENT');
select pg_temp.ops_error($q$select public.kh_save_property('{"clientRequestId":"rent-bad-3","title":"Casa","location":"Vedado","province":"La Habana","type":"Casa","description":"Casa amplia con patio y garaje, lista para entrar.","price":300,"area":100,"bedrooms":2,"bathrooms":1,"photoPaths":[],"moderation":"draft","operation":"rent","rentPeriod":"week"}')$q$,'KH_INVALID_RENT');

-- 2. W says what the wanted ad is after; an unknown operation is rejected; an old payload buys or swaps.
select pg_temp.ops_as('29000000-0000-4000-8000-000000000002');
update rent_context set w_rent=pg_temp.rent_wanted('rent-wanted-1',500,'{"wantedOperations":["rent"]}');
select pg_temp.ops_assert((select wanted_operations='{rent}' from public.properties where id=(select w_rent from rent_context)),'a wanted ad can look only for a rental');
select pg_temp.ops_error($q$select pg_temp.rent_wanted('rent-wanted-bad',500,'{"wantedOperations":["buy"]}')$q$,'KH_INVALID_WANTED');
select pg_temp.ops_error($q$select pg_temp.rent_wanted('rent-wanted-bad',500,'{"wantedOperations":[]}')$q$,'KH_INVALID_WANTED');
select pg_temp.ops_error($q$select pg_temp.rent_wanted('rent-wanted-bad',500,'{"wantedOperations":["rent","rent"]}')$q$,'KH_INVALID_WANTED');
update rent_context set w_old=pg_temp.rent_wanted('rent-wanted-old',90000,'{}');
select pg_temp.ops_assert((select wanted_operations='{sale,swap}' from public.properties where id=(select w_old from rent_context)),'an old wanted payload buys or swaps');

-- 3. S saves one search for rentals and one for sales.
select pg_temp.ops_as('29000000-0000-4000-8000-000000000004');
update rent_context set s_rent=(public.kh_save_search('29000000-0000-4000-8000-000000000004',
  '{"name":"Alquileres","filters":{"province":"La Habana","operations":["rent"]},"enabled":true}')->>'id')::uuid;
update rent_context set s_sale=(public.kh_save_search('29000000-0000-4000-8000-000000000004',
  '{"name":"Ventas","filters":{"province":"La Habana","operations":["sale"]},"enabled":true}')->>'id')::uuid;

-- 4. A approves W's rental wanted ad, then L's rental: W and the rental search hear of it, the sale search does not.
select pg_temp.ops_as('29000000-0000-4000-8000-000000000003');
select public.kh_review_property(w_rent,'approved',null,1) from rent_context;
select public.kh_review_property(month_id,'approved',null,1) from rent_context;
select pg_temp.ops_assert((select count(*)=1 and bool_and((n->>'property_id')::uuid=c.month_id and n->>'saved_search_id' is null
    and n->>'title'='Una vivienda encaja con lo que buscas')
  from rent_context c, jsonb_array_elements(pg_temp.rent_alerts('29000000-0000-4000-8000-000000000002')) n),'W hears of the rental');
select pg_temp.ops_assert((select count(*) filter (where (n->>'saved_search_id')::uuid=c.s_rent and (n->>'property_id')::uuid=c.month_id)=1
    and count(*) filter (where (n->>'saved_search_id')::uuid=c.s_sale)=0
  from rent_context c, jsonb_array_elements(pg_temp.rent_alerts('29000000-0000-4000-8000-000000000004')) n),'the rental search is told, the sale search is not');

-- 5. W's buy-or-swap wanted ad does not reach L; a wanted ad that also rents does.
select public.kh_review_property(w_old,'approved',null,1) from rent_context;
select pg_temp.ops_assert(pg_temp.rent_alerts('29000000-0000-4000-8000-000000000001')='[]','a buy-or-swap wanted ad skips a landlord');
select pg_temp.ops_as('29000000-0000-4000-8000-000000000002');
update rent_context set w_rent2=pg_temp.rent_wanted('rent-wanted-2',400,'{"wantedOperations":["sale","rent"]}');
select pg_temp.ops_as('29000000-0000-4000-8000-000000000003');
select public.kh_review_property(w_rent2,'approved',null,1) from rent_context;
select pg_temp.ops_assert((select count(*)=1 and bool_and((n->>'property_id')::uuid=c.w_rent2 and n->>'title'='Alguien busca lo que publicas')
  from rent_context c, jsonb_array_elements(pg_temp.rent_alerts('29000000-0000-4000-8000-000000000001')) n),'L hears of the rental wanted ad');

-- 6. The catalogue hides rentals unless asked.
select pg_temp.ops_assert((select not exists (select 1 from jsonb_array_elements(public.kh_search_properties('{"limit":48}')->'rows') r where (r->>'id')::uuid=c.month_id)
  and exists (select 1 from jsonb_array_elements(public.kh_search_properties('{"limit":48,"operations":["rent"]}')->'rows') r where (r->>'id')::uuid=c.month_id)
  from rent_context c),'without operations the catalogue hides rentals; operations=[rent] shows them');
rollback;
