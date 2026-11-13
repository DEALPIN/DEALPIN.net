-- Dealpin Phase Five: online Tools (ledger, invoices, riders, deliveries, settlements, stock, group orders).
-- Apply after schema.sql, storage.sql and phase two to four, on a staging project first.
-- Records belong to one signed-in seller. The table has no direct access at all: the app calls the functions below,
-- and the server (not the phone) normalises every field, counts revisions, refuses stale saves and caps the number of records.
-- Proof photos are files in Storage (s/<seller id>/<random>.jpg); a record only keeps the path.

create table if not exists public.mod_records(
  owner uuid not null references auth.users(id) on delete cascade,
  col text not null check(col in('ledger','invoices','riders','jobs','setl','stock','groups')),
  id text not null check(id ~ '^[a-z0-9]{10}$'),
  rev int not null default 1 check(rev>=1),
  at bigint not null check(at>0),
  up bigint not null check(up>0),
  doc jsonb not null check(jsonb_typeof(doc)='object' and octet_length(doc::text)<=262144),
  primary key(owner,col,id));
create index if not exists mod_records_list on public.mod_records(owner,col,at desc);
alter table public.mod_records enable row level security;
revoke all on public.mod_records from public,anon,authenticated;   -- no policies: only the functions below can touch it

-- ---------------------------------------------------------------- what each record type holds (mirrors js/mods-core.js)
-- k name, t kind: s text(n) n number m money q quantity c currency d date t time e choice(o) b yes/no i photo p map pin a list(of,max)
create or replace function mod_spec(p_col text) returns jsonb language sql immutable as $$
  select case p_col
    when 'ledger' then '[{"k":"who","t":"s","n":60},{"k":"phone","t":"s","n":20},{"k":"dir","t":"e","o":["owed","owe"]},{"k":"amt","t":"m"},{"k":"cur","t":"c"},{"k":"note","t":"s","n":140},{"k":"due","t":"d"},{"k":"pay","t":"a","of":[{"k":"amt","t":"m"},{"k":"at","t":"t"},{"k":"note","t":"s","n":60}],"max":200}]'::jsonb
    when 'invoices' then '[{"k":"no","t":"s","n":20},{"k":"client","t":"s","n":60},{"k":"phone","t":"s","n":20},{"k":"issue","t":"d"},{"k":"due","t":"d"},{"k":"cur","t":"c"},{"k":"tax","t":"n"},{"k":"disc","t":"m"},{"k":"notes","t":"s","n":300},{"k":"code","t":"s","n":16},{"k":"deal","t":"s","n":10},{"k":"items","t":"a","of":[{"k":"d","t":"s","n":100},{"k":"q","t":"q"},{"k":"p","t":"m"}],"max":100},{"k":"pay","t":"a","of":[{"k":"amt","t":"m"},{"k":"at","t":"t"},{"k":"note","t":"s","n":60}],"max":200}]'::jsonb
    when 'riders' then '[{"k":"name","t":"s","n":60},{"k":"phone","t":"s","n":20},{"k":"kind","t":"e","o":["flat","pct"]},{"k":"cur","t":"c"},{"k":"rate","t":"n"}]'::jsonb
    when 'jobs' then '[{"k":"client","t":"s","n":60},{"k":"cphone","t":"s","n":20},{"k":"pickup","t":"s","n":120},{"k":"drop","t":"s","n":120},{"k":"dname","t":"s","n":60},{"k":"dphone","t":"s","n":20},{"k":"fee","t":"m"},{"k":"cod","t":"m"},{"k":"cur","t":"c"},{"k":"rider","t":"s","n":10},{"k":"deal","t":"s","n":10},{"k":"note","t":"s","n":140},{"k":"st","t":"e","o":["new","picked","delivered","failed","cancelled"]},{"k":"code","t":"s","n":4},{"k":"tries","t":"n"},{"k":"why","t":"s","n":140},{"k":"res","t":"s","n":140},{"k":"proof","t":"i"},{"k":"pin","t":"p"},{"k":"settled","t":"b"},{"k":"ev","t":"a","of":[{"k":"s","t":"s","n":60},{"k":"at","t":"t"}],"max":80}]'::jsonb
    when 'setl' then '[{"k":"rider","t":"s","n":10},{"k":"at","t":"t"},{"k":"cur","t":"c"},{"k":"count","t":"n"},{"k":"earn","t":"m"},{"k":"cod","t":"m"},{"k":"net","t":"m"}]'::jsonb
    when 'stock' then '[{"k":"name","t":"s","n":60},{"k":"sku","t":"s","n":30},{"k":"cat","t":"s","n":30},{"k":"qty","t":"q"},{"k":"unit","t":"s","n":12},{"k":"price","t":"m"},{"k":"cur","t":"c"},{"k":"low","t":"q"},{"k":"mv","t":"a","of":[{"k":"d","t":"q"},{"k":"r","t":"s","n":40},{"k":"at","t":"t"}],"max":200}]'::jsonb
    when 'groups' then '[{"k":"title","t":"s","n":80},{"k":"note","t":"s","n":140},{"k":"cur","t":"c"},{"k":"deadline","t":"d"},{"k":"total","t":"m"},{"k":"fee","t":"m"},{"k":"split","t":"e","o":["qty","equal"]},{"k":"st","t":"e","o":["open","ordered","delivered","closed"]},{"k":"mem","t":"a","of":[{"k":"n","t":"s","n":60},{"k":"ph","t":"s","n":20},{"k":"q","t":"q"},{"k":"paid","t":"m"}],"max":200}]'::jsonb
  end $$;

-- Smallest unit of a currency: 0 decimals, 3 decimals, else 2 (ISO 4217).
create or replace function mod_digits(c text) returns int language sql immutable as $$
  select case when c in('BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF') then 0
              when c in('BHD','IQD','JOD','KWD','LYD','OMR','TND') then 3 else 2 end $$;

-- A JSON value as a number: numbers and numeric text pass, everything else is 0. Limited to +-1e12.
create or replace function mod_num(v jsonb) returns numeric language plpgsql immutable as $$
declare x numeric;
begin
  if v is null then return 0; end if;
  if jsonb_typeof(v)='number' then x:=(v#>>'{}')::numeric;
  elsif jsonb_typeof(v)='string' and btrim(v#>>'{}') ~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]{1,3})?$' then x:=btrim(v#>>'{}')::numeric;
  else return 0; end if;
  if abs(x)>1e308 then return 0; end if;   -- the phone treats anything past this as not a number
  return least(1e12,greatest(-1e12,x));
exception when others then return 0; end $$;

-- Normalises one record (or one list entry) the way the app does: unknown fields dropped, every field forced to its type.
create or replace function mod_norm(sp jsonb,o jsonb,cur text,uid uuid) returns jsonb language plpgsql stable as $$
declare r jsonb:='{}'; f jsonb; v jsonb; cc text:=cur; k text; t text; s text; arr jsonb; el jsonb; n int; lat numeric; lng numeric;
begin
  if o is null or jsonb_typeof(o)<>'object' then o:='{}'; end if;
  for f in select value from jsonb_array_elements(sp) where value->>'t'='c' loop
    v:=o->(f->>'k'); s:=case when jsonb_typeof(v)='string' then v#>>'{}' end;
    cc:=case when s ~ '^[A-Z]{3}$' then s else coalesce(cur,'USD') end; r:=r||jsonb_build_object(f->>'k',cc);
  end loop;
  for f in select value from jsonb_array_elements(sp) loop
    k:=f->>'k'; t:=f->>'t'; v:=o->k;
    if t='c' then continue; end if;
    if t='n' or t='q' then r:=r||jsonb_build_object(k,round(mod_num(v),3));
    elsif t='m' then r:=r||jsonb_build_object(k,round(mod_num(v),mod_digits(coalesce(cc,'USD'))));
    elsif t='e' then r:=r||jsonb_build_object(k,case when jsonb_typeof(v)='string' and f->'o' ? (v#>>'{}') then v#>>'{}' else f->'o'->>0 end);
    elsif t='d' then
      s:=case when jsonb_typeof(v)='string' then v#>>'{}' end;
      begin r:=r||jsonb_build_object(k,case when s ~ '^\d{4}-\d{2}-\d{2}$' and to_char(s::date,'YYYY-MM-DD')=s then s else '' end);
      exception when others then r:=r||jsonb_build_object(k,''); end;
    elsif t='t' then
      r:=r||jsonb_build_object(k,floor(least(4e12,greatest(0,mod_num(v)))));
    elsif t='b' then r:=r||jsonb_build_object(k,coalesce(v='true'::jsonb,false));
    elsif t='i' then
      s:=case when jsonb_typeof(v)='string' then v#>>'{}' end;
      r:=r||jsonb_build_object(k,case when uid is not null and s ~ ('^s/'||uid::text||'/[0-9a-f]{32}\.jpg$') then s else '' end);
    elsif t='p' then
      lat:=null;lng:=null;
      if jsonb_typeof(v)='object' then
        if jsonb_typeof(v->'lat') in('number','string') and btrim(v->>'lat')~'^[+-]?[0-9]+(\.[0-9]+)?$' then lat:=(v->>'lat')::numeric; end if;
        if jsonb_typeof(v->'lng') in('number','string') and btrim(v->>'lng')~'^[+-]?[0-9]+(\.[0-9]+)?$' then lng:=(v->>'lng')::numeric; end if;
      end if;
      r:=r||jsonb_build_object(k,case when lat is not null and lng is not null and abs(lat)<=90 and abs(lng)<=180
        then jsonb_build_object('lat',round(lat,6),'lng',round(lng,6)) else null end);
    elsif t='a' then
      arr:='[]'; n:=case when jsonb_typeof(v)='array' then jsonb_array_length(v) else 0 end;
      if n>0 then
        for el in select value from jsonb_array_elements(v) with ordinality as e(value,i) where i>n-(f->>'max')::int order by i loop
          arr:=arr||jsonb_build_array(mod_norm(f->'of',el,cc,uid));
        end loop;
      end if;
      r:=r||jsonb_build_object(k,arr);
    else
      r:=r||jsonb_build_object(k,left(btrim(regexp_replace(case when jsonb_typeof(v) in('string','number') then v#>>'{}' else '' end,'[\x01-\x08\x0b\x0c\x0e-\x1f]','','g')),(f->>'n')::int));
    end if;
  end loop;
  return r;
end $$;

-- Rules the screens also follow, enforced by the server so a modified app cannot break them (in smallest currency units, so no drift).
-- Applied to every save. A restore (mod_import) only normalises: an old backup is never refused for what it already holds.
create or replace function mod_check(p_col text,d jsonb) returns void language plpgsql immutable as $$
declare k int:=mod_digits(d->>'cur'); paid bigint:=0; sub bigint:=0; dc bigint; tx bigint; tot bigint; x jsonb;
begin
  if p_col='stock' and (d->>'qty')::numeric<0 then raise exception 'Stock cannot go below 0.'; end if;
  if p_col in('ledger','invoices') then
    for x in select value from jsonb_array_elements(d->'pay') loop
      if (x->>'amt')::numeric<0 then raise exception 'A payment cannot be negative.'; end if;
      paid:=paid+round((x->>'amt')::numeric*power(10,k))::bigint;
    end loop;
    if p_col='ledger' then tot:=round((d->>'amt')::numeric*power(10,k))::bigint;
    else
      for x in select value from jsonb_array_elements(d->'items') loop
        sub:=sub+round(round((x->>'p')::numeric*power(10,k))*(x->>'q')::numeric)::bigint;
      end loop;
      dc:=least(sub,greatest(0,round((d->>'disc')::numeric*power(10,k))::bigint));
      tx:=round((sub-dc)*greatest(0,(d->>'tax')::numeric)/100)::bigint;tot:=sub-dc+tx;
    end if;
    if paid>tot then raise exception 'Payments cannot add up to more than the total.'; end if;
  end if;
end $$;

create or replace function mod_checked(p_col text,d jsonb) returns jsonb language plpgsql immutable as $$
begin perform mod_check(p_col,d); return d; end $$;

-- A plain save cannot change a delivery's status, code or wrong-code count (see mod_act below).
create or replace function mod_keep(p_col text,d jsonb,old jsonb) returns jsonb language sql immutable as $$
  select case when p_col='jobs' then d||jsonb_build_object('st',coalesce(old->>'st','new'),'code',coalesce(old->>'code',''),'tries',coalesce((old->>'tries')::int,0)) else d end $$;

create or replace function mod_new_id(p_owner uuid,p_col text) returns text language plpgsql volatile as $$
declare i text;
begin
  loop
    i:=substr(replace(gen_random_uuid()::text,'-',''),1,10);
    exit when not exists(select 1 from public.mod_records where owner=p_owner and col=p_col and id=i);
  end loop;
  return i;
end $$;

create or replace function mod_view(r public.mod_records) returns jsonb language sql immutable as $$
  select r.doc||jsonb_build_object('id',r.id,'at',r.at,'up',r.up,'rev',r.rev) $$;

create or replace function mod_user() returns uuid language plpgsql stable as $$
declare u uuid:=auth.uid();
begin if u is null then raise exception 'Please sign in.'; end if; return u; end $$;

-- Signed-in people are limited per account (not per network address, which a whole office or mobile network can share).
create or replace function mod_guard(p_owner uuid,p_scope text,p_max int) returns void language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('mods:'||p_owner::text,0));
  if bump(p_scope||':'||p_owner::text,60)>p_max then raise exception 'Too many requests. Wait a minute and try again.'; end if;
end $$;

create or replace function mod_list(p_col text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user();
begin
  if mod_spec(p_col) is null then raise exception 'Unknown record type.'; end if;
  perform mod_guard(u,'mods',1200);
  return coalesce((select jsonb_agg(mod_view(r) order by r.at desc,r.id) from public.mod_records r where r.owner=u and r.col=p_col),'[]');
end $$;

create or replace function mod_get(p_col text,p_id text) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); r public.mod_records;
begin
  if mod_spec(p_col) is null then raise exception 'Unknown record type.'; end if;
  perform mod_guard(u,'mods',1200);
  select * into r from public.mod_records where owner=u and col=p_col and id=p_id;
  return case when found then mod_view(r) end;
end $$;

-- Several writes that succeed or fail together: [{op:'save',col,obj}|{op:'del',col,id}].
-- Returns {items:[record|null...], gone:[proof file paths that no record uses any more]}.
create or replace function mod_apply(p_ops jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); op jsonb; pc text; o jsonb; r public.mod_records; old public.mod_records; items jsonb:='[]'; gone jsonb:='[]'; now_ms bigint;
begin
  if p_ops is null or jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops)>200 then raise exception 'Too much to save at once.'; end if;
  perform mod_guard(u,'mods',1200);
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  for op in select value from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(op)<>'object' then raise exception 'Unknown record type.'; end if;
    pc:=op->>'col'; if pc is null or mod_spec(pc) is null then raise exception 'Unknown record type.'; end if;
    if op->>'op'='del' then
      delete from public.mod_records where owner=u and mod_records.col=pc and id=op->>'id' returning * into old;
      if old.id is not null and coalesce(old.doc->>'proof','')<>'' then gone:=gone||to_jsonb(old.doc->>'proof'); end if;
      items:=items||jsonb_build_array(null);
    elsif op->>'op'='save' then
      o:=case when jsonb_typeof(op->'obj')='object' then op->'obj' else '{}' end;
      select * into old from public.mod_records where owner=u and mod_records.col=pc and id=o->>'id' for update;
      if found then
        if jsonb_typeof(o->'rev')='number' and (o->>'rev')::numeric<>old.rev then raise exception 'This record was changed in another tab or device. Reload it and try again.'; end if;
        update public.mod_records set doc=mod_keep(pc,mod_checked(pc,mod_norm(mod_spec(pc),o,null,u)),old.doc),rev=old.rev+1,up=greatest(now_ms,old.at) where owner=u and mod_records.col=pc and id=old.id returning * into r;
        if coalesce(old.doc->>'proof','')<>'' and old.doc->>'proof'<>coalesce(r.doc->>'proof','') then gone:=gone||to_jsonb(old.doc->>'proof'); end if;
      else
        if (select count(*) from public.mod_records where owner=u and mod_records.col=pc)>=5000 then raise exception 'You have reached the limit of 5000 records here. Download your data and delete old ones.'; end if;
        insert into public.mod_records(owner,col,id,rev,at,up,doc) values(u,pc,mod_new_id(u,pc),1,now_ms,now_ms,mod_keep(pc,mod_checked(pc,mod_norm(mod_spec(pc),o,null,u)),null)) returning * into r;
      end if;
      items:=items||jsonb_build_array(mod_view(r));
    else raise exception 'Unknown record type.'; end if;
  end loop;
  return jsonb_build_object('items',items,'gone',gone);
end $$;

create or replace function mod_export() returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); out jsonb:=jsonb_build_object('v',1); c text;
begin
  perform mod_guard(u,'modsbulk',60);
  foreach c in array array['ledger','invoices','riders','jobs','setl','stock','groups'] loop
    out:=out||jsonb_build_object(c,coalesce((select jsonb_agg(mod_view(r) order by r.at desc,r.id) from public.mod_records r where r.owner=u and r.col=c),'[]'));
  end loop;
  return out;
end $$;

-- p_merge=false replaces everything; p_merge=true only adds records whose id is not there yet (used to move a device's records online).
-- p_dry=true checks the file and changes nothing. Returns how many records were (or would be) kept.
create or replace function mod_import(p_data jsonb,p_dry boolean default false,p_merge boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); c text; v jsonb; x jsonb; ts jsonb:='{}'; cnt int; added int; total int:=0; rid text; at_ bigint; up_ bigint; rv int; now_ms bigint;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'That file is not a Dealpin backup.'; end if;
  perform mod_guard(u,'modsbulk',60);
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  foreach c in array array['ledger','invoices','riders','jobs','setl','stock','groups'] loop
    v:=p_data->c; if v is null or jsonb_typeof(v)='null' then continue; end if;
    if jsonb_typeof(v)<>'array' then raise exception 'That file is not a Dealpin backup.'; end if;
  end loop;
  if not p_dry and not p_merge then delete from public.mod_records where owner=u; end if;
  foreach c in array array['ledger','invoices','riders','jobs','setl','stock','groups'] loop
    v:=p_data->c; if v is null or jsonb_typeof(v)<>'array' then continue; end if;
    select count(*) into cnt from public.mod_records where owner=u and col=c;
    if p_dry then cnt:=0; end if;
    added:=0;
    for x in select value from jsonb_array_elements(v) with ordinality as e(value,i) where i<=5000 order by i loop
      if jsonb_typeof(x)<>'object' then x:='{}'; end if;
      if cnt+added>=5000 then exit; end if;
      rid:=case when x->>'id' ~ '^[a-z0-9]{10}$' then x->>'id' end;
      if rid is not null and p_merge and exists(select 1 from public.mod_records where owner=u and col=c and mod_records.id=rid) then continue; end if;
      if p_dry then added:=added+1; perform mod_norm(mod_spec(c),x,null,u); continue; end if;
      if rid is null or exists(select 1 from public.mod_records where owner=u and col=c and mod_records.id=rid) then rid:=mod_new_id(u,c); end if;
      at_:=case when jsonb_typeof(x->'at')='number' and (x->>'at')::numeric>0 and (x->>'at')::numeric<4e12 then floor((x->>'at')::numeric)::bigint else now_ms end;
      up_:=case when jsonb_typeof(x->'up')='number' and (x->>'up')::numeric>0 and (x->>'up')::numeric<4e12 then floor((x->>'up')::numeric)::bigint else now_ms end;
      rv:=case when jsonb_typeof(x->'rev')='number' and (x->>'rev')::numeric between 1 and 1000000 then floor((x->>'rev')::numeric)::int else 1 end;
      insert into public.mod_records(owner,col,id,rev,at,up,doc) values(u,c,rid,rv,at_,up_,mod_norm(mod_spec(c),x,null,u));
      added:=added+1;
    end loop;
    total:=total+added;
  end loop;
  return jsonb_build_object('count',total);
end $$;

-- Every proof file this seller has, so the app can delete them before the account is deleted.
create or replace function mod_files() returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user();
begin
  perform mod_guard(u,'modsbulk',60);
  return coalesce((select jsonb_agg(distinct doc->>'proof') from public.mod_records where owner=u and col='jobs' and coalesce(doc->>'proof','')<>''),'[]');
end $$;

create or replace function mod_clear() returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); f jsonb;
begin
  perform mod_guard(u,'modsbulk',60);
  f:=mod_files();
  delete from public.mod_records where owner=u;
  return f;
end $$;

revoke all on function mod_spec(text),mod_digits(text),mod_num(jsonb),mod_norm(jsonb,jsonb,text,uuid),mod_new_id(uuid,text),mod_check(text,jsonb),mod_checked(text,jsonb),mod_keep(text,jsonb,jsonb),mod_view(public.mod_records),mod_user(),
  mod_guard(uuid,text,int),mod_list(text),mod_get(text,text),mod_apply(jsonb),mod_export(),mod_import(jsonb,boolean,boolean),mod_files(),mod_clear() from public,anon,authenticated;
grant execute on function mod_list(text),mod_get(text,text),mod_apply(jsonb),mod_export(),mod_import(jsonb,boolean,boolean),mod_files(),mod_clear() to authenticated;

-- ---------------------------------------------------------------- deliveries: status, handover code and wrong-code count
-- These three fields can only change through mod_act (a plain save keeps them as they are), so a modified app cannot mark a delivery
-- as delivered, read ahead, or reset the wrong-code count. The code is made here; a wrong code is counted here (5 tries).
create or replace function mod_code() returns text language sql volatile as $$
  select lpad((('x'||substr(replace(gen_random_uuid()::text,'-',''),1,8))::bit(32)::bigint % 10000)::text,4,'0') $$;

create or replace function mod_act(p_col text,p_id text,p_action text,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=mod_user(); r public.mod_records; d jsonb; ev text; ok boolean:=true; w text; now_ms bigint:=floor(extract(epoch from clock_timestamp())*1000); st text; tries int;
begin
  if p_col<>'jobs' then raise exception 'That action is not available.'; end if;
  perform mod_guard(u,'mods',1200);
  select * into r from public.mod_records where owner=u and col='jobs' and id=p_id for update;
  if not found then raise exception 'That record was not found.'; end if;
  d:=r.doc; st:=d->>'st'; tries:=coalesce((d->>'tries')::int,0);
  w:=left(btrim(regexp_replace(case when jsonb_typeof(p_payload->'why') in('string','number') then p_payload->>'why' else '' end,'[\x01-\x08\x0b\x0c\x0e-\x1f]','','g')),140);
  if p_action='pickup' then
    if st<>'new' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    d:=d||jsonb_build_object('st','picked','code',mod_code(),'tries',0); ev:='Picked up';
  elsif p_action='cancel' then
    if st not in('new','picked') then raise exception 'That is not possible at this stage of the delivery.'; end if;
    if w='' then raise exception 'Say why first.'; end if;
    d:=d||jsonb_build_object('st','cancelled','why',w); ev:='Cancelled';
  elsif p_action='confirm' then
    if st<>'picked' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    if tries>=5 then raise exception 'Too many wrong codes. Reset the code, or use the other options.'; end if;
    if jsonb_typeof(p_payload->'code') in('string','number') and p_payload->>'code'=d->>'code' then d:=d||jsonb_build_object('st','delivered'); ev:='Delivered';
    else d:=d||jsonb_build_object('tries',tries+1); ev:='Wrong code entered'; ok:=false; end if;
  elsif p_action='reset' then
    if st<>'picked' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    d:=d||jsonb_build_object('code',mod_code(),'tries',0); ev:='Code reset';
  elsif p_action='viewed' then
    if st<>'picked' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    ev:='Code viewed';
  elsif p_action='fail' then
    if st<>'picked' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    if w='' then raise exception 'Say why first.'; end if;
    d:=d||jsonb_build_object('st','failed','why',w); ev:='Failed';
  elsif p_action='nocode' then
    if st<>'picked' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    if w='' then raise exception 'Say why first.'; end if;
    d:=d||jsonb_build_object('st','delivered','why',left('No code: '||w,140)); ev:='Delivered without code';
  elsif p_action='retry' then
    if st<>'failed' then raise exception 'That is not possible at this stage of the delivery.'; end if;
    d:=d||jsonb_build_object('st','new','code','','tries',0,'why','','res',''); ev:='New attempt';
  else raise exception 'That action is not available.'; end if;
  d:=jsonb_set(d,'{ev}',coalesce((select jsonb_agg(value order by i) from (select value,i from jsonb_array_elements(coalesce(d->'ev','[]')||jsonb_build_array(jsonb_build_object('s',ev,'at',now_ms))) with ordinality as e(value,i) order by i desc limit 80) z),'[]'));
  update public.mod_records set doc=d,rev=rev+1,up=greatest(now_ms,at) where owner=u and col='jobs' and id=p_id returning * into r;
  return jsonb_build_object('item',mod_view(r),'ok',ok);
end $$;
revoke all on function mod_code(),mod_act(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function mod_act(text,text,text,jsonb) to authenticated;
