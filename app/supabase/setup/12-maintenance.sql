-- Dealpin setup step 12: maintenance mode. Safe to run again. Run after step 11.
-- When the owner switches maintenance on: sellers, buyers and riders see a message instead of the app, and the database
-- refuses every save and photo/voice upload. Admins are never blocked. Reads, sign-in and crash reports keep working.

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  maintenance boolean not null default false,
  message text not null default 'Dealpin is being updated. Please try again shortly.' check (char_length(message) between 1 and 200),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.app_settings(id) values (1) on conflict (id) do nothing;
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
drop policy if exists "settings readable" on public.app_settings;
create policy "settings readable" on public.app_settings for select to anon, authenticated using (true);

create or replace function public.guard_maintenance() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.app_settings where id=1 and maintenance) and not public.is_admin() then
    raise exception 'Dealpin is being updated. Saving is paused for a short time. Nothing you entered is lost.' using errcode='P0001';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','products','deals','product_requests','mod_records'] loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists guard_maintenance on public.%I', t);
      execute format('create trigger guard_maintenance before insert or update or delete on public.%I for each row execute function public.guard_maintenance()', t);
    end if;
  end loop;
end $$;

do $$
begin
  drop trigger if exists guard_maintenance on storage.objects;
  create trigger guard_maintenance before insert or update or delete on storage.objects for each row execute function public.guard_maintenance();
exception when insufficient_privilege or undefined_table then
  raise notice 'Photo and voice uploads were not guarded by maintenance mode: %', sqlerrm;
end $$;

create or replace function public.admin_set_maintenance(p_on boolean,p_message text,p_reason text) returns jsonb
  language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid := public.admin_require(); m text := trim(coalesce(p_message,'')); t text := trim(coalesce(p_reason,''));
begin
  if char_length(t) < 3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  if char_length(m) not between 1 and 200 then raise exception 'Write the message users will see (up to 200 characters).' using errcode='P0001'; end if;
  update public.app_settings set maintenance=coalesce(p_on,false), message=m, updated_at=now(), updated_by=me where id=1;
  perform public.admin_log(case when p_on then 'moderate' else 'reinstate' end,'app','maintenance',
    case when p_on then 'App taken down for maintenance' else 'App back online' end, t, jsonb_build_object('message',m));
  return jsonb_build_object('maintenance',coalesce(p_on,false));
end $$;

revoke all on function public.admin_set_maintenance(boolean,text,text) from public, anon;
grant execute on function public.admin_set_maintenance(boolean,text,text) to authenticated;
