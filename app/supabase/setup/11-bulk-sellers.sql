-- Dealpin setup step 11: suspend or reinstate many sellers at once. Safe to run again. Run after step 10.
-- Your own account and admin accounts are skipped, not failed. Each seller gets its own audit entry with the same reason.

create or replace function public.admin_bulk_set_suspended(p_ids uuid[], p_on boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; t text:=trim(coalesce(p_reason,'')); uid uuid; n int:=0; skipped int:=0;
begin
  me:=public.admin_require();
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  if coalesce(array_length(p_ids,1),0)=0 then raise exception 'Choose at least one seller.' using errcode='P0001'; end if;
  if array_length(p_ids,1)>200 then raise exception 'Choose up to 200 sellers at a time.' using errcode='P0001'; end if;
  foreach uid in array p_ids loop
    if uid=me or exists(select 1 from public.admins a where a.id=uid) or not exists(select 1 from auth.users u where u.id=uid) then
      skipped:=skipped+1; continue;
    end if;
    if p_on then
      update auth.users set banned_until='infinity' where id=uid;
      begin delete from auth.sessions where user_id=uid; exception when undefined_table then null; end;
      perform public.admin_log('suspend','user',uid::text,'Account suspended (bulk)',t);
    else
      update auth.users set banned_until=null where id=uid;
      perform public.admin_log('reinstate','user',uid::text,'Account reinstated (bulk)',t);
    end if;
    n:=n+1;
  end loop;
  return jsonb_build_object('done',n,'skipped',skipped,'suspended',p_on);
end $$;

revoke all on function public.admin_bulk_set_suspended(uuid[],boolean,text) from public, anon;
grant execute on function public.admin_bulk_set_suspended(uuid[],boolean,text) to authenticated;
