-- Email verification, quiet notification preferences and an SMTP outbox.
-- Service-role only tables hold one-time links and delivery state; per-user
-- preferences are readable and editable only by their owner.

create table if not exists public.email_verification_tokens (
  id            uuid primary key default extensions.gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  email         text not null,
  purpose       text not null default 'verify_email'
                check (purpose in ('verify_email','reset_password','invite')),
  token_hash    text not null unique,
  expires_at    timestamptz not null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists email_verification_tokens_user_idx
  on public.email_verification_tokens (user_id, purpose, created_at desc);
create index if not exists email_verification_tokens_expiry_idx
  on public.email_verification_tokens (expires_at);

create table if not exists public.email_outbox (
  id                  uuid primary key default extensions.gen_random_uuid(),
  recipient_email     text not null,
  recipient_user_id   uuid references auth.users(id) on delete set null,
  template_key        text not null,
  subject             text not null,
  html                text not null,
  text_body           text not null,
  payload             jsonb not null default '{}'::jsonb,
  dedupe_key          text not null unique,
  status              text not null default 'pending'
                      check (status in ('pending','sent','failed','cancelled')),
  scheduled_at        timestamptz not null default now(),
  attempts            integer not null default 0,
  last_error          text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists email_outbox_pending_idx
  on public.email_outbox (status, scheduled_at, created_at);
create index if not exists email_outbox_recipient_idx
  on public.email_outbox (recipient_email, created_at desc);

create table if not exists public.notification_preferences (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  email_security      boolean not null default true,
  email_billing       boolean not null default true,
  email_approvals     boolean not null default false,
  email_tasks         boolean not null default false,
  email_support       boolean not null default false,
  email_digest        boolean not null default false,
  digest_frequency    text not null default 'daily'
                      check (digest_frequency in ('daily','weekly','off')),
  quiet_hours_start   smallint not null default 22 check (quiet_hours_start between 0 and 23),
  quiet_hours_end     smallint not null default 7 check (quiet_hours_end between 0 and 23),
  timezone            text not null default 'Africa/Harare',
  in_app_enabled      boolean not null default true,
  mute_all            boolean not null default false,
  unsubscribe_token   text not null unique
                      default replace(extensions.gen_random_uuid()::text || extensions.gen_random_uuid()::text, '-', ''),
  unsubscribed_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.notification_dedupe (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_key       text not null,
  created_at      timestamptz not null default now(),
  primary key (organization_id, event_key)
);
create index if not exists notification_dedupe_created_idx
  on public.notification_dedupe (created_at);

drop trigger if exists email_outbox_set_updated_at on public.email_outbox;
create trigger email_outbox_set_updated_at before update on public.email_outbox
  for each row execute function public.set_updated_at();
drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.email_verification_tokens enable row level security;
alter table public.email_outbox enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_dedupe enable row level security;

drop policy if exists notification_preferences_select on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notification_preferences_insert on public.notification_preferences;
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists notification_preferences_update on public.notification_preferences;
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.email_verification_tokens to service_role;
grant select, insert, update, delete on public.email_outbox to service_role;
grant select, insert, update, delete on public.notification_dedupe to service_role;
grant select, insert, update, delete on public.notification_preferences to service_role;
