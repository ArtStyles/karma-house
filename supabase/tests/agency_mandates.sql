-- Business assertions, executed against the rollback fixture.
do $$ declare a uuid:=pg_temp.kh_agency_signup(9);b uuid:=pg_temp.kh_agency_signup(10);aa uuid:='45000000-0000-4000-8000-000000000009';bb uuid:='45000000-0000-4000-8000-000000000010';owner uuid:='45000000-0000-4000-8000-000000000001';r uuid:=gen_random_uuid();pid uuid;x jsonb;q jsonb;c jsonb;body jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_agency_approve(b);perform pg_temp.kh_as(aa);
 insert into storage.objects(bucket_id,name)values('property-photos',aa||'/'||r||'/photo.jpg');
 x:=public.kh_agency_save_property(aa,a,jsonb_build_object('clientRequestId',r,'sourceReference','A-PRIVATE','consentReference','Consentimiento','publicationIntent','submit','draft',jsonb_build_object('title','Casa compartida','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Vivienda de prueba compartida y autorizada.','photoPaths',jsonb_build_array(aa||'/'||r||'/photo.jpg'))));pid:=(x#>>'{property,id}')::uuid;
 perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,1);
 perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',b,'decision','grant','note','Verificación de colaboradora','expectedAgencyVersion',(select version from kh_private.agencies where id=b),'expectedVerificationVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(bb);q:=public.kh_request_agency_mandate(bb,b,jsonb_build_object('propertyId',pid,'internalReference','B-PRIVATE','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_error(format('select public.kh_agency_property(%L,%L,%L)',bb,b,pid),'KH_AGENCY_PROPERTY_NOT_FOUND');
 perform pg_temp.kh_as(aa);x:=public.kh_list_agency_mandate_requests(aa,a,0);
 perform pg_temp.kh_assert(x#>>'{items,0,agencyId}'=b::text and not(x#>'{items,0}' ? 'internalReference'),'origin sees minimum incoming projection without collaborator reference');
 perform public.kh_decide_agency_mandate(aa,a,jsonb_build_object('requestId',q->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(bb);x:=public.kh_agency_property(bb,b,pid);
 perform pg_temp.kh_assert(x#>>'{mandate,reference}'='B-PRIVATE' and x->>'originAgencyId'=a::text and not(x->>'canConfirmSale')::boolean,'copy_does_not_acquire_closure_authority');
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',bb,b,jsonb_build_object('propertyId',pid,'clientRequestId',gen_random_uuid(),'sourceReference','B-PRIVATE','consentReference','Consentimiento','publicationIntent','submit','draft','{}'::jsonb)),'KH_AGENCY_ORIGIN_REQUIRED');
 c:=public.kh_propose_agency_property_change(bb,b,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload',jsonb_build_object('price',31000),'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select price=30000 from public.properties where id=pid),'collaborator cannot apply own proposal');
 perform pg_temp.kh_as(aa);perform public.kh_decide_agency_property_change(aa,a,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select price=31000 and moderation='pending' from public.properties where id=pid),'verified_collaborator_does_not_bypass_unverified_origin_review');
 perform pg_temp.kh_as(owner);perform public.kh_review_property(pid,'approved',null,(select version from public.properties where id=pid));
 x:=public.kh_public_agency_context(array[pid]);
 perform pg_temp.kh_assert(jsonb_array_length(x)=2 and (select count(*)=1 from jsonb_array_elements(x) e where (e->>'verified')::boolean),'public_badge_belongs_to_each_agency_only');
 perform pg_temp.kh_assert(not(x::text like '%PRIVATE%') and not(x::text like '%responsible%') and not(x::text like '%Phone%'),'public context has no private references or application fields');
 perform pg_temp.kh_as(bb);c:=public.kh_propose_agency_property_change(bb,b,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":32000}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(owner);perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',a,'decision','grant','note','Verificación actual de origen','expectedAgencyVersion',(select version from kh_private.agencies where id=a),'expectedVerificationVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(aa);perform public.kh_decide_agency_property_change(aa,a,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select price=32000 and moderation='approved' from public.properties where id=pid),'origin_approval_uses_current_origin_verification');
 perform pg_temp.kh_as(bb);
 perform pg_temp.kh_error(format('select public.kh_propose_agency_property_change(%L,%L,%L)',bb,b,jsonb_build_object('propertyId',pid,'kind','content','proposedPayload','{"ownerId":"45000000-0000-4000-8000-000000000010"}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid())),'KH_AGENCY_INVALID');
 c:=public.kh_propose_agency_property_change(bb,b,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":32500}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(owner);perform public.kh_admin_unpublish(owner,pid,(select version from public.properties where id=pid),'Retirada de moderación que debe conservarse');
 perform pg_temp.kh_as(aa);perform pg_temp.kh_error(format('select public.kh_decide_agency_property_change(%L,%L,%L)',aa,a,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid())),'KH_VERSION_CONFLICT');
 perform public.kh_decide_agency_property_change(aa,a,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','reject','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(bb);c:=public.kh_propose_agency_property_change(bb,b,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":32500}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(aa);perform public.kh_decide_agency_property_change(aa,a,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select moderation='pending' from public.properties where id=pid) and exists(select 1 from kh_private.agency_property_moderation_holds where property_id=pid and active),'origin_approval_cannot_bypass_moderation_hold');
 perform pg_temp.kh_as(owner);perform public.kh_review_agency_verification(owner,jsonb_build_object('agencyId',b,'decision','revoke','note','Retirada comprobada del sello','expectedAgencyVersion',(select version from kh_private.agencies where id=b),'expectedVerificationVersion',(select verification_version from kh_private.agencies where id=b),'clientRequestId',gen_random_uuid()));
 perform public.kh_review_property(pid,'approved',null,(select version from public.properties where id=pid));
 x:=public.kh_public_agency_context(array[pid]);perform pg_temp.kh_assert(not exists(select 1 from jsonb_array_elements(x)e where e->>'agencyId'=b::text and (e->>'verified')::boolean),'public_badge_revocation_is_effective');
 perform pg_temp.kh_as(bb);c:=public.kh_propose_agency_property_change(bb,b,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":33000}'::jsonb,'expectedPropertyVersion',(select version from public.properties where id=pid),'clientRequestId',gen_random_uuid()));
 perform public.kh_withdraw_agency_mandate(bb,b,jsonb_build_object('propertyId',pid,'requestingAgencyId',b,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select state='withdrawn' from kh_private.agency_property_changes where id=(c->>'id')::uuid),'withdrawal terminates pending common changes');
 perform pg_temp.kh_as(aa);x:=public.kh_agency_property(aa,a,pid);perform pg_temp.kh_assert(x#>>'{mandate,reference}'='A-PRIVATE','withdrawing B does not withdraw A');
end $$;

-- A personal origin can decide from account context, never becomes corporate custody.
do $$ declare a uuid:=pg_temp.kh_agency_signup(11);agency_actor uuid:='45000000-0000-4000-8000-000000000011';personal uuid:='45000000-0000-4000-8000-000000000007';pid uuid:=gen_random_uuid();q jsonb;c jsonb;x jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(personal);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,personal,pid::text,'Casa personal autorizada','Vedado','La Habana','Casa',30000,2,1,'Una vivienda personal con autorización compartida.','approved',array[personal||'/'||pid||'/photo.jpg']);
 insert into storage.objects(bucket_id,name)values('property-photos',personal||'/'||pid||'/photo.jpg');
 perform pg_temp.kh_as(agency_actor);q:=public.kh_request_agency_mandate(agency_actor,a,jsonb_build_object('propertyId',pid,'internalReference','PERSONAL-PRIVATE','clientRequestId',gen_random_uuid()));
 -- A pending request can be withdrawn by its own agency, without a granted mandate.
 perform public.kh_withdraw_agency_mandate(agency_actor,a,jsonb_build_object('propertyId',pid,'requestId',q->>'id','requestingAgencyId',a,'expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select state='withdrawn' from kh_private.agency_mandate_requests where id=(q->>'id')::uuid),'pending_request_withdrawal');
 q:=public.kh_request_agency_mandate(agency_actor,a,jsonb_build_object('propertyId',pid,'internalReference','PERSONAL-PRIVATE','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);x:=public.kh_list_agency_mandate_requests(personal,null,0);
 perform pg_temp.kh_assert(x#>>'{items,0,propertyId}'=pid::text,'personal account reads incoming without membership');
 perform public.kh_decide_agency_mandate(personal,null,jsonb_build_object('requestId',q->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(agency_actor);x:=public.kh_agency_property(agency_actor,a,pid);perform pg_temp.kh_assert(x->'originAgencyId'='null'::jsonb and not(x->>'canConfirmSale')::boolean,'personal origin projector keeps personal authority');
 c:=public.kh_propose_agency_property_change(agency_actor,a,jsonb_build_object('propertyId',pid,'kind','price','proposedPayload','{"price":35000}'::jsonb,'expectedPropertyVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(personal);perform public.kh_decide_agency_property_change(personal,null,jsonb_build_object('requestId',c->>'id','expectedVersion',1,'decision','accept','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_assert((select price=35000 and moderation='pending' and owner_id=personal from public.properties where id=pid),'personal_origin_requires_ordinary_review');
 perform pg_temp.kh_assert(not exists(select 1 from kh_private.agency_property_origins where property_id=pid),'mandate_does_not_convert_personal_origin');
end $$;
