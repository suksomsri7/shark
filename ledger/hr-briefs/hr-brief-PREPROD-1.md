# HR-PREPROD-1 — debts that must close before production · brief

Base `session/hr` a4e2fb4ae · branch `wip/hr-preprod-1` · oracle `scripts/qc-hr-preprod-1.mts` · numbers `wo-notes/hr-PREPROD-1-oracle.md`. Mark every hunk `HR PREPROD-1`. Anchors were opened on a4e2fb4ae; paths are under `src/lib/modules/hr/` unless they say otherwise.

## Goal
Close six PRE-PROD rows of `HR-DEBTS.md`: H3.2-reverse-untested · D-H37-refund-in-runless-period · D-H212-legal · D-PRIV-blind-approve · D-M2-policy-paid-flip · HF-SSO-M2.

## Scope
**R1 reverse with bound attendance rows (oracle only, expect GREEN).**
- Today `reverseRun` v1 (`payroll.ts:1262`, unbind `:1306-1314`) and `reverseRunH37` (`:3518`, unbind `:3557-3563`) set `runId` NULL on every bound row, LATE_RULE/ABSENT_RULE included. `HrAttendanceDeduction` heads (`prisma/schema/payroll.prisma:382`) are untouched.
- Pin on three paths (v1 with JV · v2 no-book finalized · v2 booked):
  - the run becomes REVERSED;
  - the rows stay APPROVED and unbound, with heads unchanged;
  - a re-created run of the same period binds the same lines;
  - `syncAttendanceDeductions` (`attendance-pay.ts:348`) afterwards writes nothing;
  - the MONEY-2 R6 leave gate (`leave.ts:1162-1173`) refuses before the reversal and allows after it.
- Numbers: base 3,000,000 st, N = 480, `floor(base·m/(30·N))` (`attendance-pay-rules.ts:77-78`) ⇒ absent day 100,000 + late 30 min 6,250 = 106,250 st, before and after.
- A RED result is a finding.

**R2 refund in a period with no run.**
- Today `giveBackClaim` (`payroll.ts:3714`) puts a REFUND (`sourceRef refund:…`) in a period p with no run, after `lastCovered` (`:3765-3771`). A later run approved first (a race, or runs out of order) leaves p behind `lastCovered` and never paid.
- The page's only pending list is `strandedAdjustments` (`:1450-1460`), rendered as "รายการค้าง" with a move button (`payroll-ui.tsx:128-130,333-346`). It lists only periods that HAVE a live run.
- Required:
  - the same reader also returns refund rows (PENDING/APPROVED, unbound, period without a live run, period ≤ `giveBackWindowInTx().lastCovered` `:3692-3698`), tagged `reason: "REFUND_BEHIND"`; the page adds one fixed line;
  - `moveStrandedAdjustment` (`:1469`, which today refuses at `:1488`) accepts these rows. Target = first period with no run after max(p, lastCovered), as `giveBackPeriodOf` (`:3703-3713`) computes it. A target after `endPeriod` is refused with a fixed text;
  - the PRIV-2 filter (`payroll-ui.tsx:130`) stays.
- Example: claim deducted in 2026-03; refund 50,000 st filed for 2026-04; 2026-05 run approved. The refund is listed, and moving it sends it to 2026-06.

**R3 sick day 31+ = unpaid.**
- Today the cap is the policy ledger (SICK preset quota 30, `leave-presets.ts:34`). A request is refused at `leave.ts:368`. Approval gives `BALANCE` (`:451` → `service.ts:717`; chain `leave.ts:545`). Paid status is per policy (`prisma/schema/hr.prisma:557`).
- Proposed, smallest change: no migration, no second row. A row split would need a flag column, and it breaks overlap (`leave.ts:347`), the inbox, the chain and cancel. For category SICK with a quota:
  - request: skip the balance refusal;
  - approve: paid = min(days, available under L3); unpaid = rest;
  - `use:<id>` writes −paid (0.0 allowed, as `expire` rows are), with note `unpaid:<d.d>;from:<YYYY-MM-DD>[;half]`; `from` = the first counted day (day-set of `leaveDaysInTx` `:198-219`) that is not fully paid;
  - the balance never goes negative, and `use-revert` restores paid days only;
  - a single reader `leaveSplitOf(ids)` in `leave.ts`.
- Money paths:
  - **v2:** `work-entries.ts:203,219,402-409` → `work-entries-rules.ts:85` (add optional `unpaidTenths`), `:240-247,315-316` → `unpaidLeaveMin` → `payroll.ts:2534` → `payroll-run-rules.ts:374-376` UNPAID_LEAVE (unchanged). The digest key `work-entries.ts:252` must carry the split.
  - **v1** `buildRunRows` (`payroll.ts:604-743`) reads no leave, so no deduction today (Q4).
  - **Labour:** `labor.ts` reads no leave; ACTUAL follows the run lines.
  - **Balance:** `balanceItems` (`leave.ts:828-871`) = ledger ⇒ used = paid. Correct as is.
  - **Exports/payslip/filings:** run lines (`reports-rules.ts:16` ∋ UNPAID_LEAVE).
  - **Leave record:** `service.ts:990`, `privacy.ts:161`, "ของฉัน" and `ui.tsx` show the paid/unpaid days.
  - **Gate:** `leavePaidRunRefusalInTx` (`leave.ts:1150-1159`) runs before the split exists (`:540`<`:545` · `service.ts:711`<`:716` · owner auto-approve `:509`). Call it a second time after the check, only when unpaid > 0, over the unpaid days' months. Today's order is kept; this is the only sick refusal left.
- Example (base 3,000,000, N = 480):
  - 28.0 used, leave 10–14 Mar = 5 days ⇒ paid 10–11, USE −2.0, UNPAID_LEAVE 300,000 st;
  - 27.5 used ⇒ 12 Mar half ⇒ 50,000 + 200,000 = 250,000 st.

**R4 blind approve.**
- Today `decideAdjustmentAs` (`payroll.ts:2117`) calls `unitTargetOf(…, new Date())` (`:2133`). With a date, borrowing counts (`scope.ts:147-151`). The not-found text (`:2128`) differs from the out-of-scope one.
- Required:
  - not all-branch and `!inPayScope(scope, home)`, or the row is missing ⇒ `PAY_SCOPE_NO_ACCESS_TEXT` (new, `scope.ts`) "ไม่พบรายการนี้ หรือคุณไม่มีสิทธิ์ดูค่าจ้างของพนักงานคนนี้", byte-equal in both cases;
  - all-branch texts are unchanged.

Other money actions — can a limited viewer act on an out-of-pay-scope employee's money row?

| action | anchor | today | in ticket |
|---|---|---|---|
| decideAdjustmentAction (manual/bonus/advance/LATE-ABSENT confirm/stock row) | `payroll-actions.ts:330,343` · `payTarget` `:59-65` | **yes** (borrowed) | yes |
| cancelAdjustmentAction | `:373,382` | **yes** | yes |
| moveStrandedAdjustmentAction | `:445,454` | **yes** | yes |
| setAdjustmentConsent | `payroll.ts:3092-3101` (home null ⇒ `evaluate` without unit passes, `core/rbac.ts:22-25`) | **yes, home-less** | yes |
| giveBackClaim | `payroll.ts:3726-3732` | **yes** (borrowed) | yes |
| withdrawStockCharge | `stock-charge.ts:440-459` | **yes, borrowed home-less** | yes |
| OT decide/revoke | `ot.ts:320-330,124-127` | request only; `OT_REQUEST` row cannot be decided (`payroll.ts:2130`) | no (Q5) |
| leave · correction decide | `leave.ts:930-942` · `correction.ts:436` | no money row | no |
| attendance sync · runs · certs | `attendance-pay.ts:73` · `payroll-actions.ts:55-57` · `payslip.ts:127-130` | no | — |

All of these go through `inPayScope` (`payTarget` gets a pay mode). `requestAdjustmentAction` (`:294`) is unchanged (Q6).

**R5 policy paid flip.**
- Today `updateLeavePolicy` (`settings.ts:496-545`, row locked `:504`) writes `paid` freely.
- Required: when `paid` changes and an APPROVED leave of this policy touches a month with an APPROVED/PAID run (months rule `leave.ts:1131,1158`), refuse with `SETTINGS_TEXT.paidLocked` "เปลี่ยน 'ได้รับค่าจ้าง' ของประเภทการลานี้ไม่ได้ เพราะมีใบลาที่อนุมัติแล้วอยู่ในเดือนที่อนุมัติเงินเดือนแล้ว — สร้างประเภทการลาใหม่แทน". Nothing is written.
- Helper in `leave.ts` (no import cycle).
- Otherwise the flip is allowed.

**R6 runbook.** Under row 13 of `ledger/HANDOVER-H3.md` §3 (`:82`) add:
> **13a (HF-SSO-M2).** Activate SSO and DEDUCTION as one set: the 1970 rows **and** `v1:SSO:2569/2572/2575` + `v1:DEDUCTION:2569/2572/2575` in the same session. With only the 1970 rows ACTIVE, engine v2 falls back to the 15,000 ฿ SSO ceiling and the 9,000 ฿ allowance cap from wage period 2026-01 (v1 unaffected: bands in code). Check: a v2 draft of 2026-01 at 20,000 ฿ shows SSO 875 ฿. Still gated by G-SSO-GO.

## Allowed files (all else frozen)
`payroll.ts` · `payroll-actions.ts` · `payroll-ui.tsx` · `scope.ts` (one constant) · `leave.ts` · `leave-rules.ts` · `service.ts` · `work-entries.ts` · `work-entries-rules.ts` · `privacy.ts` (leave DTO) · `ui.tsx` · `self.ts`/`self-ui.tsx` · `settings.ts` · `stock-charge.ts` (R4) · `src/messages/{th,en}/common.json` · `ledger/HANDOVER-H3.md`.
- **`payroll-rules.ts` byte-frozen (sha).**
- Unchanged: `payroll-run-rules.ts` · `payroll-rules-v2/-sso.ts` · `attendance-pay*` · `judge*` · `ot*` · `labor*` · `reports*` · `correction*` · `prisma/**` · `src/lib/core/**` · `hr/api/**` · older oracles (except the ORACLE-EDITs below).

## Hard rules
- `HR PREPROD-1` on every hunk.
- Settings writes only via `lockHrSettings` + `writeHrSettingsKeys` (none expected).
- No migration (Q1).
- Never satisfy a static check by changing syntactic form.
- One pay-scope helper (`inPayScope`/`payScopeWhere`).
- Fixed Thai texts, with no names, amounts or ids.
- Lock orders unchanged.

## Oracle plan (`qc-hr-preprod-1`)
- **R1.1–9** GREEN pins (3 paths × reverse / re-bind / sync / gate). Fixture: v2 shop, attendance-pay ON, 1 absent + 1 late.
- **R2.1–5** RED: listed, moved to 2026-06, refused past `endPeriod`. GREEN: an ordinary give-back is not listed; old stranded rows are unchanged.
- **R3.1–10** RED: accept, USE note, DTO split, 300,000 / 250,000 st, cancel restores paid only, unpaid part in a paid month ⇒ `CORRECTION_TEXT.paid` on 3 paths. GREEN: leave within 30; PERSONAL over quota still refused.
- **R4.1–8** RED: each "yes" row ⇒ identical text, equal to not-found. GREEN: all-branch; in-scope home; inbox.
- **R5.1–3** RED: refused, row byte-same. GREEN: no paid-month leave; non-paid edit.
- **R6.1** static.
- **ST1–4** marks · sha · one predicate · texts.
- ORACLE-EDIT (explicit marked allowlist entries): **h1.3 S6.1 `PAY_MARKED`** (+`"HR PREPROD-1": n`) · **h3.2 S1.8** · **h3.4-lib** (work-entries diff, `:212`) · **h3.6** · **h3.9** (`:163`) · **h4.3-lib** S1.6. Possibly money-2 ST3 and priv-2 statics.

## Lane run list
- `qc-hr-`: preprod-1 · h0.6 · h1.3 · h2.4 · h2.7 · h2.11 · h2.12 · h3.1 · h3.2 · h3.4 · h3.4-ytd · h3.6 · h3.7 · h3.9 · h4.3 · h4.6 · money-2 · priv-2 · hf-sso.
- Plus: qc-payroll · qc-payroll-reverse · qc-hr-payadjust · qc-hf-hr-privacy · qc-audit-trail · fitness + fitness-hr (both modes).
- Clean typecheck: delete `.next/types` + tsbuildinfo, `ISO_MEM=14000M`.

## QUESTIONS FOR THE CONTROLLER
1. R3 storage: USE-row note, or an `HrLeave.unpaidDays` column? **Default: note.** No migration, and the split is frozen at approval.
2. Paid cap = the policy balance, or a hard 30? **Default: balance.** A shop may grant more; a lower cap already warns (`leave-presets.ts:127`).
3. Categories? **Default: SICK only.** The ruling names sick leave only.
4. v1 never deducts unpaid leave. **Default: unchanged, debt row.** v1 is legacy; v2 is the target.
5. OT decide by the borrowing branch? **Default: unchanged.** PRIV-2 R3, and the request carries no amount.
6. `requestAdjustmentAction` for borrowed staff? **Default: unchanged.** Filing is not approving.
7. R2 refund past `endPeriod`? **Default: listed, move refused.** It is paid outside payroll, like stock `REFUND_OWED`.
8. Thai line in `docs/modules/18-hr.md` §5.3 too? **Default: no.** The runbook is the activation authority.
