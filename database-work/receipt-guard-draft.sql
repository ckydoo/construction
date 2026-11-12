-- LOCAL DRAFT ONLY. Requires full security and billing review before deployment.
create or replace function public.draft_invoice_matches_allocations(p_org uuid,p_id text,p_data jsonb,p_status text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare paid numeric; gross numeric; base text;
begin
 select unpaid_status into base from public.receipt_invoice_baselines where organization_id=p_org and invoice_id=p_id;
 if base is null then return false; end if;
 select coalesce(sum(l.amount_minor),0) into paid from public.receipt_allocation_lines l
 join public.receipt_allocation_batches b on b.organization_id=l.organization_id and b.id=l.batch_id
 where l.organization_id=p_org and l.invoice_id=p_id and b.reversed_at is null;
 if coalesce(p_data->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' or
    coalesce(p_data->>'amountPaid','') !~ '^[0-9]+(\.[0-9]+)?$' then return false; end if;
 gross := (p_data->>'total')::numeric*100;
 if gross<=0 or paid>gross or (p_data->>'amountPaid')::numeric*100<>paid then return false; end if;
 return p_status=case when paid=0 then base when paid=gross then 'PAID' else 'PARTIALLY_PAID' end;
end $$;
revoke all on function public.draft_invoice_matches_allocations(uuid,text,jsonb,text) from public,anon,authenticated;
-- Fail closed while journal posting and payment reconciliation lack a verified
-- double-entry ledger. Applies to API and direct database writes. Does not alter
-- historical data. Posted historical journals must be corrected to draft first.
create or replace function public.guard_financial_record_invariants()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  s text := upper(coalesce(new.status, ''));
  old_s text := '';
  data_status text := upper(coalesce(new.data->>'status', ''));
  invoice_date date;
  due_date date;
  progress_text text;
begin
  if tg_op = 'UPDATE' then old_s := upper(coalesce(old.status, '')); end if;
  if new.resource in ('journals', 'arInvoices') and data_status <> '' and data_status <> s then
    raise exception using errcode='P0001', message='Status must match the record data';
  end if;
  if new.resource = 'journals' and (s = 'POSTED' or data_status = 'POSTED') then
    raise exception using errcode='P0001', message='Journal posting is unavailable until balanced ledger entries and accounting periods are supported. Save as draft.';
  end if;
  if new.resource = 'arInvoices' then
    -- No payment amount may be asserted or changed through a generic record
    -- write until there is a reconciled payment source of truth.
    if tg_op = 'INSERT' then
      begin
        if coalesce(nullif(new.data->>'amountPaid', ''), '0')::numeric <> 0 then
          raise exception 'amount not reconciled';
        end if;
      exception when others then
        raise exception using errcode='P0001', message='Paid amount cannot be set without payment reconciliation.';
      end;
    elsif new.data->'amountPaid' is distinct from old.data->'amountPaid' and not public.draft_invoice_matches_allocations(new.organization_id,new.id,new.data,new.status) then
      raise exception using errcode='P0001', message='Paid amount cannot be changed without payment reconciliation.';
    end if;
    if s in ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') then
      if nullif(trim(new.data->>'clientId'), '') is null or not exists (
        select 1 from public.records r where r.organization_id = new.organization_id and r.resource='clients'
          and r.id::text = new.data->>'clientId' and r.deleted_at is null
      ) then
        raise exception using errcode='P0001', message='Client: select an existing client before issuing this invoice.';
      end if;
      begin
        if coalesce(new.data->>'invoiceDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
        invoice_date := (new.data->>'invoiceDate')::date;
      exception when others then
        raise exception using errcode='P0001', message='Invoice date: enter a valid invoice date before issuing.';
      end;
      begin
        if coalesce(new.data->>'dueDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
        due_date := (new.data->>'dueDate')::date;
      exception when others then
        raise exception using errcode='P0001', message='Due date: enter a valid due date before issuing.';
      end;
      if due_date < invoice_date then
        raise exception using errcode='P0001', message='Due date cannot be before the invoice date.';
      end if;
    end if;
    if s in ('PAID','PARTIALLY_PAID') and s <> old_s and not public.draft_invoice_matches_allocations(new.organization_id,new.id,new.data,new.status) then
      raise exception using errcode='P0001', message='Payment status cannot be set manually until payment reconciliation is supported.';
    end if;
  end if;
  if new.resource in ('projects','tasks') then
    progress_text := nullif(trim(new.data->>'progress'), '');
    if progress_text is not null then
      begin
        if progress_text::numeric < 0 or progress_text::numeric > 100 or progress_text::numeric::text in ('NaN','Infinity','-Infinity') then
          raise exception 'out of range';
        end if;
      exception when others then
        raise exception using errcode='P0001', message='Progress must be between 0 and 100.';
      end;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_financial_record_invariants on public.records;
create trigger guard_financial_record_invariants before insert or update on public.records
for each row execute function public.guard_financial_record_invariants();

-- Keep allocation sources stable. Financial changes need an explicit
-- reconciliation workflow rather than generic editing/deleting.
create or replace function public.draft_guard_allocation_sources()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare has_history boolean; has_active boolean;
begin
 if old.resource='arInvoices' then
   select exists(select 1 from public.receipt_invoice_baselines where organization_id=old.organization_id and invoice_id=old.id) into has_history;
   if has_history then
     if tg_op='DELETE' then raise exception 'Invoice has allocation history'; end if;
     if new.deleted_at is distinct from old.deleted_at or new.organization_id<>old.organization_id or new.resource<>old.resource
        or new.data->'total' is distinct from old.data->'total'
        or new.data->'clientId' is distinct from old.data->'clientId'
        or new.data->'currency' is distinct from old.data->'currency'
        or new.data->'items' is distinct from old.data->'items'
        or new.data->'amount' is distinct from old.data->'amount'
        or new.data->'vatAmount' is distinct from old.data->'vatAmount'
        or new.data->'vatPct' is distinct from old.data->'vatPct'
        or new.data->'invoiceDate' is distinct from old.data->'invoiceDate'
        or new.data->'dueDate' is distinct from old.data->'dueDate'
        or new.data->'projectId' is distinct from old.data->'projectId'
     then raise exception 'Invoice with allocation history cannot be changed or deleted through generic editing'; end if;
     if not public.draft_invoice_matches_allocations(new.organization_id,new.id,new.data,new.status) then
       raise exception 'Invoice settlement must match active allocations';
     end if;
   end if;
 elsif old.resource='payments' then
   select exists(select 1 from public.receipt_allocation_batches where organization_id=old.organization_id and receipt_id=old.id) into has_history;
   select exists(select 1 from public.receipt_allocation_batches where organization_id=old.organization_id and receipt_id=old.id and reversed_at is null) into has_active;
   if has_history then
     if tg_op='DELETE' then raise exception 'Receipt has allocation history'; end if;
     if new.deleted_at is distinct from old.deleted_at or new.organization_id<>old.organization_id or new.resource<>old.resource
       or new.data->'amount' is distinct from old.data->'amount' or new.data->'clientId' is distinct from old.data->'clientId'
       or new.data->'currency' is distinct from old.data->'currency' or new.data->'direction' is distinct from old.data->'direction'
       or new.data->'paymentDate' is distinct from old.data->'paymentDate' or new.data->'projectId' is distinct from old.data->'projectId'
     then raise exception 'Receipt has allocation history'; end if;
     if new.status is distinct from old.status or new.data->'status' is distinct from old.data->'status' then
       if has_active or new.status<>'REVERSED' or coalesce(new.data->>'status','')<>'REVERSED' or not exists (
         select 1 from public.receipt_reversal_requests where organization_id=old.organization_id and receipt_id=old.id
       ) then raise exception 'Receipt status can only be changed by the reversal transaction'; end if;
     end if;
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
drop trigger if exists draft_guard_allocation_sources on public.records;
create trigger draft_guard_allocation_sources before update or delete on public.records
for each row execute function public.draft_guard_allocation_sources();
