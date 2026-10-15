-- A member leaves an agency by themselves; an admin withdraws an invitation that has not been answered.
-- Leaving uses the same row change as kh_remove_agency_member, so the member lifecycle trigger cleans up alike.
create function public.kh_leave_agency(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_member kh_private.agency_memberships;v_receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 perform kh_private.agency_lock_accounts(p_actor_id,null);perform kh_private.agency_lock(p_agency_id);
 -- After leaving the actor is no longer a member, so a retried request must find its receipt before the membership check.
 v_receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'leave_agency',p_payload);if v_receipt is not null then return kh_private.agency_membership_json(p_agency_id,p_actor_id);end if;
 -- Read authority, not operation authority: a member may also leave a suspended agency.
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'manager');
 select * into v_member from kh_private.agency_memberships where agency_id=p_agency_id and user_id=p_actor_id;
 if v_member.state is distinct from 'active' or v_member.version is distinct from(p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 if v_member.role='admin' and not exists(select 1 from kh_private.agency_memberships m join auth.users u on u.id=m.user_id where m.agency_id=p_agency_id and m.user_id<>p_actor_id and m.role='admin' and m.state='active' and u.email_confirmed_at is not null and not kh_private.is_suspended(m.user_id) and not kh_private.is_deleting(m.user_id))then raise exception 'KH_AGENCY_LAST_ADMIN';end if;
 update kh_private.agency_memberships set state='removed',version=version+1 where agency_id=p_agency_id and user_id=p_actor_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency_id,p_actor_id,'leave_agency',p_actor_id);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'leave_agency',p_payload,kh_private.agency_membership_json(p_agency_id,p_actor_id));
end$$;
create function public.kh_cancel_agency_invitation(p_actor_id uuid,p_agency_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path='' as $$declare v_id uuid:=(p_payload->>'invitationId')::uuid;v_invite kh_private.agency_invitations;v_receipt jsonb;begin
 perform kh_private.agency_require_enabled();
 -- agency_actor takes the agency lock that kh_decide_agency_invitation also takes, so answering and withdrawing serialize.
 perform kh_private.agency_actor(p_actor_id,p_agency_id,'admin');
 v_receipt:=kh_private.agency_receipt(p_actor_id,p_agency_id,'cancel_invitation',p_payload);if v_receipt is not null then return kh_private.agency_invitation_json(v_id);end if;
 select * into v_invite from kh_private.agency_invitations where id=v_id and agency_id=p_agency_id;
 if not found then raise exception 'KH_AGENCY_INVALID';end if;
 if v_invite.state<>'pending' or v_invite.expires_at<=now() or v_invite.version is distinct from(p_payload->>'expectedVersion')::integer then raise exception 'KH_AGENCY_VERSION_CONFLICT';end if;
 update kh_private.agency_invitations set state='cancelled',version=version+1 where id=v_id;
 insert into kh_private.agency_events(agency_id,actor_id,kind,subject_id)values(p_agency_id,p_actor_id,'team_invitation_cancelled',v_id);
 return kh_private.agency_remember(p_actor_id,p_agency_id,'cancel_invitation',p_payload,kh_private.agency_invitation_json(v_id));
end$$;
revoke all on function public.kh_leave_agency(uuid,uuid,jsonb),public.kh_cancel_agency_invitation(uuid,uuid,jsonb) from public,anon;
grant execute on function public.kh_leave_agency(uuid,uuid,jsonb),public.kh_cancel_agency_invitation(uuid,uuid,jsonb) to authenticated;
