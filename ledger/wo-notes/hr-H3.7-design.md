# H3.7 — payroll accounting v2 · design companion (templates · worked examples · default chart · overlaps · accountant list)

Companion of `ledger/hr-briefs/hr-brief-H3.7.md`. The brief wins on contract wording. Vectors: `scripts/fixtures/hr-h3.7-vectors.json` (every number below is in it). Oracle: `scripts/qc-hr-h3.7.mts` (+ `-lib.mts`). Money = integer satang; the entry balances to the satang **from stored figures only** (run items + bound adjustment rows written by H3.4) — nothing is recomputed.

## 1. Treatment (controller ruling 1 — HQ16 unanswered, defaults)
| event | when | entry |
|---|---|---|
| **accrual** | v2 run finalized (H3.4 final transaction) in an HR system that has exactly one book link | GENERAL book, journal ADJUST, key `hr-payroll#<runId>#accrual`, dated the **accrual day** = clamp(pay day, first day of P, last day of P) (fix r1 F4 — always inside the wage month) |
| **payment** | `markPaidRun` of such a run | PAYMENTS book, journal PAYMENT, key `hr-payroll#<runId>#pay`, dated `paidOn` (default today BKK; allowed first day of P … today) |
| **reversal** | `reverseRun` | existing `reverseEntry` per entry, pay first then accrual; keys `hr-payroll#<runId>#REVERSAL:<entryId>` (reverseEntry's own key = the "#reverse-…" of the ruling — no second mechanism); dated today, or the first day of the next open period when today's period is closed (existing Gate C rule) |
| none | no book link | run finalized without JV (H3.4 "no accounting" behaviour), `accountSystemId` null |
| old | runs approved before H3.7 (v1 engine, or v2 with `accountSystemId` null and a one-step JV) | unchanged: one-step JV kept, reversed the old way, `markPaid` posts nothing |

Remitting SSO (สปส.1-10, by the 15th of the next month — พ.ร.บ.ประกันสังคม ม.47 [V2/V]) and PND1 (within 7 days after month end, 15 days online — `common-withholding-tax.md` §7 [V]) is **out of scope**: the accounting system's own payment flow debits 2150/2130. Advance pay-outs are not booked by HR either (§6 AC7).

Why accrual (law file, tags kept): TFRS for NPAEs uses accrual basis — "มีรายการปรับปรุงค้างรับ/ค้างจ่าย" (3.3) [V]; journals must be entered within 15 days of the transaction (DBD notice ข้อ 7) [V], so the expense belongs to the wage period and cash moves only when paid; each journal carries date · reference · description · amount, Σdr = Σcr (audit D1) [V]; posted entries are never edited — corrections are reversing entries (audit E12/G1) [V]; reversal date across a filed month must not change it silently (G5) [V]. Final wages within 3 days of termination (LPA s.70) [V2] ⇒ a leaver's uncollectable deductions become an employee receivable, not withheld wage (law file payroll row 3 [U — no direct text]).

## 2. Templates (one table — rows in this order, zero rows omitted, rows never netted)
| # | side | mapping key (default code) | amount (Σ over items) |
|---|---|---|---|
| 1 | Dr | PAYROLL_SALARY_EXPENSE (6000) | salaryExpense = Σ lines − ADVANCE lines − DEDUCTION lines − REFUND lines (= gross + advances + claims − refund) |
| 2 | Dr | PAYROLL_SSO_EXPENSE (6010) | Σ ssoEmployer |
| 3 | Dr | PAYROLL_DAMAGES_RECOVERY (4900) | Σ REFUND lines giving back a DAMAGES claim, or of unknown class (flag `REFUND_CLASS_UNKNOWN`) |
| 3b | Dr | PAYROLL_OVERPAY_RECOVERY (6000) | Σ REFUND lines giving back an OVERPAY claim (fix r1 F5) · a refund of a claim recovered in a v1 / H3.4-era one-step run stays in row 1 (salary expense — how that deduction was posted) |
| 4 | Dr | PAYROLL_EMPLOYEE_RECEIVABLE (1140) | Σ receivable DAMAGES (final period) |
| 5 | Dr | PAYROLL_EMPLOYEE_RECEIVABLE (1140) | Σ receivable OVERPAY |
| 6 | Cr | PAYROLL_SALARY_PAYABLE (2120) | Σ net |
| 7 | Cr | PAYROLL_SSO_PAYABLE (2150) | Σ (ssoEmployee + ssoEmployer) |
| 8 | Cr | PAYROLL_WHT_PAYABLE (2130) | Σ wht |
| 9 | Cr | PAYROLL_EMPLOYEE_RECEIVABLE (1140) | advances recovered = −Σ ADVANCE lines (incl. carry-in) |
| 10 | Cr | PAYROLL_DAMAGES_RECOVERY (4900) | −Σ DEDUCTION lines of class DAMAGES |
| 11 | Cr | PAYROLL_OVERPAY_RECOVERY (6000) | −Σ DEDUCTION lines of class OVERPAY |
| 12 | Cr | PAYROLL_DAMAGES_RECOVERY (4900) | = row 4 |
| 13 | Cr | PAYROLL_OVERPAY_RECOVERY (6000) | = row 5 |
| pay | Dr 2120 / Cr pay account | — | Σ net (0 ⇒ no pay entry) |

Balance proof: Dr = gross + adv + claims − refund + er + refund + rD + rO; Cr = net + ee + er + wht + adv + claims + rD + rO; gross = net + ee + wht (H3.4 identity) ⇒ equal. Class of a DEDUCTION line = class of its bound row (H3.4 `planCarryRows` rule, hoisted as `claimClassOf`): CARRY_FORWARD → suffix of sourceRef; CRM_COMMISSION/POS_SALE_LINE/OT_REQUEST → OVERPAY; anything else → DAMAGES. LATE_RULE/ABSENT_RULE lines are reduced wage (row 1), not claims. Carry-forward amounts (`snapshot.carry`) are **not booked** (recognised when collected). Receivable ADVANCE is **not booked** (the advance already sits in 1140 when paid out). Notes per row: fixture `template[*][3]`.

## 3. Default chart mapping (created through `ensureAccounting` + `ensurePayrollLedgersInTx` when the owner links the book)
| key | code | name created / used | type | status in the seeded chart |
|---|---|---|---|---|
| PAYROLL_SALARY_EXPENSE | 6000 | เงินเดือนและค่าแรง | EXPENSE | exists (seed) |
| PAYROLL_SSO_EXPENSE | 6010 | เงินสมทบประกันสังคม (ส่วนนายจ้าง) | EXPENSE | **new** (6000–6099 free) |
| PAYROLL_SALARY_PAYABLE | 2120 | เงินเดือนค้างจ่าย | LIABILITY | **new** (HQ16's 2110 is taken by deposits received) |
| PAYROLL_SSO_PAYABLE | 2150 | เงินสมทบประกันสังคมค้างนำส่ง | LIABILITY | **new** (2140–2149 reserved by dorm deposits; v1 used 2100 AP — known defect) |
| PAYROLL_WHT_PAYABLE | 2130 | ภาษีหัก ณ ที่จ่ายค้างนำส่ง | LIABILITY | exists (shared with PND3/53 — AC3) |
| PAYROLL_EMPLOYEE_RECEIVABLE | 1140 | ลูกหนี้พนักงาน/เงินทดรองจ่ายพนักงาน | ASSET | **new** (HQ16's 1150 is taken by input VAT) |
| PAYROLL_DAMAGES_RECOVERY | 4900 | รายได้อื่น / กำไรจากการจำหน่ายสินทรัพย์ | INCOME | exists |
| PAYROLL_OVERPAY_RECOVERY | 6000 | เงินเดือนและค่าแรง (contra) | EXPENSE | exists |

Rule per key: mapping exists ⇒ kept (owner's choice wins); else ledger with that code exists with the expected type and `isSystem` ⇒ mapped; code free ⇒ ledger created (`isSystem`, name above, OPERATING) then mapped (createMany skipDuplicates + re-read, dorm pattern); code taken by the shop's own ledger ⇒ **left unmapped** — approve refuses `mappingMissing` naming the key's label and default code until the owner maps it (never posts to a wrong account, never SUSPENSE). Not added to coa `CHART` (qc-account-cpa ledger count and every other shop unchanged).

## 4. Worked examples (satang; codes = defaults) — oracle S2.2/S2.3 (pure) and S4.1–S4.5 (DB)
**A plain** (2031-09, pay day 2031-10-05 ⇒ accrual 2031-09-30). a1 BASE 3,000,000 · SSO 87,500/87,500 · WHT 16,458 · net 2,896,042; a2 BASE 1,500,000 · SSO 75,000/75,000 · net 1,425,000.
Dr 6000 4,500,000 · Dr 6010 162,500 / Cr 2120 4,321,042 · Cr 2150 325,000 · Cr 2130 16,458 — Σ 4,662,500. Pay 2031-10-05: Dr 2120 / Cr 1010 4,321,042.

**B advances + claims + carry + lateness + refund** (one employee, base 20,000). Lines: BASE 2,000,000 · LATE_RULE −27,770 · OT +150,000 · REFUND +20,000 · ADVANCE −100,000 (carry-in) · ADVANCE −200,000 · DEDUCTION −212,223 (MANUAL damages, requested 300,000: 10 % cap of W 2,122,230) · DEDUCTION −50,000 (CRM_COMMISSION clawback). Σ = gross 1,580,007; SSO 87,500/87,500 (wage 1,972,230 clamped 17,500 ฿); WHT 9,000; net 1,483,507; carry DAMAGES 87,777.
salaryExpense = 1,580,007 + 300,000 + 262,223 − 20,000 = 2,122,230.
Dr 6000 2,122,230 · Dr 6010 87,500 · Dr 4900 20,000 / Cr 2120 1,483,507 · Cr 2150 175,000 · Cr 2130 9,000 · Cr 1140 300,000 · Cr 4900 212,223 · Cr 6000 50,000 — Σ 2,229,730. Carry 87,777 written by H3.4 into 2031-10, not booked.

**C leavers** (pay day 2031-09-18). c1 base 18,000 ends 09-15: BASE 1,800,000 · PRORATION −900,000 · ADVANCE −400,000 · DEDUCTION −90,000 (stock charge, req. 100,000) · DEDUCTION −90,000 (clawback, req. 100,000) ⇒ gross 320,000 · SSO 45,000/45,000 · net 275,000 · receivable DAMAGES 10,000 + OVERPAY 10,000. c2 base 9,000 ends 09-30: BASE 900,000 · ADVANCE −855,000 (req. 1,000,000) ⇒ gross 45,000 · SSO 45,000/45,000 · net 0 · receivable ADVANCE 145,000.
Dr 6000 1,800,000 · Dr 6010 90,000 · Dr 1140 10,000 · Dr 1140 10,000 / Cr 2120 275,000 · Cr 2150 180,000 · Cr 1140 1,255,000 · Cr 4900 90,000 · Cr 6000 90,000 · Cr 4900 10,000 · Cr 6000 10,000 — Σ 1,910,000. ADVANCE 145,000 not booked (stays in 1140). Pay 275,000.

**D bonus month** (2031-12). BASE 2,500,000 · BONUS 5,000,000 ⇒ gross 7,500,000 · SSO 87,500/87,500 (bonus outside SSO wage) · WHT 452,083 (one-off taxed in full, stored) · net 6,960,417.
Dr 6000 7,500,000 · Dr 6010 87,500 / Cr 2120 6,960,417 · Cr 2150 175,000 · Cr 2130 452,083 — Σ 7,587,500. Pay 2031-12-26 from the default cash account: Dr 2120 / Cr 1000 6,960,417.

**E no employer SSO** (employee outside SSO; book = the shop's second ACCOUNT system). BASE 1,200,000 · SSO 0/0 · WHT 0 · net 1,200,000 ⇒ Dr 6000 1,200,000 / Cr 2120 1,200,000.

**Reversal of paid A**: reverse pay (Dr 1010 / Cr 2120 4,321,042) then accrual (Cr 6000 4,500,000 · Cr 6010 162,500 / Dr 2120 4,321,042 · Dr 2150 325,000 · Dr 2130 16,458) ⇒ every ledger nets to 0 over the run's 4 entries. **Unpaid E**: one reversal (Cr 6000 / Dr 2120 1,200,000), no pay entry.

**No-accounting shop / no link**: run finalized, `journalEntryId` null, `accountSystemId` null, note `noteNoBook`; markPaid ⇒ PAID, no entry; reverse ⇒ REVERSED, `reverseNoBook` (Q1); zero `hr-payroll#…` entries in every book of the tenant.

## 5. Overlaps with the account-fix session (`/root/projects/shark-acc`, `session/account-fix` fc0fbc2a7, read only)
`git diff origin/main...session/account-fix --stat -- src/lib/modules/account`: 50 files. Touching what H3.7 needs:
- `gl.ts` (+10/−2): import `vatRateBpAt` after the `policy` import (line ~11) and `settingsOf(ctx, db, at)` + its one caller in `postDocument` (~451–580). H3.7 needs **no new import** and adds its hunks after `postPayrollJV` (~2127+) — disjoint; `commitEntry`, `reverseEntry`, `ensureAccounting`, `postPayrollJV` untouched by both.
- `index.ts` (+29/−4): export block after `vatConfigOf` (~line 50) and dorm helpers (~1850–1930). H3.7 adds one marked export block next to the payroll export (~1278) — disjoint.
- `policy.ts`: `defaultPolicy(vatRateBp)`/`parsePolicy(row, vatRateBp)` signatures change; `lockedMessage`/`isLockedDate` unchanged — H3.7 uses only those two.
- `period-close.ts`: VAT filing only; `closePeriod` semantics unchanged.
- `connections.ts`, `coa.ts`: not touched by account-fix.
- Plan items with future contact: T1.9 (reports read accounts by mapping, not fixed codes — fits H3.7's mapping keys), T5.1 (tax calendar PND1/SSO reminders), T6.8 (connection overview incl. HR).
Merge risk: **low**; marked additive hunks merge cleanly in either order. Only watch: if account-fix later edits `commitEntry`/`assertPeriodOpen` texts, H3.7's precheck must keep the same text (it copies the template `งวด {p} ปิดแล้ว — โพสต์บัญชีไม่ได้`; S3.8/S4.15 pin it).

## 6. Accountant list for H3.10 (tags from `shark-thai-law`; [U] in neutral wording)
- **HQ16** (open): two-step posting and the codes below — confirm or replace.
- AC1 Accrual day = min(pay day, last day of the wage month); a closed period refuses instead of shifting.
- AC2 Employer SSO in its own expense account 6010 (v1 put it in 6000).
- AC3 Codes 2120 salaries payable · 2150 SSO payable · 1140 employee advances/receivables; PND1 WHT shares 2130 with PND3/53 — separate sub-account wanted?
- AC4 Damages/stock charges recovered through payroll credit other income 4900 [U]; H4.6 already expensed the issued stock (Dr 5000/Cr 1200) — contra-COGS instead? (H4.6 A5)
- AC5 Overpaid wages/commission recovered credit salary expense 6000 (contra) [U].
- AC6 A refund of a claim (REFUND) debits the recovery account 4900 [U]; not 40(1) income, not SSO wage (H3.4 B4-6) [U].
- AC7 Advances paid out before payroll are not booked by HR; the shop must book them Dr 1140 / Cr cash, else 1140 turns credit. Book the pay-out from HR later?
- AC8 Leaver: uncollected DAMAGES/OVERPAY recognised Dr 1140 / Cr 4900 or 6000 at the final run; uncollected ADVANCE stays in 1140; collection outside payroll (severance — ฎีกา 2681–2683/2545 [V2]).
- AC9 Carry-forward deductions are not recognised until collected [U].
- AC10 Bonus in 6000 (no separate bonus account).
- AC11 One aggregated accrual and one aggregated pay entry per run (no per-employee lines; employees in the payroll register).
- AC12 Reversal dated on the reversal day (next open period if closed), not the original date (G5 [V]).
- AC13 SSO/PND1 remittance booked by the accounting payment flow (Dr 2150/2130 / Cr bank) — out of HR.
- AC14 Runs approved before H3.7 keep the one-step JV (cash credited at approve, SSO in 2100); no backfill.
- AC15 No book link ⇒ nothing posted; the shop posts payroll by hand.
- AC16 Pay date between the first day of the wage month and today.

## Fix round 1 (controller rulings on the reviewer + hunter report)
- F4: accrual day = clamp(pay day, first day of P, last day of P); a closed-period refusal therefore always names P. Vectors +2 (pay day before P ⇒ first day of P).
- F5: refund class = class of the claim named by the REFUND row (`sourceRef = "refund:<claim adjustment id>"`); no reference ⇒ 4900 + flag (accountant). Worked vector F in the fixture (`refundVector`): Σ 2,134,500 both sides. **Gap:** nothing in HR writes `refund:<id>` yet (requestRefundAdjustment has no claim picker) — every live refund is "unknown" until the refund request names its claim.
- F6: links with `config.autoPost !== true` (all pre-H3.7 links unless the owner switched it on) post nothing (`OFF`); the HR settings card shows the state with an owner switch.
- AC1 (updated) accrual inside the wage month always; AC19 refund classes; AC20 a run whose recorded book is deactivated/deleted is stuck APPROVED (pay and reverse refuse `bookGone`) until the owner reactivates that book — deleting a book that holds payroll entries is not recoverable from HR.
