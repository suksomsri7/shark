# HF-SSO-2569 — oracle note rev 2 (`scripts/qc-hr-hf-sso.mts` · brief `ledger/hr-briefs/hr-brief-HF-SSO.md`)

Branch `wip/hr-hf-sso` from `session/hr` 292bc5b7e. Oracle only. Rev 2 applies controller rulings Q0–Q4 (14 Nov).

## Hand-worked literals
- Ceiling/max per side: <2026-01 15,000/750 · 2026-01…2028-12 17,500/875 · 2029-01…2031-12 20,000/1,000 · ≥2032-01 23,000/1,150 · floor 1,650 ⇒ 82.5 ⇒ 83.
- WHT allowance cap per tax year = Σ 12 monthly max (bands start 1 Jan, so all months equal): 2025 9,000 · 2026–28 10,500 · 2029–31 12,000 · 2032+ 13,800.
- WHT 50,000/month, single: 600,000 − 100,000 − 60,000 − SSO ⇒ 2025 431,000 ⇒ 20,600 ⇒ 1,716.67 · 2026 (T-HR-10) 429,500 ⇒ 20,450 ⇒ 1,704.17 · 2029 428,000 ⇒ 20,300 ⇒ 1,691.67 · 2032 426,200 ⇒ 20,120 ⇒ 1,676.67 (Math.round satang).
- No "straddle" WHT vector: no tax year straddles an SSO band (bands start 1 Jan). A period/pay-date straddle (2028-12 paid 2029-01-05) is pinned for SSO only; its WHT projection (12×875 vs the 2029 table) is not given by the reference ⇒ not pinned (D1.3/D1.5 E6 WHT = null).
- v2 (V2.2): month 1 of 2026, 50,000: projected income 60,000,000 · SSO 87,500×12 = 1,050,000 · net 42,950,000 · tax 2,045,000 · WHT 2,045,000/12 ⇒ 170,417. Base gives 171,667 (DEDUCTION row cap 900,000).
- D1 shop E1 20,000 · E2 10,010 · E3 1,000 · E4 23,000 · E5 20,000 (no SSO) · E6 50,000; gross 12,401,000. SSO totals / WHT / net: 2025-12 283,400 / 171,667 / 11,945,933 · 2026-03 320,900 / 170,417 / 11,909,683 · 2028-12 320,900 / – · 2029-01 358,400 / 169,167 / 11,873,433 · 2031-12 358,400 / – · 2032-01 388,400 / 167,667 / 11,844,933. Marker `stepsJson.ssoLaw = {periodKey, maxBaseSatang, rateBp 500}`.
- D2 (20,000): pre-fix 1,500,000/75,000/75,000/net 1,925,000 → recompute 1,750,000/87,500/87,500/1,912,500. Pre-fix = toPreFix() (base row shape, no marker).

## Checks — 40 (RED 31 · GREEN 9). Base forced: 9/40 pass, BASE-EXPECTATION 40/40, RESIDUE none (`hr-HF-SSO-red.txt`). Targeted tsc exit 0.
GREEN controls: S1.2 (payroll-rules.ts sha 75a66c0c…) · S1.7 · S1.8 · P2.3 / P2.7 (frozen functions unchanged) · P3.2 · D2.1 · D2.6 · Z1. D1.1 is now RED (marker). V2.* are pure on the seed rows held in memory as ACTIVE — no law rows written in the shared DB.

## Older suites — ORACLE-EDITs under the rulings (28 check ids, was 49)
**Must change — goldens for periods ≥ 2026-01 (12 ids)**
- qc-hr-lib.mts:398 FROZEN_MONTHLY (2030-05; h2.2 S7.2 · h2.9 X1 · h3.4 S8.1): M03 52,000 (spouse, 2 children) SSO 750 → 1,000, WHT 916.67 → 891.67 (335,000 → 332,000 net income; cap 2030 12,000). totals `10725000:195000:195000:100000:10430000:475000:100000` → `10725000:220000:220000:97500:10407500:475000:100000`; digest 72166a3e… → recompute.
- Local copies of the same: qc-hr-h1.1.mts:130,132 S6.5 · qc-hr-h1.2.mts:180,181 S5.6 · qc-hr-h1.3.mts:197,198 S5.1/S5.2 · qc-hr-h2.1.mts:127,128 S8.6.
- qc-hr-h1.3.mts:128,129 FROZEN_PATH_REVERSE/_CONVERGE (30,000 @ 2033-04) S5.8: SSO 750 → 1,150; WHT 170.83 → 150.83 if single (360,000 − 100,000 − 60,000 − 13,800 = 186,200 ⇒ 1,810); digests recompute.
- qc-payroll.mts:76-77 PR-4.2 (30,000 @ 2026-07): `B(750)` → `B(875)`, `whtSatang === 17083` → `16458` (189,500 ⇒ 1,975 ⇒ 164.58), net 2,912,917 → 2,896,042 (label 29,079.17 → 28,960.42).
- qc-hr-payadjust.mts:114 RN-3 (2026-08): ssoBaseSatang 1,500,000 → 1,750,000 (label 15,000 → 17,500).
- qc-hr-h3.4-ytd.mts:505-519 S3.14 (v1 run 2031-09, 30,000): item WHT 17,083 → 15,833 (188,000 ⇒ 1,900 ⇒ 158.33), cert/ภ.ง.ด.1ก tax 153,747 → 152,497 — verify eV is single and SSO-eligible. Use a new literal; do NOT change `LIT.v1Monthly` (qc-hr-h3.4-ytd-lib.mts:38, also used by the pure check at :214 on the frozen function).
**Must change — code pins (4 ids)**: computeItem body sha b151a83c… (computeItem gets period + tax year): h0.1:55 S4.2 · h0.2:127 S5.1 · h0.6:69 S8.4 · h1.3:113 S5.6. ⚠ edit h0.6 constants at :68-69 only (h1.3 hashes the h0.6 S8.4 block text).
**Must change — seed consumers (12 ids, Q4 keys)**: h1.3:170 BRIEF_ROWS + AST derive :445-447 S2.2 · h1.3:558 S2.3 (frozen ssoContribution vs LAW_V1_ROWS grid ⇒ compare the 1970 row only, dated rows vs ssoContributionForPeriod) · h1.3:126 FROZEN_LAW_DIGEST S2.5 · h1.3:1345-1350 S2.4 (4 → 7 rows, keys `v1:SSO:2569/2572/2575`) · h1.3 S2.6 ("unchanged 4" → 7) · h1.3:1366 S2.7 (tamper key) · h1.3:1856 S7.1 · h1.3:1876 S7.4 · h1.3:1337 S2.1 (verify only) · h3.3:51 S1.6 (fixture `_meta.lawDigest`; fixture is byte-frozen by h3.4/h3.4-ytd ⇒ fix oracle side) · h3.3:485-491 S8.1 · h3.3:559-561 S8.3. If dated DEDUCTION rows are added for V2.2, these counts grow again. scripts/hr-expected.json (`HrLawTable.v1: 4`, ssoEmployee 727400) ⇒ reseed (controller).
**Stay (no edit)**: all 32 payroll-rules.ts sha pins + fitness-hr F16.2 (file frozen) · frozen-function tests qc-payroll PR-1.1–1.4, PR-3.1, h3.3 S2.2/S5.4, h3.4-ytd-lib:214 · h3.4 S8.2 (15,000 salary) · h3.4-ytd S3.9 (1,000,000 > 8 × 100,000 still warns) · h4.2 (own law rows, dates 2026-12…2028-02 = table 17,500/5 %; recheck after labor.ts moves to the table) · self-comparing / ≤ 15,000 / stored-row suites (qc-payroll-reverse, h0.1 S7.3/S8.x, h0.2, h0.6, h0.7, h3.1, h3.2, h3.5–h3.9, h2.10, h4.6, seed-hr-qc P-checks).

## Open
- Dated DEDUCTION seed rows (keys) if the builder fixes the v2 cap through data (V2.2) — not ruled.
- h1.3 S5.8 / h3.4-ytd S3.14 WHT values assume single employees — builder verifies against the fixture.
