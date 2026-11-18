-- Dealpin Business Autopilot phase 3: reservations, fulfilment and stock valuation.
-- Run after setup/18-stock-ledger-purchasing.sql. All functions are free for authorized workspace members.


-- Reserved quantity is a protected aggregate. Only the reservation RPCs may change it.
create or replace function public.autopilot_guard_reserved_stock() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    if new.record_type='inventory' and coalesce((new.data->>'reserved')::numeric,0)<>0
       and coalesce(current_setting('dealpin.stock_reservation_act',true),'')<>'1' then
      raise exception 'Reserved stock can only be created through the stock reservation workflow.';
    end if;
  elsif old.record_type='inventory' and coalesce(old.data->>'reserved','0') is distinct from coalesce(new.data->>'reserved','0')
     and coalesce(current_setting('dealpin.stock_reservation_act',true),'')<>'1' then
    raise exception 'Reserved stock can only be changed through the stock reservation workflow.';
  end if;
  return new;
end $$;
drop trigger if exists autopilot_guard_reserved_stock on public.autopilot_records;
create trigger autopilot_guard_reserved_stock before insert or update on public.autopilot_records
for each row execute function public.autopilot_guard_reserved_stock();

create table if not exists public.autopilot_stock_reservations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  inventory_id uuid not null,
  reference text not null,
  quantity numeric(18,4) not null check(quantity>0),
  status text not null default 'Reserved' check(status in('Reserved','Released','Fulfilled')),
  branch_id uuid,
  note text not null default '',
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workspace_id,inventory_id) references public.autopilot_records(workspace_id,id) on delete restrict,
  unique(workspace_id,reference)
);
create index if not exists autopilot_stock_reservations_active_idx on public.autopilot_stock_reservations(workspace_id,inventory_id,status);
alter table public.autopilot_stock_reservations enable row level security;
revoke all on public.autopilot_stock_reservations from anon,authenticated;

create or replace function public.autopilot_stock_reservations_list() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then raise exception 'Workspace access denied.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'inventory_id',r.inventory_id,'item_name',i.data->>'name','reference',r.reference,'quantity',r.quantity,'status',r.status,'branch_id',r.branch_id,'note',r.note,'created_at',r.created_at,'updated_at',r.updated_at) order by r.created_at desc)
    from public.autopilot_stock_reservations r join public.autopilot_records i on i.workspace_id=r.workspace_id and i.id=r.inventory_id
    where r.workspace_id=w and public.autopilot_can_read(w,'inventory',i.data)),'[]'::jsonb);
end $$;

create or replace function public.autopilot_stock_reserve(p_inventory_id uuid,p_quantity numeric,p_reference text,p_note text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; item public.autopilot_records; ref text; available numeric; r public.autopilot_stock_reservations;
begin
  w:=public.autopilot_current_workspace(); ref:=left(btrim(coalesce(p_reference,'')),160);
  if p_quantity is null or p_quantity<=0 or ref='' then raise exception 'Enter a positive quantity and a unique reservation reference.'; end if;
  select * into item from public.autopilot_records where workspace_id=w and id=p_inventory_id and record_type='inventory' for update;
  if not found then raise exception 'Inventory item not found.'; end if;
  if not public.autopilot_can_write(w,'inventory',item.data) then raise exception 'You do not have permission to reserve this stock.'; end if;
  if exists(select 1 from public.autopilot_stock_reservations where workspace_id=w and reference=ref) then raise exception 'That reservation reference already exists.'; end if;
  available:=coalesce((item.data->>'quantity')::numeric,0)-coalesce((item.data->>'reserved')::numeric,0);
  if p_quantity>available then raise exception 'Not enough available stock. Available: %',available; end if;
  perform set_config('dealpin.stock_reservation_act','1',true);
  update public.autopilot_records set data=jsonb_set(data,'{reserved}',to_jsonb(coalesce((data->>'reserved')::numeric,0)+p_quantity),true),updated_at=now() where workspace_id=w and id=p_inventory_id;
  insert into public.autopilot_stock_reservations(workspace_id,inventory_id,reference,quantity,branch_id,note,actor_id)
    values(w,p_inventory_id,ref,p_quantity,nullif(item.data->>'branch_id','')::uuid,left(coalesce(p_note,''),2000),auth.uid()) returning * into r;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'stock_reserved','inventory',p_inventory_id);
  return jsonb_build_object('id',r.id,'inventory_id',r.inventory_id,'reference',r.reference,'quantity',r.quantity,'status',r.status);
end $$;

create or replace function public.autopilot_stock_release(p_reservation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; r public.autopilot_stock_reservations; item public.autopilot_records;
begin
  w:=public.autopilot_current_workspace();
  select * into r from public.autopilot_stock_reservations where workspace_id=w and id=p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  if r.status<>'Reserved' then raise exception 'Only an active reservation can be released.'; end if;
  select * into item from public.autopilot_records where workspace_id=w and id=r.inventory_id for update;
  if not found or not public.autopilot_can_write(w,'inventory',item.data) then raise exception 'You do not have permission to release this stock.'; end if;
  perform set_config('dealpin.stock_reservation_act','1',true);
  update public.autopilot_records set data=jsonb_set(data,'{reserved}',to_jsonb(greatest(0,coalesce((data->>'reserved')::numeric,0)-r.quantity)),true),updated_at=now() where workspace_id=w and id=r.inventory_id;
  update public.autopilot_stock_reservations set status='Released',updated_at=now() where id=r.id returning * into r;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'stock_reservation_released','inventory',r.inventory_id);
  return jsonb_build_object('id',r.id,'status',r.status,'quantity',r.quantity);
end $$;

create or replace function public.autopilot_stock_fulfill(p_reservation_id uuid,p_reference text default '') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; r public.autopilot_stock_reservations; item public.autopilot_records; movement jsonb; cost numeric; curr text;
begin
  w:=public.autopilot_current_workspace();
  select * into r from public.autopilot_stock_reservations where workspace_id=w and id=p_reservation_id for update;
  if not found then raise exception 'Reservation not found.'; end if;
  if r.status<>'Reserved' then raise exception 'Only an active reservation can be fulfilled.'; end if;
  select * into item from public.autopilot_records where workspace_id=w and id=r.inventory_id for update;
  if not found or not public.autopilot_can_write(w,'inventory',item.data) then raise exception 'You do not have permission to fulfil this reservation.'; end if;
  if coalesce((item.data->>'reserved')::numeric,0)<r.quantity or coalesce((item.data->>'quantity')::numeric,0)<r.quantity then raise exception 'Reserved or physical stock is no longer sufficient.'; end if;
  perform set_config('dealpin.stock_reservation_act','1',true);
  update public.autopilot_records set data=jsonb_set(data,'{reserved}',to_jsonb(coalesce((data->>'reserved')::numeric,0)-r.quantity),true),updated_at=now() where workspace_id=w and id=r.inventory_id;
  cost:=nullif(item.data->>'cost','')::numeric; curr:=nullif(upper(item.data->>'currency'),'');
  movement:=public.autopilot_stock_move(r.inventory_id,'sale',r.quantity,cost,curr,coalesce(nullif(p_reference,''),r.reference),'Fulfilled reservation '||r.reference,'reservation-fulfil:'||r.id::text);
  update public.autopilot_stock_reservations set status='Fulfilled',updated_at=now() where id=r.id returning * into r;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'stock_reservation_fulfilled','inventory',r.inventory_id);
  return jsonb_build_object('id',r.id,'status',r.status,'stock_movement',movement);
end $$;

create or replace function public.autopilot_stock_valuation() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active' and role in('owner','admin','manager','inventory','accountant','auditor')) then raise exception 'You do not have permission to view stock valuation.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('inventory_id',r.id,'name',r.data->>'name','sku',r.data->>'sku','quantity',coalesce((r.data->>'quantity')::numeric,0),'reserved',coalesce((r.data->>'reserved')::numeric,0),'available',coalesce((r.data->>'quantity')::numeric,0)-coalesce((r.data->>'reserved')::numeric,0),'unit_cost',coalesce((r.data->>'cost')::numeric,0),'currency',upper(coalesce(r.data->>'currency','')),'estimated_value',coalesce((r.data->>'quantity')::numeric,0)*coalesce((r.data->>'cost')::numeric,0),'branch_id',r.data->>'branch_id') order by r.data->>'name')
    from public.autopilot_records r where r.workspace_id=w and r.record_type='inventory' and exists(select 1 from public.autopilot_members m where m.workspace_id=w and m.user_id=auth.uid() and m.status='active' and m.role in('owner','admin','manager','inventory','accountant','auditor') and (m.branch_id is null or r.data->>'branch_id'=m.branch_id::text))),'[]'::jsonb);
end $$;

revoke all on function public.autopilot_stock_reservations_list(),public.autopilot_stock_reserve(uuid,numeric,text,text),public.autopilot_stock_release(uuid),public.autopilot_stock_fulfill(uuid,text),public.autopilot_stock_valuation() from public,anon;
grant execute on function public.autopilot_stock_reservations_list(),public.autopilot_stock_reserve(uuid,numeric,text,text),public.autopilot_stock_release(uuid),public.autopilot_stock_fulfill(uuid,text),public.autopilot_stock_valuation() to authenticated;
