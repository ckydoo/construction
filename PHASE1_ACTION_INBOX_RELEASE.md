# Phase 1 — Action Inbox + approval engine

Built after the “go ahead” on the ERP roadmap. This is a local implementation commit only: **nothing was pushed to GitHub and no Vercel production deployment was made**.

## What changed

- **`/my-work`** — a role-aware Action Inbox derived from existing records. No new work-item table and no duplicate register to maintain.
  - Filters: all open, waiting on you, late, due soon, escalated, by register, free-text search.
  - Cards show what is wrong, who owns it, the job, amount, due/late state, status and the allowed next actions.
  - One-click Approve / Reject / Certify / Close / Send back actions with a confirmation toast and automatic queue refresh.
  - Built-in “How decisions work” panel makes the rules and approver roles visible.
- **Dashboard + sidebar** — prominent “My work” card with actionable / late / escalated counts, a sidebar badge, and a mobile bottom-nav entry.
- **12 workflow rule sets** for time sheets, variations, material requests, purchase orders, expenses, leave, submittals, payment certificates, site queries, snag items, incidents and quality faults.
- **Server-side enforcement**
  - `GET /api/[org]/work-items` respects auth, billing, module visibility, RBAC and portal row scope.
  - `POST /api/[org]/work-items/action` resolves an action id — not an arbitrary client-supplied status — checks role, uses optimistic status concurrency, writes an `APPROVE` audit entry and a notification.
  - Generic `PATCH /api/[org]/records/[resource]/[id]` now blocks arbitrary status jumps from a waiting state, so the status dropdown or a direct API call cannot bypass approvals.
  - Drafts and non-pending records remain editable exactly as before.
- **Documentation** now lists My work and explains the guarded approval flow.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| Clean production build | EXIT 0, `/my-work` and both work-items routes compiled |
| `npm run audit:workflow` — static definitions | 29 PASS / 0 FAIL |
| `npm run audit:workflow` — API + browser | 13 PASS / 0 FAIL |
| `npm run audit:topbar` regression | 30 PASS / 0 FAIL |
| `npm run audit:convert` regression | 16 PASS / 0 FAIL |

The workflow QA verified anonymous `401`, queue derivation, overdue/escalation fields, blocked generic `PATCH` bypass, unknown-action `400`, wrong-role `403`, one-click API approval, idempotent second-action `409`, audit + notification, browser one-click approval, rules panel, dashboard CTA and zero browser console errors.

## Live-data hygiene

All throwaway QA records were soft-deleted through the app, then hard-deleted with audits and notifications. Number sequences were restored to their pre-QA values. Final read-only Supabase check: `0` QA records, `0` QA audits, `0` QA notifications, `620` active Kestrel records, sequences `timesheets:82`, `leaveRequests:37`, `estimates:71`, `documents:70`, `clients:170` and the conversion-chain baselines. No env, billing, workspace-setting or business-data changes remain.

## Git

- Local commit: the latest `main` commit, “Add Action Inbox approval workflow” (`git rev-parse HEAD`)
- `origin/main` remains `ffc9d6c58df5c5c5ee67584d56cab57c781ace63`
- Clean worktree, `git diff --check` clean, no QA server and no `/home/user/qa-*.png` files.

## Next decision needed

Push and/or deploy were **not** authorised by “go ahead”, so they were deliberately left undone. Say the word if you want this commit pushed and promoted to production.
