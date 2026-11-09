-- MYLA relational schema (Supabase Postgres)
-- Money is stored in integer cents as bigint. Domain resources live in one
-- org-scoped JSONB table with indexed control columns, exactly as the app's
-- declarative 49-resource registry expects.

create table public.organizations (
  id             uuid primary key default extensions.gen_random_uuid(),
  name           text not null,
  slug           text not null unique,
  legal_name     text,
  reg_number     text,
  country        text not null default 'ZW',
  base_currency  text not null default 'USD',
  locale_pack    text not null default 'ZW',
  company_type   text,
  size           text,
  headcount      integer,
  revenue_band   text,
  onboarded      boolean not null default false,
  config         jsonb not null default '{}'::jsonb,
  created_by_id  uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  email         text not null unique,
  phone         text,
  avatar_color  text not null default '#d97706',
  created_at    timestamptz not null default now()
);

create table public.memberships (
  id              uuid primary key default extensions.gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text not null default 'ADMIN',
  entity_id       text,
  created_at      timestamptz not null default now(),
  unique (user_id, organization_id)
);
create index memberships_org_idx on public.memberships(organization_id);
create index memberships_user_idx on public.memberships(user_id);

create table public.invitations (
  id              uuid primary key default extensions.gen_random_uuid(),
  email           text not null,
  role            text not null,
  token           text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index invitations_org_idx on public.invitations(organization_id);

create table public.records (
  id              text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource        text not null,
  number          text,
  title           text,
  status          text,
  project_id      text,
  data            jsonb not null default '{}'::jsonb,
  created_by_id   uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (organization_id, id)
);
create index records_org_resource_idx on public.records(organization_id, resource);
create index records_org_resource_status_idx on public.records(organization_id, resource, status);
create index records_org_project_idx on public.records(organization_id, project_id);
create index records_org_created_idx on public.records(organization_id, created_at desc);

create table public.comments (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null,
  record_id       text not null,
  author_id       uuid references auth.users(id) on delete set null,
  author_name     text not null,
  body            text not null,
  created_at      timestamptz not null default now(),
  foreign key (organization_id, record_id) references public.records(organization_id, id) on delete cascade
);
create index comments_record_idx on public.comments(organization_id, record_id, created_at);

create table public.audit_logs (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  actor           text not null,
  action          text not null,
  resource        text,
  detail          text not null default '',
  created_at      timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs(organization_id, created_at desc);

create table public.notifications (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  title           text not null,
  body            text not null default '',
  kind            text not null default 'INFO',
  href            text,
  read            boolean not null default false,
  created_at      timestamptz not null default now()
);
create index notifications_org_created_idx on public.notifications(organization_id, created_at desc);

create table public.sequences (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  resource        text not null,
  next            integer not null default 1,
  unique (organization_id, resource)
);

create table public.attachments (
  id               uuid primary key default extensions.gen_random_uuid(),
  organization_id  uuid not null,
  record_id        text not null,
  resource         text not null,
  file_name        text not null,
  stored_name      text not null unique,
  mime             text not null,
  size             bigint not null,
  uploaded_by_id   uuid references auth.users(id) on delete set null,
  uploaded_by_name text not null,
  document_key     text,
  revision         integer not null default 1,
  revision_label   text not null default 'Rev A',
  is_latest        boolean not null default true,
  note             text,
  created_at       timestamptz not null default now(),
  foreign key (organization_id, record_id) references public.records(organization_id, id) on delete cascade
);
create index attachments_org_record_idx on public.attachments(organization_id, record_id);
create index attachments_org_document_idx on public.attachments(organization_id, document_key);

create table public.wallets (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       text not null,
  currency        text not null default 'USD',
  balance_cents   bigint not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, client_id),
  foreign key (organization_id, client_id) references public.records(organization_id, id) on delete cascade
);
create index wallets_org_idx on public.wallets(organization_id);

create table public.wallet_transactions (
  id              uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wallet_id       uuid not null references public.wallets(id) on delete cascade,
  client_id       text not null,
  project_id      text,
  kind            text not null check (kind in ('TOPUP','ALLOCATION','REVERSAL')),
  amount_cents    bigint not null,
  balance_cents   bigint not null,
  currency        text not null default 'USD',
  reference       text,
  method          text,
  note            text,
  actor_id        uuid references auth.users(id) on delete set null,
  actor_name      text not null,
  reverses_id     uuid references public.wallet_transactions(id) on delete set null,
  reversed_at     timestamptz,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);
create index wallet_tx_wallet_created_idx on public.wallet_transactions(organization_id, wallet_id, created_at desc);
create index wallet_tx_project_kind_idx on public.wallet_transactions(organization_id, project_id, kind);
create index wallet_tx_client_idx on public.wallet_transactions(organization_id, client_id);

-- Keep auth.users and public.profiles in sync.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, name, email, avatar_color)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_color', '#d97706')
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    avatar_color = excluded.avatar_color;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger records_set_updated_at
  before update on public.records
  for each row execute function public.set_updated_at();

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();
