-- Dealpin install check. Paste into the Supabase SQL editor AFTER running schema.sql, storage.sql and phase-two to phase-five. It changes nothing.
-- Every row must say ok = true. A false row names what is missing or too open.
with t(name,ok) as (values
  -- tables exist and are locked down (row level security on)
  ('table deals has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.deals')),false)),
  ('table profiles has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.profiles')),false)),
  ('table products has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.products')),false)),
  ('table product_requests has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.product_requests')),false)),
  ('table mod_records has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.mod_records')),false)),
  ('table rate has row level security',coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.rate')),false)),
  -- the public can never read these directly
  ('anon cannot read deals, requests, tools or rate limits',not exists(select 1 from (values('public.deals'),('public.product_requests'),('public.mod_records'),('public.rate')) v(n) where to_regclass(v.n) is not null and has_table_privilege('anon',to_regclass(v.n),'select,insert,update,delete'))),
  ('signed-in users cannot read requests, tools or rate limits directly',not exists(select 1 from (values('public.product_requests'),('public.mod_records'),('public.rate')) v(n) where to_regclass(v.n) is not null and has_table_privilege('authenticated',to_regclass(v.n),'select,insert,update,delete'))),
  ('nobody can update deals directly',not has_table_privilege('authenticated',to_regclass('public.deals'),'update') and not has_table_privilege('anon',to_regclass('public.deals'),'update')),
  -- Tools functions exist, signed-in only
  ('Tools functions exist',(select count(*)=9 from (values('mod_list(text)'),('mod_get(text,text)'),('mod_apply(jsonb)'),('mod_act(text,text,text,jsonb)'),('mod_export()'),('mod_import(jsonb,boolean,boolean)'),('mod_files()'),('mod_clear()'),('mod_norm(jsonb,jsonb,text,uuid)')) v(f) where to_regprocedure('public.'||v.f) is not null)),
  ('Tools functions are callable by signed-in users only',
     coalesce(has_function_privilege('authenticated',to_regprocedure('public.mod_apply(jsonb)'),'execute'),false) and coalesce(has_function_privilege('authenticated',to_regprocedure('public.mod_act(text,text,text,jsonb)'),'execute'),false)
     and not coalesce(has_function_privilege('anon',to_regprocedure('public.mod_apply(jsonb)'),'execute'),false) and not coalesce(has_function_privilege('anon',to_regprocedure('public.mod_list(text)'),'execute'),false) and not coalesce(has_function_privilege('anon',to_regprocedure('public.mod_act(text,text,text,jsonb)'),'execute'),false)
     and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.mod_norm(jsonb,jsonb,text,uuid)'),'execute'),false) and not coalesce(has_function_privilege('authenticated',to_regprocedure('public.mod_code()'),'execute'),false)),
  ('purchase request functions exist',(select count(*)=5 from (values('create_product_request(text,text,text,int,numeric,text)'),('buyer_get_request(text,text)'),('buyer_request_act(text,text,text)'),('seller_list_requests()'),('seller_request_act(text,text,jsonb)')) v(f) where to_regprocedure('public.'||v.f) is not null)),
  ('buyers (no account) can send requests but sellers act only when signed in',coalesce(has_function_privilege('anon',to_regprocedure('public.create_product_request(text,text,text,int,numeric,text)'),'execute'),false) and not coalesce(has_function_privilege('anon',to_regprocedure('public.seller_request_act(text,text,jsonb)'),'execute'),false) and not coalesce(has_function_privilege('anon',to_regprocedure('public.seller_list_requests()'),'execute'),false)),
  ('deal functions exist',(select count(*)=3 from (values('seller_act(text,text,jsonb)'),('buyer_act(text,text,jsonb)'),('rider_act(text,text,jsonb)')) v(f) where to_regprocedure('public.'||v.f) is not null)),
  ('account deletion is for signed-in users only',coalesce(has_function_privilege('authenticated',to_regprocedure('public.delete_my_account()'),'execute'),false) and not coalesce(has_function_privilege('anon',to_regprocedure('public.delete_my_account()'),'execute'),false)),
  -- files
  ('storage bucket deal-media exists, with a size limit',exists(select 1 from storage.buckets where id='deal-media' and file_size_limit is not null and file_size_limit<=2097152)),
  ('storage rules for uploads and deletes exist',(select count(*)>=3 from pg_policies where schemaname='storage' and tablename='objects' and policyname in('buyer uploads','seller uploads','seller deletes own files'))),
  -- the receipt secret is private
  ('the receipt secret table is not reachable by the public API',not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname='app_secrets' and (has_table_privilege('anon',c.oid,'select') or has_table_privilege('authenticated',c.oid,'select'))))
)
select name,ok from t union all select 'ALL CHECKS PASSED',bool_and(ok) from t order by 2,1;
