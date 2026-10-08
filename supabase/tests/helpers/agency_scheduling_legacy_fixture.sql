-- Before migration 007: overlapping accepted PERSONAL visits must import.
select pg_temp.kh_as('45000000-0000-4000-8000-000000000002');
insert into storage.objects(bucket_id,name)values('property-photos','45000000-0000-4000-8000-000000000002/46000000-0000-4000-8000-000000000001/photo.jpg');
insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)
values('46000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000002','46000000-0000-4000-8000-000000000001','Visitas personales','Vedado','La Habana','Casa',30000,2,1,'Visitas aceptadas anteriores a agencias.','approved',array['45000000-0000-4000-8000-000000000002/46000000-0000-4000-8000-000000000001/photo.jpg']);
insert into public.kh_conversations(id,property_id,property_title,property_location,buyer_id,seller_id)
select ('46000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'46000000-0000-4000-8000-000000000001','Visitas personales','Vedado',('45000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'45000000-0000-4000-8000-000000000002' from generate_series(4,5)n;
insert into public.kh_negotiations(conversation_id,created_by,kind,status,visit_date,visit_time,visit_at,expires_at)
select c.id,c.buyer_id,'visit','accepted',(t at time zone 'America/Havana')::date,(t at time zone 'America/Havana')::time,t,t from public.kh_conversations c cross join(select date_trunc('minute',clock_timestamp())+interval '1 day' t)x where c.property_id='46000000-0000-4000-8000-000000000001';


do $$declare pid uuid:='46000000-0000-4000-8000-000000000002';seller uuid:='45000000-0000-4000-8000-000000000002';buyer uuid:='45000000-0000-4000-8000-000000000006';begin
 perform pg_temp.kh_as(seller);insert into storage.objects(bucket_id,name)values('property-photos',seller||'/'||pid||'/photo.jpg');
 insert into public.properties(id,owner_id,client_request_id,title,location,province,type,price,bedrooms,bathrooms,description,moderation,photo_paths)values(pid,seller,pid::text,'Personal compartida','Vedado','La Habana','Casa',30000,2,1,'Fuente personal con agencia autorizada.','approved',array[seller||'/'||pid||'/photo.jpg']);
 insert into public.kh_conversations(id,property_id,property_title,property_location,buyer_id,seller_id)values('46000000-0000-4000-8000-000000000006',pid,'Personal compartida','Vedado',buyer,seller);
end $$;
