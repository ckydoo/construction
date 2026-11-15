# Production prep — 2026-11-15

Deployed as `3316bdb` via production deployment `dpl_4fz8QNKEM5YLg2QNQgDW8YA1xiEN`
(READY/PROMOTED, aliases myla.co.zw / app.myla.co.zw). Verified live 2026-11-15.

## What shipped
- **Demo mode gate.** All demo/sample-data entry points (login one-click demo
  accounts + 616 stat, onboarding toggle, Settings → Data tools card,
  dashboard + ResourceTable empty-state buttons, landing "demo data" copy)
  render only when demo mode is on. Seed APIs refuse with 403/ignore
  `loadDemo` otherwise. `lib/demo.ts` / `db:seed` retained.
  Sources (either enables): env `NEXT_PUBLIC_DEMO_MODE=true`, or
  `platform_settings.demo_enabled` (default **false**; column added by
  migration `platform_settings_demo_enabled`).
- **Maintenance mode enforced.** `platform_settings.maintenance_mode` (existing
  column) is now live: middleware redirects org/app pages to `/maintenance`
  and answers app APIs with `503 {code:'MAINTENANCE'}`. Platform owners keep
  access; `/login`, auth flows, marketing site, `/platform` stay reachable.
  Optional env override: `MAINTENANCE_MODE=true`. Cached 15s per isolate,
  fail-open if the settings table is unreachable.
- **Platform-owner superadmin at `/platform`** (server-gated by
  `platform_admins`; 403 for anyone else). Go-live switches (maintenance,
  demo) with confirm dialogs, staged billing settings (read-only —
  `BILLING_ENABLED` env remains the billing master), administrators list, and
  recent `platform_config_audit` rows with per-key diffs. Writes go through the
  audited `/api/platform/config` route (`demo_enabled` added to
  `SETTINGS_FIELDS`); cache invalidated on write.
- **Error pages.** `not-found.tsx` (branded 404), `error.tsx` (root error with
  digest ref + Try again), `global-error.tsx` (inline-styled last resort).
  None existed before. `/maintenance` and `/api/platform/public-config`
  (booleans only) added.

## Current production state
- `billing_enabled = true` (env `BILLING_ENABLED`), `maintenance_mode = false`,
  **`demo_enabled = true` — owner decision 2026-11-15: leave demo ON until further notice.**
- To fully hide demo: `/platform` → Demo mode off, or set demo_enabled=false.
- To open a maintenance window: `/platform` → Maintenance mode on (or
  `MAINTENANCE_MODE=true` in Vercel env). App APIs → 503, pages → /maintenance.

## Notes
- Landing page (myla.co.zw) contains zero "demo" wording (uses "example data").
- `.env.example` documents `NEXT_PUBLIC_DEMO_MODE` and `MAINTENANCE_MODE`.
- Maintenance gate bypass: active `platform_admins` rows. Audit trigger records
  every change; direct SQL edits to platform_settings surface in the trail too.
