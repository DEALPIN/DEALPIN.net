-- Dealpin setup step 13: live status, sign-out on maintenance, and no saves for suspended accounts. Safe to run again.
-- Run after step 12. Run it BEFORE deploying the matching app.

-- What the app asks every few seconds: is the app down, and is this account suspended? Works signed in or not.
create or replace function public.app_status() returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select jsonb_build_object(
    'maintenance', coalesce((select s.maintenance from public.app_settings s where s.id=1), false),
    'message', coalesce((select s.message from public.app_settings s where s.id=1), ''),
    'suspended', coalesce((select u.banned_until > now() from auth.users u where u.id=(select auth.uid())), false)) $$;
revoke all on function public.app_status() from public;
grant execute on function public.app_status() to anon, authenticated;

-- Writes are refused while the app is down, and for suspended accounts. Admins are never blocked by these.
create or replace function public.guard_maintenance() returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_admin() then
    if exists(select 1 from public.app_settings where id=1 and maintenance) then
      raise exception 'Dealpin is being updated. Saving is paused for a short time. Nothing you entered is lost.' using errcode='P0001';
    end if;
    if exists(select 1 from auth.users u where u.id=(select auth.uid()) and u.banned_until > now()) then
      raise exception 'This account is suspended.' using errcode='P0001';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

-- Taking the app down ends every session except the admin's own, so everyone is signed out at once.
create or replace function public.admin_set_maintenance(p_on boolean,p_message text,p_reason text) returns jsonb
  language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid := public.admin_require(); m text := trim(coalesce(p_message,'')); t text := trim(coalesce(p_reason,''));
begin
  if char_length(t) < 3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  if char_length(m) not between 1 and 200 then raise exception 'Write the message users will see (up to 200 characters).' using errcode='P0001'; end if;
  update public.app_settings set maintenance=coalesce(p_on,false), message=m, updated_at=now(), updated_by=me where id=1;
  if coalesce(p_on,false) then
    begin delete from auth.sessions s where s.user_id<>me and not exists(select 1 from public.admins a where a.id=s.user_id);
    exception when undefined_table then null; end;
  end if;
  perform public.admin_log(case when p_on then 'moderate' else 'reinstate' end,'app','maintenance',
    case when p_on then 'App taken down for maintenance; everyone signed out' else 'App back online' end, t, jsonb_build_object('message',m));
  return jsonb_build_object('maintenance',coalesce(p_on,false));
end $$;
revoke all on function public.admin_set_maintenance(boolean,text,text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean,text,text) to authenticated;
