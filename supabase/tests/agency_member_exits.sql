-- Leaving an agency and withdrawing an invitation. Everything rolls back.
-- G admin (…01), M manager (…02), P invited person (…03), X admin of another agency (…05). Agencies a1 and a2 are approved.
begin;
create function pg_temp.exit_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'EXIT ASSERTION: %',label; end if; end $$;
create function pg_temp.exit_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement; exception when others then
  if strpos(sqlerrm,expected)>0 then return; end if;
  raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
 end;
 raise exception 'EXIT ASSERTION: missing error %',expected;
end $$;
create function pg_temp.exit_as(actor uuid) returns void language plpgsql as $$
begin
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
-- Production already has the module on; there this matches no row.
update kh_private.agency_settings set enabled=true where singleton and not enabled;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
 select ('48000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'exit-'||n||'@example.invalid',now(),jsonb_build_object('display_name','Persona Salida '||n)
 from generate_series(1,5) n;
insert into kh_private.agencies(id,trade_name,state) values
 ('48000000-0000-4000-8000-0000000000a1','Casas Salida Ficticias','approved'),
 ('48000000-0000-4000-8000-0000000000a2','Otra Inmobiliaria Ficticia','approved');
insert into kh_private.agency_memberships(agency_id,user_id,role) values
 ('48000000-0000-4000-8000-0000000000a1','48000000-0000-4000-8000-000000000001','admin'),
 ('48000000-0000-4000-8000-0000000000a1','48000000-0000-4000-8000-000000000002','manager'),
 ('48000000-0000-4000-8000-0000000000a2','48000000-0000-4000-8000-000000000005','admin');
insert into kh_private.agency_invitations(id,agency_id,recipient_id,role,invited_by) values
 ('48000000-0000-4000-8000-0000000000c1','48000000-0000-4000-8000-0000000000a1','48000000-0000-4000-8000-000000000003','manager','48000000-0000-4000-8000-000000000001'),
 ('48000000-0000-4000-8000-0000000000c2','48000000-0000-4000-8000-0000000000a2','48000000-0000-4000-8000-000000000003','manager','48000000-0000-4000-8000-000000000005');

set local role authenticated;
-- The manager leaves; a replay of the same request returns its receipt, and afterwards there is nothing left to leave.
select pg_temp.exit_as('48000000-0000-4000-8000-000000000002');
select pg_temp.exit_assert((public.kh_leave_agency('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-0000000000a1',
 '{"expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000d1"}')->>'state')='removed','manager left');
select pg_temp.exit_assert((public.kh_leave_agency('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-0000000000a1',
 '{"expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000d1"}')->>'state')='removed','a retry after a lost response returns the receipt');
select pg_temp.exit_error($q$select public.kh_leave_agency('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-0000000000a1','{"expectedVersion":2,"clientRequestId":"48000000-0000-4000-8000-0000000000d2"}')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
-- The only admin cannot leave, nobody leaves for someone else, and an outsider has nothing to leave.
select pg_temp.exit_as('48000000-0000-4000-8000-000000000001');
select pg_temp.exit_error($q$select public.kh_leave_agency('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1','{"expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000d3"}')$q$,'KH_AGENCY_LAST_ADMIN');
select pg_temp.exit_error($q$select public.kh_leave_agency('48000000-0000-4000-8000-000000000002','48000000-0000-4000-8000-0000000000a1','{"expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000d4"}')$q$,'KH_ACCOUNT_CHANGED');
select pg_temp.exit_as('48000000-0000-4000-8000-000000000003');
select pg_temp.exit_error($q$select public.kh_leave_agency('48000000-0000-4000-8000-000000000003','48000000-0000-4000-8000-0000000000a1','{"expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000d5"}')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');

-- The admin withdraws the pending invitation once; another agency's invitation and a stale version are refused.
select pg_temp.exit_as('48000000-0000-4000-8000-000000000001');
select pg_temp.exit_error($q$select public.kh_cancel_agency_invitation('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1','{"invitationId":"48000000-0000-4000-8000-0000000000c2","expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000e1"}')$q$,'KH_AGENCY_INVALID');
select pg_temp.exit_error($q$select public.kh_cancel_agency_invitation('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1','{"invitationId":"48000000-0000-4000-8000-0000000000c1","expectedVersion":2,"clientRequestId":"48000000-0000-4000-8000-0000000000e2"}')$q$,'KH_AGENCY_VERSION_CONFLICT');
select pg_temp.exit_assert((public.kh_cancel_agency_invitation('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1',
 '{"invitationId":"48000000-0000-4000-8000-0000000000c1","expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000e3"}')->>'state')='cancelled','admin cancelled');
select pg_temp.exit_assert((public.kh_cancel_agency_invitation('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1',
 '{"invitationId":"48000000-0000-4000-8000-0000000000c1","expectedVersion":1,"clientRequestId":"48000000-0000-4000-8000-0000000000e3"}')->>'state')='cancelled','cancel replay returns the receipt');
select pg_temp.exit_assert(jsonb_array_length(public.kh_list_agency_sent_invitations('48000000-0000-4000-8000-000000000001','48000000-0000-4000-8000-0000000000a1')->'items')=0,'a cancelled invitation leaves the sent list');
-- The invited person can no longer accept it, and another agency's admin cannot touch it.
select pg_temp.exit_as('48000000-0000-4000-8000-000000000003');
select pg_temp.exit_error($q$select public.kh_decide_agency_invitation('48000000-0000-4000-8000-000000000003','{"invitationId":"48000000-0000-4000-8000-0000000000c1","accept":true,"expectedVersion":2,"clientRequestId":"48000000-0000-4000-8000-0000000000e4"}')$q$,'KH_AGENCY_VERSION_CONFLICT');
select pg_temp.exit_as('48000000-0000-4000-8000-000000000005');
select pg_temp.exit_error($q$select public.kh_cancel_agency_invitation('48000000-0000-4000-8000-000000000005','48000000-0000-4000-8000-0000000000a1','{"invitationId":"48000000-0000-4000-8000-0000000000c1","expectedVersion":2,"clientRequestId":"48000000-0000-4000-8000-0000000000e5"}')$q$,'KH_AGENCY_MEMBERSHIP_REQUIRED');
reset role;
select pg_temp.exit_assert((select state from kh_private.agency_memberships where agency_id='48000000-0000-4000-8000-0000000000a1' and user_id='48000000-0000-4000-8000-000000000002')='removed','membership row removed');
select pg_temp.exit_assert(not has_function_privilege('anon','public.kh_leave_agency(uuid,uuid,jsonb)','execute') and not has_function_privilege('anon','public.kh_cancel_agency_invitation(uuid,uuid,jsonb)','execute'),'anon cannot execute');
rollback;
