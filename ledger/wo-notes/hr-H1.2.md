# WO H1.2 — Time and leave model (HrShift · HrRosterEntry · HrShiftSwapRequest · HrAttendance evidence · HrTimeCorrection · HrOtRequest · HrLeavePolicy · HrLeaveBalanceTxn · HrHoliday · HrLeave +5 · ABSENT/EARLY_OUT · time-rules · settings CRUD)

> RUN "HR V2" · worktree `/root/projects/shark-hr-b` · branch `wip/pos-hr-h1.2` cut at 4b42e481 (= session/hr 13a0601b with H0.7 + H1.1 merged + H1.2 oracle) · 22 Oct 2026 · controller: Fable · builder: this lane
> Contract: brief `ledger/hr-briefs/hr-brief-H1.2.md` §2 R1–R12 · §9 rulings · §10 rulings on oracle flags · `hr-brief-COMMON.md`
> Oracle: `scripts/qc-hr-h1.2.mts` (73 checks · **not edited by the builder**) · green run `ledger/wo-notes/hr-H1.2-green.txt`
> DB: QC4 only — `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/<file>.mts`

## 0. Checkpoint
- done: step 0 (generate · forced oracle on untouched base = 17/73, `BASE-EXPECTATION 73/73 as registered`, S5 digests all equal the frozen values) · QC4 `_prisma_migrations` check · schema · migrate diff · migrations A + B applied on QC4 · generate · R2–R11 · seed ×4 · oracle forced ×2 + unforced ×1 = 73/73 · regressions (§5) · fitness both modes · typecheck ×1
- next (controller): rule D-1 (oracle typecheck ORACLE-EDIT) · CONTROLLER-RUN screenshots `visual-hr.mts 1.2 --user owner|manager-branch` · reviewer (schema + race)
- last command: see §5 (final `seed-hr-qc` 27/27)

## 1. Files touched
| file | new/edited | what | R |
|---|---|---|---|
| `prisma/schema/hr.prisma` | edited | 8 enums · `HrAttendanceJudgement` +ABSENT +EARLY_OUT · 8 models · HrAttendance +7 (+relation, `@@index([rosterEntryId])`) · HrLeave +5 (+relation) · HrEmployee back-relations · HrWorkSchedule block untouched | R1 R2 |
| `prisma/migrations/20261205000000_hr_time_leave_model/migration.sql` | new | §2 | R1 |
| `prisma/migrations/20261205000001_hr_judgement_enums/migration.sql` | new | exactly 2 `ADD VALUE IF NOT EXISTS` | R2 |
| `src/lib/core/scope.ts` | edited (core, marked) | 8 × `sys()` | R10 |
| `src/lib/modules/hr/time-rules.ts` | new | pure helpers + `shiftTimesProblem` + `TimeRuleError` (Thai texts) | R4 |
| `src/lib/modules/hr/service.ts` | edited | `AttendanceJudgement = HrAttendanceJudgement` · `LEAVE_BASE_SELECT` / `ATTENDANCE_BASE_SELECT` (schema column order + `employee: true`) on listLeaves / pendingLeaves / listAttendance | R2 R6 |
| `src/lib/modules/hr/settings.ts` | new | list/create/update/archive shift + policy · listHolidays/upsertHoliday/deleteHoliday · `canManageHrSettings` · `settingsRowUnit` · fixed texts · audit ids only | R5 |
| `src/lib/modules/hr/settings-actions.ts` | new | 8 `(formData)` actions · assertCan key (tenant-level, "ทุกสาขา") + unit from DB row (explicit-list viewers only) | R9 |
| `src/app/app/sys/[id]/hr/settings/page.tsx` | new | guarded stub (hrScopeOf guard · 404 unless OWNER/hr.employee.create) · 3 sections · ?msg= result line | R9 |
| `src/messages/{th,en}/common.json` | edited (hot) | `hr.settings.*` (same keys both locales; repo loads `<locale>/common.json`) | R9 |
| `src/lib/modules/hr/ui.tsx` | edited | 2 Thai judgement labels · hub card `hr-link-settings` (settings viewers only) — hrTabs untouched (qc-hr-roster NM-3 ties tabs to the sidebar) | R2 R9 |
| `scripts/hr-ui-inventory.json` | edited | +36 rows (`hr-settings-*`, `hr-link-settings`) | R9 |
| `scripts/visual-hr.mts` | edited | `SPECS["1.2"]` settings-stub (owner, manager-branch) | R9 |
| `scripts/fitness-hr.mts` | edited | F16.1 SENSITIVE_FIELDS += lat, lng, photoKey, attachmentKey | R7 |
| `scripts/hr-qc-env.mts` | edited | HR_TABLES +8 · HR_DELETE_ORDER (requests/txn → roster before attendance/leave; shift/policy/holiday before employee) · `HQC.timeLeave` | R10 R11 |
| `scripts/seed-hr-qc.mts` | edited | section 9b via hr/settings (owner) + check TL1 · expected `timeLeave` section | R11 |

## 2. Migration / seed
- QC4 `_prisma_migrations` before: 1201–1204 HR folders applied + 22 POS folders (not on this branch, untouched). Pre-check: none of the 8 tables / 8 enums present · judgement 4 labels · HrAttendance rows on QC4 = 120 (≪ 200 000) · PG 18.6.
- `prisma migrate diff --from-schema <base 4b42e481 schema> --to-schema prisma/schema --script` = 52 statements, read: no DROP/RENAME/ALTER COLUMN; the 2 `ALTER TYPE … ADD VALUE` lines (+ Prisma's AlterEnum comment) removed from A and moved to B.
- **A = 57 statements**: 8 CREATE TYPE · 2 ALTER TABLE ADD COLUMN (HrAttendance 7 · HrLeave 5, all NULL, no DEFAULT) · 8 CREATE TABLE · 19 plain CREATE INDEX (incl. `HrAttendance_rosterEntryId_idx`) · 2 Prisma CREATE UNIQUE INDEX (roster `(employeeId,date,shiftId)`, balance `(systemId,sourceKey)`) · 11 ADD FOREIGN KEY (Cascade/Restrict/SetNull as R1) · **7 raw uniques**: shift `(systemId, COALESCE(unitId,''), lower(name)) WHERE active` · swap `(fromEntryId) WHERE status IN ('AWAITING_PEER','PENDING')` · correction `(attendanceId) WHERE PENDING AND attendanceId NOT NULL` · correction `(employeeId,rosterEntryId,kind) WHERE PENDING AND rosterEntryId NOT NULL` · OT `(employeeId,startAt) WHERE status IN ('PENDING','APPROVED')` · policy name (as shift) · holiday `(systemId,date,COALESCE(unitId,''))`. Header = pre-check SQL (4 HR folders · 0 types · 0 tables · HrAttendance count rule).
- **B = 2 statements** (`ADD VALUE IF NOT EXISTS 'ABSENT'` / `'EARLY_OUT'`), separate folder sorting after A.
- Applied: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec prisma migrate deploy` → "Applying migration 20261205000000_hr_time_leave_model" then "…0001_hr_judgement_enums", exit 0 · after: both rows finished, not rolled back · judgement = ON_TIME,LATE,DAY_OFF,NO_SCHEDULE,ABSENT,EARLY_OUT · `prisma generate` (own node_modules, not a bind mount).
- Residue of the migration on QC4: the 8 tables (empty except `qc-hr-v2` seed rows: HrShift 4 · HrLeavePolicy 4 · HrHoliday 2) — QC4 now carries the H1.2 schema for every lane (additive; old code ignores it).
- Seed ×4 (`seed-hr-qc` 27/27 each, new check TL1) · counts identical across runs. **Diff for the controller (counts vs H1.1):** `HrShift: 4` · `HrLeavePolicy: 4` · `HrHoliday: 2` (new) · `AuditLog` +10 (one `hr.settings.*` row per seeded settings write — 27 now) · everything else unchanged (HrAttendance 120 · HrLeave 2 · …). `hr-expected.json` (not committed) gains `timeLeave {note, shifts[4], policies[4], holidays[2]}`; counts include the three new tables.
- Seed values: shifts กะเช้า 07–15 shift-1 · กะบ่าย 12–20 shift-2 · กะปิดร้าน 15–23 shift-3 (grace 15, shop-wide) · กะดึก (QC ข้ามเที่ยงคืน) 22–06 crossesMidnight shift-4, nobody assigned · policies (HQ12 recommended, marked "ค่าตั้งต้นรอเจ้าของยืนยัน (HQ12)"): ลาป่วย SICK 30 paid attach≥3 · ลากิจ PERSONAL 3 paid · ลาพักร้อน VACATION 6 minService 365 carry 6 exp 03-31 · ลาไม่รับค่าจ้าง OTHER unpaid no quota · holidays: วันสงกรานต์ PUBLIC `<year>-04-13` presetYear=<year> shop-wide · วันหยุดประจำปีสาขาหัวหิน SHOP `<year>-06-15` huahin. No roster/txn/request rows.

## 3. Refusal texts (fixed Thai, no names/ids)
| where | text |
|---|---|
| duplicate active shift name (same system + unit, case-insensitive) | มีกะชื่อนี้อยู่แล้วในสาขานี้ |
| duplicate holiday (system + date + unit) | มีวันหยุดวันนี้อยู่แล้ว |
| duplicate active policy name | มีประเภทการลาชื่อนี้อยู่แล้ว |
| shift start = end | เวลาเริ่มกับเวลาเลิกกะต้องไม่เท่ากัน |
| shift minutes out of range | เวลากะต้องอยู่ระหว่าง 00:00 ถึง 24:00 |
| crossesMidnight ≠ (end < start), or 1440 with crossesMidnight | กะที่เลิกหลังเที่ยงคืนต้องติ๊ก "ข้ามเที่ยงคืน" (และกะที่ติ๊กต้องเลิกก่อนเวลาเริ่ม) |
| row of a unit outside the viewer's scope (shift/policy/holiday) | รายการนี้เป็นของสาขาอื่น — คุณจัดการได้เฉพาะสาขาของคุณ |
| shop-wide row by a branch-restricted viewer | รายการที่ใช้ทั้งร้านจัดการได้เฉพาะผู้ดูแลทุกสาขา — เลือกสาขาของคุณ |
| unit id not a BusinessUnit of the tenant | ไม่พบสาขานี้ในร้าน — กรุณาเลือกสาขาใหม่ (H1.1 text) |
| no OWNER / hr.employee.create | คุณไม่มีสิทธิ์ตั้งค่าระบบพนักงาน |
| id not in this system/tenant | ไม่พบรายการนี้ · action with non-HR/foreign systemId: ไม่พบระบบพนักงานนี้ |
| validation | ชื่อ (≤60) · รหัสกะ (≤20) · พัก 0–720 · ผ่อนผัน 0–240 · สี shift-1..12 · หมวดการลาไม่ถูกต้อง · โควตา 0–365 ทีละ 0.5 · สะสม ≤ โควตา · MM-DD · อายุงาน 0–3650 · แนบเอกสาร 1–365 · เดือนเริ่มปี 1–12 · วันที่ไม่ถูกต้อง · ชนิดวันหยุด · presetYear 2000–2999 · หมายเหตุ ≤200 · other DB error: บันทึกไม่สำเร็จ — กรุณาลองใหม่ |
| reserved, not used in H1.2 (ruling 11) | กะนี้ถูกใช้ในตารางงานแล้ว — ปิดใช้แทนการลบ |

## 5. Regression (branch head ae0d1141; every suite forced through qc4.sh + gate lock · exit · summary)
| suite | result |
|---|---|
| `qc-hr-h1.2` forced ×2 · unforced ×1 | 0 · 73/73 ×3 · RESIDUE none |
| `qc-hr-h1.1` | 0 · 81/81 |
| `qc-hr-h0.7` | 0 · 74/74 |
| `qc-hf-hr-privacy` | 0 · 194/194 |
| `qc-hr-h0.1` · `h0.2` · `h0.3` · `h0.5` | 0 · 67/67 · 58/58 · 37/37 · 71/71 |
| `qc-hr-h0.6` (QC_H06_BASE=d350c26c…) | 0 · 55/55 |
| `qc-crm-c3.3` · `qc-crm-c0.3` | 0 · 90/90 · 88/88 |
| `qc-calendar` · `qc-approval-wiring` · `qc-bulk-ops` | 0 · 9/9 · 7/7 · 13/13 |
| `qc-kanban-k3.3` | 0 · 14/15 — K3.3-S9.2 wants screenshots in `.qc-shots/kanban/3.3` (absent in this worktree; environmental, MINOR, unrelated) |
| `qc-ai-tools` · `qc-hr-attendance` · `qc-hr` · `qc-payroll` | 0 · 18/18 · 31/31 · 9/9 · 19/19 |
| `seed-hr-qc` ×4 | 0 · 27/27 each · counts md5 identical |
| `pnpm fitness` with env / without | 42/42 · 42/42 |
| `fitness-hr` with env / without | 7/7 · 7/7 |
| typecheck (1 run; MemAvailable 10032 MB, no build/tsc unit) | exit 2 — 13 errors, all in the oracle (D-1) · product 0 · tsbuildinfo 18:34 → 19:35 UTC |
- not run (controller to schedule if wanted): qc-hr-roster · qc-hr-leave-booking · qc-hr-payadjust · qc-payroll-reverse · qc-booking-hours-hr · qc-ai-proposals · qc-nav-functions · visual-hr (CONTROLLER-RUN; `--dry` = 1 page × 3 sizes per user).

## 8. Who gains / loses access
| who | gains | loses | why |
|---|---|---|---|
| OWNER · MANAGER (any unitAccess) · STAFF with hr.employee.create | settings page + 8 actions; branch-restricted (explicit unit list) viewers manage only their units' rows and see shop-wide rows read-only | — | Q2 · R5 |
| everyone else | — | — (page 404, actions refused) | |
| all readers of attendance/leave | nothing new (R6 selects; DTOs unchanged; privacy 194/194) | — | R6 R7 |

## 9. Disputes / decisions
- **D-1 ORACLE-EDIT `qc-hr-h1.2` (typecheck only, runtime green).** `pnpm typecheck` exit 2 with 13 errors, all in the oracle, 0 in product code: (a) L1515 `const race = async (n: number, f: (i: number) => Promise<string>) => …` is reused at L1566 with `svc()` (returns `SvcOut`) ⇒ TS2322/TS2339 ×6 — proposed: `const race = async <R,>(n: number, f: (i: number) => Promise<R>): Promise<R[]> => Promise.all(Array.from({ length: n }, (_, i) => f(i)));` · (b) L1818 `let tail: {…} | null = null;` is assigned inside `runDb()` so TS narrows it to `never` at L1893–1894 (TS2339 ×7) — proposed: `let tail = null as { T: string; qcSnap: () => Promise<string>; qcBefore: string; eXSame: boolean } | null;`.
- Decisions: settings lists return active rows only (`includeArchived` option for later) · `crossesMidnight` omitted by a form/caller ⇒ derived from `endMin < startMin`; given explicitly ⇒ validated · archive of an already archived row = ok without an audit row · holiday date is a calendar date (`YYYY-MM-DD` → `@db.Date`), `listHolidays` year = 01-01..12-31 · unit id of a new row must be a BusinessUnit of the tenant · seed writes through `hr/settings` as the owner (so the seed adds 10 audit rows) · hub card added, `hrTabs` unchanged (NM-3 of qc-hr-roster ties tabs to the sidebar menu) · messages live in `src/messages/<locale>/common.json` under `hr.settings` (the repo has no `src/messages/{th,en}.json`; request.ts loads common.json) · stub page posts through inline server wrappers that redirect with `?msg=<fixed text>`.

## 10. Debts (in addition to brief §7 D1–D9)
| item | reason | closes in |
|---|---|---|
| hub card label/desc are Thai literals (rest of HrHub too) | module convention | H2.2 |
| no update/edit form on the stub page (actions + services exist) | stub scope | H2.2/H2.7/H2.8 |
| `T_SHIFT_USED` text unused | roster writer = H2.1 (ruling 11) | H2.1 |
| (F5) `rosterDayOf` tie-break = window starting closest to `at`; with tolerance a 05:50 OUT after a 22–06 night resolves to the 06:00 morning entry — H2.4 must pass the punch kind / prefer the window `at` is strictly inside | pure helper unused at runtime in H1.2 | H2.4 |
| (F5) two encodings of a midnight-ending shift (`endMin 1440, crossesMidnight false` ≡ `endMin 0, crossesMidnight true`, same window) | both valid per R4 | H2.1 normalises on write |
| (F5) roster unique `(employeeId,date,shiftId)` allows two overlapping different shifts the same day | split shifts intended | H2.1 overlap / ≥1-day-off rule check |
| (F5) raw `lower(name)` uniques do no Unicode normalisation / whitespace collapse (sara-am U+0E33 vs U+0E4D+U+0E32, inner double spaces) | expression index only | H2.2 (normalise names on write) |
| (F5) F16.1 SENSITIVE_FIELDS `lat`/`lng` are generic names — a future HR client file touching BusinessUnit location will trip it | Q5 ruling | H2.4 (qualify or baseline) |
| (F5) PDPA `exportTenantData` (`platform/pdpa.ts:35`) dumps every `sys()` table incl. the 8 new ones (and GPS/photo from H2.4) — pre-existing (pinHash/nationalId already exported) | outside H1.2 | HQ27 / H2.4 |
| (F5) no FK on `HrShiftSwapRequest.requesterEmployeeId/targetEmployeeId/toEntryId`, `HrTimeCorrection.rosterEntryId/resultAttendanceId`, `HrOtRequest.rosterEntryId` (R1) — writers must check in-system | R1 as ruled | H2.x writers |

## R13. Fix round (review `shark-hr-c/ledger/wo-notes/hr-H1.2-review.md` · base 17867bd2 = 4bca1281 + oracle types-only ORACLE-EDIT)
| R | fix | where |
|---|---|---|
| R13.1 (F1) | HR sidebar children += `{ href: `${s}/hr/settings`, label: "ตั้งค่า" }` (one marked line; page stays guarded) ⇒ qc-nav-functions S5 green · qc-hr-roster NM-3 still green | `src/app/app/layout.tsx` |
| R13.2 (F2) | `targetUnitRefusal(ctx, scope, unitId, tx?)` — the 3 in-transaction callers (updateShift, updateLeavePolicy, upsertHoliday update) pass `tx` and query `tx.businessUnit` (tenantId in the where); out-of-tx callers keep `tenantDb` | `hr/settings.ts` |
| R13.3 (F3) | redirect carries a short code (`ok` · `s.<SETTINGS_TEXT key>` · `t.<TIME_RULE_TEXT key>` · `u.notFound`; unknown reason ⇒ `s.failed`); page renders only from that allowlist, unknown code ⇒ nothing | `settings/page.tsx` |
| R13.4 | `leaveDaysBetween` refuses ranges > 366 calendar days: `"ใบลาหนึ่งใบยาวได้ไม่เกิน 366 วัน"` (`TIME_RULE_TEXT.leaveTooLong`) · vectors: 2030-01-01..2030-12-31 ⇒ "365.0" · 2028-01-01..2028-12-31 ⇒ "366.0" · 2030-01-01..2031-01-01 ⇒ "366.0" · 2026-01-01..2029-12-31 ⇒ refusal (was "1461.0") · S2.10 vectors unchanged | `hr/time-rules.ts` |
| R13.5 (F4) | runbook: >200k branch also ships the HrAttendance FK `NOT VALID` + `VALIDATE CONSTRAINT` in the third migration | §6 below |
| F5 | recorded as debts | §10 |
- R13 results: qc-hr-h1.2 forced ×2 + unforced 73/73 (residue none) · qc-nav-functions 11/11 · qc-hr-roster 24/24 (NM-3 green) · qc-hr-leave-booking 14/14 · qc-hr-payadjust 27/27 · qc-payroll-reverse 14/14 · qc-booking-hours-hr 13/13 · qc-ai-proposals 16/16 · qc-hr-h1.1 81/81 · qc-hf-hr-privacy 194/194 · qc-calendar 9/9 · fitness 42/42 + fitness-hr 7/7 both modes · typecheck exit 0 (0 errors).

## 6. Prod runbook (brief §6, confirmed)
1. Read-only pre-checks on prod: `_prisma_migrations` has 1201–1204 finished · `SELECT count(*) FROM "HrAttendance"` — **> 200 000 ⇒ stop**, move `HrAttendance_rosterEntryId_idx` to a third migration `20261205000002_…` with `CREATE INDEX CONCURRENTLY` (no tx), shipped after A/B · **(R13.5)** in that same branch, A adds the HrAttendance FK as `ALTER TABLE "HrAttendance" ADD CONSTRAINT "HrAttendance_rosterEntryId_fkey" … ON DELETE SET NULL ON UPDATE CASCADE NOT VALID` (no full-table scan under SHARE ROW EXCLUSIVE, clock writes not blocked) and the third migration runs `ALTER TABLE "HrAttendance" VALIDATE CONSTRAINT "HrAttendance_rosterEntryId_fkey";` (SHARE UPDATE EXCLUSIVE — writes continue) · no type named HrRosterSource…HrHalfDay · enum HrAttendanceJudgement has no ABSENT/EARLY_OUT (B is idempotent anyway).
2. `migrate deploy` applies A then B (separate transactions), then the code deploys in the same Vercel build. Old code never reads the new columns; R6 selects are explicit.
3. Post-checks: HrAttendance / HrLeave row counts unchanged · 8 new tables empty · judgement 6 labels.
4. Rollback: code rollback safe; schema rollback not planned (additive; enum values cannot be dropped — accepted).

## 11. QC4 restored / temp data
- oracle residue none ×3 · seed re-run last (qc-hr-v2 rebuilt) · temp script `scripts/tmp-h12b-migcheck.mts` deleted (never committed) · nothing of this lane running.
