-- Saved searches and alerts through the RPCs. Reserved synthetic actors; everything rolls back.
-- A seller (…0001), B buyer (…0002), C admin (…0003), D seller (…0004, mutually blocked with A).
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'ALERTS ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'ALERTS ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
-- Reads the private table for assertions only; every write goes through an RPC.
create function pg_temp.sa_alerts(p_recipient uuid) returns jsonb language sql security definer as $$
  select coalesce(jsonb_agg(to_jsonb(n) order by n.seq),'[]'::jsonb) from kh_private.notifications n
  where n.recipient_id=p_recipient and n.category='alert';
$$;
create function pg_temp.sa_sale(p_owner uuid,p_request text,p_price numeric,p_bedrooms integer) returns uuid language sql as $$
  select (public.kh_save_property(jsonb_build_object('clientRequestId',p_request,'title','Casa '||p_request,'location','Vedado',
    'province','La Habana','type','Casa','description','Casa ficticia para las pruebas de alertas.','price',p_price,'area',100,
    'bedrooms',p_bedrooms,'bathrooms',1,'photoPaths',jsonb_build_array(p_owner::text||'/'||p_request||'/photo.jpg'),'operation','sale'))->>'id')::uuid;
$$;
create function pg_temp.sa_wanted(p_request text,p_price numeric) returns uuid language sql as $$
  select (public.kh_save_property(jsonb_build_object('clientRequestId',p_request,'title','Busco casa '||p_request,'location','Vedado o Playa',
    'province','La Habana','type',null,'description','Busco vivienda ficticia para las pruebas de alertas.','price',p_price,'area',null,
    'bedrooms',2,'bathrooms',null,'photoPaths','[]'::jsonb,'operation','wanted'))->>'id')::uuid;
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('28000000-0000-4000-8000-000000000001','kh-alerts-seller-a@example.invalid','{"display_name":"Vendedora A"}'),
 ('28000000-0000-4000-8000-000000000002','kh-alerts-buyer@example.invalid','{"display_name":"Comprador B"}'),
 ('28000000-0000-4000-8000-000000000003','kh-alerts-admin@example.invalid','{}'),
 ('28000000-0000-4000-8000-000000000004','kh-alerts-seller-d@example.invalid','{"display_name":"Vendedor D"}');
insert into public.kh_admins(user_id) values('28000000-0000-4000-8000-000000000003');
insert into public.kh_user_blocks(blocker_id,blocked_id) values
 ('28000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000004'),
 ('28000000-0000-4000-8000-000000000004','28000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name,owner_id)
  select 'property-photos','28000000-0000-4000-8000-000000000001/'||r||'/photo.jpg','28000000-0000-4000-8000-000000000001'
  from unnest(array['alert-sale-1','alert-sale-2','alert-sale-3']) r
  union all select 'property-photos','28000000-0000-4000-8000-000000000004/alert-sale-d/photo.jpg','28000000-0000-4000-8000-000000000004';
create temporary table sa_context(s1 uuid,s2 uuid,s3 uuid,filler uuid,w1 uuid,w2 uuid,w3 uuid,d_sale uuid,a1 uuid,a2 uuid,a3 uuid);
insert into sa_context default values;
grant select,update on sa_context to authenticated;

set local role authenticated;

-- 2. Saved searches: create, normalize, reject, version, limit, delete.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
update sa_context set s1=(public.kh_save_search('28000000-0000-4000-8000-000000000002',
  '{"name":"  Casas en La Habana ","filters":{"province":"La Habana","max_price":100000,"type":"Casa"},"enabled":true}')->>'id')::uuid;
select pg_temp.ops_assert((select r->>'name'='Casas en La Habana' and (r->>'version')::int=1 and r->'filters'='{"query":"","type":"Casa","province":"La Habana","condition":null,
  "min_price":null,"max_price":100000,"min_area":null,"max_area":null,"min_bedrooms":0,"min_bathrooms":null,"negotiable_only":null,
  "amenities":[],"operations":["sale","swap"]}'::jsonb
  from (select public.kh_list_saved_searches('28000000-0000-4000-8000-000000000002')->0 as r) x),'the name is trimmed and the filters take the catalogue shape');
select pg_temp.ops_assert(public.kh_save_search('28000000-0000-4000-8000-000000000002',
  '{"name":"Normalizada","filters":{"query":"  Vedado Ñico ","amenities":["Patio","patio "," "],"operations":["wanted","sale","sale"],"min_bathrooms":0,"negotiable_only":true},"enabled":false}')->'filters'
  @> '{"query":"vedado nico","amenities":["patio"],"operations":["sale","wanted"],"min_bathrooms":null,"negotiable_only":true}'::jsonb,
  'query and amenities are unaccented and lowercased, operations deduplicated');
select public.kh_delete_saved_search('28000000-0000-4000-8000-000000000002',(r->>'id')::uuid)
  from jsonb_array_elements(public.kh_list_saved_searches('28000000-0000-4000-8000-000000000002')) r where r->>'name'='Normalizada';
update sa_context set s2=(public.kh_save_search('28000000-0000-4000-8000-000000000002',
  '{"name":"Matanzas","filters":{"province":"Matanzas"},"enabled":true}')->>'id')::uuid;
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"x","filters":{"foo":1},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"x","filters":{"min_price":5,"max_price":1},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"x","filters":{"operations":[]},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"x","filters":{"province":"Narnia"},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"x","filters":{"min_price":"5"},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"   ","filters":{},"enabled":true}')$q$,'KH_SEARCH_INVALID');
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000001','{"name":"x","filters":{},"enabled":true}')$q$,'KH_ACCOUNT_CHANGED');
select pg_temp.ops_error((select format($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"id":"%s","expectedVersion":5,"name":"Matanzas","filters":{"province":"Matanzas"},"enabled":false}')$q$,s2) from sa_context),'KH_SEARCH_CONFLICT');
select pg_temp.ops_assert((select (public.kh_save_search('28000000-0000-4000-8000-000000000002',
  jsonb_build_object('id',s2,'expectedVersion',1,'name','Matanzas','filters',jsonb_build_object('province','Matanzas'),'enabled',true))->>'version')::int=2 from sa_context),
  'an edit with the current version bumps it');
select public.kh_save_search('28000000-0000-4000-8000-000000000002',jsonb_build_object('name','Relleno '||i,'filters',jsonb_build_object('province','Holguín'),'enabled',true))
  from generate_series(1,8) i;
select pg_temp.ops_error($q$select public.kh_save_search('28000000-0000-4000-8000-000000000002','{"name":"Undécima","filters":{},"enabled":true}')$q$,'KH_SEARCH_LIMIT');
select pg_temp.ops_assert((select jsonb_array_length(l)=10 and exists (select 1 from jsonb_array_elements(l) r where (r->>'id')::uuid=(select s1 from sa_context))
  from (select public.kh_list_saved_searches('28000000-0000-4000-8000-000000000002') l) x),'the list returns all ten, s1 included');
update sa_context set filler=(select (r->>'id')::uuid from jsonb_array_elements(public.kh_list_saved_searches('28000000-0000-4000-8000-000000000002')) r where r->>'name'='Relleno 1');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
select pg_temp.ops_error((select format($q$select public.kh_delete_saved_search('28000000-0000-4000-8000-000000000001','%s')$q$,filler) from sa_context),'KH_SEARCH_NOT_FOUND');
select pg_temp.ops_error((select format($q$select public.kh_save_search('28000000-0000-4000-8000-000000000001','{"id":"%s","expectedVersion":1,"name":"Ajena","filters":{},"enabled":true}')$q$,s1) from sa_context),'KH_SEARCH_NOT_FOUND');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select public.kh_delete_saved_search('28000000-0000-4000-8000-000000000002',filler) from sa_context;
select pg_temp.ops_error((select format($q$select public.kh_delete_saved_search('28000000-0000-4000-8000-000000000002','%s')$q$,filler) from sa_context),'KH_SEARCH_NOT_FOUND');

-- 3. B publishes a wanted ad; C approves it. No sale exists yet, so nobody is told.
update sa_context set w1=pg_temp.sa_wanted('alert-wanted-1',90000);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(w1,'approved',null,1) from sa_context;

-- 4. D's sale fits s1 and B's wanted ad, not s2.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000004');
update sa_context set d_sale=pg_temp.sa_sale('28000000-0000-4000-8000-000000000004','alert-sale-d',80000,3);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(d_sale,'approved',null,1) from sa_context;
select pg_temp.ops_assert((select count(*)=2 and bool_and((n->>'property_id')::uuid=c.d_sale)
  and count(*) filter (where (n->>'saved_search_id')::uuid=c.s1 and n->>'title'='Nueva vivienda para tu búsqueda'
    and n->>'body'='Casas en La Habana: Casa alert-sale-d, 80,000 USD, Vedado' and n->>'actor_name'='Vendedor D')=1
  and count(*) filter (where n->>'saved_search_id' is null and n->>'title'='Una vivienda encaja con lo que buscas')=1
  and count(*) filter (where (n->>'saved_search_id')::uuid=c.s2)=0
  from sa_context c, jsonb_array_elements(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002')) n
  ),'B gets one alert for s1 and one for the wanted ad, none for s2');
select pg_temp.ops_assert(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000001')='[]' and pg_temp.sa_alerts('28000000-0000-4000-8000-000000000004')='[]','A and D get nothing');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert(jsonb_array_length(public.kh_list_notifications('28000000-0000-4000-8000-000000000002')->'items')=0,'an old client lists no alerts');
select pg_temp.ops_assert(jsonb_array_length(public.kh_list_notifications('28000000-0000-4000-8000-000000000002',p_include_alerts=>true)->'items')=2,'a new client lists both alerts');
select pg_temp.ops_assert((select bool_and(i->>'conversationId' is null and (i->>'propertyId')::uuid=c.d_sale and i->>'category'='alert')
  from sa_context c, jsonb_array_elements(public.kh_list_notifications('28000000-0000-4000-8000-000000000002',p_include_alerts=>true)->'items') i),'alert items carry a property and no conversation');
select pg_temp.ops_assert(jsonb_array_length(public.kh_list_notifications('28000000-0000-4000-8000-000000000002',p_category=>'alert')->'items')=2,'the alert category lists alerts');
select pg_temp.ops_assert((public.kh_notification_summary('28000000-0000-4000-8000-000000000002',true)->>'unreadCount')::int=2
  and (public.kh_notification_summary('28000000-0000-4000-8000-000000000002')->>'unreadCount')::int=0,'only a new client counts alerts');
select pg_temp.ops_error($q$select public.kh_list_notifications('28000000-0000-4000-8000-000000000002',p_category=>'message')$q$,'KH_NOTIFICATION_INVALID');

-- 5. A's sale fits s1 and the wanted ad; a copy of s1 adds one more; replaying the fan-out adds nothing.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
update sa_context set a1=pg_temp.sa_sale('28000000-0000-4000-8000-000000000001','alert-sale-1',70000,2);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(a1,'approved',null,1) from sa_context;
select pg_temp.ops_assert(jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002'))=4,'A''s first sale adds two alerts for B');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
update sa_context set s3=(public.kh_save_search('28000000-0000-4000-8000-000000000002',
  '{"name":"Copia","filters":{"province":"La Habana","max_price":100000,"type":"Casa"},"enabled":true}')->>'id')::uuid;
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
update sa_context set a2=pg_temp.sa_sale('28000000-0000-4000-8000-000000000001','alert-sale-2',75000,2);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(a2,'approved',null,1) from sa_context;
select pg_temp.ops_assert((select count(*)=3 and count(distinct coalesce(n->>'saved_search_id','wanted'))=3
  and bool_or((n->>'saved_search_id')::uuid=c.s1) and bool_or((n->>'saved_search_id')::uuid=c.s3)
  from sa_context c, jsonb_array_elements(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002')) n
  where (n->>'property_id')::uuid=c.a2),'the second sale alerts s1, s3 and the wanted ad');
reset role;
select kh_private.alert_on_approval(p) from public.properties p where p.id=(select a2 from sa_context);
select pg_temp.ops_assert(jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002'))=7,'replaying an approval never duplicates');
set local role authenticated;

-- 6. alerts=false stops new alerts; a 0.1.7 client that omits `alerts` keeps it off.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert(public.kh_save_notification_preferences('28000000-0000-4000-8000-000000000002',
  '{"messages":true,"visits":true,"offers":true,"alerts":false,"expectedVersion":0}')-'agencies'='{"messages":true,"visits":true,"offers":true,"alerts":false,"version":1}','alerts can be turned off');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
update sa_context set a3=pg_temp.sa_sale('28000000-0000-4000-8000-000000000001','alert-sale-3',72000,2);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(a3,'approved',null,1) from sa_context;
select pg_temp.ops_assert(jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002'))=7,'a muted recipient gets no alert');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert(public.kh_save_notification_preferences('28000000-0000-4000-8000-000000000002',
  '{"messages":true,"visits":false,"offers":true,"expectedVersion":1}')-'agencies'='{"messages":true,"visits":false,"offers":true,"alerts":false,"version":2}','an old client keeps alerts off');
select pg_temp.ops_assert(to_regclass('kh_private.agency_settings') is null or public.kh_get_notification_preferences('28000000-0000-4000-8000-000000000002')->>'agencies'='true','old client omission preserves the added agency preference');
select pg_temp.ops_assert(public.kh_save_notification_preferences('28000000-0000-4000-8000-000000000002',
  '{"messages":true,"visits":false,"offers":true,"expectedVersion":1}')->>'version'='2','an old client replay is idempotent');
select pg_temp.ops_error($q$select public.kh_save_notification_preferences('28000000-0000-4000-8000-000000000002','{"messages":true,"visits":true,"offers":true,"alerts":null,"expectedVersion":2}')$q$,'KH_NOTIFICATION_INVALID');
select public.kh_save_notification_preferences('28000000-0000-4000-8000-000000000002','{"messages":true,"visits":true,"offers":true,"alerts":true,"expectedVersion":2}');

-- 7. A new wanted ad tells each seller whose active sale fits, once per seller; never its owner.
update sa_context set w2=pg_temp.sa_wanted('alert-wanted-2',100000);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(w2,'approved',null,1) from sa_context;
select pg_temp.ops_assert((select count(*)=1 and bool_and((n->>'property_id')::uuid=c.w2 and n->>'title'='Alguien busca lo que publicas'
    and n->>'body'='Busco casa alert-wanted-2, hasta 100,000 USD, Vedado o Playa' and n->>'actor_name'='Comprador B')
  from sa_context c, jsonb_array_elements(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000001')) n),'A gets one alert for three fitting sales');
select pg_temp.ops_assert((select count(*)=1 and bool_and((n->>'property_id')::uuid=c.w2)
  from sa_context c, jsonb_array_elements(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000004')) n),'D gets one too');
select pg_temp.ops_assert(jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002'))=7,'the owner of the wanted ad is never told about it');

-- 8. A blocks B: a new wanted ad from B no longer reaches A, and the earlier alert hides.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select public.kh_start_conversation(a1,'28000000-0000-4000-8000-000000000002') from sa_context;
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
select public.kh_set_user_block('28000000-0000-4000-8000-000000000002',true,'28000000-0000-4000-8000-000000000001');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
update sa_context set w3=pg_temp.sa_wanted('alert-wanted-3',100000);
select pg_temp.ops_as('28000000-0000-4000-8000-000000000003');
select public.kh_review_property(w3,'approved',null,1) from sa_context;
select pg_temp.ops_assert(jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000001'))=1
  and jsonb_array_length(pg_temp.sa_alerts('28000000-0000-4000-8000-000000000004'))=2,'a block suppresses the alert; D still gets it');
select pg_temp.ops_as('28000000-0000-4000-8000-000000000001');
select pg_temp.ops_assert(jsonb_array_length(public.kh_list_notifications('28000000-0000-4000-8000-000000000001',p_include_alerts=>true)->'items')=0,'a block hides earlier alerts');

-- 9. A tap on an alert push resolves to its property.
select pg_temp.ops_as('28000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert((select r->>'conversationId' is null and (r->>'propertyId')::uuid=c.d_sale
  from sa_context c, public.kh_resolve_push_notification('28000000-0000-4000-8000-000000000002',
    (pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002')->0->>'id')::uuid) r),'push resolves an alert to its property');
select pg_temp.ops_assert((select (public.kh_read_notification('28000000-0000-4000-8000-000000000002',
    (pg_temp.sa_alerts('28000000-0000-4000-8000-000000000002')->0->>'id')::uuid)->>'unreadCount')::int=0),'an alert can be marked read');

-- The matcher agrees with the catalogue's prefix search.
reset role;
select pg_temp.ops_assert(kh_private.property_matches(kh_private.normalize_search_filters('{"query":"Vedado"}'),d_sale)
  and not kh_private.property_matches(kh_private.normalize_search_filters('{"query":"miramar"}'),d_sale)
  and not kh_private.property_matches(kh_private.normalize_search_filters('{"operations":["wanted"]}'),d_sale),'query and operation filters decide a match') from sa_context;
rollback;
