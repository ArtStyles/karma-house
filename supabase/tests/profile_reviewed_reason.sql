-- The reason for a profile KarmaHouse reviewed never says «verificado», and the function stays private.
-- Everything rolls back.
begin;
do $$
declare d text := pg_get_functiondef('kh_private.full_public_profile(uuid)'::regprocedure);
begin
 if strpos(d,'''Perfil revisado por KarmaHouse''')=0 or strpos(d,'Verificado por KarmaHouse')>0 then
  raise exception 'REVIEWED REASON ASSERTION: full_public_profile still says «Verificado por KarmaHouse»';
 end if;
 if has_function_privilege('anon','kh_private.full_public_profile(uuid)','execute')
  or has_function_privilege('authenticated','kh_private.full_public_profile(uuid)','execute') then
  raise exception 'REVIEWED REASON ASSERTION: full_public_profile is callable by clients';
 end if;
end $$;
rollback;
