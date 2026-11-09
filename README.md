# BuildOps — Construction & Industrial Company Management

A full-stack, multi-tenant ERP for construction and industrial companies. Register → complete a 5-step onboarding wizard (company **type** + **size** + work-style qualifiers) → the workspace derives its module pack, feature flags and plan limits automatically. Every module is CRUD-complete, persistent, and the seeded demo workspace is alive on first load. Client wallets, a server-enforced 14-role permission matrix and live cross-module link integrity checks are built in.

**Live preview:** the app is served on port 3000 (`npm run start` after `npm run build`).

---

## Quick start

```bash
npm install
cp .env.example .env        # fill in Supabase / API keys (optional for local SQLite)
npm run env:check
npm run db:push             # creates prisma/dev.db (SQLite)
npm run db:seed             # 616 demo records, 7 demo users
npm run dev                 # development server on 0.0.0.0:3000
# or, for a lighter production preview:
npm run build && npm run start
```

`npm run setup` does all of that in one command and creates `.env` from the template if it is missing. `npm run db:reset` recreates the database from scratch. **`.env` is ignored by Git and Docker** — see [`ENV_KEYS.md`](ENV_KEYS.md) and [`.env.example`](.env.example) for every Supabase and integration key.

### Environment & API keys

- `npm run env:init` — create `.env` from `.env.example` without overwriting an existing one.
- `npm run env:check` — validate required values, provider/URL mismatches, tracked secrets and public/private key mistakes, without printing values.
- Supabase: project URL + anon/publishable key are public; **service-role/secret keys and DB passwords stay server-side**. Add them to `.env` (or Render environment), never to `NEXT_PUBLIC_*`.
- Sections 2–10 of `.env.example` are named slots for optional connectors (storage, email, SMS, payments, maps, SSO, accounting, webhooks, monitoring, AI). They are not read by the current code until the integration is wired.

### Demo logins (password `Demo@1234`)

| Email | Role | Access |
|---|---|---|
| `owner@kestrelridge.co.zw` | Owner | Everything, including settings |
| `pm@kestrelridge.co.zw` | Project Manager | Delivery, approvals |
| `finance@kestrelridge.co.zw` | Finance Manager | Finance, billing, costing |
| `hr@kestrelridge.co.zw` | HR Manager | People, leave, payroll |
| `safety@kestrelridge.co.zw` | HSE Officer | Safety & quality |
| `procurement@kestrelridge.co.zw` | Procurement | Vendors, POs, stores |
| `client@westgate.co.zw` | Client (portal) | Westgate's own projects, invoices and wallet; can fund its own projects |

The login screen has one-click demo account chips. **Create account** starts a brand-new organisation and the onboarding wizard; ticking "Load realistic demo data" populates that new org too.

---

## What's implemented

### 1 · Authentication & multi-tenancy
- Credentials auth with `bcryptjs` password hashing, opaque HTTP-only session cookies stored in the database, 30-day expiry, logout revocation.
- Registration creates a draft `Organization` + `OWNER` membership; onboarding finalises it.
- Every tenant-owned row carries `organizationId`; all API routes resolve the org from the URL and verify membership via `apiAuth(orgSlug)`. Cross-tenant reads/writes are impossible.
- 14 roles governed by one `ROLE_RULES` matrix (per-resource read/write denylists, delete rights, 16 capabilities, row-level scoping for external users). Enforced on every API route, the sidebar, forms and settings; see `WALLETS_AND_RBAC.md`.
- Owners/admins can change roles, pin portal users to a client and remove members from Settings → Users & roles. The last owner cannot be removed or demoted.
- Invite teammates from Settings with a temporary password.

### 2 · Onboarding → derived modules (essentials first)
New workspaces start with **13 connected essentials** (clients → leads → estimates & bids → projects → contracts → documents → invoices → payments → client wallets, plus people and reporting). Company type, size, qualifiers and optional add-ons then layer on more modules: MICRO 13, SMALL 13, MID 17, LARGE 29–30, ENTERPRISE 30 (mixed group 33). Everything can be switched on later in **Settings → Modules**, which also has one-click Essentials / All-modules focus switching.
`src/lib/catalog.ts` is the single source of truth: 8 company types, 5 company sizes, 11 work-style qualifiers, 34 modules with tiers and resource bundles.

| Type / Size | Modules | Resources | Plan |
|---|---|---|---|
| General contractor · Micro | 13 | 19 | Starter |
| Specialty trade · Small | 13 | 19 | Growth |
| General contractor · Mid | 17 | 28 | Professional |
| Industrial EPC · Large | 30 | 47 | Business |
| Mixed group · Enterprise | 33 | 49 | Enterprise |

`resolveWorkspace()` returns `{ modules, resources, flags, limits, localePack, plan }`. It drives the sidebar, API route guards, the command palette, Settings → Modules, and the review screen of the wizard. Owners can toggle any module at any time, or re-run the derivation in Settings → Company profile.

### 3 · Client wallets
One prepaid `Wallet` per client with an append-only `WalletTransaction` ledger (integer cents, no float drift). Owners/admins/finance managers top up; those roles and client-portal users allocate funds to a project belonging to **that same client**. Corrections are `REVERSAL` entries — ledger rows can never be edited or deleted. Balances are mirrored into the Clients register (`walletBalance`), the Projects register (`fundedAmount`, `remainingToFund`), dashboard KPIs, project 360 and the client detail drawer. Idempotency keys stop double submissions; `/api/[org]/integrity` reconciles ledger, balances and derived figures.

### 4 · Role-level access & link integrity
`src/lib/catalog.ts` → `ROLE_RULES` is the single source of truth for 14 roles: per-resource read/write denylists, delete rights, capabilities (`wallet.topup`, `wallet.allocate`, `wallet.refund`, `users.manage`, `integrity`, …) and row scoping. `guard.ts` + `access.ts` apply it to records, files, PDFs, comments, search, overview, meta, project 360, settings and wallets. External portal users are pinned to one client via `Membership.entityId` and see only that client's records, projects and wallet. Settings → Users & roles shows the full matrix, allows role changes/client scoping/removal, and Settings → Plan & audit runs a live link-integrity check. Details: `WALLETS_AND_RBAC.md`.

### 5 · 49 resources / 34 modules (full CRUD)
Declarative registry in `src/lib/resources.ts` — one definition drives the API, validation, list table, detail drawer, create/edit form, filters, CSV export, reference lookups and command-palette search.

- **Win work:** clients, contacts, leads/opportunities, estimates, bids
- **Project delivery:** projects, tasks/WBS, contracts, change orders, RFIs, submittals, documents & drawings, daily site logs, meetings, punch lists, permits
- **Supply chain:** vendors, subcontractors, requisitions, purchase orders, GRNs, inventory, warehouses, equipment/fleet, maintenance work orders
- **People & HR:** employees, departments, crews, timesheets, leave, pay runs, expenses, certifications, training
- **Safety & quality:** toolbox talks/JSA, incidents, HSE inspections, NCRs, ITPs
- **Finance:** chart of accounts, journals, budgets/CVR, client invoices, progress payment certificates & retention, supplier bills, payments/receipts
- **Specialised:** units/plots & sales, rental contracts & dispatch, commissioning packages

Each record has a numbered sequence (`PRJ-0001`…), status workflow, project scoping, soft delete, comments, and an audit-log entry on every write.

### 6 · UI / UX
- Collapsible grouped sidebar generated from enabled modules, org switcher, top bar with global search (⌘K), quick-create, notifications, theme toggle, avatar menu; mobile drawer + bottom tab bar.
- Generic data table: debounced search, status/project filters, sortable columns, pagination, bulk select/delete, CSV export, inline optimistic status changes, row detail drawers with comments.
- **Optimistic updates:** `onMutate` patches the React Query cache for create/update/delete/bulk, rolls back with an error toast on failure, invalidates related queries on settle.
- Skeleton loaders on every list/detail/chart, illustrated empty states with CTAs, error states with retry, dark mode, responsive tables, progress bars, SVG charts (bars, donut, sparkline).
- Dashboards: executive KPIs, revenue trend, cost mix, project health, attention queue, audit activity, record counts.
- Project 360 page with 7 tabs (overview, schedule, commercial, documents/RFIs, site ops, HSE/quality, team & plant), each showing live project-filtered registers.
- Reports & BI: 22 canned reports with live row counts, custom report builder, CSV export.
- Settings: company details, module manager, users/roles, re-derivation, CSV import, demo loader, clear data, feature flags, plan limits, audit log.

### 7 · Regional pack (ZW / Southern Africa)
USD + ZWG, 15% VAT, tax invoice numbering, FIDIC / NEC4 / JBCC / AIA contract forms, NSSA & PAYE concepts, interim payment certificates with retention and advance recoupment, Zimbabwean client/vendor/site names and demo place names (Borrowdale, Pomona, Mutare–Nyanga).

### 8 · File attachments & PDF documents
- Real multipart uploads (12 MB limit) stored under `uploads/<orgId>` (or `UPLOAD_ROOT`); metadata in the relational `Attachment` table, org-scoped and permission-checked.
- **Revision history**: uploading a "New revision" on any attached drawing supersedes the previous version, auto-labels it `Rev A → Rev B → Rev C`, keeps every old file downloadable, records an optional revision note, and promotes the prior revision back to current if the latest is deleted.
- Every record detail drawer has an **Attachments & revisions** panel: multi-file upload, image thumbnails, current-revision badge, expandable superseded history, open/download, delete.
- **Download PDF** on every record: a branded A4 PDF built server-side with `pdf-lib` — company header, document number/date/status, all populated fields, an amount summary, certification/payment blocks and signature lines for tax invoices and interim payment certificates, and page footers.
- Four sample PDF attachments across three revision chains are seeded so the panel is populated on first load.

### 9 · Deployment-ready
`Dockerfile`, `render.yaml`, `.dockerignore`, `.env.example`, `ENV_KEYS.md`, `scripts/prod-start.mjs` (schema + optional seed + serve), `scripts/ensure-env.mjs` / `scripts/check-env.mjs`, `scripts/switch-provider.mjs` (SQLite → Postgres/Supabase), and a committed git repo. See **[DEPLOY.md](DEPLOY.md)**.

### 10 · Demo dataset
616 reconciled records for **Kestrel Ridge Construction & Industrial Group**: 5 projects (3 live, 1 complete, 1 bid), 9 clients, 42 employees, 14 vendors/subcontractors, 28 plant assets, 16 POs, 14 invoices, 8 payment certificates, 16 supplier bills, 40 timesheets, 18 RFIs, 12 change orders, safety incidents, inspections, NCRs, certifications with expiry alerts, stock, units and commissioning packages — plus notifications, audit trail and comments.

---

## Architecture

```
src/
  app/
    (auth) login, register (AuthScreen)     onboarding wizard
    [org]/ dashboard, m/[resource], projects/[id], reports, settings
    api/   auth/*, onboarding, [org]/{meta,overview,search,projects/[id],
           records/[resource]/[id], records/[resource]/bulk, settings}
  lib/
    catalog.ts      module catalogue + resolveWorkspace() + ROLE_RULES
    access.ts       row-level scoping for portal roles
    guard.ts        shared module + role + capability guards
    wallets.ts      wallet ledger service and derived-figure mirroring
    resources.ts    49 declarative resource definitions
    records.ts      validated CRUD service, numbering, soft delete, audit
    demo.ts         deterministic demo data generator
    seed-service.ts shared seeding for CLI + onboarding + settings
    auth.ts         sessions, cookies, org scoping helpers
    db.ts           Prisma singleton
    queries.ts      aggregate helpers
  components/       AppShell, ResourceTable, RecordForm, RecordDetail,
                    Charts, ui primitives, Providers, AuthScreen, OnboardingWizard
prisma/schema.prisma  Organization, User, Membership, Session, Invitation,
                      Record, Comment, AuditLog, Notification, Sequence,
                      Wallet, WalletTransaction
scripts/seed.ts       CLI seed
```

**Storage design:** authentication, tenancy, audit, notifications, comments and sequences are fully relational Prisma models. Domain resources use a typed JSON-document `Record` table (with indexed `resource`, `status`, `projectId`, `title` and `number` columns) plus the declarative registry. This lets all 49 resources share one validated CRUD engine, filtering, export and form renderer while remaining fully persistent in SQLite. Swapping to per-resource relational tables or Postgres later only touches `records.ts` / `schema.prisma`.

**API:** uniform `/api/[org]/...` REST routes, `{ data, meta, error }` envelopes, Zod-style field validation from the registry, server-side permission checks, CSV export endpoint, global search endpoint.

---

## Verification performed

- `npx tsc --noEmit` — clean; `npm run build` — clean production build.
- `npm run audit` — **1211/1211 HTTP checks** (49 resources, 34 modules, 14 real provisioned roles, wallet ledger, link integrity and two real tenants) plus **22/22 derivation checks**. Writes `AUDIT_REPORT.md` / `AUDIT_REPORT.json`.
- `npm run audit:browser` — **28/28 real-Chromium checks**, 0 uncaught page errors, 0 unexpected console errors. Covers hydration, SPA navigation, skeletons, empty states, optimistic create/rollback, drawers, comments, uploads/PDF, partial edit, validation, filters, CSV, dark mode, ⌘K, mobile layout, UI delete, wallet top-up/funding/reversal, linked records, the role matrix and portal scoping. Writes `BROWSER_AUDIT_REPORT.md` + 16 screenshots.
- `npm run audit:all` runs both suites. See `AUDIT_REPORT.md` and `BROWSER_AUDIT_REPORT.md`.

---

## Notes / deliberately simplified

- Deep domain engines (critical-path CPM scheduling, a full statutory payroll engine, BIM/telematics integrations, e-signature, offline sync) are represented as usable registers, workflows and settings rather than full external systems — but nothing is a dead stub: every screen has real create/edit/delete, relationships and seed data.
- File uploads now store real binaries locally; on serverless hosts swap the two storage helpers for S3/R2 (the `Attachment` metadata model is already there).
- SQLite WAL mode handles the demo workload; set `DATABASE_URL` to a Postgres/Supabase URL, run `npm run db:postgres`, and change the provider in `schema.prisma` for production deployments. All keys belong in the ignored `.env`; see `ENV_KEYS.md`.
