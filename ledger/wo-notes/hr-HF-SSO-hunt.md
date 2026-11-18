# HF-SSO-2569 — money bug hunt (real run lifecycles) · 14 Nov 2026 · tree shark-hr-l3 @ 946008472 (untracked note)

**Verdict: no HF-SSO bug found.** 4 probe processes were executed against the lane QC DB (host ep-ancient-truth, via iso.sh → qc-hr.sh → with-gate-lock.sh). They cover hunt items 1–6. Every expected number below was worked out by hand before the run, and every run result matched. One pre-existing v2 issue that is outside this ticket is noted (N1).
Scripts and raw output: `scratchpad/hfsso-hunt/` (`common.mts`, `p1-prefix-lifecycle.mts`/`p1.out`, `p2-mixed-and-approve.mts`/`p2.out`, `p3-years-v1-v2-labor.mts`/`p3.out`, `p5-opening.mts`/`p5.out`).
Hygiene:
- I created only my own tenant per run (slug `qc-hfssohunt-*`, 2 users each).
- Law rows: before inserting, the script checked that there were 0 foreign ACTIVE rows. It then inserted ACTIVE rows under `qc-hfssohunt-<tag>-*` (p3 and p5 only: the 9 non-OT `LAW_V1_ROWS`) and deleted them in `finally`.
- Every run ended with `RESIDUE none (tenants=1 users=2 activeLaw=0->0)`.
- Not touched: src/, prisma/, scripts/, seed-hr-qc, migrate. I did not commit.

Pre-fix simulation (`toPreFix`): the rows of a run built by the new code are rewritten to what 292bc5b7e stored:
- SSO = the frozen `ssoContribution` (cap 15,000).
- WHT = the frozen `monthlyWhtSatang` (allowance cap 9,000).
- net and totals are recomputed, and `stepsJson` = NULL (no marker).

Pre-fix APPROVED/PAID runs were made with `oldApprove`: status APPROVED, then `postPayrollV1KeyedJV(totals)`, then `journalEntryId`. These are the exact calls the old approveRun makes.

## Probe 1 — pre-fix data, production shape (executed · p1.out)
Fixture: 1 v1 HR system + a book. E1 20,000 · E2 50,000 · E3 12,000 · E4 50,000 (spouse + 2 children). Runs:
- 2026-07 PAID (old JV)
- 2026-08 APPROVED (old JV)
- 2026-10 DRAFT, with a bound +1,000 bonus for E1
- 2026-11 DRAFT
- 2025-11 DRAFT

One live run per period exists, so DRAFT/APPROVED/PAID sit in adjacent 2026 months, not all in 2026-10.

Expected old numbers per run:
- SSO 750+750+600+750 = 2,850/side.
- WHT: E2 431,000 ⇒ 20,600/12 = 1,716.67. E4 600,000−100,000−60,000−60,000−60,000−9,000 = 311,000 ⇒ 8,600 ⇒ 716.67. Total 2,433.34.
- Net 132,000−2,850−2,433.34 = 126,716.66.

Expected new numbers:
- SSO 875×3+600 = 3,225.
- WHT: E2 1,704.17. E4 309,500 ⇒ 8,450 ⇒ 704.17. Total 2,408.34.
- Net 126,366.66.

| invariant | expected | result |
|---|---|---|
| PAID 07 slip (H3.8) E2 | SSO 750 · WHT 1,716.67 | `deductions SSO 75000 · WHT 171667` ✔ |
| SSO110 07 (H3.6) | clamped wages 57,000 · contributions 2×2,850 = 5,700 | `total 5700000 tax 570000 lines 4` ✔ |
| ภ.ง.ด.1 07 | income 132,000 · tax 2,433.34 | `total 13200000 tax 243334` ✔ |
| bank file 07 | Σnet 126,716.66 | `total 12671666` ✔ |
| report payroll-month 07 (H3.9) | 2,850 / 2,850 / 2,433.34 / 126,716.66 | identical ✔ |
| H4.2 labour ACTUAL 07 | 132,000 + 2,850 = 134,850 | `basis ACTUAL cost 13485000` ✔ |
| recompute APPROVED 08 | refused, rows unchanged, no marker | "คำนวณใหม่ได้เฉพาะรอบที่ยังเป็นร่าง" · 285000/243334 · marker null ✔ |
| approve 2026-10 pre-fix DRAFT (with and without exact expect) | RECOMPUTE + exact text · audit ×2 | both `RECOMPUTE` "ต้องคำนวณรอบนี้ใหม่ก่อนอนุมัติ (อัตราประกันสังคมของงวดนี้เปลี่ยน)" · audit 2 ✔ |
| cancel bound bonus (rebuild path) | gross 132,000 · SSO 3,225 · WHT 2,408.34 · net 126,366.66 · marker 1,750,000 | `g 13200000 se 322500 w 240834 n 12636666` + marker ✔ → approve ok · JV 6000 Dr 13,522,500 / 1010 Cr 12,636,666 / 2100 Cr 6,450 / 2130 Cr 2,408.34 ✔ |
| 2026-11 pre-fix: approve → recompute → approve | RECOMPUTE → new numbers + marker → ok | ✔ |
| 2025-11 pre-fix DRAFT | approves unchanged (750 · 2,433.34), no marker | ✔ |
| reverse APPROVED 08 → re-create → approve → pay | reversal = exact mirror of the 750-era JV; new JV at 875; per-account net = new figures only | reversal lines 1010 Dr 12,671,666 · 2100 Dr 570,000 · 2130 Dr 243,334 · 6000 Cr 13,485,000 · net by account 6000 +13,522,500 / 1010 −12,636,666 / 2100 −645,000 / 2130 −240,834 ✔ |
| JV of PAID 07 | unchanged | identical lines ✔ · reversing PAID 07 + re-creating gives a DRAFT at 875 (documented N6) ✔ |

## Probe 2 — mixed 2026-09 run (executed · p2.out)
Employees:
- 1,000 → base 1,650 → 83
- 1,650 → 83 (82.50 rounds up)
- 10,010 → 501
- 15,000 → 750
- 17,500 → 875
- 20,000 → 875
- 50,000 → 875, WHT 1,704.17
- 30,000 not SSO-eligible → SSO 0, WHT 200,000 ⇒ 2,500/12 = 208.33
- joiner 15 Sep, 20,000 → 875 (full month, PARTIAL flag)
- leaver 10 Sep, 17,500 → 875

Expected totals:
- Gross 182,660.
- SSO 5,792/side.
- WHT 1,912.50.
- Net 174,955.50.
- SSO110: 9 lines (non-insured left out), clamped wages 115,810, contributions 11,584.
- ภ.ง.ด.1: 10 lines, 182,660 / 1,912.50.
- JV: 6000 Dr 188,452 = 1010 174,955.50 + 2100 11,584 + 2130 1,912.50.

Result: every item, total, SSO110 (`total 11581000 tax 1158400 lines 9 · NOT_INSURED`), PND1, bank (17,495,550) and the JV are equal to these numbers ✔.

## Probe 4 — approve re-derive edge cases + concurrency (executed · p2.out)
All on a v1 system with F1 50,000 and F2 12,000.

Edge cases:
- (a) SSO right (875) but WHT tampered to the old 171,667 ⇒ `RECOMPUTE` ✔
- (b) SSO old (750) but WHT already new (170,417) ⇒ `RECOMPUTE` ✔
- (c) Post-fix run with +5,000 bonus and −700 deduction ⇒ gross 54,300, SSO and WHT on base ⇒ approves ✔ (no false RECOMPUTE)
- (d) Post-fix DRAFT, wage raised to 60,000 after build ⇒ approves with the stored 50,000 rows. This is existing v1 behaviour, and the new check does not mask it (re-derive uses the snapshot) ✔
- (d2) Pre-fix DRAFT and wage changed:
  - approve ⇒ RECOMPUTE.
  - recompute ⇒ 60,000 / 875 / WHT 720,000−100,000−60,000−10,500 = 549,500 ⇒ 34,925 ⇒ 2,910.42 (291,042) / net 56,214.58 ✔
- (e) Pre-fix run and negative net ⇒ RECOMPUTE first; after recompute ⇒ NEGATIVE_NET ✔ (no masking, no duplicate)

Concurrency: the period advisory lock was held, and `pg_blocking_pids` showed both callers blocked in every case.
- approve∥recompute ⇒ [RECOMPUTE, ok], run at 875 ✔
- recompute∥approve(with the pre-recompute expect) ⇒ [ok, STALE] ✔
- approve∥approve on the recomputed run ⇒ [ok, NOT_DRAFT], 1 JV ✔
- approve∥approve on a pre-fix draft ⇒ [RECOMPUTE, RECOMPUTE], 0 JV, still DRAFT ✔

v2 not subject to RECOMPUTE: I only read this. engineVersion===1 guard at payroll.ts:1145. Oracle D2.7 covers it, and in probe 3 all six v2 approvals succeeded.

## Probe 3 — year boundaries v1 vs v2 (executed · p3.out · own ACTIVE rows = seed 1970/2026/2029/2032 SSO+DEDUCTION, TAX 1970)
Each cell is SSO / WHT in satang for X (50,000) · Y (20,000).

| period · pay date | v1 X | v2 X | v1 Y = v2 Y | hand |
|---|---|---|---|---|
| 2025-12 · 2026-01-05 | 75000/171667 | 75000/171667 | 75000/0 | 750; v1 allowance min(9,000, cap 2026 10,500) = 9,000 ⇒ 1,716.67 |
| 2026-01 · 2026-01-30 | 87500/170417 | 87500/**197778** | 87500/0 | v1 1,704.17 · v2 see N1 |
| 2028-12 · 2029-01-05 | 87500/170417 | 87500/170417 | 87500/0 | period ⇒ 875; 10,500 < 12,000 ⇒ 1,704.17 |
| 2029-01 · 2029-01-31 | 100000/169167 | 100000/**196632** | 100000/0 | v1 1,691.67 · v2 N1 |
| 2031-12 · 2032-01-05 | 100000/169167 | 100000/169167 | 100000/0 | 1,000; 12,000 < 13,800 |
| 2032-01 · 2032-01-30 | 115000/167667 | 115000/**195236** | 100000/0 | 1,150 · 13,800 ⇒ 1,676.67 |

- **SSO: v1 and v2 agree in every period.** The SSO row was picked by wage period, and the v1 markers were 1,500,000/1,750,000/1,750,000/2,000,000/2,000,000/2,300,000 ✔
- v2 WHT allowance followed the pay-date year: projected SSO 1,050,000 for 2028-12 paid 2029, capped by the 2029 row at 12,000 → stays 10,500 ✔
- v1 Dec→Jan continuity: v1 projects every run ×12 on its own, so there is no carried state.

## Probe 5 — opening YTD + SSO (executed · p5.out)
- SSO_HIGH, as of 2026-08-31, 8 months:
  - 6,000 (old cap 8×750) → no warning; 6,001 → no warning (under the old code it would warn)
  - 7,000 (8×875) → no warning; 7,001 → `SSO_HIGH` ✔
- SSO_HIGH, as of 2025-12-31, 12 months: 9,000 → no warning; 9,001 → `SSO_HIGH` ✔
- First v2 run 2026-09 after an opening (400,000 / WHT 13,733.36 / SSO 6,000):
  - Projected SSO 6,000 + 875 + 3×875 = 9,500, below the 10,500 cap, so the actual amount is used.
  - 600,000−100,000−60,000−9,500 = 430,500 ⇒ 20,550.
  - (20,550 − 13,733.36)/4 = 1,704.16.
  - Run result: `projectedSso 950000 · annualTax 2055000 · wht 170416` ✔
- v1 shop with the same opening: v1 ignores openings ⇒ 875 / 170,417 (×12, unchanged by design) ✔

## Probe 6 — non-payroll readers (H4.2 executed in p1/p3 · AI + API only read)
- `laborDay` employer SSO per day for 20,000 + 50,000, both capped:

  | day | days in month | cap | per employee | total | result |
  |---|---|---|---|---|---|
  | 2025-12-15 | 31 | 15,000 | 24.19 | 48.38 | 4838 ✔ |
  | 2026-01-15 | 31 | 17,500 | 28.23 | 56.46 | 5646 ✔ |
  | 2026-02-15 | 28 | — | 31.25 | 62.50 | 6250 ✔ |
  | 2029-01-15 | 31 | 20,000 | 32.26 | 64.52 | 6452 ✔ |

  `lawMissing false` in each case.
- `laborMonth` 2026-02 estimate = 70,000 + 1,750 = 71,750 ✔ (7,175,000)
- ACTUAL for a past month reads the stored 750-era employer SSO (p1: 134,850) ✔
- AI `hr_labor_percent` (ai.ts:206): only read. It forwards to laborDay/laborMonth, which were executed above.
- "API pay report": no HR/payroll route exists under `src/app/api` (v1/m/mobile). Reports.ts `loadReport` was executed in p1 and returns stored amounts.

## Findings
- **None against HF-SSO-2569** (BLOCKER 0 · MAJOR 0 · MINOR 0).
- **N1 (pre-existing · v2 only · not caused by this ticket · MINOR for H3.3/H3.4).**
  - Two v2 runs paid in the same January both get `monthIndex = 1`. The cause is `monthIndex = Number(payDay.slice(5,7))` at payroll.ts:2546.
  - So the second run projects 13 months of income.
  - Repro (p3): 2025-12 paid 2026-01-05, then 2026-01 paid 2026-01-30, X = 50,000.
    - prior: 50,000 / 1,716.67 / SSO 750.
    - Projected income 50,000 + 50,000 + 11×50,000 = 650,000.
    - Projected SSO 750 + 875 + 11×875 = 11,250, capped at 10,500.
    - Net 479,500 ⇒ tax 25,450 ⇒ (25,450 − 1,716.67)/12 = **1,977.78** (got 197,778).
    - v1 gives 1,704.17. The same pattern repeats for 2029 (196,632) and 2032 (195,236).
  - Effect: about 273 ฿/month over-withholding until the December true-up. It shows only for shops that pay the December period in January.
  - Ruling Q2 makes this "Dec period paid in Jan" case explicit, but the projection rule belongs to H3.3 (not live: no ACTIVE v2 rows in prod). For the controller/accountant list.
- **N2 (pre-existing, D5 rule):** in 31-day months at the cap, the per-day labour estimate drifts by +13 satang per employee per month (2,823 × 31 = 87,513 vs 87,500). This is estimate-only and not a payroll amount.

## Executed vs only read
- Executed: everything in probes 1, 2, 3, 4 and 5, and the H4.2 part of probe 6.
- Only read:
  - v2 RECOMPUTE exclusion (payroll.ts:1145, plus oracle D2.7)
  - AI `hrLaborPercent` wrapper
  - API (none exists)
  - `law.ts` loadLawSet `upTo` with ssoDay > onDay (pay date before the period). This was not run. By reading: TAX/DEDUCTION are still picked on onDay by `pickLawRow`.
