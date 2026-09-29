-- Offers without a surface, through the RPCs. Reserved synthetic actors; everything rolls back.
-- L lists homes (…0001), S keeps a saved search (…0002), A admin (…0003).
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'AREA ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'AREA ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
-- Reads the private table for assertions only; every write goes through an RPC.
create function pg_temp.area_alerts(p_recipient uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.seq),'[]'::jsonb) from kh_private.notifications n
  where n.recipient_id=p_recipient and n.category='alert';
$$;
-- A sale titled «zafiro» so a query narrows the live catalogue to this suite's rows.
create function pg_temp.area_sale(p_request text,p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('clientRequestId',p_request,'title','Casa zafiro '||p_request,'location','Vedado',
    'province','La Habana','type','Casa','description','Casa ficticia para las pruebas de superficie opcional.','price',50000,
    'bedrooms',2,'bathrooms',1,'photoPaths',jsonb_build_array('30000000-0000-4000-8000-000000000001/'||p_request||'/photo.jpg'),
    'operation','sale','mapLocation',jsonb_build_object('latitude',21.123457,'longitude',-77.543211,'precision','exact')) || p_extra;
$$;
-- Whether a catalogue or map response lists the property.
create function pg_temp.area_has(p_rows jsonb, p_id uuid) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'id')::uuid=p_id);
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('30000000-0000-4000-8000-000000000001','kh-area-lister@example.invalid','{"display_name":"Vendedora L"}'),
 ('30000000-0000-4000-8000-000000000002','kh-area-searcher@example.invalid','{"display_name":"Buscador S"}'),
 ('30000000-0000-4000-8000-000000000003','kh-area-admin@example.invalid','{}');
insert into public.kh_admins(user_id) values('30000000-0000-4000-8000-000000000003');
insert into storage.objects(bucket_id,name,owner_id)
  select 'property-photos','30000000-0000-4000-8000-000000000001/'||r||'/photo.jpg','30000000-0000-4000-8000-000000000001'
  from unnest(array['area-none','area-given']) r;
create temporary table area_context(no_area uuid, with_area uuid, search uuid);
insert into area_context default values;
grant select,update on area_context to authenticated;

set local role authenticated;

-- 1. L saves a sale without area (stored null) and one with it; a present area keeps its range.
select pg_temp.ops_as('30000000-0000-4000-8000-000000000001');
update area_context set no_area=(public.kh_save_property(pg_temp.area_sale('area-none','{}'))->>'id')::uuid;
update area_context set with_area=(public.kh_save_property(pg_temp.area_sale('area-given','{"area":90}'))->>'id')::uuid;
select pg_temp.ops_assert((select area is null and operation='sale' from public.properties where id=(select no_area from area_context)),'a sale without area is stored with a null area');
select pg_temp.ops_error($q$select public.kh_save_property(pg_temp.area_sale('area-zero','{"area":0,"moderation":"draft","photoPaths":[]}'))$q$,'KH_INVALID_PROPERTY');
select pg_temp.ops_error($q$select public.kh_save_property(pg_temp.area_sale('area-huge','{"area":20000,"moderation":"draft","photoPaths":[]}'))$q$,'KH_INVALID_PROPERTY');

-- 2. S saves a search that both sales match.
select pg_temp.ops_as('30000000-0000-4000-8000-000000000002');
update area_context set search=(public.kh_save_search('30000000-0000-4000-8000-000000000002',
  '{"name":"Zafiro","filters":{"province":"La Habana","query":"zafiro"},"enabled":true}')->>'id')::uuid;

-- 3. A approves both; S hears of the sale without area.
select pg_temp.ops_as('30000000-0000-4000-8000-000000000003');
select public.kh_review_property(no_area,'approved',null,1) from area_context;
select public.kh_review_property(with_area,'approved',null,1) from area_context;
select pg_temp.ops_assert((select count(*) filter (where (n->>'property_id')::uuid=c.no_area and (n->>'saved_search_id')::uuid=c.search)=1
  from area_context c, jsonb_array_elements(pg_temp.area_alerts('30000000-0000-4000-8000-000000000002')) n),'a saved search hears of a sale without area');

-- 4. The catalogue returns it only with the flag, never under an area sort or an m² filter.
select pg_temp.ops_as('30000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert((select not pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro"}')->'rows',no_area)
  and pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro"}')->'rows',with_area) from area_context),
  'without optional_area the catalogue leaves out a sale without area');
select pg_temp.ops_assert((select pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro","optional_area":true}')->'rows',no_area) from area_context),
  'with optional_area the catalogue returns it');
select pg_temp.ops_assert((select not pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro","optional_area":true,"sort":"area-desc"}')->'rows',no_area)
  and pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro","optional_area":true,"sort":"area-desc"}')->'rows',with_area) from area_context),
  'sorting by area leaves it out');
select pg_temp.ops_assert((select not pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro","optional_area":true,"min_area":10}')->'rows',no_area)
  and pg_temp.area_has(public.kh_search_properties('{"limit":48,"query":"zafiro","optional_area":true,"min_area":10}')->'rows',with_area) from area_context),
  'an m² filter leaves it out');

-- 5. The map counts its point only with the flag.
select pg_temp.ops_assert((select pg_temp.area_has(public.kh_map_clusters('{"west":-77.5433,"south":21.1234,"east":-77.5431,"north":21.1235,"zoom":16,"optional_area":true}')->'items',no_area) from area_context),
  'with optional_area the map shows its point');
select pg_temp.ops_assert((select not pg_temp.area_has(public.kh_map_clusters('{"west":-77.5433,"south":21.1234,"east":-77.5431,"north":21.1235,"zoom":16}')->'items',no_area)
  and pg_temp.area_has(public.kh_map_clusters('{"west":-77.5433,"south":21.1234,"east":-77.5431,"north":21.1235,"zoom":16}')->'items',with_area) from area_context),
  'without optional_area the map leaves it out');
rollback;
