# WO H4.8 — REST `/api/v1/hr` (first cut, PDPA-first) + guide + skill `shark-hr-api`

> Worktree `/root/projects/shark-hr-l4` · branch `wip/hr-h4.8` cut from `session/hr` 38e3be6fa (oracle commits 2ed0d51b5, 52a3bd5d0) · builder: Claude Opus 5.5 · 14 Nov 2026
> Brief `ledger/hr-briefs/hr-brief-H4.8.md` (+ CONTROLLER RULINGS 14 Nov) · oracle contract `ledger/wo-notes/hr-H4.8-oracle.md` · oracle **not edited** · DB = lane DB via `scripts/qc-hr.sh` · **no migration**

## 0. Checkpoint
- done: build + docs + skill; qc-hr-h4.8 forced 41/41 (×3) + unforced; regression list in §5; fitness both modes; clean typecheck.
- done (fix round): rulings 1–11 applied, merged session/hr 292bc5b7e, all listed suites green, typecheck clean.
- next: controller re-run + merge.

## 1. Files
| file | new/edited | what |
|---|---|---|
| `src/lib/modules/hr/api/{config,actor,op,http-errors,serialize,registry,dispatch,openapi,keys}.ts` | new | module plug-in (POS P2.13 layout) |
| `src/lib/modules/hr/api/ops/{employees,roster,leave,reports,payslips}.ts` | new | 14 ops |
| `src/lib/modules/hr/api-key-actions.ts` | new | `"use server"` wrappers → `api/keys.ts` |
| `src/app/api/v1/hr/[...path]/route.ts` · `…/openapi.json/route.ts` · `src/app/developers/hr.md/route.ts` | new | thin routes |
| `src/app/app/sys/[id]/hr/settings/ApiKeysCard.tsx` | new | owner-only key card, O1 consent checkbox |
| `scripts/gen-hr-api-docs.mts` · `docs/api/HR-API.md` · `skills/shark-hr-api/{SKILL.md,references/{endpoints,recipes}.md}` | new | generated doc + endpoints, hand-written skill |
| `src/lib/core/permissions.ts` | marked hunk | `hr.employee.read` / `hr.roster.read` (brief labels) |
| `src/lib/api-keys/scopes.ts` | marked hunks | `HR_SCOPE_KEYS`, bundle ids, `hr-read` / `hr-leave` / `hr-payroll-read` |
| `hr/roster.ts canRead` · `hr/roster-board.ts canReadRoster` · `hr/privacy.ts openProfile` | one OR-term each (marked) | ruling Q1 additive |
| `src/components/account-v2/ConnectionsPanel.tsx` | marked hunk | 3 Thai lines in `BUNDLE_HELP_TH: Record<ApiScopeBundleId,…>` (forced by the new bundle ids — typecheck) |
| `scripts/qc-hr-h3.8.mts` | ORACLE-EDIT (pre-authorised frozen-static re-take) | S1.13 privacy.ts sha pin 9b95844d… → ba518b3d… (the marked openProfile OR-term) |
| HR settings `page.tsx` (import + owner-only slot) · `developers/page.tsx` (link) · messages th/en `hr.apiKeys.*` · `hr-ui-inventory.json` (17 rows wo H4.8) · `visual-hr.mts` `"4.8"` | marked | UI wiring |

## 2. Decisions (how each brief section was met)
- **D1/D2 layout**: copy of POS (`defineHrOp` sets `module:"hr"`, `auditAction:"hr.api.<id>"`, no `tool`; `HR_API_CONFIG` module/HR/`hr.`/`hr`). Core `src/lib/api/**` untouched.
- **Ruling 4 (bound keys only)**: core gives `makeActor` no "bound?" bit, so `hr/api/dispatch.ts` reads the bearer's bound system (`verifyApiKeyDetailed`, read only — 401s still come from core) and builds a per-request config whose actor has `can()` = false for every action unless `key.systemId === resolved systemId`. Result: an unbound key with hr.* + `X-Shark-System` gets exactly the core 403 `scope_missing` of a bound key without hr scopes (A2c). The static `HR_API_CONFIG.makeActor` is fail-closed (unbound).
- **R2 actor**: synthetic viewer `{STAFF, ["*"], key scopes minus hr.payroll.read, "apikey:<keyId>"}` for scope-only readers; `hrIssuerViewer` (live accepted Membership of `createdById`, OWNER only) used only in `ops/reports.ts` + `ops/payslips.ts`. `defineHrOp` wraps every handler with `assertHrIssuer` → 403 `forbidden` + fixed text when the issuer is not an accepted OWNER (A7b). Issuer membership read once per request (cached on the actor via WeakMap).
- **R4 serializers**: `serialize.ts` builds every object key by key from a fixed list, never spreads (S8/P1). Employee DTO never carries sensitive fields even with pay scope. Reports keep catalogue columns of class P, + `$` only when the key holds `hr.payroll.read`, never `I`; totals only for kept summed columns; warnings only for kept columns. Slip = SlipDto − ok − bankMasked; history drops `href`.
- **R5 refusals**: single `hrNotFound()` (same bytes for foreign/unknown); roster/report limits → 422 `unprocessable` with reader text; non-ISSUED slip / slip data problem → 409 `state_conflict`; leave overlap → 409 `duplicate`; other `HrLeaveRequestError` → 422 `unprocessable` with the service's Thai text. All refusals thrown before writes carry `nothingWritten`.
- **R6**: employees: `listEmployees(ctx, 501, scope)` → sorted (name,id) in code-unit order, page/pageSize ∈ {10,20,50} (zod), `truncated` when >500. Leaves: `leaveItemsForViewer` (cap 100 → `truncated`) enriched by `leaveDetailsMany` (employeeId/policyName/halfDay/hours/days), sorted (fromDate desc, id). Roster ≤ 31 days (reader), published only. Attendance month = 1 employee. Report LIMIT → 422.
- **POST /leaves**: zod `.strict()` `{employeeId, policyId?, type?, fromDate, toDate, halfDay?, hours?}`; handler re-checks `hr.leave.decide` (403 `scope_missing`), needs policyId or type, employee via `service.getEmployee` (404), employee linked to issuer or to any accepted OWNER → 403 `forbidden` (no auto-approve path), branch check at fromDate (`unitTargetOf`), policyId → category (mismatch 422), then `requestLeave(… reason:null, actorUserId: issuer)` — same validation/lock/chain as the UI. Returns `{id, status:"PENDING"}`; core audit `hr.api.leaves.create` (API_KEY, keyName, target HrLeave), no name/reason. Idempotency (replay, conflict, in-progress race) = core.
- **R8 pay audit**: `auditPayRead` writes `hr.api.payslip.read {runId, employeeId}` / `hr.api.payslip.history {employeeId, taxYear}` / `hr.api.report.read {report, period, unitId}` via `tenantDb(...).auditLog.create` **before** answering and without swallowing errors (fail closed: no audit row ⇒ no pay data). Pay reads in the `report` bucket.
- **R3 issuer** (`hr/api/keys.ts`): OWNER in session **and** accepted OWNER row in DB + `api.key.create/revoke`; system must be HR of the tenant; bundle ∈ hr-* (default hr-read) or custom scopes ⊆ ∪hr-*; pay scope ⇒ `payConsent:true` and TTL ≠ 0; TTL ∈ {30,90,365,0}; audit `hr.apikey.issue {keyId, scopes}` / `hr.apikey.revoke {keyId}`; revoke only keys bound to this HR system. Card is rendered for OWNER only; consent checkbox default off with the O1 label.
- **Docs**: `gen-hr-api-docs.mts` (renderDocs / renderEndpointsReference pure, `--check`). Note: the gen script imports `payslip.ts` → `self.ts` → `payslip-ui` → `core/context` → `env.ts`, so a standalone run needs `SESSION_SECRET` in env (inside the oracle it inherits the QC env; I generated with a dummy value on the command line, nothing stored).

## 3. §F self-check
1. [x] No new page (card on existing settings page; API routes only) — `qc-nav-functions` not affected.
2. [x] No `$transaction` / `tenantDb(` inside a tx body in the diff (no tx at all in hr/api).
3. [x] Scope: key viewer is all-branch (`["*"]`); issuer must be OWNER (all branches). Nothing branch-restricted to leak.
4. [x] Refusals: Thai fixed texts, identical 404 bytes; no ids/stack in messages; en ASCII (A10).
5. [x] No new tx options (requestLeave's own).
6. [x] No migration.
7. [x] Issuer/owner guards are read-only checks before the service; the write itself is `requestLeave` (own tx + lock).
8. [x] Rate limits = core DB buckets (`hr:api:<kind>:<keyId>`), count-first in core.
9. [x] No new outbox event (requestLeave emits its existing ones).
10. [x] Files ⊆ brief §5 list **+1 forced hunk, disclosed** (`src/components/account-v2/ConnectionsPanel.tsx`, typecheck — accepted by the controller) and, in the fix round, `src/lib/staff/service.ts` (ruling 2 server-side refusal, marked); hot files touched only as marked hunks (`permissions.ts`, messages).

## 4. Other key-issuing paths (task: can anything else mint a key the HR dispatcher accepts?)
Callers of `createApiKey`/`rotateApiKey`: account `connections-actions.ts` (scopes ⊆ `ACCOUNT_SCOPE_KEYS`, ACCOUNT system; rotate limited to ACCOUNT-bound account-only keys), CRM `settings/api/actions.ts` (crm bundles, CRM system), kanban `settings-actions.ts` (kanban bundles/keys, KANBAN system), member `api-actions.ts` + member REST `apikeys.create` (member bundles, bound to the member system), POS `api-key-actions.ts` (pos bundles, POS system), platform `/app/settings/api` (`createApiKey(ctx,name)` → unbound, scopes `[]`). **None can bind a key to an HR system, and none can grant hr.* scopes** (an hr.* scope on a non-HR-bound key is useless under ruling 4). No change needed outside HR; nothing in the frozen core needed.

## 5. Runs — full lines in `hr-H4.8-green.txt`
- qc-hr-h4.8: forced 41/41 ×4 (incl. final head), unforced 41/41 · residue none.
- green: qc-hr-h2.2 60/60 (after F6.1 fix) · h2.7 94/94 · h2.10 57/57 · h3.8 78/78 (after ORACLE-EDIT) · h3.9 60/60 · h0.1 67/67 · qc-hf-hr-privacy 194/194 · qc-audit-trail 21/21 · qc-pos-p0.2 56/56 · qc-account-api-keys 51/51 · qc-account-api-core 64/64 · qc-hf-apiv1-scope 143/143 · qc-public-api 18/18 · qc-crm-c1.10 66/66 (HTTP part SKIPPED, server down).
- fitness 53/53 + fitness-hr 9/9 with env (qc-hr.sh) and with `env -u DATABASE_URL -u DIRECT_URL` · typecheck clean (406 s, after the ConnectionsPanel hunk; first run 442 s found that TS2739).
- NOT green, outside this ticket:
  - seed-hr-qc 3/4: `setPin keng: ระบบยังไม่ได้ตั้งค่าความปลอดภัยของ PIN` (HR_PIN_PEPPER not available in this lane's env; pin.ts untouched) ⇒ HQC seed incomplete ⇒ qc-hr-h1.1 S9.2 80/81 (seeded home units/borrowing missing — data, not code).
  - qc-member-m1.11 7/10 + crash (member fixture count 63≠60, null profile) — shared-DB state; no member code touched.
  - qc-kanban-k1.15 28/30: S3.2/S3.4 = `skills/shark-kanban-api/references/endpoints.md` absent in the tree (static; same on base — `skills/` holds only shark-pos-api + shark-hr-api).
  - qc-pos-p2.13, qc-pos-api-skill: refuse the lane DB (QC4 only) — controller.

## 6. Debts / owner items
- **D-H48-cursor**: offset paging on `GET /employees` (an insert sorting before page 1 shifts later pages) — cursor paging later (ruling 1).
- D-H48-getemp: POST /leaves uses `service.getEmployee` (includes docs) only to read `linkedUserId`/existence; nothing leaves the server. A narrow reader would be cleaner (service.ts frozen here).
- D-H48-truncated: `leaves.list` cannot tell "exactly 100" from "more than 100" (reader take=100) → `truncated:true` at 100.
- D-H48-envgen: `gen-hr-api-docs` needs app env at import (payslip.ts import chain); `--check` inside the oracle is fine.
- Left out on purpose (brief §4): decisions/approvals, clock, edits/PIN/docs, payroll actions, bank files, filings, certificates, PDF/CSV/XLSX, register, labour cost (H4.2), opening YTD, webhooks, `hr.filter.unit:`.
- **O1 (owner)**: may an external system read payslips at all? Shipped behind the OWNER consent checkbox, default off; if the owner says no, remove ops `payslips.*` + pay reports from the registry and the `hr-payroll-read` bundle.


## 7. Fix round (review MERGE WITH NOTES + hunt 1 MAJOR / 3 MINOR · controller rulings 1–11, 15 Nov)
| ruling | what was done |
|---|---|
| 1 (hunt F1 = review M2) | `reports.get` audits `hr.api.report.read` whenever the serialized answer carries `$` columns (`serialize.reportCarriesMoney(report, pay)`), i.e. OT/time/… read with a pay key too, not by the report's scope. Payslip ops always audit. No other op returns money. |
| 2 (review M1) | `API_KEY_ONLY_PERMISSIONS` in `permissions.ts` (marked): kept in `PERMISSIONS` (scope registry) but removed from `PERMISSION_MODULES` (staff editor + level presets); `staff/service.ts validatePermissionInput` refuses them with a Thai reason (marked hunk); the 3 reader OR-terms now also require `userId` starting `apikey:` (only the synthetic key viewer) ⇒ a human member holding either key gains nothing. Labels now start "คีย์ API:" and say what is left out. ConnectionsPanel hunk accepted; §F.10 corrected. |
| 3 (F2) | `op.ts HR_DAY / HR_MONTH / HR_PERIOD` = real calendar values, years 2000–2600 (period also accepts a real day so `register` still answers 404). Used by roster from/to, attendance day/month, POST from/to, report period ⇒ 422 `validation`; `judge.ts` fallback-to-today is unreachable from the API. |
| 4 (F3) | `keys.ts` refuses names containing C0/C1 controls (incl. NUL), bidi marks/overrides/isolates and U+2028/2029 with a Thai VALIDATION; the card list shows `displayKeyName` (same set stripped). Core audit `after.keyName` comes from names issued by this path only. |
| 5 (F4) | ended (`active=false`) employees hidden: `GET /employees/{id}`, attendance month, payslip history, payslip, `POST /leaves` ⇒ the same 404 bytes as an unknown id; removed from the attendance day board (totals recomputed) and from `GET /leaves`. **Payslips: the brief does not document ended employees ⇒ 404 too** (final-pay payslips stay in the app). |
| 6 (I1 + N1) | HR dispatcher, after the key verifies: a write op needs `Content-Type: application/json` (else 415 `invalid_json`; POS has no house rule, `invalid_json` is the closest core code) and any `__proto__`/`constructor`/`prototype` key ⇒ 422 `validation`, before idempotency. `POST /leaves` answers the stored status (read back with `leaveDetailsMany`). |
| 7 (M3) | OpenAPI description, HR-API.md error table and SKILL.md: shop-wide key ⇒ 400 `system_required` without the header, 403 `scope_missing` with it, other system ⇒ 403 `system_mismatch`. `/developers/account` lists `API_SCOPE_BUNDLES` of every module (kanban/member/crm/pos too) ⇒ hr-* kept there. |
| 8 | oracle F1–F6 + S6/A14 edits (see oracle notes §5); RED with the fix reverted 40/47; hunter probes in `hr-H4.8-hunt-probes/`. |
| 9–10 | seed re-run; merged `session/hr` 292bc5b7e: settings page imports both cards; inventory rows 3-way by page+testid (516 base, +17 ours, +24 theirs = 557, 0 lost); messages auto-merged, all keys of both sides present; `prisma generate` + `prisma migrate status` = up to date (225 migrations, nothing pending); qc-hr-h3.8 S1.13 pin re-taken (bbf7604b…). |
Open: leaves of ended employees still count toward the 100-row reader cap before filtering (a full page can come back shorter, with `truncated:true`).
