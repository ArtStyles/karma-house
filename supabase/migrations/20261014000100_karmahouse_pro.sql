-- KarmaHouse Pro v1 (docs/superpowers/specs/2026-10-14-karmahouse-pro-design.md).
-- Pro per account or agency, single-use codes, weekly bump and price history.
-- Payment happens outside the app; nothing here charges anyone.

-- 1. Pro status and codes ---------------------------------------------------------------
create table kh_private.pro_status(
 user_id uuid unique references auth.users(id) on delete cascade,
 agency_id uuid unique references kh_private.agencies(id) on delete cascade,
 pro_until timestamptz not null,
 note text check(note is null or char_length(note) between 3 and 500), -- owner note of the last direct grant or revoke; new days clear it
 updated_at timestamptz not null default now(),
 check(num_nonnulls(user_id,agency_id)=1)
);
create table kh_private.pro_codes(
 id uuid primary key default gen_random_uuid(),
 code_hash bytea not null unique,
 days integer not null check(days between 1 and 365),
 note text not null check(char_length(note) between 3 and 500),
 bound_user_id uuid references auth.users(id) on delete cascade,
 bound_agency_id uuid references kh_private.agencies(id) on delete cascade,
 created_by uuid not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 cancelled_at timestamptz,
 cancel_note text check(cancel_note is null or char_length(cancel_note) between 3 and 500),
 redeemed_by uuid references auth.users(id) on delete set null,
 redeemed_user_id uuid references auth.users(id) on delete set null,
 redeemed_agency_id uuid references kh_private.agencies(id) on delete set null,
 redeemed_at timestamptz,
 check(num_nonnulls(bound_user_id,bound_agency_id)<=1)
);
-- ponytail: failed attempts are never purged; one row per failure is tiny. Purge rows older
-- than a day from a scheduled job if the table ever grows.
create table kh_private.pro_code_attempts(
 user_id uuid not null references auth.users(id) on delete cascade,
 attempted_at timestamptz not null default clock_timestamp()
);
create index pro_code_attempts_recent on kh_private.pro_code_attempts(user_id,attempted_at);
do $$ declare t text; begin
 foreach t in array array['pro_status','pro_codes','pro_code_attempts'] loop
  execute format('alter table kh_private.%I enable row level security',t);
  execute format('revoke all on kh_private.%I from public,anon,authenticated',t);
  execute format('grant all on kh_private.%I to service_role',t);
 end loop;
end $$;

-- Only a 14-symbol input carries the KH prefix: a 12-symbol body may itself start with KH.
create function kh_private.pro_code_hash(p_code text) returns bytea language sql immutable set search_path='' as $$
 select pg_catalog.sha256(convert_to(case when char_length(c)=14 and left(c,2)='KH' then substr(c,3) else c end,'UTF8'))
 from (select regexp_replace(upper(coalesce(p_code,'')),'[^0-9A-Z]','','g') c) n
$$;
-- 12 symbols from a 32-symbol alphabet without 0, O, 1 or I: 60 random bits. The first byte of a
-- v4 UUID is fully random and 256 is a multiple of 32, so every symbol is uniform.
create function kh_private.pro_new_code() returns text language sql volatile set search_path='' as $$
 select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',get_byte(uuid_send(gen_random_uuid()),0)%32+1,1),'' order by i)
 from generate_series(1,12) i
$$;
create function kh_private.user_pro_until(p_user uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select pro_until from kh_private.pro_status where user_id=p_user
$$;
-- A suspended or pending agency keeps its date but has no effective Pro until approved again.
create function kh_private.agency_pro_until(p_agency uuid) returns timestamptz language sql stable security definer set search_path='' as $$
 select s.pro_until from kh_private.pro_status s join kh_private.agencies a on a.id=s.agency_id
 where s.agency_id=p_agency and a.state='approved'
$$;
-- Agency Pro covers what that agency published; personal Pro covers the owner's other listings.
-- Private: it trusts its arguments, so clients reach it only through public.kh_is_pro.
create function kh_private.property_pro_active(p_property uuid,p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(case when o.origin_agency_id is null then kh_private.user_pro_until(p_owner)
  else kh_private.agency_pro_until(o.origin_agency_id) end>now(),false)
 from (select (select origin_agency_id from kh_private.agency_property_origins where property_id=p_property) origin_agency_id) o
$$;
-- Every extension drops the old owner note; a direct grant writes its own note afterwards.
create function kh_private.extend_pro(p_user uuid,p_agency uuid,p_days integer) returns timestamptz language plpgsql security definer set search_path='' as $$
declare v timestamptz;
begin
 if num_nonnulls(p_user,p_agency)<>1 or p_days is null or p_days not between 1 and 365 then raise exception 'KH_PRO_INVALID'; end if;
 if p_user is not null then
  insert into kh_private.pro_status as s(user_id,pro_until) values(p_user,now()+make_interval(days=>p_days))
  on conflict(user_id) do update set pro_until=greatest(now(),s.pro_until)+make_interval(days=>p_days),note=null,updated_at=now()
  returning s.pro_until into v;
 else
  insert into kh_private.pro_status as s(agency_id,pro_until) values(p_agency,now()+make_interval(days=>p_days))
  on conflict(agency_id) do update set pro_until=greatest(now(),s.pro_until)+make_interval(days=>p_days),note=null,updated_at=now()
  returning s.pro_until into v;
 end if;
 return v;
end $$;
create function kh_private.pro_subject_name(p_user uuid,p_agency uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select display_name from public.profiles where id=p_user),(select trade_name from kh_private.agencies where id=p_agency),'Código libre')
$$;
create function kh_private.pro_require_subject(p_user uuid,p_agency uuid,p_optional boolean) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if num_nonnulls(p_user,p_agency)>1 or (not p_optional and num_nonnulls(p_user,p_agency)=0) then raise exception 'KH_PRO_INVALID'; end if;
 if p_user is not null and not exists(select 1 from public.profiles where id=p_user) then raise exception 'KH_PRO_INVALID'; end if;
 if p_agency is not null and not exists(select 1 from kh_private.agencies where id=p_agency) then raise exception 'KH_PRO_INVALID'; end if;
end $$;

-- 2. Public reads -----------------------------------------------------------------------
-- PostgREST computed field: select 'is_pro:kh_is_pro' next to the property columns.
-- Anyone can pass a forged row, so only its id counts: the owner is read from the table.
create function public.kh_is_pro(p public.properties) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select kh_private.property_pro_active(x.id,x.owner_id) from public.properties x where x.id=p.id),false)
$$;
-- A profile badge exists only where the profile is public: at least one live listing.
create function public.kh_pro_badge(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(kh_private.user_pro_until(p_user_id)>now(),false)
  and exists(select 1 from public.properties where owner_id=p_user_id and moderation='approved' and availability='active')
$$;

-- 3. The person's own Pro -----------------------------------------------------------------
create function public.kh_pro_status(p_actor_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
 return jsonb_build_object('personalUntil',kh_private.user_pro_until(p_actor_id),'agencies',coalesce((
  select jsonb_agg(jsonb_build_object('id',a.id,'tradeName',a.trade_name,'role',m.role,'until',kh_private.agency_pro_until(a.id)) order by a.trade_name,a.id)
  from kh_private.agency_memberships m join kh_private.agencies a on a.id=m.agency_id
  where m.user_id=p_actor_id and m.state='active' and a.state='approved'),'[]'::jsonb));
end $$;

-- Failures return instead of raising: an exception would also roll back the attempt row and
-- the hourly limit would never count.
create function public.kh_redeem_pro_code(p_actor_id uuid,p_code text,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kh_private.pro_codes%rowtype; v_user uuid; v_agency uuid; v_until timestamptz; v_may boolean:=false;
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id then raise exception 'KH_ACCOUNT_CHANGED' using errcode='42501'; end if;
 perform kh_private.require_active();
 if kh_private.is_deleting(p_actor_id) then raise exception 'KH_ACCOUNT_DELETING'; end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:pro:redeem:'||p_actor_id::text,0));
 if (select count(*) from kh_private.pro_code_attempts where user_id=p_actor_id and attempted_at>clock_timestamp()-interval '1 hour')>=5 then
  return jsonb_build_object('ok',false,'error','KH_PRO_CODE_RATE');
 end if;
 if char_length(coalesce(p_code,''))>64 then
  insert into kh_private.pro_code_attempts(user_id) values(p_actor_id);
  return jsonb_build_object('ok',false,'error','KH_PRO_CODE_INVALID');
 end if;
 select * into c from kh_private.pro_codes where code_hash=kh_private.pro_code_hash(p_code) for update;
 if found then
  -- A bound code decides its recipient; a free one goes to the chosen agency or to the person.
  v_user:=case when c.bound_user_id is not null then c.bound_user_id when c.bound_agency_id is null and p_agency_id is null then p_actor_id end;
  v_agency:=coalesce(c.bound_agency_id,case when c.bound_user_id is null then p_agency_id end);
  -- Only for oneself, or for an approved agency one still administers; a retry is checked again.
  v_may:=case when v_user is not null then v_user=p_actor_id else exists(select 1 from kh_private.agency_memberships m join kh_private.agencies a on a.id=m.agency_id
   where m.agency_id=v_agency and m.user_id=p_actor_id and m.state='active' and m.role='admin' and a.state='approved') end;
  if v_may and c.redeemed_at is not null and c.redeemed_by=p_actor_id and c.redeemed_user_id is not distinct from v_user and c.redeemed_agency_id is not distinct from v_agency then
   return jsonb_build_object('ok',true,'kind',case when v_user is null then 'agency' else 'user' end,'id',coalesce(v_user,v_agency),
    'until',case when v_user is null then kh_private.agency_pro_until(v_agency) else kh_private.user_pro_until(v_user) end);
  end if;
 end if;
 if not found or not v_may or c.cancelled_at is not null or c.redeemed_at is not null or c.expires_at<=now() then
  insert into kh_private.pro_code_attempts(user_id) values(p_actor_id);
  return jsonb_build_object('ok',false,'error','KH_PRO_CODE_INVALID');
 end if;
 update kh_private.pro_codes set redeemed_by=p_actor_id,redeemed_user_id=v_user,redeemed_agency_id=v_agency,redeemed_at=now() where id=c.id;
 v_until:=kh_private.extend_pro(v_user,v_agency,c.days);
 -- Pro audit rows carry no note: every admin reads the history, notes stay owner-only.
 perform kh_private.audit_action('pro_code_redeemed',c.id,kh_private.pro_subject_name(v_user,v_agency),null);
 return jsonb_build_object('ok',true,'kind',case when v_user is null then 'agency' else 'user' end,'id',coalesce(v_user,v_agency),'until',v_until);
end $$;

-- 4. Owner administration -------------------------------------------------------------------
create function public.kh_admin_create_pro_code(p_actor_id uuid,p_days integer,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); v_code text; v_id uuid; v_expires timestamptz:=now()+interval '30 days';
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_days is null or p_days not between 1 and 365 or char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,true);
 loop
  v_code:=kh_private.pro_new_code();
  begin
   insert into kh_private.pro_codes(code_hash,days,note,bound_user_id,bound_agency_id,created_by,expires_at)
   values(kh_private.pro_code_hash(v_code),p_days,v_note,p_user_id,p_agency_id,p_actor_id,v_expires) returning id into v_id;
   exit;
  exception when unique_violation then null; -- 60 bits make a repeat practically impossible; the loop only guards it.
  end;
 end loop;
 perform kh_private.audit_action('pro_code_created',v_id,kh_private.pro_subject_name(p_user_id,p_agency_id),null);
 return jsonb_build_object('id',v_id,'code','KH-'||substr(v_code,1,4)||'-'||substr(v_code,5,4)||'-'||substr(v_code,9,4),'expiresAt',v_expires);
end $$;

-- 31 rows answer "is there more"; the client keeps 30, like kh_admin_accounts keeps 50.
create function public.kh_admin_list_pro_codes(p_actor_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_PRO_INVALID'; end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(t.item order by t.created_at desc,t.id),'[]'::jsonb),'hasMore',count(*)>30) from (
  select c.id,c.created_at,jsonb_build_object('id',c.id,'days',c.days,'note',c.note,
   'boundName',case when num_nonnulls(c.bound_user_id,c.bound_agency_id)=0 then null else kh_private.pro_subject_name(c.bound_user_id,c.bound_agency_id) end,
   'state',case when c.cancelled_at is not null then 'cancelled' when c.redeemed_at is not null then 'redeemed' when c.expires_at<=now() then 'expired' else 'unused' end,
   'createdAt',c.created_at,'expiresAt',c.expires_at,'redeemedAt',c.redeemed_at,
   'redeemedFor',case when c.redeemed_at is null then null else kh_private.pro_subject_name(c.redeemed_user_id,c.redeemed_agency_id) end,'cancelNote',c.cancel_note) item
  from kh_private.pro_codes c order by c.created_at desc,c.id offset p_offset limit 31) t);
end $$;

create function public.kh_admin_cancel_pro_code(p_actor_id uuid,p_code_id uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); c kh_private.pro_codes%rowtype;
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 select * into c from kh_private.pro_codes where id=p_code_id for update;
 if not found or c.cancelled_at is not null or c.redeemed_at is not null then raise exception 'KH_PRO_CODE_STATE'; end if;
 update kh_private.pro_codes set cancelled_at=now(),cancel_note=v_note where id=c.id;
 perform kh_private.audit_action('pro_code_cancelled',c.id,kh_private.pro_subject_name(c.bound_user_id,c.bound_agency_id),null);
end $$;

create function public.kh_admin_grant_pro(p_actor_id uuid,p_days integer,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,'')); v_until timestamptz;
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,false);
 v_until:=kh_private.extend_pro(p_user_id,p_agency_id,p_days);
 update kh_private.pro_status set note=v_note where user_id=p_user_id or agency_id=p_agency_id;
 perform kh_private.audit_action('pro_granted',coalesce(p_user_id,p_agency_id),kh_private.pro_subject_name(p_user_id,p_agency_id),null);
 return jsonb_build_object('until',v_until);
end $$;

create function public.kh_admin_revoke_pro(p_actor_id uuid,p_note text,p_user_id uuid default null,p_agency_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_note text:=btrim(coalesce(p_note,''));
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if char_length(v_note) not between 3 and 500 then raise exception 'KH_PRO_INVALID'; end if;
 perform kh_private.pro_require_subject(p_user_id,p_agency_id,false);
 update kh_private.pro_status set pro_until=now(),updated_at=now(),note=v_note where (user_id=p_user_id or agency_id=p_agency_id) and pro_until>now();
 if not found then raise exception 'KH_PRO_NOT_ACTIVE'; end if;
 perform kh_private.audit_action('pro_revoked',coalesce(p_user_id,p_agency_id),kh_private.pro_subject_name(p_user_id,p_agency_id),null);
end $$;

create function public.kh_admin_list_pro_accounts(p_actor_id uuid,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform kh_private.admin_actor(p_actor_id,true);
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_PRO_INVALID'; end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(t.item order by t.pro_until,t.sid),'[]'::jsonb),'hasMore',count(*)>30) from (
  select s.pro_until,coalesce(s.user_id,s.agency_id) sid,jsonb_build_object('kind',case when s.user_id is null then 'agency' else 'user' end,
   'id',coalesce(s.user_id,s.agency_id),'name',kh_private.pro_subject_name(s.user_id,s.agency_id),'until',s.pro_until,'note',s.note,
   -- A pending or suspended agency keeps its date but has no effective Pro until approved again.
   'effective',s.user_id is not null or exists(select 1 from kh_private.agencies a where a.id=s.agency_id and a.state='approved')) item
  from kh_private.pro_status s where s.pro_until>now() order by s.pro_until,coalesce(s.user_id,s.agency_id) offset p_offset limit 31) t);
end $$;

-- 5. Privileges ---------------------------------------------------------------------------------
revoke all on function kh_private.pro_code_hash(text),kh_private.pro_new_code(),kh_private.user_pro_until(uuid),
 kh_private.agency_pro_until(uuid),kh_private.extend_pro(uuid,uuid,integer),kh_private.pro_subject_name(uuid,uuid),
 kh_private.pro_require_subject(uuid,uuid,boolean),kh_private.property_pro_active(uuid,uuid) from public,anon,authenticated;
revoke all on function public.kh_is_pro(public.properties),public.kh_pro_badge(uuid) from public;
grant execute on function public.kh_is_pro(public.properties),public.kh_pro_badge(uuid) to anon,authenticated;
revoke all on function public.kh_pro_status(uuid),public.kh_redeem_pro_code(uuid,text,uuid),
 public.kh_admin_create_pro_code(uuid,integer,text,uuid,uuid),public.kh_admin_list_pro_codes(uuid,integer),
 public.kh_admin_cancel_pro_code(uuid,uuid,text),public.kh_admin_grant_pro(uuid,integer,text,uuid,uuid),
 public.kh_admin_revoke_pro(uuid,text,uuid,uuid),public.kh_admin_list_pro_accounts(uuid,integer) from public,anon;
grant execute on function public.kh_pro_status(uuid),public.kh_redeem_pro_code(uuid,text,uuid),
 public.kh_admin_create_pro_code(uuid,integer,text,uuid,uuid),public.kh_admin_list_pro_codes(uuid,integer),
 public.kh_admin_cancel_pro_code(uuid,uuid,text),public.kh_admin_grant_pro(uuid,integer,text,uuid,uuid),
 public.kh_admin_revoke_pro(uuid,text,uuid,uuid),public.kh_admin_list_pro_accounts(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
