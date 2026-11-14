# HF-SSO-2569 — social-security wage ceiling by wage period (mini-brief · oracle `scripts/qc-hr-hf-sso.mts`)

Base `session/hr` 292bc5b7e. Hotfix of engine v1 (live in prod). Out of scope: activating v2 rows, prod deploy (owner GO).

## Law (shark-thai-law · domain-labour-payroll §ซ · test-rules T-HR-08) — quoted, not invented
- Rate ม.33: ลูกจ้าง 5% · นายจ้าง 5% — **[V]**.
- Base (กฎกระทรวง 2568, ใช้บังคับ 1 ม.ค. 2569): "(๑) ตั้งแต่วันที่ ๑ มกราคม พ.ศ. ๒๕๖๙ ถึงวันที่ ๓๑ ธันวาคม พ.ศ. ๒๕๗๑ …ไม่ต่ำกว่าเดือนละหนึ่งพันหกร้อยห้าสิบบาท และไม่เกินเดือนละหนึ่งหมื่นเจ็ดพันห้าร้อยบาท" · (๒) 2572–2574 ≤ 20,000 · (๓) ตั้งแต่ 1 ม.ค. 2575 ≤ 23,000 — **[V]**.
- Rounding ม.46: "เศษ…ตั้งแต่ห้าสิบสตางค์ขึ้นไปให้นับเป็นหนึ่งบาท ถ้าน้อยกว่านั้นให้ปัดทิ้ง" — **[V2]**.
- **Which date decides**: T-HR-08 [V] keys the vectors by **งวด** (wage period): "ประกันสังคม งวด 2569: ค่าจ้าง 20,000 → 875 … งวด ม.ค. 2572 ค่าจ้าง 20,000 → 1,000 โดยไม่แก้โค้ด (แถวตาราง)". The base is a monthly-wage bound ("เดือนละ"), so the month the wage is for decides = `periodKey` (YYYY-MM, Bangkok calendar month). Not the pay date, not "today".
- Today's rounding `Math.round(base×rateBp/10000/100)×100` **already matches** T-HR-08: 10,010 → 501 · 10,009 → 500 · 1,000 → 83 (floor 1,650). No rounding change; nothing for the accountant on rounding.

## R1 — dated table in v1 (`src/lib/modules/hr/payroll-rules.ts`)
- `ssoLawForPeriod(periodKey) → { rateBp: 500, minBaseSatang: 165000, maxBaseSatang }`: `< 2026-01` ⇒ 1,500,000 · `2026-01…2028-12` ⇒ 1,750,000 · `2029-01…2031-12` ⇒ 2,000,000 · `≥ 2032-01` ⇒ 2,300,000. Malformed period (not `^\d{4}-(0[1-9]|1[0-2])$`, non-string, missing) ⇒ throws.
- `ssoContribution(monthlySalarySatang, periodKey, cfg?)` — period is **required** (2nd parameter, type `string`); missing/malformed ⇒ throws. `cfg` (rateBp/minBase/maxBase overrides) keeps working as 3rd parameter. Rounding unchanged. No `?? 15000` default left; no `Date`/`now` in the file (pure).
- Freeze note: payroll-rules.ts is sha-frozen (PAYROLL_RULES_SHA / fitness-hr F16.2 "new rules = new functions + engineVersion"). This hotfix changes it with controller authorisation — the sha pins are ORACLE-EDITs (see note).

## R2 — every v1 caller passes the run's period
- Only src caller: `computeItem` in `payroll.ts` (~474) ← `buildRunRows(tx, ctx, periodKey)` ← `createPayrollRun` and `rebuildDraftRun`/`recomputeDraftRun`. Pass `periodKey` through; no `new Date()`.
- H4.2 `ssoEstimate` (labor.ts:388) already takes `maxBaseSatang` from the ACTIVE law row picked on the estimate day (`ssoLawOf(L, d)`) — no v1 constant; unchanged. `SSO_HIGH` (payroll-opening.ts `ssoWarnings`) reads the ACTIVE row at `asOfDay` — unchanged (ceilings change only on 1 Jan, so the as-of year decides). Both report "law missing / no warning" while rows are DRAFT — unchanged behaviour.
- No other caller (reports, filings, payslip, bank files read stored items).

## R3 — no retroactive change
- APPROVED/PAID runs keep their stored rows (no recompute path exists for them; nothing writes back-contributions or adjustments).
- v1 approve has no input fingerprint today (guard = viewer's expect: net/items/gross/`payrollItemsDigest` of **stored** rows, H0.1 CR16), so a DRAFT built before the fix would approve with 750. Fix: under the run lock, approve re-derives each item's SSO from `snapshot.baseSalarySatang` + `ssoEligible` + the run period's table; any difference ⇒ refuse (ok:false, Thai note, run stays DRAFT, `hr.payroll.approve.refused` audit). `recomputeDraftRun` rebuilds with the table ⇒ approve passes. Code name: controller's choice (oracle accepts any non-OK code).
- A pre-fix DRAFT whose numbers are still right (period < 2026-01, or wage ≤ 15,000) must stay approvable.
- Accountant list: "งวด ม.ค.–พ.ย. 2569 ที่หักด้วยเพดาน 15,000" (employees > 15,000 ฿: 125 ฿/side/month under-deducted) — no automatic back-contribution.

## R4 — v2 law seed (`scripts/hr-seed-law-draft.mts`)
- SSO rows become 4 DRAFT rows: 1970-01-01 (1,500,000 — the existing `v1:SSO` row, byte-identical), 2026-01-01 (1,750,000), 2029-01-01 (2,000,000), 2032-01-01 (2,300,000); same rate/min/rounding. New rows need distinct `sourceKey`s; re-run stays idempotent; `verifyAgainstFrozen()` becomes period-aware. Activation stays with the accountant.
- v2 reads rows by effective date already, **but its day is the pay date** (`law.ts` `lawDayOf(payDate)`, Q1/Q2), not the wage period ⇒ v1 and v2 can differ for a run paid in the next year (e.g. period 2028-12 paid 2029-01-05: v1 875, v2 1,000). Flagged as a question; not changed here.

## R5 — documents/filings/reports
สปส.1-10 (H3.6), reports (H3.7–H3.9), payslips, 50 ทวิ carry what the run stored — no change.

## Open questions (controller)
- Q1 WHT: `monthlyWhtSatang` caps the SSO tax allowance at 9,000 (`SSO_ALLOWANCE_CAP_SATANG`). Reference §ซ says the allowance is "ตามจำนวนที่จ่ายจริง" [V] and T-HR-10 uses "ประกันสังคม 10,500" (= 875×12). Raise/remove the cap in this hotfix? (oracle check S2.6 registered as Q1-dependent.)
- Q2 v2 date rule (pay date) vs v1 (wage period) — align now or later?
- Q3 refusal code for R3 (reuse STALE text, or a new code with its own Thai text?).
