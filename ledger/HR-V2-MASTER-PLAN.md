# HR V2 — RUN plan (HR-V2-MASTER-PLAN) · 44 work orders · 6 phases

> 4 Oct 2026 · planner (Opus 5.5, cloud, read-only on code) · **plan only, the RUN has not started.** It needs the owner's GO and the RC deploy (see §0, gate G0).
> Read with: `DESIGN-HR-V2.md` (design, Thai) · `REVIEW-HR-V2-DESIGN-2026-10-01.md` (code-vs-design; its name corrections and §6 rulings **override the design**) · `HR-V2-OWNER-QUESTIONS.md` (HQ1…HQ30) · mockups `design-hr/NN-*.body.html` · `POS-CONTRACTS.md` C-8 · hotfix notes `origin/hotfix/hr-privacy:ledger/wo-notes/HF-HR-0.md`.
> Template: `POS-MASTER-PLAN.md`. The roles, the 12 gates, the 14 steps and the prompts are the CRM/POS set (`CRM-MASTER-PLAN.md` §1–§5, §11). This file lists only what differs for HR, plus the work orders.
> Lane rules: `hr-briefs/hr-brief-COMMON.md`. Every WO gets a brief `hr-briefs/hr-brief-<id>.md`, written when the WO comes up and re-verified against the code at that time. Briefs H0.1–H0.3 are written now because they need no owner decision.

## 0. How to use (5 minutes)
1. **Gate G0 (before any H-WO builder):** `rc/hotfixes-2026-10-01` (contains `hotfix/hr-privacy` afcb9bc3) is deployed and `main` contains it, **or** the owner rules that HR V2 lanes branch from `origin/hotfix/hr-privacy` and merge it themselves (HQ1). Every HR V2 branch is cut from a base that contains afcb9bc3. Planning against pre-hotfix code is wrong: the hotfix rewrote `decideLeave`, `decideAdjustment`, `cancelAdjustment`, the profile/payslip/leave loaders (`hr/privacy.ts`, `hr/privacy-shared.ts`) and `approval/service.ts`.
2. Phase H0 = live defects and tooling. H0.1–H0.4 need no owner answer and can start the day G0 is met.
3. Pipeline per WO (same as POS): **oracle writer → builder (VPS, QC4) → controller re-run → reviewer (read-only) → hunter (money/privacy WOs) → accept**. One role per agent per WO. Cloud containers cannot reach QC4 over TCP (`POS-RESUME.md` 3 Oct 12:36 UTC), so all DB work happens on the VPS and cloud sessions do only no-DB work (briefs, static review, plans).
4. Parallelism: at most 2 HR lanes while POS runs (POS-RESUME §0.5 ceiling applies to the whole machine). Heavy commands go through `scripts/with-gate-lock.sh`, oracles through `scripts/iso.sh`.

## 1. What differs from the CRM/POS RUN (HR only)
- **Personal data (PDPA) is the first risk; money is the second.** Every WO that adds a field, page, export, event payload or AI tool states who can see it (OWNER / `hr.payroll.read` / `hr.leave.read` / manager-of-branch / the employee themself) and has an oracle check proving the field is absent for everyone else. That includes RSC props, server-action return values, CSV, outbox payloads and AI tool output. Pattern = hotfix `hr/privacy.ts` (`hrViewerOf`, `loadEmployeeProfileForViewer`, DTO whitelist in `privacy-shared.ts`).
- **Payroll rules are frozen.** The functions in `payroll-rules.ts` stay byte-identical (`qc-payroll.mts` FREEZE, `payroll-rules.ts:2`). New behaviour = new pure functions + `engineVersion` on the run (review ruling #4). Old runs are never recomputed.
- **Law values are data, not code** (design decision #5), and every value carries `effectiveFrom`. No law value goes live without the accountant's sign-off (HQ23). Until then the values ship as `DRAFT` rows that the UI marks "รอนักบัญชียืนยัน".
- **Money = integer satang.** Payroll identities: per item `net = gross − ssoEmployee − wht`, and `net ≥ 0` or the item is blocked from approval. Per run Σ items = run totals. JV Dr = Cr. These are checked in every payroll oracle.
- **No automatic pay cut without a human** (review ruling #9, `payroll-ui.tsx:82-83`): late/absent rules produce PENDING `HrPayAdjustment` rows that go through the existing 4-eyes path.
- **Self-service routes never take an `employeeId` from the client.** They resolve the employee with `employeeOfUser(tenantId, userId)` (review ruling #14).
- **The CRM C3.3 block in `payroll.ts` (≈:590–:800 on the hotfix head) keeps its behaviour.** `qc-crm-c3.3.mts` is a mandatory regression for every payroll WO.

## 2. DoD gates (CRM §3, 12 items) plus HR additions
13. Privacy matrix green: every new surface × 6 viewers (owner · payroll viewer · manager without payroll · staff with HR key · plain member · the employee themself) + other tenant. 14. Payroll regression set green and identical before/after: `qc-payroll` · `qc-payroll-reverse` · `qc-hr-payadjust` · `qc-crm-c3.3` · `qc-hf-hr-privacy` · `qc-account-cpa`. 15. Parity with `design-hr/NN` at 1440 / 1024 / 390 for UI WOs, Thai + English. 16. Every new event has a consumer, an automation/webhook label, and an oracle that replays it twice.

## 3. X-group checks — mandatory where they apply
| X | checks |
|---|---|
| X1 idempotency | double submit / replayed event = one row (clock, leave, OT, swap, commission, run create, posting) |
| X2 cross-tenant / cross-system / cross-branch | ids of another tenant or HR system or branch → refused, nothing leaks (`tenantDb` filters the system; FKs do not — review §2.1) |
| X3 permissions | each action × role; self-decision refused (leave, OT, adjustment, swap, correction, payroll run with own row per HQ17) |
| X4 money | satang identities above · rounding fixed by test vectors · no negative net · Dr = Cr |
| X5 reversal | reverse/cancel undoes every side effect (JV, adjustments unbound, CRM commission un-paid, leave balance txn, roster) |
| X6 race | 10 parallel lanes × 3 rounds on separate connections: double clock, double approve, recompute ∥ approve, create run ∥ adjust |
| X7 time | Asia/Bangkok day boundaries, overnight shifts, month ends, leap day. Oracles never hard-code "today" |
| X8 not connected | HR with no ACCOUNT / POS / Booking / CRM still works, with no posting, no booking side effect |
| X9 outbox | replay ×2, first-step failure does not starve later consumers, drain to silence |
| X10 visual | parity at 3 sizes, no overflow, Thai, empty/error states |
| X11 PDPA | field-absence checks (RSC, actions, CSV, events, AI) + retention for GPS/photo (HQ27) |
| X12 no env | fitness runs without `.env` |

## 4. Phases and work orders (44)
Size: **S** ≤1 builder-day · **M** 2–3 days · **L** 4–5 days. Lane: **S** = single (touches shared files or schema; runs alone) · A = time/roster · B = money · C = surfaces/integrations. Oracle file = `scripts/qc-hr-<id>.mts` unless named otherwise. "Mig" = the WO adds a migration.

### H0 — live defects + tooling (7 WOs · before any V2 feature)
| id | lane | goal | main files | size | deps | oracle | acceptance |
|---|---|---|---|---|---|---|---|
| **H0.1** | B | **Draft run lifecycle (D2a):** delete a DRAFT run and recompute a DRAFT run in place (unbind and rebind adjustments in one tx under the existing advisory lock). Approval refuses stale numbers (the form posts the expected totals) | `hr/payroll.ts` (`createPayrollRun` refactor → `buildRunRows`; new `deleteDraftRun`, `recomputeDraftRun`; `approveRun` optional `expect`) · `hr/payroll-actions.ts` · `hr/payroll-ui.tsx` | M | G0 | `qc-hr-h0.1` | delete/recompute only for DRAFT; adjustments return to `runId=null`; recompute ∥ approve race safe; stale approve refused; audit rows; X4/X6; payroll regression set identical |
| **H0.2** | B | **Run integrity (D1 D5 D6 D12):** leavers and future starters are excluded by date window (no proration policy yet); manual adjustments into a closed period behave like the CRM path; items with net < 0 are flagged and block approval; the run period is validated | `hr/payroll.ts` (`buildRunRows` filter, `requestAdjustment` manual path, `decideAdjustment` move, `approveRun` guard) · `hr/payroll-actions.ts:69` · `hr/payroll-ui.tsx` | M | H0.1 | `qc-hr-h0.2` | D1 matrix (active/inactive × endDate before/in/after × startDate after) · `PERIOD_CLOSED` for manual path · approve refused while any net < 0 · `2026-13` refused · stranded manual rows listed · `qc-crm-c3.3` identical |
| **H0.3** | A | **Clock and kiosk integrity (D7a D7b D13a D14 + D8 interim):** PIN-less on-behalf clocking needs an employee-admin key; the kiosk PIN limiter becomes DB-backed (per employee + per HR system); set-PIN gets a DB limiter; a double tap gives one event; the employee must belong to this HR system; AI `pending_leaves` returns the leave id | `hr/actions.ts` (`clockAction` :62, `kioskClockAction` :195) · `hr/service.ts` (`clock` :292, `clockWithPin` :362) · `src/lib/ai/tools.ts` (pending_leaves, one marked line) | S–M | G0 | `qc-hr-h0.3` | kiosk-only STAFF cannot clock others; 6th PIN try in 60 s refused across 2 server instances (simulated by 2 processes); 10 parallel taps = 1 IN; `hr_decide_leave` works end-to-end from `pending_leaves` output |
| **H0.4** | S | **HR QC tooling** (POS P0.1 equivalent): `scripts/hr-qc-env.mts` (real table names), `scripts/seed-hr-qc.mts` (café, 2 branches, 14 employees, the mockup data set: น้ำฝน/แพร/โบว์/เจ/มิ้นท์…, salary profiles, 1 paid run), `scripts/visual-hr.mts` (3 sizes, roles owner/manager/staff), `scripts/hr-ui-inventory.json`, `scripts/fitness-hr.mts` (F16.1–F16.5 §6), `ledger/wo-notes/TEMPLATE-hr.md` | new scripts only | M | G0 (parallel to H0.1–H0.3) | `fitness-hr` + seed ×2 | seed idempotent, after member seed; visual captures today's 6 HR pages; fitness green with and without env |
| **H0.5** | S · Mig | **PIN hashing + uniqueness + `verifyPin` facade (D7c, D8 residual, review ruling #3, C-8 prerequisite):** `HrEmployee.pinHash` = HMAC-SHA256(server secret, tenantId‖pin), partial unique `(tenantId, pinHash) WHERE active AND pinHash IS NOT NULL`, backfill, `pinCode` nulled afterwards, facade `hr.verifyPin({tenantId, unitId?, pin})`, `pinSetAt` | `prisma/schema/hr.prisma` · migration · `hr/pin.ts` (new) · `hr/service.ts` (setPin/clockWithPin/kioskRoster/createEmployee) · `hr/index.ts` · `scripts/hr-backfill-pin-hash.mts` · `hr/privacy.ts` (`hasPin`) | M | H0.3 · **HQ2 HQ3 HQ4** | `qc-hr-h0.5` | no plaintext PIN after backfill; duplicate PIN in a tenant impossible (race ×10); verifyPin constant-time, rate-limited, returns `{employeeId, userId?}` only; backfill idempotent and dry-run; old deploy keeps working during rollout (§8 step order) |
| **H0.6** | B · Mig | **Reversal correctness (D2b + CRM seam):** a REVERSED run frees its period (partial unique for non-REVERSED runs), unbinds its adjustments, and emits `hr.payroll.reversed` in the same tx. The CRM consumer moves PAID commissions back to APPROVED/unpaid | `prisma/schema/payroll.prisma` (unique → partial unique SQL) · `hr/payroll.ts` (`reverseRun`, `buildRunRows` dup check) · `src/lib/outbox-consumers.ts` (one block) · `crm/commissions.ts` (`onPayrollReversed`) · automation/webhook labels | M | H0.2 · **CRM merged to main** | `qc-hr-h0.6` (+ `qc-crm-c3.3`) | reverse → new run for the same month possible; adjustments re-enter; commission un-paid exactly once (replay ×2); X5/X9 |
| **H0.7** | S · Mig | **Hotfix residuals:** approval requests for leave store the requester **user** id (`linkedUserId ?? actorUserId`, `service.ts:436` on hotfix) + data fix for existing rows; AI plan confirm passes the user id (C8 · `ai/plans.ts`, `ai/actions.ts`, mobile plans route); `HrEmployee.linkedUserId` partial unique per tenant (1↔1 race R4); `linkApprovedById` flag closing "link before salary" (R4.7); sole-OWNER own-leave rule (HQ18); self-binding of `requestLeaveAction` (HQ19) | `hr/service.ts` · `hr/actions.ts` · `staff/service.ts` · `ai/plans.ts` · `ai/actions.ts` · `api/mobile/plans/confirm/route.ts` · schema + migration · `scripts/hr-fix-approval-requester.mts` | M | H0.5 · **HQ18 HQ19** · prod audit SQL (HQ29) | `qc-hr-h0.7` | "my requests" lists leave; requester can cancel; plan step decides leave with self-check; two concurrent grants of one account → one link; `qc-hf-hr-privacy` identical |

Conditional insert (not counted): **H0.8 SSO ceiling interim**. It runs only if the accountant confirms the 17,500 THB ceiling from 1 Jan 2026 (HQ8, review D15). It passes an `SsoConfig` from a system setting into `ssoContribution` (the parameter already exists, `payroll-rules.ts:12-16`) without touching the frozen defaults, and it comes with an owner decision on back-pay since January.

### H1 — data model (3 WOs · additive schema + minimal services; nothing user-visible beyond settings stubs)
| id | lane | goal | main files | size | deps | oracle | acceptance |
|---|---|---|---|---|---|---|---|
| **H1.1** | S · Mig | **Org axis + lifecycle + pay type:** `HrEmployee.unitId` (home branch = `BusinessUnit`, HQ20), `HrEmployeeUnit` (borrowed, from/to), `employmentStatus` {PROBATION, ACTIVE, ENDED} beside the existing `employmentType`, `probationEndAt`, `contractEndAt`; `HrSalaryProfile.payType` {MONTHLY, DAILY, HOURLY} + `dailyRateSatang`/`hourlyRateSatang`; one scope helper `hrScopeOf(viewer)` → branch filter for reads; `assertCan` receives `unitId` | `hr.prisma` · `payroll.prisma` · `hr/scope.ts` (new) · `hr/privacy.ts` · backfill `scripts/hr-backfill-units.mts` | M | H0.7 · HQ20 HQ21 | `qc-hr-h1.1` | 1-unit tenants backfilled; multi-unit = null + prompt; branch manager sees only own branch (X2); MONTHLY behaviour byte-identical |
| **H1.2** | S · Mig | **Time and leave model:** `HrShift` (start/end min, break, `crossesMidnight`, colour, unitId) · `HrRosterEntry` (employee × date × shift, `published`, source TEMPLATE/MANUAL/AI, unique (employeeId, date, shiftId)) · `HrShiftSwapRequest` · `HrAttendance` + `rosterEntryId/source/lat/lng/accuracyM/photoKey/deviceId` · `HrTimeCorrection` · `HrOtRequest` · `HrLeavePolicy` (category = existing enum `HrLeaveType`, **not** a model of that name, review #10) · `HrLeaveBalanceTxn` (grant/use/carry/expire ledger) · `HrHoliday` · `HrLeave` + `policyId/days Decimal(4,1)/halfDay/hours/attachmentKey/requestedByUserId` · enum values for judgement (ABSENT, EARLY_OUT) in a separate migration file | `hr.prisma` · 2 migrations · pure helpers `hr/time-rules.ts` (shift window, overnight, Bangkok day) | L | H1.1 | `qc-hr-h1.2` | uniques hold under race; pure helpers have vector tests incl. overnight and DST-free +07:00; no existing query changes result |
| **H1.3** | S · Mig | **Money and law model:** `HrLawTable` (kind SSO/TAX_BRACKET/DEDUCTION/OT/MIN_WAGE, `effectiveFrom`, json, status DRAFT/ACTIVE, `approvedBy`) seeded DRAFT from today's constants · `HrWorkEntry` (employee × date × kind × minutes, source ids) · `HrPayrollRun` + `engineVersion/accountSystemId/createdById/approvedById/bankFileKey/filingJson` · `HrPayrollItem` + `ytdJson/lawRowIds` · `HrPayAdjustment` + `sourceType/sourceRef` with partial unique (POS commission, OT request, late rule) · `HrReviewNote` · `HrOnboardingTask` | `payroll.prisma` · `hr.prisma` · migration · `scripts/hr-seed-law-draft.mts` | M | H1.2 | `qc-hr-h1.3` | law seed equals the frozen constants exactly; partial unique on `sourceType+sourceRef` races to one row; CRM `crmCommissionId` unique untouched |

### H2 — roster · time · leave · self-service (12 WOs)
| id | lane | goal | main files | size | deps | oracle | screen |
|---|---|---|---|---|---|---|---|
| H2.1 | A | Shift catalogue + daily roster engine: weekly template (`HrWorkSchedule`) → roster entries, copy week, rule checks (max h/day, 11 h rest, ≥1 day off, ≤48 h/week, warn only), publish → `hr.roster.published`; facade reader `hr.onShiftToday({tenantId, unitId, date})` for POS C-8 | `hr/roster.ts` (new) · `hr/index.ts` · outbox block | L | H1.2 | `qc-hr-h2.1` | 03 |
| H2.2 | A | Roster board UI: week grid (rows = people, columns = days), drag and drop, 3 shift kinds, unpublished-changes bar, rule panel, branch switcher | `hr/roster-ui.tsx` · page `hr/roster/page.tsx` · nav | L | H2.1 · H0.4 | `qc-hr-h2.2` + visual | 03 |
| H2.3 | A | Shift swap / change request between employees → peer accepts → manager approves via approval core (entity `HrShiftSwapRequest`, effect in `approval-effects.ts`), roster rewritten atomically | `hr/swap.ts` · `approval-effects.ts` (one block) | M | H2.1 | `qc-hr-h2.3` | 03 · 05 |
| H2.4 | A | Clock v2: roster-aware next kind (fixes overnight D13b), mobile clock with GPS radius per branch (photo off by default, PDPA notice on first enable, HQ27), kiosk v2 on `verifyPin`, break in/out | `hr/clock.ts` (new, `clock` moves here behind the same export) · `KioskClock.tsx` · settings | L | H0.5 · H2.1 | `qc-hr-h2.4` | 04A · 07a |
| H2.5 | A | Automatic judgement from the roster (on time / late min / early out / absent / leave / day off / OT minutes), team daily board, per-person month calendar, "not in 10 min after shift start" alert (cron + `hr.attendance.late/absent`) | `hr/judge.ts` · `hr/attendance-ui.tsx` · hook in an existing cron (`src/app/api/cron/{tick,hourly}`) | L | H2.4 | `qc-hr-h2.5` | 04A · 04B |
| H2.6 | A | Time corrections ("forgot to clock out") request → approval core → corrected rows keep history + reason; POS shift close/device logout shown as evidence when present | `hr/correction.ts` · `approval-effects.ts` | M | H2.5 | `qc-hr-h2.6` | 05 |
| H2.7 | A | Leave policies + quota ledger + half-day/hourly + attachments (storage) + validation (from ≤ to, overlap, balance, holidays excluded) + carry/expire job; `decideLeave` writes balance txns; emits `hr.leave.decided` | `hr/leave.ts` (new; `requestLeave`/`decideLeave` move behind same exports) · storage | L | H1.2 · H0.7 · HQ12 | `qc-hr-h2.7` | 05 · 07b |
| H2.8 | A | Holidays: SHARK-maintained Thai preset per year + shop holidays + "shop open on holiday" flag; leave-day count and OT day class read it | `hr/holidays.ts` · `src/lib/modules/hr/holidays-th-2569.json` (+2570) | S | H1.2 · HQ13 | `qc-hr-h2.8` | 05 |
| H2.9 | B | OT requests (before, or within N h after, per HQ10) → approval → PENDING→APPROVED `HrPayAdjustment(kind OT, sourceType OT_REQUEST)` into the next open period, multiplier from day class × law table; wires the `otHourlyRateSatang` writer (#18) | `hr/ot.ts` · `hr/payroll.ts` (request path) | M | H2.5 · H2.8 · H1.3 · HQ10 | `qc-hr-h2.9` | 05 · 07a |
| H2.10 | C | "ของฉัน" self-service (mobile-first, STAFF account): today's shift + clock, week, colleagues, leave / OT / swap / correction / advance requests, balances, own documents; never accepts `employeeId` | `src/app/app/me/hr/**` (route per HQ) · `hr/self.ts` | L | H2.4 H2.7 H2.9 | `qc-hr-h2.10` + visual 390 | 07a · 07b |
| H2.11 | C | Manager team overview + unified request inbox (leave / OT / swap / correction / adjustment) with impact preview and batch approve, branch-scoped | `hr/overview-ui.tsx` · `hr/inbox.ts` | L | H2.3 H2.6 H2.7 H2.9 | `qc-hr-h2.11` + visual | 01 · 05 |
| H2.12 | S | Phase close: `qc:all`, parity of 01/03/04/05/07, HANDOVER-H2, docs `docs/modules/18-hr.md` V2 section | — | S | all H2 | `qc:all` | — |

### H3 — Thai payroll through filing (10 WOs)
| id | lane | goal | main files | size | deps | oracle | screen |
|---|---|---|---|---|---|---|---|
| H3.1 | B | Work entries: roster + attendance + leave + holidays → `HrWorkEntry` per day (pure builder + persisted snapshot per period); source of every payroll line | `hr/work-entries.ts` | L | H2.5 H2.7 H2.8 | `qc-hr-h3.1` | 04B · 06 |
| H3.2 | B | Late/absent rules (opt-in, default OFF, HQ11) → PENDING DEDUCTION adjustments with source refs; OT pay by day class (1.5/2/3) | `hr/attendance-pay.ts` | M | H3.1 · HQ11 | `qc-hr-h3.2` | 04B · 05 |
| H3.3 | B | Law-table engine: new pure SSO/WHT functions reading `HrLawTable` rows by `effectiveFrom`; WHT method per HQ9 (YTD cumulative recommended); 40(1) items included per HQ8; frozen v1 kept for `engineVersion=1` | `hr/payroll-rules-v2.ts` · `hr/law.ts` · settings UI (08) | L | H1.3 · HQ8 HQ9 | `qc-hr-h3.3` (vectors signed off by accountant) | 08 |
| H3.4 | B | Payroll run v2: pay types (monthly/daily/hourly), proration (HQ6), excess-deduction carry-forward (HQ7), preview with source per line, maker-checker (HQ17), branch preview + manager step, key wiring (`hr.payroll.reverse`, `hr.payadjust.reject`), `engineVersion=2` | `hr/payroll.ts` · `hr/payroll-ui.tsx` (→ `payroll-run-ui.tsx`) | L | H3.1 H3.2 H3.3 H0.6 | `qc-hr-h3.4` | 06 |
| H3.5 | B | Bank transfer files KBank / SCB / BBL / KTB (one generator interface, 4 formats, checksum/totals line, satang → baht formatting), file stored privately, download audited | `hr/bank-files/{kbank,scb,bbl,ktb}.ts` | M | H3.4 · **HQ14 sample files** | `qc-hr-h3.5` (golden files) | 06 |
| H3.6 | B | Government filings: ภ.ง.ด.1 monthly + ภ.ง.ด.1ก annual (RD e-Filing import format), สปส.1-10 (SSO e-Service file), 50 ทวิ per employee (PDF); numbering through the account doc-numbering engine (no second engine) | `hr/filings/*` | L | H3.4 · HQ15 · CRM merged | `qc-hr-h3.6` (golden files) | 06 |
| H3.7 | S | Accounting v2 (review ruling #7, D11): accrual JV at approve (Dr salary expense / Cr salaries payable, SSO payable, WHT payable, employee advances), pay JV at `markPaid` (Dr payable / Cr bank), explicit HR→ACCOUNT book link, idempotent posting key `hr-payroll#<runId>#<event>`, symmetric reversal; old runs keep the one-step JV | `account/gl.ts` (`postPayrollJV` + new `postPayrollPayJV`) · `account/connections.ts` · `account/index.ts` · `hr/payroll.ts` | M | H3.4 · **HQ16** · **CRM merged** | `qc-hr-h3.7` + `qc-account-cpa` | 06 |
| H3.8 | C | Payslip PDF + in-app slip + yearly history + salary certificate (PDF); self route via `employeeOfUser` (extends hotfix `loadPayslipForViewer`) | `hr/payslip-pdf.ts` · self pages | M | H3.4 · H2.10 | `qc-hr-h3.8` + visual | 07c |
| H3.9 | C | Reports + employee register (ทะเบียนลูกจ้าง, LPA) + CSV (time, leave, OT, payroll summary, tax/SSO) with PDPA column rules | `hr/reports.ts` · pages | M | H3.4 | `qc-hr-h3.9` | 01 (month) |
| H3.10 | S | Phase close: `qc:all`, parity of 06/07c/08, accountant sign-off of formula vectors (HQ23) recorded in ledger, HANDOVER-H3 | — | S | all H3 | `qc:all` | — |

### H4 — store-aware HR + people + AI (9 WOs)
C-8 (PIN opens POS shift, commission from POS, shift hours) is **owned by POS P3.5** (owner, 1 Oct, DESIGN §9 #4). HR supplies the facades: `verifyPin` (H0.5), `onShiftToday` (H2.1), commission intake via `requestAdjustment` with `sourceType=POS_SALE_LINE` (H1.3).
| id | lane | goal | deps | oracle | screen |
|---|---|---|---|---|---|
| H4.1 | C | Leave/absence → booking slots (C-2 extended to roster: shift = bookable hours of the staff), restaurant/hotel duty reassignment hint | H2.1 H2.7 | `qc-hr-h4.1` + `qc-hr-leave-booking`, `qc-booking-hours-hr` | 05 |
| H4.2 | C | Labor % and staffing demand: hourly POS sales (via POS reports facade, P1.17) vs roster cost; demand row on roster board | H2.2 H3.4 · POS P1.17 | `qc-hr-h4.2` | 01 · 03 |
| H4.3 | C | AI: read tools `hr_who_is_on_today` / `hr_late_report` / `hr_labor_percent` / `hr_leave_balance`, proposals `hr_draft_roster` / `hr_flag_pattern`, Daily Brief line. Caller identity in `ToolCtx` or fail-closed (hotfix lesson) | H4.2 H2.7 | `qc-hr-h4.3` + `qc-ai-tools`, `qc-ai-proposals` | 08 |
| H4.4 | C | People lifecycle: probation/contract alerts (cron + kanban card), warnings and quarterly review notes, onboarding/offboarding checklist (kanban), `hr.employee.offboarded` → PIN revoked (POS loses access) | H1.1 H1.3 | `qc-hr-h4.4` | 02 |
| H4.5 | C | Chat/LINE notifications (shift published, approval results, payslip ready, ids only in payloads) + leave request from LINE (KB + AI) | H2.7 H3.8 | `qc-hr-h4.5` | — |
| H4.6 | C | Inventory issue/damage to employee → PENDING deduction (small) | H1.3 · inventory facade | `qc-hr-h4.6` | — |
| H4.7 | C | Recruiting (ฟอร์มสมัครงาน): public application through the Forms module → candidate list → "hire" creates the employee + onboarding. **Owner-gated (HQ22). Dropped if the owner says no** | H4.4 · HQ22 | `qc-hr-h4.7` | — |
| H4.8 | S | REST `/api/v1/hr` (registry pattern of POS P0.2) + skill + guide | H3.4 | `qc-hr-h4.8` | — |
| H4.9 | S | Phase close: cross-module oracle (POS PIN ↔ HR, booking, CRM, account), parity all screens | all H4 | `qc:all` | all |

### H5 — every button, hunt, production (3 WOs · CRM §7–§9 method)
H5.1 button/form registry walk at 3 sizes (data-testid + `hr-ui-inventory.json`) and fixes · H5.2 hunters: money lane (payroll, posting, bank files) + privacy lane (every HR surface × 6 viewers, public endpoints, AI) · H5.3 production: migration order + backfills + `scripts/verify-prod-hr.mts` (read-only) + HANDOVER + `docs/sds/modules/hr.md` AS-BUILT rewrite (today's file is stale, review §1.4).

## 5. Progress counter
**0 / 44** (H0 7 · H1 3 · H2 12 · H3 10 · H4 9 · H5 3). The conditional H0.8 is not counted. If the owner drops H4.7, the total becomes 43. Telegram line format (POS habit): `📊 HR V2 · N% (x/44)`.
Compared with the design's 28 (DESIGN §8 after H3.1 moved to POS): +7 H0 (live defects and residuals from the review and the hotfix) · +3 H1 (the schema is split out so that it ships to prod early and additive) · +1 H3 (accounting is a change of existing posting, review #7) · +3 H5 (the POS P4–P6 equivalent) · +1 H4.7 recruiting (design §5 "ฟอร์มสมัครงาน 🔜") · +1 phase-close split.

## 6. Fitness rules (new `scripts/fitness-hr.mts`, built in H0.4)
F16.1 no `"use client"` file under `src/lib/modules/hr/**` or `src/app/app/**/hr/**` imports a type that has `pinCode | pinHash | nationalId | bankAccountNo | ssoNumber | houseRegAddress`, except `privacy-shared.ts` DTOs · F16.2 `payroll-rules.ts` frozen functions: sha256 of the function bodies equals the recorded baseline · F16.3 every `page.tsx` under `hr/` and `payroll/` calls a guard from `hr/privacy.ts` or `hr/scope.ts` · F16.4 `hr.*` keys complete in `th` and `en` (UI WOs only) · F16.5 after H0.5: no read of `pinCode` outside `hr/pin.ts` and the backfill script.

## 7. Seams (contracts other RUNs depend on)
### 7.1 POS (C-8 · `POS-CONTRACTS.md:51-61`)
| item | owner | HR side | status / conflict |
|---|---|---|---|
| `staff.verifyPin({tenantId, unitId, pin})` | POS P1.15 / P3.5 | **HR H0.5 `hr.verifyPin`** | ⚠️ **Conflict:** POS-MASTER-PLAN P1.15 lists "`PosStaffPin`" and C-8 says "PIN stored at PosStaffPin (hash)". Review ruling #3 says **do not build `PosStaffPin` in parallel**: HR owns the PIN. Needs a controller ruling in POS before P1.15 is briefed: P1.15 consumes `hr.verifyPin`, and staff without an HR row get… (HQ5b: POS-only PIN for users without an HR system?). H0.5 must be accepted before the P1.15 builder starts. |
| `hr.onShiftToday({tenantId, unitId, date})` | HR H2.1 | roster reader (published entries, minus approved leave) | POS P3.5 after H2.1; before H2.1 the fallback is the weekly `HrWorkSchedule` (exists) |
| `hr.recordCommission(...)` ← `pos.sale.paid` | POS P3.5 (consumer) | `requestAdjustment(kind COMMISSION, sourceType POS_SALE_LINE, sourceRef lineId)` + partial unique (H1.3) | today only `crmCommissionId` has a unique (review §5); P3.5 must wait for H1.3 |
| shift hours vs clock | POS P1.9 `PosShift` | H2.6 shows POS shift close as correction evidence (read-only via POS facade) | additive; needs a POS reader export |
| PIN revoke on offboarding | HR H4.4 emits `hr.employee.offboarded` | POS consumer closes the session / refuses PIN | new event; POS adds the consumer |
| labor % | HR H4.2 | reads hourly sales via POS reports facade (P1.17) | needs `pos.salesByHour({unitId, from, to})` export |
| Shared hot files | — | `src/lib/outbox-consumers.ts` · `approval-effects.ts` · `src/messages/*.json` · `scripts/fitness.mts` (HR uses `fitness-hr.mts`) · `package.json` | append-only marked blocks `// HR <WO> ▸ … ◂` |
| Migrations | — | HR migration folders use timestamps **≥ `20261201000000`** (POS uses `20261120…`, CRM `20261103…–20261104…`) | avoids lexical interleaving on QC4/prod |

### 7.2 Accounting (payroll journal)
- Today (review ruling #7, verified): `approveRun` → `postPayrollJV` (`account/gl.ts:1781-1817`) with Dr 6000 gross + employer SSO / Cr 1010 bank net, 2100 SSO, 2130 WHT, book `PAYMENTS`. The book is the first `ACCOUNT` system with no order (`hr/payroll.ts:408,474` on HEAD). There is no idempotency key, and `postManualJV` refuses negative lines (`gl.ts:1024`), so a run whose **total** net is negative throws at approve while a single negative item hides inside a positive total (D6).
- HR V2 changes it only in **H3.7**: an accrual JV at approve, a pay JV at `markPaid`, an advances-receivable ledger, an explicit book link, an idempotency key, and symmetric reversal. The ledger codes and the treatment come from the accountant (HQ16). Old APPROVED/PAID runs keep the one-step JV (no backfill).
- Until H3.7, HR WOs do **not** edit `account/**`. H0.6 calls the existing `reverseEntry` only.

### 7.3 CRM (`origin/session/crm` 8c39a891, not on main)
Overlap found by `git diff c236a490 origin/session/crm` (c236a490 = merge base with this tree):
| file | CRM change | HR WO that touches it | rule |
|---|---|---|---|
| `src/lib/modules/account/gl.ts` | journal numbering via sequence (`allocateJournalNo`, hunks at :240, :287-:422, `reverseEntry` :1083) | H3.7 (`postPayrollJV`, ≈:1781 — not in a CRM hunk) | H3.7 starts only after CRM is on main; rebase on it; the payroll JV gets its number from CRM's allocator |
| `account/index.ts`, `account/connections.ts` | facade exports, connection keys | H3.7 | same |
| `account/wht.ts`, `account/doc-numbering.ts` | WTI / 50 ทวิ numbering deferred to end of tx (C5.4-N) | H3.6 (50 ทวิ for employees) | reuse `doc-numbering.ts`; no second numbering engine |
| `src/lib/modules/approval/service.ts` | `cancelRequests` (+17) | the hotfix already edits this file (+53, round 5d); H2.3/H2.6/H2.7 add entity types | merge order: RC (hotfix) → CRM → HR; HR adds effects in `approval-effects.ts`, not in service |
| `src/lib/outbox-consumers.ts` | +46 | H0.6, H2.1, H2.5, H2.7, H4.4, H4.5 | marked blocks; `hr.payroll.reversed` consumer is a CRM function called from HR's block |
| `crm/commissions.ts` | +107 | H0.6 (`onPayrollReversed`) | needs the CRM controller's OK, or wait for the CRM C6 hand-over |
| `src/lib/ai/tools.ts`, `ai/proposals.ts` | +223 / +37 (not in the `pending_leaves` region :151-171) | H0.3 (one line), H0.7, H4.3 | smallest hunks |
| `src/lib/core/permissions.ts` | +8 | H3.4 (no new keys planned before then) | append-only |
| `scripts/fitness.mts`, `src/messages/*.json` | yes | HR uses `fitness-hr.mts`; message keys `hr.*` appended | — |
| `prisma/migrations/20261103000000_crm_perf_indexes`, `20261104000001-3_account_journal_no_*` | QC4 already has `crm_perf_indexes` (POS-RESUME 3 Oct) | every HR migration WO | never `migrate deploy` on QC4 from a branch that lacks those folders without checking `_prisma_migrations` first |
| HR → CRM readers | `employeeOfUser`, `isOnLeave`, `payrollEmployeeOfUser`, `activeLinkedUserIds` (`hr/index.ts:13-38`) | H1.1 (branch axis), H0.7 (linkedUserId unique) | semantics unchanged; `qc-crm-c3.3` + `qc-crm-c0.3` are regressions |

## 8. Migration risks (for the prod runbook, H5.3)
All migrations are additive and backward compatible with the deployed code (`POS-MIGRATION-PLAN.md` header rule: Vercel applies migrations at build). Each WO's migration is applied on QC4 only by that WO's builder, and the SQL is read before `migrate deploy`.
| WO | existing table touched | change | risk / order |
|---|---|---|---|
| H0.5 | `HrEmployee` | + `pinHash String?`, `pinSetAt DateTime?`; partial unique index `(tenantId, pinHash) WHERE active AND pinHash IS NOT NULL` (raw SQL) | 3-step rollout: (1) deploy code that writes both and reads `pinHash ?? pinCode`; (2) run `hr-backfill-pin-hash.mts` (dry-run first, list duplicate PINs → HQ3); (3) deploy code that reads `pinHash` only and nulls `pinCode`. The column `pinCode` is dropped in a later RUN, never in this one. Needs the new server secret in Vercel env (HQ2) **before** step 1 |
| H0.6 | `HrPayrollRun` | drop `@@unique([systemId, periodKey])`, add partial unique `WHERE status <> 'REVERSED'` | **not purely additive** (constraint swap, inside one tx). Old code still refuses duplicates through its `findFirst` check (`payroll.ts:335-336` on hotfix), so a rollback is safe. Small table |
| H0.7 | `HrEmployee`, `ApprovalRequest` (data) | partial unique `(tenantId, linkedUserId) WHERE linkedUserId IS NOT NULL`; + `linkApprovedById String?`; data fix of `ApprovalRequest.requestedById` for `entityType='HrLeave'` | pre-check query for duplicate links (must be 0 or resolved by the owner, HQ29) before the index; data fix script idempotent + dry-run |
| H1.1 | `HrEmployee`, `HrSalaryProfile` | + `unitId`, `employmentStatus` (nullable or defaulted), dates; + `payType` default MONTHLY, rates nullable; new `HrEmployeeUnit` | backfill units (1-unit tenants only) |
| H1.2 | `HrAttendance`, `HrLeave` | + nullable columns; new tables; enum `HrAttendanceJudgement` + ABSENT/EARLY_OUT in **its own migration file** (`ALTER TYPE … ADD VALUE` is not transactional) | indexes on new tables only; `HrAttendance` new index `(rosterEntryId)` created `CONCURRENTLY` in a separate migration if the table is large on prod (check row count first) |
| H1.3 | `HrPayrollRun`, `HrPayrollItem`, `HrPayAdjustment` | + nullable columns; partial unique `(tenantId, sourceType, sourceRef) WHERE sourceRef IS NOT NULL` | existing partial unique on `crmCommissionId` (migration `20261102000000_crm_v2_c`) untouched |
| H3.7 | `AccountLedger` (rows) | new ledger codes created through `ensureAccounting` (per HQ16) | posting change only for runs approved after deploy |
| all | `AppSystem.settings` (HR keys) | single-statement `jsonb_set` writes only | no read-modify-write |
Untouched by HR V2: every POS, CRM, member, booking and inventory table, plus `HrWorkSchedule` (it stays the template) and `HrEmployeeDoc`.
Prod data today: 1 demo tenant and no real shop (RESUME), so backfills are light, but every script is idempotent, has `--dry-run`, and prints counts.

## 9. Live-defect ledger (review §8 → status on hotfix afcb9bc3 → plan)
| id | status after hotfix | plan |
|---|---|---|
| D1 leavers paid | live (`payroll.ts:338-341` hotfix) | H0.2 (window filter) · proration H3.4 (HQ6) |
| D2 draft stuck / reversed month blocked | live | H0.1 (draft) · H0.6 (reversed) |
| D3 payslip unguarded | **fixed on hotfix** (`privacy.loadPayslipForViewer`) | G0 deploy |
| D4 profile payload | **fixed on hotfix** (DTO) | G0 |
| D5 manual adjustment into closed period | live (`payroll.ts:113-157` hotfix; CRM path guarded :618-620) | H0.2 |
| D6 negative net | live (`payroll.ts:293`); a total-negative run throws at JV (`gl.ts:1024`) | H0.2 (block) · carry-forward H3.4 (HQ7) |
| D7 PIN plain / kiosk bypass / in-memory limiter | live (`hr.prisma:73`; `actions.ts:62-73,202` hotfix) | H0.3 (bypass + limiter) · H0.5 (hash) |
| D8 PIN oracle | name removed on hotfix; "taken" still confirmable | H0.3 (set-PIN DB limiter) · H0.5 (unique hash + generic reply) |
| D9 leave reason | **fixed on hotfix** | G0 |
| D10 leave decision | **fixed on hotfix**; residual requester id | H0.7 |
| D11 book / JV atomicity / cash at approve | live | H3.7 (HQ16) |
| D12 bogus period | live in `createPayrollRunAction` (`payroll-actions.ts:69` hotfix); `requestAdjustment` already validates (`payroll.ts:118` HEAD) | H0.2 |
| D13 double tap / overnight | live | H0.3 (double tap) · H2.4 (overnight) |
| D14 `pending_leaves` without id | live (`ai/tools.ts:161-170` hotfix) | H0.3 |
| D15 SSO ceiling 15,000 | unverified law | HQ8 → conditional H0.8 · H3.3 |

## 10. Code verification (spot-check of the review on HEAD cb1a2331 + `origin/hotfix/hr-privacy` afcb9bc3, 4 Oct)
Confirmed: `hr.prisma:73` `pinCode String?` plain · `:74` `linkedUserId` without unique · `:10` enum `HrLeaveType` (the name collision holds) · `:47` `HrEmploymentType` · `:194` `@@unique([employeeId, weekday])` · `HrAttendance` has no unique (`:140-155`) · `payroll.prisma:60-61` MONTHLY + `otHourlyRateSatang` · `:86` `journalEntryId` exists · `:92` `@@unique([systemId, periodKey])` · `:111` `snapshotJson` · no `updatedAt` on `HrPayrollRun` · `service.ts:336` raw PIN write, `:364` `!==` compare (HEAD; hotfix :338/:366) · `actions.ts:61-71` `clockAction` without PIN (hotfix :62-73) · `payroll.ts:301-304` profiles without an active/date filter (hotfix :338-341) · `payroll.ts:256` net without a floor (hotfix :293) · `payroll.ts:408,474` first `ACCOUNT` system without order · `gl.ts:1781-1817` JV shape exactly as the review says · `payroll-rules.ts:23-24` SSO 1,650/15,000, `:106` multiplier default 1.5 · `scope.ts:121-125,178-181` all HR/payroll models `sys()` · `rbac.ts:47-51` `canViewPayroll` · booking imports `hr/service` directly (`booking/service.ts:7`) · consumers `outbox-consumers.ts:834` (`hr.leave.submitted`), `:1201` (`hr.payroll.paid`) · 8 HR suites + `qc-booking-hours-hr` present in `scripts/`; `qc-hf-hr-privacy.mts` (1,302 lines) on the hotfix only.
**Drift / corrections since 1 Oct:**
1. Review §1.2 cites the facade as `hr/index.ts:190-215`. The file is 39 lines; the exports are at `:13-38`. This is a mis-citation, not a behaviour change.
2. HR permission keys sit at `permissions.ts:496-508` (review: 494-506, +2 line offset). There are 13 keys, unchanged.
3. Module size on HEAD: 14 files / 4,212 lines (incl. `.tsx`). The hotfix adds `privacy.ts` (228), `privacy-shared.ts` (94), `PayAdjustRowActions.tsx` (52) and edits 18 files (+5,233/−199 incl. oracle and notes).
4. D3, D4, D9 and D10 are closed on `hotfix/hr-privacy` (not on HEAD, not on main). D8 is half-closed (no holder name, but "taken" is still observable).
5. The hotfix added rules the plan must keep: decide-leave transitions (PENDING→APPROVED/REJECTED, APPROVED→REJECTED revoke with `from`, not for chain-approved leave), no self-decision through the approval chain, no approving or deleting one's own pay adjustments unless OWNER (`decideAdjustment`/`cancelAdjustment` actor param), OT hour granularity for non-payroll viewers (0.25 h, cap 744 h), AI plans cannot decide leave (`ai/plans.ts`), and leave + approval request created in one tx (`approval/service.ts` uses `opts.tx`).
6. New fact not in the review: `postManualJV` refuses negative lines (`gl.ts:1024`), so an all-negative run fails at approve and rolls back to DRAFT (`payroll.ts:438-441`). D6 stays live for a single negative item.
7. The payroll-run section of `payroll-ui.tsx` (hotfix :245-310) has no delete/recompute button, matching D2.

## 11. Risks and mitigations
| risk | mitigation |
|---|---|
| Building on pre-hotfix code re-opens D3/D4/D9/D10 | G0; every brief names afcb9bc3 as the minimum base; `qc-hf-hr-privacy` is a mandatory regression |
| POS builds `PosStaffPin` before H0.5 | controller ruling in POS before the P1.15 brief (§7.1); H0.5 is scheduled before P1.15 |
| Law values wrong (SSO ceiling, WHT method) | DRAFT law rows, accountant sign-off gate (HQ23), golden vectors in oracles |
| Bank/e-Filing formats guessed | golden files only from real samples (HQ14/HQ15); without samples the WO ships the generator interface plus "ยังไม่เปิดใช้" |
| CRM merge conflicts in account/approval/outbox | merge order RC → CRM → HR; H0.6, H3.6 and H3.7 wait for CRM on main |
| Personal data spreads through new surfaces (GPS, photos, slips, CSV, AI) | X11 in every oracle; F16.1/F16.3; retention job (HQ27) |
| QC4 shared with POS lanes | temp tenants tagged `qc-hr-<wo>-<rand>`, gate lock, drain before cleanup, residue check at the end of every oracle |
| Session quota | stop spawning at ≥70% (feedback_session_quota_pacing) |

## 12. Live status
- 4 Oct 2026: plan written (this file + `HR-V2-OWNER-QUESTIONS.md` + `hr-briefs/hr-brief-COMMON.md` + briefs H0.1–H0.3). **The RUN has not started.** Waiting for: (1) the owner's GO for an HR RUN beside POS, (2) G0 (RC deploy or HQ1), (3) owner answers HQ2–HQ4 before H0.5.
