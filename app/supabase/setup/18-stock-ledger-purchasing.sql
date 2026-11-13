-- Dealpin Business Autopilot phase 2: stock ledger and purchase receiving.
-- Run after setup/17-business-autopilot.sql. All operations are available to every authorized workspace member.

alter table public.autopilot_records drop constraint if exists autopilot_records_record_type_check;
alter table public.autopilot_records add constraint autopilot_records_record_type_check
  check(record_type in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders'));

create table if not exists public.autopilot_stock_movements(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  inventory_id uuid not null,
  movement_type text not null check(movement_type in('opening','purchase_receipt','sale','customer_return','damage','adjustment_in','adjustment_out')),
  quantity numeric(18,4) not null check(quantity>0),
  quantity_delta numeric(18,4) not null,
  balance_after numeric(18,4) not null check(balance_after>=0),
  unit_cost numeric(18,4),
  currency text check(currency is null or currency ~ '^[A-Z]{3}$'),
  reference text not null default '',
  note text not null default '',
  branch_id uuid,
  idempotency_key text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(workspace_id,inventory_id) references public.autopilot_records(workspace_id,id) on delete restrict,
  unique(workspace_id,idempotency_key)
);
create index if not exists autopilot_stock_movements_item_time_idx on public.autopilot_stock_movements(workspace_id,inventory_id,created_at desc);
create index if not exists autopilot_stock_movements_workspace_time_idx on public.autopilot_stock_movements(workspace_id,created_at desc);
-- Carry forward existing on-hand quantities as auditable opening balances exactly once.
insert into public.autopilot_stock_movements(workspace_id,inventory_id,movement_type,quantity,quantity_delta,balance_after,reference,note,branch_id,idempotency_key,actor_id,created_at)
select r.workspace_id,r.id,'opening',(r.data->>'quantity')::numeric,(r.data->>'quantity')::numeric,(r.data->>'quantity')::numeric,
  'migration-opening-balance','Opening balance carried forward from the previous Dealpin inventory record',
  nullif(r.data->>'branch_id','')::uuid,'opening-backfill:'||r.id::text,r.created_by,r.created_at
from public.autopilot_records r
where r.record_type='inventory' and coalesce((r.data->>'quantity')::numeric,0)>0
on conflict(workspace_id,idempotency_key) do nothing;

alter table public.autopilot_stock_movements enable row level security;
revoke all on public.autopilot_stock_movements from anon,authenticated;

create or replace function public.autopilot_can_read(p_workspace uuid,p_type text,p_data jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.autopilot_members m where m.workspace_id=p_workspace and m.user_id=auth.uid() and m.status='active'
    and (m.role in('owner','admin','manager','auditor') or
      (p_type in('customers','opportunities','tasks') and m.role='sales') or
      (p_type in('inventory','suppliers','purchase_orders') and m.role='inventory') or
      (p_type='expenses' and m.role='accountant'))
    and (m.branch_id is null or p_data->>'branch_id'=m.branch_id::text))
$$;
create or replace function public.autopilot_can_write(p_workspace uuid,p_type text,p_data jsonb) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.autopilot_members m where m.workspace_id=p_workspace and m.user_id=auth.uid() and m.status='active'
    and (m.role in('owner','admin','manager') or
      (p_type in('customers','opportunities','tasks') and m.role='sales') or
      (p_type in('inventory','suppliers','purchase_orders') and m.role='inventory') or
      (p_type='expenses' and m.role='accountant'))
    and (m.branch_id is null or p_data->>'branch_id'=m.branch_id::text))
$$;

-- Extend the generic workspace record API for purchase orders on already-installed databases.
create or replace function public.autopilot_list(p_type text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then raise exception 'Workspace access denied.'; end if;
  if p_type is not null and p_type not in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders') then raise exception 'Unknown business record type.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'type',r.record_type,'data',r.data,'created_at',r.created_at,'updated_at',r.updated_at) order by r.updated_at desc)
    from public.autopilot_records r where r.workspace_id=w and (p_type is null or r.record_type=p_type) and public.autopilot_can_read(w,r.record_type,r.data)),'[]'::jsonb);
end $$;


-- Bounded page API for large workspaces. Keep the legacy list function for compatibility.
create or replace function public.autopilot_list_page(p_type text default null,p_limit integer default 250,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; lim integer:=least(greatest(coalesce(p_limit,250),1),500); off integer:=greatest(coalesce(p_offset,0),0); items jsonb;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then raise exception 'Workspace access denied.'; end if;
  if p_type is not null and p_type not in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders') then raise exception 'Unknown business record type.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'type',r.record_type,'data',r.data,'created_at',r.created_at,'updated_at',r.updated_at) order by r.updated_at desc),'[]'::jsonb)
    into items
    from (select r.* from public.autopilot_records r where r.workspace_id=w and (p_type is null or r.record_type=p_type)
      and public.autopilot_can_read(w,r.record_type,r.data) order by r.updated_at desc limit lim offset off) r;
  return jsonb_build_object('items',items,'limit',lim,'offset',off,'has_more',jsonb_array_length(items)=lim);
end $$;

create or replace function public.autopilot_save(p_type text,p_id uuid,p_data jsonb) returns jsonb
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
    update public.autopilot_records set data=p_data,updated_at=now() where workspace_id=w and id=p_id and record_type=p_type returning * into existing;
    rid:=existing.id;
    insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'updated',p_type,rid);
  end if;
  return jsonb_build_object('id',existing.id,'type',existing.record_type,'data',existing.data,'created_at',existing.created_at,'updated_at',existing.updated_at);
end $$;

create or replace function public.autopilot_remove(p_type text,p_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; d jsonb; n int;
begin
  w:=public.autopilot_current_workspace();
  select data into d from public.autopilot_records where workspace_id=w and id=p_id and record_type=p_type;
  if not found then raise exception 'Business record not found.'; end if;
  if not public.autopilot_can_write(w,p_type,d) then raise exception 'You do not have permission to remove this business record.'; end if;
  if p_type='inventory' and exists(select 1 from public.autopilot_stock_movements where workspace_id=w and inventory_id=p_id) then raise exception 'Inventory with stock history cannot be deleted. Keep the item for audit continuity.'; end if;
  if p_type='purchase_orders' and d->>'status'='Received' then raise exception 'A received purchase order is part of the stock audit trail and cannot be deleted.'; end if;
  delete from public.autopilot_records where workspace_id=w and id=p_id and record_type=p_type;
  get diagnostics n=row_count;
  if n=0 then raise exception 'Business record not found.'; end if;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'deleted',p_type,p_id);
  return true;
end $$;

create or replace function public.autopilot_stock_movements(p_inventory_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then raise exception 'Workspace access denied.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',m.id,'inventory_id',m.inventory_id,'item_name',r.data->>'name','movement_type',m.movement_type,
    'quantity',m.quantity,'quantity_delta',m.quantity_delta,'balance_after',m.balance_after,'unit_cost',m.unit_cost,
    'currency',m.currency,'reference',m.reference,'note',m.note,'branch_id',m.branch_id,
    'actor_id',m.actor_id,'created_at',m.created_at) order by m.created_at desc)
    from (select * from public.autopilot_stock_movements where workspace_id=w and (p_inventory_id is null or inventory_id=p_inventory_id)
      order by created_at desc) m
    join public.autopilot_records r on r.workspace_id=m.workspace_id and r.id=m.inventory_id
    where public.autopilot_can_read(w,'inventory',r.data)),'[]'::jsonb);
end $$;

create or replace function public.autopilot_stock_move(
  p_inventory_id uuid,p_movement_type text,p_quantity numeric,p_unit_cost numeric default null,
  p_currency text default null,p_reference text default '',p_note text default '',p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; item public.autopilot_records; delta numeric; balance numeric; existing public.autopilot_stock_movements; branch uuid;
begin
  w:=public.autopilot_current_workspace();
  if p_quantity is null or p_quantity<=0 then raise exception 'Movement quantity must be greater than zero.'; end if;
  if p_movement_type not in('opening','purchase_receipt','sale','customer_return','damage','adjustment_in','adjustment_out') then raise exception 'Unsupported stock movement type.'; end if;
  if coalesce(length(p_idempotency_key),0)<8 or length(p_idempotency_key)>120 then raise exception 'A valid movement reference is required.'; end if;
  if p_unit_cost is not null and p_unit_cost<0 then raise exception 'Unit cost cannot be negative.'; end if;
  if p_currency is not null and upper(p_currency) !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(w::text||':'||p_idempotency_key,0));
  select * into existing from public.autopilot_stock_movements where workspace_id=w and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('id',existing.id,'inventory_id',existing.inventory_id,'movement_type',existing.movement_type,'quantity',existing.quantity,'quantity_delta',existing.quantity_delta,'balance_after',existing.balance_after,'created_at',existing.created_at,'duplicate',true); end if;
  select * into item from public.autopilot_records where workspace_id=w and id=p_inventory_id and record_type='inventory' for update;
  if not found then raise exception 'Inventory item not found in this workspace.'; end if;
  if not public.autopilot_can_write(w,'inventory',item.data) then raise exception 'You do not have permission to change this inventory item.'; end if;
  if p_movement_type='opening' and exists(select 1 from public.autopilot_stock_movements where workspace_id=w and inventory_id=p_inventory_id) then raise exception 'Opening stock can only be recorded once. Use an adjustment for later corrections.'; end if;
  branch:=nullif(item.data->>'branch_id','')::uuid;
  delta:=case when p_movement_type in('sale','damage','adjustment_out') then -p_quantity else p_quantity end;
  balance:=coalesce((item.data->>'quantity')::numeric,0)+delta;
  if balance<0 then raise exception 'This movement would make physical stock negative.'; end if;
  if balance<coalesce((item.data->>'reserved')::numeric,0) then raise exception 'This movement would reduce physical stock below the quantity reserved for orders.'; end if;
  update public.autopilot_records set data=jsonb_set(data,'{quantity}',to_jsonb(balance),true),updated_at=now()
    where workspace_id=w and id=p_inventory_id and record_type='inventory';
  insert into public.autopilot_stock_movements(workspace_id,inventory_id,movement_type,quantity,quantity_delta,balance_after,unit_cost,currency,reference,note,branch_id,idempotency_key,actor_id)
    values(w,p_inventory_id,p_movement_type,p_quantity,delta,balance,p_unit_cost,upper(p_currency),left(coalesce(p_reference,''),160),left(coalesce(p_note,''),2000),branch,p_idempotency_key,auth.uid()) returning * into existing;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'stock_'||p_movement_type,'inventory',p_inventory_id);
  return jsonb_build_object('id',existing.id,'inventory_id',existing.inventory_id,'movement_type',existing.movement_type,'quantity',existing.quantity,'quantity_delta',existing.quantity_delta,'balance_after',existing.balance_after,'created_at',existing.created_at,'duplicate',false);
end $$;

create or replace function public.autopilot_receive_purchase_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; po public.autopilot_records; item_id uuid; qty numeric; cost numeric; curr text; result jsonb;
begin
  w:=public.autopilot_current_workspace();
  select * into po from public.autopilot_records where workspace_id=w and id=p_order_id and record_type='purchase_orders' for update;
  if not found then raise exception 'Purchase order not found.'; end if;
  if not public.autopilot_can_write(w,'purchase_orders',po.data) then raise exception 'You do not have permission to receive this purchase order.'; end if;
  if po.data->>'status'<>'Ordered' then raise exception 'Only an ordered purchase order can be received. This order may already have been received.'; end if;
  item_id:=(po.data->>'inventory_id')::uuid; qty:=(po.data->>'quantity')::numeric; cost:=nullif(po.data->>'unit_cost','')::numeric; curr:=nullif(upper(po.data->>'currency'),'');
  if qty is null or qty<=0 then raise exception 'Purchase order quantity is invalid.'; end if;
  result:=public.autopilot_stock_move(item_id,'purchase_receipt',qty,cost,curr,coalesce(po.data->>'reference',po.id::text),'Received purchase order '||coalesce(po.data->>'reference',po.id::text),'purchase-order:'||po.id::text);
  update public.autopilot_records set data=jsonb_set(jsonb_set(data,'{status}','"Received"'::jsonb,true),'{received_at}',to_jsonb(now()),true),updated_at=now()
    where workspace_id=w and id=p_order_id returning * into po;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'purchase_order_received','purchase_orders',p_order_id);
  return jsonb_build_object('order_id',po.id,'status',po.data->>'status','stock_movement',result);
end $$;

revoke all on function public.autopilot_stock_movements(uuid),public.autopilot_stock_move(uuid,text,numeric,numeric,text,text,text,text),public.autopilot_receive_purchase_order(uuid) from public,anon;
grant execute on function public.autopilot_stock_movements(uuid),public.autopilot_stock_move(uuid,text,numeric,numeric,text,text,text,text),public.autopilot_receive_purchase_order(uuid) to authenticated;
