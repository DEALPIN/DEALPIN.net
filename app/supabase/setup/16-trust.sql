-- 16-trust.sql  Trust Score and Verified badge. Free for every seller. Run after 1 to 15 (and 5-verify.sql again).
-- The score is computed here, from real deal records only. The app can never set it. No payment, no plan.
-- Rules: nothing is shown until a seller has 5 completed deals. Score = volume 25 + ratings 30 + no disputes 25 + fast shipping 20.

create or replace function public.seller_trust(p_owner uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare done int; total int; disp int; rated int; avgs numeric; shipd int:=0; fast int:=0;
        sc numeric; v numeric; r numeric; c numeric; f numeric; tier text;
begin
  select count(*) filter(where status in('received','resolved')),
         count(*) filter(where status in('received','disputed','resolved')),
         count(*) filter(where status in('disputed','resolved')),
         count(*) filter(where doc#>>'{rating,stars}' ~ '^[1-5]$'),
         avg((doc#>>'{rating,stars}')::int) filter(where doc#>>'{rating,stars}' ~ '^[1-5]$')
    into done,total,disp,rated,avgs from public.deals where owner=p_owner;
  if p_owner is null or coalesce(done,0)<5 then
    return jsonb_build_object('tier','new','deals',coalesce(done,0),'need',5,'verified',false);
  end if;
  select count(*), count(*) filter(where sh-ag<=172800000) into shipd,fast from (
    select (select min((e->>'at')::numeric) from jsonb_array_elements(d.doc->'events') e where e->>'s'='agreed') ag,
           (select min((e->>'at')::numeric) from jsonb_array_elements(d.doc->'events') e where e->>'s'='shipped') sh
    from public.deals d where d.owner=p_owner and d.status in('received','disputed','resolved')) x
  where ag is not null and sh is not null;
  v:=least(done,50)/50.0*25;
  r:=case when rated=0 then 18 else (avgs-1)/4.0*30 end;
  c:=25*(1-disp::numeric/greatest(total,1));
  f:=case when shipd=0 then 12 else 20*fast::numeric/shipd end;
  sc:=round(v+r+c+f);
  tier:=case when sc>=85 then 'top' when sc>=70 then 'trusted' when sc>=50 then 'growing' else 'building' end;
  return jsonb_build_object('score',sc,'tier',tier,'deals',done,'rated',rated,'avg',round(coalesce(avgs,0),1),
    'disputes',disp,'verified',sc>=70);
end $$;
revoke all on function public.seller_trust(uuid) from public, anon, authenticated;

create or replace function public.my_trust() returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select public.seller_trust(auth.uid()) $$;
revoke all on function public.my_trust() from public, anon; grant execute on function public.my_trust() to authenticated;

-- Trust for a list of product ids (Explore ranking). Returns {productId: trust}. At most 60 ids.
create or replace function public.public_product_trust(p_ids text[]) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin perform hit('pt',60,60);
  return coalesce((select jsonb_object_agg(p.id,public.seller_trust(p.owner)) from public.products p
    where p.id=any(p_ids[1:60]) and p.status='published' and p.available=true),'{}'::jsonb); end $$;
revoke all on function public.public_product_trust(text[]) from public; grant execute on function public.public_product_trust(text[]) to anon, authenticated;

create or replace function public_receipt(p_id text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform hit('rc',60,60); return (select redact(doc)||jsonb_build_object('trust',public.seller_trust(owner)) from deals where id=p_id); end $$;

create or replace function public_verify(p_code text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform hit('vf',20,60);
  return (select redact(doc)||jsonb_build_object('trust',public.seller_trust(owner)) from deals where doc->>'code'=upper(btrim(p_code)) limit 1); end $$;

create or replace function public_seller(p_handle text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform hit('sr',60,60);
  return (select jsonb_build_object('seller',jsonb_build_object('name',p.name,'handle',p.handle),'trust',public.seller_trust(p.id),
    'deals',coalesce((select jsonb_agg(redact(d.doc) order by d.created desc) from deals d
       where d.owner=p.id and d.status in('received','disputed','resolved')),'[]'::jsonb))
    from profiles p where p.handle=p_handle); end $$;

create or replace function buyer_get_deal(p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform hit('tk',120,60); return (select doc||jsonb_build_object('trust',public.seller_trust(owner)) from deals where buyer_token=p_token); end $$;

create or replace function public_product(p_id text) returns jsonb
language sql stable security definer set search_path=public as $$
  select case when p.id is null then null else jsonb_build_object(
    'id',p.id,'title',p.title,'description',p.description,'category',p.category,
    'price',p.price,'currency',p.currency,'photos',p.photos,'status',p.status,
    'available',p.available,'created',p.created,'updated',p.updated,
    'seller',jsonb_build_object('name',pr.name,'handle',pr.handle),'trust',public.seller_trust(p.owner)
  ) end
  from (select * from public.products where id=p_id and status='published' and available=true limit 1) p
  left join public.profiles pr on pr.id=p.owner;
$$;
revoke all on function public_product(text) from public; grant execute on function public_product(text) to anon, authenticated;
