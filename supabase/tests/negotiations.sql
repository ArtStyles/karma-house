begin;
create or replace function pg_temp.neg_assert(ok boolean,description text) returns void language plpgsql as $$ begin if ok is not true then raise exception 'NEG ASSERTION: %',description; end if; end $$;
create or replace function pg_temp.neg_error(statement text,expected text) returns void language plpgsql as $$ begin
  begin execute statement; exception when others then if position(expected in sqlerrm)>0 then return; end if; raise exception 'Expected %, got %',expected,sqlerrm; end;
  raise exception 'NEG ASSERTION: expected %',expected;
end $$;
create or replace function pg_temp.neg_actor(actor uuid) returns void language sql as $$
 select set_config('request.jwt.claim.sub',actor::text,true); select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
$$;
insert into auth.users(id,email,raw_user_meta_data) values
('66000000-0000-4000-8000-000000000001','kh-neg-buyer@example.invalid','{}'),
('66000000-0000-4000-8000-000000000002','kh-neg-seller@example.invalid','{}'),
('66000000-0000-4000-8000-000000000003','kh-neg-outsider@example.invalid','{}');
insert into public.kh_admins(user_id) values('66000000-0000-4000-8000-000000000003');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,amenities,photo_paths,moderation)
values('66000000-0000-4000-8000-000000000004','66000000-0000-4000-8000-000000000002','neg-sql','Casa para negociación','Vedado','La Habana','Casa','Vivienda ficticia para probar visitas y ofertas.',50000,100,2,1,'{}',ARRAY['66000000-0000-4000-8000-000000000002/neg-sql/photo.jpg'],'approved');
create temporary table kh_neg_context(conversation_id uuid,offer jsonb,visit jsonb,alternate jsonb,request jsonb,seq integer);
insert into kh_neg_context default values;
grant all on kh_neg_context to authenticated;
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
update kh_neg_context set conversation_id=(public.kh_start_conversation('66000000-0000-4000-8000-000000000004','66000000-0000-4000-8000-000000000001')->>'id')::uuid;
select pg_temp.neg_assert(public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,false,0,30)='[]','empty participant list');
update kh_neg_context set request=jsonb_build_object('conversationId',conversation_id,'kind','offer','clientRequestId','66000000-0000-4000-8000-000000000010','note','Primera oferta','amountUsd','45000.25');
update kh_neg_context set offer=public.kh_create_negotiation('66000000-0000-4000-8000-000000000001',request);
select pg_temp.neg_assert((select offer->>'status'='pending' and (offer->>'amountUsd')::numeric=45000.25 and (offer->>'version')::int=1 from kh_neg_context),'offer structured values');
select pg_temp.neg_assert((select public.kh_create_negotiation('66000000-0000-4000-8000-000000000001',request)=offer from kh_neg_context),'lost ACK returns exact create receipt');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"amountUsd":"40000"}'') from kh_neg_context','KH_NEG_REQUEST_CONFLICT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"amountUsd":"1e2"}'') from kh_neg_context','KH_NEG_INVALID_AMOUNT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"amountUsd":"12.345"}'') from kh_neg_context','KH_NEG_INVALID_AMOUNT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"amountUsd":"0"}'') from kh_neg_context','KH_NEG_INVALID_AMOUNT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"amountUsd":"1000000000.01"}'') from kh_neg_context','KH_NEG_INVALID_AMOUNT');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000001'',jsonb_build_object(''id'',offer->>''id'',''action'',''cancel'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000010'')) from kh_neg_context','KH_NEG_REQUEST_CONFLICT');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000001'',jsonb_build_object(''id'',offer->>''id'',''action'',''cancel'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000010'',''note'',''Cambio oculto'')) from kh_neg_context','KH_NEG_INVALID_PAYLOAD');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000011"}'') from kh_neg_context','KH_NEG_PENDING_EXISTS');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000001'',jsonb_build_object(''id'',offer->>''id'',''action'',''accept'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000012'')) from kh_neg_context','KH_NEG_NOT_YOUR_TURN');
select pg_temp.neg_assert((select last_seq=1 from public.kh_conversations where id=(select conversation_id from kh_neg_context)),'retry and failed actions emit no extra messages');
select pg_temp.neg_error('update public.kh_negotiations set status=''accepted''','permission denied');
select pg_temp.neg_error('select * from kh_private.negotiation_requests','permission denied');

select pg_temp.neg_actor('66000000-0000-4000-8000-000000000003');
select pg_temp.neg_assert(public.kh_list_negotiations('66000000-0000-4000-8000-000000000003',null,false,0,30)='[]','administrator has no global access');
select pg_temp.neg_assert(not exists(select 1 from public.kh_negotiations),'RLS denies unrelated administrator');
select pg_temp.neg_error('select public.kh_list_negotiations(''66000000-0000-4000-8000-000000000003'',conversation_id,false,0,30) from kh_neg_context','KH_NEG_NOT_FOUND');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request) from kh_neg_context','KH_ACCOUNT_CHANGED');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000003'',jsonb_build_object(''id'',offer->>''id'',''action'',''accept'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000013'')) from kh_neg_context','KH_NEG_NOT_FOUND');

select pg_temp.neg_actor('66000000-0000-4000-8000-000000000002');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000002'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000014"}'') from kh_neg_context','KH_NEG_BUYER_REQUIRED');
update kh_neg_context set request=request||jsonb_build_object('clientRequestId','66000000-0000-4000-8000-000000000015','replacesId',offer->>'id','expectedVersion',1,'amountUsd','47000');
update kh_neg_context set alternate=public.kh_create_negotiation('66000000-0000-4000-8000-000000000002',request);
select pg_temp.neg_assert((select alternate->>'parentId'=offer->>'id' and alternate->>'createdBy'='66000000-0000-4000-8000-000000000002' from kh_neg_context),'seller may counter recipient offer');
select pg_temp.neg_assert((select status='superseded' and version=2 from public.kh_negotiations where id=(select (offer->>'id')::uuid from kh_neg_context)),'alternative atomically supersedes original');
select pg_temp.neg_assert(jsonb_array_length(public.kh_list_negotiations('66000000-0000-4000-8000-000000000002',null,true,0,30))=1,'only latest pending counts');
select pg_temp.neg_assert((select public.kh_create_negotiation('66000000-0000-4000-8000-000000000002',request)=alternate from kh_neg_context),'alternative retry is idempotent');
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
update kh_neg_context set request=jsonb_build_object('id',alternate->>'id','action','accept','expectedVersion',1,'clientRequestId','66000000-0000-4000-8000-000000000016');
update kh_neg_context set alternate=public.kh_respond_negotiation('66000000-0000-4000-8000-000000000001',request);
select pg_temp.neg_assert((select alternate->>'status'='accepted' from kh_neg_context),'recipient accepts alternative');
select pg_temp.neg_assert((select public.kh_respond_negotiation('66000000-0000-4000-8000-000000000001',request)=alternate from kh_neg_context),'accept ACK retry stable');
select pg_temp.neg_assert((select availability='active' from public.properties where id='66000000-0000-4000-8000-000000000004'),'accepted offer never reserves or sells property');

-- Both participants may initiate visits; inputs are Havana wall time, not session timezone.
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000002');
update kh_neg_context set request=jsonb_build_object('conversationId',conversation_id,'kind','visit','clientRequestId','66000000-0000-4000-8000-000000000017','note','','visitDate',to_char((clock_timestamp() at time zone 'America/Havana')+interval '2 days','YYYY-MM-DD'),'visitTime','10:30');
update kh_neg_context set visit=public.kh_create_negotiation('66000000-0000-4000-8000-000000000002',request);
select pg_temp.neg_assert((select visit->>'visitTime'='10:30' and (visit->>'visitAt')::timestamptz=((visit->>'visitDate')::date+time '10:30') at time zone 'America/Havana' from kh_neg_context),'visit instant matches Havana');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000002'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000018","visitDate":"2026-02-30"}'') from kh_neg_context','KH_NEG_INVALID_VISIT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000002'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000018","visitTime":"24:00"}'') from kh_neg_context','KH_NEG_INVALID_VISIT');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000002'',request||jsonb_build_object(''clientRequestId'',''66000000-0000-4000-8000-000000000018'',''visitDate'',to_char(clock_timestamp()+interval ''181 days'',''YYYY-MM-DD''))) from kh_neg_context','KH_NEG_INVALID_VISIT');

-- Blocking freezes new proposals/responses, but accepted commitments can be cancelled silently.
select public.kh_set_user_block('66000000-0000-4000-8000-000000000001',true,'66000000-0000-4000-8000-000000000002');
update kh_neg_context set seq=(select last_seq from public.kh_conversations where id=conversation_id);
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000002'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000019"}'') from kh_neg_context','KH_CHAT_BLOCKED');
update kh_neg_context set alternate=public.kh_respond_negotiation('66000000-0000-4000-8000-000000000002',jsonb_build_object('id',alternate->>'id','action','cancel','expectedVersion',2,'clientRequestId','66000000-0000-4000-8000-000000000020'));
select pg_temp.neg_assert((select alternate->>'status'='cancelled' and seq=(select last_seq from public.kh_conversations where id=conversation_id) from kh_neg_context),'cancel while blocked emits no message');
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
select pg_temp.neg_assert((select public.kh_create_negotiation('66000000-0000-4000-8000-000000000001',jsonb_build_object('conversationId',conversation_id,'kind','offer','clientRequestId','66000000-0000-4000-8000-000000000010','note','Primera oferta','amountUsd','45000.25'))=offer from kh_neg_context),'lost create ACK still resolves while blocked and after later transitions');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000001'',jsonb_build_object(''id'',visit->>''id'',''action'',''cancel'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000021'')) from kh_neg_context','KH_NEG_NOT_YOUR_TURN');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000001'',jsonb_build_object(''id'',visit->>''id'',''action'',''accept'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000021'')) from kh_neg_context','KH_CHAT_BLOCKED');
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000002');
select public.kh_set_user_block('66000000-0000-4000-8000-000000000001',false,'66000000-0000-4000-8000-000000000002');
reset role;
update public.properties set availability='paused' where id='66000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000002');
update kh_neg_context set visit=public.kh_respond_negotiation('66000000-0000-4000-8000-000000000002',jsonb_build_object('id',visit->>'id','action','cancel','expectedVersion',1,'clientRequestId','66000000-0000-4000-8000-000000000022'));
select pg_temp.neg_assert((select visit->>'status'='cancelled' and seq=(select last_seq from public.kh_conversations where id=conversation_id) from kh_neg_context),'owner withdraws pending while unavailable without a message');
reset role;
select pg_temp.neg_assert(kh_private.negotiation_visit('2026-11-01','00:30')='2026-11-01T05:30:00Z'::timestamptz,'standard time chosen at DST overlap');
select pg_temp.neg_error('select kh_private.negotiation_visit(''2026-03-08'',''00:30'')','KH_NEG_INVALID_VISIT');

-- Server-time expiry and paginated histories; accepted visits never expire retroactively.
insert into public.kh_negotiations(conversation_id,created_by,kind,status,amount_usd,expires_at,created_at,updated_at)
select conversation_id,'66000000-0000-4000-8000-000000000001','offer','declined',1000+g,clock_timestamp()+interval '7 days',clock_timestamp()-g*interval '1 second',clock_timestamp() from kh_neg_context cross join generate_series(1,35) g;
insert into public.kh_negotiations(conversation_id,created_by,kind,status,amount_usd,expires_at)
select conversation_id,'66000000-0000-4000-8000-000000000001','offer','pending',100,clock_timestamp()-interval '1 second' from kh_neg_context;
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
select pg_temp.neg_assert(jsonb_array_length(public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,false,0,30))=30,'page boundary enforced');
select pg_temp.neg_assert(jsonb_array_length(public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,false,30,30))=9,'remaining history accessible');
select pg_temp.neg_assert(public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,true,0,30)='[]','expired pending excluded on server');
select pg_temp.neg_assert((public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,false,0,30)->0->>'status')='expired','server exposes effective expired status');
select pg_temp.neg_error('select public.kh_list_negotiations(''66000000-0000-4000-8000-000000000001'',null,false,0,51)','KH_NEG_INVALID_PAGE');
reset role;
update public.properties set availability='active' where id='66000000-0000-4000-8000-000000000004';
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
update kh_neg_context set request=jsonb_build_object('conversationId',conversation_id,'kind','offer','clientRequestId','66000000-0000-4000-8000-000000000023','note','','amountUsd','12000');
update kh_neg_context set offer=public.kh_create_negotiation('66000000-0000-4000-8000-000000000001',request);
select pg_temp.neg_assert((select count(*)=1 from public.kh_negotiations where status='pending'),'successful new action materializes preceding expired record');
reset role;
update public.kh_negotiations set expires_at=clock_timestamp()-interval '1 second' where id=(select (offer->>'id')::uuid from kh_neg_context);
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
select pg_temp.neg_assert((select public.kh_create_negotiation('66000000-0000-4000-8000-000000000001',request)=offer from kh_neg_context),'exact stored receipt resolves after expiry without reopening proposal');
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000002');
select pg_temp.neg_error('select public.kh_respond_negotiation(''66000000-0000-4000-8000-000000000002'',jsonb_build_object(''id'',offer->>''id'',''action'',''accept'',''expectedVersion'',1,''clientRequestId'',''66000000-0000-4000-8000-000000000024'')) from kh_neg_context','KH_NEG_EXPIRED');
reset role;
insert into public.kh_negotiations(conversation_id,created_by,kind,status,visit_date,visit_time,visit_at,expires_at)
select conversation_id,'66000000-0000-4000-8000-000000000001','visit','accepted',date '2026-01-01',time '10:00','2026-01-01T15:00:00Z','2026-01-01T15:00:00Z' from kh_neg_context;
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
select pg_temp.neg_assert((public.kh_list_negotiations('66000000-0000-4000-8000-000000000001',null,false,0,30)->0->>'status')='accepted','accepted past visit remains accepted');
reset role;

-- Forced summary insertion failure must roll back proposal, event, receipt and sequence together.
create function pg_temp.neg_fail_summary() returns trigger language plpgsql as $$ begin raise exception 'NEG_FORCED_SUMMARY_FAILURE'; end $$;
create trigger neg_forced_failure before insert on public.kh_messages for each row execute function pg_temp.neg_fail_summary();
update kh_neg_context set seq=(select last_seq from public.kh_conversations where id=conversation_id);
set local role authenticated;
select pg_temp.neg_actor('66000000-0000-4000-8000-000000000001');
select pg_temp.neg_error('select public.kh_create_negotiation(''66000000-0000-4000-8000-000000000001'',request||''{"clientRequestId":"66000000-0000-4000-8000-000000000025"}'') from kh_neg_context','NEG_FORCED_SUMMARY_FAILURE');
select pg_temp.neg_assert((select seq=(select last_seq from public.kh_conversations where id=conversation_id) from kh_neg_context),'summary failure leaves message sequence unchanged');
reset role;
select pg_temp.neg_assert(not exists(select 1 from kh_private.negotiation_requests where client_request_id='66000000-0000-4000-8000-000000000025'),'summary failure leaves no receipt');
select pg_temp.neg_assert((select status='pending' from public.kh_negotiations where id=(select (offer->>'id')::uuid from kh_neg_context)),'summary failure rolls back expiration and new proposal');
rollback;
