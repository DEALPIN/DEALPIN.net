-- Dealpin setup step 10: announcements. Safe to run again. Run after step 9.
-- Signed-in sellers read live announcements (not expired, not switched off). Only admins publish, edit or switch them,
-- and every change is written to the admin audit trail with a reason.

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 280),
  pinned boolean not null default false,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
drop policy if exists "announcements read live" on public.announcements;
create policy "announcements read live" on public.announcements for select to authenticated
  using (active and (expires_at is null or expires_at > now()));

create or replace function public.admin_announcements() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform public.admin_require();
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'pinned',a.pinned,'active',a.active,
           'expires_at',a.expires_at,'created_at',a.created_at,
           'live',(a.active and (a.expires_at is null or a.expires_at>now()))))
         from (select * from public.announcements order by pinned desc, created_at desc limit 100) a),'[]'::jsonb);
end $$;

create or replace function public.admin_save_announcement(p_id uuid,p_title text,p_body text,p_pinned boolean,p_active boolean,
  p_expires_at timestamptz,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid := public.admin_require(); rid uuid;
begin
  if char_length(trim(coalesce(p_title,''))) not between 1 and 80 then raise exception 'Give the announcement a title (up to 80 characters).' using errcode='P0001'; end if;
  if char_length(trim(coalesce(p_body,''))) not between 1 and 280 then raise exception 'Write the message (up to 280 characters).' using errcode='P0001'; end if;
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  if p_id is null then
    insert into public.announcements(title,body,pinned,active,expires_at,created_by)
      values(trim(p_title),trim(p_body),coalesce(p_pinned,false),coalesce(p_active,true),p_expires_at,me) returning id into rid;
  else
    update public.announcements set title=trim(p_title), body=trim(p_body), pinned=coalesce(p_pinned,false),
      active=coalesce(p_active,true), expires_at=p_expires_at where id=p_id returning id into rid;
    if rid is null then raise exception 'That announcement no longer exists.' using errcode='P0001'; end if;
  end if;
  perform public.admin_log(case when p_id is null then 'publish' else 'edit' end,'announcement',rid::text,
    'Announcement: '||trim(p_title),trim(p_reason),jsonb_build_object('pinned',p_pinned,'active',p_active,'expires_at',p_expires_at));
  return jsonb_build_object('id',rid);
end $$;

create or replace function public.admin_toggle_announcement(p_id uuid,p_active boolean,p_reason text) returns jsonb
  language plpgsql security definer set search_path=public,pg_temp as $$
declare rid uuid; t text;
begin
  perform public.admin_require();
  if char_length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  update public.announcements set active=p_active where id=p_id returning id, title into rid, t;
  if rid is null then raise exception 'That announcement no longer exists.' using errcode='P0001'; end if;
  perform public.admin_log(case when p_active then 'reinstate' else 'moderate' end,'announcement',rid::text,
    (case when p_active then 'Switched on: ' else 'Switched off: ' end)||t,trim(p_reason),'{}'::jsonb);
  return jsonb_build_object('id',rid,'active',p_active);
end $$;

revoke all on function public.admin_announcements(), public.admin_save_announcement(uuid,text,text,boolean,boolean,timestamptz,text),
  public.admin_toggle_announcement(uuid,boolean,text) from public, anon;
grant execute on function public.admin_announcements(), public.admin_save_announcement(uuid,text,text,boolean,boolean,timestamptz,text),
  public.admin_toggle_announcement(uuid,boolean,text) to authenticated;
