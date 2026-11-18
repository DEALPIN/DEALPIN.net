-- Dealpin Update 6: observability, monitoring and incident protection.
-- Safe to run again. Stores only sanitized operational telemetry; never passwords,
-- access/refresh tokens, deal contents, names, phone numbers or payment secrets.

alter table public.crash_reports add column if not exists client_id text;
alter table public.crash_reports add column if not exists request_id text;
alter table public.crash_reports add column if not exists duration_ms integer;
alter table public.crash_reports drop constraint if exists crash_reports_client_id_chk;
alter table public.crash_reports add constraint crash_reports_client_id_chk check (client_id is null or client_id ~ '^[A-Za-z0-9_-]{12,80}$');
alter table public.crash_reports drop constraint if exists crash_reports_request_id_chk;
alter table public.crash_reports add constraint crash_reports_request_id_chk check (request_id is null or request_id ~ '^[A-Za-z0-9_-]{12,80}$');
alter table public.crash_reports drop constraint if exists crash_reports_duration_chk;
alter table public.crash_reports add constraint crash_reports_duration_chk check (duration_ms is null or duration_ms between 0 and 600000);

create or replace function public.crash_reports_guard() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare recent_count integer;
begin
  -- Per browser-session bucket: prevents a broken client from flooding the table.
  if new.client_id is not null then
    select count(*) into recent_count from public.crash_reports
      where client_id=new.client_id and created_at > now() - interval '1 minute';
    if recent_count >= 20 then return null; end if;
  end if;
  new.msg=left(coalesce(new.msg,''),600);
  new.stack=left(coalesce(new.stack,''),600);
  new.page=left(coalesce(new.page,''),40);
  new.v=left(coalesce(new.v,''),20);
  new.ua=left(coalesce(new.ua,''),160);
  return new;
end $$;
drop trigger if exists crash_reports_guard_trg on public.crash_reports;
create trigger crash_reports_guard_trg before insert on public.crash_reports for each row execute function public.crash_reports_guard();

-- A small authenticated health check for deployment diagnostics. It returns no business data.
create or replace function public.dealpin_health_check() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
  select jsonb_build_object('ok',true,'database_time',now(),'authenticated',auth.uid() is not null);
$$;
revoke all on function public.dealpin_health_check() from public,anon;
grant execute on function public.dealpin_health_check() to authenticated;
