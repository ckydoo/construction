# MYLA plain-language terminology

**Rule:** MYLA speaks the way a small building, civil or industrial contractor in Zimbabwe
speaks. Plain words first; the formal industry word may follow in brackets where a
quantity surveyor, engineer or accountant will look for it. Technical product words
(database, API, RLS, middleware, module derivation, capability) never appear in
customer-facing screens.

This applies to display text only. **Resource IDs, module IDs, role IDs, status values,
field keys, API routes, database columns and the lowercase `buildops*` infrastructure
IDs are deliberately unchanged** — so data, permissions, integrations and QA keep
working exactly as before.

## Zimbabwe / Southern Africa pack

| Topic | MYLA wording |
|---|---|
| Money | USD and ZWG (Zimbabwe Gold) side by side; "main currency" instead of "base currency" |
| Tax | 15% VAT, **tax invoice**, **tax clearance**, VAT / TIN number |
| Payroll | **PAYE / NSSA**, wages, take-home pay, payslips |
| Payments | bank transfer, **RTGS**, **mobile money**, cheque |
| Company | **(Pvt) Ltd**, **company reg. / CR14 no.**, trading name vs registered name |
| People | **national ID / passport**, staff & workers, site crews, foreman |
| Land | **stand** (a plot), stands / units / estates |
| Contracts | **NEC / FIDIC / JBCC**, variation, retention, payment certificate, snag list |
| Safety | **NSSA**, toolbox talk, safe-work check, incident, near miss |
| Buying | supplier (not vendor), material request, order, **delivery note**, stores / yard |
| Plant | plant & equipment (not fleet/assets), service / repair |
| Dates & places | `en-GB` dates, city / town, province, mobile / WhatsApp-friendly phone |

Scope note: the first regional pack is Zimbabwe and Southern Africa. Country, currency,
tax and contract wording are data/configuration, so other African countries can be added
later without changing the application's structure.

## Plain words across the app

| Instead of | MYLA says | Why |
|---|---|---|
| Project | **Job** / Jobs & projects | A two-person contractor runs "jobs" |
| Estimate / bid | **Quote** / **Tender** | What you send a client and what you submit |
| Lead / opportunity | **Enquiry / lead** | "A client called about a job" |
| RFI | **Site query** | A question from site that needs an answer |
| Submittal | **Drawing approvals** | Shop drawings and samples sent for a decision |
| Change order / VO | **Variation / extra** | Local contract language |
| WBS / cost code | **Job tasks & programme** / job cost | No scheduling jargon |
| Punch list | **Snag list** | Used across Southern Africa |
| GRN | **Delivery note** | What the storeman signs |
| Vendor | **Supplier** | Local usage |
| Requisition / PO | **Material request** / **Order to supplier** | Short and obvious |
| Inventory | **Stock & materials** | "What's in the store" |
| HR / workforce | **Staff & wages** | Small firms do not have an "HR department" |
| Pay run | **Payroll & payslips** | Everyone understands payday |
| HSE | **Safety on site** / Site checks | NSSA rules, plainly described |
| NCR / ITP / CAPA | **Faults & rework** / **Checklists & test plans** / follow-up | Rework, not acronyms |
| Chart of accounts / AP / AR | **Account codes** / Money owed to you / Who you owe | Bookkeeper-friendly |
| Budget vs actual (CVR) | **Budget vs actual** | No earned-value jargon |
| Business intelligence / BI | **Reports** | A list you can print or download |
| Module / resource | **Section** / **list** | "Switch a section on" / "2 lists" |
| Workspace | **Your company** where it reads naturally | One company, one place |
| Capability / RBAC / RLS | **Who can see what** | Explained as people and permissions |
| Scope (portal) | **Own jobs only** | A client sees their own work |
| API / integrations | **Connections & add-ons** | For larger companies later |

## Sidebar sections

`Overview` → `Clients & quotes` → `Jobs & sites` → `Materials & suppliers` →
`Staff & wages` → `Safety & quality` → `Money & invoices` → `Reports & extras` →
`Specialist modules` → `Settings`. Dashboard, Documentation, Client wallets, Reports and Settings are fixed
entries; everything else is switched on from the sections enabled for your company.

## One place for files

- **Document library** — folders, uploads and file revisions.
- **Document register** — drawing numbers, revisions and issue status.
- **Drawing approvals** — the approval workflow for shop drawings and samples.

## Built for very small companies

- Onboarding starts at **Very small (1–10 people)** and says plainly that a
  two-person workshop uses the same system as a large contractor.
- **Start small** is a first-class choice: the essentials pack is one chain from
  client → quote → job → invoice → payment. Everything else is optional and can be
  switched on later in Settings → Sections.
- The documentation page opens with the **business flow** (win work → do the work →
  get paid), not the software architecture.
- Sample data uses local names, `(Pvt) Ltd`, Harare, USD/ZWG, tax invoices, NSSA/PAYE
  and RTGS/mobile-money payments.

## What was intentionally not changed

IDs, slugs, status codes, seed record keys, API paths, SQL, RLS policies, role matrix,
validation rules and module derivation logic. Changing a label never changes behaviour.
The old formal words may still appear in developer comments, SQL identifiers and
engineering docs; those are not customer-facing.
