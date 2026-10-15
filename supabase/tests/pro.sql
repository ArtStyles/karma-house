-- KarmaHouse Pro: status, codes, redemption and owner administration. Everything rolls back.
-- O owner (…01), D admin (…02), A member (…03), B member (…04), R rate-limited (…05),
-- G agency admin (…06), M agency manager (…07). Agency a1 is approved, a2 is pending, a3 has a 120-character name.
begin;
create function pg_temp.pro_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'PRO ASSERTION: %',label; end if; end $$;
create function pg_temp.pro_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'PRO ASSERTION: missing error %',expected;
end $$;
create function pg_temp.pro_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data)
 select ('43000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pro-'||n||'@example.invalid',jsonb_build_object('display_name','Persona Pro '||n)
 from generate_series(1,7) n;
insert into kh_private.platform_owner(singleton,user_id) values(true,'43000000-0000-4000-8000-000000000001')
 on conflict(singleton) do update set user_id=excluded.user_id;
insert into public.kh_admins(user_id) values('43000000-0000-4000-8000-000000000002');
insert into kh_private.agencies(id,trade_name,state) values
 ('43000000-0000-4000-8000-0000000000a1','Casas Pro Ficticias','approved'),
 ('43000000-0000-4000-8000-0000000000a2','Agencia Pendiente Ficticia','pending'),
 ('43000000-0000-4000-8000-0000000000a3',rpad('Inmobiliaria Ficticia de Nombre Larguísimo ',120,'x'),'approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('43000000-0000-4000-8000-0000000000a1','43000000-0000-4000-8000-000000000006','admin'),
 ('43000000-0000-4000-8000-0000000000a1','43000000-0000-4000-8000-000000000007','manager');
create temporary table pro_ctx(free_code text,bound_code text,agency_code text,agency_bound text,expired_code text,cancel_code text,rate_code text,note_code text,first_until timestamptz);
insert into pro_ctx default values;
grant all on pro_ctx to authenticated;

set local role authenticated;
-- Only the protected owner creates codes, with valid days, a note and at most one recipient.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000003',30,'Pago de prueba')$q$,'KH_ADMIN_REQUIRED');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000002',30,'Pago de prueba')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_error($q$select public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000002',30,'Pago de prueba','43000000-0000-4000-8000-000000000003')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_error($q$select public.kh_admin_list_pro_accounts('43000000-0000-4000-8000-000000000002')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_error($q$select public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000002')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_error($q$select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000002',gen_random_uuid(),'Nota de prueba')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_error($q$select public.kh_admin_revoke_pro('43000000-0000-4000-8000-000000000002','Nota de prueba','43000000-0000-4000-8000-000000000003')$q$,'KH_OWNER_REQUIRED');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',0,'Pago de prueba')$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'no')$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago de prueba','43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-0000000000a1')$q$,'KH_PRO_INVALID');
update pro_ctx set
 free_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago libre de prueba')->>'code',
 bound_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',90,'Pago atado de prueba','43000000-0000-4000-8000-000000000004')->>'code',
 agency_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago inmobiliaria libre')->>'code',
 agency_bound=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',365,'Pago inmobiliaria atada',null,'43000000-0000-4000-8000-0000000000a1')->>'code',
 expired_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código que caducará')->>'code',
 cancel_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código que se anulará')->>'code',
 rate_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código para el límite')->>'code';
select pg_temp.pro_assert(free_code ~ '^KH-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$','codes use the unambiguous alphabet') from pro_ctx;

reset role;
-- Server normalization: case, dashes and the KH prefix of a 14-symbol input only.
select pg_temp.pro_assert(kh_private.pro_code_hash('khq4-x9tr-2plw')=sha256(convert_to('KHQ4X9TR2PLW','UTF8')),'a 12-symbol body that starts with KH keeps it');
select pg_temp.pro_assert(kh_private.pro_code_hash('KH-KHQ4-X9TR-2PLW')=sha256(convert_to('KHQ4X9TR2PLW','UTF8')),'the KH prefix of a 14-symbol input is dropped');
select pg_temp.pro_assert(kh_private.pro_code_hash('KH-7Q4M-X9TR-2PLW')=kh_private.pro_code_hash('7q4mx9tr2plw'),'with or without the KH prefix');
select pg_temp.pro_assert((select count(*)=1 from kh_private.pro_codes c,pro_ctx x where c.code_hash=sha256(convert_to(replace(substr(x.free_code,4),'-',''),'UTF8'))),'only the hash of the code body is stored');
update kh_private.pro_codes set expires_at=now()-interval '1 second' where code_hash=kh_private.pro_code_hash((select expired_code from pro_ctx));
set local role authenticated;

-- Redemption: lower case and spaces are fine, a retry adds nothing, a used code is refused.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',lower(replace(free_code,'-',' ')))->>'ok')::boolean,'a free code redeems in lower case and with spaces') from pro_ctx;
update pro_ctx set first_until=(public.kh_pro_status('43000000-0000-4000-8000-000000000003')->>'personalUntil')::timestamptz;
select pg_temp.pro_assert(first_until=now()+interval '30 days','thirty days of Pro') from pro_ctx;
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',free_code)->>'until')::timestamptz=first_until,'a retry by the same person succeeds without adding days') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',free_code)->>'error'='KH_PRO_CODE_INVALID','a used code fails for someone else') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',bound_code)->>'error'='KH_PRO_CODE_INVALID','a code bound to B fails for A') from pro_ctx;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',free_code||repeat(' ',60))->>'error'='KH_PRO_CODE_INVALID','over 64 characters fails, even around a code that would retry') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',bound_code,'43000000-0000-4000-8000-0000000000a1')->>'kind'='user','the bound account wins over a chosen agency') from pro_ctx;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',expired_code)->>'error'='KH_PRO_CODE_INVALID','an expired code fails') from pro_ctx;

-- Cancelling: only unused codes, and the list states every code.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',
 (select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Código que se anulará'),'Cliente desistió');
select pg_temp.pro_error($q$select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',(select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Código que se anulará'),'Otra vez')$q$,'KH_PRO_CODE_STATE');
select pg_temp.pro_error($q$select public.kh_admin_cancel_pro_code('43000000-0000-4000-8000-000000000001',(select (i->>'id')::uuid from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Pago libre de prueba'),'Ya usado')$q$,'KH_PRO_CODE_STATE');
select pg_temp.pro_assert((select jsonb_object_agg(i->>'note',i->>'state') from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i)
 @> '{"Pago libre de prueba":"redeemed","Código que caducará":"expired","Código que se anulará":"cancelled","Pago inmobiliaria libre":"unused"}','the list states every code');
select pg_temp.pro_assert((select i->>'cancelNote' from jsonb_array_elements(public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')->'items') i where i->>'note'='Código que se anulará')='Cliente desistió','the owner sees the cancel note');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000004',cancel_code)->>'error'='KH_PRO_CODE_INVALID','a cancelled code fails') from pro_ctx;

-- Agency codes: only an admin of an approved agency redeems them; days add up.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000007');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000007',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'error'='KH_PRO_CODE_INVALID','a manager cannot redeem for the agency') from pro_ctx;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000006');
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'kind'='agency','the agency admin redeems for the agency') from pro_ctx;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_bound)->>'kind'='agency','an agency-bound code needs no agency choice') from pro_ctx;
select pg_temp.pro_assert((select (a->>'until')::timestamptz=now()+interval '395 days' from jsonb_array_elements(public.kh_pro_status('43000000-0000-4000-8000-000000000006')->'agencies') a where a->>'id'='43000000-0000-4000-8000-0000000000a1'),'agency days add up: 30 + 365');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000007');
select pg_temp.pro_assert(jsonb_array_length(public.kh_pro_status('43000000-0000-4000-8000-000000000007')->'agencies')=1
 and public.kh_pro_status('43000000-0000-4000-8000-000000000007')->>'personalUntil' is null,'a manager sees the agency Pro, not a personal one');
-- A retry for an agency succeeds only while the person still administers it.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000006');
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'ok')::boolean,'the agency admin may retry') from pro_ctx;
reset role;
update kh_private.agency_memberships set role='manager' where user_id='43000000-0000-4000-8000-000000000006';
set local role authenticated;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000006',agency_code,'43000000-0000-4000-8000-0000000000a1')->>'error'='KH_PRO_CODE_INVALID','a former agency admin cannot retry') from pro_ctx;

reset role;
update kh_private.agency_memberships set role='admin' where user_id='43000000-0000-4000-8000-000000000006';
insert into kh_private.pro_status(agency_id,pro_until) values('43000000-0000-4000-8000-0000000000a2',now()+interval '30 days');
select pg_temp.pro_assert(kh_private.agency_pro_until('43000000-0000-4000-8000-0000000000a2') is null,'an agency that is not approved has no effective Pro');
set local role authenticated;

-- Five failures within an hour block the sixth try before the code is even read, even a valid one.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000005');
select public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000005','KH-2222-2222-222'||n) from generate_series(2,6) n;
select pg_temp.pro_assert(public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000005',rate_code)->>'error'='KH_PRO_CODE_RATE','the sixth try within an hour is refused') from pro_ctx;
reset role;
select pg_temp.pro_assert((select redeemed_at is null from kh_private.pro_codes where code_hash=kh_private.pro_code_hash((select rate_code from pro_ctx))),'a rate-limited valid code stays unused');
insert into kh_private.account_deletions(user_id) values('43000000-0000-4000-8000-000000000005');
set local role authenticated;
select pg_temp.pro_error($q$select public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000005','KH-2222-2222-2222')$q$,'KH_ACCOUNT_DELETING');

-- Direct grants add days; the list runs by expiry; revoking ends Pro once.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_assert((public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000001',90,'Renovación pagada','43000000-0000-4000-8000-000000000003')->>'until')::timestamptz=first_until+interval '90 days','a direct grant adds days to the current Pro') from pro_ctx;
select pg_temp.pro_error($q$select public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000001',30,'Sin destinatario')$q$,'KH_PRO_INVALID');
select pg_temp.pro_assert((select array_agg(i->>'id' order by o) from jsonb_array_elements(public.kh_admin_list_pro_accounts('43000000-0000-4000-8000-000000000001')->'items') with ordinality x(i,o))
 =array['43000000-0000-4000-8000-0000000000a2','43000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-0000000000a1'],'Pro accounts are listed by expiry');
select pg_temp.pro_assert((select i->>'note' from jsonb_array_elements(public.kh_admin_list_pro_accounts('43000000-0000-4000-8000-000000000001')->'items') i where i->>'id'='43000000-0000-4000-8000-000000000003')='Renovación pagada','the owner sees the note of a direct grant');
select pg_temp.pro_assert((select jsonb_object_agg(i->>'id',i->'effective') from jsonb_array_elements(public.kh_admin_list_pro_accounts('43000000-0000-4000-8000-000000000001')->'items') i)
 @> '{"43000000-0000-4000-8000-0000000000a2":false,"43000000-0000-4000-8000-0000000000a1":true,"43000000-0000-4000-8000-000000000003":true}','only an approved agency has effective Pro');
select public.kh_admin_revoke_pro('43000000-0000-4000-8000-000000000001','Devolución del pago','43000000-0000-4000-8000-000000000004');
select pg_temp.pro_error($q$select public.kh_admin_revoke_pro('43000000-0000-4000-8000-000000000001','Devolución del pago','43000000-0000-4000-8000-000000000004')$q$,'KH_PRO_NOT_ACTIVE');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert((public.kh_pro_status('43000000-0000-4000-8000-000000000004')->>'personalUntil')::timestamptz<=now(),'a revoked Pro has ended');
reset role;
select pg_temp.pro_assert((select note from kh_private.pro_status where user_id='43000000-0000-4000-8000-000000000004')='Devolución del pago','a revoke keeps its note for the owner');
set local role authenticated;

-- New days drop an old note: a new grant writes its own, a code leaves none.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_assert(public.kh_admin_grant_pro('43000000-0000-4000-8000-000000000001',30,'Nueva compra','43000000-0000-4000-8000-000000000004')->>'name'='Persona Pro 4','a grant returns the server name of its recipient');
update pro_ctx set note_code=public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Pago con nota previa')->>'code';
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert((public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003',note_code)->>'ok')::boolean,'A redeems one more code') from pro_ctx;
reset role;
select pg_temp.pro_assert((select note from kh_private.pro_status where user_id='43000000-0000-4000-8000-000000000004')='Nueva compra','a new grant replaces the refund note');
select pg_temp.pro_assert((select note from kh_private.pro_status where user_id='43000000-0000-4000-8000-000000000003') is null,'a redemption clears the old grant note');

-- 8 created, 1 cancelled, 5 redeemed, 2 granted, 1 revoked; retries are not audited.
select pg_temp.pro_assert((select count(*) from kh_private.admin_audit where action in('pro_code_created','pro_code_cancelled','pro_code_redeemed','pro_granted','pro_revoked'))=17,'every Pro action is in the history');
-- Every admin reads the history, so notes live only in owner-only places.
select pg_temp.pro_assert(not exists(select 1 from kh_private.admin_audit where action like 'pro\_%' and reason is not null),'Pro history rows carry no note');
select pg_temp.pro_assert((select cancel_note from kh_private.pro_codes where note='Código que se anulará')='Cliente desistió','a cancel keeps its note for the owner');

-- The owner screen reads its recipient from the server; created codes name theirs.
set local role authenticated;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000001');
select pg_temp.pro_assert(public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000003')
 =jsonb_build_object('kind','user','id','43000000-0000-4000-8000-000000000003','name','Persona Pro 3','until',first_until+interval '120 days','effective',true),'a person with Pro: 30 + 90 + 30 days') from pro_ctx;
select pg_temp.pro_assert(public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001',null,'43000000-0000-4000-8000-0000000000a2') @> '{"kind":"agency","name":"Agencia Pendiente Ficticia","effective":false}'
 and public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001',null,'43000000-0000-4000-8000-0000000000a2')->>'until' is not null,'a pending agency keeps its date without effect');
select pg_temp.pro_assert(public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001',null,'43000000-0000-4000-8000-0000000000a3')
 =jsonb_build_object('kind','agency','id','43000000-0000-4000-8000-0000000000a3','name',rpad('Inmobiliaria Ficticia de Nombre Larguísimo ',120,'x'),'until',null,'effective',false),'an agency without Pro');
select pg_temp.pro_assert(public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000004')->>'until' is not null,'a person granted again after a revoke');
select pg_temp.pro_error($q$select public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001',gen_random_uuid())$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001',null,gen_random_uuid())$q$,'KH_PRO_INVALID');
select pg_temp.pro_error($q$select public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000001')$q$,'KH_PRO_INVALID');
select pg_temp.pro_assert(public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código libre con nombre')->'name'='null'::jsonb,'a free code names no one');
select pg_temp.pro_assert(public.kh_admin_create_pro_code('43000000-0000-4000-8000-000000000001',30,'Código de nombre largo',null,'43000000-0000-4000-8000-0000000000a3')->>'name'
 =rpad('Inmobiliaria Ficticia de Nombre Larguísimo ',120,'x'),'a bound code returns the full server name');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000002');
select pg_temp.pro_error($q$select public.kh_admin_pro_subject('43000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000003')$q$,'KH_OWNER_REQUIRED');
reset role;
-- A deleted person or agency keeps an honest name; only a code bound to no one is «libre».
select pg_temp.pro_assert(kh_private.pro_subject_name(gen_random_uuid(),null)='Cuenta eliminada'
 and kh_private.pro_subject_name(null,gen_random_uuid())='Inmobiliaria eliminada'
 and kh_private.pro_subject_name(null,null)='Código libre','a missing subject is named for what it was');
-- Every admin client decodes history names up to 100 characters; trade names reach 120.
select pg_temp.pro_assert((select bool_and(char_length(target_name)<=100) and count(*)=1 from kh_private.admin_audit
 where target_id=(select id from kh_private.pro_codes where bound_agency_id='43000000-0000-4000-8000-0000000000a3')),'a long agency name fits the history');
-- The Pro mark of a listing comes from the stored row, never from the row passed in.
insert into public.properties(id,owner_id,client_request_id,title,location,province,price,bedrooms,description,operation,moderation)
 values('43000000-0000-4000-8000-0000000000b1','43000000-0000-4000-8000-000000000003','pro-listing-1','Anuncio Pro sintético','Vedado','La Habana',90000,2,'Busco una vivienda sintética de prueba.','wanted','pending');
-- Only A sees it (20261015000200_pro_private): Pro matters to whoever has it.
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_assert((select public.kh_is_pro(p) from public.properties p where p.id='43000000-0000-4000-8000-0000000000b1'),'a listing of A carries Pro for A');
select pg_temp.pro_as('43000000-0000-4000-8000-000000000004');
select pg_temp.pro_assert((select public.kh_is_pro(p) from public.properties p where p.id='43000000-0000-4000-8000-0000000000b1') is false,'nobody else sees the Pro of A');

-- Anonymous visitors see no Pro; private tables and someone else's status stay closed.
set local role anon;
select pg_temp.pro_as(null);
select pg_temp.pro_assert(public.kh_is_pro(jsonb_populate_record(null::public.properties,jsonb_build_object('id',gen_random_uuid(),'owner_id','43000000-0000-4000-8000-000000000003'))) is false,'a forged row gets no Pro mark although A has Pro');
select pg_temp.pro_error($q$select kh_private.property_pro_active(gen_random_uuid(),'43000000-0000-4000-8000-000000000003')$q$,'permission denied');
select pg_temp.pro_error($q$select public.kh_redeem_pro_code('43000000-0000-4000-8000-000000000003','KH-2222-2222-2222')$q$,'permission denied');
select pg_temp.pro_error($q$select public.kh_admin_list_pro_codes('43000000-0000-4000-8000-000000000001')$q$,'permission denied');
select pg_temp.pro_assert(public.kh_pro_badge('43000000-0000-4000-8000-000000000003') is false,'anon never learns who has Pro');
select pg_temp.pro_error($q$select public.kh_pro_status('43000000-0000-4000-8000-000000000003')$q$,'permission denied');
set local role authenticated;
select pg_temp.pro_as('43000000-0000-4000-8000-000000000003');
select pg_temp.pro_error($q$select * from kh_private.pro_codes$q$,'permission denied');
select pg_temp.pro_error($q$select * from kh_private.pro_status$q$,'permission denied');
select pg_temp.pro_error($q$select * from kh_private.pro_code_attempts$q$,'permission denied');
select pg_temp.pro_error($q$select public.kh_pro_status('43000000-0000-4000-8000-000000000004')$q$,'KH_ACCOUNT_CHANGED');
rollback;
