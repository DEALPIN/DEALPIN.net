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
create policy "seller reads own product requests" on public.product_requests
  for select to authenticated using(seller_id=(select auth.uid()));
create policy "seller updates own product requests" on public.product_requests
  for update to authenticated using(seller_id=(select auth.uid())) with check(seller_id=(select auth.uid()));
grant select,update on public.product_requests to authenticated;
revoke all on public.product_requests from anon;

-- Buyer submission and buyer response must be implemented through narrowly
-- scoped RPCs using a high-entropy buyer capability token. Do not expose buyer
-- phone numbers or allow anon table reads. The Phase Three local test build
-- intentionally does not expose an unauthenticated production write endpoint.
