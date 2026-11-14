# HF-SSO-2569 — SSO wage ceiling by wage period (mini-brief rev 2 · oracle `scripts/qc-hr-hf-sso.mts`)

Base `session/hr` 292bc5b7e · hotfix of engine v1 (live) + v2 alignment. Out of scope: activating v2 rows, prod deploy (owner GO).

## Law (shark-thai-law §ซ / §ฌ · T-HR-08 · T-HR-10)
- 5 % / 5 % [V]. Base: "(๑) ตั้งแต่วันที่ ๑ มกราคม พ.ศ. ๒๕๖๙ ถึงวันที่ ๓๑ ธันวาคม พ.ศ. ๒๕๗๑ …ไม่ต่ำกว่าเดือนละหนึ่งพันหกร้อยห้าสิบบาท และไม่เกินเดือนละหนึ่งหมื่นเจ็ดพันห้าร้อยบาท" · (๒) 2572–2574 ≤ 20,000 · (๓) from 1 ม.ค. 2575 ≤ 23,000 [V]. Rounding ม.46 "ตั้งแต่ห้าสิบสตางค์ขึ้นไปให้นับเป็นหนึ่งบาท" [V2].
- **Date rule**: T-HR-08 [V] keys by **งวด** ⇒ the wage period (`periodKey`) decides, not pay date / today.
- Today's rounding already matches T-HR-08 (10,010 → 501 · 10,009 → 500 · 1,000 → 83).
- Tax allowance: "ตามจำนวนที่จ่ายจริง" (ม.47(1)(ฌ)) [V]; T-HR-10 uses 10,500 for 2569.

## Rulings (controller, 14 Nov)
- **Q0** `payroll-rules.ts` stays byte-identical (FREEZE F16.2). New pure file `hr/payroll-rules-sso.ts`: `ssoLawForPeriod(periodKey)` · `ssoContributionForPeriod(wageSatang, periodKey)` · `ssoAllowanceCapSatang(taxYear)` · `monthlyWhtForTaxYear({monthlySalarySatang, ssoEmployeeYearSatang, deductions?}, taxYear)`; missing/malformed period or year ⇒ throws. Old `ssoContribution`/`monthlyWhtSatang`: no caller under src/ (history replay = `scripts/hr-seed-law-draft.mts` verifyAgainstFrozen for the 1970 row, frozen-function tests). engineVersion stays 1; v1 runs built after the fix carry `stepsJson.ssoLaw = {periodKey, maxBaseSatang, rateBp}` (none = pre-fix).
- **Q1** v1 WHT: SSO allowance = amount paid (`ssoEmployeeYearSatang` = 12 × this period's contribution, as today), capped by `ssoAllowanceCapSatang(taxYear)` = Σ of the 12 monthly max contributions of that year (2025 9,000 · 2026–28 10,500 · 2029–31 12,000 · ≥2032 13,800). Tax year = Bangkok year of payDate. Bands start on 1 January, so no tax year straddles a band. v2 has the same 9,000 cap — data in the DEDUCTION law row (`ssoAllowanceCapSatang: 900000`, seed 1970); oracle V2.2 pins the v2 projection on the seed rows (10,500 / 20,450).
- **Q2** v2 picks SSO by the wage period: `law.ts ssoLawDayOf(periodKey)` = first day of the period; `pickLawSet/loadLawSet(…, {ssoDay})`; payroll.ts v2 build passes `ssoLawDayOf(run.periodKey)`. Other kinds keep the pay date. If this is more than a small marked hunk in law.ts/payroll.ts the builder stops and asks.
- **Q3** v1 approve re-derives each stored row's SSO under the run lock; differs ⇒ `{ok:false, code:"RECOMPUTE", note:"ต้องคำนวณรอบนี้ใหม่ก่อนอนุมัติ (อัตราประกันสังคมของงวดนี้เปลี่ยน)"}` + `hr.payroll.approve.refused`. Correct pre-fix drafts (e.g. 2025-11) still approve.
- **Q4** seed SSO rows: `v1:SSO` 1970-01-01 (byte-identical) · `v1:SSO:2569` 2026-01-01 · `v1:SSO:2572` 2029-01-01 · `v1:SSO:2575` 2032-01-01, all DRAFT.

## Requirements
- **R1/R2** live v1 paths on the new functions: run build + recompute (`computeItem` gets periodKey + tax year), approve re-derive, H4.2 estimate (`labor.ts` ceiling from `ssoLawForPeriod`, not the SSO law row), opening-YTD `SSO_HIGH` (`payroll-opening.ts` from `ssoLawForPeriod`). No v1 preview exists outside these.
- **R3** APPROVED/PAID untouched; no automatic back-contribution or adjustment.
- **R4** seed per Q4; `verifyAgainstFrozen()` still ok. Dated DEDUCTION rows for the v2 cap (V2.2) are the builder's choice (not ruled — keys to be asked).
- **R5** สปส.1-10, reports, payslips, 50 ทวิ carry stored amounts.

## For the accountant
- Periods ม.ค.–พ.ย. 2569 already paid with the 15,000 cap: SSO short by up to 125 ฿/side/month for wages > 15,000; WHT allowance capped at 9,000 instead of up to 10,500 (≤ 1,500 ฿ allowance/yr ⇒ ≤ 150 ฿ tax at 10 %). No automatic correction.
- QC golden FROZEN_MONTHLY (period 2030-05) changes: M03 52,000 SSO 750 → 1,000, WHT 916.67 → 891.67; totals `…:220000:220000:97500:10407500:…`.
