# Platform billing configuration QA

Generated: 2026-11-11T06:08:47.728Z

Result: **34 passed / 0 failed** (34 checks).

| Check | Result | Detail |
|---|---|---|
| anonymous GET is 401 | PASS |  |
| company owner GET is 403 | PASS | Forbidden: platform owner / superadmin access only. |
| company JWT direct table SELECT denied | PASS | permission denied for table platform_settings |
| throwaway superadmin A created + signed in | PASS | qa-platform-a-mwbpwzpn@example.com |
| superadmin GET config 200 | PASS |  |
| seed has USD 9/29/99 active | PASS | STARTER:9,PRO:29,ENTERPRISE:99 |
| seed billing disabled in DB | PASS |  |
| audit trail present | PASS | 26 rows |
| DB billing_enabled cannot bypass BILLING_ENABLED env | PASS | Cannot stage billing_enabled=true while the BILLING_ENABLED environment master switch is off. The database flag cannot bypass env. |
| gateway enabled guard while env off | PASS |  |
| DPO live mode guard without env credentials | PASS |  |
| secret-named field rejected | PASS | Field "body.fields.companyToken" is forbidden. Live credentials stay in encrypted environment variables, never in the database or API payloads. |
| nested secret in requirements rejected | PASS |  |
| updateSettings accepted | PASS |  |
| updateGateway accepted | PASS |  |
| future pricing version created inactive | PASS |  |
| activateDuePlans does not activate future version | PASS |  |
| pending pricing version retired/deleted | PASS |  |
| upsertOverride accepted | PASS |  |
| addAdmin via API | PASS |  |
| newly added admin can GET config | PASS |  |
| revokeAdmin via API | PASS |  |
| revoked admin loses access | PASS |  |
| audit log recorded staged changes | PASS | 26 -> 33 |
| final: exactly one active platform admin | PASS | 1 |
| final: no QA admin rows | PASS | 0 |
| final: DB billing still disabled | PASS |  |
| final: no gateway enabled | PASS | 0 |
| final: 3 active seed plans | PASS | 3 |
| final: no QA pricing plan left | PASS | 0 |
| final: 2 comped org overrides intact | PASS | 2 |
| final: audit trail retained | PASS | 41 rows |
| final: throwaway user qa-platform-a-mwbpwzpn@example.com deleted | PASS |  |
| final: throwaway user qa-platform-b-mwbpwzpn@example.com deleted | PASS |  |

## Cleanup

- restored platform_settings.maintenance_mode
- restored dpo requirements
- restored organization override note
- deleted qa-platform-a-mwbpwzpn@example.com
- deleted qa-platform-b-mwbpwzpn@example.com

Stage-only: no runtime wiring, no env/Vercel change, no deploy, no live charges or locks.
