-- CASE I1 suspended outcome and replay
do $$declare f jsonb:=pg_temp.schedule_fixture(1900);p jsonb;body jsonb;r jsonb;actor uuid:=(f->>'actor')::uuid;a uuid:=(f->>'agency')::uuid;begin
 p:=pg_temp.visit_proposal(actor,a,(f->>'deal')::uuid,clock_timestamp()+interval '3 days');perform pg_temp.accept_visit(actor,a,p);
 update kh_private.property_visit_slots set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where proposal_id=(p->>'id')::uuid;
 body:=jsonb_build_object('proposalId',p->>'id','expectedVersion',1,'outcome','performed','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');
 perform public.kh_review_agency(auth.uid(),jsonb_build_object('agencyId',a,'decision','suspend','note','Suspensión de prueba','expectedVersion',(select version from kh_private.agencies where id=a),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(actor);set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_record_agency_visit_outcome(%L,%L,%L)',actor,a,body),'KH_AGENCY_NOT_APPROVED');reset role;
 f:=pg_temp.schedule_fixture(1903);a:=(f->>'agency')::uuid;actor:=(f->>'actor')::uuid;
 p:=pg_temp.visit_proposal(actor,a,(f->>'deal')::uuid,clock_timestamp()+interval '4 days');perform pg_temp.accept_visit(actor,a,p);
 update kh_private.property_visit_slots set starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' where proposal_id=(p->>'id')::uuid;
 update kh_private.agency_deals set closed_reason='historical_fixture' where id=(f->>'deal')::uuid;
 body:=jsonb_build_object('proposalId',p->>'id','expectedVersion',1,'outcome','performed','clientRequestId',gen_random_uuid());
 perform pg_temp.kh_as(actor);set local role authenticated;
 r:=public.kh_record_agency_visit_outcome(actor,a,body);
 perform pg_temp.kh_assert(r->>'outcome'='performed','approved historical closed cycle outcome');
 perform pg_temp.kh_assert(public.kh_record_agency_visit_outcome(actor,a,body)=r,'current permission replay');reset role;
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 set local role authenticated;perform pg_temp.kh_error(format('select public.kh_record_agency_visit_outcome(%L,%L,%L)',actor,a,body),'KH_AGENCY_DEAL_NOT_FOUND');reset role;
end$$;
-- CASE I2 OFF identities, assignment, foreign agency and deleted account
do $$declare f jsonb:=pg_temp.schedule_fixture(1920);g jsonb:=pg_temp.schedule_fixture(1921);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;manager uuid:='45000000-0000-4000-8000-000000000004';d jsonb;e jsonb;r jsonb;begin
 insert into kh_private.agency_mandates(property_id,agency_id,reference)values((g->>'property')::uuid,a,'Segundo inmueble autorizado');
 perform pg_temp.kh_as(actor);
 d:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',f->>'property','assigneeId',actor,'externalContact',jsonb_build_object('name','Mismo contacto','consentReference','Referencia privada'),'clientRequestId',gen_random_uuid()));
 e:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',g->>'property','assigneeId',actor,'externalContact',jsonb_build_object('name','Mismo contacto','consentReference','Referencia privada'),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(d->>'buyerName'=e->>'buyerName' and d->>'canonicalPropertyId'<>e->>'canonicalPropertyId','same external contact distinct canonical homes');
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,manager,'manager');perform pg_temp.kh_as(manager);set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_get_agency_deal(%L,%L,%L)',manager,a,d->>'id'),'KH_AGENCY_DEAL_NOT_FOUND');reset role;
 perform pg_temp.kh_as((g->>'actor')::uuid);set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_get_agency_deal(%L,%L,%L)',auth.uid(),g->>'agency',d->>'id'),'KH_AGENCY_DEAL_NOT_FOUND');reset role;
 perform pg_temp.kh_as(actor);d:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',f->>'property','buyerId',manager,'assigneeId',actor,'clientRequestId',gen_random_uuid()));
 delete from auth.users where id=manager;
 update kh_private.agency_settings set enabled=false;
 set local role authenticated;r:=public.kh_get_agency_deal(actor,a,(d->>'id')::uuid);
 perform pg_temp.kh_assert(r->>'buyerName'='Cuenta eliminada' and r->>'propertyTitle'='Casa de agenda','deleted account safe identity and OFF history');reset role;
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 set local role authenticated;perform pg_temp.kh_error(format('select public.kh_get_agency_deal(%L,%L,%L)',actor,a,d->>'id'),'KH_AGENCY_DEAL_NOT_FOUND');reset role;
end$$;
-- CASE I3 approved logo, office opt in, private application and current replay guards
do $$declare f jsonb:=pg_temp.schedule_fixture(1922);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;path text:=a||'/logos/'||gen_random_uuid()||'.jpg';r jsonb;body jsonb;begin
 set local role authenticated;
 insert into storage.objects(bucket_id,name,metadata)values('agency-assets',path,'{"mimetype":"image/jpeg","size":99}');
 r:=public.kh_get_agency_profile(actor,a);body:=jsonb_build_object('input',(r->'input')||'{"publishOfficeAddress":true,"officeAddress":"Oficina pública autorizada"}','logoPath',path,'expectedVersion',r->'version','clientRequestId',gen_random_uuid());
 r:=public.kh_update_agency_profile(actor,a,body);reset role;
 perform pg_temp.kh_assert((select state='approved' and verification_version=1 from kh_private.agencies where id=a),'profile never grants verification');
 set local role anon;r:=public.kh_public_agency_profile(a);perform pg_temp.kh_assert(r->>'officeAddress'='Oficina pública autorizada' and r->>'logoPath'=path and exists(select 1 from storage.objects where name=path),'explicit public office and attached logo');reset role;
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000004');set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_update_agency_profile(%L,%L,%L)',auth.uid(),a,body),'KH_AGENCY_MEMBERSHIP_REQUIRED');reset role;
 perform pg_temp.kh_as(actor);update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 set local role authenticated;perform pg_temp.kh_error(format('select public.kh_update_agency_profile(%L,%L,%L)',actor,a,body),'KH_AGENCY_MEMBERSHIP_REQUIRED');reset role;
 update kh_private.agency_memberships set state='active' where agency_id=a and user_id=actor;
 update kh_private.agencies set state='suspended' where id=a;
 set local role authenticated;perform pg_temp.kh_error(format('select public.kh_update_agency_profile(%L,%L,%L)',actor,a,body),'KH_AGENCY_NOT_APPROVED');reset role;
 set local role anon;perform pg_temp.kh_assert(public.kh_public_agency_profile(a) is null and not exists(select 1 from storage.objects where name=path),'suspended agency has no public profile/logo');reset role;
end$$;
-- CASE I6 no match, private exclusion, verified submit guard and existing mandate
do $$declare f jsonb:=pg_temp.schedule_fixture(1923);a uuid:=pg_temp.kh_agency_signup(1924);actor uuid:='45000000-0000-4000-8000-000000001924';draft jsonb;r jsonb;body jsonb;request uuid:=gen_random_uuid();begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(actor);
 draft:=jsonb_build_object('title','Casa verdaderamente diferente','location','Vedado','province','La Habana','type','Casa','price',40000,'bedrooms',2,'bathrooms',1,'description','Casa distinta con consentimiento propio y comprobado.','photoPaths',jsonb_build_array(actor||'/'||request||'/photo.jpg'));
 insert into storage.objects(bucket_id,name)values('property-photos',actor||'/'||request||'/photo.jpg');
 body:=jsonb_build_object('clientRequestId',request,'publicationIntent','submit','draft',draft,'sourceReference','VERIFIED-GUARD','consentReference','Consentimiento privado');
 insert into public.properties(id,client_request_id,owner_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation)values(gen_random_uuid(),gen_random_uuid()::text,actor,'Privada excluida','Vedado','La Habana','Casa',40000,2,1,'Vivienda privada que no debe verse en coincidencias.','draft');
 set local role authenticated;r:=public.kh_find_agency_property_matches(actor,a,body);perform pg_temp.kh_assert(jsonb_array_length(r->'items')=1,'private listing excluded');
 r:=public.kh_find_agency_property_matches(actor,a,jsonb_set(body,'{draft,location}','"Lugar sin coincidencia"'));perform pg_temp.kh_assert(jsonb_array_length(r->'items')=0,'no match');reset role;
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');perform public.kh_review_agency_verification(auth.uid(),jsonb_build_object('agencyId',a,'decision','grant','note','Comprobación sintética','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',(select verification_version from kh_private.agencies where id=a),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(actor);set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body),'KH_AGENCY_DUPLICATE_REVIEW_REQUIRED');
 r:=public.kh_find_agency_property_matches(actor,a,body);body:=body||jsonb_build_object('duplicateDecision',r->'review');
 r:=public.kh_agency_save_property(actor,a,body);perform pg_temp.kh_assert(r#>>'{property,moderation}'='approved','verified explicit different-home direct submission');
 r:=public.kh_request_agency_mandate(actor,a,jsonb_build_object('propertyId',f->>'property','internalReference','Canon existente','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(r->>'propertyId'=f->>'property' and r->>'agencyId'=a::text,'existing canonical requested without merge');reset role;
 perform pg_temp.kh_assert(exists(select 1 from kh_private.agency_events where agency_id=a and kind='property_saved' and payload ? 'duplicateDecision'),'explicit decision recorded');
end$$;
-- CASE I3 failure OFF rejects referenced logo and permits exact privileged detach cleanup
do $$declare f jsonb:=pg_temp.schedule_fixture(1927);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;path text:=a||'/logos/'||gen_random_uuid()||'.jpg';r jsonb;body jsonb;begin
 insert into storage.objects(bucket_id,name,metadata)values('agency-assets',path,'{"mimetype":"image/jpeg","size":99}');r:=public.kh_get_agency_profile(actor,a);
 body:=jsonb_build_object('input',r->'input','logoPath',path,'expectedVersion',r->'version','clientRequestId',gen_random_uuid());perform public.kh_update_agency_profile(actor,a,body);
 update kh_private.agency_settings set enabled=false;set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_update_agency_profile(%L,%L,%L)',actor,a,body),'KH_AGENCY_DISABLED');reset role;
 perform pg_temp.kh_as(null);perform pg_temp.kh_error(format('delete from storage.objects where bucket_id=''agency-assets'' and name=%L',path),'KH_AGENCY_LOGO_REFERENCED');
 perform pg_advisory_xact_lock(hashtextextended('kh:agency:module',0));perform kh_private.agency_lock(a);
 perform 1 from kh_private.agencies where id=a and logo_path=path for update;perform pg_temp.kh_assert(found,'exact fixture logo reference');
 update kh_private.agencies set logo_path=null,version=version+1 where id=a and logo_path=path;
 delete from storage.objects where bucket_id='agency-assets' and name=path;
 perform pg_temp.kh_assert(not exists(select 1 from storage.objects where name=path) and not(select enabled from kh_private.agency_settings),'OFF cleanup leaves OFF and deletes only exact unreferenced object');
end$$;
-- CASE I7 manager coordinator admin, aliases and suspended current contact
do $$declare f jsonb:=pg_temp.schedule_fixture(1925);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;manager uuid:='45000000-0000-4000-8000-000000000004';alias_id uuid:=gen_random_uuid();r jsonb;role_name text;begin
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,manager,'manager');
 foreach role_name in array array['manager','coordinator','admin']loop
  update kh_private.agency_memberships set role=role_name where agency_id=a and user_id=manager;perform pg_temp.kh_as(manager);set local role authenticated;
  r:=public.kh_agency_share_context(manager,a,(f->>'property')::uuid,manager);perform pg_temp.kh_assert(r->>'managerId'=manager::text,'share producer role '||role_name);reset role;
 end loop;
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation)values(alias_id,actor,alias_id::text,'Alias retirado','Vedado','La Habana','Casa',30000,2,1,'Identidad anterior preservada como alias.','draft');
 insert into kh_private.property_aliases(property_id,canonical_id,origin_evidence,reason,reviewed_by)values(alias_id,(f->>'property')::uuid,'Fixture de revisión previa','Alias confirmado en fixture',actor);
 set local role authenticated;r:=public.kh_agency_share_context(manager,a,alias_id,manager);reset role;
 perform pg_temp.kh_assert(r->>'propertyId'=f->>'property','retired alias produces canonical share');
 update kh_private.agencies set state='suspended' where id=a;set local role anon;
 perform pg_temp.kh_assert(public.kh_public_agency_share_context((f->>'property')::uuid,a,manager) is null,'suspended contact fallback');reset role;
end$$;
-- CASE I2 deleted personal home retains authorized display identity under OFF
do $$declare a uuid:=pg_temp.kh_agency_signup(1926);actor uuid:='45000000-0000-4000-8000-000000001926';personal uuid:='45000000-0000-4000-8000-000000000007';pid uuid:=gen_random_uuid();q jsonb;d jsonb;r jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(personal);
 insert into storage.objects(bucket_id,name)values('property-photos',personal||'/'||pid||'/photo.jpg');
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,personal,pid::text,'Hogar histórico retirado','Vedado','La Habana','Casa',30000,2,1,'Origen personal autorizado para las pruebas.','approved',array[personal||'/'||pid||'/photo.jpg']);
 perform pg_temp.kh_as(actor);q:=public.kh_request_agency_mandate(actor,a,jsonb_build_object('propertyId',pid,'internalReference','HISTORIA','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);perform public.kh_decide_agency_mandate(personal,null,jsonb_build_object('requestId',q->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(actor);d:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',pid,'assigneeId',actor,'externalContact',jsonb_build_object('name','Interesado histórico','consentReference','Consentimiento'),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);update kh_private.agency_settings set enabled=false;perform public.kh_begin_account_deletion(personal);perform public.kh_delete_account(personal);
 perform pg_temp.kh_assert(not exists(select 1 from public.properties where id=pid),'personal home really deleted');
 perform pg_temp.kh_as(actor);set local role authenticated;r:=public.kh_get_agency_deal(actor,a,(d->>'id')::uuid);
 perform pg_temp.kh_assert(r->>'propertyTitle'='Hogar histórico retirado' and r->>'canonicalPropertyId'=pid::text and r->>'buyerName'='Interesado histórico','safe retained identity remains readable OFF');reset role;
end$$;
-- CASE I2 distinct private case identities
do $$declare f jsonb:=pg_temp.schedule_fixture(1901);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;d jsonb;e jsonb;begin
 d:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',f->>'property','buyerId','45000000-0000-4000-8000-000000000002','assigneeId',actor,'clientRequestId',gen_random_uuid()));
 e:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',f->>'property','buyerId','45000000-0000-4000-8000-000000000004','assigneeId',actor,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert(d->>'buyerName'='Fixture 2' and e->>'buyerName'='Fixture 4','distinct account names');
 perform pg_temp.kh_assert(d->>'propertyTitle'='Casa de agenda' and d->>'canonicalPropertyId'=f->>'property','canonical display home');
 perform pg_temp.kh_assert(not(d ? 'email') and not(d ? 'responsibleFullName'),'private input excluded');
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000004');set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_get_agency_deal(%L,%L,%L)',auth.uid(),a,d->>'id'),'KH_AGENCY_DEAL_NOT_FOUND');reset role;
end$$;
-- CASE I4 shared new conversation budget
do $$declare f jsonb:=pg_temp.schedule_fixture(1902);a uuid:=(f->>'agency')::uuid;buyer uuid:='45000000-0000-4000-8000-000000000002';pid uuid;r jsonb;body jsonb;begin
 -- Existing personal contact rows are legitimate historical channel counts.
 for n in 1..20 loop
  pid:=gen_random_uuid();insert into public.properties(id,client_request_id,owner_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,availability)values(pid,pid::text,(f->>'actor')::uuid,'Casa presupuesto '||n,'Vedado','La Habana','Casa',30000,2,1,'Descripción sintética de presupuesto','draft','active');
  insert into public.kh_conversations(property_id,property_title,property_location,buyer_id,seller_id)values(pid,'Casa presupuesto','Vedado',buyer,(f->>'actor')::uuid);
 end loop;
 perform pg_temp.kh_as(buyer);body:=jsonb_build_object('propertyId',f->>'property','clientRequestId',gen_random_uuid());set local role authenticated;
 perform pg_temp.kh_error(format('select public.kh_start_agency_conversation(%L,%L,%L)',buyer,a,body),'KH_CHAT_CONVERSATION_LIMIT');reset role;
 delete from public.kh_conversations where id=(select id from public.kh_conversations where buyer_id=buyer limit 1);
 set local role authenticated;r:=public.kh_start_agency_conversation(buyer,a,body);
 perform pg_temp.kh_assert(public.kh_start_agency_conversation(buyer,a,body)=r,'same request replay at limit');
 perform pg_temp.kh_assert(public.kh_start_agency_conversation(buyer,a,body||jsonb_build_object('clientRequestId',gen_random_uuid()))->>'id'=r->>'id','existing contact at limit');reset role;
end$$;
-- CASE I3 replacement admin commercial profile and public privacy
do $$declare f jsonb:=pg_temp.schedule_fixture(1910);a uuid:=(f->>'agency')::uuid;actor uuid:='45000000-0000-4000-8000-000000000004';original jsonb;input jsonb;r jsonb;body jsonb;begin
 select to_jsonb(x) into original from kh_private.agency_applications x where agency_id=a;
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,actor,'admin');
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=(f->>'actor')::uuid;
 perform pg_temp.kh_as(actor);set local role authenticated;
 r:=public.kh_get_agency_profile(actor,a);input:=(r->'input')||jsonb_build_object('tradeName','Perfil actualizado','businessPhone','+5359999999','officeAddress','OFICINA PRIVADA','publishOfficeAddress',false);
 body:=jsonb_build_object('input',input,'expectedVersion',r->>'version','clientRequestId',gen_random_uuid());
 r:=public.kh_update_agency_profile(actor,a,body);perform pg_temp.kh_assert(public.kh_update_agency_profile(actor,a,body)=r,'profile idempotent');reset role;
 perform pg_temp.kh_assert((select to_jsonb(x)=original from kh_private.agency_applications x where agency_id=a),'original registration immutable');
 set local role anon;r:=public.kh_public_agency_profile(a);reset role;
 perform pg_temp.kh_assert(r->>'tradeName'='Perfil actualizado' and r->>'businessPhone'='+5359999999','public commercial fields');
 perform pg_temp.kh_assert(not(r ? 'officeAddress') and r::text not like '%OFICINA PRIVADA%' and not(r ? 'evidenceReferences') and not(r ? 'responsibleFullName'),'server excludes private bytes');
 update kh_private.agency_memberships set role='manager' where agency_id=a and user_id=actor;
 set local role authenticated;perform pg_temp.kh_error(format('select public.kh_update_agency_profile(%L,%L,%L)',actor,a,body),'KH_AGENCY_ROLE_REQUIRED');reset role;
end$$;
-- CASE I6 public match guard binds current input candidates and request
do $$declare f jsonb:=pg_temp.schedule_fixture(1911);a uuid:=pg_temp.kh_agency_signup(1912);actor uuid:='45000000-0000-4000-8000-000000001912';draft jsonb;request uuid:=gen_random_uuid();r jsonb;body jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(actor);
 draft:=jsonb_build_object('title','Otra casa de agenda','location','Vedado','province','La Habana','type','Casa','price',31000,'bedrooms',2,'bathrooms',1,'description','Descripción suficientemente larga de una casa diferente.','photoPaths','[]'::jsonb);
 set local role authenticated;r:=public.kh_find_agency_property_matches(actor,a,jsonb_build_object('draft',draft,'clientRequestId',request));
 perform pg_temp.kh_assert(jsonb_array_length(r->'items')=1 and r#>>'{items,0,id}'=f->>'property','existing public canonical match');
 perform pg_temp.kh_assert(r::text not like '%Consentimiento%' and r::text not like '%owner_id%' and r::text not like '%source_reference%','safe projection');
 body:=jsonb_build_object('draft',draft,'publicationIntent','draft','sourceReference','different-home','consentReference','Consentimiento privado','clientRequestId',request);
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body),'KH_AGENCY_DUPLICATE_REVIEW_REQUIRED');
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body||jsonb_build_object('duplicateDecision',r->'review','clientRequestId',gen_random_uuid())),'KH_AGENCY_DUPLICATE_REVIEW_REQUIRED');
 r:=public.kh_agency_save_property(actor,a,body||jsonb_build_object('duplicateDecision',r->'review'));reset role;
 perform pg_temp.kh_assert(r#>>'{property,id}'<>f->>'property','explicit different home creates own identity');
end$$;
-- CASE I7 eligible scoped share canonical context
do $$declare f jsonb:=pg_temp.schedule_fixture(1913);a uuid:=(f->>'agency')::uuid;actor uuid:=(f->>'actor')::uuid;r jsonb;begin
 set local role authenticated;r:=public.kh_agency_share_context(actor,a,(f->>'property')::uuid,actor);reset role;
 perform pg_temp.kh_assert(r->>'propertyId'=f->>'property' and r->>'managerId'=actor::text,'canonical eligible share');
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 set local role anon;perform pg_temp.kh_assert(public.kh_public_agency_share_context((f->>'property')::uuid,a,actor) is null,'retired manager fallback');reset role;
end$$;
