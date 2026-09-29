-- Public profile with trust signals. Reserved synthetic actors; everything rolls back.
-- S seller (…0001), B buyer (…0002), A admin (…0003), N has no listing (…0004), X stranger (…0005),
-- R1-R4 more buyers of S (…0006-…0009). Chat history and visits are inserted with chosen timestamps.
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'PROFILE ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'PROFILE ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  perform set_config('request.jwt.claims',case when actor is null then '{"role":"anon"}' else jsonb_build_object('sub',actor,'role','authenticated')::text end,true);
end $$;
-- A conversation of S with a first message at p_first_at and, optionally, the other side's reply at p_reply_at.
create function pg_temp.tp_conversation(p_buyer uuid,p_first_sender uuid,p_first_at timestamptz,p_reply_at timestamptz) returns uuid language plpgsql as $$
declare v_id uuid; v_other uuid;
begin
  insert into public.kh_conversations(property_id,property_title,property_location,buyer_id,seller_id,created_at)
    select id,title,location,p_buyer,owner_id,p_first_at-interval '1 minute' from public.properties where id=(select property_id from tp_context) returning id into v_id;
  insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at) values(v_id,p_first_sender,gen_random_uuid(),1,'Hola, ¿sigue disponible?',p_first_at);
  if p_reply_at is not null then
    v_other:=case when p_first_sender=p_buyer then '31000000-0000-4000-8000-000000000001'::uuid else p_buyer end;
    insert into public.kh_messages(conversation_id,sender_id,client_message_id,seq,body,created_at) values(v_id,v_other,gen_random_uuid(),2,'Sí, sigue disponible.',p_reply_at);
  end if;
  update public.kh_conversations set last_seq=case when p_reply_at is null then 1 else 2 end where id=v_id;
  return v_id;
end $$;
create function pg_temp.tp_negotiation(p_conversation uuid,p_creator uuid,p_kind text,p_status text) returns void language sql as $$
  with t as (select date_trunc('minute',now()+interval '3 days') as at)
  insert into public.kh_negotiations(conversation_id,created_by,kind,status,amount_usd,visit_date,visit_time,visit_at,expires_at)
  select p_conversation,p_creator,p_kind,p_status,
    case when p_kind='offer' then 50000 end,
    case when p_kind='visit' then (t.at at time zone 'America/Havana')::date end,
    case when p_kind='visit' then (t.at at time zone 'America/Havana')::time end,
    case when p_kind='visit' then t.at end,
    case when p_kind='visit' then t.at else now()+interval '7 days' end
  from t;
$$;
create function pg_temp.tp_keys(p jsonb) returns text[] language sql as $$ select array_agg(k order by k) from jsonb_object_keys(p) k $$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('31000000-0000-4000-8000-000000000001','kh-profile-seller@example.invalid','{"display_name":"Vendedora S"}'),
 ('31000000-0000-4000-8000-000000000002','kh-profile-buyer@example.invalid','{"display_name":"Comprador B"}'),
 ('31000000-0000-4000-8000-000000000003','kh-profile-admin@example.invalid','{}'),
 ('31000000-0000-4000-8000-000000000004','kh-profile-none@example.invalid','{"display_name":"Nadia N"}'),
 ('31000000-0000-4000-8000-000000000005','kh-profile-stranger@example.invalid','{"display_name":"Extraño X"}'),
 ('31000000-0000-4000-8000-000000000006','kh-profile-r1@example.invalid','{"display_name":"Comprador R1"}'),
 ('31000000-0000-4000-8000-000000000007','kh-profile-r2@example.invalid','{"display_name":"Comprador R2"}'),
 ('31000000-0000-4000-8000-000000000008','kh-profile-r3@example.invalid','{"display_name":"Comprador R3"}'),
 ('31000000-0000-4000-8000-000000000009','kh-profile-r4@example.invalid','{"display_name":"Comprador R4"}');
insert into public.kh_admins(user_id) values('31000000-0000-4000-8000-000000000003');
insert into storage.objects(bucket_id,name,owner_id) values
 ('property-photos','31000000-0000-4000-8000-000000000001/profile-sale/photo.jpg','31000000-0000-4000-8000-000000000001'),
 ('account-avatars','31000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg','31000000-0000-4000-8000-000000000001'),
 ('account-avatars','31000000-0000-4000-8000-000000000004/44444444-4444-4444-8444-444444444444.jpg','31000000-0000-4000-8000-000000000004');
insert into kh_private.account_avatars(owner_id,avatar_path) values
 ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg'),
 ('31000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000004/44444444-4444-4444-8444-444444444444.jpg');
create temporary table tp_context(property_id uuid,c_b uuid,c_r1 uuid,c_r2 uuid,c_r3 uuid,c_n uuid,c_r4 uuid);
insert into tp_context default values;
grant select,update on tp_context to anon,authenticated;

-- 1. S publishes a sale and A approves it.
set local role authenticated;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000001');
update tp_context set property_id=(public.kh_save_property(jsonb_build_object('clientRequestId','profile-sale','title','Casa de S','location','Vedado',
  'province','La Habana','type','Casa','description','Casa ficticia para las pruebas del perfil público.','price',90000,'area',100,
  'bedrooms',2,'bathrooms',1,'photoPaths',jsonb_build_array('31000000-0000-4000-8000-000000000001/profile-sale/photo.jpg'),'operation','sale'))->>'id')::uuid;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000003');
select public.kh_review_property(property_id,'approved',null,1) from tp_context;

-- 2. Two answered conversations are not enough for a response time.
reset role;
update tp_context set c_b=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002',now()-interval '10 days',now()-interval '10 days'+interval '30 minutes');
update tp_context set c_r1=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000006','31000000-0000-4000-8000-000000000006',now()-interval '9 days',now()-interval '9 days'+interval '60 minutes');
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_assert((select r->'responseMinutes'='null' and r->'responseRate'='null' from (select public.kh_public_profile('31000000-0000-4000-8000-000000000001') r) x),
  'fewer than three answered conversations give no response time or rate');

-- 3. Median and rate: answered 30, 60 and 240 minutes, one unanswered after two days, one unanswered for an
-- hour (not counted yet) and one the seller started (not counted at all).
reset role;
update tp_context set c_r2=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000007','31000000-0000-4000-8000-000000000007',now()-interval '8 days',now()-interval '8 days'+interval '240 minutes');
update tp_context set c_r3=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000008','31000000-0000-4000-8000-000000000008',now()-interval '2 days',null);
update tp_context set c_n=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000004',now()-interval '1 hour',null);
update tp_context set c_r4=pg_temp.tp_conversation('31000000-0000-4000-8000-000000000009','31000000-0000-4000-8000-000000000001',now()-interval '5 days',now()-interval '5 days'+interval '10 minutes');
select pg_temp.ops_assert((select answered=3 and received=4 and median_minutes=60 from kh_private.profile_response_stats('31000000-0000-4000-8000-000000000001')),
  'three answered of four received, median one hour');

-- 4. Visits: two accepted visits count; a pending visit and an accepted offer do not. The buyer counts his own.
select pg_temp.tp_negotiation(c_b,'31000000-0000-4000-8000-000000000002','visit','accepted') from tp_context;
select pg_temp.tp_negotiation(c_r1,'31000000-0000-4000-8000-000000000006','visit','accepted') from tp_context;
select pg_temp.tp_negotiation(c_r2,'31000000-0000-4000-8000-000000000007','visit','pending') from tp_context;
select pg_temp.tp_negotiation(c_r3,'31000000-0000-4000-8000-000000000008','offer','accepted') from tp_context;
select pg_temp.ops_assert(kh_private.profile_visits_agreed('31000000-0000-4000-8000-000000000001')=2
  and kh_private.profile_visits_agreed('31000000-0000-4000-8000-000000000002')=1
  and kh_private.profile_visits_agreed('31000000-0000-4000-8000-000000000005')=0,'accepted visits in the person''s conversations');

-- 5. Anyone sees S: exact keys, the figures above, level active (3+3+4 points), no email or other ids.
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_assert((select pg_temp.tp_keys(r)=array['activeListingCount','activeListings','approvedListingCount','avatarUrlPath','displayName','id',
    'level','levelReasons','memberSince','responseMinutes','responseRate','verified','visitsAgreed']
  and r->>'id'='31000000-0000-4000-8000-000000000001' and r->>'displayName'='Vendedora S' and r->'verified'='false'
  and r->'activeListings'=jsonb_build_array(c.property_id) and r->'activeListingCount'='1' and r->'approvedListingCount'='1'
  and r->'responseMinutes'='60' and r->'responseRate'='75' and r->'visitsAgreed'='2' and r->>'level'='active'
  and r->'levelReasons'='["1 anuncio aprobado","Responde a 8 de cada 10 mensajes","2 visitas concertadas"]'
  and r->>'avatarUrlPath'='31000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg'
  and position('@' in r::text)=0 and position('3100000' in replace(r::text,'31000000-0000-4000-8000-000000000001',''))=0
  from tp_context c, (select public.kh_public_profile('31000000-0000-4000-8000-000000000001') r) x),'the public profile of a seller');

-- 6. Visibility of N, who has no listing: hidden from anon and strangers with the same error as a missing
-- person; visible to S (they share a conversation), to N and to an administrator.
select pg_temp.ops_error($q$select public.kh_public_profile('31000000-0000-4000-8000-000000000004')$q$,'KH_PROFILE_NOT_FOUND');
select pg_temp.ops_error($q$select public.kh_public_profile('31000000-0000-4000-8000-0000000000ff')$q$,'KH_PROFILE_NOT_FOUND');
select pg_temp.ops_error($q$select public.kh_public_profile(null)$q$,'KH_PROFILE_NOT_FOUND');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',true,null)$q$,'permission denied');
set local role authenticated;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000005');
select pg_temp.ops_error($q$select public.kh_public_profile('31000000-0000-4000-8000-000000000004')$q$,'KH_PROFILE_NOT_FOUND');
select pg_temp.ops_as('31000000-0000-4000-8000-000000000001');
select pg_temp.ops_assert((select r->>'displayName'='Nadia N' and r->'activeListings'='[]' and r->'approvedListingCount'='0' and r->>'level'='new'
  and r->'levelReasons'='[]' and r->'responseMinutes'='null' and r->'avatarUrlPath'='null'
  from (select public.kh_public_profile('31000000-0000-4000-8000-000000000004') r) x),'S sees N, without an avatar N has not made public');
select pg_temp.ops_as('31000000-0000-4000-8000-000000000004');
select pg_temp.ops_assert(public.kh_public_profile('31000000-0000-4000-8000-000000000004')->>'avatarUrlPath'='31000000-0000-4000-8000-000000000004/44444444-4444-4444-8444-444444444444.jpg',
  'N sees her own profile and avatar');
select pg_temp.ops_as('31000000-0000-4000-8000-000000000003');
select pg_temp.ops_assert(public.kh_public_profile('31000000-0000-4000-8000-000000000004')->>'id'='31000000-0000-4000-8000-000000000004','an administrator sees N');

-- 7. A paused listing hides S from anon but not from B, who talked with her.
reset role;
update public.properties set availability='paused' where id=(select property_id from tp_context);
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_error($q$select public.kh_public_profile('31000000-0000-4000-8000-000000000001')$q$,'KH_PROFILE_NOT_FOUND');
set local role authenticated;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert((select r->'activeListings'='[]' and r->'activeListingCount'='0' and r->'approvedListingCount'='1' and r->'avatarUrlPath'='null'
  from (select public.kh_public_profile('31000000-0000-4000-8000-000000000001') r) x),'B still sees S, with no active listing and no avatar');
reset role;
update public.properties set availability='active' where id=(select property_id from tp_context);

-- 8. Avatars: only the current avatar of someone with an active approved listing is public.
select pg_temp.ops_assert(kh_private.avatar_is_public('31000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg')
  and not kh_private.avatar_is_public('31000000-0000-4000-8000-000000000004/44444444-4444-4444-8444-444444444444.jpg')
  and not kh_private.avatar_is_public('31000000-0000-4000-8000-000000000001/99999999-9999-4999-8999-999999999999.jpg'),'avatar_is_public');
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_assert((select array_agg(name)=array['31000000-0000-4000-8000-000000000001/11111111-1111-4111-8111-111111111111.jpg']
  from storage.objects where bucket_id='account-avatars' and name like '31000000-0000-4000-8000-00000000000_/%'),'anon reads S''s avatar object and not N''s');

-- 9. Verification: administrators only, never on themselves.
set local role authenticated;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000002');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001',true,null)$q$,'KH_ADMIN_REQUIRED');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',true,null)$q$,'KH_ACCOUNT_CHANGED');
select pg_temp.ops_as('31000000-0000-4000-8000-000000000003');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000003',true,null)$q$,'KH_CANNOT_VERIFY_SELF');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',true,repeat('x',501))$q$,'KH_VERIFY_INVALID');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',null,null)$q$,'KH_VERIFY_INVALID');
select pg_temp.ops_error($q$select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-0000000000ff',true,null)$q$,'KH_PROFILE_NOT_FOUND');
reset role;
update public.profiles set created_at=now()-interval '8 months' where id='31000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.ops_as('31000000-0000-4000-8000-000000000003');
select pg_temp.ops_assert((select r->'verified'='true' and r->>'level'='trusted' and r->'levelReasons'='["Verificado por KarmaHouse","1 anuncio aprobado",
  "Responde a 8 de cada 10 mensajes","2 visitas concertadas","En KarmaHouse desde hace 8 meses"]'
  from (select public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',true,'  Documento revisado  ') r) x),
  'verification returns the profile: 8+3+3+4+10 points is trusted');
select pg_temp.ops_assert(public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000004',true,null)->'verified'='true'
  and public.kh_set_user_verified('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000004',false,null)->'verified'='false','verify and unverify N');
reset role;
select pg_temp.ops_assert((select verified_by='31000000-0000-4000-8000-000000000003' and note='Documento revisado' from kh_private.verified_users where user_id='31000000-0000-4000-8000-000000000001')
  and not exists(select 1 from kh_private.verified_users where user_id='31000000-0000-4000-8000-000000000004'),'the verification row keeps who and why');

-- 10. Confirmed reports subtract 15 each, once per listing; a recent one caps the level at active.
insert into public.kh_property_reports(property_id,property_title,reporter_id,owner_id,client_report_id,reason,status,unpublished,review_note,reviewed_by,reviewed_at) values
 ('31000000-0000-4000-8000-0000000000a1','Casa antigua','31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001',gen_random_uuid(),'fraud','reviewed',true,'Retirada','31000000-0000-4000-8000-000000000003',now()-interval '200 days'),
 ('31000000-0000-4000-8000-0000000000a2','Casa reciente','31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001',gen_random_uuid(),'fraud','reviewed',true,'Retirada','31000000-0000-4000-8000-000000000003',now()-interval '1 day'),
 ('31000000-0000-4000-8000-0000000000a2','Casa reciente','31000000-0000-4000-8000-000000000006','31000000-0000-4000-8000-000000000001',gen_random_uuid(),'misleading','reviewed',true,'Retirada','31000000-0000-4000-8000-000000000003',now()-interval '1 day'),
 ('31000000-0000-4000-8000-0000000000a3','Casa correcta','31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001',gen_random_uuid(),'other','reviewed',false,'','31000000-0000-4000-8000-000000000003',now()-interval '1 day');
select pg_temp.ops_assert(kh_private.profile_confirmed_reports('31000000-0000-4000-8000-000000000001',null)=2
  and kh_private.profile_confirmed_reports('31000000-0000-4000-8000-000000000001','90 days')=1,'confirmed reports per listing, all time and recent');
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_assert(public.kh_public_profile('31000000-0000-4000-8000-000000000001')->>'level'='new','28 points minus two confirmed reports is new');
reset role;
select pg_temp.ops_assert(kh_private.karma_level(0,0,0,0,false,0,false)='new' and kh_private.karma_level(9,0,0,0,false,0,false)='new'
  and kh_private.karma_level(10,0,0,0,false,0,false)='active' and kh_private.karma_level(12,4,0,0,false,0,false)='active'
  and kh_private.karma_level(12,4,1,0,false,0,false)='trusted' and kh_private.karma_level(12,5,17,0,false,0,false)='trusted'
  and kh_private.karma_level(12,5,18,0,false,0,false)='featured' and kh_private.karma_level(100,0,0,0,false,0,false)='active'
  and kh_private.karma_level(100,100,100,100,true,0,false)='featured' and kh_private.karma_level(100,100,100,100,true,3,false)='trusted',
  'thresholds 10, 25 and 45, with each source capped');
select pg_temp.ops_assert(kh_private.karma_level(100,100,100,100,true,0,true)='active' and kh_private.karma_level(100,100,100,100,true,1,true)='active'
  and kh_private.karma_level(0,0,0,0,false,0,true)='new','a recent confirmed report caps the level at active');

-- 11. Grants: the private helpers and table stay private.
select pg_temp.ops_assert(has_function_privilege('anon','public.kh_public_profile(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.kh_public_profile(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.kh_set_user_verified(uuid,uuid,boolean,text)','EXECUTE')
  and not has_function_privilege('anon','public.kh_set_user_verified(uuid,uuid,boolean,text)','EXECUTE'),'public grants');
select pg_temp.ops_assert(not has_function_privilege(r,f,'EXECUTE'),'private function '||f||' for '||r)
  from unnest(array['anon','authenticated']) r, unnest(array['kh_private.profile_response_stats(uuid)','kh_private.profile_visits_agreed(uuid)',
    'kh_private.profile_confirmed_reports(uuid,interval)','kh_private.karma_level(integer,integer,integer,integer,boolean,integer,boolean)',
    'kh_private.profile_visible(uuid,uuid)']) f;
select pg_temp.ops_assert(not has_table_privilege('authenticated','kh_private.verified_users','SELECT')
  and not has_table_privilege('anon','kh_private.verified_users','SELECT'),'verified_users is private');
rollback;
