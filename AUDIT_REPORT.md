# BuildOps module & CRUD audit

Updated 2026-11-09 08:07 · `http://127.0.0.1:3000`

**1028/1028 API checks passed** across 49 resources and 33 modules, plus **22/22 derivation checks** (`npm run audit`).

| Area | Checks | Passed | Failed |
|---|---:|---:|---:|
| auth | 1 | 1 | 0 |
| connectivity | 28 | 28 | 0 |
| crud | 976 | 976 | 0 |
| gating | 15 | 15 | 0 |
| isolation | 1 | 1 | 0 |
| rbac | 7 | 7 | 0 |

## Verified

- **Every resource**: list, refs, create, sequence number, derived title, status default, detail shape (row + comments + files), partial PATCH with field preservation, comment create + visibility, search, status filter, CSV export, sort, validation rejection, delete, soft-delete hiding, bulk delete.
- **Connectivity**: client → project links, 12 modules linked to one project, project-scoped filters, project 360, global search across modules, overview aggregates, and rejection of references to non-existent records. All 1,196 seeded reference values resolve to live records.
- **RBAC**: portal user can read but cannot create/edit/delete/bulk-delete; unauthenticated requests blocked.
- **Module gating**: disabling a module blocks list, create, detail, edit, delete, bulk, CSV; re-enabling restores access. Essentials/full pack switching is also tested.
- **Tenant isolation**: unknown/unauthorised org rejected.
- **Derivation**: 12 essentials present for all 8 company types and all 5 sizes; resources match enabled modules exactly; add-ons and type-defining modules honoured; enterprise still unlocks the broad pack.

## Defects found and fixed

1. **PATCH wiped every field it did not receive.** `updateRecord` validated the request body in isolation, so a partial update nulled all other fields and failed whenever a required field was omitted. It now merges the stored JSON with the incoming keys before validating.
2. **Broken cross-module links were accepted.** `validateRefs` now checks each ref points to a live record of the correct resource in the same organisation, on both create and update.
3. **Seed data contained 5 dangling references** (`emp-41/42`, `acc-25`). The generator now draws employee refs from the actual generated id list and account refs from the real chart-of-accounts length.
4. **Disabling a module only blocked the list view.** A shared `guardResource` guard now protects every record, file, comment, project-360 and overview route.
5. **Sorting on data-backed columns only sorted the current page.** Rows are now fetched, sorted, then paginated.
6. **Bulk delete reported a count that could include non-existent ids.** It now returns the real `updateMany` count.
7. **Comments could be posted against arbitrary record ids.** The route now verifies the record exists, is not deleted, belongs to the org and matches the enabled resource.

## Scope decision — essentials first

New workspaces no longer start with all 33 modules. `STARTER_MODULE_IDS` defines **12 connected essentials**:

`dashboard · company · crm · pipeline · estimating · projects · contracts · documents · finance · hr · time · reports`

That is one commercial chain — clients → leads → estimates & bids → projects → contracts → documents → invoices → payments — plus people and reporting. Type, size, qualifiers and explicit add-ons layer on more modules on a ramp (MICRO 12 → SMALL 12–13 → MID 16 → LARGE 28 → ENTERPRISE 32), so company type and size still derive the pack as originally specified.

- Onboarding step 5 labels core modules, lists every optional add-on, and offers **Enable all** / **Reset to essentials**.
- Settings → Modules has one-click **Essentials (12)** / **All modules** focus switching; individual toggles still work.
- The seeded demo organisation intentionally keeps all 33 modules enabled as the enterprise reference workspace (and so the audit can exercise all 49 resources).

## Browser verification (added)

A real Chromium suite now covers the client side: **20/20 checks passed** — login/hydration, client-side sidebar navigation, loading skeletons, empty states, optimistic create (temporary row → success toast → persists after reload), detail drawer with comments/attachments/PDF, comment posting, partial edit through the UI, inline validation errors, **optimistic rollback on a simulated 500**, status filter and sort, CSV download, dark mode, Ctrl+K command palette, mobile layout with zero horizontal overflow, mobile menu, and UI delete. There were **0 uncaught page errors and 0 unexpected console errors** (the single 500 is the deliberate rollback simulation).

See `BROWSER_AUDIT_REPORT.md` and `screenshots/01-login.png` … `11-mobile-menu.png`.

Still not covered: multi-tenant data leakage between two *real* provisioned orgs.

## Re-run

```bash
npm run audit           # API suite (1028) + derivation suite (22)
npm run audit:core
npm run audit:browser    # requires: npx playwright install chromium-headless-shell
npm run audit:all
```

Machine-readable results: `AUDIT_REPORT.json`.
