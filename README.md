# BuildOps — Construction & Industrial Company Management

A full-stack, multi-tenant ERP for construction and industrial companies. Register → complete a 5-step onboarding wizard (company **type** + **size** + work-style qualifiers) → the workspace derives its module pack, feature flags and plan limits automatically. Every module is CRUD-complete, persistent, and the seeded demo workspace is alive on first load.

**Live preview:** the app is served on port 3000 (`npm run start` after `npm run build`).

---

## Quick start

```bash
npm install
npx prisma db push          # creates prisma/dev.db (SQLite)
npm run db:seed             # 616 demo records, 7 demo users
npm run dev                 # development server on 0.0.0.0:3000
# or, for a lighter production preview:
npm run build && npm run start
```

`npm run setup` does install + db push + seed + dev in one command. `npm run db:reset` recreates the database from scratch.

### Demo logins (password `Demo@1234`)

| Email | Role | Access |
|---|---|---|
| `owner@kestrelridge.co.zw` | Owner | Everything, including settings |
| `pm@kestrelridge.co.zw` | Project Manager | Delivery, approvals |
| `finance@kestrelridge.co.zw` | Finance Manager | Finance, billing, costing |
| `hr@kestrelridge.co.zw` | HR Manager | People, leave, payroll |
| `safety@kestrelridge.co.zw` | HSE Officer | Safety & quality |
| `procurement@kestrelridge.co.zw` | Procurement | Vendors, POs, stores |
| `client@westgate.co.zw` | Client (portal) | Read-only across the workspace |

The login screen has one-click demo account chips. **Create account** starts a brand-new organisation and the onboarding wizard; ticking "Load realistic demo data" populates that new org too.

---

## What's implemented

### 1 · Authentication & multi-tenancy
- Credentials auth with `bcryptjs` password hashing, opaque HTTP-only session cookies stored in the database, 30-day expiry, logout revocation.
- Registration creates a draft `Organization` + `OWNER` membership; onboarding finalises it.
- Every tenant-owned row carries `organizationId`; all API routes resolve the org from the URL and verify membership via `apiAuth(orgSlug)`. Cross-tenant reads/writes are impossible.
- 14 roles with resource-level write restrictions and delete restrictions; external client/subcontractor roles are read-only (verified by integration tests).
- Invite teammates from Settings with a temporary password.

### 2 · Onboarding → derived modules
`src/lib/catalog.ts` is the single source of truth: 8 company types, 5 company sizes, 11 work-style qualifiers, 33 modules with tiers and resource bundles.

| Type / Size | Modules | Resources | Plan |
|---|---|---|---|
| General contractor · Micro | 19 | 35 | Starter |
| Specialty trade · Small | 21 | 37 | Growth |
| General contractor · Mid | 28 | 46 | Professional |
| Industrial EPC · Large | 29 | 47 | Business |
| Mixed group · Enterprise | 33 | 49 | Enterprise |

`resolveWorkspace()` returns `{ modules, resources, flags, limits, localePack, plan }`. It drives the sidebar, API route guards, the command palette, Settings → Modules, and the review screen of the wizard. Owners can toggle any module at any time, or re-run the derivation in Settings → Company profile.

### 3 · 49 resources / 33 modules (full CRUD)
Declarative registry in `src/lib/resources.ts` — one definition drives the API, validation, list table, detail drawer, create/edit form, filters, CSV export, reference lookups and command-palette search.

- **Win work:** clients, contacts, leads/opportunities, estimates, bids
- **Project delivery:** projects, tasks/WBS, contracts, change orders, RFIs, submittals, documents & drawings, daily site logs, meetings, punch lists, permits
- **Supply chain:** vendors, subcontractors, requisitions, purchase orders, GRNs, inventory, warehouses, equipment/fleet, maintenance work orders
- **People & HR:** employees, departments, crews, timesheets, leave, pay runs, expenses, certifications, training
- **Safety & quality:** toolbox talks/JSA, incidents, HSE inspections, NCRs, ITPs
- **Finance:** chart of accounts, journals, budgets/CVR, client invoices, progress payment certificates & retention, supplier bills, payments/receipts
- **Specialised:** units/plots & sales, rental contracts & dispatch, commissioning packages

Each record has a numbered sequence (`PRJ-0001`…), status workflow, project scoping, soft delete, comments, and an audit-log entry on every write.

### 4 · UI / UX
- Collapsible grouped sidebar generated from enabled modules, org switcher, top bar with global search (⌘K), quick-create, notifications, theme toggle, avatar menu; mobile drawer + bottom tab bar.
- Generic data table: debounced search, status/project filters, sortable columns, pagination, bulk select/delete, CSV export, inline optimistic status changes, row detail drawers with comments.
- **Optimistic updates:** `onMutate` patches the React Query cache for create/update/delete/bulk, rolls back with an error toast on failure, invalidates related queries on settle.
- Skeleton loaders on every list/detail/chart, illustrated empty states with CTAs, error states with retry, dark mode, responsive tables, progress bars, SVG charts (bars, donut, sparkline).
- Dashboards: executive KPIs, revenue trend, cost mix, project health, attention queue, audit activity, record counts.
- Project 360 page with 7 tabs (overview, schedule, commercial, documents/RFIs, site ops, HSE/quality, team & plant), each showing live project-filtered registers.
- Reports & BI: 22 canned reports with live row counts, custom report builder, CSV export.
- Settings: company details, module manager, users/roles, re-derivation, CSV import, demo loader, clear data, feature flags, plan limits, audit log.

### 5 · Regional pack (ZW / Southern Africa)
USD + ZWG, 15% VAT, tax invoice numbering, FIDIC / NEC4 / JBCC / AIA contract forms, NSSA & PAYE concepts, interim payment certificates with retention and advance recoupment, Zimbabwean client/vendor/site names and demo place names (Borrowdale, Pomona, Mutare–Nyanga).

### 6 · File attachments & PDF documents
- Real multipart uploads (12 MB limit) stored under `uploads/<orgId>` (or `UPLOAD_ROOT`); metadata in the relational `Attachment` table, org-scoped and permission-checked.
- Every record detail drawer has an **Attachments** panel: upload multiple files, image thumbnails, open/download, delete, with uploader and timestamp.
- **Download PDF** on every record: a branded A4 PDF built server-side with `pdf-lib` — company header, document number/date/status, all populated fields, an amount summary for financial records, and page footers. Ideal for tax invoices, payment certificates, POs, estimates and signed change orders.
- Three sample PDF attachments are seeded so the panel is populated on first load.

### 7 · Deployment-ready
`Dockerfile`, `render.yaml`, `.dockerignore`, `.env.example`, `scripts/prod-start.mjs` (schema + optional seed + serve), `scripts/switch-provider.mjs` (SQLite → Postgres), and a committed git repo. See **[DEPLOY.md](DEPLOY.md)**.

### 8 · Demo dataset
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
    catalog.ts      module catalogue + resolveWorkspace() + RBAC
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
                      Record, Comment, AuditLog, Notification, Sequence
scripts/seed.ts       CLI seed
```

**Storage design:** authentication, tenancy, audit, notifications, comments and sequences are fully relational Prisma models. Domain resources use a typed JSON-document `Record` table (with indexed `resource`, `status`, `projectId`, `title` and `number` columns) plus the declarative registry. This lets all 49 resources share one validated CRUD engine, filtering, export and form renderer while remaining fully persistent in SQLite. Swapping to per-resource relational tables or Postgres later only touches `records.ts` / `schema.prisma`.

**API:** uniform `/api/[org]/...` REST routes, `{ data, meta, error }` envelopes, Zod-style field validation from the registry, server-side permission checks, CSV export endpoint, global search endpoint.

---

## Verification performed

- `npx tsc --noEmit` — clean; `npm run build` — clean production build.
- End-to-end: login, page renders, list/detail/search/CSV, create → read → update → comment → delete → soft-delete 404, validation rejection, project-scoped filtering, bulk delete.
- Settings: module toggle on/off, invite, org update, derivation re-run.
- RBAC: portal role can read but gets `403` on create/delete.
- Onboarding: register → draft org → 5-step wizard → derived 27-module pack for a small specialty trade → demo data loaded into new org → disabled module route returns `403`.

---

## Notes / deliberately simplified

- Deep domain engines (critical-path CPM scheduling, a full statutory payroll engine, BIM/telematics integrations, e-signature, offline sync) are represented as usable registers, workflows and settings rather than full external systems — but nothing is a dead stub: every screen has real create/edit/delete, relationships and seed data.
- File uploads now store real binaries locally; on serverless hosts swap the two storage helpers for S3/R2 (the `Attachment` metadata model is already there).
- SQLite WAL mode handles the demo workload; set `DATABASE_URL` to a Postgres URL and change the provider in `schema.prisma` for production deployments.
