begin;
create function pg_temp.assisted_assert(ok boolean, label text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'ASSISTED ASSERTION: %',label; end if; end $$;
select pg_temp.assisted_assert(to_regprocedure('public.kh_save_assisted_property(uuid,jsonb,jsonb)') is not null,'assisted publication RPC exists');
select pg_temp.assisted_assert(to_regclass('kh_private.property_publication_keys') is not null,'immutable creation identity exists');
select pg_temp.assisted_assert(to_regclass('kh_private.property_media_assets') is not null,'inherited assets registry exists');
-- Fixture helper is prepended by the loopback-only runner inside this transaction.
select pg_temp.kh_as('43000000-0000-4000-8000-000000000003');
select pg_temp.kh_error($s$select public.kh_admin_save_assisted_collaborator(auth.uid(),'{"kind":"agency"}')$s$,'KH_OFFICIAL_ACCOUNT_REQUIRED');
select pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
do $$ declare c uuid;p uuid;payload jsonb;begin
 c:=pg_temp.kh_collaborator();p:=pg_temp.kh_listing(c,'identity-retry');
 perform pg_temp.kh_assert((select moderation='approved' from public.properties where id=p),'principal publication is approved');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.property_publication_keys where property_id=p),'immutable identity reserved');
 select initial_payload||jsonb_build_object('ownerId',auth.uid()) into payload from kh_private.property_save_requests where property_id=p;
 perform pg_temp.kh_assert((public.kh_save_property(payload)->>'id')::uuid=p,'creation replay preserves UUID');
 perform pg_temp.kh_as(null);
 update public.properties set owner_id='43000000-0000-4000-8000-000000000002',version=version+1 where id=p;
 perform pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
 perform pg_temp.kh_error(format('select public.kh_save_property(%L::jsonb)',payload),'KH_PROPERTY_MANAGEMENT_CHANGED');
 perform pg_temp.kh_assert((select count(*)=1 from public.properties where client_request_id='identity-retry'),'replay after reassignment does not recreate');
end $$;
select pg_temp.kh_assert(not has_table_privilege('authenticated','kh_private.assisted_listing_records','SELECT'),'provenance inaccessible directly');
select pg_temp.kh_assert(not has_function_privilege('authenticated','public.kh_claim_media_cleanup(integer)','EXECUTE'),'cleanup is server-only');
rollback;
