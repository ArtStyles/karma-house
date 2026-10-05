-- Protected principal -> one linked recipient. All ownership changes are atomic.
create table kh_private.listing_transfer_requests(
 id uuid primary key default gen_random_uuid(),source_owner_id uuid not null,recipient_id uuid not null,collaborator_id uuid not null references kh_private.assisted_collaborators(id),collaborator_version integer not null,
 client_request_id uuid not null,payload jsonb not null,state text not null default 'pending' check(state in('pending','accepted','rejected','cancelled','expired','invalidated')),
 version integer not null default 1,reason_code text,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '7 days',decided_at timestamptz,result_versions jsonb,
 unique(source_owner_id,client_request_id));
create table kh_private.listing_transfer_items(request_id uuid not null references kh_private.listing_transfer_requests(id),property_id uuid not null,property_version integer not null,provenance_version integer not null,snapshot jsonb not null,primary key(request_id,property_id));
create table kh_private.listing_transfer_reservations(property_id uuid primary key,request_id uuid not null references kh_private.listing_transfer_requests(id));
create table kh_private.listing_transfer_events(id bigint generated always as identity primary key,request_id uuid not null references kh_private.listing_transfer_requests(id),actor_id uuid,action text not null,reason_code text,created_at timestamptz not null default clock_timestamp());
create table kh_private.listing_transfer_decisions(actor_id uuid not null,client_request_id uuid not null,payload jsonb not null,result jsonb not null,primary key(actor_id,client_request_id));
create table kh_private.listing_transfer_write_permits(property_id uuid primary key,source_owner_id uuid not null,recipient_id uuid not null,expected_version integer not null,request_id uuid not null);
do $$ declare n text;begin foreach n in array array['listing_transfer_requests','listing_transfer_items','listing_transfer_reservations','listing_transfer_events','listing_transfer_decisions','listing_transfer_write_permits'] loop execute format('alter table kh_private.%I enable row level security',n);execute format('revoke all on kh_private.%I from public,anon,authenticated',n);execute format('grant all on kh_private.%I to service_role',n);end loop;end $$;

create function kh_private.transfer_reason(p_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare r kh_private.listing_transfer_requests%rowtype;c kh_private.assisted_collaborators%rowtype;
begin
 select * into r from kh_private.listing_transfer_requests where id=p_id;
 if r.state<>'pending' then return r.reason_code;end if;
 if r.expires_at<=clock_timestamp() then return 'KH_TRANSFER_EXPIRED';end if;
 select * into c from kh_private.assisted_collaborators where id=r.collaborator_id;
 if c.account_id is distinct from r.recipient_id or c.version<>r.collaborator_version then return 'KH_TRANSFER_RECIPIENT_CHANGED';end if;
 if c.state<>'active' or not kh_private.is_official(r.source_owner_id) or kh_private.is_suspended(r.recipient_id) or kh_private.is_deleting(r.recipient_id) or not exists(select 1 from auth.users where id=r.recipient_id and email_confirmed_at is not null) then return 'KH_TRANSFER_STALE';end if;
 if exists(select 1 from kh_private.listing_transfer_items i left join public.properties p on p.id=i.property_id left join kh_private.assisted_listing_records a on a.property_id=i.property_id where i.request_id=p_id and (p.id is null or p.owner_id<>r.source_owner_id or p.version<>i.property_version or p.moderation<>'approved' or p.availability not in('active','paused') or a.property_id is null or a.collaborator_id<>r.collaborator_id or a.version<>i.provenance_version or a.consent_revoked_at is not null)) then return 'KH_TRANSFER_STALE';end if;
 return null;
end $$;
create function kh_private.transfer_result(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('requestId',id,'state',state,'requestVersion',version,'reasonCode',reason_code,'propertyVersions',coalesce(result_versions,'[]'::jsonb)) from kh_private.listing_transfer_requests where id=p_id;
$$;
create function kh_private.finish_transfer(p_id uuid,p_state text,p_reason text,p_versions jsonb default null) returns void language plpgsql security definer set search_path='' as $$
begin
 update kh_private.listing_transfer_requests set state=p_state,reason_code=p_reason,version=version+1,decided_at=clock_timestamp(),result_versions=p_versions where id=p_id and state='pending';
 if found then
  delete from kh_private.listing_transfer_reservations where request_id=p_id;
  insert into kh_private.listing_transfer_events(request_id,actor_id,action,reason_code) values(p_id,auth.uid(),p_state,p_reason);
  perform kh_private.audit_action('transfer_'||p_state,p_id,'Lote de anuncios',p_reason);
 end if;
end $$;
create function kh_private.transfer_json(p_id uuid,p_actor uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r kh_private.listing_transfer_requests%rowtype;reason text;effective text;enabled boolean;
begin
 select * into r from kh_private.listing_transfer_requests where id=p_id and p_actor in(source_owner_id,recipient_id);
 if not found then raise exception 'KH_TRANSFER_NOT_FOUND';end if;
 reason:=kh_private.transfer_reason(p_id);effective:=case when r.state='pending' and reason is not null then case when reason='KH_TRANSFER_EXPIRED' then 'expired' else 'invalidated' end else r.state end;
 select transfers_enabled into enabled from kh_private.assisted_listing_settings;
 return jsonb_build_object('id',r.id,'requestVersion',r.version,'state',r.state,'effectiveState',effective,'expiresAt',r.expires_at,'createdAt',r.created_at,'sourceManagerId',r.source_owner_id,
 'recipient',jsonb_build_object('id',r.recipient_id,'displayName',coalesce((select display_name from public.profiles where id=r.recipient_id),'Cuenta eliminada')),
 'items',(select coalesce(jsonb_agg(jsonb_build_object('propertyId',i.property_id,'expectedPropertyVersion',i.property_version,'expectedProvenanceVersion',i.provenance_version,'sourceManagerId',r.source_owner_id,'snapshot',i.snapshot) order by i.property_id),'[]'::jsonb) from kh_private.listing_transfer_items i where i.request_id=r.id),
 'canAccept',effective='pending' and p_actor=r.recipient_id and enabled and not kh_private.is_suspended(p_actor) and not kh_private.is_deleting(p_actor),'canReject',effective='pending' and p_actor=r.recipient_id,'canCancel',effective='pending' and p_actor=r.source_owner_id and kh_private.is_official(p_actor),'reasonCode',reason,'resultPropertyVersions',r.result_versions);
end $$;
create function public.kh_get_listing_transfer(p_actor_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.assisted_actor(p_actor_id);return kh_private.transfer_json(p_request_id,p_actor_id);end $$;
create function public.kh_list_listing_transfers(p_actor_id uuid,p_scope text default 'incoming',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform kh_private.assisted_actor(p_actor_id);
 if p_scope not in('incoming','outgoing') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'KH_TRANSFER_INVALID';end if;
 if p_scope='outgoing' and not kh_private.is_official(p_actor_id) then raise exception 'KH_OFFICIAL_ACCOUNT_REQUIRED';end if;
 return (select jsonb_build_object('items',coalesce(jsonb_agg(kh_private.transfer_json(id,p_actor_id) order by created_at desc,id) filter(where n<=p_offset+50),'[]'::jsonb),'hasMore',count(*)>50) from (select id,created_at,row_number() over(order by created_at desc,id) n from kh_private.listing_transfer_requests where case when p_scope='incoming' then recipient_id=p_actor_id else source_owner_id=p_actor_id end order by created_at desc,id offset p_offset limit 51) page);
end $$;
create function public.kh_offer_listing_transfer(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.assisted_actor(p_actor_id,true);target uuid:=(p_payload->>'recipientId')::uuid;c uuid:=(p_payload->>'collaboratorId')::uuid;token uuid:=(p_payload->>'clientRequestId')::uuid;collab kh_private.assisted_collaborators%rowtype;r kh_private.listing_transfer_requests%rowtype;item jsonb;prop public.properties%rowtype;record kh_private.assisted_listing_records%rowtype;old_id uuid;reason text;new_id uuid;
begin
 if token is null or target is null or c is null or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 20 or (select count(distinct x->>'propertyId') from jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items') then raise exception 'KH_TRANSFER_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:transfer:offer:'||a::text||':'||token::text,0));
 select * into r from kh_private.listing_transfer_requests where source_owner_id=a and client_request_id=token;
 if found then if r.payload<>p_payload then raise exception 'KH_TRANSFER_DECISION_CONFLICT';end if;return kh_private.transfer_json(r.id,a);end if;
 perform kh_private.require_recipient(target);
 perform 1 from kh_private.assisted_listing_settings where singleton and transfers_enabled for share;if not found then raise exception 'KH_TRANSFERS_DISABLED';end if;
 select * into collab from kh_private.assisted_collaborators where id=c for update;
 if not found or collab.state<>'active' or collab.account_id is distinct from target or collab.link_confirmed_at is null or collab.version is distinct from (p_payload->>'expectedCollaboratorVersion')::integer then raise exception 'KH_TRANSFER_RECIPIENT_CHANGED';end if;
 -- Reserve requests before properties, using the same order as accept.
 for old_id in select distinct res.request_id from kh_private.listing_transfer_reservations res join jsonb_array_elements(p_payload->'items') x on res.property_id=(x->>'propertyId')::uuid order by res.request_id loop
  perform 1 from kh_private.listing_transfer_requests where id=old_id for update;
  reason:=kh_private.transfer_reason(old_id);
  if reason is not null then perform kh_private.finish_transfer(old_id,case when reason='KH_TRANSFER_EXPIRED' then 'expired' else 'invalidated' end,reason);else raise exception 'KH_TRANSFER_ALREADY_PENDING';end if;
 end loop;
 for item in select x from jsonb_array_elements(p_payload->'items') x order by x->>'propertyId' loop
  select * into prop from public.properties where id=(item->>'propertyId')::uuid for update;
  if not found or prop.owner_id<>a or prop.moderation<>'approved' or prop.availability not in('active','paused') or prop.version is distinct from (item->>'expectedVersion')::integer then raise exception 'KH_TRANSFER_INELIGIBLE';end if;
 end loop;
 for item in select x from jsonb_array_elements(p_payload->'items') x order by x->>'propertyId' loop
  select * into record from kh_private.assisted_listing_records where property_id=(item->>'propertyId')::uuid for update;
  if not found or record.collaborator_id<>c or record.consent_revoked_at is not null or record.version is distinct from (item->>'expectedProvenanceVersion')::integer then raise exception 'KH_TRANSFER_INELIGIBLE';end if;
 end loop;
 insert into kh_private.listing_transfer_requests(source_owner_id,recipient_id,collaborator_id,collaborator_version,client_request_id,payload) values(a,target,c,collab.version,token,p_payload) returning id into new_id;
 insert into kh_private.listing_transfer_items(request_id,property_id,property_version,provenance_version,snapshot) select new_id,p.id,p.version,provenance.version,to_jsonb(p) from public.properties p join kh_private.assisted_listing_records provenance on provenance.property_id=p.id join jsonb_array_elements(p_payload->'items') x on p.id=(x->>'propertyId')::uuid;
 insert into kh_private.listing_transfer_reservations(property_id,request_id) select property_id,new_id from kh_private.listing_transfer_items where request_id=new_id;
 insert into kh_private.listing_transfer_events(request_id,actor_id,action) values(new_id,a,'offered');
 perform kh_private.audit_action('transfer_offered',new_id,'Lote de anuncios');
 return kh_private.transfer_json(new_id,a);
end $$;
create function kh_private.guard_listing_manager() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.owner_id is distinct from old.owner_id and auth.uid() is not null and not exists(select 1 from kh_private.listing_transfer_write_permits w where w.property_id=old.id and w.source_owner_id=old.owner_id and w.recipient_id=new.owner_id and w.expected_version=old.version and new.version=old.version+1 and auth.uid()=new.owner_id) then raise exception 'KH_PROPERTY_MANAGEMENT_CHANGED';end if;
 return new;
end $$;
create trigger kh_guard_listing_manager before update on public.properties for each row execute function kh_private.guard_listing_manager();
create function public.kh_decide_listing_transfer(p_actor_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.assisted_actor(p_actor_id);rid uuid:=(p_payload->>'requestId')::uuid;token uuid:=(p_payload->>'clientRequestId')::uuid;action text:=p_payload->>'decision';r kh_private.listing_transfer_requests%rowtype;receipt kh_private.listing_transfer_decisions%rowtype;reason text;prop public.properties%rowtype;v_path text;versions jsonb;result jsonb;
begin
 if token is null or rid is null or action is null or action not in('accept','reject','cancel') then raise exception 'KH_TRANSFER_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:transfer:decision:'||a::text||':'||token::text,0));
 select * into receipt from kh_private.listing_transfer_decisions where actor_id=a and client_request_id=token;
 if found then if receipt.payload<>p_payload then raise exception 'KH_TRANSFER_DECISION_CONFLICT';end if;return receipt.result;end if;
 select * into r from kh_private.listing_transfer_requests where id=rid and a in(source_owner_id,recipient_id);
 if not found then raise exception 'KH_TRANSFER_NOT_FOUND';end if;
 if action='cancel' then if a<>r.source_owner_id or not kh_private.is_official(a) then raise exception 'KH_TRANSFER_NOT_FOUND';end if;
 elsif a<>r.recipient_id then raise exception 'KH_TRANSFER_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:account:'||r.recipient_id::text,0));
 perform 1 from kh_private.assisted_collaborators where id=r.collaborator_id for update;
 select * into r from kh_private.listing_transfer_requests where id=rid for update;
 if r.state<>'pending' then
  if r.state in('accepted','rejected','cancelled') and r.state<>(case action when 'accept' then 'accepted' when 'reject' then 'rejected' else 'cancelled' end) then raise exception 'KH_TRANSFER_DECISION_CONFLICT';end if;
  result:=kh_private.transfer_result(rid);
 else
  if r.version is distinct from (p_payload->>'expectedRequestVersion')::integer then raise exception 'KH_VERSION_CONFLICT';end if;
  perform 1 from public.properties p join kh_private.listing_transfer_items i on i.property_id=p.id where i.request_id=rid order by p.id for update of p;
  perform 1 from kh_private.assisted_listing_records p join kh_private.listing_transfer_items i on i.property_id=p.property_id where i.request_id=rid order by p.property_id for update of p;
  reason:=kh_private.transfer_reason(rid);
  if reason is not null then
   perform kh_private.finish_transfer(rid,case when reason='KH_TRANSFER_EXPIRED' then 'expired' else 'invalidated' end,reason);
  elsif action='accept' then
   perform kh_private.require_recipient(a);
   perform 1 from kh_private.assisted_listing_settings where singleton and transfers_enabled for share;if not found then raise exception 'KH_TRANSFERS_DISABLED';end if;
   for v_path in select distinct x from public.properties p join kh_private.listing_transfer_items i on i.property_id=p.id cross join lateral unnest(p.photo_paths||case when p.cover_thumb_path is null then '{}'::text[] else array[p.cover_thumb_path] end) x where i.request_id=rid order by x loop
    perform pg_advisory_xact_lock(hashtextextended('kh:photo:'||v_path,0));
    if not exists(select 1 from storage.objects where bucket_id='property-photos' and name=v_path) then raise exception 'KH_TRANSFER_MEDIA_MISSING';end if;
   end loop;
   for prop in select p.* from public.properties p join kh_private.listing_transfer_items i on i.property_id=p.id where i.request_id=rid order by p.id loop
    perform kh_private.validate_property_media(prop.id,prop.owner_id,prop.client_request_id,prop.photo_paths,prop.cover_thumb_path,prop.moderation,prop.operation);
   end loop;
   -- Recheck the server clock after potentially waiting on media locks.
   reason:=kh_private.transfer_reason(rid);
   if reason is not null then perform kh_private.finish_transfer(rid,case when reason='KH_TRANSFER_EXPIRED' then 'expired' else 'invalidated' end,reason);
   else
    insert into kh_private.listing_transfer_write_permits(property_id,source_owner_id,recipient_id,expected_version,request_id) select property_id,r.source_owner_id,a,property_version,rid from kh_private.listing_transfer_items where request_id=rid;
    update public.properties p set owner_id=a,version=p.version+1 from kh_private.listing_transfer_items i where i.request_id=rid and i.property_id=p.id;
    delete from kh_private.listing_transfer_write_permits where request_id=rid;
    select jsonb_agg(jsonb_build_object('propertyId',p.id,'version',p.version) order by p.id) into versions from public.properties p join kh_private.listing_transfer_items i on i.property_id=p.id where i.request_id=rid;
    perform kh_private.finish_transfer(rid,'accepted',null,versions);
   end if;
  else perform kh_private.finish_transfer(rid,case action when 'reject' then 'rejected' else 'cancelled' end,null);
  end if;
  result:=kh_private.transfer_result(rid);
 end if;
 insert into kh_private.listing_transfer_decisions values(a,token,p_payload,result);
 return result;
end $$;
revoke all on function kh_private.transfer_reason(uuid),kh_private.transfer_result(uuid),kh_private.finish_transfer(uuid,text,text,jsonb),kh_private.transfer_json(uuid,uuid),kh_private.guard_listing_manager() from public,anon,authenticated;
revoke all on function public.kh_get_listing_transfer(uuid,uuid),public.kh_list_listing_transfers(uuid,text,integer),public.kh_offer_listing_transfer(uuid,jsonb),public.kh_decide_listing_transfer(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_get_listing_transfer(uuid,uuid),public.kh_list_listing_transfers(uuid,text,integer),public.kh_offer_listing_transfer(uuid,jsonb),public.kh_decide_listing_transfer(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
