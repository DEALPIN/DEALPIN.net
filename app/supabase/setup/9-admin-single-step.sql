-- Dealpin setup step 9: admin sign-in with password only (no authenticator code).
-- Safe to run again. Run AFTER step 8. Run it BEFORE deploying the matching admin console.
--
-- Admin access now needs only: a user listed in public.admins, signed in.
-- Every admin function still checks this inside the database.
-- Keep the admin account's password and its email account strong; there is no second step.

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.admins where id=(select auth.uid())) $$;

revoke all on function public.is_admin() from public,anon;
grant execute on function public.is_admin() to authenticated;
