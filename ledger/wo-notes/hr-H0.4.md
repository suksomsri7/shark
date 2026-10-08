# WO H0.4 — HR QC tooling (`fitness-hr` · `hr-qc-env` · `seed-hr-qc` · `visual-hr` · `hr-ui-inventory` · `TEMPLATE-hr`)

> RUN "HR V2" · worktree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.4` cut from `session/hr` @d43bdcb8 (contains afcb9bc3 · H0.1 · H0.2 · H0.3) · 2026-10-08 · builder: Opus 5.5 (lane S, single)
> Contract: `HR-V2-MASTER-PLAN.md` §2 (13–16) §3 (X1–X12) §4 H0.4 §6 (F16.1–F16.5) via `git show origin/session/pos:…` · brief `ledger/hr-briefs/hr-brief-H0.4.md` + `hr-brief-COMMON.md`
> Oracle of this WO (no separate oracle writer): `fitness-hr` green in both modes + negative proofs + `seed-hr-qc` ×2 identical + `visual-hr --dry`
> DB: QC4 only (`ep-frosty-lab`, checked with `grep -c ep-frosty-lab .env.qc4` = 2 before the first DB command) · base check `git merge-base --is-ancestor afcb9bc3 HEAD` → ok
> Raw outputs (gitignored): `.qc-shots/hr/h0.4/` — `fitness-before.txt` · `fitness-after*.txt` · `fitness-hr-{env,noenv}.txt` · `negative.txt` · `seed-run{1,2}.txt` · `hr-expected-run{1,2}.json` · `reg-{before,after}/` · `visual-*.txt` · `typecheck-*.txt`

## 0. Checkpoint
- done: steps 1–4 of brief §4 (see commit list in §12) · round 2 (controller rulings + FIX A, C–K) — see §13
- next: controller review of round 2 · controller-run `visual-hr` shots on :3226 · rc-time hook of `runHrFitness` into `scripts/fitness.mts`

## 1. Files touched
| file | new/edited | what | hot file? |
|---|---|---|---|
| `scripts/fitness-hr.mts` | new | F16.1–F16.5, ratchet baselines, `runHrFitness(chk, ROOT)` export for the rc hook, `--print-pin-readers` | – |
| `package.json` | edited (1 line) | `"fitness:hr": "tsx scripts/fitness-hr.mts"` after `"fitness"` | yes — the only hot-file edit |
| `scripts/hr-qc-env.mts` | new | `loadHrQcEnv` (acc-v2 `loadQcEnv` + QC4-only guard, prints host only) · `HR_TABLES` · `HR_DELETE_ORDER` · `HQC` · `hqcDates()` · `findQcTenant` · `makeChecker` (chk/summary) | – |
| `scripts/seed-hr-qc.mts` | new | builds exactly `HQC`; deletes only `qc-hr-v2` | – |
| `scripts/visual-hr.mts` | new | 7 pages × 3 viewports × 7 HQC users, `SPECS` per WO, `--dry` | – |
| `scripts/hr-ui-inventory.json` | new | 15 rows (r2: +3 ConfirmDialog `-sheet`) + `$foreign` + `$debt` | – |
| `.gitignore` | edited (r2, 2 lines) | `scripts/hr-expected.json` (ruling 7 / FIX B) | – |
| `ledger/wo-notes/TEMPLATE-hr.md` | new | HR notes template (16 gates · X1–X12 · regression · privacy matrix · parity · access table · temp data) | – |
| `ledger/wo-notes/hr-H0.4.md` | new | this file | – |
No file under `src/` touched (`git diff --stat d43bdcb8 -- src` = empty). `scripts/fitness.mts`, `account/service.ts`, `ai/proposals.ts` untouched. `scripts/hr-expected.json` not committed.

## 2. Seed
- `seed-hr-qc` deletes only the tenant with slug `qc-hr-v2` **and** name `บ้านกาแฟสวนผึ้ง (QC HR)` (name mismatch ⇒ exit 4, nothing deleted). Order: `HR_DELETE_ORDER` (child before parent: payroll → hr → approval → audit/outbox/notification/automation → account → hrEmployee/party/membership/appSystemUnit/appSystem/businessUnit) → sweep of every other table with a `tenantId` column (information_schema, 12 passes for FKs) → `ChatRateBucket` rows whose key contains the old tenant id (`hr-setpin:<t>:…` · `hr-kiosk:emp|sys:<t>:…`) → users by HQC e-mail (cascade sessions) → tenant. Then D1 checks that **no** `tenantId` table has a row of the old id (AuditLog is `onDelete: SetNull` on Tenant, so it is deleted explicitly first).
- `assertMayReseed("seed-hr-qc.mts")` after env load (no-op on QC4).
- Service-first: `createEmployee` · `saveEmployeeProfile` · `setSchedule` · `setPin` · `setEmployeeActive` · `grantStaffAccess` (links, actor = owner) · `setSalaryProfile` · `requestAdjustment`/`decideAdjustment` (requested by `payroll`, approved by `owner` — 4 eyes) · `runExclusions` · `createPayrollRun` · `approveRun(ctx, runId, expect, ownerActor)` with `expect = { totalNetSatang, itemCount, totalGrossSatang, itemsDigest }` from `payroll-digest.ts` · `markPaid` · `requestLeave`/`decideLeave` (decider = manager). Direct writes: users + memberships + tenant + business units (same as `seed-crm-qc`/`seed-member-qc`; there is no service for these) and **`insertHistoricalClock`** (`seed-hr-qc.mts:273`) — the only direct HR write: backdated `HrAttendance` rows, because `clock()` stamps `now()`. Its judgement uses the real `clockInDetail(at, schedule)` (same as `clock()`).
- No `drainAll` (the QC4 outbox is shared by every lane). PINs are read back only as `hasPin` through `kioskRoster`; no script of this WO touches the PIN column by name.
- Run ×2 (A3) — identical `JSON_SUMMARY` (byte compare) and identical `hr-expected.json` after masking cuid ids.

## 3. HQC data set (`scripts/hr-qc-env.mts`)
Tenant `qc-hr-v2` "บ้านกาแฟสวนผึ้ง (QC HR)" · units `huahin` สาขาหัวหิน / `suanphueng` สาขาสวนผึ้ง (SHOP) · systems HR "พนักงาน" + ACCOUNT "บัญชี" (`ensureAccounting`), both linked to both units · no POS/BOOKING/CRM (X8) · Q1: one HR system.
Dates (computed by `hqcDates()` from today in Asia/Bangkok; on 2026-10-08: paid run 2026-09, pay date 2026-09-30, leaver end 2026-08-31, future start 2026-11-01).

| key | name | code | position · dept | unit (H1.1, not in DB) | employment | payType · rate (H1.1) | monthly profile today | start | flags |
|---|---|---|---|---|---|---|---|---|---|
| keng | พี่เก่ง | EMP-001 | ผู้จัดการ · บริหาร | huahin | FULL_TIME | MONTHLY | ฿32,000 | today−1460 | PIN · morning |
| namfon | น้ำฝน | EMP-002 | แคชเชียร์ · หน้าร้าน | huahin | FULL_TIME | MONTHLY | ฿16,000 | today−1335 | PIN · **linked to `staff`** · late +18 min (today−1) · OT 6 h in paid run · sensitive fields set |
| prae | แพร | EMP-003 | แคชเชียร์ · หน้าร้าน | huahin | FULL_TIME | MONTHLY | ฿15,500 | today−845 | PIN · leave APPROVED today−6…−5 (no clock rows those days) |
| ton | ต้น | EMP-004 | พ่อครัว · ครัว | huahin | FULL_TIME | MONTHLY | ฿17,000 | today−1430 | PIN · early-out −60 min (today−2) |
| por | ปอ | EMP-005 | ผู้ช่วยครัว · ครัว | huahin | FULL_TIME | MONTHLY | ฿13,000 ¹ | today−640 | PIN · DEDUCTION ฿500 in paid run |
| nat | นัท | EMP-006 | บาริสต้า · บาร์ | huahin | FULL_TIME | MONTHLY | ฿16,500 ¹ | today−920 | PIN · afternoon · absent (today−3) |
| mint | มิ้นท์ | EMP-007 | พนักงานเสิร์ฟ · หน้าร้าน | huahin | DAILY | **DAILY ฿400/day** | ฿8,800 | today−272 | PIN · closing · leave PENDING today+7 · DEDUCTION ฿200 PENDING this month |
| bow | โบว์ | EMP-009 | บาริสต้า · บาร์ | huahin | PROBATION | MONTHLY | ฿14,000 | today−76 | PIN · note "ทดลองงานครบ <today+14>" (mockup "โบว์ · 15 ต.ค.") · BONUS ฿1,000 in paid run · sensitive fields set |
| jay | เจ | EMP-012 | บาริสต้า · บาร์ | suanphueng (borrowed → huahin) | PART_TIME | **HOURLY ฿65/h** | ฿4,680 | today−160 | PIN · afternoon · note "สัญญาพาร์ทไทม์ถึง <end of this month>" (mockup "เจ · 31 ต.ค.") · OT 4 h PENDING this month |
| fai | ฝ้าย | EMP-010 | พนักงานเสิร์ฟ · หน้าร้าน | huahin | DAILY | DAILY ฿400/day | ฿8,800 | today−217 | **leaver**: active=false, endDate = last day of the month before the paid run ⇒ ENDED_BEFORE · no PIN |
| om | ออม | EMP-013 | พนักงานเสิร์ฟ · หน้าร้าน | suanphueng | FULL_TIME | MONTHLY | ฿12,000 | 1st of next month | **future starter** ⇒ STARTS_AFTER · PIN |
| kong | ก้อง | EMP-011 | พ่อครัว · ครัว | suanphueng | PROBATION | MONTHLY | ฿18,000 | **1st of this month (Bangkok)** (r2 FIX F) | **probation hire** ⇒ always after the paid period ⇒ STARTS_AFTER · PIN |
| pui | ปุ้ย | EMP-008 | หัวหน้าบาริสต้า · บาร์ | suanphueng | FULL_TIME | MONTHLY | ฿22,000 | today−700 | **no PIN** |
| koy | ก้อย | EMP-014 | ธุรการ/บุคคล · สำนักงาน | suanphueng | FULL_TIME | MONTHLY | ฿20,000 | today−500 | PIN · **linked to STAFF user `payrollSelf`** (r2 FIX A — payroll viewer with an own row, HQ17 cases) |
¹ salary not shown in mockup 06 — builder's choice. Branch split = mockup 02 header "หัวหิน 9 คน · สวนผึ้ง 5 คน". Shifts: morning 07:00–15:00, afternoon 12:00–20:00, closing 15:00–23:00, grace 15, every weekday (no day off) for the 9 mockup people; the 5 edge cases have no schedule and no clock rows.

| user | e-mail | role | keys (Membership.permissions) | linked employee |
|---|---|---|---|---|
| owner | hr-qc-owner@shark.local | OWNER | {} (all) | – |
| manager | hr-qc-manager@shark.local | MANAGER | {} (all via role, but no `hr.payroll.read` ⇒ `canViewPayroll` false) | – |
| payroll | hr-qc-payroll@shark.local | STAFF | `hr.payroll.read` · `hr.payroll.create` · `hr.payroll.approve` · `hr.payroll.pay` · `hr.payroll.reverse` · `hr.payadjust.request` · `hr.payadjust.approve` · `hr.payadjust.reject` (`PAYROLL_KEYS`) | – (r2: unlinked — pure payroll viewer) |
| staff | hr-qc-staff@shark.local | STAFF | `hr.leave.request` | น้ำฝน |
| kiosk | hr-qc-kiosk@shark.local | STAFF | `hr.attendance.clock` | – |
| member | hr-qc-member@shark.local | STAFF | {} (plain member, no HR key) | – |
| payrollSelf | hr-qc-payroll-self@shark.local | STAFF | same `PAYROLL_KEYS` as `payroll` | ก้อย (r2 FIX A) |
The six brief viewers stay pure (only `staff` ↔ น้ำฝน is linked); `payrollSelf` is the 7th user. Seed check E2b asserts the link map. Note: MANAGER passes `evaluate` for every `hr.payroll.*` action (`src/lib/core/rbac.ts:36`); only `canViewPayroll` keeps `manager` out — oracles must test the actions, not just the page.
All `unitAccess ["*"]`. Q3 — login (passwordless, same as `seed-crm-qc`): open `/login` on the QC server, enter the e-mail, the OTP is shown on screen in preview mode (`previewOtp`; QC builds have no mail provider) — or mint a session the way `visual-hr` does.

Payroll (r2): PAID run for last month (**11 items** = 14 − leaver − future starter − probation hire of this month; `runExclusions` asserted = exactly `fai:ENDED_BEFORE · om:STARTS_AFTER · kong:STARTS_AFTER`), totals on 2026-10-08: gross 18,058,000 · SSO 727,400/727,400 · WHT 27,083 · net 17,303,517 satang · JV Dr = Cr = 18,785,400 · (round 1 on the same day: 12 items, net 19,028,517 — ก้อง then started today−45 = inside the paid period, which made his PARTIAL_MONTH flag depend on the day of the month; FIX F removes that) · 3 APPROVED adjustments bound to the run · 2 PENDING adjustments of this month, unbound · Q2: no DRAFT run for this month. Attendance 120 rows = (9 × 7 − 1 absent − 2 leave days) × 2, exactly one LATE (น้ำฝน 18 min). Leave: แพร VACATION APPROVED (decidedById = manager), มิ้นท์ PERSONAL PENDING.
Seed counts r2 (identical both runs): `{"AccountJournalEntry":1,"AccountJournalLine":5,"AccountLedger":45,"AccountMapping":33,"AccountPeriod":1,"AppSystem":2,"AppSystemUnit":4,"AuditLog":3,"BusinessUnit":2,"HrAttendance":120,"HrEmployee":14,"HrLeave":2,"HrPayAdjustment":5,"HrPayrollItem":11,"HrPayrollRun":1,"HrSalaryProfile":14,"HrWorkSchedule":63,"Membership":7,"OutboxEvent":3,"Party":14,"User(qc emails)":7}`
Birth dates (FIX G): `HQC` stores `birthYearsAgo` (น้ำฝน 28 · โบว์ 23); the seed writes `hqcDates().yearsAgo(n)` = today − n years, same month/day (29 Feb → 28 Feb). `grep -n '20[0-9][0-9]-' scripts/hr-qc-env.mts scripts/seed-hr-qc.mts` → no output.

`HR_TABLES` (real Prisma names, checked against `prisma/schema/*.prisma`; seed check T0 proves every delegate exists): HrEmployee · HrEmployeeDoc · HrAttendance · HrLeave · HrWorkSchedule (hr.prisma) · HrSalaryProfile · HrPayAdjustment · HrPayrollRun · HrPayrollItem (payroll.prisma) · ApprovalPolicy · ApprovalStep · ApprovalRequest · ApprovalDecision · AuditLog · OutboxEvent · Membership · BusinessUnit · AppSystem · AccountJournalEntry · AccountJournalLine · Session (no tenantId) · ChatRateBucket (no tenantId — the DB rate limiter's table).

## 4. Fitness F16 (`scripts/fitness-hr.mts`) and BASELINE debt
- F16.1 — TypeScript AST over every file under `src/lib/modules/hr/**`, `src/app/app/sys/[id]/payroll/**` (r2) and every file under `src/app/app/**` with a path segment `hr`; only files whose first directive is `"use client"`. Red on: an import whose name is a sensitive field; an import of a type/interface (resolved through `@/` or relative paths) that declares a sensitive field; an import of a Prisma model that has one (`@prisma/client`/generated); (r2) `import [type] * as X` + a `X.T` QualifiedName/property reference to such a type, and `Prisma.<Model>{GetPayload,Select,…}` of a sensitive model; a read `x.f` / `x["f"]` / `{ f } =`. A read is allowed only when the file imports a DTO from `privacy-shared.ts` that declares that field — **never for `pinCode`/`pinHash`** (`NEVER_EXEMPT`, r2 FIX C), and `privacy-shared.ts` itself is red if either name appears in its AST. Positive control: privacy-shared.ts must be found and ≥ 1 client file scanned. Heuristic limits (accepted debt, §10): whole-object leaks (`JSON.stringify(e)`, spread, `Object.values`) and only one level of import following — the privacy oracles (`qc-hf-hr-privacy`) are the real gate.
- F16.2 — sha256 of the full bytes = `PAYROLL_RULES_SHA256 = 75a66c0c1354e932e7ba29609dcbf0919ffe82b51f476a3945fd1a0749833bf7` (computed on d43bdcb8). A hash pin, not a ratchet: refreshing it is a controller ORACLE-EDIT.
- F16.3 — every `page.tsx` under `src/app/**` whose path (after stripping route groups `(…)`) has a segment `hr`, `payroll` or `kiosk` (r2 FIX E) must import **a guard** and call it. Guards (allowlist): from `hr/privacy.ts` `load*ForViewer`, `leaveItemsForViewer`, any name starting `require`/`assert`; every export of `hr/scope.ts` when it exists. `hrViewerOf()` alone is not a guard. Positive control on the 2 guarded pages.
- F16.4 — `hr` namespace from `src/messages/<locale>/*.json` (+ `hr.json`, `<locale>.json`, flat `hr.x` keys): same key set, no empty/non-string value, no th value `^[A-Z_]+$`; absent in both ⇒ green `0 keys (namespace not created yet)`; present in one only ⇒ red.
- F16.5 — active only when `src/lib/modules/hr/pin.ts` exists; scope `src/**` + `scripts/**` except `scripts/qc-*.mts` (oracles must read the column to prove "no plaintext left") and `fitness-hr.mts` itself; counts property access, element access, object keys, destructuring and string literals (raw SQL) per file.
- Ratchet (F14 mechanism): a new offender is red; a baseline row that is healed (or whose file is gone) is red until removed; F16.5 counts must equal the baseline exactly.

F16.1 BASELINE (`F161_BASELINE`): **empty** — the only client file that reads sensitive fields is `EmployeeProfileForm.tsx`, through `EmployeeProfileDto` of `privacy-shared.ts` (the planned exception). 7 client files scanned, 25 files in scope.

F16.3 BASELINE (`PAGE_GUARD_BASELINE`) — pages that guard with `requireTenant` + key checks inside UI/service:
| page | closes in |
|---|---|
| `src/app/app/sys/[id]/hr/attendance/page.tsx` | H2.5 |
| `src/app/app/sys/[id]/hr/leave/page.tsx` | H2.7 |
| `src/app/app/sys/[id]/hr/employees/page.tsx` | H1.1/H4.4 |
| `src/app/app/sys/[id]/hr/kiosk/page.tsx` | H2.4 |
| `src/app/app/sys/[id]/hr/payroll/page.tsx` | H3.4 |
Guarded today: `hr/employees/[employeeId]/page.tsx` (`hrViewerOf`, `loadEmployeeProfileForViewer`) · `payroll/[runId]/slip/[employeeId]/page.tsx` (`hrViewerOf`, `loadPayslipForViewer`).

F16.4 BASELINE: empty (namespace absent). F16.5 BASELINE (used once H0.5 creates `pin.ts`; all "closes in H0.5"): `hr/actions.ts` 2 · `hr/privacy.ts` 1 · `hr/service.ts` 8 · `hr/ui.tsx` 1 · `scripts/seed-review-shop.mts` 4.

Inventory (`scripts/hr-ui-inventory.json`) — 12 rows for today's ids: `hr-payroll-create` (form) · `hr-payroll-create-error` · `hr-payroll-run-*-approve-trigger` / `-recompute-trigger` / `-delete-trigger` (ConfirmDialog `testId` prop → `${testId}-trigger`) · `hr-payroll-run-*-error` · `-exclusions` · `-negative` · `-partial` · `hr-payroll-item-*-negative` (conditional link) · `hr-payroll-stranded` · `hr-payroll-stranded-*-move` (`StrandedMoveButton data-testid={testId}`). `hr-link-sales-teams` is in `$foreign` (row belongs to `crm-ui-inventory.json`, C3.6, F14 `CRM_HOSTED_CONTROLS`). ~~Cross-check: 0 ghosts, 0 unregistered.~~ **Correction (r2 FIX H):** the round-1 claim was wrong — the three ConfirmDialog sheet ids `hr-payroll-run-*-{approve,recompute,delete}-sheet` (`src/components/ui/ConfirmDialog.tsx:62` → `${testId}-sheet`) were unregistered. Now 15 rows; re-check by `grep data-testid=|testId=` over `src/lib/modules/hr` + `sys/[id]/{hr,payroll}` (8 direct/dynamic `data-testid` + 3 ConfirmDialog `testId` × trigger/sheet + 1 `StrandedMoveButton testId` = 15) + 1 `$foreign`: 0 ghosts, 0 unregistered.
Inventory BASELINE DEBT (controls without `data-testid`, counted per tag start, hidden inputs excluded; also in `$debt`):
| page | files (count) | closes in |
|---|---|---|
| `/hr/attendance` | `ui.tsx#HrAttendanceSection` 4 | H2.5 |
| `/hr/leave` | `ui.tsx#HrLeaveSection` 7 · `BulkLeaveApprovals.tsx` 7 | H2.7 |
| `/hr/employees` | `ui.tsx#HrEmployeesSection` 21 · `PinField.tsx` 3 | H1.1/H4.4 |
| `/hr/employees/[employeeId]` | `page.tsx` 8 · `EmployeeProfileForm.tsx` 30 | H1.1/H4.4 |
| `/hr/kiosk` | `KioskClock.tsx` 8 | H2.4 |
| `/hr/payroll` | `payroll-ui.tsx` 8 · `PayAdjustForm.tsx` 8 · `PayAdjustRowActions.tsx` 6 · `RunRowActions.tsx` 4 | H3.4 |
| `/payroll/[runId]/slip/[employeeId]` | no controls · no content testids | H3.8 |
| `/app/sys/[id]` (HrHub) | `ui.tsx#HrHub` 1 link | H2.11 (manager overview) — controller ruling r2 |

## 5. Acceptance
**A1** `scripts/fitness-hr.mts` (492 lines) · `package.json:12`. With env (`iso.sh qc4.sh`, DATABASE_URL set) and without (`env -u DATABASE_URL -u DIRECT_URL`), both:
`JSON_SUMMARY {"suite":"fitness-hr","total":5,"passed":5,"findings":[]}` · exit 0 (F16.1–F16.5 blocks visible; F16.4 "0 keys (namespace not created yet)", F16.5 "inactive until H0.5").
`pnpm fitness` before: `JSON_SUMMARY {"total":33,"passed":33,"findings":[]}` exit 0 · after (with env via `qc4.sh` and with `env -u DATABASE_URL -u DIRECT_URL`): `JSON_SUMMARY {"total":33,"passed":33,"findings":[]}` exit 0 both; every ✅/❌ line identical to before (diff empty) · no pre-existing reds. Final `pnpm fitness:hr` both modes: `JSON_SUMMARY {"suite":"fitness-hr","total":5,"passed":5,"findings":[]}` exit 0.
**A2** negative proofs (scratch mutation → red → revert; nothing committed; `git status` clean afterwards, payroll-rules.ts sha256 re-verified):
- F16.1 scratch `src/lib/modules/hr/__neg-f161.tsx` ("use client", reads `.pinCode`): `❌ [F16.1] … — 1 จุด: src/lib/modules/hr/__neg-f161.tsx:3 อ่าน .pinCode → ส่งผ่าน DTO ใน privacy-shared.ts (PIN ห้ามออกจาก server)` exit=1
- F16.2 one byte appended to `payroll-rules.ts`: `❌ [F16.2] … — src/lib/modules/hr/payroll-rules.ts เปลี่ยน (sha256 8aa5ee561bf2… ≠ 75a66c0c1354…) — FREEZE — new rules = new functions + engineVersion` exit=1
- F16.3 scratch `src/app/app/sys/[id]/hr/__neg/page.tsx`: `❌ [F16.3] … (8 หน้า · มีตัวกัน 2 · หนี้เดิม 5) — 1 หน้าไม่มีตัวกัน: src/app/app/sys/[id]/hr/__neg/page.tsx (ไม่ import ตัวกันจาก hr/privacy หรือ hr/scope)` exit=1
- F16.4 th-only `hr.x`: `❌ [F16.4] … — namespace hr มีแค่ th (th/common.json#hr) · มีแต่ th 1: hr.x` exit=1
- F16.5 dummy `hr/pin.ts` + scratch reader `hr/__neg-f165.ts`: `❌ [F16.5] … — src/lib/modules/hr/__neg-f165.ts 1 จุด (:2 .pinCode) — ย้ายเข้า src/lib/modules/hr/pin.ts` exit=1 (the baseline readers stayed green ⇒ the ratchet counts are exact)
- after revert: `JSON_SUMMARY {"suite":"fitness-hr","total":5,"passed":5,"findings":[]}` exit=0
**A3** `seed-hr-qc` ×2 on QC4 through the lane wrapper: run 1 and run 2 both `===== seed-hr-qc ===== ผ่าน 22/22` exit 0; the two `JSON_SUMMARY` lines are byte-identical (`{"suite":"seed-hr-qc","total":22,"passed":22,"findings":[],"counts":{…§3…}}`); `hr-expected.json` identical after masking ids. Other tenants (O1, both runs): before `{"tenant":20,"hrEmployee":22,"hrPayrollRun":0,"customer":71,"posSale":224}` = after. D1 run 2: `ลบร้านเดิม … (350 แถว) — ไม่เหลือแถวที่มี tenantId นี้`. Regression set before → after the seed: see §6 (all identical).
**A4** `visual-hr.mts all --dry --user owner`: `DRY_SUMMARY {"wo":"all","user":"owner","pages":7,"viewports":3,"shots":21}` exit 0 (manager: 6 pages, slip skipped). No `--base`, not dry: `❌ visual-hr: ไม่ได้ส่ง --base …` exit=2 in 1.56 s; unreachable `--base http://127.0.0.1:3299`: exit=2 in 1.15 s.
**A5** `timeout -k 10 1200 env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` (1 run, after all scripts were final) → `tsc --noEmit` no diagnostics, exit 0. All new scripts compile; DB modules are loaded with `import("…" as string)`, local scripts via `./x.mjs`.
**A6** this file (template `TEMPLATE-hr.md`).

## 6. Regression block (COMMON §E · before = before the first seed, after = after seed ×2)
| suite | before | after | identical? |
|---|---|---|---|
| `qc-hr` | exit 0 · 9/9 | exit 0 · 9/9 | yes |
| `qc-hr-attendance` | exit 0 · 31/31 | exit 0 · 31/31 | yes |
| `qc-hr-roster` | exit 0 · 24/24 | exit 0 · 24/24 | yes |
| `qc-hr-leave-booking` | exit 0 · 14/14 | exit 0 · 14/14 | yes |
| `qc-hr-payadjust` | exit 0 · 27/27 | exit 0 · 27/27 | yes |
| `qc-payroll` | exit 0 · 19/19 | exit 0 · 19/19 | yes |
| `qc-payroll-reverse` | exit 0 · ✅ PASS — 14/14 | exit 0 · ✅ PASS — 14/14 | yes |
| `qc-booking-hours-hr` | exit 0 · 13/13 | exit 0 · 13/13 | yes |
| `qc-crm-c3.3` | exit 0 · 90/90 | exit 0 · 90/90 | yes |
| `qc-hf-hr-privacy` | exit 0 · 194/194 | exit 0 · 194/194 | yes |
| `qc-hr-h0.1` | exit 0 · 67/67 | exit 0 · 67/67 | yes |
| `qc-hr-h0.2` | exit 0 · 58/58 | exit 0 · 58/58 | yes |
| `qc-hr-h0.3` | exit 0 · 36/36 | exit 0 · 36/36 | yes |
| `pnpm fitness` (env / no env) | exit 0 · 33/33 | exit 0 · 33/33 / exit 0 · 33/33 | yes (line-by-line diff empty) |
| `fitness-hr` (env / no env) | – (new) | exit 0 · 5/5 / exit 0 · 5/5 | – |
| typecheck | – | exit 0 | – |
Full `JSON_SUMMARY` lines: `.qc-shots/hr/h0.4/reg-{before,after}/_summary.txt` (`diff` of the two files = empty). All suites build their own tenants; none reads `qc-hr-v2`. Known pre-existing reds: none in this set.

## 7. Privacy matrix
N-A for this WO (no product surface). The data set provides the 6 viewers + `findQcTenant` for later oracles; the other tenant is built by each oracle.

## 8. Who gains / loses access
Nobody — no `src/` change, no permission/guard/DTO change. QC-only: seven `hr-qc-*@shark.local` users exist on QC4 inside tenant `qc-hr-v2` (r2: + `hr-qc-payroll-self@shark.local`).

## 9. Decisions for the controller
**Controller rulings (round 2) — recorded:**
- R1 leaver end date = last day of the month before the paid run — ACCEPTED (brief R2 corrected by this ruling).
- R2 ก้อย linked to `payroll` — REJECTED → FIX A: 7th user `payrollSelf` (STAFF, same keys) linked to ก้อย; `payroll` unlinked.
- R3 pay date = last day of the period — ACCEPTED.
- R4 `manager` not linked to พี่เก่ง — ACCEPTED.
- R5 F16.6 (inventory ↔ code) — deferred to H2.2 (§10 debt).
- R6 F16.5 excludes `scripts/qc-*.mts` — ACCEPTED; the F16.5 detail text now says "oracles that read the column must never print it".
- R7 expected files — FIX B: `.gitignore` gets `scripts/hr-expected.json` (other RUNs' tracked files unchanged).
- R8 Q1–Q3 defaults — ACCEPTED.
- HrHub's one control closes in **H2.11** (manager overview) — inventory `$debt` + §4 table + §10.

Round-1 decisions (as submitted):
1. **Leaver end date (brief R2 conflict).** R2 says `endDate = last day of last month` *and* "the leaver is excluded by H0.2". With the paid run = last month, an end date on the period's last day is *included* by `periodMembership` (`end < firstDay` is the exclusion rule). I followed the mockup (ฝ้าย สิ้นสุด 31 ส.ค. with run ก.ย.): `endDate = last day of the month before the paid run` ⇒ ENDED_BEFORE, asserted (P1). If you want a leaver *inside* the paid run (PARTIAL_MONTH flag) as well, that is a 15th employee.
2. **Edge case "employee linked to a STAFF user".** The 6 users are fixed; `staff` is already linked to น้ำฝน (1 account ↔ 1 employee). I linked edge employee ก้อย to the STAFF user `payroll` — a payroll viewer with her own row in the paid run (useful for HQ17). Alternative: a 7th user `self`.
3. **Pay date** of the paid run = last day of the period (always in the past); mockup 06 shows "กำหนดจ่าย 2 ต.ค." (the 2nd of the following month would be in the future on the 1st).
4. **`manager` is not linked to พี่เก่ง** (mockup manager) so that "manager without payroll" stays a pure non-self viewer. Link later if a WO needs manager-self cases.
5. **No fitness check for `hr-ui-inventory.json` yet** — F16.1–F16.5 do not cover it (brief scope). Proposal: F16.6 = F14-style honesty check (rows ↔ code incl. `via` ids, `$debt` ratchet) in the first HR UI WO.
6. **F16.5 scope** excludes `scripts/qc-*.mts` (oracles read the column to prove no plaintext); includes other scripts (`seed-review-shop.mts` is baselined).
7. **Brief fact correction:** `scripts/crm-expected.json` and `scripts/member-expected.json` *are* tracked in git on this branch (`git ls-files`); `scripts/hr-expected.json` is not ignored either — it is simply never added. Consider a `.gitignore` line for it at rc time.
8. Q1/Q2/Q3 answered with the defaults (one HR system · no DRAFT run this month · OTP login, see §3).
9. `runHrFitness(chk, ROOT)` is exported for the rc hook; its `chk` signature matches `fitness.mts` `chk(id, name, ok, detail, sev)`.

## 10. Debt / not done
| item | reason | closes in |
|---|---|---|
| real screenshots | CONTROLLER-RUN (no build/serve for builders) | controller, `visual-hr 0.4 --user <role> --base http://127.0.0.1:3226` |
| `fitness.mts` hook | brief: controller adds at rc time | rc |
| page guards / testids / `hr.*` messages | baselines above | WOs listed |
| `HrEmployee.unitId`, payType/rate | not in schema yet; intent recorded in `HQC.employees[].unit/payType/rateSatang` | H1.1 |
| F16.6 inventory ↔ code honesty check (rows incl. `via` ids, `$debt` ratchet) | ruling R5 | H2.2 |
| F16.1 heuristic limits: whole-object leaks (`JSON.stringify(e)`, spread `{...e}`, `Object.values/entries(e)`) and one-level import following (re-exported types not followed) | accepted debt (r2 FIX D) — the privacy oracles (`qc-hf-hr-privacy`) are the real gate | – (by design) |
| HrHub link without testid (`ui.tsx#HrHub` 1) | ruling | H2.11 |
| Day-of-month dependence left: on days 1–7 of a month the attendance history (today−7…−1) and แพร's approved leave (today−6…−5) fall inside the PAID period | accepted by the controller (r2 FIX F note); the paid run does not read attendance/leave today | – |

## 11. QC4 restored / temp data left
- `seed-hr-qc` leaves **the `qc-hr-v2` tenant + its 7 users (by design)**, incl. 3 PENDING `OutboxEvent` rows of that tenant (`hr.leave.submitted` ×2, `hr.payroll.paid` ×1 — not drained on purpose; a drain by another lane is harmless: no kanban/CRM system in this tenant).
- negative-proof scratch files deleted (git status clean); no `qc-visual-hr` sessions minted by this WO (dry only); no chromium profile created.

## 12. Commits (branch `wip/pos-hr-h0.4`)
- `f312f3dd` step 1 — fitness-hr.mts + `fitness:hr` (pre-commit hook ran normally, no `--no-verify`)
- `f7acd3aa` step 2 — hr-qc-env.mts + seed-hr-qc.mts
- `956cb2be` step 3 — visual-hr.mts + hr-ui-inventory.json (+ hr-qc-env: no `pinCode` literal, so F16.5 stays clean once active)
- `ed7dda27` step 4 — TEMPLATE-hr.md + this file
- `4f838ea5` round 2 — FIX A–K code/inventory/template/.gitignore (pre-commit hook ran normally)
- round 2 notes — this file (head of the pushed branch)

## 13. Round 2 (review ACCEPT WITH NOTES → controller rulings + FIX list)
Raw outputs: `.qc-shots/hr/h0.4/r2/` (`fitness-hr-{env,noenv}.txt` · `neg-{C,D,E,E2,clean}.txt` · `seed-run{1,2}.txt` · `hr-expected-run{1,2}.json` · `reg-*.txt` · `visual-*.txt` · `typecheck.txt`).
Negative proofs ran on a scratch copy of the tree (`src/` + `prisma/schema` + `scripts/fitness-hr.mts`, `node_modules` symlinked) in the session scratchpad — the worktree's `src/` was never touched; the copy was deleted afterwards (`git status` shows only the intended files).

| FIX | where | proof |
|---|---|---|
| A | `scripts/hr-qc-env.mts:108` (`HqcUserKey` + `payrollSelf`) · `:149` `PAYROLL_KEYS` · `:199` ก้อย `linkedUser: "payrollSelf"` · `:210–214` users (`payroll` unlinked, renamed "ฝ่ายเงินเดือน (QC HR)"; `payrollSelf` = "ก้อย ฝ่ายบุคคล (QC HR)") · seed `scripts/seed-hr-qc.mts:217` check E2b · template §6 | seed E2b ✅ `owner/manager/payroll/kiosk/member: - · staff: namfon · payrollSelf: koy` · `hr-expected.json` users = 7 · `links {"namfon":"staff","koy":"payrollSelf"}` |
| B | `.gitignore:49` | `git check-ignore scripts/hr-expected.json` → `scripts/hr-expected.json` |
| C | `scripts/fitness-hr.mts:89` `NEVER_EXEMPT` · `:160` `scanPrivacySharedPin` · `:188` exemption skips pin* | neg-C (DTO `EmployeeProfileDto` + `pinCode` and a client read): `❌ [F16.1] … 2 จุด: src/lib/modules/hr/privacy-shared.ts:47 privacy-shared.ts ประกาศ/อ้าง pinCode (PIN ห้ามอยู่ใน DTO) · src/lib/modules/hr/EmployeeProfileForm.tsx:195 อ่าน .pinCode` exit=1 |
| D | `scripts/fitness-hr.mts:87` roots + payroll · `:207` namespace imports · `:233` QualifiedName pass · `:153` `prismaTypeOfModel` · header `:6–15` limits | neg-D (`"use client"` under `sys/[id]/payroll/` with `import type * as DB from "@prisma/client"; type Leak = DB.HrEmployee`): `❌ [F16.1] … (ไฟล์ client 8 · สแกน 27) — 5 จุด: …__neg-f161.tsx:3 อ้าง type Prisma DB.HrEmployee (โมเดล HrEmployee มีช่อง pinCode) …` exit=1 |
| E | `scripts/fitness-hr.mts:275` `PAGE_SEGMENTS` · `:283` `isPrivacyGuardName` · `:284` `scopeExports` · `:362` `discoverPages` (src/app, route groups stripped) | neg-E (page importing+calling only `hrViewerOf()`): `❌ [F16.3] … 1 หน้าไม่มีตัวกัน: src/app/app/sys/[id]/hr/__neg/page.tsx (import แค่ hrViewerOf จาก hr/privacy|scope — ไม่ใช่ตัวกัน …)` exit=1 · neg-E2 (`src/app/(neg)/kiosk/x/page.tsx`): `❌ [F16.3] … src/app/(neg)/kiosk/x/page.tsx (ไม่ import ตัวกันจาก hr/privacy หรือ hr/scope)` exit=1 · clean copy: 5/5 exit=0 |
| F | `scripts/hr-qc-env.mts:197` ก้อง `start: "firstOfThisMonth"` · `:316` `probationStart` · `:235` `excluded` + kong · seed E5 `:229` | seed E5 ✅ startDate = 2026-10-01 · P1 ✅ `fai:ENDED_BEFORE · om:STARTS_AFTER · kong:STARTS_AFTER` · paid run 11 items |
| G | `scripts/hr-qc-env.mts:145,185,192` `birthYearsAgo` · `:320` `yearsAgo` · seed `:173` `sensitiveOf` | `grep -n '20[0-9][0-9]-' scripts/hr-qc-env.mts scripts/seed-hr-qc.mts` → empty |
| H | `scripts/hr-ui-inventory.json:164,217,270` (3 `-sheet` rows) · `$debt` HrHub `:80` H2.11 · `payrollSelf` added to every `roles` list that had `payroll` · notes §4 claim corrected | 15 rows ↔ 15 code ids (see §4) |
| I | `scripts/visual-hr.mts:108` `SECURE_COOKIES = APP_ENV !== "development"` (after `loadHrQcEnv`) · `:129` cookie choice · `:191` `summary-${USER}.json` | `visual-hr all --dry --user owner` → `DRY_SUMMARY {"wo":"all","user":"owner","pages":7,"viewports":3,"shots":21}` exit 0 · no `--base` → exit=2 in 1.09 s |
| J | `ledger/wo-notes/TEMPLATE-hr.md:38` (7 viewers) · `:79–81` column → HQC user mapping + MANAGER/`rbac.ts:36` note · `:87` `--user …|payrollSelf` · `:113` AuthToken OTP rows | – |
| K | `scripts/seed-hr-qc.mts:88` `SeedAbort` · `:104` throw (was `process.exit(4)` inside try) · `:372` catch sets `exitCode = e.code`, `finally` disconnects, `process.exit(exitCode)` after | – (path only reachable with a foreign tenant on the slug) |

Acceptance r2:
- `fitness-hr` with env (`iso.sh qc4.sh`) and without (`env -u DATABASE_URL -u DIRECT_URL`): both `JSON_SUMMARY {"suite":"fitness-hr","total":5,"passed":5,"findings":[]}` exit 0 (F16.1 now 26 files in scope, 7 client files).
- `seed-hr-qc` ×2: both `===== seed-hr-qc ===== ผ่าน 23/23` exit 0, the two `JSON_SUMMARY` lines byte-identical, `hr-expected.json` identical after masking ids; O1 both runs: `{"tenant":20,"hrEmployee":22,"hrPayrollRun":0,"customer":71,"posSale":224}` before = after; D1 `ลบร้านเดิม … (350 แถว) — ไม่เหลือแถวที่มี tenantId นี้` both runs.
- after the second seed: `qc-hf-hr-privacy` exit 0 `{"total":194,"passed":194,"findings":[]}` · `qc-hr-h0.1` exit 0 67/67 · `qc-hr-h0.2` exit 0 58/58 — identical to round 1.
- typecheck (1 run, gate lock): `tsc --noEmit` exit 0.

HQC changes in r2: users 6 → 7 (`payrollSelf`); `payroll` unlinked and renamed; ก้อง start = 1st of this month (flags `probation-hire-this-month`, `excluded-STARTS_AFTER`); `HQC.payroll.excluded` + kong; `sensitive.birthDate` → `birthYearsAgo`; `hqcDates()` + `probationStart`, `yearsAgo(n)`; `hr-expected.json` + `links`, `dates.probationStart`.
Temp data left (r2): the `qc-hr-v2` tenant + 7 users (by design) incl. 3 PENDING OutboxEvent rows; no sessions, no chromium profile, scratch tree deleted.
