-- Cover thumbnails through the RPCs and the storage policies. Reserved synthetic actors; everything rolls back.
-- L lists homes (…0001), O another account (…0002), A admin (…0003).
begin;
create or replace function pg_temp.ops_assert(ok boolean, description text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'THUMB ASSERTION FAILED: %', description; end if;
end $$;
create or replace function pg_temp.ops_error(statement text, expected_message text) returns void
language plpgsql as $$ begin
  begin execute statement;
  exception when others then
    if position(expected_message in sqlerrm)>0 then return; end if;
    raise exception 'Unexpected error (%): %',expected_message,sqlerrm;
  end;
  raise exception 'THUMB ASSERTION FAILED: expected %',expected_message;
end $$;
create or replace function pg_temp.ops_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  perform set_config('request.jwt.claims',case when actor is null then '{"role":"anon"}' else jsonb_build_object('sub',actor,'role','authenticated')::text end,true);
end $$;
-- A sale of L with two photos under request p_request, merged with p_extra.
create function pg_temp.thumb_sale(p_request text,p_extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('clientRequestId',p_request,'title','Casa '||p_request,'location','Vedado',
    'province','La Habana','type','Casa','description','Casa ficticia para las pruebas de miniatura de portada.','price',50000,
    'area',90,'bedrooms',2,'bathrooms',1,'operation','sale',
    'photoPaths',jsonb_build_array('32000000-0000-4000-8000-000000000001/'||p_request||'/photo.jpg','32000000-0000-4000-8000-000000000001/'||p_request||'/second.jpg')) || p_extra;
$$;
-- Names of the thumbnail objects the current role can read.
create function pg_temp.thumb_visible() returns text[] language sql as $$
  select coalesce(array_agg(name order by name),'{}') from storage.objects
  where bucket_id='property-photos' and name like '32000000-0000-4000-8000-00000000000_/%\_t.jpg';
$$;

insert into auth.users(id,email,raw_user_meta_data) values
 ('32000000-0000-4000-8000-000000000001','kh-thumb-lister@example.invalid','{"display_name":"Vendedora L"}'),
 ('32000000-0000-4000-8000-000000000002','kh-thumb-other@example.invalid','{"display_name":"Otra cuenta O"}'),
 ('32000000-0000-4000-8000-000000000003','kh-thumb-admin@example.invalid','{}');
insert into public.kh_admins(user_id) values('32000000-0000-4000-8000-000000000003');
insert into storage.objects(bucket_id,name,owner_id)
  select 'property-photos','32000000-0000-4000-8000-000000000001/'||r||'/'||f,'32000000-0000-4000-8000-000000000001'
  from unnest(array['thumb-a','thumb-b']) r, unnest(array['photo.jpg','second.jpg','photo_t.jpg']) f;
insert into storage.objects(bucket_id,name,owner_id) values
 ('property-photos','32000000-0000-4000-8000-000000000002/thumb-a/photo_t.jpg','32000000-0000-4000-8000-000000000002');
create temporary table thumb_context(approved uuid, pending uuid, wanted uuid);
insert into thumb_context default values;
grant select,update on thumb_context to authenticated;
-- L edits thumb-a at p_version with p_extra.
create function pg_temp.thumb_edit(p_version integer,p_extra jsonb) returns jsonb language sql as $$
  select public.kh_save_property(pg_temp.thumb_sale('thumb-a',jsonb_build_object('id',approved,'expectedVersion',p_version) || p_extra)) from thumb_context;
$$;

set local role authenticated;

-- 1. L saves a sale with a valid thumbnail; a retry returns it, a retry with another thumbnail conflicts.
select pg_temp.ops_as('32000000-0000-4000-8000-000000000001');
update thumb_context set approved=(public.kh_save_property(pg_temp.thumb_sale('thumb-a',
  '{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg"}'))->>'id')::uuid;
select pg_temp.ops_assert((select cover_thumb_path='32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg'
  from public.properties where id=(select approved from thumb_context)),'a valid thumbnail is stored');
select pg_temp.ops_assert((select (public.kh_save_property(pg_temp.thumb_sale('thumb-a',
  '{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg"}'))->>'id')::uuid=approved from thumb_context),'a retry returns the same listing');
select pg_temp.ops_error($q$select public.kh_save_property(pg_temp.thumb_sale('thumb-a','{}'))$q$,'KH_REQUEST_CONFLICT');
update thumb_context set pending=(public.kh_save_property(pg_temp.thumb_sale('thumb-b',
  '{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-b/photo_t.jpg"}'))->>'id')::uuid;

-- 2. Foreign, malformed, duplicated or missing thumbnails are rejected like photos.
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":"32000000-0000-4000-8000-000000000002/thumb-a/photo_t.jpg"}')$q$,'KH_INVALID_PHOTO_PATH');
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-b/photo_t.jpg"}')$q$,'KH_INVALID_PHOTO_PATH');
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/photo_t.png"}')$q$,'KH_INVALID_PHOTO_PATH');
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/second.jpg"}')$q$,'KH_INVALID_PHOTO_PATH');
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":42}')$q$,'KH_INVALID_PHOTO_PATH');
select pg_temp.ops_error($q$select pg_temp.thumb_edit(1,'{"coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/missing_t.jpg"}')$q$,'KH_PHOTO_NOT_FOUND');

-- 3. The upload policy takes a thumbnail name and nothing looser; a wanted ad stores no thumbnail.
insert into storage.objects(bucket_id,name,owner_id) values('property-photos','32000000-0000-4000-8000-000000000001/thumb-c/cover_t.jpg','32000000-0000-4000-8000-000000000001');
select pg_temp.ops_error($q$insert into storage.objects(bucket_id,name,owner_id) values('property-photos','32000000-0000-4000-8000-000000000001/thumb-c/cover_t.gif','32000000-0000-4000-8000-000000000001')$q$,'row-level security');
update thumb_context set wanted=(public.kh_save_property('{"clientRequestId":"thumb-wanted","title":"Busco casa","location":"Vedado","province":"La Habana",
  "description":"Busco vivienda ficticia para las pruebas de miniatura.","price":500,"bedrooms":2,"photoPaths":[],"operation":"wanted",
  "coverThumbPath":"32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg"}')->>'id')::uuid;
select pg_temp.ops_assert((select cover_thumb_path is null from public.properties where id=(select wanted from thumb_context)),'a wanted ad stores no thumbnail');

-- 4. A approves thumb-a. Anyone reads its thumbnail and not the pending one; L still reads its own.
select pg_temp.ops_as('32000000-0000-4000-8000-000000000003');
select public.kh_review_property(approved,'approved',null,1) from thumb_context;
reset role;
set local role anon;
select pg_temp.ops_as(null);
select pg_temp.ops_assert(pg_temp.thumb_visible()=array['32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg'],'anon reads the approved thumbnail only');
reset role;
set local role authenticated;
select pg_temp.ops_as('32000000-0000-4000-8000-000000000002');
select pg_temp.ops_assert(pg_temp.thumb_visible()=array['32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg',
  '32000000-0000-4000-8000-000000000002/thumb-a/photo_t.jpg'],'O reads the approved thumbnail and its own, not the pending one');
select pg_temp.ops_as('32000000-0000-4000-8000-000000000001');
select pg_temp.ops_assert(pg_temp.thumb_visible()=array['32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg',
  '32000000-0000-4000-8000-000000000001/thumb-b/photo_t.jpg','32000000-0000-4000-8000-000000000001/thumb-c/cover_t.jpg'],'L reads all its thumbnails');

-- 5. A referenced thumbnail cannot be deleted. An edit without it keeps it while the cover is the same file;
-- a new cover without its thumbnail stores null and frees the old one.
select pg_temp.ops_assert(not kh_private.photo_delete_allowed('32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg'),'a referenced thumbnail is in use');
select pg_temp.thumb_edit(2,'{}');
select pg_temp.ops_assert((select cover_thumb_path='32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg' and version=3
  from public.properties where id=(select approved from thumb_context)),'the same cover keeps its thumbnail');
select pg_temp.thumb_edit(3,'{"coverThumbPath":null,
  "photoPaths":["32000000-0000-4000-8000-000000000001/thumb-a/second.jpg","32000000-0000-4000-8000-000000000001/thumb-a/photo.jpg"]}');
select pg_temp.ops_assert((select cover_thumb_path is null and version=4 from public.properties where id=(select approved from thumb_context)),'a new cover without thumbnail stores null');
select pg_temp.ops_assert(kh_private.photo_delete_allowed('32000000-0000-4000-8000-000000000001/thumb-a/photo_t.jpg'),'the old thumbnail can be deleted');

-- 6. The column refuses a path outside the row's owner and request.
reset role;
select pg_temp.ops_error($q$update public.properties set cover_thumb_path='32000000-0000-4000-8000-000000000002/thumb-a/photo_t.jpg' where id=(select approved from thumb_context)$q$,'properties_cover_thumb_path');
select pg_temp.ops_error($q$update public.properties set cover_thumb_path='32000000-0000-4000-8000-000000000001/thumb-b/photo_t.jpg' where id=(select approved from thumb_context)$q$,'properties_cover_thumb_path');
rollback;
