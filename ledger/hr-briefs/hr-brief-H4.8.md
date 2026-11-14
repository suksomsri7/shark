# H4.8 — REST `/api/v1/hr` (first cut, PDPA-first) + guide + skill `shark-hr-api`

> **DRAFT r0 — Q defaults (§9) in force unless the controller rules.** Lane S · **PDPA + pay read ⇒ reviewer + hunter (privacy).** **No migration** (if one becomes needed: `20270112000000_hr_api_*`). Base `session/hr` f7d057202. Branch `wip/hr-h4.8`. Oracle `scripts/qc-hr-h4.8.mts` (imports `qc-hr-lib.mts`). Not in base: H4.2 labour cost, H3.4-YTD opening YTD, H4.3 HR AI tools.

## 1. Facts (verified on base)
F1 Core `src/lib/api/*`: key (401) → system (`X-Shark-System`) → DB rate limit per key (`require.ts API_RATE_LIMITS` 300/60/30 per min) → `op.action` (403 `scope_missing`) → zod → idempotency (`ApiIdempotency`, 24 h) → handler → audit (writes only, `run.ts`). Envelope/codes/`paged()` = `respond.ts`.
F2 Module plug-in to copy = **POS P2.13**: `src/lib/modules/pos/api/{config,dispatch,op,registry,actor,openapi,http-errors}.ts`, `src/app/api/v1/pos/[...path]/route.ts`, `…/pos/openapi.json/route.ts`, `src/app/developers/pos.md/route.ts`, `scripts/gen-pos-api-docs.mts --check`, `skills/shark-pos-api/{SKILL.md, references/endpoints.md (generated), references/recipes.md}`, key card `pos/api-key-actions.ts` + `app/sys/[id]/pos/settings/ApiKeysCard.tsx`. Oracles to imitate: `qc-pos-p2.13`, `qc-pos-api-skill` (recipe replay), `qc-kanban-k1.15`.
F3 Keys: `api.prisma ApiKey{scopesJson, systemId, expiresAt, createdById, revokedAt}`; scopes = RBAC keys (`api-keys/scopes.ts` header); bundles `API_SCOPE_BUNDLES` ⇒ new scopes need no migration.
F4 HR RBAC keys (`core/permissions.ts`): no read-only key for employees/roster/attendance — `roster.ts:124 canRead`, `roster-board.ts:60 canReadRoster` need `hr.employee.create`/OWNER/MANAGER; `privacy.ts hrAccessOf.openProfile` needs create/leave.read/pay.
F5 HR readers are (a) **scope-only** (decide from the passed viewer: roster, roster-board, judge, `leave.ts teamLeaveBalances`, privacy, `settings.ts list*`) or (b) **DB-membership gates** (re-read the accepted Membership of `viewer.userId`, role must match: `payslip.ts:103`, `reports.ts:113` — which then decides money/fullId from the DB row —, filings, bank-files). A synthetic key viewer fails (b).
F6 `requestLeave` (`service.ts:460`): employee linked to an OWNER ⇒ auto-APPROVED. UI on-behalf rule (`actions.ts:411`) = `hr.leave.request` + (`hr.employee.create`|`hr.leave.decide`) + branch check at `fromDate`.
F7 HR AI tools stay general-key only (`api/v1/ai/general-key-gate.ts`), untouched.

## 2. Decisions (house pattern)
D1 POS layout; `defineHrOp` sets `module:"hr"`, `auditAction:"hr.api.<id>"`; no op declares `tool` (H4.3). D2 `HR_API_CONFIG{module:"hr", systemType:"HR", scopePrefix:"hr.", rateNs:"hr"}` + messages (copy `pos/api/config.ts`). D3 Keys always bound to one HR system. D4 OpenAPI, `docs/api/HR-API.md`, `endpoints.md` generated from `HR_OPS`; SKILL.md + recipes.md hand-written EN.

## 3. Contract
R1 **Scopes** (marked hunk in `permissions.ts` hr block): new `hr.employee.read` ("ดูรายชื่อพนักงาน (ไม่รวมข้อมูลอ่อนไหว)"), `hr.roster.read` ("ดูตารางกะและการมาทำงาน"). One OR-term hunks: `roster.ts canRead` + `roster-board.ts canReadRoster` (+roster.read), `privacy.ts openProfile` (+employee.read). Read only. Bundles (`scopes.ts`, `HR_SCOPE_KEYS` like POS): `hr-read` = employee.read + roster.read + leave.read (**default; no pay scope**) · `hr-leave` = hr-read + leave.request + leave.decide (decide only satisfies F6; no decide op) · `hr-payroll-read` = hr-read + payroll.read. Other hr keys refused at issue.
R2 **Actor** (`hr/api/actor.ts`): synthetic `{role:"STAFF", unitAccess:["*"], permissions: key scopes, userId:"apikey:<keyId>"}` for scope-only readers (POS model; never a real user ⇒ no "own" rows). `hrIssuerViewer` = live Membership of `createdById`, used **only** by ops on DB-gated readers (reports, payslips). `defineHrOp` wrapper: issuer must still be an accepted OWNER, else 403 `forbidden` "คีย์นี้ออกโดยผู้ที่ไม่ได้เป็นเจ้าของร้านแล้ว — ออกคีย์ใหม่" (Q2).
R3 **Issuer** (`hr/api-key-actions.ts`): OWNER + platform `api.key.create/revoke`; scopes ⊆ ∪`hr-*`; TTL 30/90/365 (no "never" with pay scope); audit `hr.apikey.issue {keyId, scopes}` / `.revoke {keyId}`.
R4 **Serializers** (`hr/api/serialize.ts`, whitelist, never spread): employee `{id code name nickname position department unitId unitName employmentType employmentStatus startDate endDate probationEndAt contractEndAt active}` · leave `{id employeeId employeeName type policyName fromDate toDate halfDay hours days status}` · roster/attendance: dates, times, minutes, status, shift — no `lat lng accuracyM photo* device note` or correction reason · slip = H3.8 `SlipDto` − `bankMasked` · history = `HistoryDto` − `href` · reports: drop class `I` columns always, class `$` unless `hr.payroll.read`.
R5 **Refusals**: reader null/`NO`/other system/other tenant/unknown id ⇒ 404 `not_found`, same bytes (minus requestId). `hr/api/http-errors.ts` (copy POS): validation ⇒ 422 `unprocessable`, state ⇒ 409 `state_conflict`, overlap ⇒ 409 `duplicate`; `message_th` = the reader's fixed text.
R6 **Caps**: pageSize ∈ {10,20,50}; capped readers (`leaveItemsForViewer` 100, `listEmployees` 500) add top-level `truncated:true`; roster ≤ 31 days; attendance month = 1 employee; H3.9 limit ⇒ 422. Order: employees `(name,id)`, leaves `(fromDate desc,id)`.
R7 **No PII in URLs/logs**: ids only in paths; log `requestId` + error name only.
R8 **Audit**: writes via core (`API_KEY`, `after.keyName`); pay reads in handler: `hr.api.payslip.read {runId, employeeId}` · `hr.api.payslip.history {employeeId, taxYear}` · `hr.api.report.read {report, period, unitId}` — no names/฿.

## 4. Endpoints (first cut 14 = 13 read · 1 write)
| # | path | scope | wraps | viewer | bucket |
|---|---|---|---|---|---|
| 1 | GET /units | employee.read | `scope.ts unitsForScope` | key | read |
| 2 | GET /employees `?unitId&status&page&pageSize` | employee.read | `service.ts listEmployees` | key | read |
| 3 | GET /employees/{employeeId} | employee.read | `privacy.ts loadEmployeeProfileForViewer` | key | read |
| 4 | GET /shifts `?unitId` | roster.read | `settings.ts listShifts` | key | read |
| 5 | GET /roster `?from&to&unitId` | roster.read | `roster.ts listRoster`, published only, no warnings | key | read |
| 6 | GET /attendance/day `?day&unitId` | roster.read | `judge.ts loadAttendanceBoard` | key | read |
| 7 | GET /attendance/month `?employeeId&month` | roster.read | `judge.ts loadAttendanceMonth` | key | read |
| 8 | GET /leave-policies | leave.read | `settings.ts listLeavePolicies` (active) | key | read |
| 9 | GET /leaves `?status=PENDING\|HISTORY` | leave.read | `privacy.ts leaveItemsForViewer` | key | read |
| 10 | GET /leave-balances `?year&unitId` | leave.read | `leave.ts teamLeaveBalances` | key | read |
| 11 | **POST /leaves** | leave.request (+ handler: leave.decide, F6) | branch check at `fromDate` → `service.ts requestLeave`, `actorUserId=createdById` | key | write |
| 12 | GET /reports/{report} `?period&unitId` | time/ot ⇒ roster.read · leave ⇒ leave.read · payroll-month/-year, wages, tax-month/-year ⇒ payroll.read (handler re-check) · register ⇒ 404 | `reports.ts loadReport` (JSON) | issuer | report |
| 13 | GET /employees/{employeeId}/payslips `?taxYear` | payroll.read | `payslip.ts slipHistory` | issuer | report |
| 14 | GET /payslips/{runId}/{employeeId} | payroll.read | `payslip.ts slipForViewer`; non-ISSUED ⇒ 409 | issuer | report |
POST /leaves `.strict()` `{employeeId, policyId|type, fromDate, toDate, halfDay?, hours?}` — no `reason`, no attachment (Q5). 403 `forbidden` (fixed text, nothing written) if the employee is linked to an OWNER (auto-approve, F6) or to the issuer. Returns `{id, status:"PENDING"}`; normal chain/inbox. `Idempotency-Key` required.
**Left out on purpose:** every decide/approve (leave, OT, swap, correction, payadjust, cert) · clock events · employee create/edit, PIN, documents · payroll run create/approve/pay/reverse · bank files · filings + 50 ทวิ · salary certificates · PDFs · report CSV/XLSX · `register` · OT/correction/work-entry/swap lists · labour cost (H4.2) · opening YTD · webhooks · `hr.filter.unit:` keys.

## 5. Files
New: `hr/api/{config,dispatch,op,registry,actor,serialize,http-errors,openapi}.ts` · `hr/api/ops/{employees,roster,leave,reports,payslips}.ts` · `hr/api-key-actions.ts` · `src/app/api/v1/hr/[...path]/route.ts` · `src/app/api/v1/hr/openapi.json/route.ts` · `src/app/developers/hr.md/route.ts` · `app/sys/[id]/hr/settings/ApiKeysCard.tsx` · `scripts/gen-hr-api-docs.mts` · `docs/api/HR-API.md` · `skills/shark-hr-api/**` · oracle + notes.
Marked hunks `HR H4.8 ▸ … ◂`: `permissions.ts` · `api-keys/scopes.ts` · `roster.ts` · `roster-board.ts` · `privacy.ts` · HR settings `page.tsx` (card slot) · `developers/page.tsx` (link) · messages th/en `hr.apiKeys.*` · `hr-ui-inventory.json` · `visual-hr.mts` `"4.8"`.
**Frozen:** `src/lib/api/**` (core change needed ⇒ stop, ask) · `api.prisma` · `api-keys/{service,route-auth}.ts` · `ai/**` · other modules' `api/**` · `payroll*` `payslip*` `reports*` `filings/**` `bank-files/**` `service.ts` `leave.ts` `judge.ts` `settings.ts` `scope.ts` · `prisma/**` · `package.json` · `sync-skills.sh` (controller installs the skill).

## 6. Acceptance checks (`qc-hr-h4.8`, 2 temp tenants, QC4)
A1 static: route thin; (method,path) unique; every `op.action` ∈ `HR_SCOPE_KEYS`; no `tool`; no `prisma.`/`$transaction` in `hr/api/**`; handler imports ⊆ §4 readers.
A2 scope matrix: 14 ops × {hr-read, hr-leave, hr-payroll-read, single-scope custom, POS key, general key} ⇒ 2xx only where §4 allows, else 403 `scope_missing` / `system_mismatch`.
A3 default key: ops 13–14 + pay reports ⇒ 403; time/ot/leave report rows have no `$`/`I` column.
A4 forbidden fields: recursive walk of every 2xx body ⇒ none of `HR_FORBIDDEN_DTO_KEYS` + R4 exclusions + `addressLine birthDate hasPin citizenId` (seed has them all, a GPS+photo punch, a SICK leave with reason).
A5 cross-tenant: A's key + B's system ⇒ 403 `system_mismatch`; B's ids in path/body ⇒ 404 byte-equal to unknown id.
A6 forbidden ≡ unknown: out-of-scope employee vs random id ⇒ same 404 bytes; unpublished roster entry absent.
A7 revoked/expired ⇒ 401; issuer demoted/removed ⇒ 403 `forbidden` on all ops; restored ⇒ 2xx.
A8 POST /leaves: no header ⇒ 400 `idempotency_required`; replay ⇒ 1 row, `Idempotent-Replayed: true`, byte-equal; other body ⇒ 409 `idempotency_conflict`; PENDING + approval request/inbox row; OWNER-linked ⇒ 403, 0 rows; no `leave.decide` ⇒ 403; overlap ⇒ 409; audit `hr.api.leaves.create` `API_KEY` + keyName, no reason/name.
A9 paging: 57 employees × pageSize 20 ⇒ 3 pages, union exact, no dupes, stable across an insert; cap ⇒ `truncated:true`.
A10 envelope: refusals `{error:{code,message_th,message_en},requestId}`, code ∈ `API_ERROR_CODES`; wrong method 405 + `Allow`; unknown path 404.
A11 31st pay read/minute ⇒ 429 + `Retry-After`; bucket `hr:api:report:<keyId>` ≠ `pos:`.
A12 issuer rule: non-OWNER refused; non-hr bundle, `hr.payroll.create`, TTL never + pay ⇒ refused; audit keys exact.
A13 pay audit: one row per read, R8 keys only.
A14 widening R1 = read only: holder of roster.read/employee.read gets no write, no `seeSensitive`, no pay (COMMON §C.2 matrix on roster board, attendance board, profile).
A15 parity: `gen-hr-api-docs --check` 0; op set = openapi paths = HR-API.md = endpoints.md.
A16 skill (as `qc-pos-api-skill` K-checks): front-matter `name: shark-hr-api` + ASCII description; the §7 sections; ≥ 6 recipe curls (units, employees, roster week, leaves, file a leave, payslip) replay 2xx with `$SHARK_API_KEY $SHARK_SYSTEM_ID $UNIT_ID $EMPLOYEE_ID $RUN_ID $FROM $TO $(uuidgen)`, each with a valid `Error branch:` line.
X12 no residue (tenants, keys, buckets, idempotency rows) · Z1 SKIP while `hr/api/registry.ts` absent.

## 7. Skill (`skills/shark-hr-api/`)
SKILL.md ≤ 14 KB, POS shape: When to use (staff list, roster, attendance, leave, file a leave, payslips with a pay key; not accounting/POS/CRM) · Setup (base URL, Bearer, bound HR system, bundles, `openapi.json`, `/developers/hr.md`, start with `GET /units`) · Conventions (satang, `YYYY-MM-DD` Asia/Bangkok, page/pageSize + `truncated`, branch on `error.code`, Idempotency-Key + replay header) · **Privacy and safety**: the API has no national id, bank, address, phone, PIN, photos — never ask users for them; no names in URLs; do not copy pay data elsewhere unless asked; a filed leave is a request, never say approved; approvals, payroll, bank files, filings, certificates = HR app only; 404 = not found or not allowed, never guess ids; stop on 403 `forbidden`.

## 8. Run list · debts
`gen-hr-api-docs` → `qc-hr-h4.8` ×3 (QC_FORCE=1) → `qc-hf-hr-privacy` `qc-hr-h1.1` `qc-audit-trail` `qc-hr` `qc-hr-h0.7` `qc-hr-h2.1` `qc-hr-h2.2` `qc-hr-h2.5` `qc-hr-h2.7` `qc-hr-h3.8` `qc-hr-h3.9` · siblings (scopes/core): `qc-pos-p2.13` `qc-pos-p0.2` `qc-pos-api-skill` `qc-kanban-k1.15` `qc-member-m1.11` `qc-crm-c1.10` `qc-account-api-keys` `qc-account-api-core` `qc-hf-apiv1-scope` `qc-public-api` · `qc-nav-functions` · fitness + fitness-hr → typecheck (gate lock, iso.sh).
Debts = §4 "left out"; next candidates: device clock (device-bound key + `verifyPin`), labour cost after H4.2 (pay scope), HR webhooks (ids only).

## 9. QUESTIONS FOR THE CONTROLLER [default · reason]
Q1 New RBAC keys `hr.employee.read`/`hr.roster.read` + 3 reader hunks? [Yes · scopes must be RBAC keys; the alternative grants `hr.employee.create` (write).]
Q2 Every op requires the issuer to still be OWNER? [Yes · DB-gated readers need a real member; one rule is easier to audit.]
Q3 Only OWNER issues HR keys? [Yes · PDPA-heavy; same strictness as H3.5/H3.8 gates.]
Q4 Ship the one write POST /leaves? [Yes · PENDING only, same chain. Alt: read-only v1.]
Q5 `reason` on POST /leaves? [No · free text may carry medical data.]
Q6 Roster published only? [Yes · drafts are work in progress.]
Q7 Pay reads in the report bucket + audited? [Yes · slows scraping; data leaves the system like a download.]
Q8 Reports JSON only, `register` out, `I` columns dropped? [Yes · statutory ids stay in-app.]
Q9 Drop `bankMasked` from the API slip? [Yes · minimisation.]
Q10 Employee phone/email? [No · later `hr.contact.read` if asked.]

## QUESTIONS ONLY THE OWNER CAN ANSWER
O1 May an external system read payslips at all (`hr-payroll-read`)? [Safe default: bundle shipped, offered in the key card only after an OWNER checkbox "ข้อมูลเงินเดือนจะออกจากระบบ"; if no, ops 13–14 and pay reports are removed from the registry.]

## CONTROLLER RULINGS (14 Nov) — drafter defaults ACCEPTED for Q1–Q10 and O1, with these notes
- Q1: the new keys `hr.employee.read` / `hr.roster.read` are additive (existing gate key OR the new read key); no existing role gains or loses anything — the oracle proves human roles see exactly what they saw before (matrix before/after on the 3 reader gates).
- Q2: ops that run "as the key's issuer" return ONLY what the key's scopes allow — the scope filter is applied to the reader's output field by field (allow-list, not deny-list); a new field added to a reader later must not appear in the API without being added to the allow-list (static/shape check in the oracle).
- O1: pay bundle ships behind the OWNER checkbox, default off; label on the key card says what an outside system will be able to read.
- Labour cost (H4.2) and opening YTD stay out of the first cut. Skill deliverable goes to `skills/shark-hr-api/` in the repo (same layout as skills/shark-pos-api); the controller installs it after the RUN.
