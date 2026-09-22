begin;
create or replace function pg_temp.cat_assert(ok boolean,description text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'CAT ASSERTION: %',description; end if; end $$;
create or replace function pg_temp.cat_error(statement text,expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise exception 'Expected %, got %',expected,sqlerrm; end;
  raise exception 'CAT ASSERTION: expected %',expected;
end $$;
-- Pages the whole catalogue through the cursor and returns every id it saw, in order.
create or replace function pg_temp.cat_walk(p_payload jsonb,p_limit int) returns text[] language plpgsql as $$
declare v jsonb; v_cursor text; v_ids text[] := '{}'; v_guard int := 0; begin
  loop
    v := public.kh_search_properties(p_payload || jsonb_build_object('limit',p_limit,'cursor',v_cursor));
    select v_ids || coalesce(array_agg(r->>'id'),'{}') into v_ids from jsonb_array_elements(v->'rows') r;
    v_cursor := v->>'next_cursor';
    v_guard := v_guard + 1;
    exit when v_cursor is null or v_guard > 50;
  end loop;
  return v_ids;
end $$;

insert into auth.users(id,email,raw_user_meta_data) values
('67000000-0000-4000-8000-000000000001','kh-cat-seller@example.invalid','{}');

insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,created_at,latitude,longitude,location_precision) values
('67000000-0000-4000-8000-00000000000a','67000000-0000-4000-8000-000000000001','cat-a','Casa luminosa en Residencial Brisa','Residencial Brisa','Zona QÁ Catálogo','Casa','Vivienda ficticia para probar la paginación del catálogo.',50000,100,2,1,'{Terraza}',ARRAY['67000000-0000-4000-8000-000000000001/cat-a/p.jpg'],'approved','2026-09-01T10:00:00Z',23.10,-82.38,'exact'),
('67000000-0000-4000-8000-00000000000b','67000000-0000-4000-8000-000000000001','cat-b','Apartamento sereno en Vedado','Vedado','Zona QÁ Catálogo','Apartamento','Vivienda ficticia para probar la paginación del catálogo.',60000,110,2,1,'{}',ARRAY['67000000-0000-4000-8000-000000000001/cat-b/p.jpg'],'approved','2026-09-02T10:00:00Z',23.11,-82.39,'exact'),
('67000000-0000-4000-8000-00000000000c','67000000-0000-4000-8000-000000000001','cat-c','Casa amplia en Matanzas','Reparto Norte','Zona QÁ Catálogo','Casa','Vivienda ficticia para probar la paginación del catálogo.',70000,120,3,2,'{}',ARRAY['67000000-0000-4000-8000-000000000001/cat-c/p.jpg'],'approved','2026-09-03T10:00:00Z',23.12,-82.40,'exact'),
('67000000-0000-4000-8000-00000000000d','67000000-0000-4000-8000-000000000001','cat-d','Apartamento con vista','Playa','Zona QÁ Catálogo','Apartamento','Vivienda ficticia para probar la paginación del catálogo.',80000,130,1,1,'{}',ARRAY['67000000-0000-4000-8000-000000000001/cat-d/p.jpg'],'approved','2026-09-04T10:00:00Z',null,null,null),
('67000000-0000-4000-8000-00000000000e','67000000-0000-4000-8000-000000000001','cat-e','Casa pendiente de revisión','Centro','Zona QÁ Catálogo','Casa','Vivienda ficticia que no debe aparecer en el catálogo público.',90000,140,2,1,'{}',ARRAY['67000000-0000-4000-8000-000000000001/cat-e/p.jpg'],'pending','2026-09-05T10:00:00Z',23.13,-82.41,'exact');

create temporary table kh_cat_context(base jsonb,ids text[],result jsonb);
insert into kh_cat_context(base) values (jsonb_build_object(
  'query','','type',null,'province','zona qa catalogo','condition',null,'min_price',null,'max_price',null,
  'min_area',null,'max_area',null,'min_bedrooms',0,'min_bathrooms',null,'negotiable_only',null,
  'amenities','[]'::jsonb,'sort','recent','cursor',null,'with_total',true,'limit',24));

-- Every query below is scoped by province to this suite's own rows, so the assertions hold
-- on a database that already has listings. The scope is written unaccented and lowercased
-- while the rows carry accents and capitals, which also proves the province filter matches
-- the way normalizeSearch does on the client.

-- Only approved and active listings reach the public catalogue, count included.
update kh_cat_context set result=public.kh_search_properties(base);
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=4,'total counts only approved active listings');
select pg_temp.cat_assert((select jsonb_array_length(result->'rows') from kh_cat_context)=4,'rows counts only approved active listings');
select pg_temp.cat_assert(not exists(select 1 from kh_cat_context,jsonb_array_elements(result->'rows') r where r->>'id'='67000000-0000-4000-8000-00000000000e'),'a pending listing never appears');
select pg_temp.cat_assert((select result->'rows'->0->>'search_vector' is null from kh_cat_context),'the tsvector is stripped from the payload');
select pg_temp.cat_assert((select result->'rows'->0->>'search_text' is null from kh_cat_context),'the unaccented column is stripped from the payload');

-- Keyset paging returns every row exactly once, in the requested order.
update kh_cat_context set ids=pg_temp.cat_walk(base,2);
select pg_temp.cat_assert((select array_length(ids,1) from kh_cat_context)=4,'paging by two covers every approved listing');
select pg_temp.cat_assert((select ids[1] from kh_cat_context)='67000000-0000-4000-8000-00000000000d','recent order starts with the newest');
select pg_temp.cat_assert((select ids[4] from kh_cat_context)='67000000-0000-4000-8000-00000000000a','recent order ends with the oldest');
select pg_temp.cat_assert((select count(distinct x) from kh_cat_context,unnest(ids) x)=4,'no listing is returned twice');

update kh_cat_context set ids=pg_temp.cat_walk(base||jsonb_build_object('sort','price-asc'),2);
select pg_temp.cat_assert((select ids[1] from kh_cat_context)='67000000-0000-4000-8000-00000000000a','price-asc starts with the cheapest');
select pg_temp.cat_assert((select ids[4] from kh_cat_context)='67000000-0000-4000-8000-00000000000d','price-asc ends with the dearest');
select pg_temp.cat_assert((select count(distinct x) from kh_cat_context,unnest(ids) x)=4,'price-asc returns each listing once');

update kh_cat_context set ids=pg_temp.cat_walk(base||jsonb_build_object('sort','area-desc'),3);
select pg_temp.cat_assert((select ids[1] from kh_cat_context)='67000000-0000-4000-8000-00000000000d','area-desc starts with the largest');

-- A listing approved between two pages must not duplicate or skip an existing row.
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('limit',2));
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,created_at)
values('67000000-0000-4000-8000-00000000000f','67000000-0000-4000-8000-000000000001','cat-f','Casa aprobada a mitad de paginación','Cerro','Zona QÁ Catálogo','Casa','Vivienda ficticia insertada entre dos páginas del catálogo.',95000,150,2,1,'{}',ARRAY['67000000-0000-4000-8000-000000000001/cat-f/p.jpg'],'approved','2026-09-06T10:00:00Z');
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('limit',2,'cursor',result->>'next_cursor'));
select pg_temp.cat_assert(not exists(select 1 from kh_cat_context,jsonb_array_elements(result->'rows') r where r->>'id' in ('67000000-0000-4000-8000-00000000000d','67000000-0000-4000-8000-00000000000c')),'a mid-paging insert never repeats a row already returned');
select pg_temp.cat_assert((select jsonb_array_length(result->'rows') from kh_cat_context)=2,'the second page still fills');
delete from public.properties where id='67000000-0000-4000-8000-00000000000f';

-- A cursor that does not match the active sort is refused rather than paging from nowhere.
select pg_temp.cat_error($$select public.kh_search_properties(jsonb_build_object('sort','recent','cursor','price-asc|none|x|1','query','','min_bedrooms',0,'amenities','[]'::jsonb,'with_total',true,'limit',2))$$,'KH_INVALID_CURSOR');
select pg_temp.cat_error($$select public.kh_search_properties(jsonb_build_object('sort','recent','cursor','recent|none|x','query','','min_bedrooms',0,'amenities','[]'::jsonb,'with_total',true,'limit',2))$$,'KH_INVALID_CURSOR');
select pg_temp.cat_error($$select public.kh_search_properties(jsonb_build_object('sort','nope','query','','min_bedrooms',0,'amenities','[]'::jsonb,'with_total',true,'limit',2))$$,'KH_INVALID_SORT');

-- Search: a word prefix answers through full text; a mid-word needle falls back to trigram.
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('query','bris'));
select pg_temp.cat_assert((select result->>'search_mode' from kh_cat_context)='fts','a word prefix is answered by full text');
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=1,'the prefix finds the one matching listing');

update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('query','risa'));
select pg_temp.cat_assert((select result->>'search_mode' from kh_cat_context)='trgm','a mid-word needle falls back to trigram');
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=1,'the trigram fallback still finds Brisa');

update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('query','ri'));
select pg_temp.cat_assert((select result->>'search_mode' from kh_cat_context)='fts','a two-character needle never reaches the unindexable substring path');

update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('query','zzzznoexiste'));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=0,'a needle matching nothing returns no rows');
select pg_temp.cat_assert((select jsonb_array_length(result->'rows') from kh_cat_context)=0,'a needle matching nothing returns an empty page');

-- Accents are ignored on both sides, matching normalizeSearch on the client.
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('query','revision'));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=0,'an unaccented needle still cannot reach a pending listing');

-- Filters.
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('type','Casa'));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=2,'the type filter narrows the count');
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('min_price',60000,'max_price',70000));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=2,'the price range narrows the count');
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('min_bedrooms',3));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=1,'the bedroom minimum narrows the count');
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('amenities','["terraza"]'::jsonb));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=1,'the amenity filter matches the unaccented amenity');
update kh_cat_context set result=public.kh_search_properties(base||jsonb_build_object('amenities','["terraza","piscina"]'::jsonb));
select pg_temp.cat_assert((select (result->>'total')::int from kh_cat_context)=0,'every requested amenity must be present');

-- The map returns individual pins below the threshold and refuses impossible bounds.
update kh_cat_context set result=public.kh_map_clusters(base||jsonb_build_object('west',-83,'south',22,'east',-82,'north',24,'zoom',10));
select pg_temp.cat_assert((select result->>'mode' from kh_cat_context)='points','a small box returns individual pins');
select pg_temp.cat_assert((select jsonb_array_length(result->'items') from kh_cat_context)=3,'only located approved listings are pinned');
select pg_temp.cat_assert(not exists(select 1 from kh_cat_context,jsonb_array_elements(result->'items') i where i->>'id'='67000000-0000-4000-8000-00000000000e'),'a pending listing is never pinned');
update kh_cat_context set result=public.kh_map_clusters(base||jsonb_build_object('west',-83,'south',23.115,'east',-82,'north',24,'zoom',10));
select pg_temp.cat_assert((select jsonb_array_length(result->'items') from kh_cat_context)=1,'the box excludes listings outside it');
select pg_temp.cat_error($$select public.kh_map_clusters(jsonb_build_object('west',-83,'south',50,'east',-82,'north',24,'zoom',10,'min_bedrooms',0,'amenities','[]'::jsonb))$$,'KH_INVALID_MAP_BOUNDS');
-- MapLibre reports a fractional zoom; a straight ::int cast on the text raised
-- 'invalid input syntax for type integer'. Every local test had used whole numbers.
update kh_cat_context set result=public.kh_map_clusters(base||jsonb_build_object('west',-83,'south',22,'east',-82,'north',24,'zoom',4.6));
select pg_temp.cat_assert((select result->>'mode' from kh_cat_context)='points','a fractional zoom is accepted');
update kh_cat_context set result=public.kh_map_clusters(base||jsonb_build_object('west',-83,'south',22,'east',-82,'north',24,'zoom',5.6));
select pg_temp.cat_assert((select jsonb_array_length(result->'items') from kh_cat_context)=3,'a fractional zoom returns the same pins as its whole number');

-- anon reads the same public catalogue and no more.
grant select on kh_cat_context to anon;
set local role anon;
select pg_temp.cat_assert((public.kh_search_properties((select base from kh_cat_context))->>'total')::int=4,'anon sees exactly the public catalogue');
select pg_temp.cat_assert(not exists(select 1 from jsonb_array_elements(public.kh_search_properties((select base from kh_cat_context))->'rows') r where r->>'moderation'<>'approved'),'anon never receives a non-approved row');
reset role;
rollback;
