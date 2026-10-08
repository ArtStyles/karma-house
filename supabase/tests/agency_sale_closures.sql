-- Closure lock participants follow business roles, never corporate technical custody.
create function pg_temp.sale_account_locked(actor uuid) returns boolean language sql as $$
 select exists(
  select 1 from pg_locks
  where locktype='advisory' and pid=pg_backend_pid() and granted and objsubid=1
    and classid::bigint=((hashtextextended('kh:account:'||actor::text,0)>>32)&4294967295)
    and objid::bigint=(hashtextextended('kh:account:'||actor::text,0)&4294967295)
 )
$$;
do $$
declare
 f jsonb:=pg_temp.schedule_fixture(50);
 a uuid:=(f->>'agency')::uuid;
 u uuid:=(f->>'actor')::uuid;
 pid uuid:=(f->>'property')::uuid;
 owner uuid:='45000000-0000-4000-8000-000000000001';
 personal uuid:=gen_random_uuid();
 d jsonb;
begin
 perform pg_temp.kh_assert((select owner_id=owner from public.properties where id=pid),'fixture_has_protected_technical_custodian');
 perform pg_temp.kh_assert(not(owner=any(kh_private.sale_group_people(pid))),'corporate_custody_alone_excludes_protected_owner');
 perform pg_temp.kh_assert(u=any(kh_private.sale_group_people(pid)),'actual_responsible_remains_in_closure_set');
 -- A preparation by the actual team must not acquire the unrelated owner's lock.
 perform pg_temp.kh_as(u);
 perform public.kh_prepare_agency_sale(u,a,(f->>'deal')::uuid);
 perform pg_temp.kh_assert(not pg_temp.sale_account_locked(owner),'corporate_preparation_does_not_lock_technical_owner');
 -- The validation-free common mutex independently appends the actual actor.
 perform pg_temp.kh_as(owner);
 perform kh_private.sale_group_lock(owner,a,pid);
 perform pg_temp.kh_assert(pg_temp.sale_account_locked(owner),'protected_owner_retained_when_actual_actor');
 -- A real buyer role independently includes that same protected owner.
 perform pg_temp.kh_as(u);
 d:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'buyerId',owner,'assigneeId',u,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(owner=any(kh_private.sale_group_people(pid)),'protected_owner_retained_when_actual_buyer');
 -- A personal-origin listing uses its actual owner as source responsibility.
 perform pg_temp.kh_as(owner);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)
 values(personal,owner,personal::text,'Origen personal protegido','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal del actor protegido.','approved',array[owner||'/'||personal||'/photo.jpg']);
 perform pg_temp.kh_assert(owner=any(kh_private.sale_group_people(personal)),'protected_personal_source_retained');
end $$;
-- Each named assertion exercises persisted sale authority and atomic termination.
do $$declare f jsonb:=pg_temp.schedule_fixture(41);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;pid uuid:=(f->>'property')::uuid;did uuid:=(f->>'deal')::uuid;
 b uuid:=pg_temp.kh_agency_signup(42);v uuid:='45000000-0000-4000-8000-000000000042';m uuid:='45000000-0000-4000-8000-000000000008';coord uuid:='45000000-0000-4000-8000-000000000006';q jsonb;d jsonb;r jsonb;body jsonb;decision jsonb;result jsonb;offer jsonb;visit jsonb;past jsonb;t jsonb;begin
 perform pg_temp.kh_agency_approve(b);perform pg_temp.kh_as(v);q:=public.kh_request_agency_mandate(v,b,jsonb_build_object('propertyId',pid,'internalReference','CLOSE-COLLAB','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(u);perform public.kh_decide_agency_mandate(u,a,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(b,m,'manager'),(b,coord,'coordinator'),(a,coord,'coordinator');
 perform pg_temp.kh_as(v);d:=public.kh_create_agency_deal(v,b,jsonb_build_object('propertyId',pid,'assigneeId',m,'externalContact',jsonb_build_object('name','Comprador mínimo','phone','+5355555555','consentReference','Secreto privado'),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(m);body:=jsonb_build_object('winningDealId',d->>'id','executingManagerId',m,'amountUsd',29000,'occurredAt',clock_timestamp()-interval '1 hour','expectedPropertyVersion',(select version from public.properties where id=pid),'expectedAuthorityVersion',1,'clientRequestId',gen_random_uuid());r:=public.kh_request_agency_sale(m,b,body);
 perform pg_temp.kh_assert(r->>'state'='pending','collaborator_can_request_but_not_confirm');
 decision:=jsonb_build_object('requestId',r->>'id','action','confirm','expectedRequestVersion',1,'expectedPropertyVersion',body->'expectedPropertyVersion','expectedAuthorityVersion',1,'note','Confirmado','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',m,b,decision),'KH_AGENCY_ORIGIN_REQUIRED');
 perform pg_temp.kh_as(coord);perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',coord,a,decision),'KH_AGENCY_ORIGIN_REQUIRED');
 r:=public.kh_request_agency_sale(coord,b,body||jsonb_build_object('clientRequestId',gen_random_uuid()));perform pg_temp.kh_assert(r->>'state'='pending','coordinator_can_request_but_not_confirm');
 perform pg_temp.kh_as(v);insert into kh_private.agency_verifications(agency_id,active,reason)values(b,true,'Prueba') on conflict(agency_id)do update set active=true;
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',v,b,decision),'KH_AGENCY_ORIGIN_REQUIRED');
 perform pg_temp.kh_assert(true,'verified_collaborator_cannot_confirm_origin_sale');
 perform pg_temp.kh_as(u);q:=public.kh_list_agency_sale_requests(u,a,'incoming',0,30);perform pg_temp.kh_assert(jsonb_array_length(q->'items')>=1 and not(q::text like '%Secreto privado%') and not(q::text like '%55555555%'),'private_sale_request_does_not_grant_full_deal_access');perform pg_temp.kh_error(format('select public.kh_get_agency_deal(%L,%L,%L)',u,a,d->>'id'),'KH_AGENCY_DEAL_NOT_FOUND');
 visit:=pg_temp.visit_proposal(u,a,did,date_trunc('minute',clock_timestamp()+interval '8 days'));visit:=pg_temp.accept_visit(u,a,visit);
 past:=pg_temp.visit_proposal(u,a,did,date_trunc('minute',clock_timestamp()+interval '10 days'));past:=pg_temp.accept_visit(u,a,past);update kh_private.property_visit_slots set starts_at=clock_timestamp()-interval '2 days',ends_at=clock_timestamp()-interval '2 days'+interval '1 hour',outcome='performed' where proposal_id=(past->>'id')::uuid;
 perform pg_temp.kh_as(m);offer:=public.kh_create_agency_proposal(m,b,jsonb_build_object('dealId',d->>'id','kind','offer','amountUsd',29000,'note','Precio acordado','clientRequestId',gen_random_uuid()));offer:=public.kh_respond_agency_proposal(m,b,jsonb_build_object('proposalId',offer->>'id','expectedVersion',1,'action','accept','externalResponse',jsonb_build_object('channel','phone','reference','Confirmación manual'),'clientRequestId',gen_random_uuid()));
 r:=public.kh_request_agency_sale(m,b,body||jsonb_build_object('clientRequestId',gen_random_uuid()));decision:=decision||jsonb_build_object('requestId',r->>'id');perform pg_temp.kh_assert((select winning_proposal_id=(offer->>'id')::uuid from kh_private.agency_sale_requests where id=(r->>'id')::uuid),'request_freezes_actual_accepted_offer');
 perform pg_temp.kh_as(u);result:=public.kh_decide_agency_sale(u,a,decision);
 perform pg_temp.kh_assert(result#>>'{request,state}'='confirmed' and (select availability='sold' from public.properties where id=pid),'origin_admin_only_confirmation');
 perform pg_temp.kh_assert((select status='accepted' from kh_private.agency_proposals where id=(offer->>'id')::uuid) and (select outcome='performed' from kh_private.property_visit_slots where proposal_id=(past->>'id')::uuid),'closure_preserves_winning_proposal_and_performed_visits');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_deals where property_id=pid and closed_reason is null) and not exists(select 1 from kh_private.agency_reminders where deal_id=did and state='pending'),'closure_ends_all_open_alias_flows');
 perform pg_temp.kh_assert(public.kh_decide_agency_sale(u,a,decision)=result and (select count(*)=1 from kh_private.property_sale_closures where property_id=pid),'closure_replay_returns_same_receipt');
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,decision||jsonb_build_object('note','Otro contenido')),'KH_AGENCY_REQUEST_CONFLICT');perform pg_temp.kh_assert(true,'different_body_same_request_rejected');
 select kh_private.agency_task_json(x) into t from kh_private.agency_tasks x where deal_id=did and kind='external_notification';perform pg_temp.kh_assert(t->>'state'='open','external_visit_cancellation_creates_manual_contact_task_without_claiming_delivery');
 t:=public.kh_finish_agency_task(u,a,jsonb_build_object('taskId',t->>'id','state','done','expectedVersion',1,'clientRequestId',gen_random_uuid()));perform pg_temp.kh_assert(t->>'state'='done','current_staff_completes_communication_after_sale');
end $$;



create function pg_temp.sale_body(d uuid) returns jsonb language sql as $$select jsonb_build_object('winningDealId',x.id,'executingManagerId',x.assignee_id,'amountUsd',27000,'occurredAt',clock_timestamp()-interval '1 hour','expectedPropertyVersion',p.version,'expectedAuthorityVersion',coalesce(o.authority_version,1),'clientRequestId',gen_random_uuid()) from kh_private.agency_deals x join public.properties p on p.id=kh_private.agency_effective_property(x.property_id) left join kh_private.agency_property_origins o on o.property_id=p.id where x.id=d$$;
create function pg_temp.sale_decision(r jsonb) returns jsonb language sql as $$select jsonb_build_object('requestId',r->>'id','action','confirm','expectedRequestVersion',r->'version','expectedPropertyVersion',r->'expectedPropertyVersion','expectedAuthorityVersion',r->'expectedAuthorityVersion','note','','clientRequestId',gen_random_uuid())$$;

-- Personal source uses the account RPC, never membership or technical agency custody.
do $$declare a uuid:=pg_temp.kh_agency_signup(43);u uuid:='45000000-0000-4000-8000-000000000043';source uuid:='45000000-0000-4000-8000-000000000005';pid uuid:=gen_random_uuid();q jsonb;d jsonb;r jsonb;result jsonb;body jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(source);insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,source,pid::text,'Origen personal','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal para confirmar venta.','approved',array[source||'/'||pid||'/photo.jpg']);
 perform pg_temp.kh_as(u);q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',pid,'internalReference','SALE-PERSONAL','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(source);perform public.kh_decide_agency_mandate(source,null,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);d:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'assigneeId',u,'externalContact',jsonb_build_object('name','Comprador personal','phone',null,'consentReference','Dato privado'),'clientRequestId',gen_random_uuid()));r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body((d->>'id')::uuid));
 perform pg_temp.kh_as(source);q:=public.kh_list_personal_sale_requests(source,0,30);perform pg_temp.kh_assert(jsonb_array_length(q->'items')=1 and (q#>>'{items,0,canDecide}')::boolean,'personal_source_in_account_requests');body:=pg_temp.sale_decision(r);result:=public.kh_decide_personal_sale(source,body);
 perform pg_temp.kh_assert(result#>>'{closure,originAgencyId}' is null and result#>>'{closure,executingManagerId}'=u::text and (select availability='sold' from public.properties where id=pid),'personal_origin_confirms_its_own_sale');
 perform pg_temp.kh_assert(public.kh_decide_personal_sale(source,body)=result,'personal_receipt_replay');
 perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,''active'')',pid),'KH_AGENCY_PROPERTY_CLOSED');
 -- A different direct personal sale must not invent execution attribution.
 pid:=gen_random_uuid();insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,source,pid::text,'Venta personal directa','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal para cerrar flujos.','approved',array[source||'/'||pid||'/photo.jpg']);
 perform pg_temp.kh_as(u);q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',pid,'internalReference','SALE-DIRECT','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(source);perform public.kh_decide_agency_mandate(source,null,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);d:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'assigneeId',u,'externalContact',jsonb_build_object('name','Contacto directo','phone',null,'consentReference','Autorización'),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(source);update auth.users set email_confirmed_at=null where id=source;update kh_private.agency_settings set enabled=false;perform public.kh_set_property_status(pid,'sold');perform public.kh_set_property_status(pid,'sold');update auth.users set email_confirmed_at=now() where id=source;update kh_private.agency_settings set enabled=true;
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.property_sale_closures where property_id=pid) and (select request_id is null and origin_agency_id is null and executing_agency_id is null and executing_manager_id is null and amount_usd is null from kh_private.property_sale_closures where property_id=pid) and (select closed_reason='property_sold' from kh_private.agency_deals where id=(d->>'id')::uuid),'personal_direct_sold_shared_helper_no_invented_attribution');
end $$;

-- Attribution never silently moves when responsibility, mandate or agreement changes.
do $$declare f jsonb:=pg_temp.schedule_fixture(44);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;pid uuid:=(f->>'property')::uuid;did uuid:=(f->>'deal')::uuid;m uuid:='45000000-0000-4000-8000-000000000008';r jsonb;p jsonb;q jsonb;body jsonb;result jsonb;begin
 perform pg_temp.kh_as(u);r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,m,'manager');perform public.kh_assign_agency_deal(u,a,jsonb_build_object('dealId',did,'userId',m,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,pg_temp.sale_decision(r)),'KH_AGENCY_SALE_STALE');perform pg_temp.kh_assert((select availability='active' from public.properties where id=pid) and not exists(select 1 from kh_private.property_sale_closures where property_id=pid),'stale_executor_rejects_atomically');
 r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));update kh_private.agency_mandates set version=version+1 where property_id=pid and agency_id=a;perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,pg_temp.sale_decision(r)),'KH_AGENCY_SALE_STALE');
 r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));update kh_private.agency_property_origins set authority_version=authority_version+1 where property_id=pid;perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,pg_temp.sale_decision(r)),'KH_AGENCY_SALE_STALE');
 -- Later accepted offer supersedes a previously manual request association.
 r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));p:=public.kh_create_agency_proposal(u,a,jsonb_build_object('dealId',did,'kind','offer','amountUsd',26000,'note','No compartir nota privada','clientRequestId',gen_random_uuid()));p:=public.kh_respond_agency_proposal(u,a,jsonb_build_object('proposalId',p->>'id','expectedVersion',1,'action','accept','externalResponse',jsonb_build_object('channel','phone','reference','No compartir referencia'),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,pg_temp.sale_decision(r)),'KH_AGENCY_SALE_STALE');
 q:=public.kh_create_agency_proposal(u,a,jsonb_build_object('dealId',did,'kind','offer','amountUsd',25000,'note','Segunda propuesta privada','clientRequestId',gen_random_uuid()));q:=public.kh_respond_agency_proposal(u,a,jsonb_build_object('proposalId',q->>'id','expectedVersion',1,'action','accept','externalResponse',jsonb_build_object('channel','phone','reference','Segunda referencia privada'),'clientRequestId',gen_random_uuid()));
 -- Real acceptance events determine order even when proposal creation timestamps differ.
 update kh_private.agency_proposals set created_at=clock_timestamp()+interval '1 day' where id=(p->>'id')::uuid;
 r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));perform pg_temp.kh_assert((select winning_proposal_id=(q->>'id')::uuid from kh_private.agency_sale_requests where id=(r->>'id')::uuid) and r->>'amountUsd'='27000' and not(r::text like '%No compartir%'),'latest_actual_acceptance_and_explicit_final_price');body:=pg_temp.sale_decision(r);result:=public.kh_decide_agency_sale(u,a,body);
 -- A successful receipt never grants an ex-administrator permission.
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,'45000000-0000-4000-8000-000000000006','admin');perform public.kh_remove_agency_member(u,a,jsonb_build_object('userId',u,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_error(format('select public.kh_decide_agency_sale(%L,%L,%L)',u,a,body),'KH_AGENCY_ORIGIN_REQUIRED');perform pg_temp.kh_assert(true,'replay_requires_current_origin_authority');perform pg_temp.kh_error(format('select public.kh_prepare_agency_sale(%L,%L,%L)',u,a,did),'KH_AGENCY_DEAL_NOT_FOUND');
end $$;

-- A real compatible merge keeps old deal/cycle/chat UUIDs and closes the entire group.
do $$declare f jsonb:=pg_temp.schedule_fixture(45);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;aliasid uuid:=(f->>'property')::uuid;did uuid:=(f->>'deal')::uuid;pid uuid:=gen_random_uuid();owner uuid:='45000000-0000-4000-8000-000000000001';buyer uuid:='45000000-0000-4000-8000-000000000002';p jsonb;v jsonb;conv jsonb;q jsonb;r jsonb;body jsonb;begin
 perform pg_temp.kh_as(u);insert into storage.objects(bucket_id,name)values('property-photos',u||'/'||pid||'/photo.jpg');p:=public.kh_agency_save_property(u,a,jsonb_build_object('clientRequestId',pid,'sourceReference',pid,'consentReference','Consentimiento comprobado','publicationIntent','submit','draft',jsonb_build_object('title','Casa canónica','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Vivienda común para cierre consolidado.','photoPaths',jsonb_build_array(u||'/'||pid||'/photo.jpg'))));pid:=(p#>>'{property,id}')::uuid;perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,1);
 v:=pg_temp.visit_proposal(u,a,did,date_trunc('minute',clock_timestamp()+interval '12 days'));v:=pg_temp.accept_visit(u,a,v);
 perform pg_temp.kh_as(buyer);conv:=public.kh_start_agency_conversation(buyer,a,jsonb_build_object('propertyId',aliasid,'clientRequestId',gen_random_uuid()));perform public.kh_send_agency_message(buyer,null,jsonb_build_object('conversationId',conv->>'id','body','Historia que se conserva','clientMessageId',gen_random_uuid(),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(owner);perform public.kh_admin_merge_property_duplicates(owner,jsonb_build_object('canonicalId',pid,'duplicateIds',jsonb_build_array(aliasid),'expectedVersions',jsonb_build_object(pid,(select version from public.properties where id=pid),aliasid,(select version from public.properties where id=aliasid)),'originEvidence','Origen empresarial coincidente','reason','Consolidación revisada para cierre','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);q:=public.kh_prepare_agency_sale(u,a,did);perform pg_temp.kh_assert(q->>'propertyId'=pid::text and q->>'dealId'=did::text,'carried_alias_closure_prepares_canonical_versions');perform pg_temp.kh_assert(not(q?'privateContact') and not(q?'buyerId') and not(q?'consentReference') and q->>'executingManagerId'=u::text,'preparation_exposes_only_current_own_deal_sale_facts');r:=public.kh_request_agency_sale(u,a,pg_temp.sale_body(did));perform public.kh_decide_agency_sale(u,a,pg_temp.sale_decision(r));
 perform pg_temp.kh_assert((select count(*)=2 from public.properties where id in(pid,aliasid) and availability='sold') and not exists(select 1 from kh_private.commercial_cycles where property_id in(pid,aliasid) and state='open') and (select property_id=aliasid and closed_reason='property_sold' from kh_private.agency_deals where id=did),'closure_ends_all_open_alias_flows_real_merge');
 perform pg_temp.kh_assert((select outcome='cancelled' from kh_private.property_visit_slots where proposal_id=(v->>'id')::uuid) and (select count(*)=1 from kh_private.property_sale_closures where property_id in(pid,aliasid)),'alias_visits_cancelled_one_canonical_receipt');
 perform pg_temp.kh_as(buyer);q:=public.kh_get_agency_conversation(buyer,null,(conv->>'id')::uuid);perform pg_temp.kh_assert(not(q->>'canSend')::boolean and q->>'propertyId'=aliasid::text and (select count(*)=1 from kh_private.agency_messages where conversation_id=(conv->>'id')::uuid),'buyer_retains_same_readonly_conversation');
 perform pg_temp.kh_error(format('select public.kh_send_agency_message(%L,null,%L)',buyer,jsonb_build_object('conversationId',conv->>'id','body','Mensaje posterior a venta','clientMessageId',gen_random_uuid(),'clientRequestId',gen_random_uuid())),'KH_AGENCY_CONVERSATION_CLOSED');
 perform pg_temp.kh_assert(not has_table_privilege('authenticated','kh_private.agency_sale_requests','SELECT') and not has_function_privilege('authenticated','kh_private.close_commercial_cycle(uuid,uuid,uuid)','EXECUTE'),'closure_tables_and_helper_are_private');
end $$;


-- Historical personal commitments keep their original facts and gain an explicit sale reason.
do $$declare a uuid:=pg_temp.kh_agency_signup(46);u uuid:='45000000-0000-4000-8000-000000000046';seller uuid:='45000000-0000-4000-8000-000000000007';buyer uuid:='45000000-0000-4000-8000-000000000004';pid uuid:=gen_random_uuid();conv uuid:=gen_random_uuid();past uuid:=gen_random_uuid();expired uuid:=gen_random_uuid();future jsonb;d jsonb;q jsonb;stamp timestamptz:=date_trunc('minute',clock_timestamp()+interval '7 days');before_expired jsonb;before_past jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(seller);insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,seller,pid::text,'Historia personal intacta','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal con compromisos históricos.','approved',array[seller||'/'||pid||'/photo.jpg']);
 insert into public.kh_conversations(id,property_id,property_title,property_location,buyer_id,seller_id)values(conv,pid,'Historia personal intacta','Vedado',buyer,seller);
 insert into public.kh_negotiations(id,conversation_id,created_by,kind,status,visit_date,visit_time,visit_at,expires_at)values(past,conv,buyer,'visit','accepted',(stamp at time zone 'America/Havana')::date,(stamp at time zone 'America/Havana')::time,stamp,stamp);
 insert into kh_private.property_visit_slots(property_id,personal_negotiation_id,assignee_id,starts_at,ends_at,outcome)values(pid,past,seller,stamp-interval '14 days',stamp-interval '14 days'+interval '1 hour','performed');
 insert into public.kh_negotiations(id,conversation_id,created_by,kind,status,amount_usd,expires_at)values(expired,conv,buyer,'offer','pending',25000,clock_timestamp()-interval '1 day');select to_jsonb(n) into before_expired from public.kh_negotiations n where id=expired;select to_jsonb(n) into before_past from public.kh_negotiations n where id=past;
 perform pg_temp.kh_as(buyer);future:=public.kh_create_negotiation(buyer,jsonb_build_object('conversationId',conv,'kind','visit','visitDate',to_char(stamp at time zone 'America/Havana','YYYY-MM-DD'),'visitTime',to_char(stamp at time zone 'America/Havana','HH24:MI'),'note','Acuerdo personal privado','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(seller);perform public.kh_respond_negotiation(seller,jsonb_build_object('id',future->>'id','action','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',pid,'internalReference','PERSONAL-HISTORY','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(seller);perform public.kh_decide_agency_mandate(seller,null,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 select to_jsonb(n) into before_expired from public.kh_negotiations n where id=expired;perform public.kh_set_property_status(pid,'sold');
 perform pg_temp.kh_assert((select to_jsonb(n)=before_past from public.kh_negotiations n where id=past) and (select outcome='performed' from kh_private.property_visit_slots where personal_negotiation_id=past),'personal_performed_history_byte_preserved');
 perform pg_temp.kh_assert((select to_jsonb(n)=before_expired from public.kh_negotiations n where id=expired),'expired_history_not_rewritten_as_cancelled');
 perform pg_temp.kh_assert((select status='cancelled' and termination_reason='property_sold' from public.kh_negotiations where id=(future->>'id')::uuid) and (select outcome='cancelled' from kh_private.property_visit_slots where personal_negotiation_id=(future->>'id')::uuid),'personal_future_commitment_ends_with_reason');
 perform pg_temp.kh_assert((select count(*)=2 from kh_private.commercial_termination_events where subject_id=conv and state='pending') and not exists(select 1 from kh_private.commercial_termination_events where subject_id=conv and delivered_at is not null),'sale_outbox_does_not_claim_delivery');
end $$;


-- A personal owner must retain the existing sold action even before a mandate is approved.
do $$declare a uuid:=pg_temp.kh_agency_signup(47);u uuid:='45000000-0000-4000-8000-000000000047';seller uuid:='45000000-0000-4000-8000-000000000007';pid uuid:=gen_random_uuid();q jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(seller);insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,seller,pid::text,'Venta con autorización pendiente','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal sin un ciclo previo.','approved',array[seller||'/'||pid||'/photo.jpg']);
 perform pg_temp.kh_as(u);q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',pid,'internalReference','PENDING-ONLY','clientRequestId',gen_random_uuid()));perform pg_temp.kh_as(seller);perform public.kh_set_property_status(pid,'sold');
 perform pg_temp.kh_assert((select availability='sold' from public.properties where id=pid) and (select state='withdrawn' and termination_reason='property_sold' from kh_private.agency_mandate_requests where id=(q->>'id')::uuid),'personal_sold_with_only_pending_mandate_ends_request');perform pg_temp.kh_assert((select count(*)=1 from kh_private.commercial_cycles where property_id=pid and state='closed') and (select request_id is null and executing_agency_id is null and executing_manager_id is null and amount_usd is null from kh_private.property_sale_closures where property_id=pid),'first_cycle_direct_sale_retains_null_attribution');
end $$;



do $$declare a uuid:=pg_temp.kh_agency_signup(48);u uuid:='45000000-0000-4000-8000-000000000048';seller uuid:='45000000-0000-4000-8000-000000000007';pid uuid:=gen_random_uuid();q jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(seller);insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,seller,pid::text,'Ciclo previo terminado','Vedado','La Habana','Casa',30000,2,1,'Vivienda con un ciclo cerrado explícitamente.','approved',array[seller||'/'||pid||'/photo.jpg']);insert into kh_private.commercial_cycles(property_id,state,termination_reason)values(pid,'closed','previous_withdrawal');
 perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,''sold'')',pid),'KH_AGENCY_PROPERTY_CLOSED');perform pg_temp.kh_assert((select count(*)=1 from kh_private.commercial_cycles where property_id=pid) and not exists(select 1 from kh_private.property_sale_closures where property_id=pid) and (select availability='active' from public.properties where id=pid),'direct_personal_never_reopens_prior_closed_cycle');
 -- Pure personal sold remains its legacy operation, without synthetic sale records.
 pid:=gen_random_uuid();insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,seller,pid::text,'Venta personal ordinaria','Vedado','La Habana','Casa',30000,2,1,'Vivienda sin sujetos empresariales.','approved',array[seller||'/'||pid||'/photo.jpg']);update auth.users set email_confirmed_at=null where id=seller;update kh_private.agency_settings set enabled=false;perform public.kh_set_property_status(pid,'sold');perform public.kh_set_property_status(pid,'sold');perform pg_temp.kh_assert((select availability='sold' and version=2 from public.properties where id=pid) and not exists(select 1 from kh_private.commercial_cycles where property_id=pid),'pure_personal_status_and_idempotence_unchanged');update auth.users set email_confirmed_at=now() where id=seller;update kh_private.agency_settings set enabled=true;
end $$;


do $$declare f jsonb:=pg_temp.schedule_fixture(49);a uuid:=(f->>'agency')::uuid;u uuid:=(f->>'actor')::uuid;did uuid:=(f->>'deal')::uuid;body jsonb;begin
 perform pg_temp.kh_as(u);body:=pg_temp.sale_body(did);perform pg_temp.kh_error(format('select public.kh_request_agency_sale(%L,%L,%L)',u,a,body||jsonb_build_object('occurredAt','2026-01-01')),'KH_AGENCY_SALE_INVALID');perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_sale_requests where winning_deal_id=did),'sale_date_requires_explicit_instant');
end $$;
