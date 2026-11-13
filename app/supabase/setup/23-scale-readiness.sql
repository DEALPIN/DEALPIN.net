-- Dealpin scale-readiness migration 23
-- Apply after setup/19-stock-reservations-valuation.sql. Run on staging first.
-- This migration does not change product behavior; it bounds high-volume workspace reads and
-- adds indexes for the most common operational filters/sorts.

create index if not exists deals_owner_status_created_idx
  on public.deals(owner,status,created desc);
create index if not exists products_owner_status_available_updated_idx
  on public.products(owner,status,available,updated desc);
create index if not exists product_requests_seller_status_updated_idx
  on public.product_requests(seller_id,status,updated desc);
create index if not exists mod_records_owner_col_at_idx
  on public.mod_records(owner,col,at desc);
create index if not exists autopilot_records_workspace_updated_idx
  on public.autopilot_records(workspace_id,updated_at desc);
create index if not exists autopilot_audit_workspace_action_time_idx
  on public.autopilot_audit(workspace_id,action,happened_at desc);
create index if not exists autopilot_stock_reservations_workspace_status_time_idx
  on public.autopilot_stock_reservations(workspace_id,status,created_at desc);

-- Explicitly expose only the bounded read RPC to authenticated users.
revoke all on function public.autopilot_list_page(text,integer,integer) from public,anon;
grant execute on function public.autopilot_list_page(text,integer,integer) to authenticated;

-- Lightweight operational probe. It checks authorization and returns row counts only; no business data.
create or replace function public.dealpin_scale_probe() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; members bigint; records bigint; audit_rows bigint;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then
    raise exception 'Workspace access denied.';
  end if;
  select count(*) into members from public.autopilot_members where workspace_id=w and status='active';
  select count(*) into records from public.autopilot_records where workspace_id=w;
  select count(*) into audit_rows from public.autopilot_audit where workspace_id=w;
  return jsonb_build_object('workspace_id',w,'active_members',members,'records',records,'audit_events',audit_rows,'checked_at',now());
end $$;
revoke all on function public.dealpin_scale_probe() from public,anon;
grant execute on function public.dealpin_scale_probe() to authenticated;
