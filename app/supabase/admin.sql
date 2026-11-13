-- Dealpin step 6: profile photo column + super admin. Safe to run again. Run after steps 1 to 4.

-- profile photo (path of an uploaded picture; empty means use the Google photo)
alter table public.profiles add column if not exists avatar text not null default '';
alter table public.profiles drop constraint if exists profiles_avatar_check;
alter table public.profiles add constraint profiles_avatar_check check(avatar='' or avatar ~ '^s/[0-9a-f-]{32,64}/[0-9a-f]{32}\.(jpg|png|webp)$');

-- who may open the admin console. Nobody can read or change this table through the public API.
create table if not exists public.admins(id uuid primary key references auth.users(id) on delete cascade, added timestamptz not null default now());
alter table public.admins enable row level security;
revoke all on public.admins from public,anon,authenticated;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.admins where id=(select auth.uid())) $$;

create or replace function public.admin_overview() returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare dau jsonb:='[]'; r jsonb;
begin
  if not public.is_admin() then raise exception 'not found' using errcode='P0002'; end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') into dau from (
      select g::date d,(select count(distinct a.payload->>'actor_id') from auth.audit_log_entries a where a.created_at::date=g::date and a.payload->>'action' in('login','token_refreshed')) n
      from generate_series(current_date-29,current_date,'1 day') g) x;
  exception when others then dau:='[]'::jsonb; end;
  with la as (
    select u.id,u.created_at,u.last_sign_in_at,u.email_confirmed_at,u.phone_confirmed_at,
      greatest(u.last_sign_in_at,(select max(coalesce((to_jsonb(s)->>'refreshed_at')::timestamptz,s.updated_at,s.created_at)) from auth.sessions s where s.user_id=u.id)) seen
    from auth.users u)
  select jsonb_build_object(
    'generated',now(),
    'users',(select jsonb_build_object('total',count(*),'confirmed',count(*) filter(where email_confirmed_at is not null or phone_confirmed_at is not null),
      'never_signed_in',count(*) filter(where last_sign_in_at is null),
      'active_1h',count(*) filter(where seen>now()-interval '1 hour'),'active_24h',count(*) filter(where seen>now()-interval '24 hours'),
      'active_7d',count(*) filter(where seen>now()-interval '7 days'),'active_30d',count(*) filter(where seen>now()-interval '30 days'),
      'new_24h',count(*) filter(where created_at>now()-interval '24 hours'),'new_7d',count(*) filter(where created_at>now()-interval '7 days'),'new_30d',count(*) filter(where created_at>now()-interval '30 days')) from la),
    'methods',(select coalesce(jsonb_object_agg(provider,c),'{}') from (select provider,count(distinct user_id) c from auth.identities group by 1) m),
    'sellers',(select count(*) from public.profiles),
    'deals',jsonb_build_object('total',(select count(*) from public.deals),'last_24h',(select count(*) from public.deals where created>now()-interval '24 hours'),'last_7d',(select count(*) from public.deals where created>now()-interval '7 days'),
      'by_status',(select coalesce(jsonb_object_agg(status,c),'{}') from (select status,count(*) c from public.deals group by 1) s)),
    'products',jsonb_build_object('total',(select count(*) from public.products),'published',(select count(*) from public.products where status='published')),
    'requests',(select count(*) from public.product_requests),
    'tools_records',(select count(*) from public.mod_records),
    'storage',(select jsonb_build_object('files',count(*),'bytes',coalesce(sum((metadata->>'size')::bigint),0)) from storage.objects where bucket_id='deal-media'),
    'signups_by_day',(select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') from (select g::date d,(select count(*) from auth.users u where u.created_at::date=g::date) n from generate_series(current_date-29,current_date,'1 day') g) x),
    'deals_by_day',(select coalesce(jsonb_agg(jsonb_build_object('d',d,'n',n) order by d),'[]') from (select g::date d,(select count(*) from public.deals e where e.created::date=g::date) n from generate_series(current_date-29,current_date,'1 day') g) x),
    'active_by_day',dau) into r;
  return r;
end $$;

create or replace function public.admin_users(p_q text default '',p_limit int default 25,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare q text:=lower(coalesce(trim(p_q),'')); lim int:=least(greatest(coalesce(p_limit,25),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  if not public.is_admin() then raise exception 'not found' using errcode='P0002'; end if;
  select count(*) into tot from auth.users u left join public.profiles p on p.id=u.id
    where q='' or lower(coalesce(u.email,'')) like '%'||q||'%' or lower(coalesce(u.raw_user_meta_data->>'full_name','')) like '%'||q||'%' or lower(coalesce(p.name,'')) like '%'||q||'%' or lower(coalesce(p.handle,'')) like '%'||q||'%' or coalesce(u.phone,'') like '%'||q||'%';
  select coalesce(jsonb_agg(x order by (x->>'created')::timestamptz desc),'[]') into rows from (
    select jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,'name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),'method',u.raw_app_meta_data->>'provider',
      'created',u.created_at,'last_sign_in',u.last_sign_in_at,
      'seen',greatest(u.last_sign_in_at,(select max(coalesce((to_jsonb(s)->>'refreshed_at')::timestamptz,s.updated_at,s.created_at)) from auth.sessions s where s.user_id=u.id)),
      'shop',p.name,'handle',p.handle,'deals',(select count(*) from public.deals d where d.owner=u.id),'products',(select count(*) from public.products pr where pr.owner=u.id)) x
    from auth.users u left join public.profiles p on p.id=u.id
    where q='' or lower(coalesce(u.email,'')) like '%'||q||'%' or lower(coalesce(u.raw_user_meta_data->>'full_name','')) like '%'||q||'%' or lower(coalesce(p.name,'')) like '%'||q||'%' or lower(coalesce(p.handle,'')) like '%'||q||'%' or coalesce(u.phone,'') like '%'||q||'%'
    order by u.created_at desc limit lim offset off) t;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

revoke all on function public.is_admin(),public.admin_overview(),public.admin_users(text,int,int) from public,anon;
grant execute on function public.is_admin(),public.admin_overview(),public.admin_users(text,int,int) to authenticated;

-- ===== EDIT THIS LINE, then run again: make your admin user. Create the user first in Supabase: Authentication > Users > Add user (tick Auto Confirm).
insert into public.admins(id) select id from auth.users where email='CHANGE-ME@example.com' on conflict do nothing;

notify pgrst,'reload schema';
