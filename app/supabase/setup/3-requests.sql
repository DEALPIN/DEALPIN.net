-- Dealpin setup step 3-requests. Safe to run again. Run the steps in order: 1, 2, 3, 4, then 5-verify.
-- Dealpin Phase Three: buyer product requests.
-- Apply after schema.sql, storage.sql and phase-two-products.sql.
-- This schema is for the authenticated online rollout. The current test build
-- deliberately uses LocalStore and does not call these tables.

create table if not exists public.product_requests (
  id text primary key check(id ~ '^[a-z0-9]{10}$'),
  product_id text not null references public.products(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null check(char_length(buyer_name) between 1 and 60),
  buyer_phone text not null check(char_length(buyer_phone) between 5 and 24),
  buyer_message text not null default '' check(char_length(buyer_message)<=600),
  quantity integer not null check(quantity between 1 and 999),
  product_price numeric(15,3) not null check(product_price>0),
  offer_price numeric(15,3) not null check(offer_price>0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check(status in ('pending','countered','accepted','declined','converted')),
  counter_price numeric(15,3),
  counter_message text not null default '' check(char_length(counter_message)<=300),
  deal_id text references public.deals(id) on delete set null,
  history jsonb not null default '[]'::jsonb check(jsonb_typeof(history)='array'),
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check((status='countered' and counter_price is not null) or status<>'countered')
);
create index if not exists product_requests_seller_updated on public.product_requests(seller_id,updated desc);
create index if not exists product_requests_product_created on public.product_requests(product_id,created desc);

alter table public.product_requests enable row level security;
drop policy if exists "seller reads own product requests" on public.product_requests;
drop policy if exists "seller updates own product requests" on public.product_requests;
drop policy if exists "seller reads own product requests" on public.product_requests;
create policy "seller reads own product requests" on public.product_requests
  for select to authenticated using(seller_id=(select auth.uid()));
drop policy if exists "seller updates own product requests" on public.product_requests;
create policy "seller updates own product requests" on public.product_requests
  for update to authenticated using(seller_id=(select auth.uid())) with check(seller_id=(select auth.uid()));
grant select,update on public.product_requests to authenticated;
revoke all on public.product_requests from anon;

-- Buyer submission and buyer response must be implemented through narrowly
-- scoped RPCs using a high-entropy buyer capability token. Do not expose buyer
-- phone numbers or allow anon table reads. The Phase Three local test build
-- intentionally does not expose an unauthenticated production write endpoint.

-- Dealpin Phase Four: online purchase requests.
-- Apply after schema.sql, storage.sql, phase-two-products.sql and phase-three-requests.sql, on a staging project first.
-- Buyers have no account: each request carries a private buyer token (like deal links). The seller token never leaves the database.

alter table public.product_requests add column if not exists buyer_token text unique check(buyer_token ~ '^[0-9a-f]{32}$');
alter table public.product_requests add column if not exists product_title text not null default '' check(char_length(product_title)<=100);
-- Deleting a product must not be blocked by, or erase, the requests made for it.
alter table public.product_requests alter column product_id drop not null;
alter table public.product_requests drop constraint if exists product_requests_product_id_fkey;
alter table public.product_requests add constraint product_requests_product_id_fkey foreign key(product_id) references public.products(id) on delete set null;

-- One JSON shape for every caller, matching what the app shows. The buyer token is never part of it.
create or replace function request_view(r public.product_requests) returns jsonb language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'id',r.id,'productId',r.product_id,'productTitle',r.product_title,'productPrice',r.product_price,'currency',r.currency,
    'quantity',r.quantity,'offer',r.offer_price,'buyerName',r.buyer_name,'phone',r.buyer_phone,'message',r.buyer_message,
    'status',r.status,'created',floor(extract(epoch from r.created)*1000),'updated',floor(extract(epoch from r.updated)*1000),
    'history',r.history,'dealId',r.deal_id,
    'counter',case when r.counter_price is not null and r.status='countered'
      then jsonb_build_object('price',r.counter_price,'message',r.counter_message) end)) $$;

create or replace function create_product_request(p_product_id text,p_name text,p_phone text,p_qty int,p_offer numeric,p_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.products; n text:=clean(p_name,60); ph text:=clean(p_phone,24); at bigint:=floor(extract(epoch from clock_timestamp())*1000);
        r public.product_requests; tok text:=replace(gen_random_uuid()::text,'-','');
begin
  perform hit('request',10,3600);
  select * into p from public.products where id=p_product_id and status='published' and available=true;
  if not found then raise exception 'This product is no longer available.'; end if;
  if n='' then raise exception 'Enter your name.'; end if;
  if ph !~ '^[0-9+() -]{5,24}$' then raise exception 'Enter a valid contact number.'; end if;
  if p_qty is null or p_qty<1 or p_qty>999 then raise exception 'Enter a quantity from 1 to 999.'; end if;
  if p_offer is null or p_offer<=0 or p_offer*p_qty>100000000000 or round(p_offer,3)<>p_offer then raise exception 'Enter a valid offer price and quantity.'; end if;
  insert into public.product_requests(id,product_id,product_title,seller_id,buyer_name,buyer_phone,buyer_message,quantity,product_price,offer_price,currency,buyer_token,history)
  values(substr(replace(gen_random_uuid()::text,'-',''),1,10),p.id,p.title,p.owner,n,ph,clean(p_message,600),p_qty,p.price,p_offer,p.currency,tok,
         jsonb_build_array(jsonb_build_object('status','pending','at',at,'message','Request submitted')))
  returning * into r;
  return request_view(r)||jsonb_build_object('token',tok);
end $$;

create or replace function buyer_get_request(p_id text,p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.product_requests;
begin
  perform hit('request-read',120,60);
  select * into r from public.product_requests where id=p_id and buyer_token=p_token;
  if not found then return null; end if;
  return request_view(r);
end $$;

-- Buyer answers a counter-offer, or withdraws. Only with the private token.
create or replace function buyer_request_act(p_id text,p_token text,p_action text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.product_requests; at bigint:=floor(extract(epoch from clock_timestamp())*1000);
begin
  perform hit('request-act',30,3600);
  select * into r from public.product_requests where id=p_id and buyer_token=p_token for update;
  if not found then raise exception 'This request could not be found.'; end if;
  if p_action='accept' and r.status='countered' then
    update public.product_requests set status='accepted',offer_price=r.counter_price,counter_price=null,counter_message='',updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','accepted','at',at,'message','Buyer accepted the counter-offer')) where id=r.id returning * into r;
  elsif p_action='decline' and r.status='countered' then
    update public.product_requests set status='declined',counter_price=null,counter_message='',updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','declined','at',at,'message','Buyer declined the counter-offer')) where id=r.id returning * into r;
  elsif p_action='withdraw' and r.status in ('pending','countered') then
    update public.product_requests set status='declined',counter_price=null,counter_message='',updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','declined','at',at,'message','Buyer withdrew the request')) where id=r.id returning * into r;
  else raise exception 'That action is not available.'; end if;
  return request_view(r);
end $$;

create or replace function seller_list_requests() returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(request_view(r) order by r.updated desc),'[]'::jsonb) from public.product_requests r where r.seller_id=(select auth.uid()) $$;

create or replace function seller_request_act(p_id text,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.product_requests; at bigint:=floor(extract(epoch from clock_timestamp())*1000); pr numeric; m text; d text;
begin
  perform hit('request-seller',120,3600);
  select * into r from public.product_requests where id=p_id and seller_id=(select auth.uid()) for update;
  if not found then raise exception 'Request not found.'; end if;
  if p_action='convert' then
    if r.status<>'accepted' then raise exception 'The request must be accepted before creating a deal.'; end if;
    d:=p_payload->>'deal_id';
    if not exists(select 1 from public.deals where id=d and owner=(select auth.uid())) then raise exception 'That deal could not be found.'; end if;
    update public.product_requests set status='converted',deal_id=d,updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','converted','at',at,'message','Converted into a Dealpin deal','dealId',d)) where id=r.id returning * into r;
    return request_view(r);
  end if;
  if r.status not in ('pending','countered') then raise exception 'This request is already closed.'; end if;
  if p_action='accept' then
    update public.product_requests set status='accepted',offer_price=coalesce(counter_price,offer_price),counter_price=null,counter_message='',updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','accepted','at',at,'message','Seller accepted the request')) where id=r.id returning * into r;
  elsif p_action='decline' then
    m:=clean(p_payload->>'message',300);
    update public.product_requests set status='declined',counter_price=null,counter_message='',updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','declined','at',at,'message',coalesce(nullif(m,''),'Seller declined the request'))) where id=r.id returning * into r;
  elsif p_action='counter' then
    begin pr:=(p_payload->>'price')::numeric; exception when others then pr:=null; end;
    m:=clean(p_payload->>'message',300);
    if pr is null or pr<=0 or round(pr,3)<>pr or pr*r.quantity>100000000000 then raise exception 'Enter a valid counter-offer.'; end if;
    update public.product_requests set status='countered',counter_price=pr,counter_message=m,updated=now(),
      history=history||jsonb_build_array(jsonb_build_object('status','countered','at',at,'message',coalesce(nullif(m,''),'Seller made a counter-offer'),'price',pr)) where id=r.id returning * into r;
  else raise exception 'That action is not available.'; end if;
  return request_view(r);
end $$;

-- Sellers read requests only through seller_list_requests (no table access, so buyer tokens stay private).
revoke all on public.product_requests from anon,authenticated;
drop policy if exists "seller reads own product requests" on public.product_requests;
drop policy if exists "seller updates own product requests" on public.product_requests;

revoke all on function request_view(public.product_requests),create_product_request(text,text,text,int,numeric,text),buyer_get_request(text,text),
  buyer_request_act(text,text,text),seller_list_requests(),seller_request_act(text,text,jsonb) from public,anon,authenticated;
grant execute on function create_product_request(text,text,text,int,numeric,text),buyer_get_request(text,text),buyer_request_act(text,text,text) to anon,authenticated;
grant execute on function seller_list_requests(),seller_request_act(text,text,jsonb) to authenticated;
