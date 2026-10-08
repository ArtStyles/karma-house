-- Query authority and projections remain independent from commercial membership.
-- Every matching row is filtered before count/order/pagination; clients receive 20.
create function public.kh_admin_query(
 p_actor_id uuid,p_section text,p_query text default '',p_filters jsonb default '{}',
 p_offset integer default 0,p_limit integer default 20,p_sort text default 'newest'
)returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 rules jsonb;filters jsonb:=p_filters;entry record;value text;rule jsonb;
 source_sql text;order_sql text;result jsonb;date_value date;
begin
 perform kh_private.admin_actor(p_actor_id,p_section in('agencies','assistedCollaborators','assistedListings'));
 if kh_private.is_deleting(p_actor_id) then raise exception 'KH_ACCOUNT_DELETING';end if;
 if p_section is null or p_section not in('review','accounts','listings','history','propertyReports','messageReports','agencies','assistedCollaborators','assistedListings')
 or p_query is null or char_length(p_query)>100
 or p_offset is null or p_offset<0 or p_offset>100000 or p_offset%20<>0 or p_limit is distinct from 20
 or p_sort is null or p_sort not in('newest','oldest','name') or(p_sort='name' and p_section in('history','propertyReports','messageReports'))
 or jsonb_typeof(filters) is distinct from 'object' then raise exception 'KH_ADMIN_INVALID';end if;
 rules:=case p_section
 when 'accounts' then '{"status":["active","suspended"],"role":["owner","admin","member"],"link":["personal","agency","assisted"]}'::jsonb
 when 'history' then '{"action":"text","actor":"uuid","from":"date","to":"date"}'::jsonb
 when 'propertyReports' then '{"status":["open","reviewed"],"reason":["fraud","misleading","unavailable","inappropriate","other"],"from":"date","to":"date"}'::jsonb
 when 'messageReports' then '{"status":["open","reviewed"],"reason":["spam","fraud","harassment","other"],"from":"date","to":"date","source":["personal","agency"]}'::jsonb
 when 'agencies' then '{"state":["pending","needs_changes","approved","rejected","suspended"],"verified":["true","false"],"province":"province","review":["application","verification"],"verificationState":["pending","needs_changes","approved","rejected","cancelled"]}'::jsonb
 when 'assistedCollaborators' then '{"kind":["owner","manager","agency"],"state":["active","withdrawn"],"link":["linked","unlinked"]}'::jsonb
 when 'assistedListings' then '{"collaboratorId":"uuid","moderation":["draft","pending","approved","rejected"],"availability":["active","paused","sold"],"eligible":["true","false"]}'::jsonb
 else '{"moderation":["draft","pending","approved","rejected"],"availability":["active","paused","sold"],"origin":["personal","agency","assisted"],"operation":["sale","swap","wanted","rent"],"province":"province"}'::jsonb end;
 for entry in select * from jsonb_each(filters)loop
  if not rules?entry.key or jsonb_typeof(entry.value) is distinct from 'string' then raise exception 'KH_ADMIN_INVALID';end if;
  value:=btrim(entry.value#>>'{}');rule:=rules->entry.key;
  if char_length(value)>120 then raise exception 'KH_ADMIN_INVALID';end if;
  if value in('','all') then filters:=filters-entry.key;continue;end if;
  if jsonb_typeof(rule)='array' and not rule?value then raise exception 'KH_ADMIN_INVALID';end if;
  if rule='"uuid"'::jsonb and value!~*'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then raise exception 'KH_ADMIN_INVALID';end if;
  if rule='"text"'::jsonb and char_length(value)>80 then raise exception 'KH_ADMIN_INVALID';end if;
  if rule='"province"'::jsonb and value not in('Pinar del Río','Artemisa','La Habana','Mayabeque','Matanzas','Villa Clara','Cienfuegos','Sancti Spíritus','Ciego de Ávila','Camagüey','Las Tunas','Holguín','Granma','Santiago de Cuba','Guantánamo','Isla de la Juventud')then raise exception 'KH_ADMIN_INVALID';end if;
  if rule='"date"'::jsonb then
   begin if value!~'^\d{4}-\d{2}-\d{2}$' then raise exception 'invalid date';end if;date_value:=value::date;if to_char(date_value,'YYYY-MM-DD')<>value then raise exception 'invalid date';end if;
   exception when others then raise exception 'KH_ADMIN_INVALID';end;
  end if;
  filters:=jsonb_set(filters,array[entry.key],to_jsonb(value));
 end loop;
 if filters?'from' and filters?'to' and filters->>'from'>filters->>'to' then raise exception 'KH_ADMIN_INVALID';end if;
 if filters?'verificationState' and coalesce(filters->>'review','application')<>'verification' then raise exception 'KH_ADMIN_INVALID';end if;
 if p_section in('assistedCollaborators','assistedListings')then perform kh_private.assisted_actor(p_actor_id,true);end if;
 if p_section='messageReports' and filters->>'source'='agency' then perform kh_private.agency_account(p_actor_id);end if;

 if p_section in('review','listings')then
  source_sql:=$query$
   select case when $6='review' then jsonb_build_object(
    'id',p.id,'owner_id',p.owner_id,'client_request_id',p.client_request_id,'title',p.title,'location',p.location,'province',p.province,
    'latitude',p.latitude,'longitude',p.longitude,'location_precision',p.location_precision,'condition',p.condition,'floor',p.floor,'price_negotiable',p.price_negotiable,
    'price',p.price,'bedrooms',p.bedrooms,'bathrooms',p.bathrooms,'area',p.area,'type',p.type,'description',p.description,'amenities',p.amenities,'photo_paths',p.photo_paths,
    'availability',p.availability,'moderation',p.moderation,'review_note',p.review_note,'version',p.version,'created_at',p.created_at,'operation',p.operation,
    'swap_wants',p.swap_wants,'swap_provinces',p.swap_provinces,'swap_balance',p.swap_balance,'swap_amount',p.swap_amount,'rent_period',p.rent_period,'rent_min_stay',p.rent_min_stay,'wanted_operations',p.wanted_operations,'cover_thumb_path',p.cover_thumb_path)
   else jsonb_build_object('id',p.id,'title',p.title,'ownerId',p.owner_id,'ownerName',u.display_name,'moderation',p.moderation,'availability',p.availability,'version',p.version)end item,
   p.id::text sort_id,p.created_at sort_date,lower(p.title)sort_name
   from public.properties p join public.profiles u on u.id=p.owner_id
   where strpos(lower(concat_ws(' ',p.title,p.location,p.province,u.display_name)),lower($1))>0
   and(not $2?'moderation' or p.moderation=$2->>'moderation')and(not $2?'availability' or p.availability=$2->>'availability')
   and(not $2?'operation' or p.operation=$2->>'operation')and(not $2?'province' or p.province=$2->>'province')
   and(not $2?'origin' or case when exists(select 1 from kh_private.agency_property_origins o where o.property_id=p.id)then 'agency' when exists(select 1 from kh_private.assisted_listing_records r where r.property_id=p.id)then 'assisted' else 'personal'end=$2->>'origin')
  $query$;
 elsif p_section='accounts'then
  source_sql:=$query$
   select jsonb_build_object('id',p.id,'displayName',p.display_name,'role',r.role,'suspended',s.user_id is not null,'reason',s.reason)item,p.id::text sort_id,p.created_at sort_date,lower(p.display_name)sort_name
   from public.profiles p left join public.kh_admins a on a.user_id=p.id left join kh_private.account_suspensions s on s.user_id=p.id
   cross join lateral(select case when kh_private.is_owner(p.id)then 'owner' when a.user_id is not null then 'admin'else 'member'end role)r
   cross join lateral(select exists(select 1 from kh_private.agency_memberships m where m.user_id=p.id and m.state='active')agency,exists(select 1 from kh_private.assisted_collaborators c where c.account_id=p.id)assisted)b
   where strpos(lower(p.display_name),lower($1))>0 and(not $2?'status' or($2->>'status'='suspended')=(s.user_id is not null))and(not $2?'role' or r.role=$2->>'role')
   and(not $2?'link' or case $2->>'link' when 'agency'then b.agency when 'assisted'then b.assisted else not b.agency and not b.assisted end)
  $query$;
 elsif p_section='history'then
  source_sql:=$query$
   select jsonb_build_object('id',h.id::text,'actorName',h.actor_name,'action',h.action,'targetName',h.target_name,'reason',h.reason,'createdAt',h.created_at)item,lpad(h.id::text,20,'0')sort_id,h.created_at sort_date,h.target_name sort_name
   from kh_private.admin_audit h where strpos(lower(concat_ws(' ',h.actor_name,h.action,h.target_name,h.reason)),lower($1))>0
   and(not $2?'action' or h.action=$2->>'action')and(not $2?'actor' or h.actor_id=($2->>'actor')::uuid)
   and(not $2?'from' or h.created_at>=($2->>'from'||'T00:00:00Z')::timestamptz)and(not $2?'to' or h.created_at<($2->>'to'||'T00:00:00Z')::timestamptz+interval '1 day')
  $query$;
 elsif p_section='propertyReports'then
  source_sql:=$query$
   select jsonb_build_object('id',r.id,'propertyId',r.property_id,'propertyTitle',r.property_title,'reporterId',r.reporter_id,'ownerId',r.owner_id,'reason',r.reason,'details',r.details,'status',r.status,'unpublished',r.unpublished,'reviewNote',r.review_note,'createdAt',r.created_at,'propertyLive',exists(select 1 from public.properties p where p.id=r.property_id and p.moderation='approved' and p.availability='active'))item,
   r.id::text sort_id,r.created_at sort_date,r.property_title sort_name from public.kh_property_reports r
   where strpos(lower(concat_ws(' ',r.property_title,r.details,r.review_note)),lower($1))>0 and(not $2?'status' or r.status=$2->>'status')and(not $2?'reason' or r.reason=$2->>'reason')
   and(not $2?'from' or r.created_at>=($2->>'from'||'T00:00:00Z')::timestamptz)and(not $2?'to' or r.created_at<($2->>'to'||'T00:00:00Z')::timestamptz+interval '1 day')
  $query$;
 elsif p_section='messageReports'then
  if filters->>'source'='agency'then
   source_sql:=$query$
    select jsonb_build_object('id',r.id,'conversationId',r.conversation_id,'propertyTitle',r.property_title,'reporterId',r.reporter_id,'reportedUserId',r.reported_user_id,'reason',r.reason,'details',r.details,'status',r.status,'createdAt',r.created_at,'reviewNote',r.review_note,'context',r.context)item,r.id::text sort_id,r.created_at sort_date,r.property_title sort_name from kh_private.agency_message_reports r
   $query$;
  else
   source_sql:=$query$select kh_private.chat_report_json(r)item,r.id::text sort_id,r.created_at sort_date,r.property_title sort_name from public.kh_message_reports r $query$;
  end if;
  source_sql:=source_sql||$query$
   where strpos(lower(concat_ws(' ',r.property_title,r.details,r.review_note)),lower($1))>0 and(not $2?'status' or r.status=$2->>'status')and(not $2?'reason' or r.reason=$2->>'reason')
   and(not $2?'from' or r.created_at>=($2->>'from'||'T00:00:00Z')::timestamptz)and(not $2?'to' or r.created_at<($2->>'to'||'T00:00:00Z')::timestamptz+interval '1 day')
  $query$;
 elsif p_section='agencies'then
  source_sql:=$query$
   select jsonb_build_object('application',kh_private.agency_application_json(a.id),'request',case when v.id is null then null else kh_private.agency_verification_request_json(v.id)end)item,
   coalesce(v.id,a.id)::text sort_id,coalesce(v.created_at,a.created_at)sort_date,lower(a.trade_name)sort_name
   from kh_private.agencies a join kh_private.agency_applications app on app.agency_id=a.id
   left join kh_private.agency_verification_requests v on v.agency_id=a.id and $2->>'review'='verification' and $2?'verificationState' and v.state=$2->>'verificationState'
   where strpos(lower(concat_ws(' ',a.trade_name,app.input->>'responsibleFullName',app.input->>'province',app.input->>'municipality')),lower($1))>0
   and(not $2?'state' or a.state=$2->>'state')and(not $2?'province' or app.input->>'province'=$2->>'province')
   and(not $2?'verified' or (kh_private.agency_summary(a.id)->>'verified')::boolean=($2->>'verified')::boolean)
   and(not $2?'verificationState' or v.id is not null)
  $query$;
 elsif p_section='assistedCollaborators'then
  source_sql:=$query$
   select jsonb_build_object('id',c.id,'kind',c.kind,'privateName',c.private_name,'privateContact',c.private_contact,'contactChannel',c.contact_channel,'accountId',c.account_id,'linkEvidenceReference',c.link_evidence_reference,'version',c.version,'state',c.state)item,c.id::text sort_id,c.created_at sort_date,lower(c.private_name)sort_name
   from kh_private.assisted_collaborators c where strpos(lower(concat_ws(' ',c.private_name,c.private_contact,c.contact_channel)),lower($1))>0
   and(not $2?'kind' or c.kind=$2->>'kind')and(not $2?'state' or c.state=$2->>'state')and(not $2?'link' or($2->>'link'='linked')=(c.account_id is not null))
  $query$;
 else
  source_sql:=$query$
   select jsonb_build_object('id',p.id,'title',p.title,'ownerId',p.owner_id,'version',p.version,'provenanceVersion',r.version,'moderation',p.moderation,'availability',p.availability,'collaboratorId',r.collaborator_id,'collaboratorReference',r.collaborator_reference,'lastConfirmedAt',r.last_confirmed_at,'eligible',e.eligible)item,p.id::text sort_id,p.created_at sort_date,lower(p.title)sort_name
   from public.properties p join kh_private.assisted_listing_records r on r.property_id=p.id
   cross join lateral(select p.owner_id=$3 and p.moderation='approved' and p.availability in('active','paused')and r.consent_revoked_at is null and kh_private.assisted_record_complete(r)
   and exists(select 1 from kh_private.assisted_collaborators c join auth.users u on u.id=c.account_id join public.profiles pr on pr.id=u.id where c.id=r.collaborator_id and c.state='active' and c.link_confirmed_at is not null and u.email_confirmed_at is not null and not kh_private.is_suspended(u.id)and not kh_private.is_deleting(u.id))eligible)e
   where strpos(lower(concat_ws(' ',p.title,r.collaborator_reference)),lower($1))>0 and(not $2?'collaboratorId' or r.collaborator_id=($2->>'collaboratorId')::uuid)
   and(not $2?'moderation' or p.moderation=$2->>'moderation')and(not $2?'availability' or p.availability=$2->>'availability')and(not $2?'eligible' or e.eligible=($2->>'eligible')::boolean)
  $query$;
 end if;
 order_sql:=case p_sort when 'name'then 'sort_name asc,sort_id asc'when 'oldest'then 'sort_date asc,sort_id asc'else 'sort_date desc,sort_id desc'end;
 -- SQL text comes solely from fixed section branches and fixed sort expressions.
 -- User query/filter/actor values remain bound parameters, including count's universe.
 execute format('with filtered as materialized(%s),paged as(select item,row_number()over(order by %s)n from filtered order by %s offset $4 limit $5)select jsonb_build_object(''items'',coalesce((select jsonb_agg(item order by n)from paged),''[]''::jsonb),''total'',(select count(*)from filtered),''hasMore'',(select count(*)from filtered)>$4+$5)',source_sql,order_sql,order_sql)
 into result using btrim(p_query),filters,p_actor_id,p_offset,p_limit,p_section;
 return result;
end $$;
revoke all on function public.kh_admin_query(uuid,text,text,jsonb,integer,integer,text)from public,anon,authenticated;
grant execute on function public.kh_admin_query(uuid,text,text,jsonb,integer,integer,text)to authenticated;

-- Small dashboard projection: no list hydration, account details or private evidence.
create function public.kh_admin_dashboard(p_actor_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare owner_only boolean;
begin
 perform kh_private.admin_actor(p_actor_id);
 -- The enterprise count follows the same admission as enterprise report reads.
 perform kh_private.agency_account(p_actor_id);
 owner_only:=kh_private.is_owner(p_actor_id);
 return jsonb_build_object(
  'review',(select count(*)from public.properties where moderation='pending'),
  'propertyReports',(select count(*)from public.kh_property_reports where status='open'),
  'messageReports',(select count(*)from public.kh_message_reports where status='open')+(select count(*)from kh_private.agency_message_reports where status='open'),
  'agencies',case when owner_only then(select count(*)from kh_private.agencies where state='pending')else null end,
  'verification',case when owner_only then(select count(*)from kh_private.agency_verification_requests where state='pending')else null end
 );
end $$;
revoke all on function public.kh_admin_dashboard(uuid)from public,anon,authenticated;
grant execute on function public.kh_admin_dashboard(uuid)to authenticated;

-- Reachable actor filter without account hydration or UUID entry. Retained audit
-- identities survive deletion; a current account uses its current profile name.
create function public.kh_admin_history_actors(p_actor_id uuid)returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform kh_private.admin_actor(p_actor_id);
 if kh_private.is_deleting(p_actor_id)then raise exception 'KH_ACCOUNT_DELETING';end if;
 with latest as(
  select distinct on(actor_id)actor_id,actor_name from kh_private.admin_audit where actor_id is not null order by actor_id,created_at desc,id desc
 ),actors as(
  select actor_id id from latest
  union select user_id from public.kh_admins where not kh_private.is_suspended(user_id)and not kh_private.is_deleting(user_id)
  union select user_id from kh_private.platform_owner
 ),names as(
  select a.id,coalesce(p.display_name,l.actor_name)display_name from actors a left join public.profiles p on p.id=a.id left join latest l on l.actor_id=a.id
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'displayName',display_name)order by lower(display_name),id),'[]'::jsonb)
 into result from names where display_name is not null;
 return result;
end $$;
revoke all on function public.kh_admin_history_actors(uuid)from public,anon,authenticated;
grant execute on function public.kh_admin_history_actors(uuid)to authenticated;
notify pgrst,'reload schema';
