do $$
#variable_conflict use_variable
declare a uuid:=pg_temp.kh_agency_signup();actor uuid:='45000000-0000-4000-8000-000000000009';request uuid:=gen_random_uuid();body jsonb;r jsonb;id uuid;path text;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(actor);path:=actor::text||'/'||request||'/photo.jpg';
 insert into storage.objects(bucket_id,name)values('property-photos',path);
 body:=jsonb_build_object('clientRequestId',request,'sourceReference','PHOTO-1','consentReference','Autorización comprobada','publicationIntent','submit','draft',jsonb_build_object('title','Casa con foto','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Casa sintética con fotografías propias.','amenities','[]'::jsonb,'operation','sale','photoPaths',jsonb_build_array(path)));
 r:=public.kh_agency_save_property(actor,a,body);id:=(r#>>'{property,id}')::uuid;
 perform pg_temp.kh_assert(exists(select 1 from kh_private.property_media_assets where property_id=id and uploader_id=actor and state='attached'),'enterprise photos retain actual uploader');
 perform pg_temp.kh_assert(not kh_private.photo_delete_allowed(path),'referenced business photo cannot be deleted by uploader');
 perform pg_temp.kh_assert(kh_private.agency_media_read(path),'active team can read private attached media');
 execute 'set local role authenticated';
 r:=public.kh_agency_property(actor,a,id);
 perform pg_temp.kh_assert(r#>>'{property,id}'=id::text,'authenticated RPC reads authorized property');
 perform pg_temp.kh_assert(exists(select 1 from storage.objects where name=path),'storage RLS permits authorized private photo');
 execute 'reset role';
 perform pg_temp.kh_error(format('select public.kh_agency_save_property(%L,%L,%L)',actor,a,body||jsonb_build_object('clientRequestId',gen_random_uuid(),'sourceReference','PHOTO-2')),'KH_INVALID_PHOTO_PATH');
 body:=body||jsonb_build_object('propertyId',id,'expectedVersion',(r#>>'{property,version}')::integer,'clientRequestId',gen_random_uuid());
 r:=public.kh_agency_save_property(actor,a,body);
 perform pg_temp.kh_assert(r#>>'{property,photo_paths,0}'=path,'same property photo survives edits');
 update kh_private.agency_memberships set state='removed' where agency_id=a and user_id=actor;
 perform pg_temp.kh_assert(not kh_private.agency_media_read(path),'removed team member cannot sign private attached media');
 execute 'set local role authenticated';
 perform pg_temp.kh_assert(not exists(select 1 from storage.objects where name=path),'storage RLS hides private photo from removed uploader');
 execute 'reset role';
end $$;
