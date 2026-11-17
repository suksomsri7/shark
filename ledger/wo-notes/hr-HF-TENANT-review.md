# HF-TENANT — independent review + security hunt (17–18 Nov 2026)

Reviewed `git diff bda823d22..a6878cfd7` on `hotfix/hr-hf-tenant` (tree `/root/projects/shark-hr-hf`). Reviewer did not write the fix.
Evidence: code reading + oracle run (17/17, exit 0) + one throw-away probe on `hf_tenant` through `iso.sh` + `qc-hf.sh` + `with-gate-lock.sh`
(`/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/hf-review/probe.mts`, fixtures swept: 0 tenants / 0 users / 0 HR rows left).
No product or oracle file was edited, nothing committed, tree clean at HEAD except this file.

## Verdict: MERGE WITH NOTES

The 14 guards are correct, correctly placed, and do what the brief claims; the migration is safe; nothing regresses for a shop on its own HR system.
One real cross-tenant hole remains open in two of the 14 actions (F1). It exists on main today, the hotfix does not make it worse, and the fix is one argument per action plus an ORACLE-EDIT. Recommended in the same push; if not, immediately after. F2–F6 are notes.

## Findings (by severity)

### F1 — MEDIUM · cross-tenant read of an employee name through `clockAction` / `requestLeaveAction` (pre-existing, NOT closed)
`src/lib/modules/hr/actions.ts:71` and `:243` pass no `employeeId` to `hrTargetOwned`; `service.ts:294-319` (`clock`) and `:395-446` (`requestLeave`) never look the employee up. `HrAttendance.employeeId` / `HrLeave.employeeId` are foreign keys on `HrEmployee.id` only (`prisma/schema/hr.prisma`), and `tenantDb` scopes only the top-level `where` — nested `include: { employee }` is not scoped (`src/lib/core/db.ts:99-101`).

Reproduction (probe, HEAD, attacker = owner of shop B, on B's OWN HR system SB, `eA1` = an employee id of shop A):
- `clockAction({ systemId: SB, employeeId: eA1, kind: "IN" })` → `HrAttendance (tenant B, SB, eA1)` written.
- `requestLeaveAction({ systemId: SB, employeeId: eA1, … })` → `HrLeave (tenant B, SB, eA1)` + outbox `hr.leave.submitted` in tenant B.
- `listAttendance` / `pendingLeaves` for (B, SB) then return A's full `HrEmployee` row server-side (probe saw name + `nationalId`); what reaches the attacker's screen is the **name**: attendance list (`ui.tsx:196`), leave list (`privacy.ts:132`), AI tool `pending_leaves` (returned A's employee name verbatim), AI `upcoming` (`tools.ts:2221`), kanban card "หาคนแทน: <name>" (`platform/kanban-bridges.ts:404-417`), kanban link resolver (`kanban/link-resolvers.ts:309`).
- Shop A sees nothing and loses nothing (its reads filter `tenantId`); victim row unchanged.
Precondition: the attacker knows a victim employee cuid (same class of secret as the system id the hotfix defends).
The brief's claim "the remaining paths look the employee up inside the caller's tenant" is false for exactly these two. The other employee-taking paths were probed with `eA1` on SB and all refuse: update / remove / restore / setSalaryProfile / requestAdjustment ("ไม่พบพนักงาน") / setWorkSchedule / kioskClock / setPin / saveProfile / addDoc.
Fix: `hrTargetOwned({ tenantId, systemId }, { employeeId })` at `actions.ts:71` and `:243` (V2 already checks the employee there through `hrTarget`). Needs ORACLE-EDIT: T7 pins `""` ids for these two; add a T8 case "B on SB with eA1".
Also same-tenant: an employee id from another HR system of the same shop is accepted today; the fix refuses it (correct).

### F2 — LOW · the 8 unguarded actions still write rows tagged with a foreign system id when residue exists
`saveEmployeeProfileAction` :130, `addEmployeeDocAction` :150, `removeEmployeeDocAction` :166, `setPinAction` :181, `kioskClockAction` :201, `decideLeaveAction` :256, `bulkDecideLeaveAction` :277, `setWorkScheduleAction` :300 have no system check. Without a pre-existing fake employee they all refuse (employee/leave lookup inside the caller's tenant). With a residue row (B's employee on A's system SA — the hotfix deletes none) the probe, after the fix, still got: kiosk clock → new `HrAttendance (B, SA)`; add doc → `HrEmployeeDoc (B, SA)`; schedule → `HrWorkSchedule (B, SA)`; set PIN; save profile (+ `Party` in B). All rows belong to tenant B; shop A cannot see them and no unique key of A is touched (`HrWorkSchedule @@unique([employeeId, weekday])` is safe because `setSchedule` looks the employee up first). Effect: the brief's evidence query §3-D keeps growing after the hotfix, and `revalidatePath` is called for A's path. Close by adding the same system-only guard to the 8 (V2 has it via `hrTarget`), or by deleting residue rows after the owner rules on query D.

### F3 — LOW · `hrTargetOwned` accepts a non-string `systemId` (bound server-action argument)
`hr-target.ts:10-12` only checks truthiness. Actions that take `systemId` as a bound argument (`requestAdjustmentAction` payroll-actions.ts:165, plus unguarded `saveEmployeeProfileAction`, `setPinAction`, `kioskClockAction`, `bulkDecideLeaveAction`) receive client-controlled JSON. Probe: `hrTargetOwned({ tenantId: B, systemId: { not: "zzz" } })` → `true` (matches B's own HR system); `setPinAction({ not: "zzz" }, residueEmp, …)` then updated the residue row on SA; `requestAdjustmentAction({ not: "zzz" }, …)` passed the guard and died in Prisma validation at `payroll.ts:142` (no write). `tenantId` always comes from the session, so the reach is the caller's own tenant only — it just bypasses the "which system" part. Byte-copy of V2, so fix on both sides later: `typeof systemId === "string"` in the resolver or at the action. `{ in: [SA] }` → false, array → Prisma error.

### F4 — NOTE · migration follow-ups that become mandatory once this is on prod
- `session/hr` `20261202000000…/migration.sql:13` is still `DROP INDEX "HrPayrollRun_systemId_periodKey_key"` (no `IF EXISTS`) and `20270112000000…:10` / `:14` are plain `CREATE UNIQUE INDEX`. After this hotfix: V2's deploy fails on prod at 20261202:13, and any fresh database (CI) fails at 20270112:10. Brief §4 edits must land in the same commit that merges main into `session/hr`.
- After the hotfix a residue run (B, SA, period) and A's own run for that period can coexist (that is M2). V2's 20261202 then creates a global partial unique `(systemId, periodKey) WHERE status <> 'REVERSED'` → fails on prod if such a pair exists. The brief's pre-V2 query covers it; safer to delete residue runs first or make 20261202 create the tenant-scoped live index directly.
- The `DO` block treats "old run index missing" as "V2 database". On a main database where that index is unexpectedly absent/invalid the block silently creates nothing while the schema expects the new index (pre-check A of the brief catches it — keep it as a hard stop).
- No `lock_timeout`: `CREATE UNIQUE INDEX` (SHARE) + `DROP INDEX` (ACCESS EXCLUSIVE on the table) for both tables are held to the end of the one implicit transaction; behind a running payroll transaction (up to 60 s, `payroll.ts:467`) reads of the two tables queue. Tables are tiny; deploy outside payroll hours as planned.

### F5 — NOTE · rollback / deploy window
`vercel-build.sh:22` migrates before the new code serves. During the build, and after a Vercel instant rollback, old unguarded code runs against the tenant-scoped indexes: nothing breaks (no `systemId_employeeId` / `systemId_periodKey` compound-key use for these models — only `accountPeriod` in `account/gl.ts:1675`), but the old global unique no longer rejects B's profile-for-an-existing-employee / run-for-an-existing-period on A's system. Rows are B's; a rollback simply re-opens the original hole.

### F6 — NOTE · oracle gaps (scripts/qc-hr-hf-tenant.mts)
- No attacker drive on B's own system with A's ids (employee / run / adjustment) → F1 invisible; T8 only varies the system.
- The 8 unguarded actions and non-string `systemId` are not driven (F2, F3).
- Both attackers are payroll viewers; the non-viewer answer path (`adjustmentReplyForViewer`) is not driven (declared in the oracle notes).
- Otherwise sound: every guarded action is driven on SA/U/SN with a before/after fingerprint of 10 tables for both tenants + a count of foreign rows on SA; T7 pins exact guard text, first-await position and the V2 blob; C1 reaches the real write of all 14 with complete forms (JV posted, outbox, audit); M2 uses the real actions. A missing or late guard cannot pass (T7 static + T1–T8 dynamic both go red). No vacuous check found (T6 requires `T6.size > 0`, C1 requires `SCOPE_RUNS > 0`, Z1 requires swept tenants > 0). M-checks inside the full run are post-migration only; the true before/after is `--mig-seed` → migrate → `--mig-check` (builder ran it).

## 1. Guards — correctness
- Placement: in all 14 the guard is the first `await` after `requireTenant()`; before it there is only the sync permission check and input validation, whose answers do not depend on the system. Nothing is written, audited, emitted or revalidated before it.
- Ids: P1 passes `{ employeeId }` (employee must be in caller's tenant AND that system). P3–P5 system only → own system + unknown run still writes the refusal audit (C2). P6–P8 system only; the service then looks the employee / adjustment up inside (tenant, system). clock / requestLeave: see F1.
- Refusal values match the return types: `void` actions `return;` (same as their existing validation returns; plain `<form action>` callers in `ui.tsx` / `payroll-ui.tsx`); `AdjustState` error for P6 (`PayAdjustForm.tsx`), `{ ok:false, reason }` for P7/P8 (`PayAdjustRowActions.tsx` shows the reason).
- Legitimate users: HR UI is mounted only under a system the page already resolved as `type HR` of the caller's tenant (`app/app/sys/[id]/page.tsx:131`, `hr/*/page.tsx`), so the guard never fires for them. Inactive (`active=false`) HR systems still pass — same as the pages.
- Same-tenant behaviour: only change = set-profile for a non-existent employee is refused (C3). P3–P5 on the caller's own system with a foreign run id still write a refusal audit row in the caller's own log (unchanged).
- Non-viewer filing OT-by-hours gets "ไม่พบพนักงาน" on a foreign system vs the generic text on its own system: distinguishes own/not-own only; foreign = unknown = non-HR.

## 3. hrTargetOwned
Tenant filter injected by `tenantDb` + `id` + `type: "HR"` in one query → foreign, unknown and non-HR take the same code path, same single query, same answer (probe: foreign false, own true, own-inactive true). Row checks run only after the system is owned and are scoped to (tenant, system). No soft-delete column on `AppSystem`; `active` is ignored (consistent with pages). Weakness: F3.

## 4. Migration
Create-before-drop, `IF [NOT] EXISTS`, new key = old key + leading `tenantId` so the build cannot fail on duplicates; one implicit transaction (Prisma sends the file as one batch; builder saw `applied_steps_count = 1`) so no partial state; re-run is a no-op; on a V2 database both parts are no-ops. Index names equal Prisma's defaults for the new `@@unique` (M1, M5 green here). Nothing else relies on global uniqueness by `systemId`: every reader goes through `tenantDb` or carries `tenantId` explicitly (raw SQL at `payroll.ts:389`, `:773` both filter `tenantId`); the advisory lock key at `payroll.ts:373` is per system+period and stays valid. Follow-ups: F4, F5.

## 2. Other entry points examined
Server actions outside the 14 (`hr/actions.ts`):
- `saveEmployeeProfileAction`, `setPinAction`, `setWorkScheduleAction`, `addEmployeeDocAction` — employee looked up in (tenant, system); safe without residue; F2 with residue; F3 for the bound-arg ones.
- `removeEmployeeDocAction` — `deleteMany` scoped to (tenant, system); own rows only.
- `kioskClockAction` — employee + PIN checked in (tenant, system); F2 with residue. Side note: rate-limit key `hr-kiosk:${employeeId}` (:208) is not tenant-scoped → another tenant can burn a victim employee's 5/min PIN attempts (in-memory, per instance; pre-existing, low).
- `decideLeaveAction`, `bulkDecideLeaveAction` — leave looked up in (tenant, system); can only decide the caller's own rows (incl. F1 rows); audit in caller's tenant.
Pages: `app/app/sys/[id]/hr/{employees,employees/[employeeId],attendance,leave,payroll,kiosk}` and `payroll/[runId]/slip/[employeeId]` — all resolve `AppSystem { id, tenantId, type HR }` first; reads via `tenantDb`. Safe (they display F1 names).
API routes / cron / webhooks: no file under `src/app/api` reaches HR tables or the HR module.
AI: `tools.ts` `pending_leaves` :200, `upcoming` :2221, `employeeNameForLeave` :2566; `proposals.ts` `hr_decide_leave` :625, `hr_create_employee` :731; `analyst.ts:104`, `proactive.ts:79`, `secretary/digest.ts:231`, `dna-review.ts:69` — system resolved from the caller's tenant, never caller-supplied. Safe (F1 names surface in the first three).
Other modules: `approval-effects.ts:186`, `approval/service.ts:258` (tenant-filtered by event/ctx); `platform/kanban-bridges.ts:404`, `kanban/link-resolvers.ts:309,340` (tenant-filtered; F1 name); `booking/service.ts:524-705` (HR system resolved from tenant, `active: true`); `staff/service.ts:293-489` (tenant-filtered; would accept a residue employee of the caller's own tenant — own data); `hr/pos-seam*.ts`, `pos/hr-link.ts`, `pos/staff-commission.ts`, `crm/commissions.ts`, `crm/assignment.ts`, `calendar/*`, `dashboard/*`, `member/*`, `party/index.ts:286`, `platform/onboarding-drip.ts:58` — tenant from session/event, HR systems enumerated by tenant. Safe.
Outbox consumers: `hr.payroll.paid` → CRM bridge reads by event tenant + system (emission now guarded); `hr.leave.submitted` → automation / kanban / webhooks in the emitter's tenant.

## 6. L-5 (qc-hf-hr-privacy 193/194) — pre-existing, not caused by the hotfix
Path: `hr.createEmployee` + `hr.requestLeave` (service.ts) → `tools.runTool("pending_leaves")` → `maskToolOutput` (`src/lib/ai/tools.ts:2618-2626`, called at :2755). `maskLongDigits` (:2603) masks any run of ≥ 9 digits down to its last two. The fixture employee is named `` `เพื่อนร่วมงาน ${Date.now()}` `` (`scripts/qc-hf-hr-privacy.mts:141,191`) — 13 digits — so the tool returns `เพื่อนร่วมงาน •••••••••••77` and `ai.includes(name)` (:285) is false. The masking arrived with `99f3cfea5` (SEC S3a.1-S2, 6 Nov 2026); the suite's last recorded 194/194 is `b44406986` (24 Oct), an ancestor of it. `git diff bda823d22..HEAD` is empty for `src/lib/ai`, `src/lib/modules/hr/service.ts`, `src/lib/modules/crm` and the suite, and the path imports neither changed action file. The probe at HEAD confirms `pending_leaves` returns a digit-free name unmasked. Established by code path and history; no baseline run on unfixed main was made (not needed, deterministic). Fix belongs to main's suite (ORACLE-EDIT: digit-free fixture name), not to this hotfix.

## Not verified
- Prisma's single-transaction execution of the migration file by failure injection (inferred; consistent with the builder's `_prisma_migrations` row).
- Migration on a real V2 database (reasoned from the SQL only).
- That Next delivers bound server-action arguments unvalidated in production for F3 (shown at function level only).

---

# Round 2 — delta review of `a6878cfd7..59e6184a1` (18 Nov 2026)

Oracle d33cee12c (T9, T10, C4, T7 → 22 actions, non-payroll attacker XM) + fix 59e6184a1 (10 edits in `src/lib/modules/hr/actions.ts` only; `hr-target.ts` blob unchanged).
Evidence: code reading · oracle at HEAD **20/20**, exit 0 · second throw-away probe on `hf_tenant` through the wrappers
(`/tmp/claude-0/-root/59156a1f-9c0e-594d-9643-d1896f46b191/scratchpad/hf-review/probe2.mts`, swept to 0) · migration rehearsal on the lane-5 QC database inside `BEGIN … ROLLBACK`.
Nothing edited except this section; tree otherwise clean at 59e6184a1.

## Verdict: MERGE WITH NOTES
F1 and F2 are closed for every string `systemId`. No legitimate-user regression found. One residual path (R2-1) is the already-recorded F3 debt, now the only remaining way to reach F2; one data note (R2-2).

## Findings

### R2-1 — LOW · F2 is still reachable through the F3 debt on three bound-argument actions
`actions.ts:187` (`setPinAction`), `:138` (`saveEmployeeProfileAction`), `:297` (`bulkDecideLeaveAction`) take `systemId` as a bound server-action argument. With `systemId = { not: "zzz" }` the resolver matches the caller's own HR system and then finds the residue employee/leave through the same filter object. Probe (attacker owner of B, residue employee `fB` and leave on A's system SA):
- `setPinAction({ not: "zzz" }, fB, …)` → `ตั้ง PIN แล้ว`, `HrEmployee` changed.
- `saveEmployeeProfileAction({ not: "zzz" }, fB, …)` → `บันทึกแล้ว`, `HrEmployee` + `Party` changed.
- `bulkDecideLeaveAction({ not: "zzz" }, [residue leave])` → `done: 1`, `HrLeave` + `AuditLog` changed.
- `kioskClockAction({ not: "zzz" }, …)` passes the guard and dies in Prisma validation at `service.ts:305` (no write).
- With A's own ids (`eA1`, A's leave) the same calls refuse — `tenantId` is from the session.
Reach = rows of the caller's own tenant that sit on a foreign system id (residue only); shop A unaffected. Not covered by T10 (string ids only). Can be closed without touching `hr-target.ts`: `if (typeof systemId !== "string") <refusal>` at the top of the five bound-argument actions (incl. `requestAdjustmentAction`), or by deleting residue rows. Function-level proof only; delivery of a non-string bound argument through Next in production not demonstrated.

### R2-2 — NOTE · rows already created through F1 stay and still show the victim's name
A pre-existing `HrLeave` / `HrAttendance` of tenant B on B's own system that references A's employee is B's row: B's leave list still returned A's employee name and B can still decide it (probe). The hotfix deletes nothing. The brief's evidence query §3-D does not find these (the system is B's own). Add before deploy, for `HrAttendance`, `HrLeave`, `HrEmployeeDoc`, `HrWorkSchedule`, `HrSalaryProfile`, `HrPayAdjustment`, `HrPayrollItem`:
`SELECT x.id, x."tenantId", e."tenantId" AS employee_tenant FROM "<table>" x JOIN "HrEmployee" e ON e.id = x."employeeId" WHERE e."tenantId" <> x."tenantId";`

### R2-3 — NOTE · oracle
T9, T10, C4 are sound: each attacker drive is compared against a ghost-id drive on a 12-table fingerprint for both tenants; T9 ends with a cross-reference query "rows of B pointing at employees of A"; C4 reaches the real write of all 8 with A's own rows; T7 pins ids, refusal text, first-await position for 22 actions and "guard before `checkRateLimit`". A missing guard on any of the 10 goes red twice (T7 + T9/T10). Gaps: non-string `systemId` (R2-1); T10 drives SA only (U / SN rely on the shared resolver, already covered by T6 for the first 14); foreign leave/doc ids on the attacker's own system are not driven (probed here: safe).

## (1) F1 / F2 closure — probe at HEAD
| drive (attacker = owner of B) | result | rows changed |
|---|---|---|
| own system SB + A's employee: clock · requestLeave · addDoc · schedule | `null` | none |
| own system SB + A's employee: kiosk · setPin · saveProfile | `ไม่พบพนักงาน` | none |
| A's system SA + residue employee: kiosk · setPin · saveProfile | `ไม่พบพนักงาน` | none |
| SA + residue: addDoc · removeDoc (residue doc) · schedule · decideLeave (residue leave) | `null` | none |
| SA + residue: bulkDecideLeave | `ไม่พบระบบ` | none |
| SB + A's leave id: decideLeave | throws `ไม่พบใบลา หรืออยู่นอกร้านนี้` (service, as before) | none |
| SB + A's leave ids: bulkDecideLeave | `done 0`, 2 failed | none |
| SB + A's doc id: removeDoc | `null` | none |
| SA + A's leave / doc ids: decideLeave · bulk · removeDoc | `null` / `ไม่พบระบบ` / `null` | none |
Victim rows after all drives: leaves PENDING, doc present, employee name/PIN unchanged.
Kiosk limiter: 14 wrong-PIN attempts by B against A's employee id (7 on SB, 7 on SA) all answered `ไม่พบพนักงาน` and did not consume the bucket — A's kiosk clock-in for that employee then succeeded. The round-1 side note (cross-tenant burn of `hr-kiosk:<employeeId>`) is closed by the guard sitting before `checkRateLimit` (`actions.ts:212-213`).

## (2) Legitimate users — probe as owner of A on A's system
- Kiosk: correct PIN clocks in; wrong PIN ×4 → `PIN ไม่ถูกต้อง`, then `ลองใหม่ในอีก 60 วินาที` (limit 5 incl. the earlier success) — limiter still counts real employees.
- Inactive employee: kiosk → `ไม่พบพนักงาน` (service rule, unchanged); clock, requestLeave, setPin, saveProfile, setSchedule still work (resolver has no `active` filter — same as before).
- setPin: bad format still `PIN ต้องเป็นตัวเลข 4-6 หลัก`; empty still clears. Only order change: for a non-existent employee the answer is now `ไม่พบพนักงาน` before the format message.
- Bulk leave: own leave + another tenant's leave + unknown id → `done 1`, 2 failed with the old reason text. Single decide works; unknown leave id on own system still throws as before (foreign system now returns silently — own/not-own difference only).
- removeDoc on own doc works. Inactive (`active=false`) HR system still passes.
- Home unit / branch: `HrEmployee` has no unit column on main (`prisma/schema/hr.prisma`) — not applicable until V2 H1.1.
- Internal callers: AI proposals (`ai/proposals.ts:633`, `:736`), `approval-effects.ts:186`, POS `clockSelf` (`hr/pos-seam.ts:103`), booking and CRM call the **services** or tables, never these actions, and resolve the HR system from the tenant — untouched by the diff. UI callers of the 8 actions (`ui.tsx:370`, `employees/[employeeId]/page.tsx:92,101`, `BulkLeaveApprovals.tsx:12`, `EmployeeProfileForm.tsx:34`, `PinField.tsx:18`, `KioskClock.tsx:13`) are all mounted under a page that already resolved the caller's own HR system; refusal values match each action's state type. `decideLeaveAction` has no UI caller in `src`.
Not driven in a browser.

## (4) Widened scope
Nothing newly broken found. Each added guard costs one or two indexed reads before the action; `kioskClockAction` now does them before the in-memory rate limit (requires a signed-in session with `hr.attendance.clock`, so not an anonymous amplification).

## Migration rehearsal on a database with the HR V2 indexes
Target: lane-5 QC database from `/root/projects/shark-hr-l5/.env.qc-hr` (direct URL; host `ep-orange-dust-aotwbyc7.c-2.ap-southeast-1.aws.neon.tech`, database `neondb`; production/QC1/QC4 marks refused; `HrPayrollRun.reversedAt` present = V2 schema; 0 other active sessions). One psql session: `BEGIN; SET LOCAL lock_timeout='5s'; <list>; <migration.sql verbatim>; <list>; ROLLBACK;` — exit 0.
Index list on `HrSalaryProfile` / `HrPayrollRun`, **before and after inside the transaction — identical (7 rows)**:
- `HrPayrollRun_pkey` (id)
- `HrPayrollRun_systemId_periodKey_idx` — plain index ("systemId", "periodKey")
- `HrPayrollRun_tenantId_status_idx` — plain index ("tenantId", status)
- `HrPayrollRun_tenantId_systemId_periodKey_live_key` — UNIQUE ("tenantId", "systemId", "periodKey") WHERE status <> 'REVERSED'
- `HrSalaryProfile_pkey` (id)
- `HrSalaryProfile_tenantId_idx` — plain index ("tenantId")
- `HrSalaryProfile_tenantId_systemId_employeeId_key` — UNIQUE ("tenantId", "systemId", "employeeId")
Server notices: `relation "HrSalaryProfile_tenantId_systemId_employeeId_key" already exists, skipping` · `index "HrSalaryProfile_systemId_employeeId_key" does not exist, skipping`; the `DO` block did nothing (old full unique absent → no full unique created, the live partial unique is kept).
After ROLLBACK the list outside the transaction is byte-identical to the list taken before; no `_prisma_migrations` row for the hotfix exists on that database.
Result: **full no-op, equal to the V2 end state** — the round-1 "not verified" item is now verified. Still unverified: failure injection for Prisma's single-transaction execution.
