-- Executed only by the rollback rehearsal, before and after the migration.
insert into auth.users(id,email,raw_user_meta_data) values
 ('33000000-0000-4000-8000-000000000001','kh-thumb-upgrade@example.invalid','{}');
create temporary table thumb_upgrade(payload jsonb, result jsonb);
select set_config('request.jwt.claim.sub','33000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"33000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into thumb_upgrade(payload) values ('{"clientRequestId":"thumb-upgrade","moderation":"draft","title":"Casa prueba actualización","location":"Vedado","province":"La Habana","type":"Casa","description":"Anuncio sintético para comprobar reintentos tras una migración.","price":50000,"bedrooms":2,"bathrooms":1,"area":90,"photoPaths":[],"operation":"sale"}');
update thumb_upgrade set result=public.kh_save_property(payload);
insert into thumb_upgrade(payload) select payload || jsonb_build_object('id',result->>'id','expectedVersion',1,'title','Casa prueba editada') from thumb_upgrade;
update thumb_upgrade set result=public.kh_save_property(payload) where result is null;
-- AFTER MIGRATION
-- The create retry returns the current listing; the edit retry must not increment its version.
do $$ declare r record; answer jsonb; begin
  for r in select * from thumb_upgrade loop
    answer := public.kh_save_property(r.payload);
    if answer->>'id' <> r.result->>'id' or (answer->>'version')::int <> 2 then
      raise exception 'THUMB UPGRADE ASSERTION FAILED: retry changed the listing';
    end if;
  end loop;
end $$;

