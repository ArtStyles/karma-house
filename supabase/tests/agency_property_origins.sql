-- Real transactional behavior. The runner supplies the Auth/Storage fixture only.
-- Missing private grants would let a client mint its own transaction authority.
create function pg_temp.kh_task5_assisted(n integer) returns jsonb language plpgsql as $$
declare a uuid:=pg_temp.kh_agency_signup(n);owner uuid:='45000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();request text:=gen_random_uuid()::text;p jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(owner);
 update kh_private.assisted_listing_settings set official_publisher_id=owner;
 insert into storage.objects(bucket_id,name)values('property-photos',owner||'/'||request||'/photo.jpg');
 p:=public.kh_save_property(jsonb_build_object('ownerId',owner,'clientRequestId',request,'title','Asistida para regresión','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Vivienda asistida con material y autorización comprobada.','moderation','pending','photoPaths',jsonb_build_array(owner||'/'||request||'/photo.jpg')));
 insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel)values(c,'agency','Agencia de prueba','contacto privado','email');
 insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,source_reference,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at,confirmed_price,confirmed_availability)
 values((p->>'id')::uuid,c,'CASA','email','Mensaje original',now(),'Consentimiento explícito sobre esta vivienda.','1',now(),'Evidencia conservada',owner,now(),30000,'active');
 return jsonb_build_object('agencyId',a,'propertyId',p->>'id','collaboratorId',c,'expectedCollaboratorVersion',1,'expectedPropertyVersion',1,'sourceReference','CASA','consentReference','Permiso comprobado','evidenceReference','Vínculo confirmado','clientRequestId',gen_random_uuid());
end $$;
do $$ declare op text;body jsonb;x jsonb;actor uuid:='45000000-0000-4000-8000-000000000007';begin
 perform pg_temp.kh_as(actor);
 foreach op in array array['sale','rent','swap','wanted'] loop
  body:=jsonb_build_object('clientRequestId','personal-'||op,'ownerId',actor,'moderation','draft','operation',op,'title','Personal conservada','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Este anuncio personal conserva su recorrido.','photoPaths','[]'::jsonb)
   ||case when op='rent' then '{"rentPeriod":"month"}'::jsonb when op='swap' then '{"swapWants":"Otra vivienda con condiciones equivalentes.","swapProvinces":["La Habana"],"swapBalance":"none"}'::jsonb else '{}'::jsonb end;
  x:=public.kh_save_property(body);
  perform pg_temp.kh_assert(x->>'operation'=op and x->>'owner_id'=actor::text and x->>'moderation'='draft','personal_rent_swap_wanted_remain_unchanged: '||op);
  perform pg_temp.kh_assert(public.kh_save_property(body)->>'id'=x->>'id','personal replay retains identity');
  x:=public.kh_save_property(body||jsonb_build_object('id',x->>'id','expectedVersion',1,'title','Personal editada'));
  perform pg_temp.kh_assert(x->>'title'='Personal editada' and (x->>'version')::integer=2,'personal edit version');
 end loop;
end $$;

do $$ declare body jsonb:=pg_temp.kh_task5_assisted(20);other uuid:=pg_temp.kh_agency_signup(21);owner uuid:='45000000-0000-4000-8000-000000000001';cid uuid:=(body->>'collaboratorId')::uuid;pid uuid:=(body->>'propertyId')::uuid;actor uuid:='45000000-0000-4000-8000-000000000020';transfer jsonb;begin
 perform pg_temp.kh_agency_approve(other);perform pg_temp.kh_as(owner);
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body||'{"expectedCollaboratorVersion":2}'),'KH_VERSION_CONFLICT');
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body||'{"expectedPropertyVersion":2}'),'KH_VERSION_CONFLICT');
 update kh_private.assisted_listing_records set consent_revoked_at=now() where property_id=pid;
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 update kh_private.assisted_listing_records set consent_revoked_at=null where property_id=pid;
 update kh_private.assisted_collaborators set account_id='45000000-0000-4000-8000-000000000008',link_confirmed_at=now() where id=cid;
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 update kh_private.assisted_collaborators set account_id=actor where id=cid;
 update kh_private.agency_memberships set state='removed' where user_id=actor;
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 update kh_private.agency_memberships set state='active',role='manager' where user_id=actor;
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 update kh_private.agency_memberships set role='admin' where user_id=actor;
 update auth.users set email_confirmed_at=null where id=actor;
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 update auth.users set email_confirmed_at=now() where id=actor;
 insert into kh_private.assisted_agency_links(collaborator_id,agency_id,evidence_reference,confirmed_by)values(cid,other,'Asociación previa',owner);
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 delete from kh_private.assisted_agency_links where collaborator_id=cid;
 insert into kh_private.agency_property_origins(property_id,origin_agency_id,publisher_id,source_reference,consent_reference)values(pid,other,owner,'OTRA','Permiso');
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 delete from kh_private.agency_property_origins where property_id=pid;
 update kh_private.assisted_listing_settings set transfers_enabled=true;
 transfer:=public.kh_offer_listing_transfer(owner,jsonb_build_object('clientRequestId',gen_random_uuid(),'collaboratorId',cid,'expectedCollaboratorVersion',1,'recipientId',actor,'items',jsonb_build_array(jsonb_build_object('propertyId',pid,'expectedVersion',1,'expectedProvenanceVersion',1))));
 perform pg_temp.kh_as(actor);
 perform public.kh_decide_listing_transfer(actor,jsonb_build_object('requestId',transfer->>'id','expectedRequestVersion',1,'clientRequestId',gen_random_uuid(),'decision','accept'));
 perform pg_temp.kh_as(owner);
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_property_origins where property_id=pid),'rejected provenance attempts never assign origin');
end $$;

do $$ declare body jsonb;mode text;pid uuid;a uuid;actor uuid;owner uuid:='45000000-0000-4000-8000-000000000001';moderator uuid:='45000000-0000-4000-8000-000000000003';reviewer uuid;result jsonb;draft jsonb;n integer:=22;begin
 foreach mode in array array['unpublish','reject'] loop
  body:=pg_temp.kh_task5_assisted(n);pid:=(body->>'propertyId')::uuid;a:=(body->>'agencyId')::uuid;actor:=('45000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;n:=n+1;
  if mode='unpublish' then reviewer:=owner;perform public.kh_admin_unpublish(owner,pid,1,'Retirada original conservada');
  else
   reviewer:=moderator;perform pg_temp.kh_as(moderator);update public.properties set moderation='pending' where id=pid;
   perform public.kh_review_property(pid,'rejected','Rechazo original conservado',1);
  end if;
  perform pg_temp.kh_as(owner);
  perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','grant','note','Agencia verificada con evidencia','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where id=a),'clientRequestId',gen_random_uuid()));
  body:=body||jsonb_build_object('expectedPropertyVersion',(select version from public.properties where id=pid));
  perform public.kh_admin_link_assisted_agency(owner,body);
  perform pg_temp.kh_assert(exists(select 1 from kh_private.agency_property_moderation_holds where property_id=pid and active and actor_id=reviewer and reason=case when mode='unpublish' then 'Retirada original conservada' else 'Rechazo original conservado' end),'pre-link '||mode||' retains original moderator and reason');
  select jsonb_build_object('title',p.title,'location',p.location,'province',p.province,'type',p.type,'price',p.price,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'description',p.description,'photoPaths',to_jsonb(p.photo_paths)) into draft from public.properties p where p.id=pid;
  perform pg_temp.kh_as(actor);
  result:=public.kh_agency_save_property(actor,a,jsonb_build_object('propertyId',pid,'expectedVersion',(select version from public.properties where id=pid),'draft',draft,'publicationIntent','submit','sourceReference','CASA','consentReference','Nuevo envío explícito','clientRequestId',gen_random_uuid()));
  perform pg_temp.kh_assert(result#>>'{property,moderation}'='pending' and result->>'publicationPolicy'='requires_review' and (result->>'moderationHold')::boolean,'verified submission cannot lift pre-link '||mode);
 end loop;
end $$;

do $$
#variable_conflict use_variable
declare a uuid:=pg_temp.kh_agency_signup(12);owner uuid:='45000000-0000-4000-8000-000000000001';request uuid:=gen_random_uuid();body jsonb;x jsonb;id uuid;begin
 perform pg_temp.kh_agency_approve(a);
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,owner,'admin');
 insert into storage.objects(bucket_id,name)values('property-photos',owner||'/'||request||'/photo.jpg');
 body:=jsonb_build_object('clientRequestId',request,'sourceReference','OWNER-MEMBER','consentReference','Autorización válida','publicationIntent','submit','draft',jsonb_build_object('title','Origen no verificado','location','Vedado','province','La Habana','type','Casa','price',30000,'area',80,'bedrooms',2,'bathrooms',1,'description','Casa aportada por el propietario como miembro.','photoPaths',jsonb_build_array(owner||'/'||request||'/photo.jpg')));
 x:=public.kh_agency_save_property(owner,a,body);id:=(x#>>'{property,id}')::uuid;
 perform pg_temp.kh_assert(x#>>'{property,moderation}'='pending','protected custodian acting as member cannot autoapprove unverified source');
 perform pg_temp.kh_error(format('select public.kh_review_property(%L,''approved'',null,1)',id),'KH_CANNOT_REVIEW_OWN_PROPERTY');
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,'45000000-0000-4000-8000-000000000003','admin');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000003');
 perform pg_temp.kh_error(format('select public.kh_review_property(%L,''approved'',null,1)',id),'KH_CANNOT_REVIEW_OWN_PROPERTY');
end $$;
do $$
#variable_conflict use_variable
declare a uuid:=pg_temp.kh_agency_signup();actor uuid:='45000000-0000-4000-8000-000000000009';owner uuid:='45000000-0000-4000-8000-000000000001';request uuid:=gen_random_uuid();body jsonb;result jsonb;again jsonb;id uuid;created text;begin
 body:=jsonb_build_object('clientRequestId',request,'sourceReference','CASA-1','consentReference','Documento firmado','publicationIntent','submit','draft',jsonb_build_object('title','Casa fixture','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'area',null,'description','Casa sintética amplia con patio de prueba.','amenities','[]'::jsonb,'operation','sale','photoPaths',jsonb_build_array(actor::text||'/'||request||'/cover.jpg'),'coverThumbPath',actor::text||'/'||request||'/cover_t.jpg'));
 insert into storage.objects(bucket_id,name)values('property-photos',actor::text||'/'||request||'/cover.jpg'),('property-photos',actor::text||'/'||request||'/cover_t.jpg');
 perform pg_temp.kh_as(actor);
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body),'KH_AGENCY_NOT_APPROVED');
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(actor);
 result:=public.kh_agency_save_property(actor,a,body);id:=(result#>>'{property,id}')::uuid;created:=result#>>'{property,created_at}';
 perform pg_temp.kh_error(format('update kh_private.agency_property_origins set source_reference=''CHANGED'' where property_id=%L',id),'KH_AGENCY_SOURCE_IMMUTABLE');
 perform pg_temp.kh_assert(result#>>'{property,moderation}'='pending','unverified_origin_submit_requires_review');
 perform pg_temp.kh_assert((select owner_id=owner from public.properties where properties.id=id),'stable protected custody');
 again:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(again#>>'{property,id}'=id::text and again#>>'{property,created_at}'=created,'agency_save_replay_preserves_uuid_and_created_at');
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body||'{"sourceReference":"CHANGED"}'),'KH_AGENCY_REQUEST_CONFLICT');
 perform pg_temp.kh_as(owner);
 perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','grant','note','Comprobación independiente','expectedAgencyVersion',(select version from kh_private.agencies where agencies.id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where agencies.id=a),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select moderation='pending' from public.properties where properties.id=id),'grant_does_not_publish_old_pending_backlog');
 perform pg_temp.kh_as(actor);
 again:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(again#>>'{property,moderation}'='pending','replay after grant does not publish');
 body:=body||jsonb_build_object('propertyId',id,'expectedVersion',(select version from public.properties where properties.id=id),'clientRequestId',gen_random_uuid());
 insert into kh_private.saved_searches(user_id,name,filters)values('45000000-0000-4000-8000-000000000008','Aviso empresarial','{"operations":["sale"]}');
 result:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(result#>>'{property,moderation}'='approved','verified_origin_valid_submit_publishes_directly');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.notifications where property_id=id and category='alert'),'direct publication emits one alert');
 again:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.notifications where property_id=id and category='alert'),'replay emits no second alert');
 perform pg_temp.kh_assert((public.kh_get_listing_management(id)->>'contactAvailable')::boolean=false,'technical_custodian_is_not_commercial_contact');
 perform pg_temp.kh_error(format('select public.kh_start_conversation(%L,%L)',id,actor),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_as(owner);
 perform pg_temp.kh_error(format('select public.kh_set_property_status(%L,''sold'')',id),'KH_AGENCY_CONTEXT_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_submit_property(%L)',id),'KH_AGENCY_CONTEXT_REQUIRED');
 perform public.kh_admin_unpublish(owner,id,(result#>>'{property,version}')::integer,'Retirada por comprobación');
 perform pg_temp.kh_as(actor);
 body:=body||jsonb_build_object('expectedVersion',(select version from public.properties where properties.id=id),'clientRequestId',gen_random_uuid());
 result:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(result#>>'{property,moderation}'='pending' and (result->>'moderationHold')::boolean,'moderation_hold_cannot_be_cleared_by_verified_agency');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000003');
 perform public.kh_review_property(id,'approved',null,(result#>>'{property,version}')::integer);
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_property_moderation_holds h where h.property_id=id and h.active),'authorized review clears hold');
 perform pg_temp.kh_as(actor);body:=body||jsonb_build_object('expectedVersion',(select version from public.properties where properties.id=id),'clientRequestId',gen_random_uuid(),'publicationIntent','draft');
 result:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(result#>>'{property,moderation}'='draft','verified_origin_draft_stays_unpublished');
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 perform pg_temp.kh_assert((select origin_agency_id=a from kh_private.agency_property_origins where property_id=id),'agency_origin_survives_member_change');
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body),'KH_AGENCY_MEMBERSHIP_REQUIRED');
end $$;

do $$
#variable_conflict use_variable
declare a uuid:=pg_temp.kh_agency_signup(11);owner uuid:='45000000-0000-4000-8000-000000000001';c uuid:=gen_random_uuid();id uuid:=gen_random_uuid();request text:=gen_random_uuid()::text;body jsonb;r jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(owner);
 update kh_private.assisted_listing_settings set official_publisher_id=owner;
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(id,owner,request,'Asistida comprobada','Vedado','La Habana','Casa',30000,2,1,'Vivienda de prueba asistida por KarmaHouse.','draft','{}');
 insert into kh_private.assisted_collaborators(id,kind,private_name,private_contact,contact_channel)values(c,'agency','Nombre no determina origen','Contacto privado','email');
 body:=jsonb_build_object('agencyId',a,'propertyId',id,'collaboratorId',c,'expectedCollaboratorVersion',1,'expectedPropertyVersion',1,'sourceReference','ASISTIDA-1','consentReference','Consentimiento autorizado','evidenceReference','Vínculo comprobado','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_error(format('select public.kh_admin_link_assisted_agency(%L,%L)',owner,body),'KH_AGENCY_ASSISTED_LINK_REQUIRED');
 insert into kh_private.assisted_listing_records(property_id,collaborator_id,collaborator_reference,source_channel,source_reference,received_at,consent_text,consent_version,consent_at,evidence_reference,recorded_by,last_confirmed_at,confirmed_price,confirmed_availability)
 values(id,c,'ASISTIDA-1','email','Mensaje original',now(),'Consentimiento explícito sobre esta vivienda.','1',now(),'Evidencia conservada',owner,now(),30000,'active');
 r:=public.kh_admin_link_assisted_agency(owner,body);
 perform pg_temp.kh_assert((r->>'propertyId')::uuid=id and exists(select 1 from kh_private.agency_property_origins where property_id=id and origin_agency_id=a),'assisted_source_agency_requires_confirmed_link');
 perform pg_temp.kh_assert(public.kh_admin_link_assisted_agency(owner,body)=r,'assisted link replay');
 perform pg_temp.kh_assert(exists(select 1 from kh_private.property_publication_keys where property_id=id and origin_actor_id=owner and client_request_id=request),'assisted link preserves publication keys');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_property_write_permits),'permits do not survive requests');
 perform pg_temp.kh_assert(not has_function_privilege('authenticated','kh_private.save_property_core(uuid,uuid,uuid,jsonb)','execute'),'client cannot invoke private writer');
end $$;

do $$
#variable_conflict use_variable
declare a uuid:=pg_temp.kh_agency_signup(10);actor uuid:='45000000-0000-4000-8000-000000000010';owner uuid:='45000000-0000-4000-8000-000000000001';r uuid:=gen_random_uuid();body jsonb;x jsonb;id uuid;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(actor);
 insert into storage.objects(bucket_id,name)values('property-photos',actor||'/'||r||'/photo.jpg');
 body:=jsonb_build_object('clientRequestId',r,'publicationIntent','submit','sourceReference','REVOKE','consentReference','Consentimiento de prueba','draft',jsonb_build_object('title','Casa revocación','location','Vedado','province','La Habana','price',30000,'bedrooms',2,'bathrooms',1,'type','Casa','description','Casa para verificar las reglas de revocación.','photoPaths',jsonb_build_array(actor||'/'||r||'/photo.jpg')));
 perform public.kh_request_agency_verification(actor,a,jsonb_build_object('clientRequestId',gen_random_uuid(),'input',jsonb_build_object('message','Solicitud pendiente de revisión suficiente.','evidenceReferences','[]'::jsonb)));
 x:=public.kh_agency_save_property(actor,a,body);id:=(x#>>'{property,id}')::uuid;
 perform pg_temp.kh_assert(x#>>'{property,moderation}'='pending','pending_verification_does_not_bypass_review');
 perform pg_temp.kh_as(owner);
 perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','grant','note','Verificación comprobada','expectedAgencyVersion',(select version from kh_private.agencies where agencies.id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where agencies.id=a),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(actor);body:=body||jsonb_build_object('propertyId',id,'expectedVersion',(x#>>'{property,version}')::integer,'clientRequestId',gen_random_uuid());x:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_as(owner);perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','revoke','note','Retirada por nueva revisión','expectedAgencyVersion',(select version from kh_private.agencies where agencies.id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where agencies.id=a),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select moderation='approved' from public.properties where properties.id=id),'revocation_keeps_previously_approved_listings');
 perform pg_temp.kh_as(actor);body:=body||jsonb_build_object('expectedVersion',(x#>>'{property,version}')::integer,'clientRequestId',gen_random_uuid());x:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(x#>>'{property,moderation}'='pending','verification_revoked_next_submit_requires_review');
end $$;
