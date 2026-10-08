-- Foundation permissions are exercised against real PostgreSQL, not SQL text.
select pg_temp.kh_assert((select enabled=false from kh_private.agency_settings where singleton),'module defaults off');
select pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
select pg_temp.kh_error($sql$select kh_private.agency_actor('45000000-0000-4000-8000-000000000003','45000000-0000-4000-8001-000000000001','manager')$sql$,'KH_ACCOUNT_CHANGED');
select pg_temp.kh_error($sql$select kh_private.agency_actor('45000000-0000-4000-8000-000000000002','45000000-0000-4000-8001-000000000001','manager')$sql$,'KH_AGENCY_DISABLED');
update kh_private.agency_settings set enabled=true;
insert into kh_private.agencies(id,trade_name,state) values('45000000-0000-4000-8001-000000000001','Agency fixture','pending');
select pg_temp.kh_error($sql$select kh_private.agency_actor('45000000-0000-4000-8000-000000000002','45000000-0000-4000-8001-000000000001','manager')$sql$,'KH_AGENCY_NOT_APPROVED');
update kh_private.agencies set state='approved';
insert into kh_private.agency_memberships(agency_id,user_id,role) values('45000000-0000-4000-8001-000000000001','45000000-0000-4000-8000-000000000002','coordinator');
select pg_temp.kh_assert(kh_private.agency_actor(auth.uid(),'45000000-0000-4000-8001-000000000001','manager')=auth.uid(),'coordinator includes manager');
select pg_temp.kh_error($sql$select kh_private.agency_actor('45000000-0000-4000-8000-000000000002','45000000-0000-4000-8001-000000000001','admin')$sql$,'KH_AGENCY_ROLE_REQUIRED');
select pg_temp.kh_assert(not (kh_private.agency_summary('45000000-0000-4000-8001-000000000001')->>'verified')::boolean,'approval does not verify');
set local role authenticated;
select pg_temp.kh_error('select * from kh_private.agency_applications','permission denied');
select pg_temp.kh_error($sql$update kh_private.agencies set state='approved'$sql$,'permission denied');
reset role;
