-- Private organization authority. Account metadata never grants membership or verification.
create table kh_private.agency_settings(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into kh_private.agency_settings(singleton) values(true);
create table kh_private.agencies(
 id uuid primary key default gen_random_uuid(), trade_name text not null check(char_length(trade_name) between 2 and 120),
 state text not null default 'pending' check(state in('pending','needs_changes','approved','rejected','suspended')),
 version integer not null default 1 check(version>0), verification_version integer not null default 1 check(verification_version>0),
 logo_path text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table kh_private.agency_applications(
 agency_id uuid primary key references kh_private.agencies(id) on delete restrict,
 responsible_id uuid unique references auth.users(id) on delete set null,
 input jsonb not null default '{}',review_note text,submitted_at timestamptz,reviewed_by uuid,reviewed_at timestamptz
);
create table kh_private.agency_memberships(
 agency_id uuid not null references kh_private.agencies(id) on delete restrict,user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in('manager','coordinator','admin')),state text not null default 'active' check(state in('active','removed')),
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),primary key(agency_id,user_id)
);
create table kh_private.agency_verification_requests(
 id uuid primary key default gen_random_uuid(),agency_id uuid not null references kh_private.agencies(id) on delete restrict,
 input jsonb not null,state text not null default 'pending' check(state in('pending','needs_changes','approved','rejected','cancelled')),
 version integer not null default 1 check(version>0),review_note text,created_by uuid,created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz
);
create unique index agency_one_open_verification_request on kh_private.agency_verification_requests(agency_id) where state in('pending','needs_changes');
create table kh_private.agency_verifications(
 agency_id uuid primary key references kh_private.agencies(id) on delete restrict,active boolean not null default false,
 granted_by uuid,granted_at timestamptz,revoked_by uuid,revoked_at timestamptz,reason text not null
);
create table kh_private.agency_events(
 id uuid primary key default gen_random_uuid(),agency_id uuid references kh_private.agencies(id) on delete restrict,
 actor_id uuid,kind text not null,subject_id uuid,payload jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table kh_private.agency_write_receipts(
 actor_id uuid not null,scope_id uuid not null,operation text not null,request_id uuid not null,payload jsonb not null,result jsonb not null,
 created_at timestamptz not null default now(),primary key(actor_id,scope_id,operation,request_id)
);
create function kh_private.agency_lock(p_agency uuid) returns void language sql security definer set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('kh:agency:'||p_agency::text,0));
$$;
create function kh_private.agency_lock_many(p_agencies uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare a uuid;begin for a in select distinct unnest(p_agencies) order by 1 loop perform kh_private.agency_lock(a);end loop;end $$;
create function kh_private.agency_account(p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501';end if;
 perform kh_private.require_active();
 if not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null) then raise exception 'KH_EMAIL_UNCONFIRMED' using errcode='42501';end if;
 if exists(select 1 from kh_private.account_deletions where user_id=p_actor) then raise exception 'KH_ACCOUNT_DELETING' using errcode='42501';end if;
 return p_actor;
end $$;
-- Operations share this lock; explicit disable takes it exclusively before cancellation.
create function kh_private.agency_require_enabled() returns void language plpgsql security definer set search_path='' as $$
declare live boolean;begin
 perform pg_advisory_xact_lock_shared(hashtextextended('kh:agency:module',0));
 select enabled into live from kh_private.agency_settings where singleton for share;
 if not coalesce(live,false) then raise exception 'KH_AGENCY_DISABLED';end if;
end $$;
-- Read authority deliberately has no approval/module liveness requirement.
create function kh_private.agency_reader(actor uuid,agency uuid,minimum_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare r text;begin
 perform kh_private.agency_account(actor);
 select role into r from kh_private.agency_memberships where agency_id=agency and user_id=actor and state='active';
 if r is null then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED' using errcode='42501';end if;
 if minimum_role not in('manager','coordinator','admin') or array_position(array['manager','coordinator','admin'],r)<array_position(array['manager','coordinator','admin'],minimum_role) then raise exception 'KH_AGENCY_ROLE_REQUIRED' using errcode='42501';end if;
 return actor;
end $$;
revoke all on function kh_private.agency_require_enabled(),kh_private.agency_reader(uuid,uuid,text) from public,anon,authenticated;
create function kh_private.agency_actor(actor uuid,agency uuid,minimum_role text) returns uuid language plpgsql security definer set search_path='' as $$
declare r text;begin
 perform kh_private.agency_account(actor);
 if not (select enabled from kh_private.agency_settings where singleton) then raise exception 'KH_AGENCY_DISABLED';end if;
 perform kh_private.agency_lock(agency);
 if not exists(select 1 from kh_private.agencies where id=agency and state='approved') then raise exception 'KH_AGENCY_NOT_APPROVED';end if;
 select role into r from kh_private.agency_memberships where agency_id=agency and user_id=actor and state='active';
 if r is null then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED' using errcode='42501';end if;
 if minimum_role not in('manager','coordinator','admin') or array_position(array['manager','coordinator','admin'],r)<array_position(array['manager','coordinator','admin'],minimum_role) then raise exception 'KH_AGENCY_ROLE_REQUIRED' using errcode='42501';end if;
 return actor;
end $$;
create function kh_private.agency_summary(p_agency uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'tradeName',a.trade_name,'state',a.state,'version',a.version,'logoPath',a.logo_path,
 'verified',a.state='approved' and coalesce(v.active,false),'verificationVersion',a.verification_version)
 from kh_private.agencies a left join kh_private.agency_verifications v on v.agency_id=a.id where a.id=p_agency;
$$;
create function kh_private.agency_receipt(p_actor uuid,p_scope uuid,p_operation text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r kh_private.agency_write_receipts;request uuid;begin
 begin request:=(p_payload->>'clientRequestId')::uuid;exception when others then raise exception 'KH_AGENCY_INVALID_REQUEST';end;
 if request is null then raise exception 'KH_AGENCY_INVALID_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:agency-receipt:'||p_actor::text||':'||p_scope::text||':'||p_operation||':'||request::text,0));
 select * into r from kh_private.agency_write_receipts where actor_id=p_actor and scope_id=p_scope and operation=p_operation and request_id=request;
 if found then if r.payload is distinct from p_payload then raise exception 'KH_AGENCY_REQUEST_CONFLICT';end if;return r.result;end if;
 return null;
end $$;
create function kh_private.agency_remember(p_actor uuid,p_scope uuid,p_operation text,p_payload jsonb,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin insert into kh_private.agency_write_receipts(actor_id,scope_id,operation,request_id,payload,result) values(p_actor,p_scope,p_operation,(p_payload->>'clientRequestId')::uuid,p_payload,p_result);return p_result;end $$;
create function public.kh_agency_capabilities(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.agency_account(p_actor_id);return jsonb_build_object('enabled',(select enabled from kh_private.agency_settings where singleton));end $$;
do $$ declare t text;begin
 foreach t in array array['agency_settings','agencies','agency_applications','agency_memberships','agency_verification_requests','agency_verifications','agency_events','agency_write_receipts'] loop
 execute format('alter table kh_private.%I enable row level security',t);
 execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
 execute format('grant all on kh_private.%I to service_role',t);
 end loop;
end $$;
revoke all on function kh_private.agency_lock(uuid),kh_private.agency_lock_many(uuid[]),kh_private.agency_account(uuid),kh_private.agency_actor(uuid,uuid,text),kh_private.agency_summary(uuid),kh_private.agency_receipt(uuid,uuid,text,jsonb),kh_private.agency_remember(uuid,uuid,text,jsonb,jsonb),public.kh_agency_capabilities(uuid) from public,anon,authenticated;
grant execute on function public.kh_agency_capabilities(uuid) to authenticated;
