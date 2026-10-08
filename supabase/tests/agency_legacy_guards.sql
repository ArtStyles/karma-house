do $$ declare a uuid:=pg_temp.kh_agency_signup(9);actor uuid:='45000000-0000-4000-8000-000000000009';owner uuid:='45000000-0000-4000-8000-000000000001';pid uuid:=gen_random_uuid();alias_id uuid:=gen_random_uuid();begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(owner);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation)values(pid,owner,pid::text,'Origen empresarial','Vedado','La Habana','Casa',30000,2,1,'Ficha histórica para rutas anteriores.','draft');
 insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)values(pid,a,actor,'LEGACY','Consentimiento');
 insert into kh_private.agency_mandates(property_id,agency_id,reference)values(pid,a,'LEGACY');
 perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,%L)',pid,'sold'),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_submit_property(%L)',pid),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_save_property(%L)',jsonb_build_object('id',pid)),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_error(format('update public.properties set owner_id=%L where id=%L',actor,pid),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_assert((select owner_id=owner from public.properties where id=pid) and (select origin_agency_id=a from kh_private.agency_property_origins where property_id=pid),'old_transfer_cannot_change_agency_origin');
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,availability)values(alias_id,owner,alias_id::text,'Alias histórico','Vedado','La Habana','Casa',30000,2,1,'Alias protegido contra reactivación.','draft','paused');
 insert into kh_private.property_aliases(property_id,canonical_id,origin_evidence,reason,reviewed_by)values(alias_id,pid,'Origen comprobado','Duplicado comprobado',owner);
 perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,%L)',alias_id,'active'),'KH_PROPERTY_ALIAS_READ_ONLY');
 perform pg_temp.kh_assert((select availability='paused' from public.properties where id=alias_id),'old_rpc_cannot_set_sold_or_reactivate_alias');
 -- A legacy owner mutation must also fail for a PERSONAL source with business history.
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation)values(gen_random_uuid(),actor,'legacy-personal','Personal','Vedado','La Habana','Casa',30000,2,1,'Origen personal no transferible tras autorización.','draft') returning id into pid;
 insert into kh_private.commercial_cycles(property_id)values(pid);
 perform pg_temp.kh_as(null);
 perform pg_temp.kh_error(format('update public.properties set owner_id=%L where id=%L',owner,pid),'KH_AGENCY_SOURCE_IMMUTABLE');
end $$;

-- A transfer offered before authorization must be invalidated at acceptance.
do $$ declare a uuid:=pg_temp.kh_agency_signup(10);actor uuid:='45000000-0000-4000-8000-000000000010';owner uuid:='45000000-0000-4000-8000-000000000001';collab uuid:=gen_random_uuid();pid uuid;r jsonb;decision jsonb;corporate boolean;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(owner);
 update kh_private.assisted_listing_settings set official_publisher_id=owner,transfers_enabled=true;
 insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel,account_id,link_evidence_reference,link_confirmed_at,link_confirmed_by)values(collab,'agency','Colaboradora de prueba','Contacto privado','manual',actor,'Identidad comprobada',now(),owner);
 foreach corporate in array array[true,false] loop
  pid:=gen_random_uuid();
  insert into storage.objects(bucket_id,name)values('property-photos',owner||'/'||pid||'/photo.jpg');
  insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,owner,pid::text,'Transferencia previa','Vedado','La Habana','Casa',30000,2,1,'Vivienda ofrecida antes de la autorización.','approved',array[owner||'/'||pid||'/photo.jpg']);
  insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at)values(pid,collab,pid::text,'manual',now(),'Consentimiento explícito para esta vivienda.','1',now(),'Evidencia comprobada',owner,now());
  r:=public.kh_offer_listing_transfer(owner,jsonb_build_object('clientRequestId',gen_random_uuid(),'collaboratorId',collab,'expectedCollaboratorVersion',1,'recipientId',actor,'items',jsonb_build_array(jsonb_build_object('propertyId',pid,'expectedVersion',1,'expectedProvenanceVersion',1))));
  if corporate then insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)values(pid,a,actor,pid::text,'Consentimiento');
  else insert into kh_private.commercial_cycles(property_id)values(pid);end if;
  perform pg_temp.kh_as(actor);decision:=public.kh_decide_listing_transfer(actor,jsonb_build_object('requestId',r->>'id','expectedRequestVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
  perform pg_temp.kh_assert(decision->>'state'='invalidated' and (select owner_id=owner from public.properties where id=pid),'old_transfer_acceptance_rechecks_business_source');
  perform pg_temp.kh_as(owner);
 end loop;
 -- Personal verification and untrusted profile metadata do not grant an agency seal.
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000003');perform public.kh_set_user_verified(auth.uid(),actor,true,'Verificación personal de prueba');
 update auth.users set raw_user_meta_data=raw_user_meta_data||'{"verified":true,"agency_verified":true}'::jsonb where id=actor;
 perform pg_temp.kh_assert(not(kh_private.agency_summary(a)->>'verified')::boolean,'personal_profile_verification_cannot_verify_agency');
 perform pg_temp.kh_as(actor);pid:=gen_random_uuid();insert into storage.objects(bucket_id,name)values('property-photos',actor||'/'||pid||'/photo.jpg');
 r:=public.kh_agency_save_property(actor,a,jsonb_build_object('clientRequestId',pid,'sourceReference','PERSONAL-VERIFIED','consentReference','Consentimiento','publicationIntent','submit','draft',jsonb_build_object('title','Envío empresarial sin sello','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','La verificación personal no evita revisión.','photoPaths',jsonb_build_array(actor||'/'||pid||'/photo.jpg'))));
 perform pg_temp.kh_assert(r#>>'{property,moderation}'='pending','personal_verification_cannot_publish_agency_directly');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
 perform pg_temp.kh_error(format('select public.kh_start_conversation(%L,%L)',r#>>'{property,id}',auth.uid()),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_start_conversation_for_manager(%L,%L,%L)',r#>>'{property,id}',auth.uid(),owner),'KH_AGENCY_CONTEXT_REQUIRED');
end $$;
