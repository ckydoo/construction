-- LOCAL DRAFT ONLY. Not deployable: invoice settlement/reversal, immutable
-- payment guards, billing entitlements and API integration are not complete.
-- Stores integer minor units, scoped foreign keys and idempotency keys.
create table public.receipt_allocation_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  receipt_id text not null,
  request_id uuid not null,
  payload jsonb not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_request_id uuid,
  unique (organization_id, request_id),
  unique (organization_id, id),
  foreign key (organization_id, receipt_id) references public.records (organization_id,id)
);
create table public.receipt_allocation_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id uuid not null,
  invoice_id text not null,
  amount_minor bigint not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  unique (batch_id, invoice_id),
  foreign key (organization_id, batch_id) references public.receipt_allocation_batches (organization_id,id),
  foreign key (organization_id, invoice_id) references public.records (organization_id,id)
);
create index receipt_allocation_invoice_idx on public.receipt_allocation_lines (organization_id,invoice_id);
create index receipt_allocation_receipt_idx on public.receipt_allocation_batches (organization_id,receipt_id);
alter table public.receipt_allocation_batches enable row level security;
alter table public.receipt_allocation_lines enable row level security;
revoke all on public.receipt_allocation_batches, public.receipt_allocation_lines from public, anon, authenticated;
-- No mutation RPC or read policies yet. Consequently this draft cannot be
-- used to allocate money or settle an invoice; it must not be deployed.

create table public.receipt_reversal_requests (
  organization_id uuid not null,
  request_id uuid not null,
  receipt_id text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id,request_id),
  foreign key (organization_id,receipt_id) references public.records (organization_id,id)
);
alter table public.receipt_reversal_requests enable row level security;
revoke all on public.receipt_reversal_requests from public,anon,authenticated;

create table public.receipt_invoice_baselines (
  organization_id uuid not null,
  invoice_id text not null,
  unpaid_status text not null check (unpaid_status in ('ISSUED','OVERDUE')),
  primary key (organization_id, invoice_id),
  foreign key (organization_id, invoice_id) references public.records (organization_id,id)
);
alter table public.receipt_invoice_baselines enable row level security;
revoke all on public.receipt_invoice_baselines from public, anon, authenticated;

-- Internal only: the service-only entrypoints must recheck the authenticated
-- actor and record scope inside the transaction, after acquiring source locks.
create or replace function public.draft_authorize_allocation(p_org uuid,p_actor uuid,p_record text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_org is null or p_actor is null or p_record is null then raise exception 'Unauthorized'; end if;
 perform 1 from public.memberships where organization_id=p_org and user_id=p_actor for share;
 if not found then raise exception 'Unauthorized'; end if;
 perform 1 from public.organizations where id=p_org for share;
 if not found then raise exception 'Unauthorized'; end if;
 -- auth.uid() in this project uses request.jwt.claim.sub before jwt.claims.
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 if not public.app_can_write(p_org,'payments') or not public.app_can_write(p_org,'arInvoices')
    or not public.app_has_capability(p_org,'records.update')
    or not public.app_visible_record_id(p_org,p_record) then raise exception 'Unauthorized'; end if;
end $$;
revoke all on function public.draft_authorize_allocation(uuid,uuid,text) from public,anon,authenticated;

-- Isolated arithmetic/locking prototype; it deliberately has no execute
-- grant. It cannot be deployed until invoice status synchronization, reversal,
-- immutable-source guards, billing and authorization integration are added.
create or replace function public.draft_allocate_receipt(
  p_org uuid, p_receipt text, p_request uuid, p_actor uuid, p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  receipt public.records%rowtype;
  invoice public.records%rowtype;
  batch public.receipt_allocation_batches%rowtype;
  item jsonb;
  amount bigint;
  receipt_minor numeric;
  invoice_minor numeric;
  prior_receipt numeric;
  prior_invoice numeric;
  request_total numeric := 0;
  receipt_date date;
  id_list text[] := '{}';
  result jsonb;
begin
  if p_org is null or p_receipt is null or p_request is null or p_actor is null or
     jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 100 then
    raise exception 'Invalid allocation request';
  end if;
  -- Lock the receipt before checking the request key; serializes concurrent
  -- attempts for the same receipt. Invoice locks are acquired in sorted order.
  select * into receipt from public.records where organization_id=p_org and id=p_receipt and resource='payments' and deleted_at is null for update;
  if not found then raise exception 'Receipt not found'; end if;
  perform public.draft_authorize_allocation(p_org,p_actor,p_receipt);
  select * into batch from public.receipt_allocation_batches where organization_id=p_org and request_id=p_request;
  if found then
    if batch.receipt_id<>p_receipt or batch.payload<>p_lines or batch.created_by<>p_actor then
      raise exception 'Idempotency key reused with different request';
    end if;
    return jsonb_build_object('batchId',batch.id,'replayed',true);
  end if;
  if upper(coalesce(receipt.data->>'direction','')) <> 'RECEIPT' or receipt.status not in ('CLEARED','RECONCILED') then
    raise exception 'Receipt must be cleared or reconciled';
  end if;
  if coalesce(receipt.data->>'paymentDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Receipt date is required'; end if;
  begin receipt_date := (receipt.data->>'paymentDate')::date; exception when others then raise exception 'Invalid receipt date'; end;
  if coalesce(receipt.data->>'clientId','')='' or coalesce(receipt.data->>'currency','')='' then
    raise exception 'Receipt client and currency are required';
  end if;
  if coalesce(receipt.data->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Invalid receipt amount'; end if;
  receipt_minor := (receipt.data->>'amount')::numeric * 100;
  if receipt_minor<=0 or receipt_minor>9223372036854775807 then raise exception 'Invalid receipt amount'; end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    if jsonb_typeof(item)<>'object' or coalesce(item->>'invoiceId','')='' or
       coalesce(item->>'amountMinor','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Invalid allocation'; end if;
    if item->>'invoiceId'=any(id_list) then raise exception 'Duplicate invoice'; end if;
    id_list := array_append(id_list,item->>'invoiceId');
  end loop;
  perform 1 from public.records where organization_id=p_org and resource='arInvoices' and id=any(id_list)
    and deleted_at is null order by id for update;
  select coalesce(sum(l.amount_minor),0) into prior_receipt from public.receipt_allocation_lines l
    join public.receipt_allocation_batches b on b.organization_id=l.organization_id and b.id=l.batch_id
    where b.organization_id=p_org and b.receipt_id=p_receipt and b.reversed_at is null;
  for item in select value from jsonb_array_elements(p_lines) loop
    select * into invoice from public.records where organization_id=p_org and id=item->>'invoiceId' and resource='arInvoices' and deleted_at is null;
    if not found or invoice.status not in ('ISSUED','OVERDUE','PARTIALLY_PAID') then raise exception 'Invoice unavailable'; end if;
    perform public.draft_authorize_allocation(p_org,p_actor,invoice.id);
    if invoice.data->>'clientId' is distinct from receipt.data->>'clientId' or
       upper(coalesce(invoice.data->>'currency',''))<>upper(receipt.data->>'currency') then
      raise exception 'Invoice and receipt client and currency must match';
    end if;
    if coalesce(invoice.data->>'total','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Invalid invoice total'; end if;
    invoice_minor := (invoice.data->>'total')::numeric * 100;
    amount := (item->>'amountMinor')::bigint;
    select coalesce(sum(l.amount_minor),0) into prior_invoice from public.receipt_allocation_lines l
      join public.receipt_allocation_batches b on b.id=l.batch_id and b.organization_id=l.organization_id
      where l.organization_id=p_org and l.invoice_id=invoice.id and b.reversed_at is null;
    if coalesce(nullif(invoice.data->>'amountPaid',''),'0')::numeric * 100 <> prior_invoice then
      raise exception 'Invoice has unreconciled historical paid amount';
    end if;
    if amount<=0 or amount+prior_invoice>invoice_minor then raise exception 'Allocation exceeds invoice balance'; end if;
    request_total := request_total+amount;
  end loop;
  if request_total+prior_receipt>receipt_minor then raise exception 'Allocation exceeds receipt balance'; end if;
  for item in select value from jsonb_array_elements(p_lines) loop
    select * into invoice from public.records where organization_id=p_org and id=item->>'invoiceId';
    if invoice.status in ('ISSUED','OVERDUE') then
      insert into public.receipt_invoice_baselines values (p_org,invoice.id,invoice.status) on conflict do nothing;
    elsif not exists (select 1 from public.receipt_invoice_baselines where organization_id=p_org and invoice_id=invoice.id) then
      raise exception 'Invoice has unreconciled historical paid status';
    end if;
  end loop;
  insert into public.receipt_allocation_batches(organization_id,receipt_id,request_id,payload,created_by)
    values(p_org,p_receipt,p_request,p_lines,p_actor) returning * into batch;
  for item in select value from jsonb_array_elements(p_lines) loop
    insert into public.receipt_allocation_lines(organization_id,batch_id,invoice_id,amount_minor)
      values(p_org,batch.id,item->>'invoiceId',(item->>'amountMinor')::bigint);
  end loop;
  for item in select value from jsonb_array_elements(p_lines) loop
    perform public.draft_sync_invoice(p_org,item->>'invoiceId');
  end loop;
  perform public.app_log_activity(p_org,null,'ALLOCATE','payments','Receipt '||p_receipt||'; batch '||batch.id::text||'; request '||p_request::text);
  result := jsonb_build_object('batchId',batch.id,'replayed',false,'unallocatedMinor',receipt_minor-prior_receipt-request_total);
  return result;
end $$;
revoke all on function public.draft_allocate_receipt(uuid,text,uuid,uuid,jsonb) from public,anon,authenticated;

-- Recalculate strictly from non-reversed allocation rows, not receipt/project totals.
create or replace function public.draft_sync_invoice(p_org uuid,p_invoice text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare paid numeric; gross numeric; desired text; previous text;
begin
 select coalesce(sum(l.amount_minor),0) into paid from public.receipt_allocation_lines l
 join public.receipt_allocation_batches b on b.organization_id=l.organization_id and b.id=l.batch_id
 where l.organization_id=p_org and l.invoice_id=p_invoice and b.reversed_at is null;
 select (data->>'total')::numeric*100 into gross from public.records where organization_id=p_org and id=p_invoice for update;
 select unpaid_status into previous from public.receipt_invoice_baselines where organization_id=p_org and invoice_id=p_invoice;
 if previous is null or gross is null or gross<=0 or paid>gross then raise exception 'Cannot reconcile invoice'; end if;
 desired:=case when paid=0 then previous when paid=gross then 'PAID' else 'PARTIALLY_PAID' end;
 update public.records set status=desired, data=jsonb_set(jsonb_set(data,'{amountPaid}',to_jsonb(paid/100),true),'{status}',to_jsonb(desired),true)
 where organization_id=p_org and id=p_invoice and resource='arInvoices' and deleted_at is null;
 if not found then raise exception 'Invoice unavailable'; end if;
end $$;
revoke all on function public.draft_sync_invoice(uuid,text) from public,anon,authenticated;

-- One reversal undoes every allocation from the batch. The receipt itself is
-- not reversed here; callers must separately establish receipt lifecycle rules.
create or replace function public.draft_reverse_batch(p_org uuid,p_batch uuid,p_request uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.receipt_allocation_batches%rowtype; invoice_id text;
begin
 if p_org is null or p_batch is null or p_request is null or p_actor is null then raise exception 'Invalid reversal'; end if;
 select * into b from public.receipt_allocation_batches where organization_id=p_org and id=p_batch;
 if not found then raise exception 'Batch not found'; end if;
 perform public.draft_authorize_allocation(p_org,p_actor,b.receipt_id);
 perform 1 from public.records where organization_id=p_org and id=b.receipt_id for update;
 select * into b from public.receipt_allocation_batches where organization_id=p_org and id=p_batch for update;
 if b.reversed_at is not null then
   if b.reversal_request_id=p_request and b.reversed_by=p_actor then return jsonb_build_object('replayed',true); end if;
   raise exception 'Batch already reversed';
 end if;
 perform 1 from public.records where organization_id=p_org and id in
   (select l.invoice_id from public.receipt_allocation_lines l where l.organization_id=p_org and l.batch_id=p_batch)
   order by id for update;
 update public.receipt_allocation_batches set reversed_at=now(),reversed_by=p_actor,reversal_request_id=p_request
 where organization_id=p_org and id=p_batch;
 for invoice_id in select l.invoice_id from public.receipt_allocation_lines l where l.organization_id=p_org and l.batch_id=p_batch order by l.invoice_id loop
   perform public.draft_authorize_allocation(p_org,p_actor,invoice_id);
   perform public.draft_sync_invoice(p_org,invoice_id);
 end loop;
 perform public.app_log_activity(p_org,null,'REVERSE_ALLOCATION','payments','Receipt '||b.receipt_id||'; batch '||p_batch::text||'; request '||p_request::text);
 return jsonb_build_object('replayed',false);
end $$;
revoke all on function public.draft_reverse_batch(uuid,uuid,uuid,uuid) from public,anon,authenticated;

-- Reverses the receipt and all allocations in one transaction. Draft has no
-- execute grants: the actor parameter must not be trusted without auth work.
create or replace function public.draft_reverse_receipt(p_org uuid,p_receipt text,p_request uuid,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.records%rowtype; prior public.receipt_reversal_requests%rowtype; invoice_id text;
begin
 if p_org is null or p_receipt is null or p_request is null or p_actor is null then raise exception 'Invalid reversal'; end if;
 select * into receipt from public.records where organization_id=p_org and id=p_receipt and resource='payments' and deleted_at is null for update;
 if not found then raise exception 'Receipt not found'; end if;
 perform public.draft_authorize_allocation(p_org,p_actor,p_receipt);
 select * into prior from public.receipt_reversal_requests where organization_id=p_org and request_id=p_request;
 if found then
   if prior.receipt_id<>p_receipt or prior.actor_id<>p_actor then raise exception 'Idempotency key reused with different request'; end if;
   return jsonb_build_object('replayed',true);
 end if;
 if receipt.status not in ('CLEARED','RECONCILED') or upper(coalesce(receipt.data->>'direction',''))<>'RECEIPT' then raise exception 'Receipt cannot be reversed'; end if;
 perform 1 from public.records where organization_id=p_org and id in (
   select l.invoice_id from public.receipt_allocation_lines l join public.receipt_allocation_batches b
   on b.organization_id=l.organization_id and b.id=l.batch_id
   where b.organization_id=p_org and b.receipt_id=p_receipt and b.reversed_at is null
 ) order by id for update;
 insert into public.receipt_reversal_requests(organization_id,request_id,receipt_id,actor_id) values(p_org,p_request,p_receipt,p_actor);
 -- Save affected invoices before changing the active set.
 for invoice_id in select distinct l.invoice_id from public.receipt_allocation_lines l
   join public.receipt_allocation_batches b on b.organization_id=l.organization_id and b.id=l.batch_id
   where b.organization_id=p_org and b.receipt_id=p_receipt and b.reversed_at is null order by l.invoice_id
 loop
   perform public.draft_authorize_allocation(p_org,p_actor,invoice_id);
 end loop;
 update public.receipt_allocation_batches set reversed_at=now(),reversed_by=p_actor,reversal_request_id=p_request
 where organization_id=p_org and receipt_id=p_receipt and reversed_at is null;
 for invoice_id in select distinct l.invoice_id from public.receipt_allocation_lines l
   join public.receipt_allocation_batches b on b.organization_id=l.organization_id and b.id=l.batch_id
   where b.organization_id=p_org and b.receipt_id=p_receipt and b.reversal_request_id=p_request order by l.invoice_id
 loop
   perform public.draft_sync_invoice(p_org,invoice_id);
 end loop;
 update public.records set status='REVERSED',data=jsonb_set(data,'{status}',to_jsonb('REVERSED'::text),true)
 where organization_id=p_org and id=p_receipt;
 perform public.app_log_activity(p_org,null,'REVERSE','payments','Receipt '||p_receipt||'; request '||p_request::text);
 return jsonb_build_object('replayed',false);
end $$;
revoke all on function public.draft_reverse_receipt(uuid,text,uuid,uuid) from public,anon,authenticated;

-- Draft: receipt creation and all allocations succeed or roll back together.
-- No execute grants: API integration and real permission tests remain open.
create table public.receipt_creation_requests (
 organization_id uuid not null,
 request_id uuid not null,
 actor_id uuid not null,
 receipt_id text not null,
 payload jsonb not null,
 created_at timestamptz not null default now(),
 primary key (organization_id,request_id),
 foreign key (organization_id,receipt_id) references public.records(organization_id,id)
);
alter table public.receipt_creation_requests enable row level security;
revoke all on public.receipt_creation_requests from public,anon,authenticated;

create or replace function public.draft_create_receipt(
 p_org uuid,p_request uuid,p_actor uuid,p_receipt jsonb,p_lines jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 r_id text; r_no text; clean_date date; amount numeric; op public.receipt_creation_requests%rowtype;
 line jsonb; result jsonb; payload jsonb;
begin
 if p_org is null or p_request is null or p_actor is null or jsonb_typeof(p_receipt)<>'object'
    or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid receipt request'; end if;
 if coalesce(p_receipt->>'clientId','')='' or coalesce(p_receipt->>'currency','') !~ '^[A-Z]{3}$'
   or coalesce(p_receipt->>'name','')='' or coalesce(p_receipt->>'method','') not in ('Bank transfer','RTGS','Mobile money','Cash','Cheque','Card','Offset') then
   raise exception 'Receipt requires name, client, currency and method';
 end if;
 if coalesce(p_receipt->>'paymentDate','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Receipt date is required'; end if;
 begin clean_date := (p_receipt->>'paymentDate')::date; exception when others then raise exception 'Invalid receipt date'; end;
 if coalesce(p_receipt->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Invalid receipt amount'; end if;
 amount := (p_receipt->>'amount')::numeric;
 if amount<=0 or amount*100>9223372036854775807 then raise exception 'Receipt amount must be positive'; end if;
 -- Validate the linked client in this tenant and check scoped visibility.
 perform 1 from public.records where organization_id=p_org and id=p_receipt->>'clientId' and resource='clients' and deleted_at is null;
 if not found then raise exception 'Client unavailable'; end if;
 perform public.draft_authorize_allocation(p_org,p_actor,p_receipt->>'clientId');
 payload := jsonb_build_object('receipt',p_receipt,'lines',p_lines);
 -- Serialize same-request creation even before the request row exists.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||p_request::text,0));
 select * into op from public.receipt_creation_requests where organization_id=p_org and request_id=p_request;
 if found then
   if op.actor_id<>p_actor or op.payload<>payload then raise exception 'Idempotency key reused with different request'; end if;
   perform public.draft_authorize_allocation(p_org,p_actor,op.receipt_id);
   return jsonb_build_object('receiptId',op.receipt_id,'replayed',true);
 end if;
 if nullif(p_receipt->>'projectId','') is not null then
   perform 1 from public.records where organization_id=p_org and id=p_receipt->>'projectId' and resource='projects' and deleted_at is null;
   if not found then raise exception 'Project unavailable'; end if;
   perform public.draft_authorize_allocation(p_org,p_actor,p_receipt->>'projectId');
 end if;
 -- Lock invoices in a stable order before inserting the new receipt; it is not
 -- visible to concurrent transactions until this transaction commits.
 perform 1 from public.records where organization_id=p_org and resource='arInvoices' and deleted_at is null
   and id in (select x->>'invoiceId' from jsonb_array_elements(p_lines) x) order by id for update;
 for line in select value from jsonb_array_elements(p_lines) loop
   perform public.draft_authorize_allocation(p_org,p_actor,line->>'invoiceId');
 end loop;
 r_id := gen_random_uuid()::text;
 r_no := public.app_next_number(p_org,'payments','PYM');
 insert into public.records(id,organization_id,resource,number,title,status,project_id,data,created_by_id)
 values(r_id,p_org,'payments',r_no,p_receipt->>'name','CLEARED',nullif(p_receipt->>'projectId',''),
   jsonb_build_object('number',r_no,'name',p_receipt->>'name','status','CLEARED','direction','RECEIPT',
     'clientId',p_receipt->>'clientId','projectId',nullif(p_receipt->>'projectId',''),
     'currency',p_receipt->>'currency','amount',amount,'paymentDate',clean_date::text,
     'method',p_receipt->>'method','reference',nullif(p_receipt->>'reference',''),'items','[]'::jsonb),p_actor);
 insert into public.receipt_creation_requests(organization_id,request_id,actor_id,receipt_id,payload)
 values(p_org,p_request,p_actor,r_id,payload);
 result := public.draft_allocate_receipt(p_org,r_id,p_request,p_actor,p_lines);
 perform public.app_log_activity(p_org,null,'CREATE','payments','Receipt '||r_id||'; number '||r_no||'; request '||p_request::text);
 return jsonb_build_object('receiptId',r_id,'number',r_no,'replayed',false,'allocation',result);
end $$;
revoke all on function public.draft_create_receipt(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;

-- Only the server-side service credential may invoke these entry points. The
-- endpoint supplies an authenticated actor; the functions re-check membership,
-- capabilities and scope inside the transaction. Internal helpers stay private.
grant execute on function public.draft_create_receipt(uuid,uuid,uuid,jsonb,jsonb) to service_role;
grant execute on function public.draft_allocate_receipt(uuid,text,uuid,uuid,jsonb) to service_role;
grant execute on function public.draft_reverse_receipt(uuid,text,uuid,uuid) to service_role;
grant select on public.receipt_allocation_batches, public.receipt_allocation_lines to service_role;
