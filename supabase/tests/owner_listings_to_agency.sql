-- The owner moves their own sales into an agency they administer. Everything rolls back.
-- O platform owner for this test (…01), M manager of a1 (…02), X another person (…03). O administers a1, not a2.
-- b1 is O's live sale (already mandated to a1), b2 O's rental, b3 X's sale.
begin;
create function pg_temp.adopt_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'ADOPT ASSERTION: %',label; end if; end $$;
create function pg_temp.adopt_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'ADOPT ASSERTION: missing error %',expected;
end $$;
create function pg_temp.adopt_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'adopt-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Traspaso '||n)
 from generate_series(1,3) n;
insert into kh_private.platform_owner(singleton,user_id) values(true,'50000000-0000-4000-8000-000000000001')
 on conflict(singleton) do update set user_id=excluded.user_id;
insert into kh_private.agencies(id,trade_name,state) values('50000000-0000-4000-8000-0000000000a1','Casas Traspaso Ficticias','approved'),
 ('50000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Traspaso','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000001','admin'),
 ('50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-000000000002','manager');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability,operation,rent_period) values
 ('50000000-0000-4000-8000-0000000000b1','50000000-0000-4000-8000-000000000001','adopt-b1','Venta propia','Vedado','Zona Traspaso','Casa','Vivienda ficticia de la cuenta propietaria.',50000,100,2,1,'{}',array['50000000-0000-4000-8000-000000000001/adopt-b1/photo.jpg'],'approved','active','sale',null),
 ('50000000-0000-4000-8000-0000000000b2','50000000-0000-4000-8000-000000000001','adopt-b2','Alquiler propio','Playa','Zona Traspaso','Casa','Vivienda ficticia en alquiler de la cuenta propietaria.',300,100,2,1,'{}',array['50000000-0000-4000-8000-000000000001/adopt-b2/photo.jpg'],'approved','active','rent','month'),
 ('50000000-0000-4000-8000-0000000000b3','50000000-0000-4000-8000-000000000003','adopt-b3','Venta ajena','Cerro','Zona Traspaso','Casa','Vivienda ficticia de otra persona.',60000,100,2,1,'{}',array['50000000-0000-4000-8000-000000000003/adopt-b3/photo.jpg'],'approved','active','sale',null);
-- b1 already sits in the agency's portfolio under a mandate, as the owner's sales do in production.
insert into kh_private.agency_mandates(property_id,agency_id,reference) values('50000000-0000-4000-8000-0000000000b1','50000000-0000-4000-8000-0000000000a1','Anuncio propio');
insert into kh_private.commercial_cycles(property_id) values('50000000-0000-4000-8000-0000000000b1');

-- Refusals: someone else, a stale version, a rental, another person's sale, an agency the owner does not administer.
select pg_temp.adopt_as('50000000-0000-4000-8000-000000000003');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b3',1)$q$,'KH_OWNER_REQUIRED');
select pg_temp.adopt_as('50000000-0000-4000-8000-000000000001');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b1',7)$q$,'KH_VERSION_CONFLICT');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b2',1)$q$,'KH_AGENCY_PROPERTY_NOT_FOUND');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b3',1)$q$,'KH_AGENCY_PROPERTY_NOT_FOUND');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a2','50000000-0000-4000-8000-0000000000b1',1)$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');

-- The owner's sale moves: origin with the owner as publisher, the existing mandate kept active, one open cycle, an event.
select pg_temp.adopt_assert((kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b1',1)->>'agencyId')='50000000-0000-4000-8000-0000000000a1','the sale moved');
select pg_temp.adopt_assert((select origin_agency_id='50000000-0000-4000-8000-0000000000a1' and publisher_id='50000000-0000-4000-8000-000000000001' from kh_private.agency_property_origins where property_id='50000000-0000-4000-8000-0000000000b1'),'origin row');
select pg_temp.adopt_assert((select state='active' and version=2 from kh_private.agency_mandates where property_id='50000000-0000-4000-8000-0000000000b1' and agency_id='50000000-0000-4000-8000-0000000000a1'),'the mandate stays active');
select pg_temp.adopt_assert((select count(*)=1 from kh_private.commercial_cycles where property_id='50000000-0000-4000-8000-0000000000b1' and state='open'),'one open cycle');
select pg_temp.adopt_assert(exists(select 1 from kh_private.agency_events where subject_id='50000000-0000-4000-8000-0000000000b1' and kind='owner_origin_adopted'),'event recorded');
select pg_temp.adopt_assert((select version=1 and moderation='approved' and availability='active' from public.properties where id='50000000-0000-4000-8000-0000000000b1'),'the listing itself is untouched');
select pg_temp.adopt_error($q$select kh_private.adopt_owner_listing('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1','50000000-0000-4000-8000-0000000000b1',1)$q$,'KH_AGENCY_SOURCE_IMMUTABLE');

set local role authenticated;
-- Personal management is closed now; the agency's portfolio has it as its own.
select pg_temp.adopt_error($q$select public.kh_set_property_status('50000000-0000-4000-8000-0000000000b1','paused')$q$,'KH_AGENCY_CONTEXT_REQUIRED');
select pg_temp.adopt_assert((select count(*)=1 from jsonb_array_elements(public.kh_agency_properties('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-0000000000a1')->'items') i where i::text like '%50000000-0000-4000-8000-0000000000b1%'),'the portfolio lists it');
-- Only the owner and the agency's members learn which agency it belongs to.
select pg_temp.adopt_assert((select public.kh_listing_agency(p)='50000000-0000-4000-8000-0000000000a1' from public.properties p where p.id='50000000-0000-4000-8000-0000000000b1'),'the owner sees the agency');
select pg_temp.adopt_as('50000000-0000-4000-8000-000000000002');
select pg_temp.adopt_assert((select public.kh_listing_agency(p)='50000000-0000-4000-8000-0000000000a1' from public.properties p where p.id='50000000-0000-4000-8000-0000000000b1'),'a member sees the agency');
select pg_temp.adopt_as('50000000-0000-4000-8000-000000000003');
select pg_temp.adopt_assert((select public.kh_listing_agency(p) is null from public.properties p where p.id='50000000-0000-4000-8000-0000000000b1'),'someone else does not');
select pg_temp.adopt_assert((select public.kh_listing_agency(p) is null from public.properties p where p.id='50000000-0000-4000-8000-0000000000b2'),'a personal listing has no agency');
reset role;
set local role anon;
select pg_temp.adopt_as(null);
select pg_temp.adopt_assert((select public.kh_listing_agency(p) is null from public.properties p where p.id='50000000-0000-4000-8000-0000000000b1'),'anon does not');
reset role;
select pg_temp.adopt_assert(not has_function_privilege('authenticated','kh_private.adopt_owner_listing(uuid,uuid,uuid,integer)','execute') and not has_function_privilege('anon','kh_private.adopt_owner_listing(uuid,uuid,uuid,integer)','execute'),'clients cannot adopt');
rollback;
