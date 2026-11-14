# HF-SSO-2569 — oracle note (`scripts/qc-hr-hf-sso.mts` · brief `ledger/hr-briefs/hr-brief-HF-SSO.md`)

Branch `wip/hr-hf-sso` from `session/hr` 292bc5b7e. Oracle only — no src/prisma change.

## Law basis (shark-thai-law)
- domain-labour-payroll §ซ: rate 5 %/5 % [V]; base 1,650–17,500 for 1 ม.ค. 2569–31 ธ.ค. 2571, ≤ 20,000 for 2572–2574, ≤ 23,000 from 1 ม.ค. 2575 [V]; rounding "ตั้งแต่ห้าสิบสตางค์ขึ้นไปให้นับเป็นหนึ่งบาท" [V2].
- **Date rule**: T-HR-08 [V] keys by **งวด** ("งวด 2569 … งวด ม.ค. 2572 ค่าจ้าง 20,000 → 1,000 โดยไม่แก้โค้ด") ⇒ the wage period (`periodKey`) decides. Checked by D1.3/D1.5 (period 2028-12 / 2031-12 paid in the next January keep the old ceiling).
- Rounding today = `Math.round(base×bp/10000/100)×100` ⇒ already matches T-HR-08 (10,010 → 501 · 10,009 → 500 · 1,000 → 83). No rounding change.

## Hand-worked literals
- Ceiling/max per side: <2026-01 15,000/750 · 2026-01…2028-12 17,500/875 · 2029-01…2031-12 20,000/1,000 · ≥2032-01 23,000/1,150. Floor 1,650 ⇒ 82.5 ⇒ 83.
- D1 shop: E1 20,000 · E2 10,010 · E3 1,000 · E4 23,000 · E5 20,000 (not SSO). WHT = 0 for all (largest net income 23,000×12 − 100,000 − 60,000 − 9,000 = 107,000 < 150,000) ⇒ independent of Q1. Gross 7,401,000 satang.
  - 2025-12: SSO 75,000 · 50,100 · 8,300 · 75,000 · 0 = 208,400 ⇒ net 7,192,600
  - 2026-03 / 2028-12: 87,500 · 50,100 · 8,300 · 87,500 = 233,400 ⇒ 7,167,600
  - 2029-01 / 2031-12: 100,000 · 50,100 · 8,300 · 100,000 = 258,400 ⇒ 7,142,600
  - 2032-01: 100,000 · 50,100 · 8,300 · 115,000 = 273,400 ⇒ 7,127,600
- D2 (one employee 20,000): pre-fix row 1,500,000/75,000/75,000/net 1,925,000; after recompute 1,750,000/87,500/87,500/net 1,912,500.
- P2.5 (Q1): 50,000×12 = 600,000 − 100,000 − 60,000 − 10,500 = 429,500 ⇒ 7,500 + 12,950 = 20,450 ⇒ /12 = 170,416.67 ⇒ 170,417 (base gives 171,667 because of the 9,000 cap).
- "Pre-fix" simulation (toPreFix): run created on the code under test, then items rewritten to base shape (clamp 1,650…15,000, base snapshot keys, ssoEmployeeYearSatang = 12×sso, ytdJson NULL, lawRowIds {}, run inputDigest/stepsJson NULL, totals re-summed). 2026-01 is then set APPROVED directly (no JV).

## Checks (33: RED 23 · GREEN 10) — run on base unforced and QC_FORCE=1: 10/33, BASE-EXPECTATION 33/33, RESIDUE none (`hr-HF-SSO-red.txt`)
RED reasons on base: single-arg call payroll.ts:474 (S1.1) · `?? 15000 * BAHT` default, no table, no ssoLawForPeriod (S1.2, P2.1, P2.2) · every 2026+ vector = 750 (P1.2–P1.6, P2.4, D1.2–D1.6) · cfg as 2nd arg (P2.3) · 9,000 cap (P2.5, Q1) · seed has 1 SSO row (P3.1, P3.3) · v1 approve accepts the stale DRAFT, no refusal audit, recompute then refused as NOT_DRAFT (D2.2–D2.5 chained).
GREEN controls: S1.3–S1.6 · P1.1 · P3.2 · D1.1 · D2.1 · D2.6 · Z1.
Typecheck: targeted tsc over the oracle (temp tsconfig, removed) exit 0.

## ORACLE-EDITs the builder will need (controller authorisation) — 49 check ids over 27 sites
(a) direct `ssoContribution(` calls (7): qc-payroll.mts:43-44 PR-1.1 (20,000 → 750 only with a pre-2026 period; or re-pin 875 for 2026) · :45 PR-1.2 (add period, 500) · :46 PR-1.3 (add period, 83) · :47 PR-1.4 (cfg moves to 3rd arg; 450 pre-2026) · qc-hr-h1.3.mts:558 S2.3 (grid vs LAW_V1_ROWS — dated evaluator) · qc-hr-h3.3.mts:255 S2.2 (v2 15k fixture vs v1 — pass a pre-2026 period) · qc-hr-h3.3.mts:308 S5.4 (pass a pre-2026 period).
(b) v1 runs with pinned SSO (10):
- qc-hr-lib.mts:398 FROZEN_MONTHLY (2030-05; used by h2.2 S7.2, h2.9 X1, h3.4 S8.1): M03 52,000 750 → 1,000; totals `10725000:195000:195000:100000:10430000:475000:100000` → `10725000:220000:220000:100000:10405000:475000:100000`; digest 72166a3e… → recompute.
- local copies of the same: qc-hr-h1.1.mts:130,132 S6.5 · qc-hr-h1.2.mts:180,181 S5.6 · qc-hr-h1.3.mts:197,198 S5.1/S5.2 · qc-hr-h2.1.mts:127,128 S8.6.
- qc-hr-h1.3.mts:128,129 FROZEN_PATH_REVERSE/_CONVERGE (30,000 @ 2033-04): 750 → 1,150/side, net −400 per run; digests recompute (S5.8).
- qc-payroll.mts:76 PR-4.2 (30,000 @ 2026-07): `B(750)` → `B(875)`, net 2,912,917 → 2,895,417 (label 29,079.17 → 28,954.17).
- qc-hr-payadjust.mts:114 RN-3 (30,000 @ 2026-08): ssoBaseSatang 1,500,000 → 1,750,000 (label 15,000 → 17,500).
- qc-hr-h3.4.mts S8.2 money "1500000/75000/…" uses 15,000 salary ⇒ unchanged (checked).
(c) payroll-rules.ts freeze (32 ids, 13 constants 75a66c0c…): fitness-hr.mts:284 F16.2 · qc-hr-lib.mts:52 (h2.2 S7.1, h2.5 S9.5, h2.6 S1.7, h2.9 S1.5, h2.10 S9.1, h2.11 S13.1, h3.1 S11.1, h3.2 S1.8, h3.3 S1.1, h3.4 S1.6, h3.4-ytd S1.5, h3.5 S1.5, h3.6 S1.6, h3.8 S1.6, h3.9 S1.5, h4.1 S1.5, h4.4 S15.1, h4.6 S14.1, set-1 S1.6) · local copies h0.1:53 S4.2, h0.2:128 S5.2, h0.6:68 S8.4, h0.7:72 S7.4, h1.1:88 S6.6, h1.2:91 S5.8, h1.3:111 S5.5/S5.6, h2.1:78 S8.7, h2.3:343 S8.5, h2.4:349 S12.2, h2.7:338 S11.1. Plus computeItem body sha b151a83c…: h0.1:55 S4.2 · h0.2:127 S5.1 · h0.6:69 S8.4 · h1.3:113 S5.6. ⚠ edit h0.6 constants at :68-69 only — h1.3 S5.6 hashes the h0.6 S8.4 block text.
(d) hr-seed-law-draft consumers (12): h1.3:170 BRIEF_ROWS + AST derive :445-447 S2.2 · h1.3:126 FROZEN_LAW_DIGEST S2.5 · h1.3:1345-1350 S2.4 (4 → 7 rows, key scheme, 1970 sentinel) · h1.3 S2.6 ("unchanged 4") · h1.3:1366 S2.7 (tamper key) · h1.3:1856 S7.1 · h1.3:1876 S7.4 · h1.3:1337 S2.1 (verify only) · h3.3:51 S1.6 (fixture `_meta.lawDigest` — fixture is byte-frozen by h3.4/h3.4-ytd, fix on oracle side) · h3.3:485-491 S8.1 · h3.3:559-561 S8.3. scripts/hr-expected.json (`HrLawTable.v1: 4`, ssoEmployee 727400) goes stale ⇒ reseed (controller).
(e) H4.2: none (own ACTIVE rows).
Unaffected (checked): qc-payroll-reverse, h0.1 S7.3/S8.x, h0.6, h3.2, h3.7 S4.20/S4.25, h3.4-lib S4.31 (self-compare); h0.2, h0.7, h3.1, h4.6 (≤ 15,000); h3.4-ytd S3.14 (WHT capped); h2.10/h3.5/h3.6/h3.8/h3.9 (rows inserted, never recomputed); seed-hr-qc P-checks (self-compare).
If Q1 (SSO tax allowance = paid) is adopted: WHT of high earners in 2026+ periods drops (e.g. FROZEN_MONTHLY M03 52,000 @ 2030 — recompute WHT too).

## Questions
- Q0 freeze: fitness-hr F16.2 says "new rules = new functions + engineVersion". This hotfix edits payroll-rules.ts in place (needed for "no silent 15,000 default") — controller ruling.
- Q1 SSO tax-allowance cap 9,000 vs reference "ตามจำนวนที่จ่ายจริง" [V] / T-HR-10 10,500 — in this hotfix? (P2.5 strike-able).
- Q2 v2 picks law rows by pay date (law.ts lawDayOf) vs wage period here — align?
- Q3 refusal code/text for R3 (oracle accepts any non-OK code with a Thai note).
- Q4 seed sourceKey scheme for the 3 new SSO rows (1970 row must stay `v1:SSO`, byte-equal).
