do $$ declare actor uuid:='45000000-0000-4000-8000-000000000007';owner uuid:='45000000-0000-4000-8000-000000000001';buyer uuid:='45000000-0000-4000-8000-000000000008';c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();other uuid:=gen_random_uuid();chat uuid:=gen_random_uuid();body jsonb;n integer;begin
 perform pg_temp.kh_agency_signup();perform pg_temp.kh_as(actor);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)select i,actor,i::text,'Vivienda duplicada','Vedado','La Habana','Casa',30000,2,1,'Una vivienda para pruebas de consolidación.','approved',array[actor||'/'||i||'/photo.jpg'] from unnest(array[c,d])i;
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(other,buyer,other::text,'Otro origen','Vedado','La Habana','Casa',30000,2,1,'Vivienda de otro origen independiente.','approved',array[buyer||'/'||other||'/photo.jpg']);
 insert into public.favorites(user_id,property_id)values(buyer,c),(buyer,d);
 insert into public.kh_conversations(id,property_id,property_title,property_location,buyer_id,seller_id)values(chat,d,'Vivienda duplicada','Vedado',buyer,actor);
 body:=jsonb_build_object('canonicalId',c,'duplicateIds',jsonb_build_array(d),'expectedVersions',jsonb_build_object(c,1,d,1),'originEvidence','Mismo propietario y vivienda comprobados','reason','Duplicado revisado manualmente','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',actor,body),'KH_OWNER_REQUIRED');
 insert into kh_private.saved_searches(user_id,name,filters)values(buyer,'Consolidación sin nuevo aviso','{"operations":["sale"]}');
 perform pg_temp.kh_as(owner);n:=(select count(*) from kh_private.notifications);
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',owner,body||jsonb_build_object('duplicateIds',jsonb_build_array(other),'expectedVersions',jsonb_build_object(c,1,other,1))),'KH_PROPERTY_ORIGIN_CONFLICT');
 perform public.kh_admin_merge_property_duplicates(owner,body);
 perform pg_temp.kh_assert(public.kh_resolve_property_alias(d)=c,'old UUID resolves to canonical');
 perform pg_temp.kh_assert((select count(*)=1 from public.favorites where user_id=buyer and property_id in(c,d)),'favorites_resolve_to_single_canonical_property');
 perform pg_temp.kh_assert((select property_id=d and buyer_id=buyer and seller_id=actor from public.kh_conversations where id=chat),'aliases_preserve_private_chat_ids');
 perform pg_temp.kh_assert((select availability='paused' from public.properties where id=d),'duplicate retained paused');
 perform pg_temp.kh_assert((select count(*)=1 from public.properties where id in(c,d) and moderation='approved' and availability='active'),'catalog_counts_one_canonical_property');
 perform pg_temp.kh_assert((select count(*)=n from kh_private.notifications),'consolidation_does_not_emit_new_listing_alert');
 perform pg_temp.kh_as(actor);perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,''active'')',d),'KH_PROPERTY_ALIAS_READ_ONLY');
end $$;


-- Mandates follow the same dwelling when reviewed copies are consolidated.
do $$ declare a uuid:=pg_temp.kh_agency_signup(12);b uuid:=pg_temp.kh_agency_signup(13);owner uuid:='45000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();body jsonb;mode text;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_agency_approve(b);
 foreach mode in array array['absent','active','withdrawn'] loop
  c:=gen_random_uuid();d:=gen_random_uuid();perform pg_temp.kh_as(owner);
  insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)select i,owner,i::text,'Mismo origen empresarial','Vedado','La Habana','Casa',30000,2,1,'Vivienda común con mandatos propios conservados.','approved',array[owner||'/'||i||'/photo.jpg'] from unnest(array[c,d])i;
  insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)select i,a,owner,i::text,'Consentimiento' from unnest(array[c,d])i;
  insert into kh_private.agency_mandates(property_id,agency_id,reference)values(c,a,c::text),(d,a,d::text),(d,b,d::text);
  if mode<>'absent' then insert into kh_private.agency_mandates(property_id,agency_id,state,reference)values(c,b,mode,c::text);end if;
  insert into kh_private.agency_property_changes(property_id,agency_id,kind,proposed_payload,expected_property_version,created_by)values(d,b,'price','{"price":31000}',1,owner);
  body:=jsonb_build_object('canonicalId',c,'duplicateIds',jsonb_build_array(d),'expectedVersions',jsonb_build_object(c,1,d,1),'originEvidence','Mismo origen empresarial comprobado','reason','Duplicado identificado por revisión','clientRequestId',gen_random_uuid());
  perform public.kh_admin_merge_property_duplicates(owner,body);
  perform pg_temp.kh_assert((select state='withdrawn' and termination_reason=case when mode='withdrawn' then 'authorization_withdrawn' else 'duplicate_consolidated' end from kh_private.agency_property_changes where property_id=d and agency_id=b),'merge_terminates_changes_with_effective_authorization_reason');
  if mode='absent' then
   perform pg_temp.kh_assert((select state='active' and reference=d::text and version=2 from kh_private.agency_mandates where property_id=c and agency_id=b),'merge_carries_authorized_agency_and_private_reference');
   perform pg_temp.kh_assert(exists(select 1 from kh_private.agency_events where agency_id=b and kind='mandate_consolidated' and subject_id=c and payload->>'previousPropertyId'=d::text),'carried mandate keeps private origin history');
  else
   perform pg_temp.kh_assert((select state=mode and reference=c::text and version=1 from kh_private.agency_mandates where property_id=c and agency_id=b),'merge_preserves_existing_canonical_'||mode);
  end if;
 end loop;
end $$;

-- Technical custody alone does not establish a shared source.
do $$ declare owner uuid:='45000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();ca uuid:=gen_random_uuid();cb uuid:=gen_random_uuid();body jsonb;begin
 perform pg_temp.kh_as(owner);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)select i,owner,i::text,'Vivienda asistida comparable','Vedado','La Habana','Casa',30000,2,1,'Vivienda asistida con evidencia privada conservada.','approved',array[owner||'/'||i||'/photo.jpg'] from unnest(array[c,d])i;
 body:=jsonb_build_object('canonicalId',c,'duplicateIds',jsonb_build_array(d),'expectedVersions',jsonb_build_object(c,1,d,1),'originEvidence','Evidencia no puede transferir autoridad','reason','Duplicado identificado por revisión','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',owner,body),'KH_PROPERTY_ORIGIN_CONFLICT');
 insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel)values(ca,'agency','Fuente A','Privado A','email'),(cb,'agency','Fuente B','Privado B','email');
 insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,source_reference,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at,confirmed_price,confirmed_availability)
 select i,case when i=c then ca else cb end,'CASA','email','Mensaje original',now(),'Consentimiento explícito comprobado.','1',now(),'Evidencia privada',owner,now(),30000,'active' from unnest(array[c,d])i;
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',owner,body),'KH_PROPERTY_ORIGIN_CONFLICT');
 update kh_private.assisted_listing_records set collaborator_id=ca,collaborator_reference='CASA-2',source_reference='Mensaje de otra fuente' where property_id=d;
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',owner,body),'KH_PROPERTY_ORIGIN_CONFLICT');
 update kh_private.assisted_listing_records set source_reference='Mensaje original' where property_id=d;
 perform public.kh_admin_merge_property_duplicates(owner,body);
 perform pg_temp.kh_assert(public.kh_resolve_property_alias(d)=c,'compatible assisted source permits reviewed consolidation');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.property_media_assets where property_id=d and state='attached'),'aliases_preserve_historical_photos');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.property_publication_keys where property_id=d),'aliases_preserve_publication_receipts');
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,jsonb_build_object('propertyId',d)),'KH_PROPERTY_ALIAS_READ_ONLY');
end $$;


do $$ declare a uuid:=pg_temp.kh_agency_signup(14);owner uuid:='45000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();d uuid:=gen_random_uuid();body jsonb;begin
 perform pg_temp.kh_agency_approve(a);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)select i,owner,i::text,'Vivienda con bloqueo','Vedado','La Habana','Casa',30000,2,1,'Vivienda de origen comprobado con moderación.','approved',array[owner||'/'||i||'/photo.jpg'] from unnest(array[c,d])i;
 insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)select i,a,owner,i::text,'Consentimiento' from unnest(array[c,d])i;
 insert into kh_private.agency_mandates(property_id,agency_id,reference)values(c,a,c::text),(d,a,d::text);
 perform public.kh_admin_unpublish(owner,d,1,'Revisión pendiente sobre la copia');
 body:=jsonb_build_object('canonicalId',c,'duplicateIds',jsonb_build_array(d),'expectedVersions',jsonb_build_object(c,1,d,2),'originEvidence','Origen comprobado en ambas fichas','reason','Consolidación manual comprobada','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_admin_merge_property_duplicates(%L,%L)',owner,body),'KH_PROPERTY_MODERATION_CONFLICT');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.property_aliases where property_id=d) and (select version=1 and moderation='approved' from public.properties where id=c),'hold mismatch has no merge side effects');
 perform public.kh_admin_unpublish(owner,c,1,'Revisión pendiente sobre el canónico');
 body:=body||jsonb_build_object('expectedVersions',jsonb_build_object(c,2,d,2));
 perform public.kh_admin_merge_property_duplicates(owner,body);
 perform pg_temp.kh_assert((select moderation='rejected' from public.properties where id=c) and (select count(*)=2 from kh_private.agency_property_moderation_holds where property_id in(c,d) and active),'canonical_and_historical_holds_remain_independent');
 perform pg_temp.kh_assert(kh_private.agency_publication_policy(c,a)='requires_review','consolidation_never_lifts_canonical_hold');
end $$;

do $$begin
 perform pg_temp.kh_assert(not has_function_privilege('authenticated','kh_private.terminate_mandate_flows(uuid,uuid,text)','execute'),'private termination helper cannot be invoked by client');
 perform pg_temp.kh_assert(not has_function_privilege('anon','public.kh_admin_merge_property_duplicates(uuid,jsonb)','execute'),'anonymous cannot merge');
 perform pg_temp.kh_assert(not has_function_privilege('authenticated','kh_private.mandate_context(uuid,uuid,uuid,uuid)','execute'),'client cannot mint source context');
 perform pg_temp.kh_assert(has_function_privilege('anon','public.kh_resolve_property_alias(uuid)','execute'),'old public links resolve anonymously');
end $$;
