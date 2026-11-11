# Tester findings — fix release

This release closes all five issues found during the self-run pilot mission in
the isolated tester workspace. It is a **fix-and-clarity pass**: no new tables,
no migration, no environment-variable change, no project-setting change, no
billing change, and no live Kestrel Ridge business-record change.

## What changed

1. **Starter dashboard 403 fixed**
   - `src/app/[org]/dashboard/page.tsx` no longer requests profitability or
     three-way-match data until the owning sections and resources are enabled.
   - The three-way guard now also checks `apBills`, matching its API guard.

2. **Quote action clarified**
   - `src/components/ResourceTable.tsx` now shows **Open Quote Studio** on the
     quotes list instead of the misleading **New Quote**, in both the header and
     the empty state.

3. **Convert buttons clarified**
   - `src/components/ConvertFlow.tsx` now labels each action with the actual
     step — **Log an enquiry**, **Convert to quotation**, **Award as job +
     contract**, **Create tax invoice directly**, **Record receipt in full** —
     instead of a generic **Create**.

4. **Starter money loop completed without enlarging the starter pack**
   - `src/lib/conversions.ts` adds `job-to-invoice`, a direct
     **Job → Tax invoice** conversion for workspaces that do not use payment
     certificates.
   - `src/lib/conversion-chain.ts` marks the certificate stage optional.
   - The starter pack remains **13 sections / 19 lists** and does not enable
     `paymentApps`.

5. **Form metadata race fixed**
   - `src/components/RecordForm.tsx` keeps all non-hidden fields visible until
     workspace settings arrive. Required reference fields such as
     **Job / project** no longer disappear while the form is loading.

## QA

Credential-free static audit: `npm run audit:test-fixes` — **8/8**.

Local production-build preview:

- `npx tsc --noEmit` — **0 errors**
- Clean `npm run build` — **0 errors**
- `npm run audit:defs` — **pass**
- `npm run audit:core` — **CORE AUDIT PASSED**
- `npm run audit:simplicity` — **9/9**
- `node scripts/tester-here-smoke.mjs` — **22/22**
- `node scripts/tester-here-mission.mjs` — **50/50**, including the full
  client → enquiry → quote → job + contract → upload → tax invoice → receipt
  chain, with no console errors or forbidden requests.

The detailed run report and screenshot are local tester artifacts. They are
intentionally gitignored because `TESTER_ACCOUNT.json` contains live test
credentials; none of those credentials are committed to the public repository.

## Delivery

A single explicit production deployment is created from this commit at
https://myla-construction-erp.vercel.app. The deployment must be verified as
READY/PROMOTED with the production alias still assigned. No duplicate
deployment, rollback, manual promotion, env change, migration or project-setting
change is part of this release.
