# Pending team invitations — implementation and safety checklist

Status: implemented and deployed (commits `a55ed23`, `0e0dd19`, `1ef3456`, `f12490c`; production deployment `dpl_4ZgDNYD46G9zStnLvo3q9jQ9Vy5C`, 2026-11-13). Scripted production verification passed (create/accept/resend/expiry/reuse/cleanup). Still open: live browser run-through of the full offline journey (Turnstile blocks scripted sign-in) and any changes to unrelated production users.

## Required behavior
- An invitation is a pending workspace-specific authorization, not a membership. The recipient receives no workspace access until acceptance succeeds.
- The invitation expires seven days after its latest issue and is one-use. Resend rotates its token and invalidates the previous token; no membership is created by resending.
- New accounts set a password through the invitation. Existing accounts authenticate as the addressed user before accepting; possession of a forwarded email alone must not let a different signed-in account join.
- Admins see pending, expired and accepted states, can resend, and can cancel a pending invitation. The UI must distinguish SMTP acceptance, queued delivery and failure; never promise inbox delivery.
- Existing memberships are grandfathered. Legacy invitation links must not accidentally activate a new pending invitation or be silently broken.

## Security and implementation gates
- Keep pending invite rows and hashed bearer tokens service-role only. The client must not be able to read the token table or mutate role/scope.
- Atomic database transaction must lock the invitation, validate token hash, expiry, recipient and status, enforce applicable seat limits, insert membership, and mark the invitation accepted together. Duplicate/replayed requests must not create access twice. Resend/cancel and accept must serialize against the same row.
- Validate role, inviter authority, client/staff scope and workspace at invite creation and recheck necessary constraints on acceptance. Seat capacity and billing must be authoritative at acceptance under concurrency, not a client-provided count.
- Existing-user sign-in must retain the invite context safely across login, handle users with no memberships, and not leak the bearer link in logs. New-account password creation and membership activation span Supabase Auth and Postgres; design recovery for failures, avoid orphaned privileged users, and do not consume the token before an unrecoverable Auth failure.
- Test using a controlled inbox and test workspace: new and existing user, wrong signed-in user, pending access denied by app and direct RLS, expiration, resend and old-link rejection, duplicate acceptance, cancellation, role and scope, billing/seat concurrency, and SMTP failure. No changes to unrelated production users.
