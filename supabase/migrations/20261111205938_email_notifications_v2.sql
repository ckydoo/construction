-- Quiet-by-default notification controls. Workspace activity stays in the in-app
-- notification centre; only account, security and billing messages may use email.
alter table public.notification_preferences
  add column if not exists in_app_approvals boolean not null default true,
  add column if not exists in_app_tasks     boolean not null default true,
  add column if not exists in_app_support   boolean not null default true,
  add column if not exists in_app_digest    boolean not null default true;

alter table public.notification_preferences
  alter column digest_frequency set default 'off',
  alter column mute_all set default true;

update public.notification_preferences
   set email_approvals = false,
       email_tasks = false,
       email_support = false,
       email_digest = false,
       digest_frequency = 'off',
       mute_all = true;

create index if not exists notification_preferences_in_app_digest_idx
  on public.notification_preferences (user_id)
  where in_app_enabled and in_app_digest and digest_frequency <> 'off';
