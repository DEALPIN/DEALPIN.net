-- Dealpin setup step 8: admin console backend. Safe to run again.
-- Run after steps 1 to 4, 6 (admin.sql) and 7 (crash reports).
--
-- Who may use it: a user in public.admins who has signed in with a second factor (aal2).
-- Every admin function checks this inside the database. The console's own checks are only for display.
-- Activity: every admin action, every change to sellers, deals, products and purchase requests, and every view
-- of personal data is written to public.admin_events. Only admins can read it.
-- Deals are read-only in the console: a deal with a buyer is part of a verified record and cannot be edited.

-- 1. Admin check now requires a second factor -------------------------------------------------------------
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.admins where id=(select auth.uid()))
     and coalesce((select auth.jwt()->>'aal'),'')='aal2' $$;

-- Tells the console whether the signed-in user is an admin and which assurance level the session has.
-- Non-admins only learn their own answer.
create or replace function public.admin_gate() returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select jsonb_build_object('admin',exists(select 1 from public.admins where id=(select auth.uid())),
                            'aal',coalesce((select auth.jwt()->>'aal'),'aal1')) $$;

create or replace function public.admin_require() returns uuid language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'not found' using errcode='P0002'; end if;
  return (select auth.uid());
end $$;

-- 2. Activity log -----------------------------------------------------------------------------------------
create table if not exists public.admin_events(
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null check(char_length(action) <= 40),
  entity text not null check(char_length(entity) <= 20),
  entity_id text not null default '' check(char_length(entity_id) <= 80),
  summary text not null default '' check(char_length(summary) <= 300),
  reason text not null default '' check(char_length(reason) <= 300),
  detail jsonb not null default '{}'::jsonb check(pg_column_size(detail) < 4096)
);
create index if not exists admin_events_at on public.admin_events(at desc);
alter table public.admin_events enable row level security;
revoke all on public.admin_events from public,anon,authenticated;

create or replace function public.admin_log(p_action text,p_entity text,p_id text,p_summary text,p_reason text default '',p_detail jsonb default '{}')
returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.admin_events(actor,action,entity,entity_id,summary,reason,detail)
  values((select auth.uid()),left(p_action,40),left(p_entity,20),left(coalesce(p_id,''),80),left(coalesce(p_summary,''),300),left(coalesce(p_reason,''),300),coalesce(p_detail,'{}')) $$;

-- Changes to the app's own records. Contains ids and status words only, never names, phone numbers or deal contents.
create or replace function public.admin_log_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare ent text; eid text; msg text; act text:=lower(tg_op); who uuid:=(select auth.uid());
begin
  if tg_table_name='profiles' then
    ent:='seller'; eid:=coalesce(new.id,old.id)::text;
    msg:=case tg_op when 'INSERT' then 'Seller profile created' when 'DELETE' then 'Seller profile deleted' else 'Seller profile updated' end;
  elsif tg_table_name='deals' then
    ent:='deal'; eid:=coalesce(new.id,old.id);
    if tg_op='INSERT' then msg:='Deal created';
    elsif tg_op='DELETE' then msg:='Deal deleted';
    elsif new.status is distinct from old.status then msg:='Deal status: '||old.status||' to '||new.status;
    else msg:='Deal updated'; end if;
  elsif tg_table_name='products' then
    ent:='product'; eid:=coalesce(new.id,old.id);
    if tg_op='INSERT' then msg:='Product created';
    elsif tg_op='DELETE' then msg:='Product deleted';
    elsif new.status is distinct from old.status then msg:='Product status: '||old.status||' to '||new.status;
    else msg:='Product updated'; end if;
  elsif tg_table_name='product_requests' then
    ent:='request'; eid:=coalesce(new.id,old.id);
    if tg_op='INSERT' then msg:='Purchase request received';
    elsif tg_op='DELETE' then msg:='Purchase request deleted';
    elsif new.status is distinct from old.status then msg:='Request: '||old.status||' to '||new.status;
    else msg:='Request updated'; end if;
  end if;
  insert into public.admin_events(actor,action,entity,entity_id,summary) values(who,act,ent,coalesce(eid,''),msg);
  return null;
end $$;

drop trigger if exists admin_log_profiles on public.profiles;
create trigger admin_log_profiles after insert or update or delete on public.profiles for each row execute function public.admin_log_change();
drop trigger if exists admin_log_deals on public.deals;
create trigger admin_log_deals after insert or update or delete on public.deals for each row execute function public.admin_log_change();
drop trigger if exists admin_log_products on public.products;
create trigger admin_log_products after insert or update or delete on public.products for each row execute function public.admin_log_change();
drop trigger if exists admin_log_requests on public.product_requests;
create trigger admin_log_requests after insert or update or delete on public.product_requests for each row execute function public.admin_log_change();

-- 3. Reads ------------------------------------------------------------------------------------------------
-- Overview figures (kept from step 6, now with the second-factor check through is_admin()).
-- admin_overview() and the activity series are defined in step 6 and reused unchanged.

create or replace function public.admin_users(p_q text default '',p_limit int default 25,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare q text:=lower(coalesce(trim(p_q),'')); lim int:=least(greatest(coalesce(p_limit,25),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  perform public.admin_require();
  select count(*) into tot from auth.users u left join public.profiles p on p.id=u.id
    where q='' or lower(coalesce(u.email,'')) like '%'||q||'%' or lower(coalesce(u.raw_user_meta_data->>'full_name','')) like '%'||q||'%'
      or lower(coalesce(p.name,'')) like '%'||q||'%' or lower(coalesce(p.handle,'')) like '%'||q||'%' or coalesce(u.phone,'') like '%'||q||'%';
  select coalesce(jsonb_agg(x order by (x->>'created')::timestamptz desc),'[]') into rows from (
    select jsonb_build_object('id',u.id,'email',u.email,'phone',u.phone,
      'name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),
      'method',u.raw_app_meta_data->>'provider','created',u.created_at,'last_sign_in',u.last_sign_in_at,
      'seen',greatest(u.last_sign_in_at,(select max(coalesce((to_jsonb(s)->>'refreshed_at')::timestamptz,s.updated_at,s.created_at)) from auth.sessions s where s.user_id=u.id)),
      'shop',p.name,'handle',p.handle,
      'deals',(select count(*) from public.deals d where d.owner=u.id),
      'products',(select count(*) from public.products pr where pr.owner=u.id),
      'suspended',coalesce(u.banned_until>now(),false),'banned_until',u.banned_until,
      'admin',exists(select 1 from public.admins a where a.id=u.id)) x
    from auth.users u left join public.profiles p on p.id=u.id
    where q='' or lower(coalesce(u.email,'')) like '%'||q||'%' or lower(coalesce(u.raw_user_meta_data->>'full_name','')) like '%'||q||'%'
      or lower(coalesce(p.name,'')) like '%'||q||'%' or lower(coalesce(p.handle,'')) like '%'||q||'%' or coalesce(u.phone,'') like '%'||q||'%'
    order by u.created_at desc limit lim offset off) t;
  if q<>'' then perform public.admin_log('search','users','',left('Searched users: '||q,300)); end if;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

-- One seller in full. Logged: it shows personal details.
create or replace function public.admin_user(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare me uuid; r jsonb;
begin
  me:=public.admin_require();
  select jsonb_build_object(
    'id',u.id,'email',u.email,'phone',u.phone,'confirmed',u.email_confirmed_at is not null or u.phone_confirmed_at is not null,
    'name',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name'),'method',u.raw_app_meta_data->>'provider',
    'created',u.created_at,'last_sign_in',u.last_sign_in_at,'suspended',coalesce(u.banned_until>now(),false),'banned_until',u.banned_until,
    'admin',exists(select 1 from public.admins a where a.id=u.id),
    'profile',(select jsonb_build_object('name',p.name,'handle',p.handle,'phone',p.phone,'pay',p.pay) from public.profiles p where p.id=u.id),
    'deals_by_status',(select coalesce(jsonb_object_agg(status,c),'{}') from (select status,count(*) c from public.deals where owner=u.id group by 1) s),
    'products',(select count(*) from public.products where owner=u.id),
    'requests',(select count(*) from public.product_requests where seller_id=u.id),
    'tool_records',(select coalesce(jsonb_object_agg(col,c),'{}') from (select col,count(*) c from public.mod_records where owner=u.id group by 1) s),
    'recent_deals',(select coalesce(jsonb_agg(x order by (x->>'created')::bigint desc),'[]') from (
        select jsonb_build_object('id',d.id,'title',d.doc->>'title','price',(d.doc->>'price')::numeric,'currency',d.doc->>'currency',
          'status',d.status,'created',(d.doc->>'created')::bigint) x
        from public.deals d where d.owner=u.id order by d.created desc limit 20) t)
  ) into r from auth.users u where u.id=p_id;
  if r is null then raise exception 'Account not found.'; end if;
  perform public.admin_log('view','user',p_id::text,'Viewed seller account');
  return r;
end $$;

-- Deals: list (no tokens are ever returned).
create or replace function public.admin_deals(p_q text default '',p_status text default '',p_limit int default 25,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare q text:=lower(coalesce(trim(p_q),'')); lim int:=least(greatest(coalesce(p_limit,25),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  perform public.admin_require();
  select count(*) into tot from public.deals d where (p_status='' or d.status=p_status)
    and (q='' or lower(d.id) like '%'||q||'%' or lower(coalesce(d.doc->>'title','')) like '%'||q||'%' or lower(coalesce(d.doc->'seller'->>'name','')) like '%'||q||'%' or lower(coalesce(d.doc->'buyer'->>'name','')) like '%'||q||'%');
  select coalesce(jsonb_agg(x order by (x->>'created')::bigint desc),'[]') into rows from (
    select jsonb_build_object('id',d.id,'owner',d.owner,'title',d.doc->>'title','price',(d.doc->>'price')::numeric,'currency',d.doc->>'currency',
      'status',d.status,'created',(d.doc->>'created')::bigint,'seller',d.doc->'seller'->>'name','buyer',d.doc->'buyer'->>'name','delivery',d.doc->>'delivery') x
    from public.deals d where (p_status='' or d.status=p_status)
      and (q='' or lower(d.id) like '%'||q||'%' or lower(coalesce(d.doc->>'title','')) like '%'||q||'%' or lower(coalesce(d.doc->'seller'->>'name','')) like '%'||q||'%' or lower(coalesce(d.doc->'buyer'->>'name','')) like '%'||q||'%')
    order by d.created desc limit lim offset off) t;
  if q<>'' then perform public.admin_log('search','deals','',left('Searched deals: '||q,300)); end if;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

-- One deal in full, without the buyer and rider link secrets. Logged.
create or replace function public.admin_deal(p_id text) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare r jsonb;
begin
  perform public.admin_require();
  select jsonb_build_object('id',d.id,'owner',d.owner,'status',d.status,'created',d.created,'doc',d.doc - 'buyer_token' - 'rider_token',
    'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',pr.id,'status',pr.status,'quantity',pr.quantity,'offer',pr.offer_price,'currency',pr.currency)),'[]') from public.product_requests pr where pr.deal_id=d.id))
    into r from public.deals d where d.id=p_id;
  if r is null then raise exception 'Deal not found.'; end if;
  perform public.admin_log('view','deal',p_id,'Viewed deal');
  return r;
end $$;

create or replace function public.admin_products(p_q text default '',p_status text default '',p_limit int default 25,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare q text:=lower(coalesce(trim(p_q),'')); lim int:=least(greatest(coalesce(p_limit,25),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  perform public.admin_require();
  select count(*) into tot from public.products pr where (p_status='' or pr.status=p_status) and (q='' or lower(pr.title) like '%'||q||'%' or lower(pr.id) like '%'||q||'%');
  select coalesce(jsonb_agg(x order by (x->>'updated')::timestamptz desc),'[]') into rows from (
    select jsonb_build_object('id',pr.id,'title',pr.title,'price',pr.price,'currency',pr.currency,'category',pr.category,'status',pr.status,
      'available',pr.available,'owner',pr.owner,'shop',p.name,'created',pr.created,'updated',pr.updated,
      'requests',(select count(*) from public.product_requests r where r.product_id=pr.id)) x
    from public.products pr left join public.profiles p on p.id=pr.owner
    where (p_status='' or pr.status=p_status) and (q='' or lower(pr.title) like '%'||q||'%' or lower(pr.id) like '%'||q||'%')
    order by pr.updated desc limit lim offset off) t;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

-- Moderation: publish or pause a product. The reason is required and is logged.
create or replace function public.admin_set_product_status(p_id text,p_status text,p_reason text) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; old text; t text:=trim(coalesce(p_reason,''));
begin
  me:=public.admin_require();
  if p_status not in ('draft','published','paused') then raise exception 'Unknown status.'; end if;
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).'; end if;
  select status into old from public.products where id=p_id for update;
  if old is null then raise exception 'Product not found.'; end if;
  if old=p_status then raise exception 'The product is already %.', p_status; end if;
  update public.products set status=p_status, updated=now() where id=p_id;
  perform public.admin_log('moderate','product',p_id,'Product '||old||' to '||p_status,t);
  return jsonb_build_object('id',p_id,'status',p_status);
end $$;

create or replace function public.admin_requests(p_status text default '',p_limit int default 25,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare lim int:=least(greatest(coalesce(p_limit,25),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  perform public.admin_require();
  select count(*) into tot from public.product_requests r where p_status='' or r.status=p_status;
  select coalesce(jsonb_agg(x order by (x->>'created')::timestamptz desc),'[]') into rows from (
    select jsonb_build_object('id',r.id,'product_id',r.product_id,'product',pr.title,'seller_id',r.seller_id,'buyer_name',r.buyer_name,
      'buyer_phone',r.buyer_phone,'quantity',r.quantity,'offer',r.offer_price,'currency',r.currency,'status',r.status,
      'deal_id',r.deal_id,'created',r.created,'updated',r.updated) x
    from public.product_requests r left join public.products pr on pr.id=r.product_id
    where p_status='' or r.status=p_status order by r.created desc limit lim offset off) t;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

-- Tool records of one seller (ledger, invoices, riders, jobs, settlements, stock, groups). Logged.
create or replace function public.admin_tool_records(p_owner uuid,p_col text default '',p_limit int default 100) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare rows jsonb;
begin
  perform public.admin_require();
  select coalesce(jsonb_agg(x order by (x->>'at')::bigint desc),'[]') into rows from (
    select jsonb_build_object('col',m.col,'id',m.id,'rev',m.rev,'at',m.at,'up',m.up,'doc',m.doc) x
    from public.mod_records m where m.owner=p_owner and (p_col='' or m.col=p_col) order by m.at desc limit least(greatest(coalesce(p_limit,100),1),500)) t;
  perform public.admin_log('view','tools',p_owner::text,'Viewed tool records'||case when p_col<>'' then ' ('||p_col||')' else '' end);
  return rows;
end $$;

-- Crash reports (from the app). No personal data is stored in them.
create or replace function public.admin_crashes(p_limit int default 50,p_offset int default 0,p_kind text default '') returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare lim int:=least(greatest(coalesce(p_limit,50),1),200); off int:=greatest(coalesce(p_offset,0),0); tot int; rows jsonb;
begin
  perform public.admin_require();
  select count(*) into tot from public.crash_reports c where p_kind='' or c.kind=p_kind;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') into rows from (
    select c.id,c.created_at,c.kind,c.msg,c.stack,c.page,c.v,c.ua from public.crash_reports c
    where p_kind='' or c.kind=p_kind order by c.created_at desc limit lim offset off) t;
  return jsonb_build_object('total',tot,'rows',rows);
end $$;

create or replace function public.admin_crash_groups(p_days int default 7) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare rows jsonb;
begin
  perform public.admin_require();
  select coalesce(jsonb_agg(x order by (x->>'count')::int desc),'[]') into rows from (
    select jsonb_build_object('msg',left(c.msg,300),'kind',min(c.kind),'count',count(*),'first',min(c.created_at),'last',max(c.created_at),
      'versions',(select coalesce(jsonb_agg(distinct v),'[]') from (select c2.v from public.crash_reports c2 where c2.msg=c.msg and c2.created_at>now()-make_interval(days=>greatest(coalesce(p_days,7),1)) and c2.v<>'') z)) x
    from public.crash_reports c where c.created_at>now()-make_interval(days=>greatest(coalesce(p_days,7),1))
    group by c.msg) t;
  return rows;
end $$;

-- Activity feed. p_after > 0: events newer than that id, oldest first (live updates).
-- Otherwise: newest first, optionally before p_before (history). Filters are optional.
create or replace function public.admin_events_feed(p_after bigint default 0,p_before bigint default null,p_limit int default 50,p_action text default '',p_entity text default '') returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare lim int:=least(greatest(coalesce(p_limit,50),1),200); rows jsonb;
begin
  perform public.admin_require();
  select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc),'[]') into rows from (
    select jsonb_build_object('id',e.id,'at',e.at,'action',e.action,'entity',e.entity,'entity_id',e.entity_id,'summary',e.summary,
      'reason',e.reason,'actor',e.actor,'actor_email',u.email) x
    from public.admin_events e left join auth.users u on u.id=e.actor
    where (coalesce(p_after,0)=0 or e.id>p_after) and (p_before is null or e.id<p_before)
      and (p_action='' or e.action=p_action) and (p_entity='' or e.entity=p_entity)
    order by e.id desc limit lim) t;
  if coalesce(p_after,0)>0 then
    select coalesce(jsonb_agg(x order by (x->>'id')::bigint),'[]') into rows from jsonb_array_elements(rows) x;
  end if;
  return rows;
end $$;

-- Figures for the charts: last p_days days, one value per day.
create or replace function public.admin_trends(p_days int default 30) returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare n int:=least(greatest(coalesce(p_days,30),7),365); out jsonb;
begin
  perform public.admin_require();
  select coalesce(jsonb_agg(x order by (x->>'d')), '[]') into out from (
    select jsonb_build_object('d',g::date,
      'signups',(select count(*) from auth.users u where u.created_at::date=g::date),
      'deals',(select count(*) from public.deals e where e.created::date=g::date),
      'requests',(select count(*) from public.product_requests r where r.created::date=g::date),
      'crashes',(select count(*) from public.crash_reports c where c.created_at::date=g::date),
      'events',(select count(*) from public.admin_events v where v.at::date=g::date)) x
    from generate_series(current_date-(n-1),current_date,'1 day') g) t;
  return out;
end $$;

-- Things that need attention now.
create or replace function public.admin_health() returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  perform public.admin_require();
  return jsonb_build_array(
    jsonb_build_object('key','disputed','label','Disputed deals','count',(select count(*) from public.deals where status='disputed'),'severity','high'),
    jsonb_build_object('key','stuck','label','Deals agreed or shipped for over 7 days','count',(select count(*) from public.deals where status in('agreed','shipped') and created<now()-interval '7 days'),'severity','medium'),
    jsonb_build_object('key','requests','label','Purchase requests waiting over 3 days','count',(select count(*) from public.product_requests where status='pending' and created<now()-interval '3 days'),'severity','medium'),
    jsonb_build_object('key','crashes1h','label','Crash reports in the last hour','count',(select count(*) from public.crash_reports where created_at>now()-interval '1 hour'),'severity','high'),
    jsonb_build_object('key','suspended','label','Suspended accounts','count',(select count(*) from auth.users where banned_until>now()),'severity','low'),
    jsonb_build_object('key','admins','label','Admin accounts','count',(select count(*) from public.admins),'severity','low'));
end $$;

create or replace function public.admin_admins() returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare me uuid; rows jsonb;
begin
  me:=public.admin_require();
  select coalesce(jsonb_agg(x order by (x->>'added')::timestamptz),'[]') into rows from (
    select jsonb_build_object('id',a.id,'email',u.email,'added',a.added,'is_me',a.id=me) x
    from public.admins a left join auth.users u on u.id=a.id) t;
  return rows;
end $$;

-- 4. Actions ----------------------------------------------------------------------------------------------
-- Suspend or reinstate a seller. A suspended seller cannot sign in, and their current sessions end at once.
create or replace function public.admin_set_suspended(p_id uuid,p_on boolean,p_reason text) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; t text:=trim(coalesce(p_reason,'')); em text;
begin
  me:=public.admin_require();
  if p_id=me then raise exception 'You cannot suspend your own account.'; end if;
  if exists(select 1 from public.admins where id=p_id) then raise exception 'Remove admin rights before suspending this account.'; end if;
  if p_on and char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).'; end if;
  select email into em from auth.users where id=p_id;
  if not found then raise exception 'Account not found.'; end if;
  if p_on then
    update auth.users set banned_until='infinity' where id=p_id;
    begin delete from auth.sessions where user_id=p_id; exception when undefined_table then null; end;
    perform public.admin_log('suspend','user',p_id::text,'Account suspended',t);
  else
    update auth.users set banned_until=null where id=p_id;
    perform public.admin_log('reinstate','user',p_id::text,'Account reinstated',t);
  end if;
  return jsonb_build_object('id',p_id,'suspended',p_on);
end $$;

-- Give admin rights to an existing account. The new admin must still set up a second factor.
create or replace function public.admin_add_admin(p_email text,p_reason text) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; uid uuid; t text:=trim(coalesce(p_reason,''));
begin
  me:=public.admin_require();
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).'; end if;
  select id into uid from auth.users where lower(email)=lower(trim(coalesce(p_email,''))) limit 1;
  if uid is null then raise exception 'No account with that email. Ask them to sign up first.'; end if;
  insert into public.admins(id) values(uid) on conflict do nothing;
  perform public.admin_log('grant','admin',uid::text,'Admin rights granted',t);
  return jsonb_build_object('id',uid);
end $$;

-- Remove admin rights. You cannot remove yourself, and at least one admin must remain.
create or replace function public.admin_remove_admin(p_id uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; t text:=trim(coalesce(p_reason,''));
begin
  me:=public.admin_require();
  if p_id=me then raise exception 'You cannot remove your own admin rights.'; end if;
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).'; end if;
  if (select count(*) from public.admins)<=1 then raise exception 'At least one admin must remain.'; end if;
  delete from public.admins where id=p_id;
  if not found then raise exception 'That account is not an admin.'; end if;
  perform public.admin_log('revoke','admin',p_id::text,'Admin rights removed',t);
  return jsonb_build_object('id',p_id);
end $$;

-- Correct a seller's public name or payment line (for example a typo or an abusive name). Reason logged.
create or replace function public.admin_set_profile(p_id uuid,p_name text,p_pay text,p_reason text) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare me uuid; t text:=trim(coalesce(p_reason,''));
begin
  me:=public.admin_require();
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).'; end if;
  update public.profiles set name=trim(p_name), pay=coalesce(p_pay,'') where id=p_id;
  if not found then raise exception 'Seller profile not found.'; end if;
  perform public.admin_log('edit','seller',p_id::text,'Seller name or payment line edited',t);
  return jsonb_build_object('id',p_id);
end $$;

-- 5. Access ----------------------------------------------------------------------------------------------
revoke all on function public.admin_log(text,text,text,text,text,jsonb),public.admin_log_change() from public,anon,authenticated;
revoke all on function public.is_admin(),public.admin_gate(),public.admin_require(),public.admin_overview(),
  public.admin_users(text,int,int),public.admin_user(uuid),public.admin_deals(text,text,int,int),public.admin_deal(text),
  public.admin_products(text,text,int,int),public.admin_set_product_status(text,text,text),public.admin_requests(text,int,int),
  public.admin_tool_records(uuid,text,int),public.admin_crashes(int,int,text),public.admin_crash_groups(int),
  public.admin_events_feed(bigint,bigint,int,text,text),public.admin_trends(int),public.admin_health(),public.admin_admins(),
  public.admin_set_suspended(uuid,boolean,text),public.admin_add_admin(text,text),public.admin_remove_admin(uuid,text),
  public.admin_set_profile(uuid,text,text,text) from public,anon;
grant execute on function public.is_admin(),public.admin_gate(),public.admin_overview(),
  public.admin_users(text,int,int),public.admin_user(uuid),public.admin_deals(text,text,int,int),public.admin_deal(text),
  public.admin_products(text,text,int,int),public.admin_set_product_status(text,text,text),public.admin_requests(text,int,int),
  public.admin_tool_records(uuid,text,int),public.admin_crashes(int,int,text),public.admin_crash_groups(int),
  public.admin_events_feed(bigint,bigint,int,text,text),public.admin_trends(int),public.admin_health(),public.admin_admins(),
  public.admin_set_suspended(uuid,boolean,text),public.admin_add_admin(text,text),public.admin_remove_admin(uuid,text),
  public.admin_set_profile(uuid,text,text,text) to authenticated;

notify pgrst,'reload schema';
