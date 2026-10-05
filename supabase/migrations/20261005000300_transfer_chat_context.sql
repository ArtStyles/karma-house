-- Historical participants remain fixed. New contact targets the current visible manager.
create or replace function kh_private.chat_conversation_json(p_id uuid,p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'propertyId',c.property_id,'propertyTitle',c.property_title,'propertyLocation',c.property_location,
 'buyerId',c.buyer_id,'sellerId',c.seller_id,'otherUserId',other_profile.id,'otherName',other_profile.display_name,
 'lastMessage',c.last_message,'lastMessageAt',c.last_message_at,'lastSeq',c.last_seq,'unreadCount',coalesce(r.unread_count,0),
 'blockedByMe',b.mine,'blockedByOther',b.theirs,'propertyAvailable',v.available,'canSend',v.available and not b.mine and not b.theirs,'createdAt',c.created_at,
 'managementChanged',case when p.id is not null then p.owner_id<>c.seller_id else exists(select 1 from kh_private.listing_transfer_items i join kh_private.listing_transfer_requests t on t.id=i.request_id where i.property_id=c.property_id and t.state='accepted' and t.source_owner_id=c.seller_id) end,
 'currentManagerId',case when p.moderation='approved' and p.availability='active' then p.owner_id end,'currentManagerName',case when p.moderation='approved' and p.availability='active' then manager.display_name end,
 'currentContactAvailable',coalesce(p.moderation='approved' and p.availability='active' and p.owner_id<>p_actor and not kh_private.is_suspended(p_actor) and not kh_private.is_deleting(p_actor) and not exists(select 1 from public.kh_user_blocks where blocker_id=p_actor and blocked_id=p.owner_id or blocker_id=p.owner_id and blocked_id=p_actor),false))
 from public.kh_conversations c join public.profiles other_profile on other_profile.id=case when c.buyer_id=p_actor then c.seller_id else c.buyer_id end
 left join public.kh_conversation_reads r on r.conversation_id=c.id and r.user_id=p_actor
 left join public.properties p on p.id=c.property_id left join public.profiles manager on manager.id=p.owner_id
 cross join lateral (select exists(select 1 from public.kh_user_blocks where blocker_id=p_actor and blocked_id=other_profile.id) mine,exists(select 1 from public.kh_user_blocks where blocker_id=other_profile.id and blocked_id=p_actor) theirs) b
 cross join lateral (select coalesce(p.owner_id=c.seller_id and p.moderation='approved' and p.availability='active',false) available) v
 where c.id=p_id and p_actor in(c.buyer_id,c.seller_id);
$$;
create function kh_private.start_conversation_for_manager(p_property_id uuid,p_actor_id uuid,p_expected_manager_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a uuid:=kh_private.chat_actor(p_actor_id);p public.properties%rowtype;manager_id uuid;conversation_id uuid;
begin
 perform kh_private.require_active();
 if kh_private.is_deleting(a) then raise exception 'KH_ACCOUNT_DELETING';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||a::text,0));
 select * into p from public.properties where id=p_property_id;
 if not found or p.moderation<>'approved' or p.availability<>'active' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE';end if;
 manager_id:=p.owner_id;
 if p_expected_manager_id is not null and p_expected_manager_id<>manager_id then raise exception 'KH_CHAT_MANAGER_CHANGED';end if;
 if manager_id=a then raise exception 'KH_CHAT_SELF_CONTACT';end if;
 perform kh_private.chat_pair_lock(a,manager_id);
 select * into p from public.properties where id=p_property_id for share;
 if not found or p.moderation<>'approved' or p.availability<>'active' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE';end if;
 if p.owner_id<>manager_id then raise exception 'KH_CHAT_MANAGER_CHANGED';end if;
 select id into conversation_id from public.kh_conversations where property_id=p_property_id and buyer_id=a and seller_id=manager_id;
 if found then return kh_private.chat_conversation_json(conversation_id,a);end if;
 if exists(select 1 from public.kh_user_blocks where blocker_id=a and blocked_id=manager_id or blocker_id=manager_id and blocked_id=a) then raise exception 'KH_CHAT_BLOCKED';end if;
 if (select count(*) from public.kh_conversations where buyer_id=a and created_at>=clock_timestamp()-interval '24 hours')>=20 then raise exception 'KH_CHAT_CONVERSATION_LIMIT';end if;
 insert into public.kh_conversations(property_id,property_title,property_location,buyer_id,seller_id) values(p.id,p.title,concat_ws(', ',p.location,p.province),a,manager_id) returning id into conversation_id;
 insert into public.kh_conversation_reads(conversation_id,user_id) values(conversation_id,a),(conversation_id,manager_id);
 return kh_private.chat_conversation_json(conversation_id,a);
end $$;
create or replace function public.kh_start_conversation(p_property_id uuid,p_actor_id uuid) returns jsonb language sql security definer set search_path='' as $$ select kh_private.start_conversation_for_manager(p_property_id,p_actor_id,null) $$;
create function public.kh_start_conversation_for_manager(p_property_id uuid,p_actor_id uuid,p_expected_manager_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin if p_expected_manager_id is null then raise exception 'KH_CHAT_MANAGER_CHANGED';end if;return kh_private.start_conversation_for_manager(p_property_id,p_actor_id,p_expected_manager_id);end $$;
create or replace function public.kh_send_message(p_conversation_id uuid,p_client_message_id uuid,p_body text,p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform kh_private.chat_actor(p_actor_id);perform kh_private.require_active();if kh_private.is_deleting(p_actor_id) then raise exception 'KH_ACCOUNT_DELETING';end if;return kh_private.chat_store_message(p_conversation_id,p_client_message_id,p_body,p_actor_id,null);end $$;
revoke all on function kh_private.start_conversation_for_manager(uuid,uuid,uuid),public.kh_start_conversation_for_manager(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.kh_start_conversation_for_manager(uuid,uuid,uuid) to authenticated;
notify pgrst,'reload schema';

create or replace function kh_private.full_public_profile(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_viewer uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_verified boolean;
  v_months integer;
  v_approved integer;
  v_active integer;
  v_ids jsonb;
  v_answered integer;
  v_received integer;
  v_median integer;
  v_minutes integer;
  v_rate integer;
  v_visits integer;
  v_level text;
  v_avatar text;
  v_reasons text[] := '{}';
begin
  -- The same error for a person who does not exist and one who is not visible.
  if p_user_id is null or kh_private.profile_visible(p_user_id, v_viewer) is not true then raise exception 'KH_PROFILE_NOT_FOUND'; end if;
  select * into v_profile from public.profiles where id = p_user_id;
  v_verified := exists (select 1 from kh_private.verified_users where user_id = p_user_id);
  v_months := (extract(year from age(now(), v_profile.created_at)) * 12 + extract(month from age(now(), v_profile.created_at)))::integer;
  select count(*) into v_approved from public.properties p join kh_private.property_publication_keys k on k.property_id=p.id where p.owner_id=p_user_id and k.origin_actor_id=p_user_id and p.moderation='approved';
  select count(*) into v_active from public.properties where owner_id=p_user_id and moderation='approved' and availability='active';
  select coalesce(jsonb_agg(id order by created_at desc, id desc), '[]'::jsonb) into v_ids from (
    select id, created_at from public.properties where owner_id = p_user_id and moderation = 'approved' and availability = 'active'
    order by created_at desc, id desc limit 24) recent;
  select answered, received, median_minutes into v_answered, v_received, v_median from kh_private.profile_response_stats(p_user_id);
  if v_answered >= 3 then
    v_minutes := v_median;
    v_rate := round(100.0 * v_answered / v_received)::integer;
  end if;
  v_visits := kh_private.profile_visits_agreed(p_user_id);
  v_level := kh_private.karma_level(v_months, v_approved, v_answered, v_visits, v_verified,
    kh_private.profile_confirmed_reports(p_user_id, null), kh_private.profile_confirmed_reports(p_user_id, interval '90 days') > 0);
  select avatar_path into v_avatar from kh_private.account_avatars where owner_id = p_user_id;
  if v_avatar is not null and v_viewer is distinct from p_user_id and not kh_private.avatar_is_public(v_avatar) then v_avatar := null; end if;

  if v_verified then v_reasons := array_append(v_reasons, 'Verificado por KarmaHouse'); end if;
  if v_approved > 0 then
    v_reasons := array_append(v_reasons, (v_approved || case when v_approved = 1 then ' anuncio propio publicado y aprobado' else ' anuncios propios publicados y aprobados' end));
  end if;
  if round(v_rate / 10.0) > 0 then v_reasons := array_append(v_reasons, ('Responde a ' || round(v_rate / 10.0) || ' de cada 10 mensajes')); end if;
  if v_visits > 0 then
    v_reasons := array_append(v_reasons, (v_visits || case when v_visits = 1 then ' visita concertada' else ' visitas concertadas' end));
  end if;
  if v_months > 0 then
    v_reasons := array_append(v_reasons, ('En KarmaHouse desde hace ' || v_months || case when v_months = 1 then ' mes' else ' meses' end));
  end if;

  return jsonb_build_object('id', v_profile.id, 'displayName', v_profile.display_name, 'memberSince', v_profile.created_at,
    'verified', v_verified, 'level', v_level, 'levelReasons', to_jsonb(v_reasons), 'activeListings', v_ids,
    'activeListingCount', v_active, 'approvedListingCount', v_approved, 'responseMinutes', v_minutes,
    'responseRate', v_rate, 'visitsAgreed', v_visits, 'avatarUrlPath', v_avatar);
end $$;

create or replace function public.kh_set_property_status(p_id uuid,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  if p_status is null or p_status not in ('active','paused','sold') then raise exception 'KH_INVALID_STATUS'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.availability=p_status then return; end if;
  update public.properties set availability=p_status,updated_at=now(),version=version+1 where id=p_id;
end;
$$;

create or replace function public.kh_submit_property(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype;
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if auth.uid() is null then raise exception 'KH_AUTH_REQUIRED' using errcode='42501'; end if;
  select * into v_property from public.properties where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.moderation in ('pending','approved') then return; end if;
  perform kh_private.validate_property_media(v_property.id,v_property.owner_id,v_property.client_request_id,v_property.photo_paths,v_property.cover_thumb_path,'pending',v_property.operation);
  update public.properties set moderation='pending',review_note=null,updated_at=now(),version=version+1 where id=p_id;
end;
$$;

create or replace function public.kh_review_property(p_id uuid, p_decision text, p_note text, p_expected_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_property public.properties%rowtype; v_note text := nullif(btrim(p_note), '');
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if auth.uid() is null or not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then raise exception 'KH_INVALID_DECISION'; end if;
  if p_decision = 'rejected' and (v_note is null or char_length(v_note) > 1000) then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
  select * into v_property from public.properties where id = p_id for update;
  if not found then raise exception 'KH_PROPERTY_NOT_FOUND'; end if;
  if v_property.owner_id = auth.uid() then raise exception 'KH_CANNOT_REVIEW_OWN_PROPERTY'; end if;
  if p_expected_version is null or v_property.version <> p_expected_version then raise exception 'KH_VERSION_CONFLICT'; end if;
  if v_property.moderation <> 'pending' then raise exception 'KH_NOT_PENDING'; end if;
  if p_decision = 'approved' then
    perform kh_private.validate_property_media(v_property.id,v_property.owner_id,v_property.client_request_id,v_property.photo_paths,v_property.cover_thumb_path,'pending',v_property.operation);
    v_note := null;
  end if;
  update public.properties set moderation = p_decision, review_note = v_note, updated_at = now(), version = version + 1 where id = p_id returning * into v_property;
  -- ponytail: every saved search and wanted ad is evaluated on each approval; add a cap or a
  -- queue if one approval starts producing hundreds of alerts.
  if p_decision = 'approved' and v_property.availability = 'active' then perform kh_private.alert_on_approval(v_property); end if;
end $$;

create or replace function public.kh_review_property_report(p_report_id uuid,p_note text,p_unpublish boolean,p_actor_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_report public.kh_property_reports%rowtype; v_note text:=btrim(coalesce(p_note,''));
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_unpublish is null or char_length(v_note)>1000 then raise exception 'KH_REPORT_INVALID'; end if;
  select * into v_report from public.kh_property_reports where id=p_report_id for update;
  if not found then raise exception 'KH_REPORT_NOT_FOUND'; end if;
  if v_actor in (v_report.reporter_id,v_report.owner_id) then raise exception 'KH_CANNOT_REVIEW_OWN_REPORT'; end if;
  if v_report.status='reviewed' then
    if v_report.review_note is not distinct from v_note and v_report.unpublished=p_unpublish then return; end if;
    raise exception 'KH_REPORT_ALREADY_REVIEWED';
  end if;
  if p_unpublish then
    -- The owner reads this note as the reason, exactly as after a rejected review, and can fix and resubmit.
    if v_note='' then raise exception 'KH_REVIEW_NOTE_REQUIRED'; end if;
    update public.properties set moderation='rejected',review_note=v_note,updated_at=now(),version=version+1
      where id=v_report.property_id and moderation='approved';
    -- One decision settles every open report about the same listing.
    update public.kh_property_reports set status='reviewed',unpublished=true,review_note=v_note,reviewed_by=v_actor,reviewed_at=clock_timestamp()
      where property_id=v_report.property_id and status='open';
  else
    update public.kh_property_reports set status='reviewed',review_note=v_note,reviewed_by=v_actor,reviewed_at=clock_timestamp() where id=p_report_id;
  end if;
end $$;

create or replace function public.kh_create_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_conversation public.kh_conversations%rowtype;
  v_request uuid; v_conv uuid; v_kind text; v_note text; v_amount numeric; v_at timestamptz; v_date text; v_time text;
  v_parent_id uuid; v_expected integer; v_parent public.kh_negotiations%rowtype; v_saved public.kh_negotiations%rowtype;
  v_expired public.kh_negotiations%rowtype; v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb;
  v_now timestamptz; v_summary text; v_event_id uuid; v_property public.properties%rowtype;
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or jsonb_typeof(p_payload->'note') is distinct from 'string'
    or coalesce(p_payload->>'conversationId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'clientRequestId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  v_request:=(p_payload->>'clientRequestId')::uuid; v_conv:=(p_payload->>'conversationId')::uuid;
  v_kind:=p_payload->>'kind'; v_note:=btrim(p_payload->>'note');
  if v_kind is null or v_kind not in ('offer','visit') or char_length(v_note)>500 then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  if p_payload ? 'replacesId' then
    if coalesce(p_payload->>'replacesId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or coalesce(p_payload->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
    v_parent_id:=(p_payload->>'replacesId')::uuid; v_expected:=(p_payload->>'expectedVersion')::integer;
  elsif p_payload ? 'expectedVersion' then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  if v_kind='offer' then
    if coalesce(p_payload->>'amountUsd','') !~ '^[0-9]+([.,][0-9]{1,2})?$' then raise exception 'KH_NEG_INVALID_AMOUNT'; end if;
    v_amount:=replace(p_payload->>'amountUsd',',','.')::numeric;
    if not(v_amount>0 and v_amount<=1000000000) then raise exception 'KH_NEG_INVALID_AMOUNT'; end if;
  else
    v_date:=p_payload->>'visitDate'; v_time:=p_payload->>'visitTime';
    v_at:=kh_private.negotiation_visit(v_date,v_time);
  end if;
  v_canonical:=jsonb_build_object('operation','create','conversationId',v_conv,'kind',v_kind,'note',v_note,'amountUsd',v_amount,
    'visitDate',v_date,'visitTime',v_time,'replacesId',v_parent_id,'expectedVersion',v_expected);
  v_conversation:=kh_private.negotiation_lock(v_conv,v_actor);
  select * into v_receipt from kh_private.negotiation_requests where actor_id=v_actor and client_request_id=v_request;
  if found then
    if v_receipt.payload<>v_canonical then raise exception 'KH_NEG_REQUEST_CONFLICT'; end if;
    return v_receipt.result;
  end if;
  if exists(select 1 from public.kh_user_blocks where (blocker_id=v_conversation.buyer_id and blocked_id=v_conversation.seller_id) or (blocker_id=v_conversation.seller_id and blocked_id=v_conversation.buyer_id)) then raise exception 'KH_CHAT_BLOCKED'; end if;
  select * into v_property from public.properties where id=v_conversation.property_id for share;
  if not found or v_property.owner_id<>v_conversation.seller_id or v_property.availability<>'active' or v_property.moderation<>'approved' then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  v_now:=clock_timestamp();
  if v_kind='visit' and (v_at<=v_now or v_at>v_now+interval '180 days') then raise exception 'KH_NEG_INVALID_VISIT'; end if;
  if v_kind='offer' and v_parent_id is null and v_actor<>v_conversation.buyer_id then raise exception 'KH_NEG_BUYER_REQUIRED'; end if;
  if v_parent_id is not null then
    select * into v_parent from public.kh_negotiations where id=v_parent_id and conversation_id=v_conv and kind=v_kind for update;
    if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
    if v_parent.version<>v_expected then raise exception 'KH_NEG_VERSION_CONFLICT'; end if;
    if v_parent.status='pending' and v_parent.expires_at<=v_now then raise exception 'KH_NEG_EXPIRED'; end if;
    if v_parent.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_parent.created_by=v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
    update public.kh_negotiations set status='superseded',version=version+1,updated_at=v_now where id=v_parent.id returning * into v_parent;
    insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_parent.id,v_actor,'superseded',kh_private.negotiation_json(v_parent,v_actor,v_now));
  end if;
  for v_expired in update public.kh_negotiations set status='expired',version=version+1,updated_at=v_now
    where conversation_id=v_conv and status='pending' and expires_at<=v_now returning * loop
    insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_expired.id,v_actor,'expired',kh_private.negotiation_json(v_expired,v_actor,v_now));
  end loop;
  if exists(select 1 from public.kh_negotiations where conversation_id=v_conv and kind=v_kind and status='pending') then raise exception 'KH_NEG_PENDING_EXISTS'; end if;
  insert into public.kh_negotiations(conversation_id,created_by,kind,amount_usd,visit_date,visit_time,visit_at,note,parent_id,expires_at,created_at,updated_at)
  values(v_conv,v_actor,v_kind,v_amount,v_date::date,v_time::time,v_at,v_note,v_parent_id,case when v_kind='visit' then v_at else v_now+interval '7 days' end,v_now,v_now) returning * into v_saved;
  v_result:=kh_private.negotiation_json(v_saved,v_actor,v_now);
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_saved.id,v_actor,'created',v_result) returning id into v_event_id;
  v_summary:=case when v_kind='offer' then case when v_parent_id is null then 'Oferta propuesta: ' else 'Contraoferta propuesta: ' end||v_amount::text||' USD.'
    else case when v_parent_id is null then 'Visita propuesta: ' else 'Nueva fecha de visita: ' end||v_date||' a las '||v_time||' (hora de Cuba).' end;
  if v_note<>'' then v_summary:=v_summary||E'\n'||v_note; end if;
  perform kh_private.chat_store_message(v_conv,gen_random_uuid(),v_summary,v_actor,v_event_id);
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_conv,v_canonical,v_result);
  return v_result;
end $$;

create or replace function public.kh_respond_negotiation(p_actor_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_id uuid; v_request uuid; v_action text; v_expected integer;
  v_saved public.kh_negotiations%rowtype; v_conversation public.kh_conversations%rowtype; v_property public.properties%rowtype;
  v_receipt kh_private.negotiation_requests%rowtype; v_canonical jsonb; v_result jsonb; v_now timestamptz; v_blocked boolean; v_available boolean; v_summary text; v_event_id uuid;
begin
  perform kh_private.require_active();
  if kh_private.is_deleting(auth.uid()) then raise exception 'KH_ACCOUNT_DELETING';end if;
  if jsonb_typeof(p_payload) is distinct from 'object'
    or coalesce(p_payload->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'clientRequestId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    or coalesce(p_payload->>'expectedVersion','') !~ '^[1-9][0-9]{0,8}$'
    or coalesce(p_payload->>'action','') not in ('accept','decline','cancel')
    or p_payload-ARRAY['id','clientRequestId','expectedVersion','action'] <> '{}'::jsonb then raise exception 'KH_NEG_INVALID_PAYLOAD'; end if;
  v_id:=(p_payload->>'id')::uuid; v_request:=(p_payload->>'clientRequestId')::uuid; v_expected:=(p_payload->>'expectedVersion')::integer; v_action:=p_payload->>'action';
  v_canonical:=jsonb_build_object('operation','respond','id',v_id,'action',v_action,'expectedVersion',v_expected);
  select * into v_saved from public.kh_negotiations where id=v_id;
  if not found then raise exception 'KH_NEG_NOT_FOUND'; end if;
  v_conversation:=kh_private.negotiation_lock(v_saved.conversation_id,v_actor);
  select * into v_receipt from kh_private.negotiation_requests where actor_id=v_actor and client_request_id=v_request;
  if found then
    if v_receipt.payload<>v_canonical then raise exception 'KH_NEG_REQUEST_CONFLICT'; end if;
    return v_receipt.result;
  end if;
  select * into v_saved from public.kh_negotiations where id=v_id for update;
  if v_saved.version<>v_expected then raise exception 'KH_NEG_VERSION_CONFLICT'; end if;
  if v_action='cancel' then
    if v_saved.status not in ('pending','accepted') then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_saved.status='pending' and v_saved.created_by<>v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
  else
    if v_saved.status<>'pending' then raise exception 'KH_NEG_INVALID_STATE'; end if;
    if v_saved.created_by=v_actor then raise exception 'KH_NEG_NOT_YOUR_TURN'; end if;
  end if;
  v_blocked:=exists(select 1 from public.kh_user_blocks where (blocker_id=v_conversation.buyer_id and blocked_id=v_conversation.seller_id) or (blocker_id=v_conversation.seller_id and blocked_id=v_conversation.buyer_id));
  select * into v_property from public.properties where id=v_conversation.property_id for share;
  v_available:=found and v_property.owner_id=v_conversation.seller_id and v_property.availability='active' and v_property.moderation='approved';
  -- A property edit may hold the row lock past expiry. Decide with the clock after waiting.
  v_now:=clock_timestamp();
  if v_saved.status='pending' and v_saved.expires_at<=v_now then raise exception 'KH_NEG_EXPIRED'; end if;
  if v_action<>'cancel' and v_blocked then raise exception 'KH_CHAT_BLOCKED'; end if;
  if v_action<>'cancel' and not v_available then raise exception 'KH_CHAT_PROPERTY_UNAVAILABLE'; end if;
  update public.kh_negotiations set status=case v_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'cancelled' end,version=version+1,updated_at=v_now where id=v_id returning * into v_saved;
  v_result:=kh_private.negotiation_json(v_saved,v_actor,v_now);
  insert into kh_private.negotiation_events(negotiation_id,actor_id,action,snapshot) values(v_id,v_actor,v_saved.status,v_result) returning id into v_event_id;
  if not v_blocked and v_available then
    v_summary:=case when v_saved.kind='offer' then 'Oferta de '||v_saved.amount_usd::text||' USD' else 'Visita del '||to_char(v_saved.visit_date,'YYYY-MM-DD')||' a las '||to_char(v_saved.visit_time,'HH24:MI')||' (hora de Cuba)' end
      ||case v_action when 'accept' then ' aceptada.' when 'decline' then ' rechazada.' else ' cancelada.' end;
    perform kh_private.chat_store_message(v_saved.conversation_id,gen_random_uuid(),v_summary,v_actor,v_event_id);
  end if;
  insert into kh_private.negotiation_requests(actor_id,client_request_id,conversation_id,payload,result) values(v_actor,v_request,v_saved.conversation_id,v_canonical,v_result);
  return v_result;
end $$;
