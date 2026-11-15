# Workability pass — 2026-11-15 (authenticated as test OWNER, `arena-test-builders-mwc62z1t`)

Method: magic-link (admin-generated, no email sent) browser session against production
(`app.myla.co.zw`, deployment at the time `dpl_8hrvUUHGdAo4M9dab1zDH49bypXN`). Every
sidebar destination for this org was visited headlessly at 1440×900; HTTP status, console
errors, page errors and failed requests were captured; screenshots in
`/home/user/artifacts/workability/` (not committed). No writes were made — read-only pass.
Harness: `/home/user/workability-pass.mjs`, results `/home/user/workability-pass-results.json`.

## What works (verified live, zero console/page errors)
| Surface | Status | Notes |
|---|---|---|
| Dashboard | 200, clean | Rich, live figures (jobs running 2, invoiced US$46.2k, chart) |
| All 19 list registers discovered from the sidebar | 200, clean | incl. Clients, Quotes, Projects, Invoices, Payments, Timesheets, Accounts, Journals, AP/AR, Contracts, Change orders, Leads/Bids, Contacts, Crews, Departments, Employees, Tasks |
| Reports / Profitability / Wallets / Library / Settings / Billing / My work / Documentation / Support / Quote Studio | 200, clean | All render fully with real data |
| Billing trial banner, pricing (USD 6/14/26), visual design | consistent | Starter pack appropriate |
| `?_rsc=` ERR_ABORTED entries | benign | Next.js Link prefetch cancellations, not failures |

## Findings
1. **Ref columns flash raw truncated ids before labels resolve** (e.g. invoice list Client
   `5dc7f337`, Projects list Client `ffd365c3`, estimates list). Labels do resolve (API
   `mode=refs&ids=` returns 200 with correct names; verified in browser after network idle).
   Fix applied: while the ref label lookups are in flight, ref cells render a muted
   placeholder instead of the id tail (`src/components/ResourceTable.tsx`). Hex tail still
   shown as fallback only when lookups have settled and the referenced record is gone.
2. **`/three-way-match` returns a bare 404** for this org. Intentional server-side gate
   (`requirePageModule`, disabled-module → `notFound()`); the sidebar hides the link, and the
   API guard returns the same for a direct hit. Consistent with the app's other disabled
   sections — but a bare 404 is unfriendly; a "This section is switched off" page would be
   kinder. Left unchanged (app-wide design decision, not for a drive-by edit).
3. No crashes, no blank screens, no client exceptions anywhere visited.

## Open / noted (not bugs, needs owner or next pass)
- Ref labels flash is fixed in code pending deploy+verify; on very slow links the
  placeholder will now show instead of hex.
- Toast/forms/drawers and full write flows were exercised in earlier Round-2 passes, not
  repeated here. RecordForm dropdowns fetch options similarly and may flash ids briefly.
- Documentation page renders fully (22k chars) — content review not part of this pass.
- Tester feedback form (`TESTER_FEEDBACK.md`) is still blank — this automated pass is not a
  substitute for a human run-through (date entry, keyboard/calendar, Turnstile) before
  inviting external testers.

## Deploy status
- Commit with the Cell fix: see git history (this file committed in the same change).
- Production deployment created via Vercel API (push does not deploy); verify READY/PROMOTED
  and re-shoot `list-arinvoices` / `list-projects` before claiming the fix is live.
