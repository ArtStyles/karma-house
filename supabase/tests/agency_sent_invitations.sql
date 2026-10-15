-- Sent invitations: only an agency admin lists them, and only pending, unexpired ones. Everything rolls back.
-- G admin (…01), M manager (…02), P invited person (…03), Q second invited person (…04), X outsider (…05).
begin;
create function pg_temp.sent_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'SENT ASSERTION: %',label; end if; end $$;
create function pg_temp.sent_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'SENT ASSERTION: missing error %',expected;
end $$;
create function pg_temp.sent_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('47000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'sent-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Invitada '||n)
 from generate_series(1,5) n;
insert into kh_private.agencies(id,trade_name,state) values('47000000-0000-4000-8000-0000000000a1','Casas Invitadas Ficticias','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('47000000-0000-4000-8000-0000000000a1','47000000-0000-4000-8000-000000000001','admin'),
 ('47000000-0000-4000-8000-0000000000a1','47000000-0000-4000-8000-000000000002','manager');
insert into kh_private.agency_invitations(agency_id,recipient_id,role,invited_by) values
 ('47000000-0000-4000-8000-0000000000a1','47000000-0000-4000-8000-000000000003','manager','47000000-0000-4000-8000-000000000001');
insert into kh_private.agency_invitations(agency_id,recipient_id,role,invited_by,state) values
 ('47000000-0000-4000-8000-0000000000a1','47000000-0000-4000-8000-000000000004','coordinator','47000000-0000-4000-8000-000000000001','declined');

set local role authenticated;
select pg_temp.sent_as('47000000-0000-4000-8000-000000000001');
select pg_temp.sent_assert(
 (select jsonb_array_length(r->'items')=1 and r->'items'->0->>'recipientId'='47000000-0000-4000-8000-000000000003'
  and r->'items'->0->>'recipientName'='Persona Invitada 3' and r->'items'->0->>'role'='manager' and r->'items'->0->>'state'='pending'
  and r->'items'->0->>'agencyName'='Casas Invitadas Ficticias' and (r->>'hasMore')::boolean=false
  from (select public.kh_list_agency_sent_invitations('47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-0000000000a1') r) s),
 'admin lists the pending invitation only');
-- A manager, an outsider and someone acting for another account cannot list them.
select pg_temp.sent_as('47000000-0000-4000-8000-000000000002');
select pg_temp.sent_error($q$select public.kh_list_agency_sent_invitations('47000000-0000-4000-8000-000000000002','47000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_ROLE_REQUIRED');
select pg_temp.sent_as('47000000-0000-4000-8000-000000000005');
select pg_temp.sent_error($q$select public.kh_list_agency_sent_invitations('47000000-0000-4000-8000-000000000005','47000000-0000-4000-8000-0000000000a1')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
select pg_temp.sent_error($q$select public.kh_list_agency_sent_invitations('47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-0000000000a1')$q$,'KH_ACCOUNT_CHANGED');
reset role;
-- An expired invitation is no longer waiting.
update kh_private.agency_invitations set expires_at=now()-interval '1 minute' where recipient_id='47000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.sent_as('47000000-0000-4000-8000-000000000001');
select pg_temp.sent_assert(
 (select jsonb_array_length(public.kh_list_agency_sent_invitations('47000000-0000-4000-8000-000000000001','47000000-0000-4000-8000-0000000000a1')->'items')=0),
 'expired invitations are hidden');
reset role;
select pg_temp.sent_assert(not has_function_privilege('anon','public.kh_list_agency_sent_invitations(uuid,uuid,integer,integer)','execute'),'anon cannot execute');
rollback;
