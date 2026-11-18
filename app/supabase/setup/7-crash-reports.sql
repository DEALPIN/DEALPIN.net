-- Dealpin setup step 7: crash reports. Safe to run again.
-- The app sends error reports (no names, phone numbers, deal data or tokens) to this table with the public key.
-- The public role can insert only. Nobody can read rows through the API; read them in the Supabase table editor.
-- Each field has a length limit, so a bad client cannot store large amounts of data.

create table if not exists public.crash_reports(
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null check (char_length(kind) <= 20),
  msg text check (char_length(msg) <= 600),
  stack text check (char_length(stack) <= 600),
  page text check (char_length(page) <= 40),
  v text check (char_length(v) <= 20),
  ua text check (char_length(ua) <= 160)
);

alter table public.crash_reports enable row level security;
revoke all on public.crash_reports from anon, authenticated;
grant insert on public.crash_reports to anon, authenticated;
grant usage on sequence public.crash_reports_id_seq to anon, authenticated;

drop policy if exists crash_insert_only on public.crash_reports;
create policy crash_insert_only on public.crash_reports
  for insert to anon, authenticated with check (true);

-- Keep 90 days of reports. Old rows are removed on each insert, so the table stays small without a scheduled job.
create or replace function public.crash_reports_prune() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.crash_reports where created_at < now() - interval '90 days';
  return null;
end $$;
drop trigger if exists crash_reports_prune_trg on public.crash_reports;
create trigger crash_reports_prune_trg after insert on public.crash_reports
  for each statement execute function public.crash_reports_prune();
