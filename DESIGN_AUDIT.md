# MYLA frontend design audit

**Phase 1 — before changes.** Screenshots captured in `screenshots/design-before/`.

## Architecture

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3.
- Design tokens live in `tailwind.config.ts` (colors, shadow, animation) and `src/app/globals.css` (`.card`, `.btn`, `.input`, `.badge`, `.table-*`, `.nav-*`, `.heading`, `.skeleton`).
- Shared UI: `src/components/ui.tsx` (Button, Badge, Card, Field, Drawer, EmptyState, Tabs, ProgressBar, Toggle, skeletons).
- Shell/navigation: `src/components/AppShell.tsx`, `Providers.tsx` (theme + toasts).
- Data work: `ResourceTable.tsx`, `RecordForm.tsx`, `RecordDetail.tsx`, `Charts.tsx`.
- Pages: dashboard, list pages, project detail, reports, settings, wallets, login/register (`AuthScreen.tsx`), onboarding (`OnboardingWizard.tsx`).

## Existing strengths to preserve

- Real Supabase auth/RBAC, RLS, CRUD, optimistic updates, comments/attachments/PDF revisions, wallet ledger, onboarding derivation, dark mode, command palette, responsive bottom nav.
- Loading skeletons, empty states, validation, CSV export, sorting/filtering, pagination.
- Existing routes, permissions, data fetching and business logic.

## Visual problems found

1. **Brand mismatch** — supplied MYLA logo is navy `#03203F`, orange `#F58712`, slate `#51697B`; the app used generic amber Tailwind colors and a hard-hat glyph instead of the real logo.
2. **Excessive radius** — `rounded-xl`/`rounded-2xl` on cards, tiles, modals and inputs; `rounded-full` on badges, counts, tabs and demo buttons. 118 bare `rounded`, 48 `rounded-lg`, 27 `rounded-xl`, 23 `rounded-full` occurrences.
3. **Elevation/decoration** — `shadow-card` on every card, `shadow-xl/2xl` on dropdowns/drawers, `backdrop-blur-md` header, `backdrop-blur-sm` palette, `blur-3xl` glow and a hero gradient on the auth panel.
4. **Dashboard density** — five oversized KPI cards with sparklines and colored icon tiles; the fifth card wrapped alone; generic “Good morning, here’s your business” hero copy; nested cards in “Workspace at a glance”; repeated wallet information.
5. **Tables** — tall `px-4 py-3` rows, no right alignment for numeric columns, status `<select>` styled like a green pill, decorative icon tiles in list headers, low-contrast row actions.
6. **Sidebar/header** — large tinted active row, orange plan banner, pill counts, blurred header, and a page-title bug: `/reports`, `/settings` and `/wallets` all rendered the header title “Dashboard”.
7. **Charts** — donut used six unrelated accent colors (purple, sky, emerald, red, amber, slate); bar chart used amber/orange only but with rounded bars and large value labels.
8. **Forms/modals** — uppercase wide-tracked labels, generous `gap-5` spacing, large dialog radii, floating plus badge in `EmptyState`, heavy toast shadow.
9. **Interactions** — `fadein` animation translated elements 4px; no global reduced-motion rule; hover shadows on cards.
10. **Onboarding/auth** — large selection cards with `ring-2`, tinted callouts, oversized 2.9rem auth headline, decorative SVG building illustration, pill-shaped motto badge.

## Shared components affected

`tailwind.config.ts`, `globals.css`, `ui.tsx`, `AppShell.tsx`, `AuthScreen.tsx`, `OnboardingWizard.tsx`, `Providers.tsx`, `Charts.tsx`, `ResourceTable.tsx`, `RecordDetail.tsx`, `RecordForm.tsx`, all `[org]` pages, the generated-PDF route and the seeded sample PDFs.

## Constraint

Visual refinement only. No changes to APIs, database schema, auth/RBAC, routing, validation rules, mutations, or module derivation. No new UI libraries. Internal `buildops*` infrastructure identifiers remain unchanged.

## Phase 2 — outcome

- Replaced generic amber with the supplied logo's navy `#03203F`, orange `#F58712` and slate `#51697B`; kept the existing Tailwind token names so no page logic changed.
- Added authentic transparent logo variants under `public/brand/`, a brand-aware `Logo` component, a PNG app icon and a compact light lockup embedded into generated PDFs.
- Reduced the shared radius scale: 3–6px controls, 6–8px cards/dropdowns, 10–12px modals. Removed `rounded-xl`/`rounded-2xl` from cards and pill badges from the main surfaces.
- Removed decorative gradients, backdrop blur, heavy shadows, colorful icon tiles, sparkline KPI cards, nested dashboard cards and the generic hard-hat product mark.
- Rebuilt the dashboard as a compact five-KPI strip plus a client-wallet register, charts, portfolio health, attention list, audit trail and record counts.
- Standardised buttons, inputs, badges, tabs, drawers, toasts, tables, empty/loading states and focus states; added active-filter chips/reset, numeric column alignment and tabular numerals.
- Preserved every route, permission, API, validation rule, mutation, Supabase/RLS path, onboarding derivation and working table feature.
- Added a dedicated `scripts/design-qa.mjs`: 15/15 checks covering 54 routes across five viewports, authentic logo loading, exact route titles, horizontal overflow, radius limits, gradient/blur/nested-card removal, keyboard focus, reduced motion, dark mode and console/page errors.

Before/after screenshots: `screenshots/design-before/` and `screenshots/design-after/`.
