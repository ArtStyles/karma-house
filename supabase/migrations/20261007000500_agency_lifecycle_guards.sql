-- Account lifecycle, private historical identities and legacy authority guards.
-- The live personal listing still disappears normally. Only business references
-- retain a minimal identity; a retired UUID can never become a new listing.
create table kh_private.agency_property_identities(
 property_id uuid primary key, personal_source_id uuid, title text, location text,
 withdrawn_at timestamptz, check(withdrawn_at is null or personal_source_id is not null)
);
alter table kh_private.agency_property_identities enable row level security;
revoke all on kh_private.agency_property_identities from public,anon,authenticated;
grant all on kh_private.agency_property_identities to service_role;
insert into kh_private.agency_property_identities(property_id)select id from public.properties;
create function kh_private.register_agency_property_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.agency_property_identities where property_id=new.id) then raise exception 'KH_PROPERTY_IDENTITY_RETIRED';end if;
 insert into kh_private.agency_property_identities(property_id)values(new.id);return new;
end $$;
create trigger kh_agency_identity_insert before insert on public.properties for each row execute function kh_private.register_agency_property_identity();
alter table kh_private.commercial_cycles add column termination_reason text;
do $$ declare spec record;begin
 for spec in select * from(values
 ('agency_mandates','property_id'),('commercial_cycles','property_id'),('agency_mandate_requests','property_id'),
 ('agency_property_changes','property_id'),('property_aliases','property_id'),('property_aliases','canonical_id'))v(tab,col) loop
 execute format('alter table kh_private.%I drop constraint %I',spec.tab,spec.tab||'_'||spec.col||'_fkey');
 execute format('alter table kh_private.%I add constraint %I foreign key(%I) references kh_private.agency_property_identities(property_id) on delete restrict',spec.tab,spec.tab||'_'||spec.col||'_fkey',spec.col);
 end loop;
end $$;

create function kh_private.property_has_business_history(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agency_property_origins where property_id=pid)
 or exists(select 1 from kh_private.agency_mandates where property_id=pid)
 or exists(select 1 from kh_private.commercial_cycles where property_id=pid)
 or exists(select 1 from kh_private.agency_mandate_requests where property_id=pid)
 or exists(select 1 from kh_private.agency_property_changes where property_id=pid)
 or exists(select 1 from kh_private.property_aliases where property_id=pid or canonical_id=pid)
$$;
-- Discover the shared/alias participants before taking property row locks.
create function kh_private.agency_lifecycle_lock_set(p_agencies uuid[],p_properties uuid[] default '{}') returns uuid[] language sql stable security definer set search_path='' as $$
 with affected as (
  select unnest(p_properties) pid union select property_id from kh_private.agency_mandates where agency_id=any(p_agencies)
  union select property_id from kh_private.agency_property_origins where origin_agency_id=any(p_agencies)
  union select property_id from kh_private.agency_mandate_requests where agency_id=any(p_agencies)
 ), graph as (
  select pid from affected union select property_id from kh_private.property_aliases where canonical_id in(select pid from affected)
  union select canonical_id from kh_private.property_aliases where property_id in(select pid from affected)
 ), participants as (
  select unnest(p_agencies) agency union select agency_id from kh_private.agency_mandates where property_id in(select pid from graph)
  union select agency_id from kh_private.agency_mandate_requests where property_id in(select pid from graph)
  union select agency_id from kh_private.agency_property_changes where property_id in(select pid from graph)
  union select origin_agency_id from kh_private.agency_property_origins where property_id in(select pid from graph)
 ) select coalesce(array_agg(agency order by agency)filter(where agency is not null),'{}') from participants
$$;
create function kh_private.guard_agency_subject_source() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.properties where id=new.property_id)
 or exists(select 1 from kh_private.agency_property_origins o join kh_private.agencies a on a.id=o.origin_agency_id where o.property_id=new.property_id and a.state<>'approved') then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;return new;
end $$;
create trigger kh_agency_change_source before insert on kh_private.agency_property_changes for each row execute function kh_private.guard_agency_subject_source();
create trigger kh_agency_request_source before insert on kh_private.agency_mandate_requests for each row execute function kh_private.guard_agency_subject_source();
create function kh_private.withdraw_personal_property() returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid;begin
 if exists(select 1 from kh_private.agency_property_origins where property_id=old.id) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 if not kh_private.property_has_business_history(old.id) then
  delete from kh_private.agency_property_identities where property_id=old.id;return old;
 end if;
 perform kh_private.agency_lock_many((select array_agg(agency_id) from(
 select agency_id from kh_private.agency_mandates where property_id=old.id union
 select agency_id from kh_private.agency_mandate_requests where property_id=old.id union
 select agency_id from kh_private.agency_property_changes where property_id=old.id)x));
 for a in select agency_id from kh_private.agency_mandates where property_id=old.id union
 select agency_id from kh_private.agency_mandate_requests where property_id=old.id union
 select agency_id from kh_private.agency_property_changes where property_id=old.id loop
  perform kh_private.terminate_mandate_flows(old.id,a,'personal_source_deleted');
  insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(a,old.owner_id,'personal_source_deleted',old.id);
 end loop;
 update kh_private.agency_mandates set state='withdrawn',version=version+1 where property_id=old.id and state='active';
 update kh_private.commercial_cycles set state='closed',termination_reason='personal_source_deleted',version=version+1 where property_id=old.id and state='open';
 update kh_private.agency_property_identities set personal_source_id=old.owner_id,title=old.title,location=concat_ws(', ',old.location,old.province),withdrawn_at=clock_timestamp() where property_id=old.id;
 return old;
end $$;
create trigger kh_agency_00_personal_delete before delete on public.properties for each row execute function kh_private.withdraw_personal_property();

-- Future deal/scheduling tasks extend this hook, retaining their historical IDs.
create function kh_private.terminate_agency_member_flows(p_agency_id uuid,p_user_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,auth.uid(),'member_detached',p_user_id,jsonb_build_object('reason',p_reason));
end $$;
create function kh_private.agency_member_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.state='active' and (tg_op='DELETE' or new.state='removed') then perform kh_private.terminate_agency_member_flows(old.agency_id,old.user_id,'membership_removed');end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger kh_agency_member_lifecycle after update or delete on kh_private.agency_memberships for each row execute function kh_private.agency_member_lifecycle();

-- Internal pause permits are private, transaction-bound, and authorize exactly
-- active -> paused, version+1 and updated_at, even without an authenticated actor.
create function kh_private.lifecycle_pause_permitted(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=pid and purpose='lifecycle_pause')
$$;
create or replace function kh_private.guard_agency_property_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if kh_private.lifecycle_pause_permitted(old.id) and tg_op='UPDATE' then
  if new.availability<>'paused' or old.availability<>'active' or new.version<>old.version+1
   or (to_jsonb(new)-array['availability','version','updated_at','search_text','search_vector']) is distinct from (to_jsonb(old)-array['availability','version','updated_at','search_text','search_vector']) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 elsif exists(select 1 from kh_private.agency_property_origins where property_id=old.id)
 and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid()) then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 if tg_op='UPDATE' then
  if new.owner_id is distinct from old.owner_id and kh_private.property_has_business_history(old.id) then raise exception 'KH_AGENCY_SOURCE_IMMUTABLE';end if;
  if old.availability='sold' and new.availability<>'sold' and kh_private.property_has_business_history(old.id) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
  if new.availability='sold' and old.availability<>'sold' and kh_private.property_has_business_history(old.id)
   and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid() and purpose='sale') then raise exception 'KH_AGENCY_CONTEXT_REQUIRED';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function kh_private.guard_account_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='properties' then
  if tg_op='UPDATE' and kh_private.lifecycle_pause_permitted(new.id) then return new;end if;
 end if;
 if auth.uid() is not null then perform kh_private.require_active();end if;
 if tg_table_name='properties' then
  if not exists(select 1 from kh_private.agency_property_origins where property_id=new.id) and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=new.id) and new.owner_id=auth.uid() and kh_private.is_owner(auth.uid()) and new.moderation='pending' then new.moderation:='approved';new.review_note:=null;end if;
 end if;return new;
end $$;
create or replace function kh_private.guard_property_alias_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.property_aliases where property_id=old.id)
 and not(tg_op='DELETE' and exists(select 1 from kh_private.agency_property_identities where property_id=old.id and withdrawn_at is not null and personal_source_id=old.owner_id))
 and not exists(select 1 from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=old.id and actor_id=auth.uid() and purpose='merge') then raise exception 'KH_PROPERTY_ALIAS_READ_ONLY';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create or replace function kh_private.guard_assisted_consent() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='UPDATE' and kh_private.lifecycle_pause_permitted(new.id) then return new;end if;
 if auth.uid() is not null and kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
 if new.moderation<>'draft' and exists(select 1 from kh_private.assisted_listing_records r join kh_private.assisted_collaborators c on c.id=r.collaborator_id where r.property_id=new.id and (not kh_private.assisted_record_complete(r) or new.availability='active' and (r.consent_revoked_at is not null or c.state<>'active'))) then raise exception 'KH_ASSISTED_CONSENT_REQUIRED';end if;
 return new;
end $$;

create function kh_private.agency_suspend_operations(p_agency_id uuid,p_actor_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid;a uuid;prop public.properties;begin
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(array[p_agency_id]));
 update kh_private.agency_invitations set state='cancelled',version=version+1 where agency_id=p_agency_id and state='pending';
 update kh_private.agency_verification_requests set state='cancelled',version=version+1,review_note=p_reason,reviewed_by=p_actor_id,reviewed_at=now() where agency_id=p_agency_id and state in('pending','needs_changes');
 update kh_private.agency_verifications set active=false,reason=p_reason,revoked_by=p_actor_id,revoked_at=now() where agency_id=p_agency_id and active;
 for prop in select p.* from public.properties p join kh_private.agency_property_origins o on o.property_id=p.id where o.origin_agency_id=p_agency_id order by p.id for update of p loop
  if prop.availability='active' then
   insert into kh_private.agency_property_write_permits values(txid_current(),prop.id,coalesce(p_actor_id,(select publisher_id from kh_private.agency_property_origins where property_id=prop.id)),prop.client_request_id,'lifecycle_pause');
   update public.properties set availability='paused',version=version+1,updated_at=now() where id=prop.id;
   delete from kh_private.agency_property_write_permits where transaction_id=txid_current() and property_id=prop.id;
  end if;
  -- Include historical aliases: carried authorizations keep their subject UUIDs.
  for pid in select prop.id union select property_id from kh_private.property_aliases where canonical_id=prop.id loop
   for a in select agency_id from kh_private.agency_mandates where property_id=pid union select agency_id from kh_private.agency_mandate_requests where property_id=pid loop
    perform kh_private.terminate_mandate_flows(pid,a,'origin_agency_suspended');
   end loop;
  end loop;
 end loop;
 for pid in select property_id from kh_private.agency_mandates m where m.agency_id=p_agency_id and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=m.property_id and o.origin_agency_id=p_agency_id)
 union select property_id from kh_private.agency_mandate_requests where agency_id=p_agency_id loop
  perform kh_private.terminate_mandate_flows(pid,p_agency_id,'agency_suspended');
  update kh_private.agency_mandates set state='withdrawn',version=version+1 where property_id=pid and agency_id=p_agency_id and state='active' and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=pid and o.origin_agency_id=p_agency_id);
 end loop;
end $$;
create function kh_private.agency_state_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.state='suspended' and old.state<>'suspended' then perform kh_private.agency_suspend_operations(new.id,auth.uid(),'agency_suspended');end if;return new;
end $$;
create trigger kh_agency_state_lifecycle after update of state on kh_private.agencies for each row execute function kh_private.agency_state_lifecycle();

create function kh_private.agency_detach_account(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a uuid;begin
 if kh_private.is_owner(p_user_id) then raise exception 'KH_OWNER_PROTECTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||p_user_id::text,0));
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(
 (select coalesce(array_agg(distinct agency_id),'{}') from kh_private.agency_memberships where user_id=p_user_id),
 (select coalesce(array_agg(id),'{}') from public.properties where owner_id=p_user_id)));
 for a in select agency_id from kh_private.agency_memberships where user_id=p_user_id and state='active' order by agency_id loop
  update kh_private.agency_memberships set state='removed',version=version+1 where agency_id=a and user_id=p_user_id;
  if not exists(select 1 from kh_private.agency_memberships m join auth.users u on u.id=m.user_id where m.agency_id=a and m.state='active' and m.role='admin' and u.email_confirmed_at is not null and not kh_private.is_suspended(u.id) and not kh_private.is_deleting(u.id)) then
   update kh_private.agencies set state='suspended',version=version+1,verification_version=verification_version+1,updated_at=now() where id=a and state<>'suspended';
   -- A previously suspended agency still requires complete integrity cleanup.
   perform kh_private.agency_suspend_operations(a,p_user_id,'last_admin_deleted');
   insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(a,p_user_id,'agency_recovery_required',p_user_id,jsonb_build_object('reason','last_admin_deleted'));
  end if;
 end loop;
 update kh_private.agency_invitations set state='cancelled',version=version+1 where recipient_id=p_user_id and state='pending';
end $$;
create function kh_private.agency_before_auth_delete() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_detach_account(old.id);
 -- Delete explicitly before the profile cascade so archival triggers see the source.
 delete from public.properties where owner_id=old.id;
 insert into kh_private.media_cleanup_jobs(path,reason)
 select name,'account_deleted' from storage.objects o where bucket_id='property-photos' and starts_with(name,old.id::text||'/') and kh_private.media_unassigned(name)
 and not exists(select 1 from public.properties p where o.name=any(p.photo_paths) or o.name=p.cover_thumb_path) on conflict do nothing;
 return old;
end $$;
create trigger kh_agency_before_auth_delete before delete on auth.users for each row execute function kh_private.agency_before_auth_delete();
create or replace function public.kh_begin_account_deletion(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED';end if;
 if kh_private.is_owner(p_actor_id) then raise exception 'KH_OWNER_PROTECTED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||p_actor_id::text,0));
 insert into kh_private.account_deletions(user_id)values(p_actor_id)on conflict do nothing;
 perform kh_private.agency_detach_account(p_actor_id);
 return kh_private.begin_account_deletion(p_actor_id);
end $$;

create function public.kh_admin_recover_agency(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(p_payload->>'agencyId')::uuid;replacement uuid:=(p_payload->>'newAdminId')::uuid;reason text;receipt jsonb;begin
 perform kh_private.admin_actor(p_actor_id,true);
 if kh_private.is_deleting(p_actor_id) then raise exception 'KH_ACCOUNT_DELETING';end if;
 perform kh_private.agency_lock_accounts(p_actor_id,replacement);perform kh_private.agency_lock(a);
 receipt:=kh_private.agency_receipt(p_actor_id,a,'recover_agency',p_payload);if receipt is not null then return kh_private.agency_summary(a);end if;
 reason:=kh_private.agency_text(p_payload->'reason',10,1000);
 if not exists(select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=replacement and u.email_confirmed_at is not null) or kh_private.is_suspended(replacement) or kh_private.is_deleting(replacement) then raise exception 'KH_AGENCY_RECIPIENT_INVALID';end if;
 if not exists(select 1 from kh_private.agencies where id=a and state='suspended' and version=(p_payload->>'expectedVersion')::integer) then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,replacement,'admin')on conflict(agency_id,user_id)do update set state='active',role='admin',version=agency_memberships.version+1;
 update kh_private.agencies set state='approved',version=version+1,updated_at=now() where id=a;
 update kh_private.agency_applications set review_note=reason,reviewed_by=p_actor_id,reviewed_at=now() where agency_id=a;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(a,p_actor_id,'agency_recovered',replacement,jsonb_build_object('reason',reason,'previousVersion',(p_payload->>'expectedVersion')::integer,'version',(select version from kh_private.agencies where id=a)));
 return kh_private.agency_remember(p_actor_id,a,'recover_agency',p_payload,kh_private.agency_summary(a));
end $$;

-- Initial approval must not bypass the explicit recovery contract.
alter function public.kh_review_agency(uuid,jsonb) rename to kh_review_agency_before_lifecycle;
alter function public.kh_review_agency_before_lifecycle(uuid,jsonb) set schema kh_private;
revoke all on function kh_private.kh_review_agency_before_lifecycle(uuid,jsonb) from public,anon,authenticated;
create function public.kh_review_agency(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=(p_payload->>'agencyId')::uuid;target uuid;begin
 perform kh_private.admin_actor(p_actor_id,true);
 select responsible_id into target from kh_private.agency_applications where agency_id=a;
 if target is not null then perform pg_advisory_xact_lock(hashtextextended('kh:account:'||target::text,0));end if;
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(array[a]));
 if p_payload->>'decision'='approve' and exists(select 1 from kh_private.agencies where id=a and state='suspended') then raise exception 'KH_AGENCY_RECOVERY_REQUIRED';end if;
 return kh_private.kh_review_agency_before_lifecycle(p_actor_id,p_payload);
end $$;
revoke all on function public.kh_review_agency(uuid,jsonb),public.kh_admin_recover_agency(uuid,jsonb) from public,anon;
grant execute on function public.kh_review_agency(uuid,jsonb),public.kh_admin_recover_agency(uuid,jsonb) to authenticated;
revoke all on function kh_private.register_agency_property_identity(),kh_private.property_has_business_history(uuid),kh_private.withdraw_personal_property(),kh_private.terminate_agency_member_flows(uuid,uuid,text),kh_private.agency_member_lifecycle(),kh_private.lifecycle_pause_permitted(uuid),kh_private.agency_suspend_operations(uuid,uuid,text),kh_private.agency_state_lifecycle(),kh_private.agency_detach_account(uuid),kh_private.agency_before_auth_delete() from public,anon,authenticated;
revoke all on function kh_private.agency_lifecycle_lock_set(uuid[],uuid[]),kh_private.guard_agency_subject_source() from public,anon,authenticated;

-- Re-evaluated by the old accept RPC after its property locks, including offers
-- created before a mandate/origin existed. Accepted historical receipts survive.
alter function kh_private.transfer_reason(uuid) rename to transfer_reason_before_agencies;
create function kh_private.transfer_reason(p_id uuid) returns text language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from kh_private.listing_transfer_requests r join kh_private.listing_transfer_items i on i.request_id=r.id where r.id=p_id and r.state='pending' and kh_private.property_has_business_history(i.property_id)) then return 'KH_TRANSFER_INELIGIBLE';end if;
 return kh_private.transfer_reason_before_agencies(p_id);
end $$;
revoke all on function kh_private.transfer_reason(uuid),kh_private.transfer_reason_before_agencies(uuid) from public,anon,authenticated;
