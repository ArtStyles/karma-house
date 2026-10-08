create table kh_private.agency_invitations(
 id uuid primary key default gen_random_uuid(),agency_id uuid not null references kh_private.agencies(id),recipient_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in('manager','coordinator','admin')),state text not null default 'pending' check(state in('pending','accepted','declined','cancelled','expired')),
 version integer not null default 1,invited_by uuid,expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
alter table kh_private.agency_invitations enable row level security;
revoke all on kh_private.agency_invitations from public,anon,authenticated;
grant all on kh_private.agency_invitations to service_role;
create function kh_private.agency_text(v jsonb,min_length integer,max_length integer) returns text language plpgsql immutable set search_path='' as $$declare t text;begin
 if jsonb_typeof(v) is distinct from 'string' then raise exception 'KH_AGENCY_INVALID';end if;t:=btrim(v#>>'{}');if char_length(t)<min_length or char_length(t)>max_length then raise exception 'KH_AGENCY_INVALID';end if;return t;end$$;
create function kh_private.agency_references(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare item jsonb;result jsonb:='[]';begin
 if jsonb_typeof(v) is distinct from 'array' or jsonb_array_length(v)>5 then raise exception 'KH_AGENCY_INVALID';end if;
 for item in select value from jsonb_array_elements(v)loop result:=result||jsonb_build_array(kh_private.agency_text(item,1,500));end loop;return result;end$$;
create function kh_private.agency_validate_application(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$declare phone text;province text;zones jsonb:='[]';item jsonb;address text;begin
 if jsonb_typeof(v) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v)k where k not in('tradeName','responsibleFullName','businessPhone','province','municipality','serviceAreas','description','officeAddress','publishOfficeAddress','evidenceReferences')) then raise exception 'KH_AGENCY_INVALID';end if;
 phone:=regexp_replace(kh_private.agency_text(v->'businessPhone',9,30),'[[:space:]()-]','','g');if phone!~'^\+[0-9]{8,15}$' then raise exception 'KH_AGENCY_INVALID';end if;
 province:=kh_private.agency_text(v->'province',2,80);if province not in('Pinar del Río','Artemisa','La Habana','Mayabeque','Matanzas','Villa Clara','Cienfuegos','Sancti Spíritus','Ciego de Ávila','Camagüey','Las Tunas','Holguín','Granma','Santiago de Cuba','Guantánamo','Isla de la Juventud')then raise exception 'KH_AGENCY_INVALID';end if;
 if jsonb_typeof(v->'serviceAreas') is distinct from 'array' or jsonb_array_length(v->'serviceAreas') not between 1 and 20 then raise exception 'KH_AGENCY_INVALID';end if;
 for item in select value from jsonb_array_elements(v->'serviceAreas')loop zones:=zones||jsonb_build_array(kh_private.agency_text(item,2,80));end loop;
 if (select count(*)<>count(distinct lower(value)) from jsonb_array_elements_text(zones))then raise exception 'KH_AGENCY_INVALID';end if;
 if jsonb_typeof(v->'publishOfficeAddress') is distinct from 'boolean' then raise exception 'KH_AGENCY_INVALID';end if;
 if v->'officeAddress' is distinct from 'null'::jsonb then address:=nullif(kh_private.agency_text(v->'officeAddress',0,200),'');end if;
 if (v->>'publishOfficeAddress')::boolean and address is null then raise exception 'KH_AGENCY_INVALID';end if;
 return jsonb_build_object('tradeName',kh_private.agency_text(v->'tradeName',2,120),'responsibleFullName',kh_private.agency_text(v->'responsibleFullName',2,160),'businessPhone',phone,'province',province,'municipality',kh_private.agency_text(v->'municipality',2,80),'serviceAreas',zones,'description',kh_private.agency_text(v->'description',20,1000),'officeAddress',address,'publishOfficeAddress',(v->>'publishOfficeAddress')::boolean,'evidenceReferences',kh_private.agency_references(v->'evidenceReferences'));
end$$;
create function kh_private.agency_signup() returns trigger language plpgsql security definer set search_path='' as $$declare input jsonb;a uuid;begin
 if new.raw_user_meta_data->>'registration_intent'='agency' then
  perform kh_private.agency_require_enabled();
  if not(select enabled from kh_private.agency_settings where singleton)then raise exception 'KH_AGENCY_DISABLED';end if;
  -- Copy the allowlist only. Other Auth metadata cannot set status or verification.
  select jsonb_object_agg(key,value) into input from jsonb_each(new.raw_user_meta_data->'agency_application')where key in('tradeName','responsibleFullName','businessPhone','province','municipality','serviceAreas','description','officeAddress','publishOfficeAddress','evidenceReferences');
  input:=kh_private.agency_validate_application(input);
  insert into kh_private.agencies(trade_name)values(input->>'tradeName')returning id into a;
  insert into kh_private.agency_applications(agency_id,responsible_id,input)values(a,new.id,input);
 end if;return new;
end$$;
create trigger kh_agency_auth_signup after insert on auth.users for each row execute function kh_private.agency_signup();
create function kh_private.agency_application_json(a uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('agency',kh_private.agency_summary(a),'input',r.input,'reviewNote',r.review_note,'emailConfirmed',u.email_confirmed_at is not null)from kh_private.agency_applications r left join auth.users u on u.id=r.responsible_id where r.agency_id=a;
$$;
create function public.kh_agency_application(p_actor_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a uuid;begin perform kh_private.agency_account(p_actor_id);select agency_id into a from kh_private.agency_applications where responsible_id=p_actor_id;return kh_private.agency_application_json(a);end$$;
create function public.kh_submit_agency_application(p_actor_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare a uuid;v integer;v_input jsonb;receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_account(p_actor_id);select agency_id into a from kh_private.agency_applications where responsible_id=p_actor_id;if a is null then raise exception 'KH_AGENCY_APPLICATION_REQUIRED';end if;perform kh_private.agency_lock(a);
 receipt:=kh_private.agency_receipt(p_actor_id,a,'submit_application',p_payload);if receipt is not null then return kh_private.agency_application_json(a);end if;
 select version into v from kh_private.agencies where id=a and state in('pending','needs_changes','rejected');if v is null or v is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 v_input:=kh_private.agency_validate_application(p_payload->'input');update kh_private.agency_applications set input=v_input,submitted_at=now(),review_note=null where agency_id=a;
 update kh_private.agencies set trade_name=v_input->>'tradeName',state='pending',version=version+1,updated_at=now()where id=a;
 insert into kh_private.agency_events(agency_id,actor_id,kind)values(a,p_actor_id,'agency_application_submitted');
 return kh_private.agency_remember(p_actor_id,a,'submit_application',p_payload,kh_private.agency_application_json(a));
end$$;
create function public.kh_review_agency(p_actor_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare a uuid:=(p_payload->>'agencyId')::uuid;decision text:=p_payload->>'decision';target uuid;v_state text;v integer;receipt jsonb;note text;begin
 perform kh_private.admin_actor(p_actor_id,true);select responsible_id into target from kh_private.agency_applications where agency_id=a;
 if target is not null then perform pg_advisory_xact_lock(hashtextextended('kh:account:'||target::text,0));end if;perform kh_private.agency_lock(a);
 receipt:=kh_private.agency_receipt(p_actor_id,a,'review_agency',p_payload);if receipt is not null then return kh_private.agency_summary(a);end if;
 select q.version,q.state into v,v_state from kh_private.agencies q where id=a;if v is distinct from (p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 note:=kh_private.agency_text(p_payload->'note',3,1000);
 if decision='approve' then
  if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null)then raise exception 'KH_EMAIL_UNCONFIRMED';end if;
  if kh_private.is_suspended(target)or kh_private.is_deleting(target)then raise exception 'KH_ACCOUNT_SUSPENDED';end if;
  v_state:='approved';insert into kh_private.agency_memberships(agency_id,user_id,role)values(a,target,'admin')on conflict(agency_id,user_id)do update set role='admin',state='active',version=kh_private.agency_memberships.version+1;
 elsif decision='needs_changes' and v_state in('pending','needs_changes','rejected')then v_state:='needs_changes';
 elsif decision='reject' and v_state in('pending','needs_changes','rejected')then v_state:='rejected';
 elsif decision='suspend' and v_state='approved' then
  v_state:='suspended';update kh_private.agency_invitations set state='cancelled',version=version+1 where agency_id=a and state='pending';
  update kh_private.agency_verification_requests set state='cancelled',review_note=note,reviewed_by=p_actor_id,reviewed_at=now(),version=version+1 where agency_id=a and state in('pending','needs_changes');
  update kh_private.agency_verifications set active=false,revoked_by=p_actor_id,revoked_at=now(),reason=note where agency_id=a and active;
  update kh_private.agencies set verification_version=verification_version+1 where id=a;
 else raise exception 'KH_AGENCY_INVALID_DECISION';end if;
 update kh_private.agencies set state=v_state,version=version+1,updated_at=now()where id=a;
 update kh_private.agency_applications set review_note=note,reviewed_by=p_actor_id,reviewed_at=now()where agency_id=a;
 insert into kh_private.agency_events(agency_id,actor_id,kind,payload)values(a,p_actor_id,'agency_review',jsonb_build_object('decision',decision,'note',note));
 return kh_private.agency_remember(p_actor_id,a,'review_agency',p_payload,kh_private.agency_summary(a));
end$$;
create function public.kh_list_my_agencies(p_actor_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$begin perform kh_private.agency_account(p_actor_id);return coalesce((select jsonb_agg(kh_private.agency_summary(a.id)order by a.trade_name,a.id)from kh_private.agencies a where exists(select 1 from kh_private.agency_memberships m where m.agency_id=a.id and m.user_id=p_actor_id and m.state='active')),'[]');end$$;
create function public.kh_list_agency_reviews(p_actor_id uuid,p_state text,p_offset integer default 0,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare items jsonb;begin perform kh_private.admin_actor(p_actor_id,true);
 select coalesce(jsonb_agg(kh_private.agency_application_json(id)order by created_at,id),'[]')into items from(select id,created_at from kh_private.agencies where state=p_state order by created_at,id offset greatest(p_offset,0)limit least(greatest(p_limit,1),50))q;
 return jsonb_build_object('items',items,'hasMore',exists(select 1 from kh_private.agencies where state=p_state offset greatest(p_offset,0)+least(greatest(p_limit,1),50)));end$$;

create function kh_private.agency_verification_request_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',r.id,'agencyId',r.agency_id,'input',r.input,'state',r.state,'reviewNote',r.review_note,'version',r.version,'createdAt',r.created_at,'reviewedAt',r.reviewed_at)from kh_private.agency_verification_requests r where r.id=p_id;
$$;
create function public.kh_agency_verification_request(p_actor_id uuid,p_agency_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'admin');select id into v_id from kh_private.agency_verification_requests where agency_id=p_agency_id order by created_at desc,id desc limit 1;return kh_private.agency_verification_request_json(v_id);end$$;
create function public.kh_request_agency_verification(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid:=(p_payload->>'requestId')::uuid;v_input jsonb;v_receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 v_receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'request_verification',p_payload);if v_receipt is not null then return kh_private.agency_verification_request_json((v_receipt->>'id')::uuid);end if;
 if(kh_private.agency_summary(p_agency_id)->>'verified')::boolean then raise exception 'KH_AGENCY_ALREADY_VERIFIED';end if;
 v_input:=p_payload->'input';if jsonb_typeof(v_input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(v_input)k where k not in('message','evidenceReferences'))then raise exception 'KH_AGENCY_INVALID';end if;
 v_input:=jsonb_build_object('message',kh_private.agency_text(v_input->'message',20,1000),'evidenceReferences',kh_private.agency_references(v_input->'evidenceReferences'));
 if v_id is null then
  if exists(select 1 from kh_private.agency_verification_requests where agency_id=p_agency_id and state in('pending','needs_changes'))then raise exception 'KH_AGENCY_VERIFICATION_REQUEST_OPEN';end if;
  insert into kh_private.agency_verification_requests(agency_id,input,created_by)values(p_agency_id,v_input,p_actor_id)returning id into v_id;
 else
  update kh_private.agency_verification_requests set input=v_input,state='pending',review_note=null,reviewed_at=null,reviewed_by=null,version=version+1 where id=v_id and agency_id=p_agency_id and state='needs_changes' and version=(p_payload->>'expectedVersion')::integer;
  if not found then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 end if;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency_id,p_actor_id,'agency_verification_requested',v_id);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'request_verification',p_payload,kh_private.agency_verification_request_json(v_id));
end$$;
create function public.kh_review_agency_verification(p_actor_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_agency uuid:=(p_payload->>'agencyId')::uuid;v_request uuid:=(p_payload->>'requestId')::uuid;v_decision text:=p_payload->>'decision';v_note text;v_receipt jsonb;v_result jsonb;begin
 perform kh_private.admin_actor(p_actor_id,true);perform kh_private.agency_lock(v_agency);
 v_receipt:=kh_private.agency_receipt(p_actor_id,v_agency,'review_verification',p_payload);if v_receipt is not null then return jsonb_build_object('agency',kh_private.agency_summary(v_agency),'request',kh_private.agency_verification_request_json((v_receipt->'request'->>'id')::uuid));end if;
 if not exists(select 1 from kh_private.agencies where id=v_agency and version=(p_payload->>'expectedAgencyVersion')::integer and verification_version=(p_payload->>'expectedVerificationVersion')::integer)then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 v_note:=kh_private.agency_text(p_payload->'note',3,1000);
 if v_request is not null and not exists(select 1 from kh_private.agency_verification_requests where id=v_request and agency_id=v_agency and version=(p_payload->>'expectedRequestVersion')::integer and state in('pending','needs_changes'))then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if v_decision='grant' then
  if not exists(select 1 from kh_private.agencies where id=v_agency and state='approved')then raise exception 'KH_AGENCY_NOT_APPROVED';end if;
  insert into kh_private.agency_verifications(agency_id,active,granted_by,granted_at,reason)values(v_agency,true,p_actor_id,now(),v_note)on conflict(agency_id)do update set active=true,granted_by=p_actor_id,granted_at=now(),revoked_by=null,revoked_at=null,reason=v_note;
  if v_request is null then select id into v_request from kh_private.agency_verification_requests where agency_id=v_agency and state in('pending','needs_changes');end if;
  update kh_private.agency_verification_requests set state='approved',review_note=v_note,reviewed_by=p_actor_id,reviewed_at=now(),version=version+1 where id=v_request;
 elsif v_decision in('needs_changes','reject')then
  if v_request is null then raise exception 'KH_AGENCY_VERIFICATION_REQUEST_REQUIRED';end if;
  update kh_private.agency_verification_requests set state=case when v_decision='reject' then 'rejected' else 'needs_changes' end,review_note=v_note,reviewed_by=p_actor_id,reviewed_at=now(),version=version+1 where id=v_request;
 elsif v_decision='revoke' then
  update kh_private.agency_verifications set active=false,revoked_by=p_actor_id,revoked_at=now(),reason=v_note where agency_id=v_agency;
 else raise exception 'KH_AGENCY_INVALID_DECISION';end if;
 update kh_private.agencies set verification_version=verification_version+1,updated_at=now()where id=v_agency;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(v_agency,p_actor_id,'agency_verification_decision',v_request,jsonb_build_object('decision',v_decision,'note',v_note));
 v_result:=jsonb_build_object('agency',kh_private.agency_summary(v_agency),'request',kh_private.agency_verification_request_json(v_request));return kh_private.agency_remember(p_actor_id,v_agency,'review_verification',p_payload,v_result);
end$$;
create function public.kh_list_agency_verification_reviews(p_actor_id uuid,p_state text,p_offset integer default 0,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare v_items jsonb;begin
 perform kh_private.admin_actor(p_actor_id,true);
 select coalesce(jsonb_agg(kh_private.agency_verification_request_json(id)order by created_at,id),'[]')into v_items from(select id,created_at from kh_private.agency_verification_requests where state=p_state order by created_at,id offset greatest(p_offset,0)limit least(greatest(p_limit,1),50))q;
 return jsonb_build_object('items',v_items,'hasMore',exists(select 1 from kh_private.agency_verification_requests where state=p_state offset greatest(p_offset,0)+least(greatest(p_limit,1),50)));
end$$;
create function kh_private.agency_lock_accounts(p_actor uuid,p_target uuid)returns void language plpgsql security definer set search_path='' as $$declare v_user uuid;begin
 if auth.uid() is null or auth.uid() is distinct from p_actor then raise exception 'KH_ACCOUNT_CHANGED';end if;
 for v_user in select distinct u from unnest(array[p_actor,p_target])u where u is not null order by u loop perform pg_advisory_xact_lock(hashtextextended('kh:account:'||v_user::text,0));end loop;
end$$;
create function kh_private.agency_invitation_json(p_id uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'agencyId',i.agency_id,'agencyName',(select a.trade_name from kh_private.agencies a where a.id=i.agency_id),'recipientId',i.recipient_id,'role',i.role,'state',case when i.state='pending' and i.expires_at<=now()then 'expired'else i.state end,'version',i.version,'expiresAt',i.expires_at)from kh_private.agency_invitations i where i.id=p_id;
$$;
create function kh_private.agency_membership_json(p_agency uuid,p_user uuid)returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('agencyId',m.agency_id,'userId',m.user_id,'displayName',coalesce((select p.display_name from public.profiles p where p.id=m.user_id),'Cuenta retirada'),'role',m.role,'state',m.state,'version',m.version)from kh_private.agency_memberships m where m.agency_id=p_agency and m.user_id=p_user;
$$;
create function public.kh_agency_membership(p_actor_id uuid,p_agency_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$begin perform kh_private.agency_account(p_actor_id);return kh_private.agency_membership_json(p_agency_id,p_actor_id);end$$;
create function public.kh_agency_invitation_candidate(p_actor_id uuid,p_agency_id uuid,p_user_id uuid)returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 return(select jsonb_build_object('id',u.id,'displayName',p.display_name,'canInvite',u.email_confirmed_at is not null and not kh_private.is_suspended(u.id)and not kh_private.is_deleting(u.id)and not exists(select 1 from kh_private.agency_memberships m where m.agency_id=p_agency_id and m.user_id=u.id and m.state='active'))from auth.users u join public.profiles p on p.id=u.id where u.id=p_user_id);
end$$;
create function public.kh_invite_agency_member(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_user uuid:=(p_payload->>'userId')::uuid;v_role text:=p_payload->>'role';v_id uuid;v_receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_lock_accounts(p_actor_id,v_user);perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 v_receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'invite_member',p_payload);if v_receipt is not null then return kh_private.agency_invitation_json((v_receipt->>'id')::uuid);end if;
 if v_role is null or v_role not in('manager','coordinator','admin')then raise exception 'KH_AGENCY_INVALID';end if;
 if not exists(select 1 from auth.users where id=v_user and email_confirmed_at is not null)or kh_private.is_suspended(v_user)or kh_private.is_deleting(v_user)then raise exception 'KH_AGENCY_RECIPIENT_INVALID';end if;
 if exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and user_id=v_user and state='active')then raise exception 'KH_AGENCY_ALREADY_MEMBER';end if;
 if exists(select 1 from kh_private.agency_invitations where agency_id=p_agency_id and recipient_id=v_user and state='pending' and expires_at>now())then raise exception 'KH_AGENCY_INVITATION_OPEN';end if;
 update kh_private.agency_invitations set state='expired',version=version+1 where agency_id=p_agency_id and recipient_id=v_user and state='pending' and expires_at<=now();
 insert into kh_private.agency_invitations(agency_id,recipient_id,role,invited_by)values(p_agency_id,v_user,v_role,p_actor_id)returning id into v_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id,payload)values(p_agency_id,p_actor_id,'team_invitation',v_id,jsonb_build_object('recipientId',v_user));
 return kh_private.agency_remember(p_actor_id,p_agency_id,'invite_member',p_payload,kh_private.agency_invitation_json(v_id));
end$$;
create function public.kh_decide_agency_invitation(p_actor_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid:=(p_payload->>'invitationId')::uuid;v_invite kh_private.agency_invitations;v_receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_account(p_actor_id);select * into v_invite from kh_private.agency_invitations where id=v_id;
 if v_invite.recipient_id is distinct from p_actor_id then raise exception 'KH_AGENCY_INVITATION_RECIPIENT';end if;perform kh_private.agency_lock(v_invite.agency_id);
 select * into v_invite from kh_private.agency_invitations where id=v_id;
 v_receipt:=kh_private.agency_receipt(p_actor_id,v_invite.agency_id,'decide_invitation',p_payload);if v_receipt is not null then return kh_private.agency_invitation_json(v_id);end if;
 if not(select enabled from kh_private.agency_settings where singleton)then raise exception 'KH_AGENCY_DISABLED';end if;
 if not exists(select 1 from kh_private.agencies where id=v_invite.agency_id and state='approved')then raise exception 'KH_AGENCY_NOT_APPROVED';end if;
 if v_invite.version is distinct from (p_payload->>'expectedVersion')::integer or v_invite.state<>'pending'then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if v_invite.expires_at<=now()then raise exception 'KH_AGENCY_INVITATION_EXPIRED';end if;
 if jsonb_typeof(p_payload->'accept') is distinct from 'boolean'then raise exception 'KH_AGENCY_INVALID';end if;
 if(p_payload->>'accept')::boolean then
  if not exists(select 1 from kh_private.agency_memberships where agency_id=v_invite.agency_id and user_id=p_actor_id and state='active')then
   insert into kh_private.agency_memberships(agency_id,user_id,role)values(v_invite.agency_id,p_actor_id,v_invite.role)on conflict(agency_id,user_id)do update set role=v_invite.role,state='active',version=kh_private.agency_memberships.version+1;
  end if;
 end if;
 update kh_private.agency_invitations set state=case when(p_payload->>'accept')::boolean then 'accepted'else 'declined'end,version=version+1 where id=v_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(v_invite.agency_id,p_actor_id,'team_invitation_decision',v_id);
 return kh_private.agency_remember(p_actor_id,v_invite.agency_id,'decide_invitation',p_payload,kh_private.agency_invitation_json(v_id));
end$$;
create function kh_private.agency_change_member(p_actor uuid,p_agency uuid,p_payload jsonb,p_remove boolean)returns jsonb language plpgsql security definer set search_path='' as $$declare v_user uuid:=(p_payload->>'userId')::uuid;v_role text:=p_payload->>'role';v_member kh_private.agency_memberships;v_receipt jsonb;v_operation text:=case when p_remove then 'remove_member'else 'set_member_role'end;begin
 perform kh_private.agency_lock_accounts(p_actor,v_user);perform kh_private.agency_actor(p_actor,p_agency,'admin');
 v_receipt:=kh_private.agency_receipt(p_actor,p_agency,v_operation,p_payload);if v_receipt is not null then return kh_private.agency_membership_json(p_agency,v_user);end if;
 select * into v_member from kh_private.agency_memberships where agency_id=p_agency and user_id=v_user;
 if v_member.state is distinct from 'active'or v_member.version is distinct from(p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if not p_remove and (v_role is null or v_role not in('manager','coordinator','admin'))then raise exception 'KH_AGENCY_INVALID';end if;
 if v_member.role='admin' and(p_remove or v_role<>'admin')and not exists(select 1 from kh_private.agency_memberships m join auth.users u on u.id=m.user_id where m.agency_id=p_agency and m.user_id<>v_user and m.role='admin'and m.state='active'and u.email_confirmed_at is not null and not kh_private.is_suspended(m.user_id)and not kh_private.is_deleting(m.user_id))then raise exception 'KH_AGENCY_LAST_ADMIN';end if;
 update kh_private.agency_memberships set state=case when p_remove then 'removed'else 'active'end,role=case when p_remove then role else v_role end,version=version+1 where agency_id=p_agency and user_id=v_user;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency,p_actor,v_operation,v_user);
 return kh_private.agency_remember(p_actor,p_agency,v_operation,p_payload,kh_private.agency_membership_json(p_agency,v_user));
end$$;
create function public.kh_set_agency_member_role(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_require_enabled(); return kh_private.agency_change_member(p_actor_id,p_agency_id,p_payload,false);end$$;
create function public.kh_remove_agency_member(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_require_enabled(); return kh_private.agency_change_member(p_actor_id,p_agency_id,p_payload,true);end$$;
create function public.kh_list_agency_members(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare v_items jsonb;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');select coalesce(jsonb_agg(kh_private.agency_membership_json(p_agency_id,user_id)order by user_id),'[]')into v_items from(select user_id from kh_private.agency_memberships where agency_id=p_agency_id and state='active'order by user_id offset greatest(p_offset,0)limit least(greatest(p_limit,1),50))q;
 return jsonb_build_object('items',v_items,'hasMore',exists(select 1 from kh_private.agency_memberships where agency_id=p_agency_id and state='active'offset greatest(p_offset,0)+least(greatest(p_limit,1),50)));end$$;
create function public.kh_list_agency_invitations(p_actor_id uuid,p_offset integer default 0,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare v_items jsonb;begin
 perform kh_private.agency_account(p_actor_id);select coalesce(jsonb_agg(kh_private.agency_invitation_json(id)order by created_at desc,id),'[]')into v_items from(select id,created_at from kh_private.agency_invitations where recipient_id=p_actor_id order by created_at desc,id offset greatest(p_offset,0)limit least(greatest(p_limit,1),50))q;
 return jsonb_build_object('items',v_items,'hasMore',exists(select 1 from kh_private.agency_invitations where recipient_id=p_actor_id offset greatest(p_offset,0)+least(greatest(p_limit,1),50)));end$$;
-- Private helpers have no direct client grants; only account-bound public RPCs are callable.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature,n.nspname ns from pg_proc p join pg_namespace n on n.oid=p.pronamespace where(n.nspname='kh_private' and p.proname like 'agency_%')or(n.nspname='public'and p.proname like 'kh_%agency%')loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.ns='public'then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end$$;


-- Signup cannot call confirmed-account capabilities. Expose no account or agency data.
create function public.kh_agency_registration_available() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(coalesce((select enabled from kh_private.agency_settings where singleton),false));
$$;
revoke all on function public.kh_agency_registration_available() from public;
grant execute on function public.kh_agency_registration_available() to anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('agency-assets','agency-assets',false,1048576,array['image/jpeg']);
create function kh_private.agency_logo_scope(p_path text) returns uuid language plpgsql immutable set search_path='' as $$begin
 if p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then return null;end if;
 return split_part(p_path,'/',1)::uuid;
end$$;
create function kh_private.agency_asset_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agencies a where a.id=kh_private.agency_logo_scope(p_path)and(
 (a.state='approved' and a.logo_path=p_path)or
 (auth.uid() is not null and (exists(select 1 from kh_private.platform_owner o where o.singleton and o.user_id=auth.uid()) or exists(select 1 from kh_private.agency_applications r where r.agency_id=a.id and r.responsible_id=auth.uid())))));
$$;
create function kh_private.agency_asset_write(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agency_settings where singleton and enabled) and auth.uid() is not null and exists(select 1 from kh_private.agency_applications r join kh_private.agencies a on a.id=r.agency_id join auth.users u on u.id=r.responsible_id
 where a.id=kh_private.agency_logo_scope(p_path)and r.responsible_id=auth.uid()and a.state in('pending','needs_changes','rejected')and u.email_confirmed_at is not null and not kh_private.is_suspended(auth.uid())and not kh_private.is_deleting(auth.uid()));
$$;
revoke all on function kh_private.agency_logo_scope(text),kh_private.agency_asset_read(text),kh_private.agency_asset_write(text) from public;
grant execute on function kh_private.agency_asset_read(text) to anon,authenticated;
grant execute on function kh_private.agency_asset_write(text) to authenticated;
create function kh_private.agency_asset_unreferenced(p_path text) returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from kh_private.agencies where logo_path=p_path)$$;
revoke all on function kh_private.agency_asset_unreferenced(text) from public;grant execute on function kh_private.agency_asset_unreferenced(text) to authenticated;
create policy kh_agency_assets_read on storage.objects for select to anon,authenticated using(bucket_id='agency-assets' and kh_private.agency_asset_read(name));
create policy kh_agency_assets_insert on storage.objects for insert to authenticated with check(bucket_id='agency-assets' and kh_private.agency_asset_write(name));
create policy kh_agency_assets_delete on storage.objects for delete to authenticated using(bucket_id='agency-assets' and kh_private.agency_asset_write(name)and kh_private.agency_asset_unreferenced(name));
create function public.kh_set_agency_logo(p_actor_id uuid,p_agency_id uuid,p_path text,p_expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_account(p_actor_id);perform kh_private.agency_lock(p_agency_id);
 if not exists(select 1 from kh_private.agency_applications where agency_id=p_agency_id and responsible_id=p_actor_id)then raise exception 'KH_AGENCY_APPLICANT_REQUIRED';end if;
 if not exists(select 1 from kh_private.agencies where id=p_agency_id and state in('pending','needs_changes','rejected')and version=p_expected_version)then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if kh_private.agency_logo_scope(p_path)is distinct from p_agency_id or not exists(select 1 from storage.objects where bucket_id='agency-assets' and name=p_path and metadata->>'mimetype'='image/jpeg'and (metadata->>'size')::bigint between 1 and 1048576)then raise exception 'KH_AGENCY_LOGO_INVALID';end if;
 update kh_private.agencies set logo_path=p_path,version=version+1,updated_at=now()where id=p_agency_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind)values(p_agency_id,p_actor_id,'agency_logo_updated');return kh_private.agency_application_json(p_agency_id);
end$$;
revoke all on function public.kh_set_agency_logo(uuid,uuid,text,integer) from public;
grant execute on function public.kh_set_agency_logo(uuid,uuid,text,integer) to authenticated;

create function public.kh_agency_review_detail(p_actor_id uuid,p_agency_id uuid,p_request_id uuid default null)returns jsonb language plpgsql security definer set search_path='' as $$declare r uuid;begin
 perform kh_private.admin_actor(p_actor_id,true);
 if not exists(select 1 from kh_private.agencies where id=p_agency_id)then raise exception 'KH_AGENCY_REQUIRED';end if;
 select id into r from kh_private.agency_verification_requests where agency_id=p_agency_id and(p_request_id is null or id=p_request_id) order by created_at desc,id desc limit 1;
 if p_request_id is not null and r is null then raise exception 'KH_AGENCY_VERIFICATION_REQUEST_REQUIRED';end if;
 return jsonb_build_object('application',kh_private.agency_application_json(p_agency_id),'request',kh_private.agency_verification_request_json(r));
end$$;
revoke all on function public.kh_agency_review_detail(uuid,uuid,uuid) from public;
grant execute on function public.kh_agency_review_detail(uuid,uuid,uuid) to authenticated;

-- Commercial maintenance is distinct from the immutable reviewed application.
alter table kh_private.agencies add column commercial_profile jsonb;
create function kh_private.agency_profile_input(a uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(q.commercial_profile,r.input-array['responsibleFullName','evidenceReferences']) from kh_private.agencies q join kh_private.agency_applications r on r.agency_id=q.id where q.id=a
$$;
create function public.kh_get_agency_profile(p_actor_id uuid,p_agency_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'admin');
 return (select jsonb_build_object('agencyId',id,'version',version,'logoPath',logo_path,'input',kh_private.agency_profile_input(id)) from kh_private.agencies where id=p_agency_id);
end$$;
create function public.kh_public_agency_profile(p_agency_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('agencyId',a.id,'tradeName',a.trade_name,'businessPhone',v->>'businessPhone','province',v->>'province','municipality',v->>'municipality','serviceAreas',v->'serviceAreas','description',v->>'description','logoPath',a.logo_path,'verified',coalesce((select active from kh_private.agency_verifications where agency_id=a.id),false))
 ||case when (v->>'publishOfficeAddress')::boolean then jsonb_build_object('officeAddress',v->>'officeAddress') else '{}'::jsonb end
 from kh_private.agencies a cross join lateral(select kh_private.agency_profile_input(a.id) v) q where a.id=p_agency_id and a.state='approved' and (select enabled from kh_private.agency_settings where singleton)
$$;
create function public.kh_update_agency_profile(p_actor_id uuid,p_agency_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare input jsonb:=p_payload->'input';r jsonb;path text;begin
 perform kh_private.agency_require_enabled();perform kh_private.agency_lock_accounts(p_actor_id,null);perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 r:=kh_private.agency_receipt(p_actor_id,p_agency_id,'update_profile',p_payload);if r is not null then return public.kh_get_agency_profile(p_actor_id,p_agency_id);end if;
 if p_payload-array['input','logoPath','expectedVersion','clientRequestId']<>'{}'::jsonb or input ?| array['responsibleFullName','evidenceReferences'] then raise exception 'KH_AGENCY_INVALID';end if;
 input:=kh_private.agency_validate_application(input||jsonb_build_object('responsibleFullName','Validación comercial','evidenceReferences','[]'::jsonb))-array['responsibleFullName','evidenceReferences'];
 if not exists(select 1 from kh_private.agencies where id=p_agency_id and version=(p_payload->>'expectedVersion')::integer) then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if p_payload ? 'logoPath' and p_payload->'logoPath'<>'null'::jsonb then
  path:=p_payload->>'logoPath';
  if kh_private.agency_logo_scope(path) is distinct from p_agency_id then raise exception 'KH_AGENCY_LOGO_INVALID';end if;
  perform 1 from storage.objects where bucket_id='agency-assets' and name=path and metadata->>'mimetype'='image/jpeg' and (metadata->>'size')::bigint between 1 and 1048576;
  if not found then raise exception 'KH_AGENCY_LOGO_INVALID';end if;
 end if;
 update kh_private.agencies set commercial_profile=input,trade_name=input->>'tradeName',logo_path=case when p_payload ? 'logoPath' then path else logo_path end,version=version+1,updated_at=now() where id=p_agency_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind)values(p_agency_id,p_actor_id,'commercial_profile_updated');
 return kh_private.agency_remember(p_actor_id,p_agency_id,'update_profile',p_payload,public.kh_get_agency_profile(p_actor_id,p_agency_id));
end$$;
create or replace function kh_private.agency_asset_write(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select (select enabled from kh_private.agency_settings where singleton) and exists(select 1 from kh_private.agencies a join auth.users u on u.id=auth.uid() where a.id=kh_private.agency_logo_scope(p_path) and u.email_confirmed_at is not null and not kh_private.is_suspended(u.id) and not kh_private.is_deleting(u.id) and (
 (a.state in('pending','needs_changes','rejected') and exists(select 1 from kh_private.agency_applications r where r.agency_id=a.id and r.responsible_id=u.id)) or
 (a.state='approved' and exists(select 1 from kh_private.agency_memberships m where m.agency_id=a.id and m.user_id=u.id and m.state='active' and m.role='admin'))))
$$;
create or replace function kh_private.agency_asset_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from kh_private.agencies a where a.id=kh_private.agency_logo_scope(p_path) and ((a.state='approved' and a.logo_path=p_path) or
 (auth.uid() is not null and not kh_private.is_suspended(auth.uid()) and not kh_private.is_deleting(auth.uid()) and (exists(select 1 from kh_private.platform_owner o where o.singleton and o.user_id=auth.uid()) or kh_private.agency_asset_write(p_path)))))
$$;
revoke all on function kh_private.agency_profile_input(uuid),public.kh_get_agency_profile(uuid,uuid),public.kh_public_agency_profile(uuid),public.kh_update_agency_profile(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kh_get_agency_profile(uuid,uuid),public.kh_update_agency_profile(uuid,uuid,jsonb) to authenticated;
grant execute on function public.kh_public_agency_profile(uuid) to anon,authenticated;

-- A DELETE may have passed its RLS snapshot before a concurrent attachment.
-- Recheck under the same agency mutex. Attachment never waits for the object
-- row, so DELETE's existing row lock cannot invert the lock order.
create function kh_private.agency_logo_delete_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.bucket_id<>'agency-assets' then return old;end if;
 -- Privileged Storage cleanup has no user subject; RLS still decides who can
 -- reach DELETE. It must also serialize and may never delete a referenced logo.
 if auth.uid() is null then
  perform kh_private.agency_lock(kh_private.agency_logo_scope(old.name));
  if not kh_private.agency_asset_unreferenced(old.name) then raise exception 'KH_AGENCY_LOGO_REFERENCED';end if;
  return old;
 end if;
 perform kh_private.agency_require_enabled();perform kh_private.agency_lock_accounts(auth.uid(),null);perform kh_private.agency_lock(kh_private.agency_logo_scope(old.name));
 if not kh_private.agency_asset_write(old.name) or not kh_private.agency_asset_unreferenced(old.name) then raise exception 'KH_AGENCY_LOGO_REFERENCED';end if;
 return old;
end$$;
revoke all on function kh_private.agency_logo_delete_guard() from public,anon,authenticated;
create trigger kh_agency_logo_delete_guard before delete on storage.objects for each row execute function kh_private.agency_logo_delete_guard();
