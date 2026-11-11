# Platform-owner billing configuration (stage-only backend v1)

**Status: implemented in the database and HTTP API, deliberately NOT wired into
the billing runtime.** This is the layer the platform owner superadmin uses to
configure subscription pricing, DPO/Paynow requirements and billing enablement.
Company/tenant members cannot read or change it. No superadmin UI, no runtime
behaviour change, no env/Vercel change, no deployment, no live charges or locks
were made as part of this task.

- Migration file: `supabase/migrations/20261113100000_platform_billing_config.sql`
- Live migration: `platform_billing_config_v1` on Supabase project
  `oeadisqfuyhelppinaxw` (applied; `version: null` as with earlier connector
  migrations, verified by SQL below).
- API: `src/app/api/platform/config/route.ts` (`GET`, `POST`).
- Identity helper: `src/lib/platform-admin.ts`.
- QA: `scripts/platform-config-qa.mjs` (`npm run audit:platform-config`), report
  `PLATFORM_CONFIG_QA.md`.

## 1. Access model — platform owner, not the company

| Control | Implementation |
|---|---|
| Superadmin identity | `public.platform_admins` keyed by Supabase Auth `user_id`. Seeded with `codzlabzim53@gmail.com` / UUID `61aa66b8-b5d6-4aac-ba46-e348fd5ee37a`. |
| Company/anon table access | RLS enabled on all six config tables; **all** privileges revoked from `anon` and `authenticated`; **zero** RLS policies. Only `service_role` has `SELECT/INSERT/UPDATE/DELETE`. |
| API gate | `requirePlatformAdmin()` reads the cookie-bound Supabase Auth user, then the service-role client checks an active `platform_admins` row. A valid company session alone gets `403`. |
| Direct JWT query | A company user's JWT cannot `SELECT` a config table (`permission denied`), even though they are authenticated. |
| Writes | All writes use the service-role client **after** the identity check. Every write is recorded by a DB audit trigger. |

The demo Owner/Admin company role (`OWNER`, `ADMIN`, etc.) is irrelevant here.
`public.memberships` roles were inspected earlier and contain no platform
superadmin role; this layer is intentionally separate from tenancy.

## 2. Tables

| Table | Purpose |
|---|---|
| `platform_admins` | Active/revoked superadmin identities; `user_id` FK to `auth.users ON DELETE CASCADE`. |
| `platform_settings` | Single row (`id=1`): staged `billing_enabled`, `trial_days=14`, `grace_days=3`, `currency='USD'`, `tax_included=false`, `active_gateway='dpo'`, `pricing_model='tiered'`, `maintenance_mode=false`. |
| `gateway_config` | One row per `dpo`/`paynow`/`mock`: non-secret `enabled`, `mode` (`shadow`/`sandbox`/`live`), URLs/paths, service type, approval/readiness booleans, `requirements` JSON. All seeded disabled/`shadow`. |
| `pricing_plans` | Effective-dated price versions. Seeded `STARTER 9.00`, `PRO 29.00`, `ENTERPRISE 99.00` USD/month, all active. Unique active version per `plan_id`; `active_pricing_plans` view (service-role only). |
| `platform_config_audit` | Immutable `INSERT/UPDATE/DELETE` log with old/new values, actor, timestamp, optional note. |
| `organization_billing_overrides` | Per-org comped/custom overrides. Seeded `comped=true` for `kestrel-ridge` and `codzlabzim-construct` (`grandfather_all`). |

Helper functions (service-role only): `is_platform_admin(uuid)`,
`create_pricing_plan_version(jsonb, uuid)`, `activate_due_pricing_plans(timestamptz)`,
`retire_pricing_plan(uuid, uuid)`, `delete_pricing_plan(uuid)`, and the
`platform_config_audit_trigger()` security-definer trigger on five config tables.

### Secrets are NOT in the database

`DPO_COMPANY_TOKEN`, `DPO_CALLBACK_SECRET`, `DPO_PUSH_SECRET`,
`PAYNOW_INTEGRATION_ID`, `PAYNOW_INTEGRATION_KEY` and `CRON_SECRET` remain
encrypted environment variables only. The config tables contain no secret
columns; the only column whose name contains `token` is
`gateway_config.tokenisation_approved`, a **boolean merchant-readiness flag**,
not a credential. The API additionally rejects secret-like field names
(`companyToken`, `callbackSecret`, `pushSecret`, `integrationKey`, `token`,
`secret`, `password`, …) at the top level and inside `requirements`, and only a
whitelist of non-secret `requirements` keys is accepted.

`BILLING_ENABLED` and `DPO_LIVE_MODE` remain **hard environment master
switches**. The API refuses to stage `billing_enabled=true`, enable a gateway,
or set DPO `mode='live'` unless the corresponding env switches/credentials are
present. More importantly, **the billing runtime does not read these tables at
all yet**: `src/lib/billing-plans.ts` and the env-based `billingConfig()` remain
the source of truth. Company Billing remains read/action-only; historical
invoices and the two comped organisations are unchanged.

## 3. HTTP API

`GET /api/platform/config` — returns `stageOnly: true`, `runtimeWired: false`,
the actor, env master-switch booleans (never values), settings, gateways, all
pricing versions, active prices, overrides, admins and the last 50 audit rows.

`POST /api/platform/config` — JSON body `{ action, ... }`, `Content-Type:
application/json`. Actions:

| Action | Effect |
|---|---|
| `updateSettings` | Whitelisted `platform_settings` fields; env guard on `billing_enabled`. |
| `updateGateway` | `{ gateway, fields }`; env guards; no secret fields. |
| `createPlanVersion` | New effective-dated price (immediate supersedes, future stays inactive). |
| `activateDuePlans` | Activates due future versions atomically. |
| `retirePlan` / `deletePlan` | `{ id }`; pending future versions are cancelled cleanly. |
| `addAdmin` / `revokeAdmin` | `{ userId }`; verifies the Auth user exists, protects the last admin and self-revocation. |
| `upsertOverride` / `deleteOverride` | `{ organizationId, fields }` / `{ organizationId }`. |

Every mutation is audited by the DB trigger, so bypassing the API with the
service role would still leave an audit row.

## 4. Verification

Live SQL after `platform_billing_config_v1`:

- 6 config tables, 6 with RLS enabled, **0** policies, **0** `anon`/`authenticated`
  privileges.
- 1 active admin = `codzlabzim53@gmail.com` with the exact requested UUID.
- `platform_settings.billing_enabled = false`; 0 gateways enabled.
- 3 active plans = `STARTER:9.00,PRO:29.00,ENTERPRISE:99.00`.
- 2 comped org overrides; 10 initial audit rows; 6 helper functions; 5 audit
  triggers.
- Secret-like column scan: only the boolean `tokenisation_approved` matched a
  broad `%token%` pattern; no credential column exists.

`npm run audit:platform-config` against a production-mode local server passed
**34/34** checks. It created two throwaway Auth users, exercised the HTTP API as
a temporary superadmin, verified `401` anonymous / `403` company owner / direct
RLS denial, master-switch and secret guards, versioned pricing, overrides,
admin add/revoke and audit growth, then deleted both throwaway users and their
`platform_admins` rows. Final SQL confirmed 1 active admin (the real UUID), 0 QA
users, `billing_enabled=false`, 0 enabled gateways, 3 seed prices, 2 comped
overrides, no QA plan/note, and retained audit rows. Audit rows written by the
throwaway users have `changed_by=NULL` after their Auth accounts were deleted
(FK `ON DELETE SET NULL`); production changes by the real admin keep their actor.
See `PLATFORM_CONFIG_QA.md` for the check-by-check result and cleanup log.

Also run: `npm run env:check`, `npx tsc --noEmit`, `NODE_ENV=production npm run
build` (clean; `/api/platform/config` present), `git diff --check`.

## 5. Deliberately NOT done (requires further direction)

- No superadmin UI (`scope=implement_backend`).
- No runtime wiring: prices, trial/grace, DPO/Paynow config and billing enablement
  still come from code constants and env (`runtime_wiring=stage_only`).
- No change to Vercel env, `DPO_*` vars, `BILLING_ENABLED`, `DPO_LIVE_MODE`,
  `CRON_SECRET`, or production shadow mode.
- No Vercel deployment (`deploy=commit_only`); production still runs deployed
  code `bd38a90721be86016e9c8dbf937d1b6a4fc365d6` with docs-only HEAD ahead.
- No price/contract change, no annual billing, no company-size guardrail, no
  module-based pricing, no QA/billing alteration.
- Go-live still requires live DPO CompanyToken/ServiceType, callback/push
  secrets, merchant/tokenisation approval, Zimbabwe payout route, VAT/tax
  decision, staging QA and explicit approval before `DPO_LIVE_MODE=true` +
  `BILLING_ENABLED=true`.

Before enabling billing for real, add `platform` to the `RESERVED` set in
`src/middleware.ts` so the platform config API stays reachable when the billing
hard-lock is active; that is a future runtime change, intentionally excluded
from this stage-only task.

## 6. Commit record

- Code/DB/API/docs commit: `1a8eeb9c71ad4ff331acba832a88ccdeb8390a2f` —
  "Add stage-only platform-owner billing config DB/API layer".
- Live migration applied separately via Supabase connector:
  `platform_billing_config_v1` on `oeadisqfuyhelppinaxw`.
- **No Vercel deployment.** Production still serves code
  `bd38a90721be86016e9c8dbf937d1b6a4fc365d6`; the earlier docs-only commit
  `71ce674cdc380ab8640baf09ab02ca5fd6913265` and this work are ahead of deployed
  code until an explicit future deploy is requested.
