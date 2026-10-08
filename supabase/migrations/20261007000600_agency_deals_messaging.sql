-- Private business subjects keep identity/history independently of Auth and personal chats.
create table kh_private.agency_deals(
 id uuid primary key default gen_random_uuid(),agency_id uuid not null references kh_private.agencies(id),
 property_id uuid not null references kh_private.agency_property_identities(property_id),cycle_id uuid not null references kh_private.commercial_cycles(id),
 buyer_id uuid references auth.users(id) on delete set null,contact_kind text not null check(contact_kind in('account','external')),
 private_contact jsonb,assignee_id uuid references auth.users(id) on delete set null,
 stage text not null default 'inquiry' check(stage in('inquiry','visit_proposed','visit_confirmed','visited','offer','won','lost')),
 version integer not null default 1,closed_reason text,created_at timestamptz not null default clock_timestamp(),
 check((contact_kind='account' and private_contact is null) or (contact_kind='external' and buyer_id is null and private_contact is not null))
);
create unique index agency_open_buyer_deal on kh_private.agency_deals(cycle_id,agency_id,buyer_id) where closed_reason is null and stage not in('won','lost') and buyer_id is not null;
create index agency_deals_staff_page on kh_private.agency_deals(agency_id,assignee_id,created_at desc,id);
create index agency_deals_buyer on kh_private.agency_deals(buyer_id,created_at desc,id) where buyer_id is not null;
create table kh_private.agency_conversations(
 id uuid primary key default gen_random_uuid(),deal_id uuid not null unique references kh_private.agency_deals(id),
 last_seq integer not null default 0,created_at timestamptz not null default clock_timestamp()
);
create table kh_private.agency_messages(
 id uuid primary key default gen_random_uuid(),conversation_id uuid not null references kh_private.agency_conversations(id),
 seq integer not null,client_message_id uuid not null,sender_id uuid references auth.users(id) on delete set null,
 author_id uuid not null,body text not null check(char_length(body) between 1 and 2000),created_at timestamptz not null default clock_timestamp(),
 unique(conversation_id,seq),unique(author_id,client_message_id)
);
create table kh_private.agency_message_reads(conversation_id uuid not null references kh_private.agency_conversations(id),user_id uuid not null references auth.users(id) on delete cascade,last_seq integer not null default 0,primary key(conversation_id,user_id));
create table kh_private.agency_message_reports(
 id uuid primary key default gen_random_uuid(),agency_id uuid not null references kh_private.agencies(id),conversation_id uuid not null references kh_private.agency_conversations(id),
 reporter_id uuid not null,reported_user_id uuid not null,reason text not null check(reason in('spam','fraud','harassment','other')),details text not null,
 context jsonb not null,property_title text not null,status text not null default 'open' check(status in('open','reviewed')),created_at timestamptz not null default clock_timestamp(),review_note text,reviewed_by uuid,reviewed_at timestamptz
);
create index agency_messages_rate on kh_private.agency_messages(author_id,created_at);
create index agency_reports_rate on kh_private.agency_message_reports(reporter_id,created_at);

-- Shared admission applies to both channels, including the existing personal RPCs.
create function kh_private.agency_shared_chat_rate() returns trigger language plpgsql security definer set search_path='' as $$
 declare actor uuid;stamp timestamptz:=clock_timestamp();begin
 actor:=coalesce((to_jsonb(new)->>'author_id')::uuid,(to_jsonb(new)->>'sender_id')::uuid,(to_jsonb(new)->>'reporter_id')::uuid);
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||actor::text,0));
 if tg_table_name in('kh_messages','agency_messages') then
  if (select count(*) from(select created_at from public.kh_messages where sender_id=actor union all select created_at from kh_private.agency_messages where author_id=actor)x where created_at>=stamp-interval '1 minute')>=20 or
   (select count(*) from(select created_at from public.kh_messages where sender_id=actor union all select created_at from kh_private.agency_messages where author_id=actor)x where created_at>=stamp-interval '1 hour')>=300 then raise exception 'KH_CHAT_RATE_LIMIT';end if;
 else
  if (select count(*) from(select created_at from public.kh_message_reports where reporter_id=actor union all select created_at from kh_private.agency_message_reports where reporter_id=actor)x where created_at>=stamp-interval '24 hours')>=10 then raise exception 'KH_CHAT_REPORT_LIMIT';end if;
 end if;return new;
end $$;
create trigger kh_agency_shared_message_rate before insert on public.kh_messages for each row execute function kh_private.agency_shared_chat_rate();
create trigger kh_agency_shared_message_rate before insert on kh_private.agency_messages for each row execute function kh_private.agency_shared_chat_rate();
create trigger kh_agency_shared_report_rate before insert on public.kh_message_reports for each row execute function kh_private.agency_shared_chat_rate();
create trigger kh_agency_shared_report_rate before insert on kh_private.agency_message_reports for each row execute function kh_private.agency_shared_chat_rate();
revoke all on function kh_private.agency_shared_chat_rate() from public,anon,authenticated;

create function kh_private.agency_effective_property(pid uuid) returns uuid language sql stable security definer set search_path='' as $$select coalesce((select canonical_id from kh_private.property_aliases where property_id=pid),pid)$$;
create function kh_private.agency_pair_blocked(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.kh_user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a))$$;
create function kh_private.agency_contact_member(agency uuid,actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agency_memberships m join auth.users u on u.id=m.user_id where m.agency_id=agency and m.user_id=actor and m.state='active' and u.email_confirmed_at is not null and not kh_private.is_suspended(actor) and not kh_private.is_deleting(actor))
$$;
create function kh_private.agency_flow_live(agency uuid,pid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select (select enabled from kh_private.agency_settings where singleton) and exists(
 select 1 from public.properties p join kh_private.agency_mandates m on m.property_id=p.id and m.agency_id=agency and m.state='active'
 join kh_private.agencies a on a.id=m.agency_id and a.state='approved'
 where p.id=kh_private.agency_effective_property(pid) and p.moderation='approved' and p.availability='active'
 and not exists(select 1 from kh_private.agency_property_origins o join kh_private.agencies source on source.id=o.origin_agency_id where o.property_id=p.id and source.state<>'approved'))
$$;
-- Accounts, sorted agency UUIDs (including aliases), then sorted property UUIDs.
create function kh_private.agency_flow_locks(actor uuid,agency uuid,pid uuid,people uuid[]) returns void language plpgsql security definer set search_path='' as $$
 declare u uuid;canonical uuid;begin
 for u in select distinct unnest(array_append(people,actor)) order by 1 loop if u is not null then perform pg_advisory_xact_lock(hashtextextended('kh:account:'||u::text,0));end if;end loop;
 perform kh_private.agency_account(actor);
 perform pg_advisory_xact_lock(hashtextextended('kh:property-aliases',0));canonical:=kh_private.agency_effective_property(pid);
 perform kh_private.agency_lock_many(kh_private.agency_lifecycle_lock_set(array[agency],array[pid,canonical]));
 perform 1 from public.properties where id=canonical or id=pid or id in(select property_id from kh_private.property_aliases where canonical_id=canonical) order by id for update;
end $$;
create function kh_private.agency_deal_visible(actor uuid,agency uuid,d kh_private.agency_deals) returns boolean language sql stable security definer set search_path='' as $$
 select case when agency is null then d.contact_kind='account' and d.buyer_id=actor else d.agency_id=agency and exists(select 1 from kh_private.agency_memberships m where m.agency_id=agency and m.user_id=actor and m.state='active' and (m.role in('coordinator','admin') or d.assignee_id=actor)) end
$$;
create function kh_private.agency_deal_access(actor uuid,agency uuid,deal uuid) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals;begin perform kh_private.agency_account(actor);select * into d from kh_private.agency_deals where id=deal;
 if d.id is null or not coalesce(kh_private.agency_deal_visible(actor,agency,d),false) then raise exception 'KH_AGENCY_DEAL_NOT_FOUND' using errcode='42501';end if;return d;end $$;
create function kh_private.agency_deal_json(d kh_private.agency_deals) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',d.id,'agencyId',d.agency_id,'propertyId',d.property_id,'cycleId',d.cycle_id,'buyerId',d.buyer_id,'contactKind',d.contact_kind,'privateContact',d.private_contact,'assigneeId',d.assignee_id,'stage',d.stage,'version',d.version,'closedReason',d.closed_reason)$$;
create function kh_private.agency_message_json(m kh_private.agency_messages) returns jsonb language sql stable set search_path='' as $$select jsonb_build_object('id',m.id,'conversationId',m.conversation_id,'seq',m.seq,'clientMessageId',m.client_message_id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at)$$;
create function kh_private.agency_conversation_json(actor uuid,agency uuid,c kh_private.agency_conversations) returns jsonb language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals:=kh_private.agency_deal_access(actor,agency,c.deal_id);begin
 return jsonb_build_object('id',c.id,'agencyId',d.agency_id,'dealId',d.id,'propertyId',d.property_id,'buyerId',d.buyer_id,'assigneeId',d.assignee_id,'dealVersion',d.version,
 'agencyName',(select trade_name from kh_private.agencies where id=d.agency_id),'propertyTitle',coalesce((select title from public.properties where id=d.property_id),(select title from kh_private.agency_property_identities where property_id=d.property_id),'Vivienda'),
 'canSend',d.closed_reason is null and d.buyer_id is not null and not kh_private.is_suspended(d.buyer_id) and not kh_private.is_deleting(d.buyer_id) and kh_private.agency_flow_live(d.agency_id,d.property_id)
 and (agency is null or d.assignee_id=actor) and (d.assignee_id is null or kh_private.agency_contact_member(d.agency_id,d.assignee_id))
 and not kh_private.agency_pair_blocked(d.buyer_id,d.assignee_id) and not kh_private.agency_pair_blocked(actor,d.buyer_id),
 'closedReason',d.closed_reason,'lastSeq',c.last_seq,'unreadCount',greatest(0,c.last_seq-coalesce((select last_seq from kh_private.agency_message_reads where conversation_id=c.id and user_id=actor),0)));
end $$;
create function public.kh_get_agency_deal(p_actor_id uuid,p_agency_id uuid,p_deal_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin return kh_private.agency_deal_json(kh_private.agency_deal_access(p_actor_id,p_agency_id,p_deal_id));end$$;
create function public.kh_list_agency_deals(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform kh_private.agency_account(p_actor_id);
 if p_agency_id is null or not exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id and state='active') then raise exception 'KH_AGENCY_MEMBERSHIP_REQUIRED';end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_deal_json(x) order by x.created_at desc,x.id),'[]') into items from(select d.* from kh_private.agency_deals d where kh_private.agency_deal_visible(p_actor_id,p_agency_id,d) order by d.created_at desc,d.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function kh_private.agency_make_deal(actor uuid,agency uuid,payload jsonb,buyer_start boolean) returns kh_private.agency_deals language plpgsql security definer set search_path='' as $$
 declare pid uuid:=kh_private.agency_effective_property((payload->>'propertyId')::uuid);buyer uuid:=case when buyer_start then actor else (payload->>'buyerId')::uuid end;
 manager uuid:=case when buyer_start then (payload->>'preferredManagerId')::uuid else (payload->>'assigneeId')::uuid end;cycle uuid;d kh_private.agency_deals;contact jsonb;phone text;begin
 if not kh_private.agency_flow_live(agency,pid) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 if manager is not null and not kh_private.agency_contact_member(agency,manager) then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
 if manager=buyer then raise exception 'KH_AGENCY_INVALID';end if;
 if buyer is not null and (not exists(select 1 from auth.users where id=buyer and email_confirmed_at is not null) or kh_private.is_suspended(buyer) or kh_private.is_deleting(buyer)) then raise exception 'KH_AGENCY_RECIPIENT_INVALID';end if;
 if not buyer_start then
  perform kh_private.agency_actor(actor,agency,'manager');
  if exists(select 1 from kh_private.agency_memberships where agency_id=agency and user_id=actor and role='manager') then
   if manager is not null and manager<>actor then raise exception 'KH_AGENCY_ROLE_REQUIRED';end if;manager:=actor;
  end if;
  if (buyer is null)=(payload->'externalContact' is null or payload->'externalContact'='null'::jsonb) then raise exception 'KH_AGENCY_INVALID_CONTACT';end if;
 end if;
 if manager=buyer then raise exception 'KH_AGENCY_INVALID';end if;
 if buyer is not null and manager is not null then perform kh_private.chat_pair_lock(buyer,manager);end if;
 if kh_private.agency_pair_blocked(buyer,manager) then raise exception 'KH_CHAT_BLOCKED';end if;
 if buyer is null then
  phone:=payload#>>'{externalContact,phone}';if phone is not null and phone!~'^\+?[0-9][0-9 ()-]{6,23}$' then raise exception 'KH_AGENCY_INVALID_CONTACT';end if;
  contact:=jsonb_build_object('name',kh_private.agency_text(payload#>'{externalContact,name}',2,120),'phone',phone,'consentReference',kh_private.agency_text(payload#>'{externalContact,consentReference}',2,1000));
 end if;
 select id into cycle from kh_private.commercial_cycles where property_id=pid and state='open';
 if cycle is null then insert into kh_private.commercial_cycles(property_id)values(pid)returning id into cycle;end if;
 select * into d from kh_private.agency_deals where cycle_id=cycle and agency_id=agency and buyer_id=buyer and closed_reason is null and stage not in('won','lost');
 if d.id is not null then
  if manager is not null and d.assignee_id is distinct from manager then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
  if not buyer_start and not kh_private.agency_deal_visible(actor,agency,d) then raise exception 'KH_AGENCY_DEAL_NOT_FOUND';end if;return d;
 end if;
 insert into kh_private.agency_deals(agency_id,property_id,cycle_id,buyer_id,contact_kind,private_contact,assignee_id)values(agency,pid,cycle,buyer,case when buyer is null then 'external' else 'account' end,contact,manager)returning * into d;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(agency,actor,'deal_created',d.id);return d;
end $$;
create function public.kh_create_agency_deal(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r jsonb;d kh_private.agency_deals;begin
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,(p_payload->>'propertyId')::uuid,array[(p_payload->>'buyerId')::uuid,(p_payload->>'assigneeId')::uuid]);perform kh_private.agency_actor(p_actor_id,p_agency_id,'manager');
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'create_deal',p_payload);if r is not null then return public.kh_get_agency_deal(p_actor_id,p_agency_id,(r->>'id')::uuid);end if;
 d:=kh_private.agency_make_deal(p_actor_id,p_agency_id,p_payload,false);return kh_private.agency_remember(p_actor_id,p_agency_id,'create_deal',p_payload,kh_private.agency_deal_json(d));end $$;
create function public.kh_start_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r jsonb;d kh_private.agency_deals;c kh_private.agency_conversations;begin
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,(p_payload->>'propertyId')::uuid,array[(p_payload->>'preferredManagerId')::uuid]);
 if not(select enabled from kh_private.agency_settings where singleton) then raise exception 'KH_AGENCY_DISABLED';end if;
 if p_payload ? 'preferredManagerId' and not kh_private.agency_contact_member(p_agency_id,(p_payload->>'preferredManagerId')::uuid) then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'start_conversation',p_payload);
 if r is not null then select * into c from kh_private.agency_conversations where id=(r->>'id')::uuid;return kh_private.agency_conversation_json(p_actor_id,null,c);end if;
 d:=kh_private.agency_make_deal(p_actor_id,p_agency_id,p_payload,true);
 insert into kh_private.agency_conversations(deal_id)values(d.id)on conflict(deal_id) do nothing;select * into c from kh_private.agency_conversations where deal_id=d.id;
 return kh_private.agency_remember(p_actor_id,p_agency_id,'start_conversation',p_payload,kh_private.agency_conversation_json(p_actor_id,null,c));end $$;
create function public.kh_assign_agency_deal(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare d kh_private.agency_deals;prior uuid;target uuid:=(p_payload->>'userId')::uuid;r jsonb;begin
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,(p_payload->>'dealId')::uuid);prior:=d.assignee_id;
 perform kh_private.agency_flow_locks(p_actor_id,p_agency_id,d.property_id,array[d.buyer_id,d.assignee_id,target]);perform kh_private.agency_actor(p_actor_id,p_agency_id,'coordinator');
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,d.id);
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'assign_deal',p_payload);if r is not null then return kh_private.agency_deal_json(d);end if;
 if d.version is distinct from (p_payload->>'expectedVersion')::integer or prior is distinct from d.assignee_id then raise exception 'KH_VERSION_CONFLICT';end if;
 if d.closed_reason is not null or not kh_private.agency_flow_live(p_agency_id,d.property_id) then raise exception 'KH_AGENCY_PROPERTY_CLOSED';end if;
 if target is null or not kh_private.agency_contact_member(p_agency_id,target) or target=d.buyer_id then raise exception 'KH_AGENCY_MANAGER_CHANGED';end if;
 perform kh_private.chat_pair_lock(d.buyer_id,target);if kh_private.agency_pair_blocked(d.buyer_id,target) then raise exception 'KH_CHAT_BLOCKED';end if;
 update kh_private.agency_deals set assignee_id=target,version=version+1 where id=d.id returning * into d;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,p_actor_id,'deal_assigned',d.id,jsonb_build_object('previousAssigneeId',prior,'assigneeId',target));
 return kh_private.agency_remember(p_actor_id,p_agency_id,'assign_deal',p_payload,kh_private.agency_deal_json(d));end $$;
create function public.kh_get_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_conversation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c kh_private.agency_conversations;begin select * into c from kh_private.agency_conversations where id=p_conversation_id;if c.id is null then raise exception 'KH_AGENCY_DEAL_NOT_FOUND';end if;return kh_private.agency_conversation_json(p_actor_id,p_agency_id,c);end$$;
create function public.kh_list_agency_conversations(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform kh_private.agency_account(p_actor_id);
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_conversation_json(p_actor_id,p_agency_id,x) order by x.created_at desc,x.id),'[]') into items from(select c.* from kh_private.agency_conversations c join kh_private.agency_deals d on d.id=c.deal_id where kh_private.agency_deal_visible(p_actor_id,p_agency_id,d) order by c.created_at desc,c.id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_list_agency_messages(p_actor_id uuid,p_agency_id uuid,p_conversation_id uuid,p_before_seq integer default null,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform public.kh_get_agency_conversation(p_actor_id,p_agency_id,p_conversation_id);
 if p_limit is null or p_limit not between 1 and 50 or p_before_seq<1 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(kh_private.agency_message_json(x) order by x.seq desc),'[]') into items from(select * from kh_private.agency_messages where conversation_id=p_conversation_id and (p_before_seq is null or seq<p_before_seq) order by seq desc limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_send_agency_message(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;prior uuid;r jsonb;m kh_private.agency_messages;body text:=btrim(p_payload->>'body');stamp timestamptz:=clock_timestamp();begin
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,c.deal_id);prior:=d.assignee_id;
 if body is null or char_length(body) not between 1 and 2000 or body~'^[[:space:]]*$' or (p_payload->>'clientMessageId')::uuid is null then raise exception 'KH_CHAT_INVALID_MESSAGE';end if;
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,d.assignee_id]);
 d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,d.id);if prior is distinct from d.assignee_id then raise exception 'KH_AGENCY_ASSIGNMENT_CHANGED';end if;
 perform pg_advisory_xact_lock(hashtextextended('kh:chat:actor:'||p_actor_id::text,0));
 perform kh_private.chat_pair_lock(d.buyer_id,d.assignee_id);if p_actor_id is distinct from d.assignee_id then perform kh_private.chat_pair_lock(d.buyer_id,p_actor_id);end if;
 select * into c from kh_private.agency_conversations where id=c.id for update;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'send_agency_message',p_payload);
 if r is not null then select * into m from kh_private.agency_messages where id=(r->>'id')::uuid;return kh_private.agency_message_json(m);end if;
 select * into m from kh_private.agency_messages where author_id=p_actor_id and client_message_id=(p_payload->>'clientMessageId')::uuid;
 if m.id is not null then
  if m.conversation_id<>c.id or m.body<>body then raise exception 'KH_CHAT_MESSAGE_CONFLICT';end if;
  return kh_private.agency_remember(p_actor_id,d.agency_id,'send_agency_message',p_payload,kh_private.agency_message_json(m));
 end if;
 if kh_private.agency_pair_blocked(d.buyer_id,d.assignee_id) or kh_private.agency_pair_blocked(p_actor_id,d.buyer_id) then raise exception 'KH_CHAT_BLOCKED';end if;
 if not(kh_private.agency_conversation_json(p_actor_id,p_agency_id,c)->>'canSend')::boolean then raise exception 'KH_AGENCY_CONVERSATION_CLOSED';end if;
 if (select count(*) from(select created_at from public.kh_messages where sender_id=p_actor_id union all select created_at from kh_private.agency_messages where author_id=p_actor_id)x where created_at>=stamp-interval '1 minute')>=20 or
 (select count(*) from(select created_at from public.kh_messages where sender_id=p_actor_id union all select created_at from kh_private.agency_messages where author_id=p_actor_id)x where created_at>=stamp-interval '1 hour')>=300 then raise exception 'KH_CHAT_RATE_LIMIT';end if;
 insert into kh_private.agency_messages(conversation_id,seq,client_message_id,sender_id,author_id,body,created_at)values(c.id,c.last_seq+1,(p_payload->>'clientMessageId')::uuid,p_actor_id,p_actor_id,body,stamp)returning * into m;
 update kh_private.agency_conversations set last_seq=m.seq where id=c.id;
 return kh_private.agency_remember(p_actor_id,d.agency_id,'send_agency_message',p_payload,kh_private.agency_message_json(m));end $$;
create function public.kh_read_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare c jsonb;seq integer:=(p_payload->>'lastSeq')::integer;r jsonb;begin
 c:=public.kh_get_agency_conversation(p_actor_id,p_agency_id,(p_payload->>'conversationId')::uuid);
 perform kh_private.agency_flow_locks(p_actor_id,(c->>'agencyId')::uuid,(c->>'propertyId')::uuid,array[(c->>'buyerId')::uuid,(c->>'assigneeId')::uuid]);
 c:=public.kh_get_agency_conversation(p_actor_id,p_agency_id,(p_payload->>'conversationId')::uuid);
 if seq is null or seq<0 or seq>(c->>'lastSeq')::integer then raise exception 'KH_CHAT_INVALID_CURSOR';end if;
 r:=kh_private.agency_receipt(p_actor_id,(c->>'agencyId')::uuid,'read_agency_conversation',p_payload);if r is not null then return;end if;
 insert into kh_private.agency_message_reads(conversation_id,user_id,last_seq)values((c->>'id')::uuid,p_actor_id,seq)on conflict(conversation_id,user_id)do update set last_seq=greatest(agency_message_reads.last_seq,excluded.last_seq);
 perform kh_private.agency_remember(p_actor_id,(c->>'agencyId')::uuid,'read_agency_conversation',p_payload,'{}');end $$;

create or replace function kh_private.terminate_mandate_flows(p_property_id uuid,p_agency_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 update kh_private.agency_property_changes set state='withdrawn',termination_reason=p_reason,version=version+1,decided_at=now() where property_id=p_property_id and agency_id=p_agency_id and state='pending';
 update kh_private.agency_mandate_requests set state='withdrawn',termination_reason=p_reason,version=version+1,decided_at=now() where property_id=p_property_id and agency_id=p_agency_id and state in('pending','accepted');
 update kh_private.agency_deals set closed_reason=p_reason,version=version+1 where agency_id=p_agency_id and closed_reason is null and stage not in('won','lost') and kh_private.agency_effective_property(property_id)=kh_private.agency_effective_property(p_property_id);
end $$;
create or replace function kh_private.terminate_agency_member_flows(p_agency_id uuid,p_user_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 update kh_private.agency_deals set assignee_id=null,version=version+1 where agency_id=p_agency_id and assignee_id=p_user_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,auth.uid(),'member_detached',p_user_id,jsonb_build_object('reason',p_reason));
end $$;
create function public.kh_public_property_contact(p_property_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('propertyId',p.id,'personalContact',not exists(select 1 from kh_private.agency_property_origins where property_id=p.id),'agencies',public.kh_public_agency_context(array[p.id])) from public.properties p where p.id=public.kh_resolve_property_alias(p_property_id) and p.moderation='approved' and p.availability='active' and not exists(select 1 from kh_private.property_aliases where property_id=p.id)
$$;
-- Editing is an explicit authenticated capability; public contact metadata says
-- nothing about private drafts/paused listings or personal source evidence.
create or replace function public.kh_get_listing_management(p_property_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('propertyId',p.id,'managerId',p.owner_id,'assistedByKarmaHouse',exists(select 1 from kh_private.assisted_listing_records r where r.property_id=p.id),
 'contactAvailable',p.moderation='approved' and p.availability='active' and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id),
 'canEditPersonal',coalesce(p.owner_id=auth.uid() and not kh_private.is_suspended(auth.uid()) and not kh_private.is_deleting(auth.uid()) and not exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id) and not exists(select 1 from kh_private.property_aliases where property_id=p.id),false))
 from public.properties p where p.id=p_property_id and (p.moderation='approved' and p.availability='active' or p.owner_id=auth.uid() or public.kh_is_admin())
$$;

create function public.kh_report_agency_conversation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare c kh_private.agency_conversations;d kh_private.agency_deals;r jsonb;rid uuid;target uuid:=(p_payload->>'reportedUserId')::uuid;ctx jsonb;reason text:=p_payload->>'reason';details text:=btrim(coalesce(p_payload->>'details',''));begin
 select * into c from kh_private.agency_conversations where id=(p_payload->>'conversationId')::uuid;d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,c.deal_id);
 perform kh_private.agency_flow_locks(p_actor_id,d.agency_id,d.property_id,array[d.buyer_id,target]);d:=kh_private.agency_deal_access(p_actor_id,p_agency_id,d.id);
 if target is null or target=p_actor_id or reason is null or reason not in('spam','fraud','harassment','other') or char_length(details)>1000 then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 if not exists(select 1 from kh_private.agency_messages where conversation_id=c.id and author_id=target) then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 if (p_agency_id is null and target=d.buyer_id) or (p_agency_id is not null and target is distinct from d.buyer_id) then raise exception 'KH_CHAT_INVALID_REPORT';end if;
 r:=kh_private.agency_receipt(p_actor_id,d.agency_id,'report_agency_conversation',p_payload);if r is not null then return r;end if;
 if (select count(*) from(select created_at from public.kh_message_reports where reporter_id=p_actor_id union all select created_at from kh_private.agency_message_reports where reporter_id=p_actor_id)x where created_at>=clock_timestamp()-interval '24 hours')>=10 then raise exception 'KH_CHAT_REPORT_LIMIT';end if;
 select coalesce(jsonb_agg(kh_private.agency_message_json(x) order by x.seq),'[]') into ctx from(select * from kh_private.agency_messages where conversation_id=c.id order by seq desc limit 30)x;
 insert into kh_private.agency_message_reports(agency_id,conversation_id,reporter_id,reported_user_id,reason,details,context,property_title)values(d.agency_id,c.id,p_actor_id,target,reason,details,ctx,kh_private.agency_conversation_json(p_actor_id,p_agency_id,c)->>'propertyTitle')returning id into rid;
 return kh_private.agency_remember(p_actor_id,d.agency_id,'report_agency_conversation',p_payload,jsonb_build_object('id',rid));end $$;
create function public.kh_list_agency_message_reports(p_actor_id uuid,p_status text default 'open',p_offset integer default 0,p_limit integer default 30) returns jsonb language plpgsql security definer set search_path='' as $$
 declare items jsonb;begin perform kh_private.agency_account(p_actor_id);if not public.kh_is_admin() then raise exception 'KH_ADMIN_REQUIRED';end if;
 if p_status is null or p_status not in('open','reviewed') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 50 then raise exception 'KH_AGENCY_INVALID';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'conversationId',x.conversation_id,'propertyTitle',x.property_title,'reporterId',x.reporter_id,'reportedUserId',x.reported_user_id,'reason',x.reason,'details',x.details,'status',x.status,'createdAt',x.created_at,'reviewNote',x.review_note,'context',x.context)order by x.created_at desc,x.id),'[]') into items from(select * from kh_private.agency_message_reports where status=p_status order by created_at desc,id offset p_offset limit p_limit+1)x;
 return jsonb_build_object('items',case when jsonb_array_length(items)>p_limit then items-p_limit else items end,'hasMore',jsonb_array_length(items)>p_limit);end $$;
create function public.kh_review_agency_message_report(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare r kh_private.agency_message_reports;receipt jsonb;note text;begin perform kh_private.agency_account(p_actor_id);if not public.kh_is_admin() or p_agency_id is not null then raise exception 'KH_ADMIN_REQUIRED';end if;
 select * into r from kh_private.agency_message_reports where id=(p_payload->>'reportId')::uuid for update;if r.id is null then raise exception 'KH_CHAT_NOT_FOUND';end if;
 if p_actor_id in(r.reporter_id,r.reported_user_id) then raise exception 'KH_CHAT_CANNOT_REVIEW_OWN_REPORT';end if;
 note:=kh_private.agency_text(p_payload->'note',2,1000);receipt:=kh_private.agency_receipt(p_actor_id,r.agency_id,'review_agency_message_report',p_payload);if receipt is not null then return;end if;
 if r.status='reviewed' then raise exception 'KH_VERSION_CONFLICT';end if;
 update kh_private.agency_message_reports set status='reviewed',review_note=note,reviewed_by=p_actor_id,reviewed_at=clock_timestamp()where id=r.id;
 perform kh_private.agency_remember(p_actor_id,r.agency_id,'review_agency_message_report',p_payload,'{}');end $$;

do $$declare t text;f record;begin
 foreach t in array array['agency_deals','agency_conversations','agency_messages','agency_message_reads','agency_message_reports']loop
 execute format('alter table kh_private.%I enable row level security',t);execute format('revoke all on kh_private.%I from public,anon,authenticated',t);execute format('grant all on kh_private.%I to service_role',t);end loop;
 for f in select p.oid::regprocedure signature,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='kh_private' and p.proname=any(array['agency_effective_property','agency_pair_blocked','agency_contact_member','agency_flow_live','agency_flow_locks','agency_deal_visible','agency_deal_access','agency_deal_json','agency_message_json','agency_conversation_json','agency_make_deal'])) or(n.nspname='public' and p.proname=any(array['kh_get_agency_deal','kh_list_agency_deals','kh_create_agency_deal','kh_assign_agency_deal','kh_start_agency_conversation','kh_get_agency_conversation','kh_list_agency_conversations','kh_list_agency_messages','kh_send_agency_message','kh_read_agency_conversation','kh_public_property_contact','kh_report_agency_conversation','kh_list_agency_message_reports','kh_review_agency_message_report']))loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.signature);end if;end loop;
end $$;
grant execute on function public.kh_public_property_contact(uuid) to anon;
