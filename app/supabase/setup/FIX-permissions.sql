-- Fixes the one failing check. Safe to run again.
revoke all on public.product_requests from anon,authenticated;
revoke all on public.mod_records,public.rate from anon,authenticated;
