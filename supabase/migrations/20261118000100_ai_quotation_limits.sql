-- Server-only, atomic per-workspace daily budget. No prompts or generated content stored.
create table if not exists public.ai_quotation_usage (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_day date not null,
  requests integer not null default 0,
  primary key (organization_id, usage_day)
);
alter table public.ai_quotation_usage enable row level security;
revoke all on public.ai_quotation_usage from anon, authenticated;

create or replace function public.reserve_ai_quotation(p_org uuid, p_user uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not exists (select 1 from public.memberships where organization_id=p_org and user_id=p_user) then
    return false;
  end if;
  insert into public.ai_quotation_usage as usage (organization_id, usage_day, requests)
  values (p_org, (now() at time zone 'UTC')::date, 1)
  on conflict (organization_id, usage_day) do update set requests = usage.requests + 1
  where usage.requests < 20
  returning requests into n;
  return n is not null;
end;
$$;
revoke all on function public.reserve_ai_quotation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_ai_quotation(uuid, uuid) to service_role;
