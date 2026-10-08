do $$declare a uuid;payload jsonb;first jsonb;begin
 a:=pg_temp.kh_agency_signup();
 perform pg_temp.kh_assert((select state='pending' from kh_private.agencies where id=a),'metadata_approved_does_not_grant_access');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_memberships where agency_id=a),'no initial membership');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
 perform pg_temp.kh_error(format('select public.kh_review_agency(auth.uid(),%L::jsonb)',jsonb_build_object('agencyId',a,'decision','approve','note','sin autorización','expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_ADMIN_REQUIRED');
 perform public.kh_submit_agency_application(auth.uid(),jsonb_build_object('input',pg_temp.kh_agency_input(),'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 payload:=jsonb_build_object('agencyId',a,'decision','approve','note','revisión de prueba','expectedVersion',2,'clientRequestId',gen_random_uuid());
 first:=public.kh_review_agency(auth.uid(),payload);perform pg_temp.kh_assert(public.kh_review_agency(auth.uid(),payload)=first,'approval_replay_single_membership');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.agency_memberships where agency_id=a and role='admin'),'single admin');
 perform pg_temp.kh_error(format('select public.kh_review_agency(auth.uid(),%L::jsonb)',(payload||jsonb_build_object('decision','reject'))::text),'KH_AGENCY_REQUEST_CONFLICT');
 a:=pg_temp.kh_agency_signup(10,false);perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 perform pg_temp.kh_error(format('select public.kh_review_agency(auth.uid(),%L::jsonb)',jsonb_build_object('agencyId',a,'decision','approve','note','revisión prueba','expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_EMAIL_UNCONFIRMED');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 perform pg_temp.kh_assert(public.kh_agency_application(auth.uid()) is null,'personal account stays personal');
 perform pg_temp.kh_error(format('select public.kh_submit_agency_application(auth.uid(),%L::jsonb)',jsonb_build_object('input',pg_temp.kh_agency_input(),'expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_AGENCY_APPLICATION_REQUIRED');
end$$;
