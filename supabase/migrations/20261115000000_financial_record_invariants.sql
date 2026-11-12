-- Fail closed while journal posting and payment reconciliation lack a verified
-- double-entry ledger. Applies to API and direct database writes. Does not alter
-- historical data. Posted historical journals must be corrected to draft first.
create or replace function public.guard_financial_record_invariants()
returns trigger language plpgsql set search_path = public, pg_temp as $$
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
    elsif new.data->'amountPaid' is distinct from old.data->'amountPaid' then
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
    if s in ('PAID','PARTIALLY_PAID') and s <> old_s then
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
