begin;
-- Fixture helper is prepended by the loopback-only runner.
select pg_temp.kh_as('43000000-0000-4000-8000-000000000001');
do $$ declare c uuid;p uuid;q uuid;v_path text;payload jsonb;begin
 c:=pg_temp.kh_collaborator();p:=pg_temp.kh_listing(c,'media-one');q:=pg_temp.kh_listing(c,'media-two');
 select photo_paths[1] into v_path from public.properties where id=p;
 perform pg_temp.kh_error(format('select kh_private.validate_property_media(%L,auth.uid(),%L,array[%L],null,%L,%L)',q,'media-two',v_path,'pending','sale'),'KH_INVALID_PHOTO_PATH');
 perform pg_temp.kh_assert(not kh_private.photo_delete_allowed(v_path),'referenced path cannot be removed by uploader');
 perform pg_temp.kh_as(null);
 update public.properties set owner_id='43000000-0000-4000-8000-000000000002',version=version+1 where id=p;
 perform pg_temp.kh_as('43000000-0000-4000-8000-000000000002');
 perform kh_private.validate_property_media(p,auth.uid(),'media-one',array[v_path],null,'pending','sale');
 update public.properties set availability='paused' where id=p;
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.property_media_assets where property_id=p),'same registered path after reassignment');
 perform pg_temp.kh_as(null);
 delete from public.properties where id=p;
 perform pg_temp.kh_assert((select state='retired' from kh_private.property_media_assets where property_id=p),'removed property retires inherited media');
 perform pg_temp.kh_assert((select count(*)=1 from kh_private.media_cleanup_jobs where path=v_path),'retired media cleanup queued');
end $$;
set local role authenticated;
select pg_temp.kh_as('43000000-0000-4000-8000-000000000004');
select pg_temp.kh_assert((select count(*)=0 from storage.objects where name like '%/media-one/%'),'third party cannot read retired media');
reset role;
rollback;
