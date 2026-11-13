-- Bind administrator-created, password-based invitations to their new account.
-- No existing user or membership is modified.
alter table public.workspace_invites_v2 add column offline_user_id uuid references auth.users(id) on delete set null;
create index workspace_invites_v2_offline_user_idx on public.workspace_invites_v2(offline_user_id) where offline_user_id is not null and accepted_at is null and cancelled_at is null;
