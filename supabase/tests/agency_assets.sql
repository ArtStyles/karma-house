-- Isolated fixtures; runner rolls back schema, users, objects, settings and grants.
select pg_temp.kh_assert(to_regprocedure('public.kh_agency_registration_available()') is not null,'public signup capability exists');
do $$declare a uuid:=pg_temp.kh_agency_signup();p text;unused text;begin
 p:=a::text||'/logos/'||gen_random_uuid()::text||'.jpg';unused:=a::text||'/logos/'||gen_random_uuid()::text||'.jpg';
 perform set_config('kh.test.logo',p,true);perform set_config('kh.test.unused',unused,true);perform set_config('kh.test.agency',a::text,true);
 insert into storage.objects(bucket_id,name,metadata)values('agency-assets',p,'{"mimetype":"image/jpeg","size":1024}'),('agency-assets',unused,'{"mimetype":"image/jpeg","size":1024}');
end$$;
select pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
set local role authenticated;
select pg_temp.kh_assert((select count(*)=2 from storage.objects where bucket_id='agency-assets'),'applicant reads own pending logo');
select public.kh_set_agency_logo(auth.uid(),current_setting('kh.test.agency')::uuid,current_setting('kh.test.logo'),1);
reset role;
select pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.kh_assert((select count(*)=0 from storage.objects where bucket_id='agency-assets'),'outsider cannot read pending or unreferenced logo');
select pg_temp.kh_error(format('select public.kh_set_agency_logo(auth.uid(),%L::uuid,%L,2)',current_setting('kh.test.agency'),current_setting('kh.test.unused')),'KH_AGENCY_APPLICANT_REQUIRED');
reset role;
select pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.kh_assert((select count(*)=2 from storage.objects where bucket_id='agency-assets'),'owner reads pending logos');
reset role;
select pg_temp.kh_as(null);
set local role anon;
select pg_temp.kh_assert((select count(*)=0 from storage.objects where bucket_id='agency-assets'),'anonymous cannot sign pending logo');
select pg_temp.kh_assert(jsonb_typeof(public.kh_agency_registration_available())='boolean','only public module boolean');
reset role;
select pg_temp.kh_agency_approve(current_setting('kh.test.agency')::uuid);
select pg_temp.kh_as(null);
set local role anon;
select pg_temp.kh_assert((select count(*)=1 from storage.objects where bucket_id='agency-assets'),'public only approved referenced logo');
select pg_temp.kh_assert(not exists(select 1 from storage.objects where name=current_setting('kh.test.unused')),'unused asset stays private');
reset role;
update kh_private.agencies set state='suspended' where id=current_setting('kh.test.agency')::uuid;
set local role anon;
select pg_temp.kh_assert((select count(*)=0 from storage.objects where bucket_id='agency-assets'),'suspension hides public logo');
reset role;
select pg_temp.kh_assert(not has_table_privilege('anon','kh_private.agency_applications','select'),'evidence and responsible name never public');
select pg_temp.kh_assert(not has_table_privilege('authenticated','kh_private.agency_verification_requests','select'),'private verification evidence requires scoped RPC');

select pg_temp.kh_as('45000000-0000-4000-8000-000000000003');
select pg_temp.kh_error(format('select public.kh_agency_review_detail(auth.uid(),%L::uuid)',current_setting('kh.test.agency')),'KH_OWNER_REQUIRED');
select pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
select pg_temp.kh_assert(public.kh_agency_review_detail(auth.uid(),current_setting('kh.test.agency')::uuid)->'application'->'input'->>'responsibleFullName'='Responsable Privado','owner gets bounded private review detail');

select pg_temp.kh_assert(kh_private.agency_membership_json(current_setting('kh.test.agency')::uuid,'45000000-0000-4000-8000-000000000009')->>'displayName'='Gestor Fixture','team displays permitted public name');
do $$declare invite uuid;begin
 insert into kh_private.agency_invitations(agency_id,recipient_id,role,invited_by)values(current_setting('kh.test.agency')::uuid,'45000000-0000-4000-8000-000000000002','manager','45000000-0000-4000-8000-000000000009')returning id into invite;
 perform pg_temp.kh_assert(kh_private.agency_invitation_json(invite)->>'agencyName'='Casas Fixture','recipient sees agency trade name');
end$$;

-- An older rejected request remains addressable after a new submission.
do $$declare a uuid:=current_setting('kh.test.agency')::uuid;old_request jsonb;new_request jsonb;details jsonb;begin
 update kh_private.agencies set state='approved'where id=a;
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
 old_request:=public.kh_request_agency_verification(auth.uid(),a,jsonb_build_object('input',jsonb_build_object('message','Solicitud histórica para fixture suficiente.','evidenceReferences','[]'::jsonb),'clientRequestId',gen_random_uuid()));
 -- The whole suite is one transaction; assign historical ordering explicitly.
 update kh_private.agency_verification_requests set created_at=now()-interval '1 hour'where id=(old_request->>'id')::uuid;
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 perform public.kh_review_agency_verification(auth.uid(),jsonb_build_object('agencyId',a,'requestId',old_request->>'id','decision','reject','note','Histórica rechazada','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where id=a),'expectedRequestVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
 new_request:=public.kh_request_agency_verification(auth.uid(),a,jsonb_build_object('input',jsonb_build_object('message','Nueva solicitud para fixture suficiente.','evidenceReferences','[]'::jsonb),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 details:=public.kh_agency_review_detail(auth.uid(),a,(old_request->>'id')::uuid);
 perform pg_temp.kh_assert(details->'request'->>'id'=old_request->>'id'and details->'request'->>'state'='rejected','historical review id does not become newest pending request');
 perform pg_temp.kh_assert(public.kh_agency_review_detail(auth.uid(),a)->'request'->>'id'=new_request->>'id','direct review defaults to latest request');
end$$;
