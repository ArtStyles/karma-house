begin;
-- Fixture helper is prepended by the loopback-only runner.
select pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
do $$ declare c uuid;p uuid;v_path text;manifest jsonb;j jsonb;begin
 c:=pg_temp.kh_collaborator();p:=pg_temp.kh_listing(c,'cleanup-inherited');
 select photo_paths[1] into v_path from public.properties where id=p;
 perform pg_temp.kh_assert(public.kh_claim_media_cleanup()='[]'::jsonb,'live media never leased');
 perform pg_temp.kh_as(null);update public.properties set owner_id='43000000-0000-4000-8000-000000000002' where id=p;
 perform pg_temp.kh_as('43000000-0000-4000-8000-000000000002');
 insert into storage.objects(bucket_id,name,owner_id) values('property-photos',auth.uid()::text||'/cleanup-inherited/new.jpg',auth.uid()::text);
 update public.properties set photo_paths=photo_paths||array[auth.uid()::text||'/cleanup-inherited/new.jpg'] where id=p;
 manifest:=public.kh_begin_account_deletion(auth.uid());
 perform pg_temp.kh_assert(manifest->'property-photos'='[]'::jsonb,'inherited paths never handed to client deletion');
 perform pg_temp.kh_assert(kh_private.is_deleting(auth.uid()),'deletion marker persists');
 j:=(select value from jsonb_array_elements(public.kh_claim_media_cleanup()) value where value->>'path'=v_path);
 perform pg_temp.kh_assert(j->>'path'=v_path,'inherited media leased from server queue');
 perform public.kh_finish_media_cleanup(v_path,(j->>'leaseId')::uuid,false,'STORAGE_FAILED');
 update kh_private.media_cleanup_jobs set next_attempt_at=clock_timestamp()-interval '1 second';
 j:=public.kh_claim_media_cleanup()->0;
 perform public.kh_finish_media_cleanup(v_path,(j->>'leaseId')::uuid,true);
 perform public.kh_finish_media_cleanup(v_path,(j->>'leaseId')::uuid,true);
 perform pg_temp.kh_assert((select state='done' and attempts=2 from kh_private.media_cleanup_jobs where path=v_path),'retry completes once');
 perform public.kh_delete_account(auth.uid());
 perform pg_temp.kh_assert(not exists(select 1 from auth.users where id='43000000-0000-4000-8000-000000000002'),'recipient deleted without client touching inherited path');
end $$;
rollback;
