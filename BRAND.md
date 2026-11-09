# MYLA — product identity

| | |
|---|---|
| **Name** | MYLA |
| **Motto** | Built for Progress. |
| **Descriptor** | CONSTRUCTION & INDUSTRIAL MANAGEMENT |
| **Browser title** | MYLA — Construction & Industrial Management |
| **PDF / document brand** | MYLA · Built for Progress. |

The name, motto and descriptor are centralised in `src/lib/brand.ts` and surfaced in:

- the browser title and description (`src/app/layout.tsx`),
- the app favicon (`src/app/icon.png`) and public brand assets (`public/brand/`),
- the sign-in / registration screen and its marketing panel (`src/components/AuthScreen.tsx`),
- the signed-in sidebar and onboarding wizard headers (`src/components/AppShell.tsx`, `src/components/OnboardingWizard.tsx`),
- generated PDF headers and footers (`src/app/api/[org]/pdf/[resource]/[id]/route.ts`),
- seeded sample PDFs (`src/lib/seed-data.ts`),
- audit report titles, CLI logs, documentation and environment templates.

## Authentic logo assets

The user-supplied `MYLA Construction Logo with Abstract Mark.png` is the single source of truth. Transparent crops live in `public/brand/`:

- `myla-logo-full.png` / `myla-logo-full-light.png` — wordmark, descriptor and motto for light / dark backgrounds.
- `myla-logo-lockup.png` / `myla-logo-lockup-light.png` — compact wordmark for sidebar, onboarding and PDF headers.
- `myla-mark.png` / `myla-mark-light.png` — abstract mark only.
- `myla-favicon.png` — navy tile with the light mark; also copied to `src/app/icon.png`.

`src/components/Logo.tsx` selects the correct variant and `src/lib/brand-assets.ts` contains the compact light lockup used by generated PDFs. No generic hard-hat substitute is used in product-facing UI.

## Compatibility note

The following internal identifiers deliberately keep their historical `buildops*` names because renaming them would break live data or saved preferences:

- the Supabase Storage bucket `buildops-documents` and its `buildops_storage_*` policies,
- the localStorage key `buildops-theme`,
- the Supabase CLI `project_id = "buildops"` in `supabase/config.toml`,
- the workspace path `/home/user/buildops`, the GitHub repository path, the SSH key filenames and the historical Git mirror/bundle names.

These are infrastructure identifiers, not product-facing branding. The app presents itself as **MYLA** everywhere a user sees a product name. The historical offline snapshot filename was also renamed to `MYLA-offline-snapshot.html`; its contents remain an old pre-Supabase snapshot and are not the live app.

## Post-rebrand verification

- `npx tsc --noEmit` and `npm run build` pass.
- Rebuilt app restarted on `0.0.0.0:3000`; `/login` serves `<title>MYLA — Construction &amp; Industrial Management</title>`, the MYLA favicon, the motto and the descriptor.
- `npm run audit:browser` re-run against the rebuilt app: **28/28 passed**, 0 uncaught page errors, 0 React/console errors. Screenshots in `screenshots/` were regenerated with MYLA branding.
- Generated PDF smoke test: HTTP 200 `application/pdf`; metadata `/Creator = MYLA ERP`, `/Subject = Built for Progress. CONSTRUCTION & INDUSTRIAL MANAGEMENT`; extracted page text contains MYLA, the motto and the descriptor.
- Seeded sample attachment smoke test: HTTP 200 `application/pdf`; extracted page text contains MYLA, the motto and the descriptor.
- `npm run env:check` passes; `.env` remains Git-ignored and no real secret values appear in tracked files.
- `npm run db:seed` restored the clean demo dataset after the browser audit: 616 records, 7 users, 34 modules, 6 wallets, 14 ledger entries, 4 sample PDFs. Final live state: 1 organization, 7 memberships, 0 QA users, `ok=true` integrity, 0 broken references, 0 wallet/funding mismatches, `$11,000,000` total wallet balance, last-owner trigger enabled.
- A repository-wide legacy product-name scan returns no product-facing matches; remaining lowercase `buildops*` strings are the intentional infrastructure identifiers listed above.

## Visual refinement verification

After the logo-based visual refinement, the exact published build passed:

- `npx tsc --noEmit`, `npm run build` and `npm run env:check`.
- `npm run audit:browser`: **28/28 passed**, 0 console/page errors.
- `node scripts/design-qa.mjs`: **15/15 passed** across 54 routes and five viewports, including authentic-logo loading, exact route titles, no horizontal overflow, restrained radii, no decorative gradients/blur/nested cards, visible keyboard focus, reduced-motion support and dark mode.
- `npm run audit`: **1211/1211 API checks** and **22/22 core-derivation checks**.
- Generated PDF smoke test: HTTP 200 `application/pdf`, with the embedded MYLA logo and correct MYLA metadata.
- `npm run db:seed` restored the clean demo dataset; QA organizations/users/invitations were removed and the last-owner trigger was re-enabled.

The **10/10 onboarding/tenancy/RBAC** gate was proven before this visual refinement and is documented in `ONBOARDING_AUDIT_REPORT.md`; it was not re-run because the refinement did not change onboarding, auth or derivation logic.
