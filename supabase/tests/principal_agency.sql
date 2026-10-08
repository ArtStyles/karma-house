-- Run against a disposable local database with helpers/agency_fixture.sql prepended.
-- This suite owns only transaction-local synthetic identities and always rolls back.
begin;
select pg_temp.kh_assert(to_regprocedure('public.kh_ensure_principal_agency(uuid)') is not null,'protected_owner_bootstrap_exists');
create function pg_temp.principal_denied(statement text) returns void language plpgsql as $$begin
 begin execute statement;exception when insufficient_privilege then return;end;
 raise exception 'KH TEST: principal table write must be denied';
end$$;

do $$declare a uuid;listed jsonb;initial jsonb;result jsonb;payload jsonb;personal uuid;normal uuid;request uuid:=gen_random_uuid();begin
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 perform pg_temp.kh_error('select public.kh_ensure_principal_agency(auth.uid())','KH_OWNER_REQUIRED');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000003');
 perform pg_temp.kh_error('select public.kh_ensure_principal_agency(auth.uid())','KH_OWNER_REQUIRED');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 update kh_private.agency_settings set enabled=false;
 personal:=(public.kh_save_property(jsonb_build_object('ownerId',auth.uid(),'clientRequestId','principal-personal-before','title','Cartera personal conservada','location','Vedado','province','La Habana','type','Casa','price',50000,'bedrooms',2,'bathrooms',1,'description','Anuncio personal previo a la agencia principal.','moderation','draft','photoPaths','[]'::jsonb))->>'id')::uuid;
 -- Capture personal property rows and origins before bootstrap; no portfolio conversion.
 create temporary table principal_personal_before as select id,owner_id from public.properties where owner_id=auth.uid();
 create temporary table principal_origins_before as select * from kh_private.agency_property_origins;
 listed:=public.kh_list_my_agencies(auth.uid());
 perform pg_temp.kh_assert(jsonb_array_length(listed)=1,'owner_list_bootstraps_one_principal_while_module_disabled');
 a:=(listed->0->>'id')::uuid;
 perform pg_temp.kh_assert((listed->0->>'isPrincipal')::boolean and (listed->0->>'verified')::boolean and listed->0->>'state'='approved','principal_is_real_approved_verified_agency');
 perform pg_temp.kh_assert(public.kh_ensure_principal_agency(auth.uid())->>'id'=a::text,'bootstrap_is_idempotent');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.principal_agency),'one_protected_identity');
 perform pg_temp.kh_assert((select role='admin' and state='active' from kh_private.agency_memberships where agency_id=a and user_id=auth.uid()),'current_owner_has_business_admin_membership');
 perform pg_temp.kh_assert(not (public.kh_agency_capabilities(auth.uid())->>'enabled')::boolean,'bootstrap_does_not_enable_module');
 perform pg_temp.kh_assert(not exists(select * from principal_personal_before except select id,owner_id from public.properties),'personal_portfolio_untouched');
 perform pg_temp.kh_assert(not exists(select * from kh_private.agency_property_origins except select * from principal_origins_before),'bootstrap_does_not_create_business_origins');
 initial:=public.kh_get_agency_profile(auth.uid(),a);
 perform pg_temp.kh_assert(initial->>'commercialProfileComplete'='false' and initial->'input'->>'businessPhone'='' and initial->'input'->>'province'='' and initial->'input'->'serviceAreas'='[]'::jsonb,'incomplete_commercial_profile_has_no_invented_contact_or_location');
 perform pg_temp.kh_assert((select responsible_id is null and input='{}'::jsonb from kh_private.agency_applications where agency_id=a),'bootstrap_does_not_invent_business_responsible');
 result:=public.kh_public_agency_profile(a);
 perform pg_temp.kh_assert(result->>'identityOnly'='true' and result->>'isPrincipal'='true' and result-array['agencyId','tradeName','logoPath','verified','isPrincipal','identityOnly']='{}'::jsonb,'public_projection_is_minimal_until_complete');

 -- All old owner/moderation RPCs must obey the principal guard too.
 update kh_private.agency_settings set enabled=true;
 payload:=jsonb_build_object('agencyId',a,'decision','suspend','note','Intento de suspensión sintético','expectedVersion',1,'clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_review_agency(auth.uid(),%L::jsonb)',payload::text),'KH_PRINCIPAL_AGENCY_PROTECTED');
 payload:=jsonb_build_object('agencyId',a,'decision','revoke','note','Intento de retirada sintético','expectedAgencyVersion',1,'expectedVerificationVersion',1,'clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_review_agency_verification(auth.uid(),%L::jsonb)',payload::text),'KH_PRINCIPAL_AGENCY_PROTECTED');
 insert into kh_private.agency_memberships(agency_id,user_id,role) values(a,'45000000-0000-4000-8000-000000000002','admin');
 payload:=jsonb_build_object('userId',auth.uid(),'expectedVersion',1,'clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_remove_agency_member(auth.uid(),%L::uuid,%L::jsonb)',a,payload::text),'KH_PRINCIPAL_AGENCY_PROTECTED');
 perform pg_temp.kh_error(format('delete from kh_private.agency_memberships where agency_id=%L::uuid and user_id=auth.uid()',a),'KH_PRINCIPAL_AGENCY_PROTECTED');
 perform pg_temp.kh_error(format('delete from kh_private.agency_verifications where agency_id=%L::uuid',a),'KH_PRINCIPAL_AGENCY_PROTECTED');
 perform pg_temp.kh_error(format('update kh_private.agencies set state=''pending'' where id=%L::uuid',a),'KH_PRINCIPAL_AGENCY_PROTECTED');
 perform pg_temp.kh_error('delete from kh_private.principal_agency','KH_PRINCIPAL_AGENCY_PROTECTED');

 -- Commercial configuration uses the existing validator and keeps public/private boundaries.
 payload:=jsonb_build_object('input',initial->'input','expectedVersion',1,'clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_update_agency_profile(auth.uid(),%L::uuid,%L::jsonb)',a,payload::text),'KH_AGENCY_INVALID');
 payload:=jsonb_build_object('input',pg_temp.kh_agency_input()-array['responsibleFullName','evidenceReferences'],'expectedVersion',1,'clientRequestId',gen_random_uuid());
 result:=public.kh_update_agency_profile(auth.uid(),a,payload);
 perform pg_temp.kh_assert(result->>'commercialProfileComplete'='true','saved_confirmed_commercial_profile_is_complete');
 result:=public.kh_public_agency_profile(a);
 perform pg_temp.kh_assert(result->>'isPrincipal'='true' and result->>'businessPhone'='+5351234567' and not(result ?| array['responsibleFullName','evidenceReferences','officeAddress','identityOnly']),'complete_public_projection_contains_confirmed_fields_only');
 payload:=jsonb_build_object('clientRequestId',request,'sourceReference','PRINCIPAL-FIXTURE','consentReference','Autorización sintética comprobada','publicationIntent','submit','draft',jsonb_build_object('title','Casa de principal sintética','location','Playa','province','La Habana','type','Casa','price',35000,'bedrooms',2,'bathrooms',1,'description','Vivienda sintética de la inmobiliaria principal.','photoPaths',jsonb_build_array(auth.uid()||'/'||request||'/photo.jpg')));
 insert into storage.objects(bucket_id,name) values('property-photos',auth.uid()||'/'||request||'/photo.jpg');
 result:=public.kh_agency_save_property(auth.uid(),a,payload);
 perform pg_temp.kh_assert(result->'property'->>'moderation'='approved','principal_preserves_verified_agency_direct_publication');
 result:=public.kh_public_property_contact((result->'property'->>'id')::uuid);
 perform pg_temp.kh_assert(result->'agencies'->0->>'isPrincipal'='true' and result->'agencies'->0->>'verified'='true','public_contacts_derive_principal_from_protected_relation');

 -- Naming and metadata cannot make an ordinary agency principal or grant system roles.
 normal:=pg_temp.kh_agency_signup(19);perform pg_temp.kh_agency_approve(normal);
 update kh_private.agencies set trade_name='KarmaHouse' where id=normal;
 perform pg_temp.kh_assert(kh_private.agency_summary(normal)->>'isPrincipal'='false','matching_trade_name_is_not_authority');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 update auth.users set raw_user_meta_data=raw_user_meta_data||'{"isPrincipal":true,"role":"owner","verified":true}'::jsonb where id=auth.uid();
 perform pg_temp.kh_assert(not public.kh_is_admin(),'principal_business_team_never_inherits_system_administration');
 perform pg_temp.kh_error('select public.kh_ensure_principal_agency(auth.uid())','KH_OWNER_REQUIRED');
 perform pg_temp.kh_assert(jsonb_array_length(public.kh_list_my_agencies(auth.uid()))=1,'team_reads_existing_membership_without_extra_bootstrap');
 -- Store the existing identity for table privilege/transfer assertions below.
 create temporary table principal_test_identity as select a agency_id;
end$$;

select pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.principal_denied('insert into kh_private.principal_agency(singleton,agency_id) values(true,gen_random_uuid())');
reset role;

-- Protected platform ownership transfer rebinds business admin authority to the current owner.
update kh_private.platform_owner set user_id='45000000-0000-4000-8000-000000000004' where singleton;
select pg_temp.kh_assert((select m.role='admin' and m.state='active' from kh_private.agency_memberships m join principal_test_identity a on a.agency_id=m.agency_id where m.user_id='45000000-0000-4000-8000-000000000004'),'new_current_owner_receives_admin_membership');
select pg_temp.kh_as('45000000-0000-4000-8000-000000000004');
select pg_temp.kh_assert(public.kh_ensure_principal_agency(auth.uid())->>'id'=(select agency_id::text from principal_test_identity),'transfer_keeps_unique_principal_identity');
select pg_temp.kh_error('delete from kh_private.agency_memberships where user_id=auth.uid()','KH_PRINCIPAL_AGENCY_PROTECTED');
rollback;
