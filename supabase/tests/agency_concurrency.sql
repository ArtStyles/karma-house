-- Session-local helpers only; the Node runner owns the independent clone and barriers.
create function pg_temp.race_sale_request(f jsonb) returns jsonb language plpgsql as $$
declare prepared jsonb;begin
 perform pg_temp.kh_as((f->>'actor')::uuid);
 prepared:=public.kh_prepare_agency_sale((f->>'actor')::uuid,(f->>'agency')::uuid,(f->>'deal')::uuid);
 return public.kh_request_agency_sale((f->>'actor')::uuid,(f->>'agency')::uuid,jsonb_build_object('winningDealId',prepared->>'dealId','executingManagerId',prepared->>'executingManagerId','amountUsd',27000,'occurredAt',clock_timestamp()-interval '1 hour','expectedPropertyVersion',prepared->'expectedPropertyVersion','expectedAuthorityVersion',prepared->'expectedAuthorityVersion','clientRequestId',gen_random_uuid()));
end $$;
create function pg_temp.race_decision(r jsonb) returns jsonb language sql as $$
 select jsonb_build_object('requestId',r->>'id','action','confirm','expectedRequestVersion',r->'version','expectedPropertyVersion',r->'expectedPropertyVersion','expectedAuthorityVersion',r->'expectedAuthorityVersion','note','Cierre comprobado','clientRequestId',gen_random_uuid())
$$;
create function pg_temp.race_collaborator(f jsonb) returns jsonb language plpgsql as $$
declare a uuid:=pg_temp.kh_agency_signup(98);u uuid:='45000000-0000-4000-8000-000000000098';q jsonb;d jsonb;begin
 perform pg_temp.kh_agency_approve(a);perform pg_temp.kh_as(u);
 q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',f->>'property','internalReference','PRIVATE-RACE','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(coalesce((f->>'source')::uuid,(f->>'actor')::uuid));
 perform public.kh_decide_agency_mandate(auth.uid(),case when f?'source' then null else (f->>'agency')::uuid end,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);d:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',f->>'property','assigneeId',u,'externalContact',jsonb_build_object('name','Contacto colaborador','consentReference','Consentimiento privado'),'clientRequestId',gen_random_uuid()));
 return jsonb_build_object('agency',a,'actor',u,'property',f->>'property','deal',d->>'id');
end $$;
create function pg_temp.race_personal(f jsonb,source uuid) returns jsonb language plpgsql as $$
declare pid uuid:=gen_random_uuid();q jsonb;d jsonb;u uuid:=(f->>'actor')::uuid;a uuid:=(f->>'agency')::uuid;begin
 perform pg_temp.kh_as(source);
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)
 values(pid,source,pid::text,'Origen personal carrera','Vedado','La Habana','Casa',30000,2,1,'Vivienda personal sintética de carrera.','approved',array[source||'/'||pid||'/photo.jpg']);
 perform pg_temp.kh_as(u);q:=public.kh_request_agency_mandate(u,a,jsonb_build_object('propertyId',pid,'internalReference','PERSONAL-RACE','clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(source);perform public.kh_decide_agency_mandate(source,null,jsonb_build_object('requestId',q->>'id','decision','accept','expectedVersion',1,'clientRequestId',gen_random_uuid()));
 perform pg_temp.kh_as(u);d:=public.kh_create_agency_deal(u,a,jsonb_build_object('propertyId',pid,'assigneeId',u,'externalContact',jsonb_build_object('name','Contacto personal','consentReference','Consentimiento privado'),'clientRequestId',gen_random_uuid()));
 return jsonb_build_object('agency',a,'actor',u,'property',pid,'deal',d->>'id','source',source);
end $$;
