# MYLA Construction ERP — launch readiness master checklist

Status date: 2026-11-15. Production: `myla.co.zw` / `app.myla.co.zw`, latest deployment
`dpl_3w42NyyfrkeCfpGg6b7P9RXaFpGK` (commit `10e4410`), READY/PROMOTED.
(Prior: `dpl_8hrvUUHGdAo4M9dab1zDH49bypXN` / `ebdc929` in-house monitoring; `dpl_7crFWKbxzzhr1Qts2LopxnCaqGod` / `e7d8346` env-gated healthchecks.io pings; `dpl_7hN3HmW5SjpAA5GCVDYi5NqgRxFs` / `9d53591` before that.)
This file is the index. Each gate links to its working document. No gate is closed
by a build or a unit test alone.

Legend: DONE = verified in production · PARTIAL = implemented/tested but not fully verified · OPEN = work required.

## Gate 0 — Foundations already in production (verified)
- DONE: Site served by Vercel; TLS for both aliases; deploy process via git push + manual `create_deployment` (push alone does NOT deploy).
- DONE: Supabase Postgres (Construction, ref `oeadisqfuyhelppinaxw`, eu-west-1), RLS enabled; service-role RPCs for receipts (v2) are `SECURITY DEFINER`, executable only by `service_role`.
- DONE: Atomic receipt↔billing authorization deployed (`d5f4913`); over-allocation live probe rejected with zero persisted writes.
- DONE: Offline temporary-password invitations deployed; create/accept/resend/reuse/expiry/cancel flows passed scripted production checks with cleanup; cancel now removes unused temporary auth accounts (`f12490c`).
- DONE: Production SMTP for app-outbox email set 2026-11-13 06:50 UTC; delivers (five `sent` rows incl. one billing). Old 42-email billing backlog deliberately cancelled and stays cancelled.
- PARTIAL: Fresh controlled billing test queued 2026-11-13 (`billing-delivery-test-2026-11-13-v1`) — expect delivery at 05:00 UTC notifications sweep; confirm inbox receipt.

## Gate 1 — Round-2 open engineering items (owner: eng) — see ROUND2-REPAIR-CHECKLIST.md
- OPEN: 1 Receipt allocation authoritative gate — done & deployed, but concurrency at commit instant, full gateway matrix, retry/idempotency in live traffic, audit reconciliation, and historical-data plan remain.
- PARTIAL: 2 Timesheets/variations — approved-timesheet date edit returns 409 live; authenticated creation/submit/approve path passes as test OWNER. Restricted-role denial and legacy-data checks still open.
- OPEN: 3 Tax defaults & margin definition — implemented (tax off default, owner/admin configurable); **accountant sign-off required** (see ACCOUNTANT_REVIEW_PACK.md).
- OPEN: 4 Quote-to-job proposed baseline — implemented; authenticated E2E open.
- OPEN: 5 Stale lists — local fix prepared; live save/convert verification open.
- PARTIAL: 6 Fractional quantities — 2.5 verified in storage, line CSV, drawer and invoice PDF (INV-0007). Other document types pending.
- PARTIAL: 7 CSV usability — parent CSV (Record ID) + scoped line-item CSV verified live incl. formula escaping. Child CSV **not implemented**; live role-permission/E2E open.
- PARTIAL: 8 Conversion tracker — chain/lineage/hints/empty-state verified live (quote→job, $100 proposed cost, sourceId). Role/permission matrix open.
- PARTIAL: 9 Invoice wording/artifacts — PDF inspected (INV-0007): branding, line math, VAT 0, layout OK. Quotes/POs/statements uninspected; accountant review pending.
- PARTIAL: 10 Dates — init-once fix shipped; approved-timesheet edits rejected (409); receipts with missing/invalid dates rejected (4xx). Keyboard/calendar reproduction by a human still open.
- OPEN: 11 Full QA & release — scenario retest, security tests, migration validation, backup/rollback plan, disclosed release report.

## Gate 2 — Accountant review (owner: accountant + eng) — ACCOUNTANT_REVIEW_PACK.md
OPEN: Definitions and sign-off for tax defaults, margin/profit, cash gap, cash received,
allocation/reversal rules, fractional rounding, invoice artifacts.
**Until signed off, financial figures in the app must not be presented as definitive.**

## Gate 3 — Independent security review & backup/restore (owner: independent reviewer + owner) — SECURITY_REVIEW_BACKUP_PLAN.md
OPEN: Full role/RLS matrix, billing authorization audit, secrets review, outbox/deliverability,
plus an actual restore drill with measured RPO/RTO.

## Gate 4 — Launch ops (owner: owner) — LAUNCH_OPS.md
- PARTIAL: Monitoring/alerting — owner chose in-house over third-party. Shipped: `monitor_events` table (RLS, service-role only), cron heartbeat rows, global `onRequestError` error logging, public `/api/health`. Disclosed limits: no push/page alerting, no external uptime probe (a total outage pages nobody), message-only errors, relies on manual weekly review. See LAUNCH_OPS.md §1. Gate stays open until the weekly review is calendared and run.
- OPEN: Terms of Service & Privacy Policy (draft outline provided; requires qualified legal/tax advice — Zimbabwe Data Protection Act [Cap 11:12], POTRAZ registration, no US-hosted marketing without review).
- OPEN: Support process (intake, SLA, escalation), incident runbook (SEV definitions, rollback = Vercel instant rollback + Supabase PITR), customer comms templates.
- OPEN: Status/maintenance comms channel for customers; data residency statement (eu-west-1); data-subject request process.

## Gate 5 — Public-launch gate (do not flip until 1–4 closed)
- OPEN: One observed real Paynow payment end-to-end in production ($1 watched transaction), `PAYNOW_RESULT_URL` pointed at `https://myla.co.zw/api/webhooks/paynow` not the `.vercel.app` domain.
- OPEN: Confirm production billing email lifecycle in real inboxes (overdue, locked, payment received).
- OPEN: Manual offline-onboarding browser run-through by a human (Turnstile).
- OPEN: Load/concurrency smoke (k6 or similar) at target launch scale.
- OPEN: Go/no-go sign-off (owner + accountant + security reviewer) recorded here.

## Email verification note
The five `sent` outbox rows of 2026-11-13 prove delivery works. The 42 cancelled
billing emails must stay cancelled (owner request). Never "turn on" email by clearing
`cancelled` rows; new sends go through the normal lifecycle.
