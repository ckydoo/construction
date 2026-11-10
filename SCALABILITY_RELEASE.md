# Project detail & larger-data release

**Date:** 2026-11-07 (Africa/Harare) · **Status:** code complete, verified locally; production rollout recorded in `PRODUCTION_DEPLOYMENT.md`.

## What changed

### 1. Projects open as a full page, never a side drawer
- Clicking a row in **Jobs & projects**, using the row's **open full project page** action, or following a search / linked-record `?open=` link now goes to `/{org}/projects/{id}`.
- The full page keeps all eight sections: Overview, Schedule, Commercial, Documents & RFIs, Site ops, HSE & quality, Team & plant, and the new **Record & files** tab.
- **Record & files** brings the complete record fields, linked modules, comments and document revisions inline — the information that used to be trapped in the drawer — with the PDF action.
- The right-side `RecordDetail` drawer remains for non-project registers; it is no longer used for projects.

### 2. Searchable dropdowns for large registers
- New `src/components/SearchSelect.tsx`: an accessible combobox with keyboard navigation, clear, selection resolution, debounced server search, and a portalled dropdown that is not clipped by drawers or tables.
- Every `ref` field in `RecordForm` uses it, as does the **Filter by project** control on project-scoped registers.
- `mode=refs` now accepts `q`, `limit` and `ids`; it returns only a bounded page of matches and resolves labels for IDs already on screen. Search text is sanitised before it reaches PostgREST.

### 3. Database does the heavy lifting
- `listRecords` now pushes status/project filters, full-text-ish search, sorting, exact `count`, and the requested page window into Postgres instead of fetching every row and slicing in Node.
- Search uses a maintained lowercase `search_text` column with trigram GIN indexes; title/number trigram indexes and composite org/resource/created/project indexes were added.
- Global search, reverse links, scope derivation and the project 360 API now query only matching rows. Project 360 and related-list queries are filtered by project at the database.
- Additive, idempotent migrations: `supabase/migrations/20261109131300_records_search_indexes.sql` and `20261109131310_records_ref_indexes.sql`. No resource IDs, routes, APIs, RBAC rules, validation rules, auth settings or secrets changed.

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit` / `npm run build` | pass |
| `npm run audit` | **1211/1211 API checks + CORE AUDIT PASSED 22/22** |
| `npm run audit:browser` | **28/28** real-Chromium checks, 0 unexpected errors |
| `node scripts/design-qa.mjs` | **15/15** across 55 routes / five viewports |
| `npm run audit:onboarding` | **10/10**, QA organisations/users cleaned up `0/0` |
| `npm run audit:projects` | **8/8** dedicated project-detail / searchable-dropdown checks |
| `npm run env:check` | OK, no secret values printed |
| Live integrity | `ok:true`, 616 records, 1627 refs, 0 broken refs, 0 wallet/funding mismatches |
| Wallets | `$11,000,000` total balance preserved |
| Client portal scoping | 1 project, 1 client, 1 wallet; no admin data exposed |

Dedicated evidence: `PROJECT_SCALE_AUDIT_REPORT.md`, `screenshots/project-detail-full-page.png`, `screenshots/project-detail-record-files.png`, `screenshots/project-searchable-dropdown.png`, `screenshots/project-searchable-filter.png`.
