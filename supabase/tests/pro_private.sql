-- Pro is visible only to whoever has it. Everything rolls back.
-- S seller with personal Pro (…01), X stranger (…02), M member of the Pro agency (…03), Y admin of another agency (…04).
-- b1 is S's personal listing, b2 was published by agency a1 (with agency Pro); both are live in a province nobody uses.
begin;
create function pg_temp.private_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'PRO PRIVATE ASSERTION: %',label; end if; end $$;
create function pg_temp.private_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('49000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'private-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Privada '||n)
 from generate_series(1,4) n;
insert into kh_private.agencies(id,trade_name,state) values('49000000-0000-4000-8000-0000000000a1','Casas Privadas Ficticias','approved'),
 ('49000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Privada','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('49000000-0000-4000-8000-0000000000a1','49000000-0000-4000-8000-000000000003','manager'),
 ('49000000-0000-4000-8000-0000000000a2','49000000-0000-4000-8000-000000000004','admin');
insert into kh_private.pro_status(user_id,pro_until) values('49000000-0000-4000-8000-000000000001',now()+interval '30 days');
insert into kh_private.pro_status(agency_id,pro_until) values('49000000-0000-4000-8000-0000000000a1',now()+interval '30 days');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation,availability) values
 ('49000000-0000-4000-8000-0000000000b1','49000000-0000-4000-8000-000000000001','private-b1','Casa personal Pro','Vedado','Zona Pro Privada','Casa','Vivienda ficticia de una cuenta Pro.',50000,100,2,1,'{}',array['49000000-0000-4000-8000-000000000001/private-b1/photo.jpg'],'approved','active'),
 ('49000000-0000-4000-8000-0000000000b2','49000000-0000-4000-8000-000000000003','private-b2','Casa de inmobiliaria Pro','Playa','Zona Pro Privada','Casa','Vivienda ficticia de una inmobiliaria Pro.',60000,100,2,1,'{}',array['49000000-0000-4000-8000-000000000003/private-b2/photo.jpg'],'approved','active');
insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)
 values('49000000-0000-4000-8000-0000000000b2','49000000-0000-4000-8000-0000000000a1','49000000-0000-4000-8000-000000000003','ref-private-b2','consent-private-b2');
create function pg_temp.private_marks() returns jsonb language sql as $$
 select coalesce(jsonb_object_agg(r->>'id',(r->>'is_pro')::boolean),'{}') from jsonb_array_elements(public.kh_search_properties(jsonb_build_object('sort','recent','query','','min_bedrooms',0,
  'amenities','[]'::jsonb,'with_total',false,'limit',10,'province','Zona Pro Privada'))->'rows') r
$$;
create function pg_temp.private_pro(p uuid) returns boolean language sql as $$ select public.kh_is_pro(x) from public.properties x where x.id=p $$;

set local role authenticated;
-- The seller sees the personal listing's Pro and their own badge; the agency listing is not theirs.
select pg_temp.private_as('49000000-0000-4000-8000-000000000001');
select pg_temp.private_assert(pg_temp.private_pro('49000000-0000-4000-8000-0000000000b1') and not pg_temp.private_pro('49000000-0000-4000-8000-0000000000b2'),'the seller sees only their own Pro');
select pg_temp.private_assert(public.kh_pro_badge('49000000-0000-4000-8000-000000000001'),'the seller sees their own badge');
select pg_temp.private_assert(pg_temp.private_marks()='{"49000000-0000-4000-8000-0000000000b1":true,"49000000-0000-4000-8000-0000000000b2":false}'::jsonb,'the catalogue marks only the seller''s listing for the seller');
-- A member of the publishing agency sees the agency listing's Pro, not the seller's.
select pg_temp.private_as('49000000-0000-4000-8000-000000000003');
select pg_temp.private_assert(pg_temp.private_marks()='{"49000000-0000-4000-8000-0000000000b1":false,"49000000-0000-4000-8000-0000000000b2":true}'::jsonb,'an agency member sees the agency listing''s Pro');
select pg_temp.private_assert(public.kh_pro_badge('49000000-0000-4000-8000-000000000001') is false,'nobody else learns that the seller has Pro');
-- A stranger and another agency's admin see no Pro at all.
select pg_temp.private_as('49000000-0000-4000-8000-000000000002');
select pg_temp.private_assert(pg_temp.private_marks()='{"49000000-0000-4000-8000-0000000000b1":false,"49000000-0000-4000-8000-0000000000b2":false}'::jsonb,'a stranger sees no Pro');
select pg_temp.private_as('49000000-0000-4000-8000-000000000004');
select pg_temp.private_assert(not pg_temp.private_pro('49000000-0000-4000-8000-0000000000b2'),'another agency''s admin sees no Pro');
-- A removed member stops seeing it.
reset role;
update kh_private.agency_memberships set state='removed',version=version+1 where agency_id='49000000-0000-4000-8000-0000000000a1' and user_id='49000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.private_as('49000000-0000-4000-8000-000000000003');
select pg_temp.private_assert(not pg_temp.private_pro('49000000-0000-4000-8000-0000000000b2'),'a removed member sees no Pro');
-- Visitors without an account never see it either.
reset role;
set local role anon;
select pg_temp.private_as(null);
select pg_temp.private_assert(pg_temp.private_marks()='{"49000000-0000-4000-8000-0000000000b1":false,"49000000-0000-4000-8000-0000000000b2":false}'::jsonb,'anon sees no Pro');
select pg_temp.private_assert(public.kh_pro_badge('49000000-0000-4000-8000-000000000001') is false,'anon never learns who has Pro');
reset role;
rollback;
