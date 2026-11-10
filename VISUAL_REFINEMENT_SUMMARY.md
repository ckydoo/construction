# MYLA visual refinement — implementation summary

## Direction

Minimal, not empty. Premium, not decorative. Modern, not trendy. Professional, not boring. The refinement uses the user-supplied MYLA logo as the single brand source and preserves every working feature, route, permission, API, validation rule and Supabase/RLS path.

## Audit first

`DESIGN_AUDIT.md` records the Phase 1 audit of architecture, tokens, typography, colors, spacing, dashboard, navigation, forms, tables, modals, detail pages and shared components. Eight before screenshots are in `screenshots/design-before/`.

The existing app already had a strong functional core: 49 connected resources, enterprise table patterns (search/status/project filters, sorting, pagination, CSV, selection, bulk delete, loading/empty states), optimistic CRUD, drawers, comments/attachments/PDF revisions, dark mode, command palette, responsive bottom nav and RBAC-driven navigation. Those were preserved and refined, not replaced.

## Design system

- **Brand colors from the logo:** navy `#03203F`, orange `#F58712`, slate `#51697B`, plus restrained navy/slate neutrals. Generic amber/random chart colors removed.
- **Typography:** Inter-first system stack; 22–26px page titles, 16–18px sections, 13–15px card headings, 13–14px body, 12–13px secondary; tabular numerals globally for operational and financial data.
- **Radii:** buttons/inputs 5px, cards 6px, dropdowns/panels 6–8px, modals 10px, badges/chips 4–5px; no pill-shaped badges/buttons.
- **Elevation:** subtle borders instead of card shadows; `shadow-panel` only for genuine elevation (drawers, dialogs, dropdowns, command palette). No backdrop blur, glassmorphism or decorative gradients.
- **Interaction:** 120ms color/border transitions; visible `:focus-visible` orange outline; global `prefers-reduced-motion` support; purposeful loading skeletons only.

## Visual changes

- Added authentic transparent logo variants from the supplied PNG: full, lockup and mark, each in light/dark variants, plus a real favicon and an embedded PDF header logo.
- Replaced the generic hard-hat mark and decorative auth hero with the MYLA logo, navy panel, restrained grid and product-specific copy. Removed decorative blob, pill motto chip and oversized headline.
- Rebuilt the dashboard as a compact five-KPI strip, client-wallet register, brand-consistent charts, project health, attention list, audit trail and record counts. Removed sparklines, colorful icon tiles, nested cards and the lone fifth oversized card.
- Refined the sidebar/header: real logo, compact plan line, subtle active indicator, corrected route titles for all 49 resources and special pages, restrained dropdowns, no blurred header.
- Standardised buttons (primary/outline/ghost/danger), inputs, labels, badges, chips, tabs, toggles, drawers, dialogs, toasts and empty/loading states.
- Enterprise table refinements: compact rows, uppercase column labels, right-aligned numeric columns, visible active-filter chips with synchronous reset, restrained status controls, CSV/pagination preserved, accessible icon-button names.
- Applied consistent density and hierarchy across dashboard, list pages, project detail, reports, settings, wallets, onboarding, auth, modals and generated PDFs.
- Added keyboard focus states, reduced-motion support, aria-labels for icon-only controls and dark-mode logo variants.

## Later addition — in-app Documentation page & plain language

`src/app/[org]/documentation/page.tsx` is a sidebar-accessible, read-only guide.
It opens with a six-step **business flow** (a client calls → price the work →
agree & plan → do the work → bill for it → get paid & close), then an illustrated
home screen, six everyday chains, a **Start small** section for a two-person
workshop, plain-language access rules, a Zimbabwe glossary, a clickable section
map and quick help. No IT architecture, acronyms or product jargon appears on the
page. Two hand-built inline SVG illustrations have `role="img"` and descriptive
`aria-label`s, render in light and dark mode, and scroll horizontally on small
screens with a swipe hint. Only existing `Card`, `Badge` and `Icon` primitives and
Lucide exports are used — no new dependencies, external images, gradients or blur.

`TERMINOLOGY.md` defines the display-text-only wording layer applied across
`src/lib/resources.ts`, `src/lib/catalog.ts`, `AppShell.tsx`,
`OnboardingWizard.tsx`, the dashboard, reports, settings and wallets: plain words
first, Zimbabwe/Southern African terms (USD + ZWG, 15% VAT, tax invoice, PAYE /
NSSA, RTGS / mobile money, `(Pvt) Ltd` / CR14, stand, snag list, variation), and
sidebar sections such as `Clients & quotes`, `Jobs & sites`, `Materials & suppliers`,
`Staff & wages`, `Money & invoices`. Resource/module/role IDs, status values, field
keys, API paths, SQL, RLS, the role matrix, validation and module derivation are
unchanged. `scripts/design-qa.mjs` audits 55 routes and captures a documentation
screenshot; `scripts/onboarding-audit.mjs` was updated for the new labels and
passed 10/10.

## Files modified / added

**Design foundation:** `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/icon.png`, `src/components/Logo.tsx`, `src/lib/brand-assets.ts`, `public/brand/*`, `BRAND.md`, `DESIGN_AUDIT.md`.

**Shared components:** `src/components/ui.tsx`, `AppShell.tsx`, `AuthScreen.tsx`, `OnboardingWizard.tsx`, `Providers.tsx`, `Charts.tsx`, `RecordForm.tsx`, `RecordDetail.tsx`, `ResourceTable.tsx`.

**Pages:** `src/app/[org]/dashboard/page.tsx`, `reports/page.tsx`, `settings/page.tsx`, `wallets/page.tsx`, `projects/[id]/page.tsx`, `m/[resource]/page.tsx` (through shared components), `src/app/api/[org]/pdf/[resource]/[id]/route.ts`.

**QA:** `scripts/design-before.mjs`, `scripts/design-qa.mjs`, `DESIGN_QA_REPORT.json/.md`, `screenshots/design-before/*`, `screenshots/design-after/*`, regenerated `BROWSER_AUDIT_REPORT.*`, `AUDIT_REPORT.*`.

No new UI libraries were installed. No business logic, backend APIs, database schemas, auth/RBAC, routing, validation rules, workflows or Supabase integration were changed.

## Tests actually performed

On the exact build being published:

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passed |
| `npm run build` | Passed; all 10 static pages generated |
| `npm run env:check` | Passed; no secret values printed |
| `npm run audit:browser` | **28/28 passed**, 0 console/page errors |
| `node scripts/design-qa.mjs` | **15/15 passed** |
| `npm run audit` | **1211/1211 API checks** and **22/22 core-derivation checks** |
| Generated PDF smoke test | HTTP 200 `application/pdf`, 1 embedded logo image, MYLA metadata |
| `npm run db:seed` after QA | Clean demo data restored: 616 records, 7 users, 34 modules, 6 wallets, `$11,000,000` total balance |
| Supabase cleanup check | 0 QA organizations, 0 QA users, 0 QA invitations, last-owner trigger enabled |
| Secret scan | Only the Git-ignored local `.env` matched; no tracked secret values |

`design-qa` covered 55 routes at 1440×900 and 390×844, plus key routes at 1920×1080, 1024×768 and 768×1024. It verified 0px horizontal overflow, exact route titles, authentic logo loading, radius ≤ 12px on controls, zero gradient/blur classes, zero nested cards, visible keyboard focus, reduced-motion suppression, dark mode and zero console/page errors.

There is no `lint` script in `package.json`; `next build` ran its built-in lint/type validation. The dedicated onboarding/tenancy/RBAC suite was re-run after the terminology pass and passed **10/10** (`ONBOARDING_AUDIT_REPORT.md`); QA organisations and Auth users were cleaned up (0/0). `npm run audit:core` also passed 10/10 — derivation logic is unchanged.

## Remaining issues

- Supabase Auth `site_url`, redirect allow-list and SMTP remain at their previously approved local-development settings; changing them is a separate account-level decision. Registration and invites work today through the Admin API (`email_confirm: true`), so this is not a blocker.
- `TZ` is a reserved name on Vercel and was omitted; no application code reads it.
- The project has no Vercel GitHub App installed, so pushes do not auto-deploy; see the redeploy procedure in `PRODUCTION_DEPLOYMENT.md`.
- The historical offline snapshot and stale `import-src/` mirror are not part of the live app.

## Deployment

**GitHub:** commit `8eb261a` (“Refine MYLA UX with authentic logo design system”) was
pushed to `git@github.com:ckydoo/construction.git` on `main`. It contains 105 changed
files (1472 insertions / 681 deletions); a fresh clone has 166 files, no `.env` and 0
secret-like hits. Later commits add deployment documentation, a sidebar cleanup
that removes numeric record-count badges and the “N modules” label, an in-app
plain-language business-flow guide and a Zimbabwe / Southern Africa terminology pass
(`1aef83b`), and the full project-detail / larger-data release (`c6b39e2`).

**Vercel:** project `myla-construction-erp` (`prj_gShJxUcNTwjzIuiwdOhapx1fqskT`) is live
at **https://myla-construction-erp.vercel.app**, built from GitHub `main`
(currently `c6b39e2`) via a `git_source` deployment (`dpl_HQ8PkC5tUEcpwbqeCBMd6ADmNXki`,
`READY` / `PROMOTED`, production, `iad1`, Node 26.x, `npm ci` + `npm run build`). Nine environment
variables are set for all three targets, including write-only sensitive Supabase keys.

**Production verification:** login (valid and invalid credentials), dashboard, wallets,
resource pages, meta/overview/integrity/wallets/records APIs, branded PDF generation,
authentic logo assets, and a complete upload → Rev A → Rev B → download → delete storage
cycle all passed. Integrity reported `ok:true`, 616 records, 0 broken refs and 0 wallet
mismatches; QA artifacts were cleaned up. Full detail: `PRODUCTION_DEPLOYMENT.md`.
