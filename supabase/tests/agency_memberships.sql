do $$declare a uuid;invite jsonb;request uuid;begin
 a:=pg_temp.kh_agency_signup();perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
 invite:=public.kh_invite_agency_member(auth.uid(),a,jsonb_build_object('userId','45000000-0000-4000-8000-000000000002','role','coordinator','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_memberships where agency_id=a and user_id='45000000-0000-4000-8000-000000000002'),'pending invite grants no membership');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000004');
 perform pg_temp.kh_error(format('select public.kh_decide_agency_invitation(auth.uid(),%L::jsonb)',jsonb_build_object('invitationId',invite->>'id','accept',true,'expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_AGENCY_INVITATION_RECIPIENT');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 perform public.kh_decide_agency_invitation(auth.uid(),jsonb_build_object('invitationId',invite->>'id','accept',true,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(kh_private.agency_actor(auth.uid(),a,'manager')=auth.uid(),'coordinator attends cases');
 perform pg_temp.kh_error(format('select public.kh_invite_agency_member(auth.uid(),%L::uuid,%L::jsonb)',a,jsonb_build_object('userId','45000000-0000-4000-8000-000000000004','role','manager','clientRequestId',gen_random_uuid())::text),'KH_AGENCY_ROLE_REQUIRED');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000009');
 perform pg_temp.kh_error(format('select public.kh_remove_agency_member(auth.uid(),%L::uuid,%L::jsonb)',a,jsonb_build_object('userId',auth.uid(),'expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_AGENCY_LAST_ADMIN');
 perform public.kh_remove_agency_member(auth.uid(),a,jsonb_build_object('userId','45000000-0000-4000-8000-000000000002','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 perform pg_temp.kh_error(format('select public.kh_list_agency_members(auth.uid(),%L::uuid,0,30)',a),'KH_AGENCY_MEMBERSHIP_REQUIRED');
end$$;
-- An unusable administrator does not satisfy the last-active-admin invariant.
do $$declare a uuid;begin
 a:=pg_temp.kh_agency_signup(11);perform pg_temp.kh_agency_approve(a);
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,'45000000-0000-4000-8000-000000000004','admin');
 insert into kh_private.account_suspensions(user_id,reason,suspended_by)values('45000000-0000-4000-8000-000000000004','Suspensión de prueba','45000000-0000-4000-8000-000000000001');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000011');
 perform pg_temp.kh_error(format('select public.kh_remove_agency_member(auth.uid(),%L::uuid,%L::jsonb)',a,jsonb_build_object('userId',auth.uid(),'expectedVersion',1,'clientRequestId',gen_random_uuid())::text),'KH_AGENCY_LAST_ADMIN');
end$$;
