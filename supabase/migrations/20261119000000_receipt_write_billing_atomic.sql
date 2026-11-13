create or replace function public.draft_authorize_billing(p_org uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  required text := nullif(current_setting('request.billing_write_required', true), '');
  sub_status text;
begin
  if required is null then
    raise exception using errcode='P0001', message='Billing write context is missing.';
  end if;
  if required = '0' then return; end if;
  if required <> '1' then
    raise exception using errcode='P0001', message='Invalid billing write context.';
  end if;
  perform 1 from public.organizations where id = p_org for share;
  if not found then raise exception using errcode='P0001', message='Workspace unavailable.'; end if;
  select status into sub_status from public.billing_subscriptions where organization_id = p_org for update;
  sub_status := coalesce(sub_status, 'trial_required');
  if sub_status not in ('comped','trialing','active') then
    raise exception using errcode='P0001', message='Workspace billing is not active for writes.';
  end if;
end;
$$;

create or replace function public.draft_authorize_allocation(p_org uuid, p_actor uuid, p_record text)
returns void
language plpgsql
security definer
set search_path='public','pg_temp'
as $$
begin
  perform public.draft_authorize_billing(p_org);
  if p_org is null or p_actor is null or p_record is null then raise exception 'Unauthorized'; end if;
  perform 1 from public.memberships where organization_id=p_org and user_id=p_actor for share;
  if not found then raise exception 'Unauthorized'; end if;
  perform 1 from public.organizations where id=p_org for share;
  if not found then raise exception 'Unauthorized'; end if;
  perform set_config('request.jwt.claim.sub',p_actor::text,true);
  if not public.app_can_write(p_org,'payments') or not public.app_can_write(p_org,'arInvoices')
     or not public.app_has_capability(p_org,'records.update')
     or not public.app_visible_record_id(p_org,p_record) then raise exception 'Unauthorized'; end if;
end $$;

create or replace function public.draft_create_receipt_v2(p_org uuid, p_request uuid, p_actor uuid, p_receipt jsonb, p_lines jsonb, p_billing_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform set_config('request.billing_write_required', case when coalesce(p_billing_enabled, false) then '1' else '0' end, true);
  return public.draft_create_receipt(p_org, p_request, p_actor, p_receipt, p_lines);
end $$;

create or replace function public.draft_allocate_receipt_v2(p_org uuid, p_receipt text, p_request uuid, p_actor uuid, p_lines jsonb, p_billing_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform set_config('request.billing_write_required', case when coalesce(p_billing_enabled, false) then '1' else '0' end, true);
  return public.draft_allocate_receipt(p_org, p_receipt, p_request, p_actor, p_lines);
end $$;

create or replace function public.draft_reverse_receipt_v2(p_org uuid, p_receipt text, p_request uuid, p_actor uuid, p_billing_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  perform set_config('request.billing_write_required', case when coalesce(p_billing_enabled, false) then '1' else '0' end, true);
  return public.draft_reverse_receipt(p_org, p_receipt, p_request, p_actor);
end $$;

revoke all on function public.draft_authorize_billing(uuid) from public, anon, authenticated, service_role;
revoke all on function public.draft_authorize_allocation(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.draft_create_receipt(uuid,uuid,uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.draft_allocate_receipt(uuid,text,uuid,uuid,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.draft_reverse_receipt(uuid,text,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.draft_create_receipt_v2(uuid,uuid,uuid,jsonb,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.draft_allocate_receipt_v2(uuid,text,uuid,uuid,jsonb,boolean) from public, anon, authenticated;
revoke all on function public.draft_reverse_receipt_v2(uuid,text,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.draft_create_receipt_v2(uuid,uuid,uuid,jsonb,jsonb,boolean) to service_role;
grant execute on function public.draft_allocate_receipt_v2(uuid,text,uuid,uuid,jsonb,boolean) to service_role;
grant execute on function public.draft_reverse_receipt_v2(uuid,text,uuid,uuid,boolean) to service_role;
