begin;
-- Fixture helper is prepended by the loopback-only runner.
select pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
do $$ declare c uuid;p uuid;r jsonb;input jsonb;decision jsonb;begin
 c:=pg_temp.kh_collaborator();p:=pg_temp.kh_listing(c,'permission-matrix');
 input:=jsonb_build_object('clientRequestId',gen_random_uuid(),'collaboratorId',c,'expectedCollaboratorVersion',1,'recipientId','43000000-0000-4000-8000-000000000002','items',jsonb_build_array(jsonb_build_object('propertyId',p,'expectedVersion',1,'expectedProvenanceVersion',1)));
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(%L,%L::jsonb)','43000000-0000-4000-8000-000000000003',input),'KH_ACCOUNT_CHANGED');
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input||jsonb_build_object('items','[]'::jsonb)),'KH_TRANSFER_INVALID');
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input||jsonb_build_object('items',(select jsonb_agg(jsonb_build_object('propertyId',gen_random_uuid(),'expectedVersion',1,'expectedProvenanceVersion',1)) from generate_series(1,21)))),'KH_TRANSFER_INVALID');
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input||jsonb_build_object('recipientId',auth.uid())),'KH_TRANSFER_RECIPIENT_INVALID');
 update kh_private.assisted_listing_settings set transfers_enabled=false;
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input),'KH_TRANSFERS_DISABLED');
 update kh_private.assisted_listing_settings set transfers_enabled=true;
 update public.properties set availability='sold' where id=p;
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input),'KH_TRANSFER_INELIGIBLE');
 update public.properties set availability='active' where id=p;
 r:=public.kh_offer_listing_transfer(auth.uid(),input);
 perform pg_temp.kh_error(format('select public.kh_offer_listing_transfer(auth.uid(),%L::jsonb)',input||jsonb_build_object('expectedCollaboratorVersion',2)),'KH_TRANSFER_DECISION_CONFLICT');
 perform pg_temp.kh_error(format('update public.properties set owner_id=%L,version=version+1 where id=%L','43000000-0000-4000-8000-000000000002',p),'KH_PROPERTY_MANAGEMENT_CHANGED');
 -- Confirming a different link invalidates the offer rather than retargeting it.
 perform public.kh_admin_save_assisted_collaborator(auth.uid(),jsonb_build_object('id',c,'clientRequestId',gen_random_uuid(),'expectedVersion',1,'kind','agency','privateName','Fixture link changed','privateContact','fixture','contactChannel','manual','accountId','43000000-0000-4000-8000-000000000005','linkEvidenceReference','Synthetic confirmation'));
 perform pg_temp.kh_as('43000000-0000-4000-8000-000000000002');
 decision:=jsonb_build_object('requestId',r->>'id','expectedRequestVersion',1,'clientRequestId',gen_random_uuid(),'decision','accept');
 r:=public.kh_decide_listing_transfer(auth.uid(),decision);perform pg_temp.kh_assert(r->>'state'='invalidated' and r->>'reasonCode'='KH_TRANSFER_RECIPIENT_CHANGED','link update does not retarget old offer');
end $$;
-- RLS does not let a pending recipient sign a paused listing outside the preview endpoint.
select pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
do $$ declare c uuid;p uuid;begin c:=pg_temp.kh_collaborator();p:=pg_temp.kh_listing(c,'private-preview');update public.properties set availability='paused' where id=p;perform pg_temp.kh_offer(c,array[p]);end $$;
set local role authenticated;
select pg_temp.kh_as('43000000-0000-4000-8000-000000000002');
select pg_temp.kh_assert(not exists(select 1 from storage.objects where name like '%/private-preview/%'),'recipient cannot read paused original storage');
select pg_temp.kh_error('select * from kh_private.assisted_collaborators','permission denied');
reset role;
rollback;
