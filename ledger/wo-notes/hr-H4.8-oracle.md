# H4.8 oracle notes — `scripts/qc-hr-h4.8.mts` (+ `scripts/qc-hr-h4.8-lib.mts`)

Brief `ledger/hr-briefs/hr-brief-H4.8.md` (+ CONTROLLER RULINGS 14 Nov). Base 38e3be6fa (`session/hr`). 41 checks (36 RED-by-design · 5 GREEN controls).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h4.8.mts` (unforced = SKIP while `hr/api/registry.ts` is absent, no DB write) · `--list` prints the ids.
House pattern: route handlers called in-process (`GET/POST(new Request(...), {params})`, as qc-pos-p2.13) with real keys made by `api-keys/service.createApiKey` (createdById = the OWNER issuer). No server, no network.

## 1. Checks (id · what)
Static: S1 thin route + 2 doc routes · S2 the 14 pinned ops · S3 nothing left out, one write · S4 HR_SCOPE_KEYS + 3 bundles · S5 [G] non-HR bundles golden · S6 2 RBAC keys + Thai labels · S7 HR_API_CONFIG · S8 hr/api/** readers only, no raw db, issuer viewer only in reports/payslips ops, serializer never spreads · S9 [G] frozen + payroll-rules sha · S10 marked hunks (8 code files, messages only `hr.apiKeys.*`, inventory only `wo:"H4.8"` rows) · S11 Q1 gate hunks = one OR-term each · S12 key card + O1 label + `"use server"` actions → keys core · S13 developers link.
No-DB modules: P1 serializer probe (poisoned rows) · P2 openapi.json = 14 · P3 `gen-hr-api-docs --check` + HR-API.md/endpoints.md = 14 · P4 SKILL.md/recipes contract · P5 developers/hr.md.
DB: D0 [G] seed carries PII (so A3/A4 are not vacuous) · Q1 [G] human-role gate matrix golden · A14 new-key holder is read-only · A2 scope matrix 7 keys × 22 requests · A2b POS key / general key · A2c bound keys only (ruling 14 Nov 4) · A3 exact allow-list on every 2xx · A4 no forbidden key / seeded secret in any 2xx · A5 other tenant/system · A6 published roster only, DRAFT slip 409 · A7 revoked/expired · A7b issuer demoted/unaccepted/restored · A8 POST happy path · A8b idempotency · A8c held-lock race · A8d refusals · A9 paging + cap · A10 envelope/405/404 · A11 report bucket + 429 · A12 issuer core · A13 pay audit · A16 recipe replay · Z1 [G] residue.

## 2. Names and shapes pinned by the oracle (brief left them open)
- Registry `src/lib/modules/hr/api/registry.ts` exports `HR_OPS` (ApiOp[]). Op ids: `units.list` `employees.list`(paged) `employees.get` `shifts.list` `roster.list` `attendance.day` `attendance.month` `leavePolicies.list` `leaves.list` `leaveBalances.list` `leaves.create` `reports.get` `payslips.history` `payslips.get`; paths/actions = brief §4; `auditAction = "hr.api.<id>"`; rate `report` for reports/payslips, kind `write` for `leaves.create` only. `reports.get` action = any one of the 3 read scopes (builder's choice); the handler re-checks the per-report scope.
- GET query names allowed: `unitId status page pageSize from to day employeeId month year period taxYear`. POST /leaves zod keys exactly `employeeId policyId type fromDate toDate halfDay hours`, `.strict()`.
- Codes: scope re-checks inside handlers (report scope, missing `hr.leave.decide`) ⇒ **403 `scope_missing`**; OWNER-linked employee ⇒ 403 `forbidden`; issuer not OWNER ⇒ 403 `forbidden` + exact text `คีย์นี้ออกโดยผู้ที่ไม่ได้เป็นเจ้าของร้านแล้ว — ออกคีย์ใหม่`; zod ⇒ 422 `validation` (core); service refusal ⇒ 422 `unprocessable` with `message_th` = the service's Thai text; overlap ⇒ 409 `duplicate`; non-ISSUED slip ⇒ 409 `state_conflict`; `register` ⇒ 404 `not_found`.
- Success `data` = reader result minus `ok`, keys EXACTLY (lib `EMP UNIT SHIFT ROSTER DAY MONTH POLICY LEAVE BAL SLIP HIST POSTED reportShape`):
  - employee (list + detail): `id code name nickname position department unitId unitName employmentType employmentStatus startDate endDate probationEndAt contractEndAt active` (R4).
  - unit `id name` · shift = HrShift row − `tenantId systemId active createdAt updatedAt` · leave policy = HrLeavePolicy row − same 5.
  - roster entry (published only): `id employeeId date shiftId unitId startMin endMin breakMin crossesMidnight paidMin` (no `note window published publishedAt source`).
  - attendance day: `{day, unitId, totals{workedMin, counts{status:n}}, rows[{employeeId name position borrowed slots[SLOT]}]}`; month: `{month, employee{id name position}, days[{day slots[SLOT]}], summary{12 keys of AttendanceSummary}}`; SLOT = `shift{name startMin endMin crossesMidnight} inAt outAt method breaks[{from to}] status phase final lateMin earlyOutMin workedMin otMin missingOut leave{label pending}` (no `slotKey dayId stored stale`, no initials/alerts/units/canClockFor).
  - leave (R4): `id employeeId employeeName type policyName fromDate toDate halfDay hours days status`; GET /leaves `?status=PENDING|HISTORY`.
  - leave balances = TeamLeaveBalances as is.
  - report = ReportDto − `ok`; `columns`/`values` keys = class P (+ `$` only with `hr.payroll.read`), class `I` never; `totals` null or exactly the kept summed columns.
  - history = HistoryDto − `ok` − `slips[].href`; slip = SlipDto − `ok` − `bankMasked`; POST ⇒ `{id, status:"PENDING"}`.
  - top-level keys ⊆ `data requestId page truncated`; `page` required on employees.list; `truncated:true` when a capped reader hit its cap (absent or false otherwise).
- Serializer probe exports in `hr/api/serialize.ts`: `serializeEmployee(row)`, `serializeSlip(slipDto)`, `serializeReport(reportDto, {pay})`.
- Key issuer core (testable without Next): `src/lib/modules/hr/api/keys.ts` exports `issueHrApiKey(auth, {systemId, name, bundle?, scopes?, ttlDays, payConsent?})` → `{ok:true, keyId|id, rawKey}` | `{ok:false, code, …}` and `revokeHrApiKey(auth, {systemId, keyId})` → `{ok:true}`; `auth` = requireTenant() shape (lib `authOf`). `api-key-actions.ts` = `"use server"` wrappers (create/issue · list · revoke) calling `requireTenant()` then the core. Default bundle (none given) = `hr-read`; `payConsent:true` required for any pay scope; TTL 0 (never) refused with pay scope. Audit `hr.apikey.issue` after keys exactly `{keyId, scopes}`, `hr.apikey.revoke` after `{keyId}`.
- O1 label text `ข้อมูลเงินเดือนจะออกจากระบบ` in `ApiKeysCard.tsx` or `th` messages.
- Pay audit rows (actor API_KEY, actorId = keyId): `hr.api.payslip.read {runId, employeeId}` · `hr.api.payslip.history {employeeId, taxYear}` · `hr.api.report.read {report, period, unitId}` (asserted for pay reports only).
- Rate bucket names = core `hr:api:<kind>:<keyId>` (rateNs `hr`).
- Skill: SKILL.md sections `When to use / Setup / Conventions / Privacy and safety`; recipes in `references/recipes.md` (```bash fenced, one curl each, `Authorization: Bearer $SHARK_API_KEY`, `Idempotency-Key: $(uuidgen)` on POST, an `Error branch: <status> <code>` line); variables exactly `$SHARK_API_KEY $SHARK_SYSTEM_ID $UNIT_ID $EMPLOYEE_ID $RUN_ID $FROM $TO`. Replay uses a key with hr-leave + payroll.read, EMPLOYEE_ID = an employee with an ISSUED slip, FROM = TO = 2031-05-04.

## 3. Ambiguities and how the oracle reads them
1. RULED 14 Nov (1): page/pageSize stands, total order (name, id) with id as tie-breaker; cursor paging = debt D-H48-cursor. Test: an employee sorting after all others is inserted between page 1 and pages 2–3; union must be exact without duplicates. An insert sorting *before* page 1 would duplicate rows under offset paging — not tested (would need a cursor; controller to rule if wanted).
2. RULED 14 Nov (2): class I always dropped (brief wins) (I never, $ only with pay). Employee DTO never carries national id/bank even with pay scope (§7).
3. "Branch scope of the issuer respected": the issuer must be an accepted OWNER (Q2), i.e. all branches, and scope-only readers use the synthetic `["*"]` actor (R2) — nothing branch-restricted to test; covered by A7b (issuer rule) only.
4. RULED 14 Nov (4): HR ops accept only keys bound to this HR system. A2c: an unbound key holding hr-leave + payroll.read and sending `X-Shark-System: <sA>` ⇒ every one of the 14 ops answers 403 `scope_missing` with the same bytes (minus requestId) as a key bound to sA without hr scopes; a POS-bound key with hr scopes + header ⇒ 403; no 2xx, no leave written, no audit row. If the frozen core cannot express it, the HR dispatcher/actor enforces it (no change under `src/lib/api/**`). Note: the oracle's other keys are made with `createApiKey` bound to sA (custom scope sets), so the enforceable criterion is "bound to this HR system" — a builder must not require an issue-time marker that `createApiKey`-made bound keys lack (would need an ORACLE-EDIT).
5. `listEmployees` cap 500 ⇒ `truncated` is not seeded (cost); the cap is checked on `leaveItemsForViewer` (101 history rows ⇒ 100 + `truncated:true`).
6. RULED 14 Nov (3): `hr/api/keys.ts` confirmed; it is needed because `"use server"` files can only export actions and the oracle cannot call `requireTenant()`. Same pattern as POS `pos/api/keys.ts`.
7. "no leave.decide ⇒ 403" code pinned as `scope_missing` (it is a key scope).
8. A8c race: `holdAdvisory` on `hr-leave-emp:<sys>:<emp>` (the lock `requestLeave` takes); request A blocks inside the handler with its idempotency row claimed, request B (same key/body) is sent while the lock is held ⇒ 409 `idempotency_in_progress` (core semantics); after release A = 200 and a replay returns A's id. The "lock is awaited" signal is pg_stat_activity advisory waits (shared DB ⇒ a foreign waiter could give a false positive; A still blocks).

## 4. RED on base (38e3be6fa) — full output `hr-H4.8-red.txt`
Forced: 5/41 pass = exactly the 5 GREEN controls; unforced: SKIPPED (registry absent, exit 0, no DB write). No crash, RESIDUE none.

| group | checks | reason RED on base |
|---|---|---|
| route/registry/config/serializer/keys/card/docs/skill files | S1 S2 S3 S7 S8 S12 S13 P1 P2 P3 P4 P5 | files absent (route, openapi.json, hr.md, `hr/api/*`, `api-key-actions.ts`, `ApiKeysCard.tsx`, `gen-hr-api-docs.mts`, `HR-API.md`, `skills/shark-hr-api/**`) — each reported per check, nothing crashes |
| scopes / RBAC | S4 S6 | no `HR_SCOPE_KEYS`, no `hr-*` bundles, no `hr.employee.read`/`hr.roster.read` in PERMISSIONS |
| marked hunks | S10 S11 | no diff vs base in the 8 files / messages / inventory; no gate hunks |
| new-key holder | A14 | base gates do not know the new keys (canReadRoster false, openProfile false) |
| every HTTP check | A2 A2b A2c A3 A4 A5 A6 A7 A7b A8 A8b A8c A8d A9 A10 A11 A13 A16 | route absent ⇒ `0:ROUTE_MISSING`; HR keys cannot even be issued (`createApiKey` rejects `hr.employee.read` as a scope) |
| issuer core | A12 | `hr/api/keys.ts` absent ⇒ `MISSING` |

GREEN on base, and why that is right:
- S5 non-HR bundles digest `2a9ab59c…` recorded on the base (no other module's bundle may move).
- S9 frozen files unchanged (base = HEAD) + payroll-rules sha.
- D0 seed control: the OWNER profile shows the seeded national id/phone/address/bank/hasPin, the SICK reason is in the leave list, the GPS+photo punch is on the board — so A3/A4 test real PII, not empty data.
- Q1 human-gate golden recorded on the base: `owner:11111 mgrAll:11011 mgrU1:11011 staff:00000 employee.create:11001 leave.read:01010 leave.decide:00000 leave.request:00000 payroll.read:01100 attendance.clock:00000 payadjust.request:00000` (canReadRoster · openProfile · seeSensitive · readLeave · listRoster ok). Must stay identical after the build (ruling Q1).
- Z1 no residue.
- Also confirmed on the base: the service refusal used by A8d is Thai (`ประเภทการลานี้ลาเป็นชั่วโมงไม่ได้`).
