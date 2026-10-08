create function pg_temp.schedule_fixture(n integer) returns jsonb language plpgsql as $$
declare a uuid:=pg_temp.kh_agency_signup(n); actor uuid:=('45000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;pid uuid:=gen_random_uuid();d jsonb;x jsonb;payload jsonb;matches jsonb;begin
 perform pg_temp.kh_agency_approve(a);
 perform pg_temp.kh_as(actor);insert into storage.objects(bucket_id,name)values('property-photos',actor||'/'||pid||'/photo.jpg');
 payload:=jsonb_build_object('clientRequestId',pid,'sourceReference',pid,'consentReference','Consentimiento comprobado','publicationIntent','submit','draft',jsonb_build_object('title','Casa de agenda','location','Vedado','province','La Habana','type','Casa','price',30000,'bedrooms',2,'bathrooms',1,'description','Vivienda sintética para agenda privada.','photoPaths',jsonb_build_array(actor||'/'||pid||'/photo.jpg')));
 -- Distinct synthetic homes intentionally share scheduling coordinates. Record
 -- the same explicit reviewed different-home decision required of real intake.
 matches:=public.kh_find_agency_property_matches(actor,a,payload);
 if jsonb_array_length(matches->'items')>0 then payload:=payload||jsonb_build_object('duplicateDecision',matches->'review');end if;
 x:=public.kh_agency_save_property(actor,a,payload);pid:=(x#>>'{property,id}')::uuid;
 perform pg_temp.kh_as('45000000-0000-4000-8000-000000000001');perform public.kh_review_property(pid,'approved',null,1);
 perform pg_temp.kh_as(actor);
 d:=public.kh_create_agency_deal(actor,a,jsonb_build_object('propertyId',pid,'assigneeId',actor,'externalContact',jsonb_build_object('name','Contacto privado','phone',null,'consentReference','Autorización recibida'),'clientRequestId',gen_random_uuid()));
 return jsonb_build_object('agency',a,'actor',actor,'property',pid,'deal',d->>'id');end $$;

create function pg_temp.visit_proposal(u uuid,a uuid,d uuid,t timestamptz,minutes integer default 60) returns jsonb language plpgsql as $$begin
 perform pg_temp.kh_as(u);return public.kh_create_agency_proposal(u,a,jsonb_build_object('dealId',d,'kind','visit','visitDate',to_char(t at time zone 'America/Havana','YYYY-MM-DD'),'visitTime',to_char(t at time zone 'America/Havana','HH24:MI'),'durationMinutes',minutes,'note','Nota privada','clientRequestId',gen_random_uuid()));end $$;
create function pg_temp.accept_visit(u uuid,a uuid,p jsonb,token uuid default null) returns jsonb language plpgsql as $$begin
 perform pg_temp.kh_as(u);return public.kh_respond_agency_proposal(u,a,jsonb_build_object('proposalId',p->>'id','expectedVersion',(p->>'version')::int,'action','accept','externalResponse',jsonb_build_object('channel','phone','reference','Confirmación manual'),'clientRequestId',gen_random_uuid())||case when token is null then '{}'::jsonb else jsonb_build_object('jointVisitToken',token) end);end $$;
