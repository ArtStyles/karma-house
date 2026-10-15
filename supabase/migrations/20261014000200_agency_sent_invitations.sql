-- Agency admins see the invitations they sent that still wait for an answer.
create function public.kh_list_agency_sent_invitations(p_actor_id uuid,p_agency_id uuid,p_offset integer default 0,p_limit integer default 30)returns jsonb language plpgsql security definer set search_path='' as $$declare v_items jsonb;begin
 perform kh_private.agency_reader(p_actor_id,p_agency_id,'admin');
 select coalesce(jsonb_agg(kh_private.agency_invitation_json(q.id)||jsonb_build_object('recipientName',coalesce((select p.display_name from public.profiles p where p.id=q.recipient_id),'Cuenta retirada'))order by q.created_at desc,q.id),'[]')into v_items
 from(select id,recipient_id,created_at from kh_private.agency_invitations where agency_id=p_agency_id and state='pending' and expires_at>now() order by created_at desc,id offset greatest(p_offset,0)limit least(greatest(p_limit,1),50))q;
 return jsonb_build_object('items',v_items,'hasMore',exists(select 1 from kh_private.agency_invitations where agency_id=p_agency_id and state='pending' and expires_at>now() offset greatest(p_offset,0)+least(greatest(p_limit,1),50)));
end$$;
revoke all on function public.kh_list_agency_sent_invitations(uuid,uuid,integer,integer) from public,anon;
grant execute on function public.kh_list_agency_sent_invitations(uuid,uuid,integer,integer) to authenticated;
