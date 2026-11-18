-- Dealpin Update 5: backup, recovery and auditability
-- Adds an owner/admin-only workspace backup export and an audit-log export.
-- Export is read-only: it never changes or deletes live data.

create or replace function public.autopilot_backup() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; role_name text; result jsonb;
begin
  w:=public.autopilot_current_workspace();
  select m.role into role_name from public.autopilot_members m where m.workspace_id=w and m.user_id=auth.uid() and m.status='active' limit 1;
  if role_name not in('owner','admin') then raise exception 'Only the workspace owner or administrator can export a full backup.'; end if;
  select jsonb_build_object(
    'format','dealpin-workspace-backup-v1',
    'exported_at',now(),
    'workspace_id',w,
    'workspace',coalesce((select to_jsonb(x) from public.autopilot_workspaces x where x.id=w),'{}'::jsonb),
    'members',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.autopilot_members x where x.workspace_id=w),'[]'::jsonb),
    'preferences',coalesce((select to_jsonb(x) from public.autopilot_preferences x where x.workspace_id=w),'{}'::jsonb),
    'records',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.autopilot_records x where x.workspace_id=w),'[]'::jsonb),
    'stock_movements',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.autopilot_stock_movements x where x.workspace_id=w),'[]'::jsonb),
    'stock_reservations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from public.autopilot_stock_reservations x where x.workspace_id=w),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(x) order by x.happened_at) from public.autopilot_audit x where x.workspace_id=w),'[]'::jsonb)
  ) into result;
  return result;
end $$;

create or replace function public.autopilot_audit_export() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; role_name text;
begin
  w:=public.autopilot_current_workspace();
  select m.role into role_name from public.autopilot_members m where m.workspace_id=w and m.user_id=auth.uid() and m.status='active' limit 1;
  if role_name not in('owner','admin','auditor') then raise exception 'You do not have permission to export the audit history.'; end if;
  return jsonb_build_object('format','dealpin-audit-export-v1','exported_at',now(),'workspace_id',w,
    'entries',coalesce((select jsonb_agg(to_jsonb(a) order by a.happened_at) from public.autopilot_audit a where a.workspace_id=w),'[]'::jsonb));
end $$;

revoke all on function public.autopilot_backup() from public,anon;
revoke all on function public.autopilot_audit_export() from public,anon;
grant execute on function public.autopilot_backup(),public.autopilot_audit_export() to authenticated;
