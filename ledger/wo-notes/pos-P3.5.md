# P3.5 S builder — HR: PIN ตามตารางงาน · ค่าคอมฯ พนักงาน → เงินเดือน · ชั่วโมงจากกะ (C-8 v2)

Builder (account A · lane 1) · 16 Oct 2026 · tree `/root/projects/shark-pos-b` · branch `wip/pos-p3.5` from `session/pos` **72669941** + merge `origin/wip/pos-p3.5-oracle` **9a64b62e** (merge commit c8b1eaae).
Contract = `scripts/qc-pos-p3.5.mts` (45 ids) + names table `ledger/wo-notes/pos-P3.5-oracle.md` + brief §10 rulings 1–13 + prompt CD-1…CD-8 (all accepted).

## Results (QC4 · `bash scripts/iso.sh env QC_FORCE=1 bash scripts/qc4.sh env GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p3.5.mts`)
- Red-before (head c8b1eaae, dirty 0): **5/45** (ST2 PV2 PV4 Z1 Z2 green) — same as the oracle writer's.
- Forced run at 788e7530 (dirty 0): **45/45** exit 0 · residue 0 · fingerprint drift none · network guard 0.
- Final head: see "Final gates" at the end (forced ×2 + `--no-db` 10/10 + typecheck).

## `_prisma_migrations` on QC4 (read before deploy — no action)
- `20261201000000_hr_pin_hash` finished ✓ · `20261202000000_hr_payroll_run_live_unique` finished ✓ (HR H0.5/H0.6 — folders not in this tree; `migrate deploy` ignores foreign applied rows, as P1.15).
- `migrate deploy` (QC4 only, `bash scripts/qc4.sh pnpm exec prisma migrate deploy`) applied `20261217100000_pos_p35_staff_commission` (182 folders found, 1 applied). `prisma generate` ran in tree b only.

## Files / hunks per ruling (marker `// POS P3.5 ▸ … ◂`)
| ruling | file | what |
|---|---|---|
| R7 §3 | `prisma/schema/pos.prisma` (append) · `prisma/migrations/20261217100000_pos_p35_staff_commission/migration.sql` (new) | `PosStaffCommission` + enums `PosStaffCommissionKind {ACCRUE REVERSE}` / `PosStaffCommissionStatus {OPEN SENT}` · `sourceKey @unique` · `@@index([tenantId,userId,status,periodKey])` · `@@index([saleId])` · no `@relation` to HR · CREATE TYPE/TABLE/INDEX only |
| R7 | `src/lib/core/scope.ts` · `scripts/pos-qc-env.mts` | `PosStaffCommission: sys()` · `POS_MODELS.posStaffCommission` |
| R1 ruling 5 | `src/lib/modules/hr/pos-seam.ts` (new) · `src/lib/modules/hr/pos-seam-read.ts` (new · CD-B1) · `src/lib/modules/hr/index.ts` (block after `// ◂ CRM C3.3`) | 4 frozen names; writes HR only via `clock()`; reads = HR functions (`employeeOfUser` `getSchedule` `isOnLeave` `nextClockKind` `bkkParts` `rules.workedMinutes`) + read-only helpers |
| R2 | `src/lib/modules/pos/hr-link.ts` (new) · `src/lib/modules/pos/hr-link-actions.ts` (new, "use server") · `scripts/fitness.mts` (1 line `"pos→hr"`) | only POS files importing `@/lib/modules/hr` (lazy `await import`) |
| R3 R6 R12 | `pos/settings-shared.ts` (parsers `posScheduleGate` `posStaffCommission` `posClockOnShift`) · `pos/settings-general.ts` (writers `updatePosStaffSettings` OWNER only · `updatePosStaffCommission` OWNER or `canViewPayroll`) | audit `pos.settings.updated` (commission audit = summary, no per-product table) |
| R4 R5 CD-2 | `pos/staff-pin.ts` | `verifyStaffPin(ctx, input, client?, opts?{now})` gate (one point, after a correct PIN) · `managerUserId`+`managerPin` override · audits `pos.staff.schedule_override` / `pos.staff.schedule_denied` · `makeToken` ttl param · `listStaffForDevice(…, opts?{now, hr})` adds `hr` |
| R4 | `pos/staff-pin-actions.ts` | `verifyStaffPinAction` passes `managerUserId/managerPin` through |
| R5 R13 CD-1 | `pos/register-shared.ts` (additive) | `StaffListItem.hr?` · `StaffScheduleReason` · `StaffHrState` · `RegisterRefusal.reason?/window?` · codes `OFF_SCHEDULE ALREADY_CLOCKED NO_EMPLOYEE` · `REFUSAL_KEY` (`lock.schedule.offSchedule` · `errors.alreadyClocked` · `errors.noEmployee`) — every pin export kept (ST2) |
| R6 R7 R8 | `pos/staff-commission-shared.ts` (new, pure) · `pos/staff-commission.ts` (new, single writer) | rate precedence · half-up · fixed × qty · `lineNets` bases · refund remainder · per-sale advisory lock · `createMany({skipDuplicates})` |
| R8 ruling 9 | `src/lib/outbox-consumers.ts` (3 hunks) | paid: `bothMain(posSalePaid, …staffCommissionOnSalePaid)` inside the first compose base · voided: one more try-block in the all-run main function · refunded: `bothMain(refund-consumer, …staffCommissionOnSaleRefunded)` — never a `compose` extra |
| R9 | `src/lib/platform/minute-jobs.ts` (1 block) · `hr-link-actions.ts` `syncStaffCommissionNowAction` | hourly `pos.staffCommission.payroll` → `syncStaffCommissionToPayroll` |
| R11 | `pos/reports.ts` · `pos/report-actions.ts` · `pos/report-print-shared.ts` | kind `commission` (last) · `reportStaffCommission` · `CSV_HEADERS.commission` · total row · print titles/en headers · REST ops untouched |
| R12 | `pos/hr-link.ts` | `posClockForShift` (CD-4 service of `posClockAction`) · `shiftHoursForOwner(ctx, actor, {shiftIds})` |
| R13 | `src/messages/{th,en}/pos.json` · `pos/api/http-errors.ts` (+3 rows) · `docs/api/POS-API.md` (regenerated, +3 error rows) | groups `register.lock.schedule` `settings.staff.scheduleGate` `settings.staff.commission` `shift.hours` `report.commission` + `report.kinds.commission` + `register.errors.{offSchedule,alreadyClocked,noEmployee}` |
| R14 | `src/lib/pos-integrations.ts` | HR facts → true · HR card LINKED (active HR system · scope TENANT) / OFF / NO_SYSTEM (removed from PLANNED_TYPE) |
| R5 | `pos/settings-overview.ts` | staff overview calls `listStaffForDevice(…, {hr:false})` (p1.18 S1 keys unchanged; P3.5U may opt in) |
| ruling 5 | `ledger/POS-CONTRACTS.md` C-8 v2 · `ledger/POS-OWNER-PENDING.md` §"แจ้งเจ้าของโมดูล HR" | seam text + owner line (seam file · index block · expected H0.5 conflict · H1.3 sourceRef forward note) |
Untouched: `shift.ts` · `register*.ts` (except register-shared) · `service.ts` · `refund*.ts` · `refund-consumer.ts` · `held-cart.ts` · `hr/service.ts` · `hr/payroll.ts`.

## ORACLE-EDITs (own `test(pos)` commits · marker `// ORACLE-EDIT ผู้คุม 16 ต.ค. (P3.5 …)`)
1. `scripts/qc-pos-p2.12.mts` :71 (PD1 title) · :299 (`ALL_KINDS` + `"commission"`, `KIND_FN.commission`) · :1816 (คาด 12 ชนิด) — checks **33 → 33** (PD1 now prints the commission kind too). Commit 5c74dbcb.
2. `scripts/qc-pos-p1.18.mts` :315 (HR facts live) · :323 (PLANNED_PHASE drops HR) · :1475 (I8: HR leaves the PLANNED loop; new block asserts HR LINKED · TENANT · target · facts live) — checks **81 → 81**. Commit 7790a11d.
3. `scripts/pos-ui-inventory.json` :9699 — staff-tab HR row note: server live, switch aria-disabled until P3.5U — rows **1026 → 1026**. Commit 8ea14664.
4. `scripts/pos-gates.json` — + `qc-pos-p3.5` forced (after p2.14) + HR set unforced (`qc-crm-c3.3` with `needs: crm-seed`, p2.14 G2) — suites **88 → 98**; `qc-pos-p2.14 --no-db` 15/15. Commit 788e7530.

## Lane-pin / pin reds expected at merge (controller re-pins · builder did not edit)
- `scripts/qc-hf-fu.mts` ST1 (`:41` title · `:233` `LANE_PIN = "c5fc223b"` · `:296` NEVER_TOUCH_GLOB `register[\w-]*` hits register-shared.ts · outbox window) — red: prisma/ changed + register-shared.ts + outbox-consumers.ts. 28/29.
- `scripts/qc-pos-p2.12.mts` ST1 (`:40` · `:270` `LANE_PIN = "c5fc223b"`) — red: prisma/ changed · lane-A files outbox-consumers.ts, register-shared.ts. 32/33.
- `scripts/qc-pos-p2.10.mts` ST2 (`:58` · `:221` `LANE_PIN = "3d2f6db8"`) — red: register-shared.ts hunk (+23 −3) · outbox-consumers.ts (+11 −2) · qc-pos-p1.18 edited beyond the rewardNearCustomerDisplay line · qc-pos-p2.12 edited. 12/13.
- **not in the prompt's list:** `scripts/qc-pos-p2.13.mts` ST5 (`:69` title · `:350`/`:352` `LANE_PIN = "05975437"`) — red: prisma/ diff + `src/lib/outbox-consumers.ts` touched (both required by R7/R8). 53/54.
- **CONTROLLER-DECISION CD-B3** `scripts/qc-pos-p1.18.mts` ST2 (`:469` regex `@\/lib\/modules\/(?:chat|kanban|hr)` over every file in `src/lib/modules/pos`) — red: `hr-link.ts import @/lib/modules/hr`. P3.5 ruling 11 makes exactly this import the only allowed POS→HR path (qc-pos-p3.5 ST1 requires it), so the P1.18 hard rule needs an exemption for `pos/hr-link.ts` + `pos/hr-link-actions.ts` (suggested ORACLE-EDIT: skip the `hr` alternative for those two files). Not in the approved ORACLE-EDIT list ⇒ not edited. 80/81.

## CONTROLLER-DECISION items
- **CD-B1 (applied)** ST1 forbids `@/lib/core/db` in `hr/pos-seam.ts`, but the brief says the seam "reads via tenantDb + existing HR functions" and no HR function returns the HR-system list / employee `active` / attendance in a range / adjustment status by id. Reads that HR does not offer live in a new HR file `hr/pos-seam-read.ts` (read-only `findMany/findFirst` via `tenantDb`, no writes); the seam composes HR functions + these readers and writes only via `clock()`. HR may fold them into service/clock later.
- **CD-B2 (NOT applied — typecheck red)** `src/lib/modules/pos/register.ts:510` `const REG_MESSAGE: Record<RegisterRefusalCode, string>` is exhaustive ⇒ adding the 3 codes to `RegisterRefusalCode` (names table · ST3) gives `TS2739 … missing NO_EMPLOYEE, ALREADY_CLOCKED, OFF_SCHEDULE`. register.ts is forbidden (ruling 11 · ST2 · prompt) and CD-1 covered register-shared only (order-shared.ts:141 records the same trap at P2.8). Options: (a) allow a message-only hunk in register.ts REG_MESSAGE (+ ORACLE-EDIT qc-pos-p3.5 ST2 / hf-fu re-pin) — patch below; (b) keep the codes out of `RegisterRefusalCode` with a separate union (ORACLE-EDIT ST3 + wider return types on verifyStaffPin/posClockForShift). Recommendation (a). Patch (insert after the last entry of REG_MESSAGE in register.ts):
  ```ts
  // POS P3.5 ▸ R13 (CD-B2): รหัสของด่านตารางงาน/ลงเวลา — หน้าขายไม่คืนรหัสเหล่านี้ (ครบ Record เท่านั้น) ◂
  OFF_SCHEDULE: "ยังไม่อยู่ในเวลางานตามตาราง — ให้ผู้จัดการใส่ PIN เพื่ออนุญาต",
  ALREADY_CLOCKED: "ลงเวลานี้ไปแล้ววันนี้",
  NO_EMPLOYEE: "ผู้ใช้นี้ยังไม่ได้ผูกกับพนักงานในระบบพนักงาน (HR)",
  ```
- **CD-B3** p1.18 ST2 exemption (above).
- **CD-B4 (info)** p2.13 ST5 is one more lane pin that bites (prisma/ + outbox-consumers) — add to the merge re-pin set.

## Deviations (each with reason)
1. Migration has no `SET lock_timeout` (prompt asked for it) — ST3 accepts only `CREATE …` / `ALTER TABLE "PosStaffCommission" ADD CONSTRAINT` statements; the migration creates a new table only (no lock on existing tables).
2. `onShiftToday` items carry an extra additive field `clock: {firstInAt, lastKind, lastAt}` (latest attendance ≤ `at`, first IN of the Bangkok day) — the hours warnings NO_CLOCK_IN / NO_CLOCK_OUT (CD-6) cannot be computed from the 4 frozen names otherwise; names/shapes unchanged.
3. `hrLinked` = the tenant has an HR system (any). Lock-screen `hr` key present iff `hrLinked`; unlinked user → `{schedule:null, onLeave:false, inSchedule:null}`; day off → `schedule:null, inSchedule:false`; `inSchedule` uses the gate window `[start − earlyMin, end + lateMin]`.
4. Accrual happens once per sale (only when the sale has no ACCRUE rows yet and is not VOIDED) and skips zero-amount lines; rate/role/enabled are read when the consumer runs (≈ sale time; the snapshot is on every row). Void/refund reversals are computed from the ACCRUE rows only, under a per-sale advisory lock, so paid↔void↔refund ordering converges (the paid handler also applies refunds that arrived first).
5. VOID reversal amount = −(accrual − refund reversals already on the line) (void after refunds is impossible today — guarded anyway); REVERSE periodKey = Bangkok month of the `pos.sale.voided` outbox event (fallback `updatedAt`) / of the refund document's `paidAt`.
6. Push groups OPEN rows by target period (row month → first month ≥ it without a payroll run) — several ended months can merge into one adjustment; `PERIOD_CLOSED` from HR inside the tx ⇒ hop to the next month (race with `createPayrollRun`). An HR adjustment later REJECTED/cancelled is not re-sent (rows stay SENT; report `hrStatus` shows it) — follow-up.
7. `posClockForShift` requires the token user to be the shift opener (PERMISSION_DENIED otherwise) and serialises per (tenant, user) with an advisory lock around `clockSelf` (double tap from two devices = one row). `clockOnShift = OFF` is a UI prompt setting only — the service does not refuse.
8. `overrideTtlMin = 0` disables overrides (OFF_SCHEDULE stays). Override checks the manager's role/unit before the PIN (no PIN oracle for non-managers); wrong manager PIN counts on the manager row. The anonymous path also writes `schedule_denied` (not counted by the oracle).
9. Report `commission` filters ledger rows by `createdAt` in the business-day range and the actor's units; `hrStatus` = status of the latest adjustment (`IN_RUN` when it has a runId).
10. Settings writers have no server actions yet (P3.5U adds them with the switch/card); the inventory row only documents that.
11. Lock-screen HR states query HR per user (onShiftToday loops `employeeOfUser`) — fine for shop-sized staff lists; HR H2.1 can batch behind the same name.

## Regression (QC4 · tree b · head 6e8c1936 unless noted · logs `/tmp/…/scratchpad/p35b/reg1`, `reg2`)
qc-pos-p1.15 40/40 · p1.9 53/53 · p1.17 40/40 · p1.18 80/81 (ST2 = CD-B3; S1 fixed at c86e64ac) · p2.12 32/33 (ST1 lane pin) · p2.13 53/54 (ST5 lane pin; ST6 fixed at c86e64ac) · p2.14 60/60 · api-skill 12/12 · hf-hr-privacy 194/194 · hf-reports-authz 79/79 · hf-pos-page-authz 87/87 · account-cpa 107/107 · p2.1 55/55 · money: restaurant-money 6/6 · restaurant-pay 19/19 · restaurant-void 11/11 · shop-refund 12/12 · hotel-money 5/5 · ticket-money 6/6 · subscription-money 14/14 · lane pins: hf-fu 28/29 (ST1) · p2.10 12/13 (ST2) · **HR set** qc-hr 9/9 · hr-attendance 31/31 · hr-payadjust 27/27 · hr-roster 24/24 · hr-leave-booking 14/14 · payroll 19/19 · payroll-reverse 14/14 · crm-c3.3 90/90 · booking-hours-hr 13/13 (all green; never `seed-hr-qc`) · fitness (no env) 53/53 · fitness-pos 8/8 · `gen-pos-api-docs --check` 0 (after regeneration).

## `--state` list for P3.5U (visual · controller shoots)
`13b-schedule-chip-today` · `13b-schedule-chip-leave` · `13b-offschedule-refusal` · `13b-override-sheet` · `13b-override-wrong-pin` · `13a-shift-list-hr` · `17c-staff-hr-switch-owner` · `17c-staff-schedule-gate-card` · `17c-staff-commission-card` · `07-shift-clock-ask-in` · `07-shift-clock-ask-out` · `07-shift-hours-owner` · `07-shift-hours-warnings` · `08-report-commission-owner` · `08-report-commission-denied` (th 3 sizes + en 1440 · owner/cashier).
