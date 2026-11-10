# Role, currency and document-library QA

- Base: `https://myla-construction-erp.vercel.app`
- Date: 2026-11-10T14:59:55.171Z
- Result: **16/16 passed**
- Screenshot: `screenshots/feature-library.png`

| Check | Result | Detail |
|---|---|---|
| owner sees the whole company | PASS | 5 jobs · 9 wallets · 7 users |
| internal staff see fewer jobs and fewer wallets than owner | PASS | project 2/2 · finance 2/2 · HR 2/2 · safety 4/4 · procurement 3/3 |
| two staff roles have genuinely different job sets | PASS | PM 2 jobs · safety 4 jobs · hidden 36_prj-5 |
| external client portal remains scoped | PASS | 1 job · 1 wallet |
| wallet detail and global search deny hidden records | PASS | wallet 403 · search clean |
| unassigned staff account sees no jobs, wallets or wallet money | PASS | cleared → 0 jobs / 0 wallets → restored |
| Settings saves enabled currencies and manual rates | PASS | USD base · 5 currencies · ZWG 26 |
| a ZWG invoice converts to USD in dashboard totals | PASS | 260000 ZWG → 10000 USD |
| changing the base currency re-expresses every saved rate | PASS | USD → ZWG → ZAR, rates preserved |
| Reports and wallets expose base-currency FX data | PASS | ZAR · 3 currency rows |
| library exposes one folder per job and four automatic buckets | PASS | 5 jobs · Drawings / Contracts / Site photos / Handover |
| nested custom folder, upload, revision chain and owning record | PASS | QA Structural ate834 · Rev A/B · DOC-0065 |
| moving a document keeps every revision in the new folder | PASS | both revisions moved to Contracts |
| library hides folders and files on jobs a staff member cannot see | PASS | hidden from PM · download 404 |
| document library page renders folders, search and record links | PASS | folders · search · revisions · record links |
| QA cleanup restores live demo data | PASS | currency, assignment, records, files and folders restored |
