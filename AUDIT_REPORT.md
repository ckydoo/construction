# BuildOps module & CRUD audit

Generated 2026-11-09 07:58 against `http://127.0.0.1:3000`.

**1023/1023 checks passed** across 49 resources and 33 modules.

| Area | Checks | Passed | Failed |
|---|---:|---:|---:|
| auth | 1 | 1 | 0 |
| connectivity | 28 | 28 | 0 |
| crud | 976 | 976 | 0 |
| gating | 10 | 10 | 0 |
| isolation | 1 | 1 | 0 |
| rbac | 7 | 7 | 0 |

## What is verified

- **Every resource**: list, refs, create, sequence number, derived title, status default, detail shape (row + comments + files), partial PATCH with field preservation, comment create + visibility, search, status filter, CSV export, sort, validation rejection, delete, soft-delete hiding, bulk delete.
- **Connectivity**: client → project links, 12 modules linked to one project, project-scoped filters, project 360 endpoint, global search across modules, overview aggregates, and rejection of references to non-existent records.
- **RBAC**: portal user can read but cannot create/edit/delete/bulk-delete; unauthenticated requests blocked.
- **Module gating**: disabling a module blocks list, create, detail, edit, delete, bulk, CSV, and re-enabling restores access.
- **Tenant isolation**: unknown/unauthorised org rejected.

## Defects found and fixed

1. **PATCH wiped every field it did not receive.** `updateRecord` validated the request body in isolation, so a partial update nulled all other fields and failed whenever a required field was omitted. It now merges the stored JSON with the incoming keys before validating.
2. **Broken cross-module links were accepted.** Reference fields could contain any string. `validateRefs` now checks each ref points to a live record of the correct resource in the same organisation, on both create and update.
3. **Seed data contained 5 dangling references** (`emp-41/42`, `acc-25`). The generator now draws employee refs from the actual generated id list and account refs from the real chart-of-accounts length. Re-checked: 1196/1196 refs resolve.
4. **Disabling a module only blocked the list view.** Create, detail, edit, delete, bulk delete and comments remained reachable. A shared `guardResource` guard now protects every record route, plus files, comments, project 360 and overview.
5. **Sorting on data-backed columns only sorted the current page.** Rows are now fetched, sorted and then paginated.
6. **Bulk delete reported a count that could include non-existent ids.** It now returns the real `updateMany` count.
7. **Comments could be posted against arbitrary record ids.** The route now verifies the record exists, is not deleted, belongs to the org and matches the enabled resource.

## Not covered by this suite

- Browser hydration and client-side behaviour (optimistic rollback, drawer/form interactions, toasts, dark mode, responsive layout). The suite exercises the HTTP API that backs them.
- Multi-tenant data leakage between two *real* orgs (requires a second provisioned workspace).

## Re-run

```bash
npm run audit
```

Full machine-readable results: `AUDIT_REPORT.json`.
