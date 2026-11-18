-- Dealpin setup step 15: push notifications for sellers. Safe to run again. Run after step 14.
-- A deal changing status queues a message for its seller. The send-push function delivers queued messages.
-- Clients never read these tables directly; they use the two functions below.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  body text not null,
  url text not null default '',
  created_at timestamptz not null default now(),
  sent boolean not null default false
);
alter table public.push_subscriptions enable row level security;
alter table public.push_outbox enable row level security;
revoke all on public.push_subscriptions, public.push_outbox from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text) returns void
  language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid();
begin
  if u is null then raise exception 'Please sign in.' using errcode='P0001'; end if;
  if p_endpoint is null or char_length(p_endpoint)>2000 or p_p256dh is null or p_auth is null then
    raise exception 'Notification details are not valid.' using errcode='P0001';
  end if;
  insert into public.push_subscriptions(endpoint,user_id,p256dh,auth) values(p_endpoint,u,p_p256dh,p_auth)
    on conflict (endpoint) do update set user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth;
end $$;

create or replace function public.delete_push_subscription(p_endpoint text) returns void
  language plpgsql security definer set search_path=public,pg_temp as $$
begin
  delete from public.push_subscriptions where endpoint=p_endpoint and user_id=auth.uid();
end $$;

create or replace function public.queue_deal_push() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t text; b text; ttl text:=coalesce(new.doc->>'title','Your deal');
begin
  if new.status is not distinct from old.status then return new; end if;
  case new.status
    when 'agreed' then t:='Buyer agreed'; b:=ttl||' is agreed.';
    when 'shipped' then t:='Marked as shipped'; b:=ttl||' has been shipped.';
    when 'received' then t:='Buyer confirmed receipt'; b:=ttl||' is verified.';
    when 'disputed' then t:='Buyer raised a dispute'; b:='Open '||ttl||' to reply.';
    when 'cancelled' then t:='Deal cancelled'; b:=ttl||' was cancelled.';
    else return new;
  end case;
  insert into public.push_outbox(user_id,title,body,url) values(new.owner,'Dealpin: '||t,b,'./#/deal/'||new.id);
  return new;
end $$;

drop trigger if exists queue_deal_push on public.deals;
create trigger queue_deal_push after update of status on public.deals for each row execute function public.queue_deal_push();

revoke all on function public.save_push_subscription(text,text,text), public.delete_push_subscription(text), public.queue_deal_push() from public, anon;
grant execute on function public.save_push_subscription(text,text,text), public.delete_push_subscription(text) to authenticated;
