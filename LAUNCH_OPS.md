# Launch ops — monitoring, legal, support, incident runbook

MYLA Construction ERP · myla.co.zw · 2026-11-13. Each section ends with the concrete
action owner + evidence to attach to LAUNCH_READINESS.md Gate 4/5.

## 1. Monitoring & alerting — IN-HOUSE (owner decision 2026-11-13; no third-party vendor)
Rationale: keep data/costs minimal pre-launch; review weekly; upgrade later if volume grows.

What is shipped (commit ebdc929; deployed 2026-11-15 as dpl_8hrvUUHGdAo4M9dab1zDH49bypXN, READY/PROMOTED; /api/health verified live):
- **Table** `public.monitor_events` (Supabase, eu-west-1): `kind` ('heartbeat'|'error'),
  `source`, `level`, `message` (clipped to 500 chars), `detail` (jsonb; small structured
  PII-free data — numeric sweep counts only), `created_at`. RLS enabled, **no client
  policies** — service-role write/read only.
- **Cron heartbeats**: billing (02:00 UTC) and notifications (05:00 UTC) routes record a
  `heartbeat` row on success (with sweep counts as `detail`) and an `error` row on failure.
  They also still support the optional `HEALTHCHECK_BILLING_URL` /
  `HEALTHCHECK_NOTIFICATIONS_URL` dead-man's-switch ping (no-op when unset, 5s timeout).
- **Server error log**: `src/instrumentation.ts` `onRequestError` records one `error`
  row per server error (method, path, route type, message, digest — **no request bodies,
  headers or user data**).
- **Liveness**: `GET /api/health` → `{ ok, db, heartbeats: { billing, notifications }, time }`.
  Public but uninformative beyond DB reachability and last heartbeat timestamps.
- **Weekly review (OWNER, calendar it — it is the only alert channel)**:
  ```sql
  select created_at, kind, source, level, message, detail
  from public.monitor_events
  where created_at > now() - interval '7 days'
  order by created_at desc limit 500;
  ```
  Expected: one `heartbeat` per cron per day (~02:00 / ~05:00 UTC). **Any missing day, any
  `error` row, or `/api/health` returning 503 → treat as SEV-2** (hourly check, fix forward,
  rollback via Vercel instant rollback if code-related). If nothing has been reviewed for
  > 7 days the gate must be treated as unmonitored.
- **Housekeeping**: prune quarterly, e.g. `delete from public.monitor_events where created_at
  < now() - interval '90 days';`

DISCLOSED LIMITS (not a substitute for the items originally scoped):
- **No push/page/email alerting.** Nobody is notified automatically; detection relies on the
  weekly review or a human opening `/api/health`.
- **No external uptime probe.** A total outage (Vercel down / bad deploy / DNS) is invisible
  to this system — only Vercel's own status would show it. Recommended upgrade: a free
  UptimeRobot/Better Stack probe on `/api/health` with email alert.
- **Message-only error records** (no stack traces, no breadcrumbs); Postgres/insert failures
  inside the monitoring path are swallowed by design.
- **No PII scrubbing pipeline** — mitigated by construction (callers may only pass counts and
  short messages; do not widen `detail` without a review).
- Does not cover client-side errors or performance.

Owner checklist (attach to Gate 4):
[ ] Weekly review calendared (owner)  [ ] First weekly review done & filed
[ ] Retention prune scheduled          [ ] Upgrade decision (external probe/Sentry) by day-30

## 2. Legal & data protection (requires qualified advice — NOT drafted as final terms)
MYLA's customers are Zimbabwe construction firms; data may include employee timesheets
(personal data) and client financials.

Checklist with pointers:
- **Data Protection Act [Chapter 11:12] (Zimbabwe)** — data controller obligations;
  register with **POTRAZ** if required; appoint a responsible person; lawful processing
  basis; privacy notice; breach notification duty; cross-border transfer rules (DB in
  eu-west-1 — document it and any safeguards).
- **Terms of Service & Privacy Policy** — outline: service description; subscription &
  billing terms (trial, fees, cancellation at period end, no refunds policy stated);
  acceptable use; data ownership (customer owns data; MYLA processes on instruction);
  security commitments (don't over-promise); limitation of liability; governing law
  (Zimbabwe); dispute resolution; termination & data export on cancellation
  (export window before read-only/locked semantics apply).
- **POPIA/GDPR exposure** — if any customer/data subject is outside ZW/EU, take advice;
  eu-west-1 hosting simplifies EU position.
- **Website basics** — contact details, company registration number, support email
  (e.g. support@myla.co.zw — set up mailbox), physical address, cookie/analytics stance
  (currently none — keep it none or document).
- **Payments** — Paynow merchant terms; no card data touches MYLA (Paynow hosts); state so.
- **Insurance** — professional indemnity / cyber for the SaaS itself (advice from broker).

Owner action: engage a ZW-qualified lawyer; do NOT launch publicly before ToS+Privacy
are published and linked from the landing page and footer.

## 3. Support process
- Intake: support@myla.co.zw (create mailbox/alias; forward to owner initially).
- Triage SLA: acknowledge ≤ 4 business hours; categorise: billing / data-loss-risk /
  bug / how-to. Data-loss-risk = drop everything.
- Known-issue runbook entries: billing locked workspace (unlock = settle invoice);
  failed webhook (paynow) replay; invite expired (resend rotates token); email not
  received (check outbox row status: sent/pending/failed + `last_error`; essential mail
  arrives even if muted).
- Escalation: owner → engineering (revert deploy via Vercel instant rollback) → Supabase
  support (PITR) for data loss.
- Customer comms templates: acknowledgement, incident notice, resolution notice,
  maintenance window notice.
- Feedback loop: tester feedback already exists (TESTER_FEEDBACK.md) — process it monthly.

## 4. Incident runbook
SEV-1 (data loss / security breach / total outage): page owner immediately; freeze
deploys; contain (revoke keys, lock accounts, disable signups via `disable_signup`);
restore from backup per B2; notify affected customers within 72h (DPA); post-mortem
in ≤ 5 business days with action items into ROUND2-REPAIR-CHECKLIST.md.
SEV-2 (major degradation: billing broken, many users blocked, email down): hourly updates;
rollback if unresolved ≤ 2h.
SEV-3 (minor bug, workaround exists): next release train.
Rollback mechanics: Vercel → previous READY deployment → "Instant rollback"; DB changes are
NOT rolled back by Vercel — prefer forward-fix migrations; document every manual SQL
application (the receipt/approval trigger application was manual and must be recorded).

## 5. Launch comms
- Status page or pinned post: pre-launch maintenance window, launch note, changelog.
- Onboarding for first 5–10 pilot customers: white-glove setup, weekly check-ins,
  30-day review before opening the gate wider.

Owner action list (attach to Gate 4):
[x] In-house error log + heartbeats shipped [ ] Weekly review calendared + first review done
[ ] ToS & Privacy published + footer link  [ ] POTRAZ status confirmed
[ ] support mailbox + runbook links        [ ] Incident runbook printed/pinned
[ ] Backups drill report attached           [ ] Upgrade decision (external probe/Sentry) by day-30
