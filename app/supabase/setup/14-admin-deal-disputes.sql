-- Dealpin setup step 14: admins resolve or cancel a disputed deal. Safe to run again. Run after step 13.
-- Only disputed deals can be changed, and only to resolved or cancelled. Every other field stays locked.
-- Dealpin does not move money, so cancelling never refunds anything. Each change is logged with the reason.

create or replace function public.admin_resolve_deal(p_id text,p_status text,p_reason text) returns jsonb
  language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid; d public.deals%rowtype; t text:=trim(coalesce(p_reason,'')); dd jsonb;
begin
  me:=public.admin_require();
  if p_status not in ('resolved','cancelled') then raise exception 'Choose resolved or cancelled.' using errcode='P0001'; end if;
  if char_length(t)<3 then raise exception 'Give a reason (at least 3 characters).' using errcode='P0001'; end if;
  select * into d from public.deals where id=p_id for update;
  if not found then raise exception 'Deal not found.' using errcode='P0001'; end if;
  if d.status<>'disputed' then raise exception 'Only a disputed deal can be resolved here. This deal is %.', d.status using errcode='P0001'; end if;
  dd:=commit_deal(d, d.doc, p_status, p_status);
  perform public.admin_log('moderate','deal',p_id,'Disputed deal '||p_status||' by admin',t,jsonb_build_object('from',d.status));
  return jsonb_build_object('id',p_id,'status',p_status);
end $$;

revoke all on function public.admin_resolve_deal(text,text,text) from public, anon;
grant execute on function public.admin_resolve_deal(text,text,text) to authenticated;
