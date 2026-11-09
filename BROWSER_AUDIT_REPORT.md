# BuildOps browser / UI audit

**28/28 checks passed** — real Chromium against `http://127.0.0.1:3000`.

| Check | Result | Detail |
|---|---|---|
| login page renders | PASS | BuildOps — Construction & Industrial Management |
| owner login redirects to dashboard | PASS | kestrel-ridge/dashboard |
| sidebar navigates client-side (no full reload) | PASS | SPA navigation retained JS context |
| loading skeletons appear while list fetches | PASS | skeleton → rows |
| empty state on a search with no matches | PASS | No matching records shown |
| optimistic create shows temporary row, then persists | PASS | temp row → success toast → survives reload |
| detail drawer renders comments, attachments and PDF | PASS | all three sections present |
| post a comment and see it in the drawer | PASS | comment visible |
| partial edit via UI preserves other fields | PASS | Changes saved + table updated |
| required-field validation shows an inline error | PASS | error surfaced to the user |
| optimistic create rolls back on server failure | PASS | temp row removed + error toast |
| status filter and sorting do not crash the table | PASS | filter + sort OK |
| CSV export downloads a file | PASS | clients.csv |
| dark mode toggles the root class | PASS | false → true → back |
| command palette opens with Ctrl+K | PASS | palette open + ESC closes |
| mobile viewport: no horizontal overflow, bottom nav visible | PASS | overflow 0px, bottom nav present |
| mobile menu opens the sidebar drawer | PASS | sidebar drawer opens |
| delete via UI removes the QA record | PASS | soft delete + toast |
| wallet workspace opens from the sidebar | PASS | 9 client wallets, 11000000 available |
| wallet drawer shows the reconciled ledger | PASS | ledger entries + running balances visible |
| UI top-up increases the wallet balance | PASS | 2950000 → 2951000 |
| UI project funding debits the wallet and writes the ledger | PASS | balance 2950750 · allocation ledger entry visible |
| wallet reversals restore the opening balance | PASS | 10 QA entries reversed · balance 2950000 |
| client detail shows wallet balance and cross-module links | PASS | wallet balance + linked modules in the detail drawer |
| role matrix and link integrity render in settings | PASS | 14-role matrix + live integrity check |
| client portal role sees only its own wallet | PASS | 1 scoped wallet, no admin controls |
| no uncaught page errors | PASS | 0 pageerror events |
| no React hydration / console errors | PASS | 0 console errors |

Unexpected console errors: 0 · Expected (simulated 500 rollback): 1 · Uncaught page errors: 0

Screenshots: `screenshots/01-login.png` … `16-portal-wallet.png`.

Covers the essentials-first CRUD flow, client wallets, linked records, the role matrix and portal scoping.

Run: `node scripts/browser-audit.mjs` (after `npx playwright install chromium-headless-shell`).
