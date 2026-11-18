-- Dealpin Update 4: data integrity and transaction safety
-- Optimistic concurrency for Business Autopilot records.
-- Existing three-argument function remains compatible; the app uses the four-argument version.

create or replace function public.autopilot_save(p_type text,p_id uuid,p_data jsonb,p_expected_updated_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; existing public.autopilot_records; linked public.autopilot_records; rid uuid;
begin
  w:=public.autopilot_current_workspace();
  if p_type not in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders') then raise exception 'Unknown business record type.'; end if;
  if jsonb_typeof(p_data)<>'object' then raise exception 'Business record must be an object.'; end if;
  if not public.autopilot_can_write(w,p_type,p_data) then raise exception 'You do not have permission to update this business area.'; end if;
  if p_type='customers' and coalesce(btrim(p_data->>'name'),'')='' then raise exception 'Customer name is required.'; end if;
  if p_type='opportunities' and coalesce(btrim(p_data->>'title'),'')='' then raise exception 'Opportunity title is required.'; end if;
  if p_type='inventory' and coalesce(btrim(p_data->>'name'),'')='' then raise exception 'Product name is required.'; end if;
  if p_type='inventory' and (coalesce((p_data->>'quantity')::numeric,0)<0 or coalesce((p_data->>'reserved')::numeric,0)<0 or coalesce((p_data->>'reorder_point')::numeric,0)<0) then raise exception 'Stock quantities cannot be negative.'; end if;
  if p_type='inventory' and p_id is null and coalesce((p_data->>'quantity')::numeric,0)<>0 then raise exception 'Create the inventory item first, then record its opening stock in the Stock Ledger.'; end if;
  if p_type='inventory' and coalesce((p_data->>'reserved')::numeric,0)>coalesce((p_data->>'quantity')::numeric,0) then raise exception 'Reserved stock cannot exceed physical stock.'; end if;
  if coalesce(p_data->>'currency','')<>'' and upper(p_data->>'currency') !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code.'; end if;
  if coalesce(p_data->>'branch_id','')<>'' and not exists(select 1 from public.autopilot_records where workspace_id=w and id=(p_data->>'branch_id')::uuid and record_type='branches') then raise exception 'That branch does not belong to this workspace.'; end if;
  if p_type='expenses' and coalesce((p_data->>'amount')::numeric,0)<0 then raise exception 'Expense amount cannot be negative.'; end if;
  if p_type='inventory' and (coalesce((p_data->>'quantity')::numeric,0)<0 or coalesce((p_data->>'reserved')::numeric,0)<0 or coalesce((p_data->>'reorder_point')::numeric,0)<0) then raise exception 'Stock quantities cannot be negative.'; end if;
  if p_type='purchase_orders' then
    if coalesce(btrim(p_data->>'reference'),'')='' then raise exception 'Purchase order reference is required.'; end if;
    if coalesce((p_data->>'quantity')::numeric,0)<=0 or p_data->>'unit_cost' is null or coalesce((p_data->>'unit_cost')::numeric,-1)<0 then raise exception 'Enter a valid order quantity and unit cost.'; end if;
    if coalesce(p_data->>'status','') not in('Draft','Ordered') then raise exception 'A purchase order can only be created or edited as Draft or Ordered.'; end if;
    if not exists(select 1 from public.autopilot_records where workspace_id=w and id=(p_data->>'supplier_id')::uuid and record_type='suppliers') then raise exception 'Select a supplier from this workspace.'; end if;
    select * into linked from public.autopilot_records where workspace_id=w and id=(p_data->>'inventory_id')::uuid and record_type='inventory';
    if not found then raise exception 'Select an inventory item from this workspace.'; end if;
    if coalesce(linked.data->>'branch_id','')<>coalesce(p_data->>'branch_id','') then raise exception 'The purchase order and inventory item must belong to the same branch.'; end if;
  end if;
  if p_id is null then
    insert into public.autopilot_records(workspace_id,record_type,data,created_by) values(w,p_type,p_data,auth.uid()) returning * into existing;
    rid:=existing.id;
    insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'created',p_type,rid);
  else
    select * into existing from public.autopilot_records where workspace_id=w and id=p_id and record_type=p_type for update;
    if not found then raise exception 'Business record not found.'; end if;
    if p_type='purchase_orders' and existing.data->>'status'='Received' then raise exception 'A received purchase order is locked and cannot be edited.'; end if;
    if p_type='inventory' and coalesce((p_data->>'quantity')::numeric,0) is distinct from coalesce((existing.data->>'quantity')::numeric,0) then raise exception 'Use the Stock Ledger to change physical stock.'; end if;
    if p_expected_updated_at is not null and existing.updated_at<>p_expected_updated_at then
      raise exception 'This record changed while you were editing it. Reload the record and review the latest values before saving.';
    end if;
    update public.autopilot_records set data=p_data,updated_at=now() where workspace_id=w and id=p_id and record_type=p_type returning * into existing;
    rid:=existing.id;
    insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'updated',p_type,rid);
  end if;
  return jsonb_build_object('id',existing.id,'type',existing.record_type,'data',existing.data,'created_at',existing.created_at,'updated_at',existing.updated_at);
end $$;


revoke all on function public.autopilot_save(text,uuid,jsonb,timestamptz) from public,anon;
grant execute on function public.autopilot_save(text,uuid,jsonb,timestamptz) to authenticated;
