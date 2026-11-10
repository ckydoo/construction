# Production API audit — tenant-branded financial documents release

- Base: `https://myla-construction-erp.vercel.app`
- Production commit: `fa2a960d1e35aef850a449ffac2e584508fc495c`
- Deployment: `dpl_66k3jB3Uc6fST34Esw4uSTxniTCf` · `READY / PROMOTED`
- Generated: 2026-11-10T15:47:35.748772+00:00
- Result: **1290/1290 API checks** and **22/22 core derivation checks**, with **0 failures**

| Area | Passed | Failed |
|---|---:|---:|
| `auth` | 1/1 | 0 |
| `connectivity` | 28/28 | 0 |
| `crud` | 976/976 | 0 |
| `finance` | 38/38 | 0 |
| `gating` | 16/16 | 0 |
| `isolation` | 1/1 | 0 |
| `linkage` | 12/12 | 0 |
| `rbac` | 7/7 | 0 |
| `roles` | 123/123 | 0 |
| `strict` | 40/40 | 0 |
| `tenants` | 10/10 | 0 |
| `wallet` | 38/38 | 0 |
| **TOTAL** | **1290/1290** | **0** |

The audit covered all 49 resources and 34 modules: CRUD,
connectivity, RBAC, gating, strict visibility, finance documents, tenant isolation,
wallets, linkages and role matrix.

## Targeted production verification

| Suite | Result |
|---|---|
| Finance / strict module audit | **13/13** |
| Role, currency and library features | **16/16** |
| Project scale and searchable dropdowns | **8/8** |
| Tenant-branded two-page quotation PDF | **14/14 content and layout assertions**, 10,588 bytes, 2 pages |
| Production smoke | all 11 endpoints `200`; `/meta` `Cache-Control: no-store`; 34 modules / 49 resources |
| Core derivation | **22/22** |

## Final live state

`integrity ok:true` · 619 records · 1,637 refs · 0 broken refs · 0 wallet mismatches ·
9 client wallets · $11,000,000 total balance. Company branding was restored to the
pre-QA profile (no custom logo, 0% deposit). Cleanup left 0 QA clients, 0 QA estimates,
0 QA organisations and 0 QA Auth users.

Evidence: `PRODUCTION_FINANCE_MODULE_AUDIT_REPORT.md`,
`PRODUCTION_FEATURE_AUDIT_REPORT.md`, `PRODUCTION_PROJECT_SCALE_AUDIT_REPORT.md`,
`screenshots/production-finance-quotation.pdf`,
`screenshots/production-finance-quotation-p1.png`,
`screenshots/production-finance-quotation-p2.png`,
`screenshots/production-finance-module.png` and `screenshots/production-project-*.png`.
