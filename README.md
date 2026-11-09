# BuildOps — Construction & Industrial Company Management

A full-stack, multi-tenant ERP for construction and industrial companies. Register → complete a 5-step onboarding wizard (company **type** + **size** + work-style qualifiers) → the workspace derives its module pack, feature flags and plan limits automatically. Every enabled module is CRUD-complete and connected. The seeded demo workspace is alive on first load. Client wallets, a Postgres-enforced 14-role permission matrix and live cross-module link integrity checks are built in.

**Backend:** Supabase is the server — Postgres (RLS), Auth (JWT), Storage (private bucket) and SECURITY DEFINER RPCs. Next.js renders the UI and hosts thin route handlers. Prisma, SQLite, bcrypt and local-disk uploads are retired. See **[SUPABASE.md](SUPABASE.md)** for the full migration runbook.

**Live preview:** the app is served on port 3000 (`npm run start` after `npm run build`).

---

## Quick start

```bash
npm install
cp .env.example .env        # paste your Supabase URL, anon key and service-role key
npm run env:check
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push         # applies supabase/migrations/0001 → 0005
npm run db:seed              # 7 Auth users, 616 demo records, 6 wallets, 4 sample PDFs
npm run dev                  # development server on 0.0.0.0:3000
# or: npm run build && npm run start
```

For a local Supabase stack instead of a hosted project: `npm run db:local` (needs Docker). `npm run db:reset` resets the local database and re-seeds. `.env` is ignored by Git and Docker — see [`ENV_KEYS.md`](ENV_KEYS.md), [`.env.example`](.env.example) and [`SUPABASE.md`](SUPABASE.md).

> Without keys the app still builds and renders a setup notice on `/login`; sign-in stays disabled until the project is connected and migrations applied.

### Environment & API keys

| Variable | Exposure | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `...PUBLISHABLE_KEY`) | public | Browser/Server client key, protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) | **server only** | Registration, invites, seeding, migrations |
| `SUPABASE_STORAGE_BUCKET` | server only | Private bucket (`buildops-documents`) |

- `npm run env:init` creates `.env` from the template without overwriting it.
- `npm run env:check` validates required values, tracked secrets and public/private key mistakes without printing values.
- Sections 3–10 of `.env.example` are named slots for optional connectors (email, SMS, payments, maps, SSO, accounting, webhooks, monitoring, AI). They are not wired yet.

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

The login screen has one-click demo account chips. **Create account** starts a brand-new Supabase Auth user + organisation and the onboarding wizard; ticking "Load realistic demo data" populates that new org too.

---

## What's implemented

### 1 · Authentication & multi-tenancy
- Supabase Auth (`signInWithPassword`), JWT cookies managed by `@supabase/ssr` and refreshed in middleware. No custom session table, no bcrypt.
- Registration creates the Auth user, a draft `organizations` row and an `OWNER` membership; onboarding finalises it.
- Every tenant-owned row carries `organization_id`; RLS resolves the caller's orgs from `memberships` using `auth.uid()`. Cross-tenant reads/writes are impossible at the database level.
- 14 roles governed by one `ROLE_RULES` matrix (per-resource read/write denylists, delete rights, 16 capabilities, row-level scoping for external users). The matrix is compiled into Postgres RLS by `scripts/gen-supabase-rbac.py`; `guard.ts` remains only as a friendly pre-flight check. See `WALLETS_AND_RBAC.md`.
- Owners/admins can change roles, pin portal users to a client and remove members from Settings → Users & roles. A Postgres trigger prevents removing/demoting the last owner.
- Invite teammates from Settings (creates a Supabase Auth user with a temporary password).

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

`resolveWorkspace()` returns `{ modules, resources, flags, limits, localePack, plan }` and drives the sidebar, RLS module switches, command palette, Settings → Modules and the wizard review screen.

### 3 · Client wallets
One prepaid `wallets` row per client with an append-only `wallet_transactions` ledger (integer cents, no float drift). Owners/admins/finance managers top up; those roles and client-portal users allocate funds to a project belonging to **that same client**. Corrections are `REVERSAL` entries — the ledger has no direct client write policy at all; money moves only through `app_wallet_topup` / `app_wallet_allocate` / `app_wallet_reverse`. Balances are mirrored into the Clients register (`walletBalance`), the Projects register (`fundedAmount`, `remainingToFund`), dashboard KPIs, project 360 and the client detail drawer. Idempotency keys stop double submissions; `/api/[org]/integrity` reconciles ledger, balances and derived figures.

### 4 · Role-level access & link integrity
`src/lib/catalog.ts` → `ROLE_RULES` is the single source of truth for 14 roles. `supabase/migrations/0003_rbac.sql` (generated) turns it into Postgres helper functions and RLS policies on all 12 tables. `CLIENT_EXTERNAL` sees only its pinned client, that client's projects and records linked to them; `SUBCONTRACTOR_EXTERNAL` sees only its own contracts/submittals and their projects. Settings → Users & roles shows the full matrix, and Settings → Plan & audit runs a live link-integrity check.

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
- Skeleton loaders on every list/detail/chart, illustrated empty states with CTAs, error states with retry, dark mode, responsive tables, progress bars, SVG charts.
- Dashboards: executive KPIs, revenue trend, cost mix, project health, attention queue, audit activity, record counts.
- Project 360 page with 7 tabs (overview, schedule, commercial, documents/RFIs, site ops, HSE/quality, team & plant).
- Reports & BI: 22 canned reports with live row counts, custom report builder, CSV export.
- Settings: company details, module manager, users/roles, re-derivation, CSV import, demo loader, clear data, feature flags, plan limits, audit log.

### 7 · Regional pack (ZW / Southern Africa)
USD + ZWG, 15% VAT, tax invoice numbering, FIDIC / NEC4 / JBCC / AIA contract forms, NSSA & PAYE concepts, interim payment certificates with retention and advance recoupment, Zimbabwean client/vendor/site names and demo place names (Borrowdale, Pomona, Mutare–Nyanga).

### 8 · File attachments & PDF documents
- Real multipart uploads (12 MB limit) into the private `buildops-documents` Supabase Storage bucket; metadata in `public.attachments` (Postgres) with RLS. Object paths are `<org-uuid>/<record-id>/<uuid>-<file>` and the Storage policies resolve the owning record from that path.
- **Revision history**: uploading a "New revision" supersedes the previous version, auto-labels it `Rev A → Rev B → Rev C`, keeps every old file downloadable, records an optional note, and promotes the prior revision back to current if the latest is deleted.
- Every record detail drawer has an **Attachments & revisions** panel: multi-file upload, image thumbnails, current-revision badge, expandable superseded history, open/download, delete.
- **Download PDF** on every record: a branded A4 PDF built server-side with `pdf-lib`.
- Four sample PDF attachments across three revision chains are seeded so the panel is populated on first load.

### 9 · Deployment-ready
`Dockerfile`, `render.yaml`, `.dockerignore`, `.env.example`, `ENV_KEYS.md`, `scripts/prod-start.mjs`, `scripts/ensure-env.mjs` / `scripts/check-env.mjs`, `supabase/config.toml` and the committed migrations. No SQLite file and no disk volume. See **[DEPLOY.md](DEPLOY.md)** and **[RENDER_DEPLOY.md](RENDER_DEPLOY.md)**.

### 10 · Demo dataset
616 reconciled records for **Kestrel Ridge Construction & Industrial Group**: 5 projects (3 live, 1 complete, 1 bid), 9 clients, 42 employees, 14 vendors/subcontractors, 28 plant assets, 16 POs, 14 invoices, 8 payment certificates, 16 supplier bills, 40 timesheets, 18 RFIs, 12 change orders, safety incidents, inspections, NCRs, certifications with expiry alerts, stock, units and commissioning packages — plus notifications, audit trail and comments.

---

## Architecture

```
supabase/
  config.toml                  CLI project config
  seed.sql                     intentionally empty (Auth users go through GoTrue)
  migrations/
    0001_extensions.sql        pgcrypto, uuid-ossp, updated_at()
    0002_schema.sql            12 tables, indexes, FKs, auth.users sync trigger
    0003_rbac.sql              GENERATED: 14-role helpers + RLS on all tables
    0004_storage.sql           private bucket + storage.objects policies
    0005_functions.sql         wallet/sequence/audit/notification RPCs
src/
  app/
    login, onboarding
    [org]/ dashboard, m/[resource], projects/[id], reports, settings, wallets
    api/   auth/*, onboarding, [org]/{meta,overview,search,projects/[id],
           records/[resource]/..., files/..., wallets/..., settings, integrity, pdf/...}
  lib/
    supabase.ts     cookie-bound RLS client + service-role client
    auth.ts         Supabase Auth sessions, memberships, org resolution
    fetch.ts        paged PostgREST reads (1000-row cap)
    records.ts      validated CRUD, numbering, soft delete, audit RPC
    queries.ts      aggregate helpers
    access.ts       portal-scope mirror of app_visible_record
    wallets.ts      wallet reads + RPC calls
    views.ts        snake_case → camelCase JSON the UI expects
    files.ts        Storage path/bucket conventions
    seed-data.ts    shared demo payload (records, wallets, PDFs)
    seed-service.ts CLI + Settings demo loader
    catalog.ts      module catalogue + resolveWorkspace() + ROLE_RULES
    resources.ts    49 declarative resource definitions
    guard.ts        friendly pre-flight guards (RLS is the authority)
  components/       AppShell, ResourceTable, RecordForm, RecordDetail,
                    Charts, ui primitives, Providers, AuthScreen, OnboardingWizard
  middleware.ts     Supabase JWT refresh
scripts/
  seed-supabase.ts  CLI seed (Auth users + org + 616 records + wallets + PDFs)
  gen-supabase-rbac.py  regenerates 0003_rbac.sql from ROLE_RULES
  check-env.mjs / ensure-env.mjs / prod-start.mjs
  audit*.py / audit*.ts / browser-audit.mjs
```

**Storage design:** domain resources live in one org-scoped JSONB `records` table (with indexed `resource`, `status`, `project_id`, `title` and `number` columns) plus the declarative registry. This lets all 49 resources share one validated CRUD engine, filtering, export and form renderer while remaining fully persistent in Postgres. Auth, tenancy, audit, notifications, comments, sequences, attachments and wallets are relational tables with RLS.

**API:** uniform `/api/[org]/...` REST routes; every route uses the caller's cookie-bound Supabase client so RLS is enforced; privileged one-shot operations (numbering, audit, notifications, money) go through SECURITY DEFINER RPCs.

---

## Verification performed (this change)

- `npx tsc --noEmit` — clean.
- `npm run build` — clean production build (one harmless Edge Runtime warning from `@supabase/ssr`; see SUPABASE.md).
- `npm run env:check` — validates Supabase slots without printing secrets.
- `npx supabase db push`, `npm run db:seed`, the 1211-check HTTP audit and the 28-check Chromium audit **have not been run against Supabase** — they require a live project and keys. The historical results in `AUDIT_REPORT.md` / `BROWSER_AUDIT_REPORT.md` describe the pre-Supabase SQLite build and must be re-run before being treated as current.

---

## Notes / deliberately simplified

- Deep domain engines (critical-path CPM scheduling, a full statutory payroll engine, BIM/telematics integrations, e-signature, offline sync) are represented as usable registers, workflows and settings rather than full external systems — but nothing is a dead stub: every screen has real create/edit/delete, relationships and seed data.
- Optional integration slots in `.env.example` are reserved; they are not read by the app until the connector is wired.
- Email confirmation should be disabled (or SMTP configured) on the Supabase project so registration returns a session immediately.
