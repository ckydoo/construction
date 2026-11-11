# Simplicity pass — one place for files, plain words, less clutter

## Product decision

MYLA should feel obvious to a small contractor on a cheap phone: **one obvious
place for files, one obvious place for approvals, one obvious place for costs
and payments**. Specialist registers stay available, but they are not pushed in
front of companies that do not use them. Resource IDs, module IDs, routes,
database records and workspace currencies did not change.

## What changed

### One obvious file entry

- **Document library** is now the only file entry in the sidebar.
- The raw controlled list is renamed **Document register**. It is hidden from
  the sidebar but remains one click away inside the library
  (“Open document register”), so drawing numbers, revisions and issue status
  are still available when needed.
- **Drawing approvals** replaces “Drawings for approval”. It is the approval
  workflow, not another file library.
- Documentation now explains the difference in plain words: library = files,
  register = drawing numbers and revisions, approvals = decisions.

### Plain labels everywhere

| Before | Now |
|---|---|
| Drawings for approval | Drawing approvals |
| Drawings & documents / Documents & drawings | Document register / Document library |
| Stands, units & sales / Stands, sales & warranties | Stands & unit sales |
| Plant hire & dispatch | Leases & rentals |
| Settings → Modules | Settings → Sections |

Settings now says **Sections**, **lists**, **Sections on**, **Record lists**,
**Country settings**, **Main currency** and **Job limit** instead of
“resources”, “modules enabled”, “resource types”, “regional pack”, “currency”
and “project limit”. The company section is grouped as **Company setup** rather
than appearing as a second “Settings” heading inside Settings.

### Specialist modules out of the way

- `portal`, `unitSales`, `rental`, `commissioning` and `integrations` now live
  in a **Specialist modules** catalogue group.
- Their resource labels and groups were aligned with their Settings names.
- The group heading is hidden automatically when every specialist module is
  switched off, so an empty heading does not clutter the demo sidebar.

### Kestrel Ridge demo config

Switched off `unitSales`, `rental` and `commissioning` for Kestrel Ridge and
removed their three resources (`units`, `rentalContracts`, `commissioning`)
from the enabled resource list. The live workspace now has **31 modules / 46
resources**. This is a visibility/configuration change only:

- **620 active Kestrel records preserved**
- 10 stands/units, 6 leases/rentals and 6 handover packs still in the database
- USD base currency and all currency rates preserved
- no records, attachments, audits or notifications deleted

### QA and docs kept honest

- New read-only `npm run audit:simplicity`: 9 checks covering login, sidebar
  wording, library-first navigation, the in-library register link, Settings
  labels, disabled specialist routes and console errors.
- `scripts/onboarding-audit.mjs` and `scripts/finance-module-audit.mjs` now
  assert the new labels.
- `scripts/finance-module-audit.mjs` and `scripts/audit.py` cleanup now
  restore the **exact original section set** instead of forcing the full pack.
  This prevents future QA from silently re-enabling deliberately hidden
  specialist modules.
- `README.md`, `TERMINOLOGY.md`, the in-app Documentation page, onboarding
  copy and generated-report wording were aligned.

## QA results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| Clean `npm run build` | 0 errors |
| Core catalogue audit | 22 / 0 |
| Workflow definitions | 29 / 0 |
| Profitability definitions + browser | 6 / 0 + 5 / 0 |
| Three-way match definitions + browser | 9 / 0 + 5 / 0 |
| Topbar personal display currency | 30 / 0, 0 mutating requests |
| Simplicity browser audit | 9 / 0 |
| Live Supabase after QA | 620 active records, 0 new records / audits / notifications |

## Delivery

Committed on `main`, pushed to `origin/main`, and released through an explicit
new-SHA Vercel production deployment. No environment variable, Vercel project
setting or database migration was changed for this pass.
