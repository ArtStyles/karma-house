create function pg_temp.kh_business_fixture(a uuid,actor uuid) returns uuid language plpgsql as $$
declare r uuid:=gen_random_uuid();x jsonb;begin
 perform pg_temp.kh_as(actor);
 insert into storage.objects(bucket_id,name)values('property-photos',actor||'/'||r||'/photo.jpg');
 x:=public.kh_agency_save_property(actor,a,jsonb_build_object('clientRequestId',r,'sourceReference',r,'consentReference','Consentimiento comprobado','publicationIntent','submit','draft',jsonb_build_object('title','Casa de ciclo de cuenta','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Vivienda sintética para el ciclo de cuenta.','photoPaths',jsonb_build_array(actor||'/'||r||'/photo.jpg'))));
 return (x#>>'{property,id}')::uuid;
end $$;

do $$ declare a uuid:=pg_temp.kh_agency_signup(16);actor uuid:='45000000-0000-4000-8000-000000000016';owner uuid:='45000000-0000-4000-8000-000000000001';pid uuid;q jsonb;begin
 perform pg_temp.kh_agency_approve(a);pid:=pg_temp.kh_business_fixture(a,actor);
 q:=public.kh_request_agency_verification(actor,a,jsonb_build_object('clientRequestId',gen_random_uuid(),'input',jsonb_build_object('message','Solicitud suficiente de verificación pendiente.','evidenceReferences','[]'::jsonb)));
 perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,1);
 insert into kh_private.agency_property_write_permits values(txid_current(),pid,owner,'sale-fixture','sale');
 update public.properties set availability='sold',version=version+1 where id=pid;delete from kh_private.agency_property_write_permits where property_id=pid;
 perform public.kh_admin_unpublish(owner,pid,(select version from public.properties where id=pid),'Retirada de vivienda vendida');
 perform pg_temp.kh_assert((select availability='sold' from public.properties where id=pid),'admin_unpublish_never_reactivates_sold');
 perform pg_temp.kh_as(actor);insert into kh_private.account_suspensions(user_id,reason,suspended_by)values(actor,'Actor suspendido',owner);
 update kh_private.agency_settings set enabled=false;perform public.kh_begin_account_deletion(actor);perform public.kh_delete_account(actor);
 perform pg_temp.kh_assert((select availability='sold' from public.properties where id=pid) and (select state='cancelled' from kh_private.agency_verification_requests where id=(q->>'id')::uuid),'deleting_suspended_admin_preserves_sold_and_cancels_requests');
 perform pg_temp.kh_as(owner);perform public.kh_admin_recover_agency(owner,jsonb_build_object('agencyId',a,'newAdminId','45000000-0000-4000-8000-000000000002','expectedVersion',(select version from kh_private.agencies where id=a),'reason','Nueva cuenta comprobada para recuperar','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select availability='sold' from public.properties where id=pid) and exists(select 1 from kh_private.agency_property_moderation_holds where property_id=pid and active),'recovery_does_not_restore_sold_or_clear_platform_hold');
 perform pg_temp.kh_assert(not has_table_privilege('authenticated','kh_private.agency_property_identities','SELECT') and not has_function_privilege('authenticated','kh_private.agency_detach_account(uuid)','EXECUTE'),'lifecycle_and_archived_identity_are_private');
end $$;

-- Three agencies distinguish source suspension from collaborator suspension.
do $$ declare a uuid:=pg_temp.kh_agency_signup(12);b uuid:=pg_temp.kh_agency_signup(13);c uuid:=pg_temp.kh_agency_signup(14);
 aa uuid:='45000000-0000-4000-8000-000000000012';bb uuid:='45000000-0000-4000-8000-000000000013';cc uuid:='45000000-0000-4000-8000-000000000014';owner uuid:='45000000-0000-4000-8000-000000000001';pid uuid;agency uuid;actor uuid;q jsonb;changes uuid[]:='{}';body jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_agency_approve(b);perform pg_temp.kh_agency_approve(c);pid:=pg_temp.kh_business_fixture(a,aa);
 perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,1);
 for agency,actor in select b,bb union all select c,cc loop
  perform pg_temp.kh_as(actor);q:=public.kh_request_agency_mandate(actor,agency,jsonb_build_object('propertyId',pid,'internalReference','SHARED','clientRequestId',gen_random_uuid()));
  perform pg_temp.kh_as(aa);perform public.kh_decide_agency_mandate(aa,a,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
  perform pg_temp.kh_as(actor);q:=public.kh_propose_agency_property_change(actor,agency,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":33000}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));changes:=changes||array[(q->>'id')::uuid];
 end loop;
 perform pg_temp.kh_as(owner);perform public.kh_review_agency(owner,jsonb_build_object('agencyId',b,'decision','suspend','expectedVersion',(select version from kh_private.agencies where id=b),'note','Suspensión de colaboradora','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select availability='active' from public.properties where id=pid) and (select state='withdrawn' from kh_private.agency_mandates where property_id=pid and agency_id=b) and (select state='active' from kh_private.agency_mandates where property_id=pid and agency_id=c),'collaborator_suspension_never_pauses_other_origin');
 perform pg_temp.kh_assert((select state='withdrawn' from kh_private.agency_property_changes where id=changes[1]) and (select state='pending' from kh_private.agency_property_changes where id=changes[2]),'collaborator_suspension_only_terminates_own_flows');
 body:=jsonb_build_object('agencyId',b,'newAdminId',cc,'expectedVersion',(select version from kh_private.agencies where id=b),'reason','Responsable de otra agencia comprobado','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000003');perform pg_temp.kh_error(format('select public.kh_admin_recover_agency(%L,%L)',auth.uid(),body),'KH_OWNER_REQUIRED');
 perform pg_temp.kh_as(owner);perform pg_temp.kh_error(format('select public.kh_review_agency(%L,%L)',owner,jsonb_build_object('agencyId',b,'decision','approve','expectedVersion',(select version from kh_private.agencies where id=b),'note','No eludir recuperación','clientRequestId',gen_random_uuid())),'KH_AGENCY_RECOVERY_REQUIRED');
 insert into kh_private.account_suspensions(user_id,reason,suspended_by)values(cc,'Cuenta suspendida',owner);
 perform pg_temp.kh_error(format('select public.kh_admin_recover_agency(%L,%L)',owner,body),'KH_AGENCY_RECIPIENT_INVALID');delete from kh_private.account_suspensions where user_id=cc;
 insert into kh_private.account_deletions(user_id)values(cc);
 perform pg_temp.kh_error(format('select public.kh_admin_recover_agency(%L,%L)',owner,body),'KH_AGENCY_RECIPIENT_INVALID');delete from kh_private.account_deletions where user_id=cc;
 update auth.users set email_confirmed_at=null where id=cc;
 perform pg_temp.kh_error(format('select public.kh_admin_recover_agency(%L,%L)',owner,body),'KH_AGENCY_RECIPIENT_INVALID');update auth.users set email_confirmed_at=now() where id=cc;
 perform public.kh_admin_recover_agency(owner,body);perform public.kh_admin_recover_agency(owner,body);
 perform pg_temp.kh_error(format('select public.kh_admin_recover_agency(%L,%L)',owner,body||'{"reason":"Distinta evidencia comprobada"}'::jsonb),'KH_AGENCY_REQUEST_CONFLICT');
 perform pg_temp.kh_assert((select responsible_id=bb from kh_private.agency_applications where agency_id=b) and (select state='withdrawn' from kh_private.agency_mandates where property_id=pid and agency_id=b),'recovery_preserves_registration_provenance_and_withdrawn_mandates');
 perform public.kh_review_agency(owner,jsonb_build_object('agencyId',a,'decision','suspend','expectedVersion',(select version from kh_private.agencies where id=a),'note','Suspensión de origen','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select availability='paused' from public.properties where id=pid) and (select state='active' from kh_private.agency_mandates where property_id=pid and agency_id=c) and (select state='withdrawn' and termination_reason='origin_agency_suspended' from kh_private.agency_property_changes where id=changes[2]),'origin_suspension_retains_collaborator_mandate_but_terminates_flows');
 perform pg_temp.kh_as(cc);
 q:=public.kh_propose_agency_property_change(cc,c,(select payload from kh_private.agency_write_receipts where actor_id=cc and scope_id=c and operation='propose_change' and result->>'id'=changes[2]::text));
 perform pg_temp.kh_assert(q->>'state'='withdrawn','retry_does_not_recreate_cancelled_proposal');
 perform pg_temp.kh_error(format('select public.kh_propose_agency_property_change(%L,%L,%L)',cc,c,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":36000}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid())),'KH_AGENCY_PROPERTY_CLOSED');
 perform pg_temp.kh_as(owner);
 perform public.kh_admin_recover_agency(owner,jsonb_build_object('agencyId',a,'newAdminId',aa,'expectedVersion',(select version from kh_private.agencies where id=a),'reason','Responsable original comprobado','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select availability='paused' from public.properties where id=pid) and (select state='withdrawn' from kh_private.agency_property_changes where id=changes[2]),'recovery_does_not_restart_finished_flows');
 perform pg_temp.kh_as(cc);q:=public.kh_propose_agency_property_change(cc,c,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":36000}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(q->>'state'='pending' and (q->>'id')::uuid<>changes[2] and (select availability='paused' from public.properties where id=pid),'paused_approved_origin_allows_explicit_new_correction');
end $$;

do $$ declare a uuid:=pg_temp.kh_agency_signup(15);actor uuid:='45000000-0000-4000-8000-000000000015';personal uuid:='45000000-0000-4000-8000-000000000006';pid uuid:=gen_random_uuid();plain uuid:=gen_random_uuid();q jsonb;owner uuid:='45000000-0000-4000-8000-000000000001';begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(personal);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)select id,personal,id::text,'Origen personal directo','Vedado','La Habana','Casa',30000,2,1,'Eliminación directa de usuario con historial.','approved',array[personal||'/'||id||'/photo.jpg'] from unnest(array[pid,plain])id;
 perform pg_temp.kh_as(actor);q:=public.kh_request_agency_mandate(actor,a,jsonb_build_object('propertyId',pid,'internalReference','DIRECT','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);perform public.kh_decide_agency_mandate(personal,null,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 insert into kh_private.account_suspensions(user_id,reason,suspended_by)values(personal,'Cuenta suspendida',owner);
 update kh_private.agency_settings set enabled=false;perform pg_temp.kh_as(null);delete from auth.users where id=personal;
 perform pg_temp.kh_assert(not exists(select 1 from public.properties where owner_id=personal) and (select state='withdrawn' from kh_private.agency_mandates where property_id=pid),'direct_auth_personal_delete_works_suspended_and_disabled');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_property_identities where property_id=plain) and exists(select 1 from kh_private.agency_property_identities where property_id=pid and withdrawn_at is not null),'retain_only_business_identity');
 perform pg_temp.kh_error(format('insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description)values(%L,%L,%L,''Recreación'',''Vedado'',''La Habana'',''Casa'',30000,2,1,''No reutilizar la identidad histórica.'')',pid,actor,pid::text),'KH_PROPERTY_IDENTITY_RETIRED');
end $$;

do $$ declare a uuid:=pg_temp.kh_agency_signup(9);actor uuid:='45000000-0000-4000-8000-000000000009';owner uuid:='45000000-0000-4000-8000-000000000001';replacement uuid:='45000000-0000-4000-8000-000000000002';pid uuid;photo text;receipt jsonb;begin
 perform pg_temp.kh_agency_approve(a);pid:=pg_temp.kh_business_fixture(a,actor);select photo_paths[1] into photo from public.properties where id=pid;
 perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,1);
 perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','grant','note','Sello previo comprobado','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(actor);
 perform pg_temp.kh_error(format('select public.kh_remove_agency_member(%L,%L,%L)',actor,a,jsonb_build_object('userId',actor,'expectedVersion',1,'clientRequestId',gen_random_uuid())),'KH_AGENCY_LAST_ADMIN');
 insert into storage.objects(bucket_id,name)values('property-photos',actor||'/orphan/photo.jpg');
 update kh_private.agency_settings set enabled=false;
 receipt:=public.kh_begin_account_deletion(actor);
 perform pg_temp.kh_assert((select state='suspended' from kh_private.agencies where id=a),'delete_last_admin_suspends_agency_without_deleting_portfolio');
 perform pg_temp.kh_assert((select availability='paused' from public.properties where id=pid) and exists(select 1 from kh_private.agency_events where agency_id=a and kind='agency_recovery_required'),'last admin origin paused and recovery recorded even module off');
 perform pg_temp.kh_assert(receipt->'property-photos'=jsonb_build_array(actor||'/orphan/photo.jpg'),'deletion_receipt_excludes_referenced_business_images');
 delete from storage.objects where name=actor||'/orphan/photo.jpg';
 perform public.kh_delete_account(actor);
 perform pg_temp.kh_assert(exists(select 1 from public.properties where id=pid) and exists(select 1 from kh_private.property_media_assets where property_id=pid and path=photo and state='attached') and exists(select 1 from storage.objects where name=photo),'delete_uploader_preserves_agency_property_and_media');
 perform pg_temp.kh_assert((select publisher_id=actor from kh_private.agency_property_origins where property_id=pid) and not exists(select 1 from auth.users where id=actor),'minimal historical publisher survives auth deletion');
 perform pg_temp.kh_as(owner);
 perform public.kh_admin_recover_agency(owner,jsonb_build_object('agencyId',a,'newAdminId',replacement,'expectedVersion',(select version from kh_private.agencies where id=a),'reason','Identidad del nuevo responsable comprobada','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select state='approved' from kh_private.agencies where id=a) and not(select active from kh_private.agency_verifications where agency_id=a) and (select availability='paused' from public.properties where id=pid),'suspension_and_recovery_do_not_restore_verified_badge');
end $$;

do $$ declare a uuid:=pg_temp.kh_agency_signup(10);actor uuid:='45000000-0000-4000-8000-000000000010';member uuid:='45000000-0000-4000-8000-000000000004';pid uuid;photo text;begin
 perform pg_temp.kh_agency_approve(a);pid:=pg_temp.kh_business_fixture(a,actor);
 select photo_paths[1] into photo from public.properties where id=pid;
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,member,'manager');
 perform pg_temp.kh_as(member);perform public.kh_agency_property(member,a,pid);
 execute 'set local role authenticated';perform pg_temp.kh_assert(exists(select 1 from storage.objects where name=photo),'active_member_private_storage_read');execute 'reset role';
 perform pg_temp.kh_as(actor);perform public.kh_remove_agency_member(actor,a,jsonb_build_object('userId',member,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(member);
 perform pg_temp.kh_error(format('select public.kh_agency_property(%L,%L,%L)',member,a,pid),'KH_AGENCY_MEMBERSHIP_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',member,a,jsonb_build_object('propertyId',pid)),'KH_AGENCY_MEMBERSHIP_REQUIRED');
 perform pg_temp.kh_assert(public.kh_list_my_agencies(member)='[]','remove_member_revokes_reads_and_writes');
 execute 'set local role authenticated';perform pg_temp.kh_assert(not exists(select 1 from storage.objects where name=photo),'removed_member_private_storage_read_revoked');execute 'reset role';
 insert into storage.objects(bucket_id,name)values('property-photos',actor||'/loose/photo.jpg');
 perform pg_temp.kh_as(null);update kh_private.agency_settings set enabled=false;
 delete from auth.users where id=actor;
 perform pg_temp.kh_assert((select state='suspended' from kh_private.agencies where id=a) and exists(select 1 from public.properties where id=pid),'direct_auth_deletion_detaches_before_cascades');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.media_cleanup_jobs where path=actor||'/loose/photo.jpg' and reason='account_deleted') and not exists(select 1 from kh_private.media_cleanup_jobs j join kh_private.property_media_assets m using(path) where m.property_id=pid),'direct_auth_queues_only_orphan_media');
end $$;

do $$ declare a uuid:=pg_temp.kh_agency_signup(11);actor uuid:='45000000-0000-4000-8000-000000000011';personal uuid:='45000000-0000-4000-8000-000000000007';pid uuid:=gen_random_uuid();q jsonb;c uuid;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(personal);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,personal,pid::text,'Origen personal','Vedado','La Habana','Casa',30000,2,1,'Origen personal autorizado para las pruebas.','approved',array[personal||'/'||pid||'/photo.jpg']);
 insert into storage.objects(bucket_id,name)values('property-photos',personal||'/'||pid||'/photo.jpg');
 perform pg_temp.kh_as(actor);q:=public.kh_request_agency_mandate(actor,a,jsonb_build_object('propertyId',pid,'internalReference','PERSONAL','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);perform public.kh_decide_agency_mandate(personal,null,jsonb_build_object('requestId',q->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 select id into c from kh_private.commercial_cycles where property_id=pid;
 update kh_private.agency_settings set enabled=false;perform public.kh_begin_account_deletion(personal);perform public.kh_delete_account(personal);
 perform pg_temp.kh_assert(not exists(select 1 from public.properties where id=pid) and (select state='withdrawn' from kh_private.agency_mandates where property_id=pid) and (select state='withdrawn' and termination_reason='personal_source_deleted' from kh_private.agency_mandate_requests where id=(q->>'id')::uuid),'delete_personal_origin_withdraws_related_mandates_without_marking_sold');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.commercial_cycles where id=c and property_id=pid and state='closed' and termination_reason='personal_source_deleted'),'withdrawal preserves cycle UUID with explicit non-sale reason');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.agency_property_identities where property_id=pid and personal_source_id=personal and withdrawn_at is not null),'private personal identity survives without source transfer');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.media_cleanup_jobs where path=personal||'/'||pid||'/photo.jpg' and state='pending'),'ordinary personal deletion retains orphan cleanup');
end $$;
