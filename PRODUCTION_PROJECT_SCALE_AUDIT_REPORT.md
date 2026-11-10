# Project detail & scalability QA

Base: `https://myla-construction-erp.vercel.app`
Production build: `7bc17d0050f809e209356c285eb757bb71cc1378` · `dpl_3xiHJ5Go5PTVEzoqbTDWdtWQW7wk`

**8/8 checks passed.**

| Check | Result |
| --- | --- |
| owner signs in | ✅ session ready |
| register list is paged on the database | ✅ 1 of 5 jobs · 5 pages |
| project row click opens the full page, not a drawer | ✅ /kestrel-ridge/projects/5eb6b265-aa92-4eff-a36d-5a43f2f30836_prj-5 |
| full project page exposes all sections and record/files panels | ✅ 8 tabs · fields, links, comments and revisions inline |
| deep ?open= project link redirects to the full page | ✅ /kestrel-ridge/projects/prj-5 |
| form reference dropdown searches the server | ✅ server search → Pomona Industrial Plant Expansion |
| project filter dropdown is searchable | ✅ Pomona Industrial Plant Expansion · filtered rows visible |
| no console or page errors | ✅ 0 errors |

Evidence: `screenshots/production-project-detail-full-page.png`, `screenshots/production-project-detail-record-files.png`, `screenshots/production-project-searchable-dropdown.png`, `screenshots/production-project-searchable-filter.png`.
