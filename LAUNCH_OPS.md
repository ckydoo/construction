# Launch ops — monitoring, legal, support, incident runbook

MYLA Construction ERP · myla.co.zw · 2026-11-13. Each section ends with the concrete
action owner + evidence to attach to LAUNCH_READINESS.md Gate 4/5.

## 1. Monitoring & alerting (currently: none installed)
Facts: no Sentry/OTel/Datadog in `package.json` or `src/`. Vercel logs + analytics only.

Minimum viable monitoring before public launch:
1. **Error tracking** — pick one (Sentry recommended; `@sentry/nextjs`). Wire into
   `src/middleware.ts`, route handlers and client. Set `SENTRY_DSN` (products DSN, not
   secret) in Vercel production; alert on >N errors/min to an email/phone the owner sees.
   Capture `beforeSend` PII scrubbing (emails, tokens, invoice data).
2. **Uptime check** — free external probe (UptimeRobot/Better Stack) on
   `https://myla.co.zw/login` every 1–5 min; alert to same channel; record probe URL.
3. **Cron heartbeats** — billing sweep (02:00) and notifications sweep (05:00) must
   report success. Implemented in code (2026-11-13, commit pending at time of writing):
   both routes now ping `HEALTHCHECK_BILLING_URL` / `HEALTHCHECK_NOTIFICATIONS_URL` on
   success and `<url>/fail` on error (see `src/lib/heartbeat.ts`; no-op when unset; no
   token in git; 5s timeout; never throws). Remaining: create the healthchecks.io
   checks, set the two env vars in Vercel production, deploy, and verify a ping lands
   (plus a test `/fail`) before Gate 4 sign-off. Alert if missed > 26h.
4. **Business metric alerts** — optional: daily email from the billing sweep with counts
   (invoices created, locked workspaces, payment failures) to the owner.
5. **Log hygiene** — confirm no request bodies with tokens/passwords are logged; review
   Vercel runtime logs after one week; set log retention policy.

Owner action: choose provider, add DSN to Vercel, verify alert arrives (test event).

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
[ ] Sentry DSN in prod + alert tested   [ ] Uptime probe live
[ ] healthchecks.io pings on both crons [ ] ToS & Privacy published + footer link
[ ] POTRAZ status confirmed             [ ] support mailbox + runbook links
[ ] Incident runbook printed/pinned     [ ] Backups drill report attached
