-- Dealpin Business Autopilot: free CRM, sales pipeline, inventory, tasks, workflows,
-- expenses, suppliers, branches, staff roster and workspace invitations.
-- Run after setup steps 1-16. This migration adds business operations and workspace records only.

create table if not exists public.autopilot_workspaces(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'My business',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.autopilot_members(
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check(role in('owner','admin','manager','sales','cashier','inventory','accountant','auditor')),
  branch_id uuid,
  status text not null default 'active' check(status in('active','suspended')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create table if not exists public.autopilot_preferences(
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_workspace_id uuid references public.autopilot_workspaces(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.autopilot_records(
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  record_type text not null check(record_type in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders')),
  data jsonb not null check(jsonb_typeof(data)='object'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,id)
);
create index if not exists autopilot_records_type_updated_idx on public.autopilot_records(workspace_id,record_type,updated_at desc);
create index if not exists autopilot_records_branch_idx on public.autopilot_records(workspace_id,(data->>'branch_id'));
create table if not exists public.autopilot_audit(
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null,
  record_type text not null,
  record_id uuid,
  happened_at timestamptz not null default now()
);
create index if not exists autopilot_audit_workspace_time_idx on public.autopilot_audit(workspace_id,happened_at desc);
create table if not exists public.autopilot_invites(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.autopilot_workspaces(id) on delete cascade,
  email text not null,
  role text not null check(role in('admin','manager','sales','cashier','inventory','accountant','auditor')),
  branch_id uuid,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.autopilot_invites add column if not exists branch_id uuid;
create index if not exists autopilot_invites_workspace_idx on public.autopilot_invites(workspace_id,email);

alter table public.autopilot_workspaces enable row level security;
alter table public.autopilot_members enable row level security;
alter table public.autopilot_preferences enable row level security;
alter table public.autopilot_records enable row level security;
alter table public.autopilot_audit enable row level security;
alter table public.autopilot_invites enable row level security;
revoke all on public.autopilot_workspaces,public.autopilot_members,public.autopilot_preferences,public.autopilot_records,public.autopilot_audit,public.autopilot_invites from anon,authenticated;

create or replace function public.autopilot_current_workspace() returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); w uuid; n text;
begin
  if u is null then raise exception 'Please sign in.'; end if;
  select active_workspace_id into w from public.autopilot_preferences where user_id=u;
  if w is not null and not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=u and status='active') then w:=null; end if;
  if w is null then
    select x.id into w from public.autopilot_workspaces x join public.autopilot_members m on m.workspace_id=x.id
      where m.user_id=u and m.status='active' order by case when x.owner_id=u then 0 else 1 end,x.created_at limit 1;
  end if;
  if w is null then
    select coalesce(nullif(name,''),'My business') into n from public.profiles where id=u;
    insert into public.autopilot_workspaces(owner_id,name) values(u,coalesce(n,'My business'))
      on conflict(owner_id) do update set updated_at=now() returning id into w;
    insert into public.autopilot_members(workspace_id,user_id,role) values(w,u,'owner') on conflict do nothing;
  end if;
  insert into public.autopilot_preferences(user_id,active_workspace_id) values(u,w)
    on conflict(user_id) do update set active_workspace_id=excluded.active_workspace_id,updated_at=now();
  return w;
end $$;

create or replace function public.autopilot_list_workspaces() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'Please sign in.'; end if;
  perform public.autopilot_current_workspace();
  return coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',m.role,'owner_id',w.owner_id,'branch_id',m.branch_id) order by w.created_at)
    from public.autopilot_workspaces w join public.autopilot_members m on m.workspace_id=w.id
    where m.user_id=u and m.status='active'),'[]'::jsonb);
end $$;

create or replace function public.autopilot_set_workspace(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); r jsonb;
begin
  if u is null then raise exception 'Please sign in.'; end if;
  if not exists(select 1 from public.autopilot_members where workspace_id=p_workspace and user_id=u and status='active') then raise exception 'You do not belong to that workspace.'; end if;
  insert into public.autopilot_preferences(user_id,active_workspace_id) values(u,p_workspace)
    on conflict(user_id) do update set active_workspace_id=excluded.active_workspace_id,updated_at=now();
  select jsonb_build_object('id',w.id,'name',w.name,'role',m.role,'branch_id',m.branch_id) into r from public.autopilot_workspaces w
    join public.autopilot_members m on m.workspace_id=w.id where w.id=p_workspace and m.user_id=u;
  return r;
end $$;

create or replace function public.autopilot_workspace_info() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; r jsonb;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active') then raise exception 'Workspace access denied.'; end if;
  select jsonb_build_object('id',x.id,'name',x.name,'owner_id',x.owner_id,'role',m.role,'branch_id',m.branch_id,'created_at',x.created_at)
    into r from public.autopilot_workspaces x join public.autopilot_members m on m.workspace_id=x.id
    where x.id=w and m.user_id=auth.uid() and m.status='active';
  return r;
end $$;

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

-- Bounded page API for large workspaces. The legacy autopilot_list remains for compatibility;
-- clients can use this function to avoid one unbounded JSON aggregation as workspaces grow.
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
declare w uuid; rid uuid; existing public.autopilot_records;
begin
  w:=public.autopilot_current_workspace();
  if p_type not in('customers','opportunities','inventory','suppliers','tasks','expenses','branches','staff','automations','notes','purchase_orders') then raise exception 'Unknown business record type.'; end if;
  if jsonb_typeof(p_data)<>'object' then raise exception 'Business record must be an object.'; end if;
  perform public.dealpin_validate_autopilot_data(p_type,p_data);
  if not public.autopilot_can_write(w,p_type,p_data) then raise exception 'You do not have permission to update this business area.'; end if;
  if p_type='customers' and coalesce(btrim(p_data->>'name'),'')='' then raise exception 'Customer name is required.'; end if;
  if p_type='opportunities' and coalesce(btrim(p_data->>'title'),'')='' then raise exception 'Opportunity title is required.'; end if;
  if p_type='inventory' and coalesce(btrim(p_data->>'name'),'')='' then raise exception 'Product name is required.'; end if;
  if coalesce(p_data->>'currency','')<>'' and upper(p_data->>'currency') !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code.'; end if;
  if coalesce(p_data->>'branch_id','')<>'' and not exists(select 1 from public.autopilot_records where workspace_id=w and id=(p_data->>'branch_id')::uuid and record_type='branches') then raise exception 'That branch does not belong to this workspace.'; end if;
  if p_type='expenses' and coalesce((p_data->>'amount')::numeric,0)<0 then raise exception 'Expense amount cannot be negative.'; end if;
  if p_type='inventory' and (coalesce((p_data->>'quantity')::numeric,0)<0 or coalesce((p_data->>'reserved')::numeric,0)<0 or coalesce((p_data->>'reorder_point')::numeric,0)<0) then raise exception 'Stock quantities cannot be negative.'; end if;
  if p_id is null then
    insert into public.autopilot_records(workspace_id,record_type,data,created_by) values(w,p_type,p_data,auth.uid()) returning * into existing;
    rid:=existing.id;
    insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'created',p_type,rid);
  else
    update public.autopilot_records set data=p_data,updated_at=now() where workspace_id=w and id=p_id and record_type=p_type returning * into existing;
    if not found then raise exception 'Business record not found.'; end if;
    rid:=existing.id;
    insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'updated',p_type,rid);
  end if;
  return jsonb_build_object('id',existing.id,'type',existing.record_type,'data',existing.data,'created_at',existing.created_at,'updated_at',existing.updated_at);
end $$;

create or replace function public.autopilot_remove(p_type text,p_id uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; n int; d jsonb;
begin
  w:=public.autopilot_current_workspace();
  select data into d from public.autopilot_records where workspace_id=w and id=p_id and record_type=p_type;
  if not found then raise exception 'Business record not found.'; end if;
  if not public.autopilot_can_write(w,p_type,d) then raise exception 'You do not have permission to remove this business record.'; end if;
  delete from public.autopilot_records where workspace_id=w and id=p_id and record_type=p_type;
  get diagnostics n=row_count;
  if n=0 then raise exception 'Business record not found.'; end if;
  insert into public.autopilot_audit(workspace_id,actor_id,action,record_type,record_id) values(w,auth.uid(),'deleted',p_type,p_id);
  return true;
end $$;

create extension if not exists pgcrypto with schema extensions;

create or replace function public.autopilot_audit_list() returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare w uuid; role_name text;
begin
  w:=public.autopilot_current_workspace();
  select role into role_name from public.autopilot_members where workspace_id=w and user_id=auth.uid() and status='active';
  if role_name not in('owner','admin','auditor') then raise exception 'You do not have permission to view the audit history.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('action',a.action,'record_type',a.record_type,'record_id',a.record_id,'actor_id',a.actor_id,'happened_at',a.happened_at) order by a.happened_at desc)
    from (select * from public.autopilot_audit where workspace_id=w order by happened_at desc limit 100) a),'[]'::jsonb);
end $$;

drop function if exists public.autopilot_invite(text,text);
drop function if exists public.autopilot_invite(text,text,uuid);
create or replace function public.autopilot_invite(p_email text,p_role text,p_branch uuid default null) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare w uuid; tok text; inv public.autopilot_invites;
begin
  w:=public.autopilot_current_workspace();
  if not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and role in('owner','admin') and status='active') then raise exception 'Only an owner or administrator can invite team members.'; end if;
  if p_role not in('admin','manager','sales','cashier','inventory','accountant','auditor') then raise exception 'That team role is not available.'; end if;
  if p_role='admin' and not exists(select 1 from public.autopilot_members where workspace_id=w and user_id=auth.uid() and role='owner' and status='active') then raise exception 'Only the workspace owner can invite another administrator.'; end if;
  if p_branch is not null and not exists(select 1 from public.autopilot_records where workspace_id=w and id=p_branch and record_type='branches') then raise exception 'That branch does not belong to this workspace.'; end if;
  if lower(btrim(p_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  tok:=encode(gen_random_bytes(32),'hex');
  insert into public.autopilot_invites(workspace_id,email,role,branch_id,token_hash,invited_by)
    values(w,lower(btrim(p_email)),p_role,p_branch,encode(digest(tok,'sha256'),'hex'),auth.uid()) returning * into inv;
  return jsonb_build_object('token',tok,'email',inv.email,'role',inv.role,'expires_at',inv.expires_at);
end $$;

create or replace function public.autopilot_accept_invite(p_token text) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare u uuid:=auth.uid(); em text; inv public.autopilot_invites; wname text;
begin
  if u is null then raise exception 'Please sign in before accepting a workspace invitation.'; end if;
  em:=lower(coalesce(auth.jwt()->>'email',''));
  select * into inv from public.autopilot_invites where token_hash=encode(digest(coalesce(p_token,''),'sha256'),'hex') and accepted_at is null and expires_at>now() for update;
  if not found then raise exception 'This invitation is invalid, expired or already used.'; end if;
  if em='' or em<>inv.email then raise exception 'Sign in with the email address this invitation was sent to.'; end if;
  insert into public.autopilot_members(workspace_id,user_id,role,branch_id) values(inv.workspace_id,u,inv.role,inv.branch_id)
    on conflict(workspace_id,user_id) do update set role=case when public.autopilot_members.role='owner' then 'owner' else excluded.role end,branch_id=excluded.branch_id,status='active';
  update public.autopilot_invites set accepted_at=now() where id=inv.id;
  insert into public.autopilot_preferences(user_id,active_workspace_id) values(u,inv.workspace_id)
    on conflict(user_id) do update set active_workspace_id=excluded.active_workspace_id,updated_at=now();
  select name into wname from public.autopilot_workspaces where id=inv.workspace_id;
  return jsonb_build_object('workspace_id',inv.workspace_id,'workspace_name',wname,'role',inv.role);
end $$;

revoke all on function public.autopilot_current_workspace(),public.autopilot_can_write(uuid,text,jsonb),public.autopilot_can_read(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.autopilot_list_workspaces(),public.autopilot_set_workspace(uuid),public.autopilot_workspace_info(),public.autopilot_list(text),public.autopilot_save(text,uuid,jsonb),public.autopilot_remove(text,uuid),public.autopilot_audit_list(),public.autopilot_invite(text,text,uuid),public.autopilot_accept_invite(text) from public,anon;
grant execute on function public.autopilot_list_workspaces(),public.autopilot_set_workspace(uuid),public.autopilot_workspace_info(),public.autopilot_list(text),public.autopilot_save(text,uuid,jsonb),public.autopilot_remove(text,uuid),public.autopilot_audit_list(),public.autopilot_invite(text,text,uuid),public.autopilot_accept_invite(text) to authenticated;


-- ---------------------------------------------------------------- input / API hardening
-- Server-side validation is authoritative: frontend checks are only an early UX guard.
create or replace function public.dealpin_validate_autopilot_data(p_type text,p_data jsonb)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare k text; v text;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Business record must be an object.'; end if;
  if pg_column_size(p_data)>65536 then raise exception 'Business record is too large.'; end if;
  for k,v in select key,value from jsonb_each_text(p_data) loop
    if length(v)>4000 then raise exception 'A business record field is too long.'; end if;
  end loop;
  if coalesce(p_data->>'name','')<>'' and length(p_data->>'name')>160 then raise exception 'Name is too long.'; end if;
  if coalesce(p_data->>'title','')<>'' and length(p_data->>'title')>160 then raise exception 'Title is too long.'; end if;
  if coalesce(p_data->>'description','')<>'' and length(p_data->>'description')>2000 then raise exception 'Description is too long.'; end if;
  if coalesce(p_data->>'notes','')<>'' and length(p_data->>'notes')>2000 then raise exception 'Notes are too long.'; end if;
  if coalesce(p_data->>'phone','')<>'' and length(p_data->>'phone')>40 then raise exception 'Phone number is too long.'; end if;
  if coalesce(p_data->>'email','')<>'' and (length(p_data->>'email')>254 or p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid email address.'; end if;
  if coalesce(p_data->>'currency','')<>'' and upper(p_data->>'currency') !~ '^[A-Z]{3}$' then raise exception 'Enter a valid three-letter currency code.'; end if;
  if coalesce(p_data->>'branch_id','')<>'' and p_data->>'branch_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception 'Invalid branch.'; end if;
  foreach k in array (array['amount','price','quantity','reserved','reorder_point','unit_cost']) loop
    if coalesce(p_data->>k,'')<>'' and p_data->>k !~ '^(0|[0-9]+)(\.[0-9]{1,3})?$' then raise exception 'Invalid numeric value.'; end if;
    if coalesce(p_data->>k,'')<>'' and (p_data->>k)::numeric>100000000000 then raise exception 'Numeric value is too large.'; end if;
  end loop;
  if p_type='inventory' and coalesce(p_data->>'quantity','')<>'' and (p_data->>'quantity')::numeric<0 then raise exception 'Stock quantity cannot be negative.'; end if;
  if p_type='expenses' and coalesce(p_data->>'amount','')<>'' and (p_data->>'amount')::numeric<0 then raise exception 'Expense amount cannot be negative.'; end if;
end $$;
