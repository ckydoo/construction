# Client wallets & role-level access

BuildOps now has a prepaid **client wallet** that is wired into the commercial chain, and a single
server-enforced **role matrix** that governs every endpoint and every screen.

---

## 1. Client wallet

### Data model

| Model | Purpose |
|---|---|
| `Wallet` | One row per `(organizationId, clientId)`. Holds `balanceCents` (integer, cached from the ledger) and the org's base currency. |
| `WalletTransaction` | Append-only ledger: `TOPUP` (+), `ALLOCATION` (−), `REVERSAL` (±). Stores running `balanceCents`, project, reference, method, note, actor, `idempotencyKey`, `reversesId` and `reversedAt`. |

Money is stored in **integer cents**, so balances never drift. The ledger is the source of truth;
`Wallet.balanceCents` is a reconciled cache checked by `/api/[org]/integrity`.

### The flow

```
OWNER / ADMIN / FINANCE_MANAGER            CLIENT_EXTERNAL (own wallet only)
        │  POST action=topup                        │  POST action=allocate
        ▼                                          ▼
   Wallet (+credits)  ──────────►  Wallet (−debits) ──► Project fundedAmount ↑
        │                                │                    │
        └── derived figures mirrored ────┴────────────────────┘
             clients.walletBalance · projects.fundedAmount / remainingToFund
             dashboard KPIs · project 360 · client detail drawer
```

| Rule | Enforced where |
|---|---|
| Only owners/admins/finance managers can add funds | `wallet.topup` capability, server-side |
| A client may allocate **only from its own wallet** | `walletClientAllowed()` + `Membership.entityId` |
| Funds may go **only to that client's own projects** | project `clientId` check inside the transaction |
| Balance can never go negative | checked inside the Prisma transaction |
| Duplicate submissions do nothing | unique `(organizationId, idempotencyKey)` |
| Corrections are never edits/deletes | `REVERSAL` entry; `PATCH`/`DELETE` on a ledger row returns `405` |
| Every movement is audited | `AuditLog` entries `WALLET_TOPUP` / `WALLET_ALLOCATION` / `WALLET_REVERSAL` |

### API

| Method | Path | Who | What |
|---|---|---|---|
| `GET` | `/api/[org]/wallets` | `wallet.read` | All client wallets, balances, totals, KPI summary (scoped for portal users) |
| `GET` | `/api/[org]/wallets/[clientId]` | `wallet.read` | Wallet detail, up to 200 ledger entries, client's projects and funding remaining |
| `POST` | `/api/[org]/wallets/[clientId]` | see below | `{"action":"topup"|"allocate"|"reverse", …}` |
| `GET` | `/api/[org]/wallets/[clientId]/transactions/[txId]` | `wallet.read` | Single ledger entry |
| `PATCH`/`PUT`/`DELETE` | same | — | **405** — ledger is immutable |

Top-up body: `{"action":"topup","amount":250000,"reference":"RTGS-2026-1148","method":"Bank transfer (USD)","note":"Advance","idempotencyKey":"..."}`
Allocation body: `{"action":"allocate","amount":100000,"projectId":"…","note":"Mobilisation"}`
Reversal body: `{"action":"reverse","transactionId":"…","note":"Duplicate allocation"}`

### UI

- **Client wallets** (`/[org]/wallets`) — balance KPIs, all clients with available/top-up/allocated columns, a drawer with the ledger, project funding progress, Add funds / Fund a project forms and one-click reversals. Optimistic balance updates with rollback on failure.
- **Clients** register — live `walletBalance` column (read-only, derived).
- **Client detail drawer** — wallet balance plus a **Linked records** panel listing every module pointing at that client.
- **Projects** register — `fundedAmount` / `remainingToFund` derived columns.
- **Project 360** — client wallet funding card with progress bar and recent allocations.
- **Dashboard** — wallet balance KPI, funded-to-projects KPI and a client wallet card.
- **Settings → Plan & audit** — live link-integrity status.

Seeded demo: 6 funded wallets, **USD 11,000,000** available across all clients, 1 reversed allocation example, 616 records.

---

## 2. Role-level access

`src/lib/catalog.ts` exports `ROLE_RULES` — one matrix that drives API guards, the sidebar,
quick-create, forms, settings and the audit suite. `src/lib/guard.ts` applies module + role +
capability checks; `src/lib/access.ts` applies row-level scoping.

| Role | ID | Read | Write | Delete | Wallet caps | Scope |
|---|---|---:|---:|:---:|---|---|
| Owner / Managing Director | `OWNER` | 49/49 | 49/49 | yes | read, topup, allocate, refund | workspace |
| Administrator | `ADMIN` | 49/49 | 49/49 | yes | read, topup, allocate, refund | workspace |
| Project Manager | `PROJECT_MANAGER` | 46/49 | 40/49 | yes | read, allocate | workspace |
| Site Engineer / Supervisor | `SITE_ENGINEER` | 39/49 | 34/49 | no | read | workspace |
| Finance Manager | `FINANCE_MANAGER` | 49/49 | 43/49 | yes | read, topup, allocate, refund | workspace |
| Accountant | `ACCOUNTANT` | 49/49 | 40/49 | no | read | workspace |
| HR Manager | `HR_MANAGER` | 40/49 | 37/49 | yes | read | workspace |
| Procurement Officer | `PROCUREMENT` | 49/49 | 39/49 | yes | read | workspace |
| HSE Officer | `SAFETY_OFFICER` | 39/49 | 34/49 | no | read | workspace |
| Plant Manager | `PLANT_MANAGER` | 39/49 | 34/49 | no | read | workspace |
| Estimator / QS | `ESTIMATOR` | 49/49 | 40/49 | no | read | workspace |
| Viewer | `VIEWER` | 49/49 | 0/49 | no | read | workspace |
| Client (portal) | `CLIENT_EXTERNAL` | 20/49 | 0/49 | no | read, allocate | own client |
| Subcontractor (portal) | `SUBCONTRACTOR_EXTERNAL` | 13/49 | 0/49 | no | — | own client |

Capabilities: `records.create/update/delete`, `files.upload/delete`, `comments.create`, `exports`,
`settings.view/manage`, `users.manage`, `project360`, `integrity`,
`wallet.read/topup/allocate/refund`.

### Enforcement points

`records` (list/refs/CSV/create/detail/PATCH/DELETE/bulk), `comments`, `files` (list/upload/read/delete),
`pdf`, `search`, `overview`, `meta`, `projects/[id]` (360), `settings`, `wallets`, `integrity`,
`onboarding`. Settings mutations additionally require `OWNER`/`ADMIN`; only an `OWNER` may grant
or change the owner role, and the last owner cannot be demoted or removed.

**External scoping:** `Membership.entityId` pins `CLIENT_EXTERNAL` to one client record and
`SUBCONTRACTOR_EXTERNAL` to one subcontractor. Scoped users see only their own client, their own
projects and rows linked to those projects — including attachments, search results, meta counts,
overview KPIs and notifications. A client portal user sees exactly one wallet and has no
top-up/reversal/settings controls.

### Settings → Users & roles

- Invite a teammate with any of the 14 roles; external roles get a **Link to client** dropdown.
- Change a member's role inline; change or clear a portal user's client scope; remove members.
- Full permission matrix table (read/write counts, delete, wallet caps, scope) and a "Your access" capability list.

---

## 3. Link integrity

`GET /api/[org]/integrity` (`integrity` capability) checks in one pass:

1. every `ref` field across all 49 resources resolves to a live record of the correct resource in the same org;
2. every `projectId` column resolves to a live project;
3. each wallet's cached balance equals the sum of its ledger;
4. each project's `fundedAmount` equals its active (non-reversed) allocations;
5. no wallet or ledger row points at a missing client/wallet/project;
6. every enabled resource belongs to an enabled module.

The seeded demo passes with **0 broken refs, 0 wallet mismatches, 0 funding mismatches, 0 orphans**.

---

## 4. Verification

```
npm run audit             → 1211/1211 live-Supabase API checks + 22/22 derivation checks
npm run audit:browser     → 28/28 real-Chromium checks, 0 unexpected console errors
npm run audit:onboarding  → 10/10 signup, derivation, RBAC and tenant-isolation checks
npm run audit:all         → API + browser suites
npm run audit:live        → all three suites (then run the generated QA cleanup SQL)
```

The live API suite provisions **all 14 roles as real users**, runs the full wallet lifecycle, reverses
it back to the opening balance, checks link integrity, registers/onboards a **second real tenant**
and confirms it cannot read the first tenant's records, wallets, meta or overview. The live
`1211/1211` total includes 13 cleanup checks that became possible once `/api/[org]/meta` returned
real team members; the older SQLite run had the same headline number but a different check set.
The browser suite clicks top-up → project funding → reversals in the UI and logs in as the client
portal user in a second browser context to prove scoping.

Reports: `AUDIT_REPORT.md`, `BROWSER_AUDIT_REPORT.md`, screenshots `01-login.png` … `16-portal-wallet.png`.

---

## 5. Production notes

- Wallets use the organisation's `baseCurrency`; multi-currency conversion/FX rates are not modelled.
- `prisma.$transaction` serialises each money movement; for high concurrency move to Postgres row locks.
- Rotate `SESSION_SECRET`, remove demo accounts, set `SEED_DEMO=false` after first boot and back up `/app/data`.
- Add rate limiting on auth and wallet actions before exposing publicly.

---

## Supabase rewrite note (2026-11-07)

The wallet and RBAC behaviour described above is unchanged, but the enforcement layer moved into Postgres:

- `prisma.wallet` / `prisma.walletTransaction` → `public.wallets` / `public.wallet_transactions` (integer cents, bigint).
- `wallet.topup`, `wallet.allocate`, `wallet.refund`, `wallet.read` and `integrity` are now checked inside `supabase/migrations/0003_rbac.sql` helpers and `0005_functions.sql` RPCs, using the Supabase Auth JWT (`auth.uid()`).
- Money can only move through `app_wallet_topup`, `app_wallet_allocate` and `app_wallet_reverse`. There are **no** client INSERT/UPDATE/DELETE policies on the ledger, audit log, notifications or sequences.
- `ROLE_RULES` in `src/lib/catalog.ts` is still the single source of truth; `scripts/gen-supabase-rbac.py` compiles it into `0003_rbac.sql`. Run `npm run rbac:generate` after changing a role.
- The custom `Session` table and bcrypt hashing are gone; Supabase Auth owns sessions.

The numeric QA expectations above (e.g. `2950000` after two QA reversals, `$11,000,000` total available) are reproduced by `scripts/seed-supabase.ts` and must be re-verified against a live Supabase project once keys are supplied.
