# BuildOps browser / UI audit

**20/20 checks passed** — real Chromium against `http://127.0.0.1:3000`.

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
| no uncaught page errors | PASS | 0 pageerror events |
| no React hydration / console errors | PASS | 0 console errors |

Unexpected console errors: 0 · Expected (simulated 500 rollback): 1 · Uncaught page errors: 0

Screenshots: `screenshots/01-login.png` … `11-mobile-menu.png`.

Run: `node scripts/browser-audit.mjs` (after `npx playwright install chromium-headless-shell`).
