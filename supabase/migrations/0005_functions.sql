-- Server-side RPCs. These are SECURITY DEFINER so the client can never write
-- directly to the wallet ledger, audit log, notifications or number sequences;
-- every function re-checks the caller's org membership, module and capability.

create or replace function public.app_next_number(p_org uuid, p_resource text, p_prefix text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_next integer;
begin
  if not (p_org = any(public.app_org_ids())) then raise exception 'Unauthorized'; end if;
  insert into public.sequences as s (organization_id, resource, next)
  values (p_org, p_resource, 2)
  on conflict (organization_id, resource) do update set next = s.next + 1
  returning s.next - 1 into v_next;
  return p_prefix || '-' || lpad(v_next::text, 4, '0');
end;
$$;

create or replace function public.app_log_activity(
  p_org uuid, p_actor text, p_action text, p_resource text, p_detail text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (p_org = any(public.app_org_ids())) then return; end if;
  insert into public.audit_logs (organization_id, user_id, actor, action, resource, detail)
  values (p_org, auth.uid(), coalesce(p_actor, public.app_actor_name()), p_action, p_resource, coalesce(p_detail, ''));
end;
$$;

create or replace function public.app_notify(
  p_org uuid, p_title text, p_body text, p_kind text, p_href text
)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (p_org = any(public.app_org_ids())) then return; end if;
  insert into public.notifications (organization_id, user_id, title, body, kind, href, read)
  values (p_org, null, p_title, coalesce(p_body, ''), coalesce(p_kind, 'INFO'), p_href, false);
end;
$$;

create or replace function public.app_mirror_client_balance(p_org uuid, p_client_id text, p_balance_cents bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_balance numeric := round(p_balance_cents::numeric / 100, 2);
begin
  -- auth.uid() is null only for the service role (seed/bootstrap); otherwise
  -- the caller must belong to the org whose derived figure is being written.
  if auth.uid() is not null and not (p_org = any(public.app_org_ids())) then return; end if;
  update public.records
     set data = jsonb_set(coalesce(data, '{}'::jsonb), '{walletBalance}', to_jsonb(v_balance), true),
         updated_at = now()
   where organization_id = p_org and id = p_client_id and resource = 'clients' and deleted_at is null;
end;
$$;

create or replace function public.app_mirror_project(p_org uuid, p_project_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_funded numeric;
  v_target numeric;
  v_remaining numeric;
  v_data jsonb;
begin
  if p_project_id is null then return; end if;
  if auth.uid() is not null and not (p_org = any(public.app_org_ids())) then return; end if;
  select coalesce(sum(-amount_cents), 0)::numeric / 100 into v_funded
    from public.wallet_transactions
   where organization_id = p_org and project_id = p_project_id
     and kind = 'ALLOCATION' and reversed_at is null;

  select coalesce(data, '{}'::jsonb) into v_data
    from public.records
   where organization_id = p_org and id = p_project_id and resource = 'projects' and deleted_at is null;
  if v_data is null then return; end if;

  v_target := coalesce(nullif(v_data->>'contractValue', '')::numeric, nullif(v_data->>'budget', '')::numeric, 0);
  v_remaining := greatest(0, v_target - v_funded);
  v_data := jsonb_set(v_data, '{fundedAmount}', to_jsonb(round(v_funded, 2)), true);
  v_data := jsonb_set(v_data, '{remainingToFund}', to_jsonb(round(v_remaining, 2)), true);

  update public.records set data = v_data, updated_at = now()
   where organization_id = p_org and id = p_project_id and resource = 'projects' and deleted_at is null;
end;
$$;

create or replace function public.app_tx_view(p_tx_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', t.id,
    'kind', t.kind,
    'amount', round(t.amount_cents::numeric / 100, 2),
    'balanceAfter', round(t.balance_cents::numeric / 100, 2),
    'currency', t.currency,
    'projectId', t.project_id,
    'reference', t.reference,
    'method', t.method,
    'note', t.note,
    'actorName', t.actor_name,
    'reversesId', t.reverses_id,
    'reversedAt', to_jsonb(t.reversed_at),
    'createdAt', to_jsonb(t.created_at)
  )
  from public.wallet_transactions t
  where t.id = p_tx_id
    and (auth.uid() is null or t.organization_id = any(public.app_org_ids()));
$$;

create or replace function public.app_wallet_topup(
  p_org uuid,
  p_client_id text,
  p_amount numeric,
  p_reference text default null,
  p_method text default null,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cents bigint;
  v_key text;
  v_wallet public.wallets%rowtype;
  v_tx public.wallet_transactions%rowtype;
  v_balance bigint;
  v_currency text;
begin
  if not public.app_module_enabled(p_org, 'wallets') then raise exception 'Client wallets module is not enabled'; end if;
  if not public.app_can_read(p_org, 'clients') then raise exception 'Your role cannot view clients'; end if;
  if not public.app_has_capability(p_org, 'wallet.topup') then raise exception 'Your role is not permitted to add funds'; end if;
  if not public.app_wallet_client_allowed(p_org, p_client_id) then raise exception 'You can only use your own wallet'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  v_cents := round(p_amount * 100)::bigint;
  if v_cents <= 0 or v_cents > 100000000000 then raise exception 'Amount is outside the allowed range'; end if;
  if not exists (
    select 1 from public.records
     where organization_id = p_org and id = p_client_id and resource = 'clients' and deleted_at is null
  ) then raise exception 'Client not found'; end if;
  if not public.app_visible_record(p_org, 'clients', p_client_id, null, '{}'::jsonb)
    then raise exception 'You can only use your own wallet'; end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_client_id)::bigint);
  if v_key is not null and exists (
    select 1 from public.wallet_transactions where organization_id = p_org and idempotency_key = v_key
  ) then raise exception 'Duplicate request — these funds were already added'; end if;

  v_currency := public.app_org_currency(p_org);
  insert into public.wallets (organization_id, client_id, currency, balance_cents)
  values (p_org, p_client_id, v_currency, 0)
  on conflict (organization_id, client_id) do update set client_id = excluded.client_id
  returning * into v_wallet;

  v_balance := v_wallet.balance_cents + v_cents;
  insert into public.wallet_transactions (
    organization_id, wallet_id, client_id, project_id, kind, amount_cents, balance_cents,
    currency, reference, method, note, actor_id, actor_name, idempotency_key
  ) values (
    p_org, v_wallet.id, p_client_id, null, 'TOPUP', v_cents, v_balance,
    coalesce(v_wallet.currency, v_currency), nullif(trim(coalesce(p_reference, '')), ''),
    nullif(trim(coalesce(p_method, '')), ''), nullif(trim(coalesce(p_note, '')), ''),
    auth.uid(), public.app_actor_name(), v_key
  ) returning * into v_tx;

  update public.wallets set balance_cents = v_balance, updated_at = now() where id = v_wallet.id;
  perform public.app_mirror_client_balance(p_org, p_client_id, v_balance);
  perform public.app_log_activity(
    p_org, public.app_actor_name(), 'WALLET_TOPUP', 'clients',
    format('Added %s %s to the wallet of %s (balance %s)',
      to_char(round(v_cents::numeric / 100, 2), 'FM999,999,999,990.00'),
      coalesce(v_wallet.currency, v_currency), right(p_client_id, 8),
      to_char(round(v_balance::numeric / 100, 2), 'FM999,999,999,990.00'))
  );
  return jsonb_build_object('transaction', public.app_tx_view(v_tx.id), 'balance', round(v_balance::numeric / 100, 2));
end;
$$;

create or replace function public.app_wallet_allocate(
  p_org uuid,
  p_client_id text,
  p_project_id text,
  p_amount numeric,
  p_note text default null,
  p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cents bigint;
  v_key text;
  v_wallet public.wallets%rowtype;
  v_tx public.wallet_transactions%rowtype;
  v_balance bigint;
  v_currency text;
  v_pdata jsonb;
  v_ptitle text;
begin
  if not public.app_module_enabled(p_org, 'wallets') then raise exception 'Client wallets module is not enabled'; end if;
  if not public.app_can_read(p_org, 'clients') or not public.app_can_read(p_org, 'projects')
    then raise exception 'Your role cannot view this module'; end if;
  if not public.app_has_capability(p_org, 'wallet.allocate') then raise exception 'Your role is not permitted to fund projects'; end if;
  if not public.app_wallet_client_allowed(p_org, p_client_id) then raise exception 'You can only use your own wallet'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero'; end if;
  v_cents := round(p_amount * 100)::bigint;
  if v_cents <= 0 or v_cents > 100000000000 then raise exception 'Amount is outside the allowed range'; end if;
  if not exists (
    select 1 from public.records
     where organization_id = p_org and id = p_client_id and resource = 'clients' and deleted_at is null
  ) then raise exception 'Client not found'; end if;
  if not public.app_visible_record(p_org, 'clients', p_client_id, null, '{}'::jsonb)
    then raise exception 'You can only use your own wallet'; end if;

  select data, title into v_pdata, v_ptitle
    from public.records
   where organization_id = p_org and id = p_project_id and resource = 'projects' and deleted_at is null;
  if v_pdata is null then raise exception 'Project not found'; end if;
  if coalesce(v_pdata->>'clientId', '') <> p_client_id
    then raise exception 'That project belongs to a different client — funds cannot be moved between clients'; end if;
  if not public.app_visible_record(p_org, 'projects', p_project_id, null, v_pdata)
    then raise exception 'You can only fund your own projects'; end if;

  v_key := nullif(trim(coalesce(p_idempotency_key, '')), '');
  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_client_id)::bigint);
  if v_key is not null and exists (
    select 1 from public.wallet_transactions where organization_id = p_org and idempotency_key = v_key
  ) then raise exception 'Duplicate request — this funding was already applied'; end if;

  v_currency := public.app_org_currency(p_org);
  insert into public.wallets (organization_id, client_id, currency, balance_cents)
  values (p_org, p_client_id, v_currency, 0)
  on conflict (organization_id, client_id) do update set client_id = excluded.client_id
  returning * into v_wallet;

  if v_wallet.balance_cents < v_cents then
    raise exception 'Insufficient wallet balance. Available: % %',
      to_char(round(v_wallet.balance_cents::numeric / 100, 2), 'FM999,999,999,990.00'),
      coalesce(v_wallet.currency, v_currency);
  end if;
  v_balance := v_wallet.balance_cents - v_cents;

  insert into public.wallet_transactions (
    organization_id, wallet_id, client_id, project_id, kind, amount_cents, balance_cents,
    currency, reference, method, note, actor_id, actor_name, idempotency_key
  ) values (
    p_org, v_wallet.id, p_client_id, p_project_id, 'ALLOCATION', -v_cents, v_balance,
    coalesce(v_wallet.currency, v_currency), null, null,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Funding for ' || coalesce(v_pdata->>'name', v_ptitle, p_project_id)),
    auth.uid(), public.app_actor_name(), v_key
  ) returning * into v_tx;

  update public.wallets set balance_cents = v_balance, updated_at = now() where id = v_wallet.id;
  perform public.app_mirror_client_balance(p_org, p_client_id, v_balance);
  perform public.app_mirror_project(p_org, p_project_id);
  perform public.app_log_activity(
    p_org, public.app_actor_name(), 'WALLET_ALLOCATION', 'projects',
    format('Funded %s with %s %s from the client wallet (balance %s)',
      coalesce(v_pdata->>'name', v_ptitle, p_project_id),
      to_char(round(v_cents::numeric / 100, 2), 'FM999,999,999,990.00'),
      coalesce(v_wallet.currency, v_currency),
      to_char(round(v_balance::numeric / 100, 2), 'FM999,999,999,990.00'))
  );
  perform public.app_notify(
    p_org, 'Project funded from client wallet',
    format('%s %s allocated to %s.',
      to_char(round(v_cents::numeric / 100, 2), 'FM999,999,999,990.00'),
      coalesce(v_wallet.currency, v_currency),
      coalesce(v_pdata->>'name', v_ptitle, p_project_id)),
    'SUCCESS', '/projects/' || p_project_id
  );
  return jsonb_build_object('transaction', public.app_tx_view(v_tx.id), 'balance', round(v_balance::numeric / 100, 2));
end;
$$;

create or replace function public.app_wallet_reverse(
  p_org uuid,
  p_client_id text,
  p_transaction_id uuid,
  p_note text default null
)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_wallet public.wallets%rowtype;
  v_orig public.wallet_transactions%rowtype;
  v_tx public.wallet_transactions%rowtype;
  v_reverse_cents bigint;
  v_balance bigint;
begin
  if not public.app_module_enabled(p_org, 'wallets') then raise exception 'Client wallets module is not enabled'; end if;
  if not public.app_has_capability(p_org, 'wallet.refund') then raise exception 'Your role is not permitted to reverse wallet entries'; end if;
  if not public.app_wallet_client_allowed(p_org, p_client_id) then raise exception 'You can only use your own wallet'; end if;

  perform pg_advisory_xact_lock(hashtext(p_org::text || ':' || p_client_id)::bigint);
  select * into v_wallet from public.wallets where organization_id = p_org and client_id = p_client_id;
  if not found then raise exception 'Wallet not found'; end if;
  select * into v_orig from public.wallet_transactions
   where id = p_transaction_id and wallet_id = v_wallet.id and organization_id = p_org;
  if not found then raise exception 'Ledger entry not found'; end if;
  if v_orig.kind = 'REVERSAL' then raise exception 'A reversal cannot itself be reversed'; end if;
  if v_orig.reversed_at is not null then raise exception 'This entry has already been reversed'; end if;

  v_reverse_cents := -v_orig.amount_cents;
  v_balance := v_wallet.balance_cents + v_reverse_cents;
  if v_balance < 0 then raise exception 'Wallet balance is too low to reverse this entry'; end if;

  insert into public.wallet_transactions (
    organization_id, wallet_id, client_id, project_id, kind, amount_cents, balance_cents,
    currency, reference, method, note, actor_id, actor_name, reverses_id
  ) values (
    p_org, v_wallet.id, p_client_id, v_orig.project_id, 'REVERSAL', v_reverse_cents, v_balance,
    v_orig.currency, v_orig.reference, null,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Reversal of ' || lower(v_orig.kind) || ' ' || right(v_orig.id::text, 8)),
    auth.uid(), public.app_actor_name(), v_orig.id
  ) returning * into v_tx;

  update public.wallet_transactions set reversed_at = now() where id = v_orig.id;
  update public.wallets set balance_cents = v_balance, updated_at = now() where id = v_wallet.id;
  perform public.app_mirror_client_balance(p_org, p_client_id, v_balance);
  perform public.app_mirror_project(p_org, v_orig.project_id);
  perform public.app_log_activity(
    p_org, public.app_actor_name(), 'WALLET_REVERSAL', 'clients',
    format('Reversed %s of %s %s (balance %s)', lower(v_orig.kind),
      to_char(round(abs(v_orig.amount_cents)::numeric / 100, 2), 'FM999,999,999,990.00'),
      v_orig.currency,
      to_char(round(v_balance::numeric / 100, 2), 'FM999,999,999,990.00'))
  );
  return jsonb_build_object('transaction', public.app_tx_view(v_tx.id), 'balance', round(v_balance::numeric / 100, 2));
end;
$$;

create or replace function public.app_wallet_invariant(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (p_org = any(public.app_org_ids())) or not public.app_has_capability(p_org, 'integrity')
    then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'walletId', x.id, 'clientId', x.client_id,
      'cached', round(x.balance_cents::numeric / 100, 2),
      'ledger', round(x.ledger::numeric / 100, 2)
    ))
    from (
      select w.id, w.client_id, w.balance_cents, coalesce(sum(t.amount_cents), 0) as ledger
        from public.wallets w
        left join public.wallet_transactions t
          on t.organization_id = w.organization_id and t.wallet_id = w.id
       where w.organization_id = p_org
       group by w.id, w.client_id, w.balance_cents
    ) x
    where x.ledger <> x.balance_cents
  ), '[]'::jsonb);
end;
$$;

grant execute on all functions in schema public to authenticated, service_role;
