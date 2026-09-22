-- Messages already reach the phone as a push and the chat tab badge. The bell keeps visits and offers.
-- Message notices stay stored and unread so push delivery and its receipts keep working unchanged.
create function kh_private.notification_in_bell(p_row kh_private.notifications,p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select p_row.category<>'message' and kh_private.notification_visible(p_row,p_actor);
$$;

create or replace function kh_private.notification_summary(p_actor uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('unreadCount',count(*) filter(where n.read_at is null),
    'readThrough',coalesce(max(n.seq),0)::text)
  from kh_private.notifications n where n.recipient_id=p_actor and kh_private.notification_in_bell(n,p_actor);
$$;

create or replace function public.kh_list_notifications(p_actor_id uuid,p_before_seq text default null,
  p_unread_only boolean default false,p_category text default null,p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_actor uuid:=kh_private.chat_actor(p_actor_id);
  v_before bigint;
  v_rows jsonb;
  v_more boolean;
  v_summary jsonb;
begin
  if p_before_seq is not null then v_before:=kh_private.notification_cursor(p_before_seq,false); end if;
  if p_unread_only is null or p_limit is null or p_limit not between 1 and 30
    or p_category is not null and p_category not in('visit','offer') then raise exception 'KH_NOTIFICATION_INVALID'; end if;
  with page as (
    select n.* from kh_private.notifications n where n.recipient_id=v_actor
      and kh_private.notification_in_bell(n,v_actor) and (v_before is null or n.seq<v_before)
      and (not p_unread_only or n.read_at is null) and (p_category is null or n.category=p_category)
    order by n.seq desc limit p_limit+1
  ), numbered as (select p.*,row_number() over(order by p.seq desc) as position from page p)
  select coalesce(jsonb_agg(kh_private.notification_json(n) order by n.seq desc) filter(where x.position<=p_limit),'[]'::jsonb),count(*)>p_limit
    into v_rows,v_more from numbered x join kh_private.notifications n on n.id=x.id;
  v_summary:=kh_private.notification_summary(v_actor);
  return v_summary||jsonb_build_object('items',v_rows,'nextCursor',case when v_more then v_rows->(p_limit-1)->>'seq' else null end);
end $$;

create or replace function public.kh_read_notification(p_actor_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=coalesce(n.read_at,clock_timestamp())
    where n.id=p_id and n.recipient_id=v_actor and kh_private.notification_in_bell(n,v_actor);
  if not found then raise exception 'KH_NOTIFICATION_NOT_FOUND'; end if;
  return kh_private.notification_summary(v_actor)-'readThrough';
end $$;

-- Reading the bell must not clear a message notice: that would cancel its pending push.
create or replace function public.kh_read_notifications_through(p_actor_id uuid,p_through_seq text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=kh_private.chat_actor(p_actor_id); v_through bigint:=kh_private.notification_cursor(p_through_seq,true);
begin
  perform kh_private.notification_recipient_lock(v_actor);
  update kh_private.notifications n set read_at=clock_timestamp()
    where n.recipient_id=v_actor and n.seq<=v_through and n.read_at is null and kh_private.notification_in_bell(n,v_actor);
  return kh_private.notification_summary(v_actor)-'readThrough';
end $$;

revoke all on function kh_private.notification_in_bell(kh_private.notifications,uuid) from public,anon,authenticated,service_role;

notify pgrst,'reload schema';
