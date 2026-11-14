# HF-SSO-2569 — independent review of 4832a5d06 (base 292bc5b7e) · read-only · 14 Nov 2026

**Verdict: MERGE WITH NOTES.** No blocker or major finding. The money arithmetic matches the shark-thai-law reference (§ซ ceiling bands [V], ม.46 rounding [V2], ม.47(1)(ฌ) "ตามจำนวนที่จ่ายจริง" [V], T-HR-08, T-HR-10) in every vector I recomputed by hand. The frozen file is byte-identical. Approved and paid runs are never recomputed.
Further ORACLE-EDIT requests (notes §6): **h1.3 S2.9 = YES · h1.3 X1.1 = YES · h3.4 S4.27 '2031-09-15'→'2031-09-01' = YES.**

## 1. Arithmetic (payroll-rules-sso.ts @4832a5d06)
- Bands (:17-22) are keyed by wage period with a lexical "YYYY-MM" compare: <2026-01 15,000 · 2026-01 17,500 · 2029-01 20,000 · 2032-01 23,000. Floor 1,650 · 5 % · `Math.round(raw/100)*100`. This is the same formula as the frozen `ssoContribution`, compared line by line.
- T-HR-08 by hand (period 2026): 20,000→875 · 17,500→875 · 10,010→500.50→501 · 10,009→500.45→500 · 1,000→base 1,650→82.50→83. Period 2029-01 at 20,000→1,000. ✔
- Boundary checks, by hand:

  | wage | 2025-12 | 2026-01 / 2028-12 | 2029-01 / 2031-12 | 2032-01 |
  |---|---|---|---|---|
  | 1,000 | 83 | 83 | 83 | 83 |
  | 17,500 | 750 | 875 | 875 | 875 |
  | 20,000 | 750 | 875 | 1,000 | 1,000 |
  | 23,000 | 750 | 875 | 1,000 | 1,150 |
  | 30,000 | 750 | 875 | 1,000 | 1,150 |

- Allowance cap (:53-61) = Σ of the 12 monthly maximums: 2025 9,000 · 2026 10,500 · 2029 12,000 · 2032 13,800. ✔
- periodKey handling: `periodOf` (:26-29) throws on a non-string or a malformed value (`/^\d{4}-(0[1-9]|1[0-2])$/`). `taxYearOf` throws on a non-integer. `runLawV1` (payroll.ts:450) calls `ssoLawForPeriod` first, so a bad period throws before any computation. `ssoLawDayOf` (law.ts:52) throws LAW_BAD_DAY. labor.ts / payroll-opening.ts pass `day.slice(0,7)` from validated days (opening is guarded by `isDay`). There is no silent default anywhere. ✔
- Non-monthly runs: none exist. v1 periods are always calendar "YYYY-MM" (PERIOD_RE, periodBounds payroll.ts:547), and the unique index allows one live run per (systemId, periodKey). There is no bi-monthly or weekly v1 run. v2 also uses "YYYY-MM"; DAILY/HOURLY staff are paid inside the monthly run. The band is always the calendar month of the wages. ✔

## 2. WHT
- `monthlyWhtForTaxYear` (:71-87) is the frozen `monthlyWhtSatang` formula with one change: the cap comes from `ssoAllowanceCapSatang(taxYear)` instead of 9,000. The constants are equal to the frozen file. For any tax year ≤ 2025 the result is bit-identical to the frozen function.
- Tax year = `bkkParts(payDate)` year (payroll.ts:452). Create passes input.payDate (:775). Rebuild and cancel-adjustment pass the run's stored payDate (:954-955). Approve passes the stored payDate (:1144-1145).
- T-HR-10 by hand: 600,000 − 100,000 − 60,000 − 10,500 = 429,500. Tax 7,500 + 12,950 = 20,450. 20,450/12 → 170,417 satang = 1,704.17. ✔ (The "remainder in the last period" rule is not implemented. v1 rounds every month: 12 × 1,704.17 = 20,450.04. This gap existed before the fix.)
- Not SSO-eligible: SSO 0 ⇒ allowance 0 (:497, :463). Salary below the floor: base 1,650 → 83/month, allowance 996 (below the cap). ✔
- Mid-year joiner or leaver: v1 always multiplies by ×12 and pays the full month with a PARTIAL_MONTH flag. The T-HR-10 "joiner ⇒ ×9" rule is **not** implemented. This is a v1 gap that existed before; the hotfix did not cause it and did not make it worse. → NOTE N1.
- Wage period in December, paid in January: SSO follows the period and the WHT cap follows the pay-date year. The allowance is min(12 × this month's contribution, cap), so it is counted once and never doubled. Two examples:
  - 2028-12 paid 2029-01: 12×875 = 10,500 < 12,000. The projection is slightly low compared with what will really be paid in 2029 (875 + 11×1,000 = 11,875), so WHT for that one month is slightly high. December/ภ.ง.ด.91 settles the difference.
  - 2025-12 paid 2026-01: 9,000 < 10,500. The result equals the frozen function, so a pre-fix draft of that run still approves.
  - The reference does not state which of these should apply ⇒ [U]. It is correctly listed for the accountant in notes §7.
- Old 9,000 / 15,000 constants: `git grep` over all of src finds them only inside the frozen payroll-rules.ts and in comments. The frozen `ssoContribution`/`monthlyWhtSatang` have **0 importers** (payroll.ts:21 is a comment; payroll-rules-v2.ts:153/160 are comments). UI messages, AI tools and REST code print no "15,000", "750" or "9,000". Filings, reports and payslips read stored item amounts. ✔

## 3. Freeze
- `git diff --stat 292bc5b7e 4832a5d06` does not list payroll-rules.ts. `git diff --quiet` on that file passes, so it is byte-identical (sha 75a66c0c… pinned by 32 checks).
- computeItem body sha recomputed independently with the oracles' segment rule (`function computeItem(` … `\n}\n`): base = b151a83c (control), new = **451c72e1**. This equals the ORACLE-EDIT. ✔
- History replay: viewing a run, the payslip, the 50 ทวิ / ภ.ง.ด.1 / 1ก / สปส.1-10 filings and reverse all read stored rows. No code updates HrPayrollItem after it is created (`git grep hrPayrollItem.update*` = 0). Nothing re-evaluates an APPROVED or PAID run. ✔

## 4. R3 — what happens to existing runs
- APPROVED/PAID: never touched. The approve gate only runs while the status is DRAFT (payroll.ts:1119 NOT_DRAFT comes first).
- DRAFT built before the fix: approve re-derives every stored row from its own snapshot (base · ssoEligible · deductions) under the period lock and the run-row lock (:1141-1148). It runs after STALE and before NEGATIVE_NET. If anything differs, approve refuses with `RECOMPUTE` and the exact text at :1088. approveRun maps it at :1197 and the action at payroll-actions.ts:199. The refusal is audited `hr.payroll.approve.refused` via auditRefusal (:1193). ✔
- Recompute and cancel-adjustment both go through `rebuildDraftRun` → `buildRunRows(…, payDate)`, which writes the new numbers and the marker. ✔
- No false RECOMPUTE: a pre-fix DRAFT for a period < 2026-01 re-derives to the same numbers and approves unchanged. A 2026 draft where every wage is ≤ 15,000 also matches (SSO is the same, and an allowance ≤ 9,000 is below 10,500), so it approves unchanged too. ✔
- Marker: `stepsJson.ssoLaw {periodKey,maxBaseSatang,rateBp}` is written on create (:787) and on every rebuild, merged into the existing stepsJson (:960-963). Old runs have no marker. It is written on the run, not on each item. That is acceptable, but the brief says "item/run". → NOTE N5.
- A run REVERSED and then re-created for a 2026 period gets the new amounts (createPayrollRun → buildRunRows). This is intended, but notes §3/§7 do not say it explicitly. → NOTE N6.

## 5. v2
- law.ts hunks are small and all marked: `ssoLawDayOf` (:52), `opts.ssoDay` in `pickLawSet` (SSO only; other kinds keep onDay), and `loadLawSet` reads up to max(onDay, ssoDay). The payroll.ts v2 build passes `ssoDay: ssoLawDayOf(periodKey)` (:2467). DEDUCTION is still picked by pay date, so the v2 cap follows the pay-date year, consistent with v1. ✔
- Seed: 4 rows in 1970 are byte-identical. The new rows are:
  - SSO 2026-01-01/2029-01-01/2032-01-01, max 1,750,000/2,000,000/2,300,000.
  - DEDUCTION on the same dates, cap 1,050,000/1,200,000/1,380,000.
  - Every other field equals the 1970 row (`datedBehaviour` checks this by shape).
  - All rows are DRAFT, with keys `v1:SSO:2569/2572/2575` and `v1:DEDUCTION:2569/…`. ✔
- Digest/fingerprint: LAW_V1_DIGEST changes 0ed9de8c → b0aa6c9c (seed only). Existing v2 DRAFT runs see INPUTS_CHANGED only if the SSO row picked for their period differs, for example a period that straddles an ACTIVE dated row. That is correct, and recompute fixes it. In prod no v2 rows are ACTIVE, so there is no effect.

## 6. ORACLE-EDITs — re-derived by hand
- FROZEN_MONTHLY (2030-05, cap 20,000):
  - M01 15,000→750 · M02 none, WHT 83.33 · M03 52,000 (spouse + 2 children) SSO 1,000, WHT 624,000−100,000−60,000−60,000−60,000−12,000 = 332,000 → 10,700 → 891.67 · M04 9,000→450.
  - Gross 16,250+30,500+51,200+9,300 = 107,250.
  - SSO 2,200/2,200 · WHT 975 · net 104,075.
  - ⇒ `10725000:220000:220000:97500:10407500:475000:100000` ✔
- h1.3 S5.8 (30,000 @ 2033-04): SSO 1,150. WHT 186,200 → 1,810 → 150.83. Old 191,000 → 2,050 → 170.83. Net (with R01's +2,000) 31,079.17 → 30,699.17. ✔ (Digests not re-hashed.)
- PR-4.2 (2026-07, payDate 2026-07-25): 875 · 189,500 → 1,975 → 164.58 · net 28,960.42. ✔ The check still asserts all 3 values exactly.
- RN-3 (2026-08, 30,000): ssoBase 1,750,000. ✔
- h3.4-ytd S3.14 (2031-09, eV single): SSO 1,000 · 188,000 → 1,900 → 158.33 = 15,833. Cert 153,747 − 17,083 + 15,833 = 152,497. ✔ It uses the new literal V1_2031; LIT.v1Monthly stays for the frozen pure check.
- computeItem sha 451c72e1 ✔ (see §3).
- Seed: 10 rows, digest-all for S2.5. The 1970 digest is kept for S2.2/h3.3 S1.6 (fixture byte-frozen).
- Weakening: no golden was replaced by a looser assertion. Two minor loosenings are noted below (M1).

## Findings
- **MINOR M1** — The statics accept *any* line or hunk tagged HF-SSO:
  - qc-hr-h3.7.mts:229 drops every `// HR HF-SSO` line from the frozen v1 approveRun block. H3.7's own rule allows exactly ONE byte-exact marked line.
  - h3.2 S1.8, h3.4-lib, h3.6, h3.9 and set-1 use regexes that accept any hunk tagged HF-SSO.
  - Suggestion: pin h3.7 to exactly one line (the RECOMPUTE line). The rest follow the pre-authorised pattern.
- **MINOR M2** — Activation hazard for v2: if a platform admin activates only the 1970 SSO/DEDUCTION rows (the old H1.3 plan), v2 runs for 2026+ use 15,000/9,000. v1 is unaffected because its bands are in code. The runbook should say: activate the dated rows together with the 1970 rows.
- **MINOR M3** — The approve RECOMPUTE gate also runs for engineVersion 2 runs that have no inputDigest (`runEngineVersion` :2729-2733 routes them to v1). It would re-derive v2 rows with v1 rules. These runs exist only as H3.1 QC data; there are none in prod.
- **NOTE N1** — v1 existing gaps, not regressions: joiner ×9 (T-HR-10 / ป.96 ข้อ 1(1)) · last-period remainder · December true-up. Unchanged by this fix.
- **NOTE N2** — H4.2 labour estimate (labor.ts:340) and the opening-YTD SSO_HIGH warning (payroll-opening.ts:216) no longer read the SSO law row. Shops without ACTIVE rows (all prod shops) now *see* an SSO estimate or warning where before they got lawMissing or silence. This is intended by R2; tell the owner.
- **NOTE N3** — v1 future bands live in code (SSO_BANDS), not in the table. T-HR-08 "no code change" holds only for v2. The law is fully specified up to 2575+, so this is acceptable.
- **NOTE N4** — Typo in the oracle note: PR-4.2 "net 2,912,917" should be 2,907,917 (29,079.17). The code computes it by formula, so there is no effect.
- **NOTE N5** — The marker sits on the run's stepsJson only (it is exposed in the run detail DTO :3174). Harmless.
- **NOTE N6** — Add to the accountant list: a reversed and re-created 2026 run gets the new amounts. Also add that late contributions carry a surcharge of 2 %/month on the unpaid amount (ม.49 [V] in §ซ).

## 7. Production effect (for the owner and accountant)
**What changes on deploy (no migration):** every v1 DRAFT and every future v1 run with wage period ≥ 2026-01 (ม.ค. 2569):
- SSO ceiling 17,500 (from 2572: 20,000; from 2575: 23,000).
- Employee and employer each pay up to +125 ฿/month when the wage is ≥ 17,500, or 5 % × (wage − 15,000) for wages between 15,000 and 17,500. Example: 16,000 → +50.
- WHT is a little lower because the allowance cap rises 9,000 → 10,500.
- A draft made before the deploy whose numbers differ refuses approval with "ต้องคำนวณรอบนี้ใหม่ก่อนอนุมัติ (อัตราประกันสังคมของงวดนี้เปลี่ยน)" until "คำนวณใหม่" is pressed.

Worked examples (single, SSO-eligible, 2569 period paid in 2569):

| monthly wage | SSO each side old → new | WHT old → new | employee net old → new | employer cost |
|---|---|---|---|---|
| 20,000 | 750 → 875 | 0 → 0 (net income 71,000 → 69,500, below 150,000) | 19,250 → 19,125 (−125) | +125/month |
| 50,000 | 750 → 875 | 1,716.67 → 1,704.17 (431,000→20,600 ⇒ 429,500→20,450 tax/yr) | 47,533.33 → 47,420.83 (−112.50) | +125/month |

**Unchanged:** APPROVED/PAID/REVERSED runs and their payslips, JV, 50 ทวิ, ภ.ง.ด.1/1ก and สปส.1-10 (stored amounts). Runs for periods ≤ ธ.ค. 2568. Employees with wage ≤ 15,000.

**Not done:** no back contributions and no adjustment for periods ม.ค.–พ.ย. 2569 already paid at the 15,000 cap. The shortfall is up to 125 ฿/side/month, i.e. up to 1,375 ฿/side/employee over 11 months. Late-payment surcharge ม.49: 2 %/month on the employer's unpaid amount [V]. Whether to file a correction with สปส. and whether to recover the employee share is the shop's and accountant's decision. The WHT allowance for those months was capped at 9,000 (≤ 150 ฿ tax/yr); year-end settles it.

**Still [U]:** the WHT projection when a period is paid in the next year (Dec → Jan) · OT/bonus in the SSO base · the 3 % southern-province rate (expired, not implemented) · the T-HR-10 joiner ×9 and last-period remainder (v1 existing gap).

## Not run
No heavy jobs, QC suites or typecheck were run. All checks above are by hand or with read-only git. One check used a one-line sha of the `git show` output.
