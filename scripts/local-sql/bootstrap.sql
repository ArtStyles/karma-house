-- Disposable PostgreSQL adapter for project SQL/RLS tests. No external transport.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create schema extensions;
create schema net;
create schema cron;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}', email_confirmed_at timestamptz, created_at timestamptz default now(), updated_at timestamptz default now());
create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now(), not_after timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
create table storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
create table net._http_response(id bigint primary key, status_code integer, content text, timed_out boolean, error_msg text, headers jsonb, created timestamptz default now());
create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 1000) returns bigint language plpgsql as $$ begin raise exception 'LOCAL_NETWORK_DISABLED'; end $$;
create table cron.job(jobid bigint generated always as identity primary key, jobname text, schedule text, command text, active boolean default false);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language plpgsql as $$ declare j bigint; begin insert into cron.job(jobname,schedule,command) values(job_name,schedule,command) returning jobid into j; return j; end $$;
grant usage on schema auth,storage,extensions to anon,authenticated,service_role;
grant execute on all functions in schema auth,storage to anon,authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated,service_role;
grant select on storage.objects to anon;
grant all on storage.buckets to service_role;

