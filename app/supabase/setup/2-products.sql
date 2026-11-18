-- Dealpin setup step 2-products. Safe to run again. Run the steps in order: 1, 2, 3, 4, then 5-verify.
-- Dealpin Phase Two: product catalogue and public product pages.
-- Apply after schema.sql and storage.sql on a staging project first.

create table if not exists public.products(
  id text primary key check(id ~ '^[a-z0-9]{10}$'),
  owner uuid not null references auth.users on delete cascade,
  title text not null check(char_length(title) between 1 and 100),
  description text not null default '' check(char_length(description)<=2000),
  category text not null default '' check(char_length(category)<=40),
  price numeric(15,3) not null check(price>0 and price<=100000000000),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  photos jsonb not null default '[]'::jsonb check(jsonb_typeof(photos)='array' and jsonb_array_length(photos)<=5),
  status text not null default 'draft' check(status in ('draft','published','paused')),
  available boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check(pg_column_size(photos)<32768)
);
create index if not exists products_owner_updated on public.products(owner,updated desc);
create index if not exists products_public on public.products(status,available,updated desc);

alter table public.products enable row level security;
drop policy if exists "product owner read" on public.products;
drop policy if exists "public published products" on public.products;
drop policy if exists "product owner insert" on public.products;
drop policy if exists "product owner update" on public.products;
drop policy if exists "product owner delete" on public.products;
drop policy if exists "product owner read" on public.products;
create policy "product owner read" on public.products for select to authenticated using(owner=(select auth.uid()));
drop policy if exists "public published products" on public.products;
create policy "public published products" on public.products for select to anon,authenticated using(status='published' and available=true);
drop policy if exists "product owner insert" on public.products;
create policy "product owner insert" on public.products for insert to authenticated with check(owner=(select auth.uid()));
drop policy if exists "product owner update" on public.products;
create policy "product owner update" on public.products for update to authenticated using(owner=(select auth.uid())) with check(owner=(select auth.uid()));
drop policy if exists "product owner delete" on public.products;
create policy "product owner delete" on public.products for delete to authenticated using(owner=(select auth.uid()));
grant select,insert,update,delete on public.products to authenticated;
grant select on public.products to anon;

-- Public detail endpoint returns only published, available products and a minimal seller identity.
create or replace function public_product(p_id text) returns jsonb
language sql stable security definer set search_path=public as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id,'title',p.title,'description',p.description,'category',p.category,
    'price',p.price,'currency',p.currency,'photos',p.photos,'status',p.status,
    'available',p.available,'created',p.created,'updated',p.updated,
    'seller',jsonb_build_object('name',pr.name,'handle',pr.handle)
  ) end
  from (select * from public.products where id=p_id and status='published' and available=true limit 1) p
  left join public.profiles pr on pr.id=p.owner;
$$;
revoke all on function public_product(text) from public;
grant execute on function public_product(text) to anon,authenticated;

-- Product photos use the existing deal-media bucket and seller-owned path prefix.
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4'] where id='deal-media';
drop policy if exists "seller uploads" on storage.objects;
drop policy if exists "seller uploads" on storage.objects;
create policy "seller uploads" on storage.objects for insert to authenticated
  with check(bucket_id='deal-media'
    and name ~ ('^s/'||(select auth.uid())::text||'/[0-9a-f]{32}\.(jpg|png|webp)$'));
