-- Chat messages carry the proposal they summarize. Everything rolls back.
begin;
create or replace function pg_temp.card_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'CARD ASSERTION FAILED: %',label; end if; end $$;
create or replace function pg_temp.card_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('69000000-0000-4000-8000-000000000001','card-seller@example.invalid','{"display_name":"Vendedor temporal"}'),
 ('69000000-0000-4000-8000-000000000002','card-buyer@example.invalid','{"display_name":"Comprador temporal"}');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,description,price,area,bedrooms,bathrooms,photo_paths,moderation) values
 ('69000000-0000-4000-8000-000000000011','69000000-0000-4000-8000-000000000001','card-a','Casa de prueba de tarjetas','Vedado','La Habana','Casa','Vivienda temporal usada en pruebas aisladas.',90000,90,2,1,array['synthetic/photo.jpg'],'approved');
create temporary table card_context(conversation_id uuid, offer jsonb);
insert into card_context default values;
grant select,update on card_context to authenticated;
set local role authenticated;

select pg_temp.card_as('69000000-0000-4000-8000-000000000002');
update card_context set conversation_id=(public.kh_start_conversation('69000000-0000-4000-8000-000000000011','69000000-0000-4000-8000-000000000002')->>'id')::uuid;
select public.kh_send_message(conversation_id,gen_random_uuid(),'Hola, me interesa','69000000-0000-4000-8000-000000000002') from card_context;
update card_context set offer=public.kh_create_negotiation('69000000-0000-4000-8000-000000000002',jsonb_build_object(
  'conversationId',conversation_id,'clientRequestId',gen_random_uuid(),'kind','offer','note','Pago en efectivo','amountUsd','80000'));
select pg_temp.card_as('69000000-0000-4000-8000-000000000001');
select public.kh_respond_negotiation('69000000-0000-4000-8000-000000000001',jsonb_build_object(
  'id',offer->>'id','clientRequestId',gen_random_uuid(),'expectedVersion',(offer->>'version')::int,'action','accept')) from card_context;

create temporary table card_messages as
  select value as m, ordinality as n from card_context, jsonb_array_elements(public.kh_list_messages(conversation_id,'69000000-0000-4000-8000-000000000001')) with ordinality;
select pg_temp.card_assert((select count(*)=3 from card_messages),'plain message, proposal and answer');
select pg_temp.card_assert((select m ? 'negotiation' and m->'negotiation'='null'::jsonb from card_messages where n=1),'a plain message carries a null negotiation');
select pg_temp.card_assert((select m->'negotiation'->>'action'='created' and m->'negotiation'->>'kind'='offer'
  and (m->'negotiation'->>'amountUsd')::numeric=80000 and m->'negotiation'->>'note'='Pago en efectivo'
  and m->'negotiation'->>'createdBy'='69000000-0000-4000-8000-000000000002'
  and m->'negotiation'->>'id'=(select offer->>'id' from card_context)
  and m->'negotiation'->'parentId'='null'::jsonb and m->'negotiation'->'visitAt'='null'::jsonb from card_messages where n=2),'the proposal message describes the offer');
select pg_temp.card_assert((select m->'negotiation'->>'action'='accepted'
  and m->'negotiation'->>'createdBy'='69000000-0000-4000-8000-000000000002'
  and m->>'senderId'='69000000-0000-4000-8000-000000000001' from card_messages where n=3),'the answer names the original proposer while the seller sends it');
select pg_temp.card_assert((select (m->'negotiation') - array['id','action','kind','createdBy','amountUsd','visitAt','note','parentId'] = '{}'::jsonb from card_messages where n=2),'only the documented fields leave the server');
rollback;
