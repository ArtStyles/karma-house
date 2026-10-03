-- All synthetic account/role/listing changes are rolled back.
begin;
create function pg_temp.owner_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'OWNER ASSERTION: %',label; end if; end $$;
select pg_temp.owner_assert(to_regprocedure('public.kh_account_access()') is not null,'account access capability exists');
create function pg_temp.owner_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if strpos(sqlerrm,expected)>0 then return; end if;
    raise exception 'Wrong error: % (expected %)',sqlerrm,expected;
  end;
  raise exception 'OWNER ASSERTION: missing error %',expected;
end $$;
create function pg_temp.owner_as(actor uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub',coalesce(actor::text,''),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role',case when actor is null then 'anon' else 'authenticated' end)::text,true);
end $$;
insert into auth.users(id,email,raw_user_meta_data) values
 ('42000000-0000-4000-8000-000000000001','owner-fixture@example.invalid','{"display_name":"Creador ficticio"}'),
 ('42000000-0000-4000-8000-000000000002','admin-fixture@example.invalid','{"display_name":"Admin ficticio"}'),
 ('42000000-0000-4000-8000-000000000003','member-fixture@example.invalid','{"display_name":"Miembro ficticio"}');
delete from kh_private.platform_owner;
insert into kh_private.platform_owner(user_id) values('42000000-0000-4000-8000-000000000001');
insert into public.kh_admins(user_id) values('42000000-0000-4000-8000-000000000002');
create temporary table owner_context(owner_ad uuid,member_ad uuid,draft_ad uuid);
insert into owner_context default values;
grant all on owner_context to authenticated;
create function pg_temp.wanted_payload(request text,mode text default 'pending') returns jsonb language sql as $$
select jsonb_build_object('clientRequestId',request,'operation','wanted','title','Busco una casa','location','Vedado','province','La Habana',
  'description','Busco una casa para mi familia en esta localidad.','price',90000,'bedrooms',2,'moderation',mode);
$$;
set local role authenticated;
select pg_temp.owner_as('42000000-0000-4000-8000-000000000001');
select pg_temp.owner_assert(public.kh_account_access()->>'role'='owner' and public.kh_is_admin(),'owner inherits admin');
select pg_temp.owner_error($q$select public.kh_begin_account_deletion('42000000-0000-4000-8000-000000000001')$q$,'KH_OWNER_PROTECTED');
update owner_context set owner_ad=(public.kh_save_property(pg_temp.wanted_payload('owner-live'))->>'id')::uuid;
select pg_temp.owner_assert((select moderation='approved' from public.properties where id=owner_ad),'owner directly publishes') from owner_context;
select pg_temp.owner_assert((public.kh_save_property(pg_temp.wanted_payload('owner-live'))->>'id')::uuid=owner_ad,'retry idempotent') from owner_context;
update owner_context set draft_ad=(public.kh_save_property(pg_temp.wanted_payload('owner-draft','draft'))->>'id')::uuid;
select pg_temp.owner_assert((select moderation='draft' from public.properties where id=draft_ad),'owner draft stays draft') from owner_context;
select public.kh_submit_property(draft_ad) from owner_context;
select pg_temp.owner_assert((select moderation='approved' from public.properties where id=draft_ad),'owner submit publishes') from owner_context;
select pg_temp.owner_assert(public.kh_save_property(pg_temp.wanted_payload('owner-live') || jsonb_build_object('id',owner_ad,'expectedVersion',1,'title','Busco una casa mayor'))->>'moderation'='approved','owner edit stays approved') from owner_context;
select pg_temp.owner_error($q$select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','suspend','Motivo de prueba','owner',false)$q$,'KH_OWNER_PROTECTED');
select pg_temp.owner_as('42000000-0000-4000-8000-000000000003');
update owner_context set member_ad=(public.kh_save_property(pg_temp.wanted_payload('member-live'))->>'id')::uuid;
select pg_temp.owner_assert((select moderation='pending' from public.properties where id=member_ad),'member requires review') from owner_context;
select pg_temp.owner_error($q$select public.kh_admin_accounts('42000000-0000-4000-8000-000000000003')$q$,'KH_ADMIN_REQUIRED');
select pg_temp.owner_error($q$select public.kh_admin_accounts('42000000-0000-4000-8000-000000000001')$q$,'KH_ACCOUNT_CHANGED');
select pg_temp.owner_error($q$insert into public.kh_admins(user_id) values('42000000-0000-4000-8000-000000000003')$q$,'permission denied');
select pg_temp.owner_as('42000000-0000-4000-8000-000000000002');
select public.kh_review_property(member_ad,'approved',null,1) from owner_context;
select public.kh_set_user_verified('42000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003',true,'Identidad comprobada');
select public.kh_set_user_verified('42000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003',false,'Verificación revocada');
select pg_temp.owner_error($q$select public.kh_admin_account_action('42000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003','suspend','Motivo de prueba','member',false)$q$,'KH_OWNER_REQUIRED');
select pg_temp.owner_as('42000000-0000-4000-8000-000000000001');
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','grant_admin','Delegación de prueba','member',false);
select pg_temp.owner_error($q$select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','suspend','Estado anterior incorrecto','member',false)$q$,'KH_ADMIN_STATE_CHANGED');
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','suspend','Suspensión de prueba','admin',false);
select pg_temp.owner_assert((select availability='paused' from public.properties where id=member_ad),'suspension pauses ads') from owner_context;
select pg_temp.owner_as('42000000-0000-4000-8000-000000000003');
select pg_temp.owner_assert((public.kh_account_access()->>'suspended')::boolean and not public.kh_is_admin(),'old session loses admin');
select pg_temp.owner_error($q$select public.kh_save_property(pg_temp.wanted_payload('suspended-new'))$q$,'KH_ACCOUNT_SUSPENDED');
select pg_temp.owner_error(format('select public.kh_set_property_status(%L,''active'')',member_ad),'KH_ACCOUNT_SUSPENDED') from owner_context;
select pg_temp.owner_error(format('select public.kh_start_conversation(%L,''42000000-0000-4000-8000-000000000003'')',owner_ad),'KH_ACCOUNT_SUSPENDED') from owner_context;
select pg_temp.owner_error($q$select public.kh_update_account_profile('42000000-0000-4000-8000-000000000003','Cambio bloqueado',null,false)$q$,'KH_ACCOUNT_SUSPENDED');
select pg_temp.owner_error($q$insert into storage.objects(bucket_id,name) values('account-avatars','42000000-0000-4000-8000-000000000003/11111111-1111-4111-8111-111111111111.jpg')$q$,'row-level security');
select pg_temp.owner_as('42000000-0000-4000-8000-000000000001');
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','reactivate','Reactivación de prueba','admin',true);
select pg_temp.owner_assert((select availability='active' from public.properties where id=member_ad),'reactivation restores unchanged ad') from owner_context;
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','suspend','Segunda suspensión','admin',false);
select public.kh_admin_unpublish('42000000-0000-4000-8000-000000000001',p.id,p.version,'Retirada por moderación') from public.properties p join owner_context c on p.id=c.member_ad;
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','reactivate','Segunda reactivación','admin',true);
select pg_temp.owner_assert((select availability='paused' and moderation='rejected' from public.properties where id=member_ad),'reactivation preserves later moderation') from owner_context;
select public.kh_admin_account_action('42000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','revoke_admin','Retirar delegación','admin',false);
select pg_temp.owner_assert(jsonb_array_length(public.kh_admin_history('42000000-0000-4000-8000-000000000001')->'items')>=9,'actions audited');
select pg_temp.owner_assert(jsonb_array_length(public.kh_admin_accounts('42000000-0000-4000-8000-000000000001','ficticio')->'items')=3,'account search');
select pg_temp.owner_assert(jsonb_array_length(public.kh_admin_listings('42000000-0000-4000-8000-000000000001')->'items')>=3,'listing management');
reset role;
select pg_temp.owner_assert(exists(select 1 from kh_private.admin_audit where action='verify' and target_id='42000000-0000-4000-8000-000000000003' and reason='Identidad comprobada'),'verification audited');
select pg_temp.owner_assert(exists(select 1 from kh_private.admin_audit where action='unverify' and target_id='42000000-0000-4000-8000-000000000003' and reason='Verificación revocada'),'verification removal reason audited');
insert into storage.objects(bucket_id,name,owner_id) values('property-photos','42000000-0000-4000-8000-000000000001/owner-sale/photo.jpg','42000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.owner_as('42000000-0000-4000-8000-000000000003');
select public.kh_save_search('42000000-0000-4000-8000-000000000003','{"name":"Mi búsqueda de prueba","filters":{"province":"La Habana","max_price":100000},"enabled":true}');
select pg_temp.owner_as('42000000-0000-4000-8000-000000000001');
select public.kh_save_property(pg_temp.wanted_payload('owner-sale') || '{"operation":"sale","type":"Casa","area":100,"bathrooms":1,"photoPaths":["42000000-0000-4000-8000-000000000001/owner-sale/photo.jpg"]}'::jsonb);
select public.kh_save_property(pg_temp.wanted_payload('owner-sale') || '{"operation":"sale","type":"Casa","area":100,"bathrooms":1,"photoPaths":["42000000-0000-4000-8000-000000000001/owner-sale/photo.jpg"]}'::jsonb);
reset role;
select pg_temp.owner_assert((select count(*)=1 from kh_private.notifications n join public.properties p on p.id=n.property_id where n.recipient_id='42000000-0000-4000-8000-000000000003' and p.client_request_id='owner-sale' and n.category='alert'),'owner publication alerts once despite retry');
select pg_temp.owner_error($q$delete from auth.users where id='42000000-0000-4000-8000-000000000001'$q$,'platform_owner');
set local role anon;
select pg_temp.owner_as(null);
select pg_temp.owner_assert((select array_agg(k order by k) from jsonb_object_keys(public.kh_public_profile('42000000-0000-4000-8000-000000000001')) k)=array['avatarUrlPath','displayName','id','identityOnly'],'owner public identity only');
select pg_temp.owner_error($q$select created_at from public.profiles$q$,'permission denied');
select pg_temp.owner_error($q$select email from auth.users$q$,'permission denied');
select pg_temp.owner_error($q$select * from kh_private.platform_owner$q$,'permission denied');
select pg_temp.owner_error($q$select kh_private.full_public_profile('42000000-0000-4000-8000-000000000001')$q$,'permission denied');
select pg_temp.owner_error($q$select public.kh_admin_history('42000000-0000-4000-8000-000000000001')$q$,'permission denied');
rollback;
