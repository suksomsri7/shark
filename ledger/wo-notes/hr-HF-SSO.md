# HF-SSO-2569 — builder notes (SSO wage ceiling by wage period + SSO tax allowance as actually paid)

Tree `/root/projects/shark-hr-l3` · branch `wip/hr-hf-sso` from `session/hr` 292bc5b7e (oracle rev 2 55555fa96) · brief `ledger/hr-briefs/hr-brief-HF-SSO.md` (rulings Q0–Q4) · oracle `scripts/qc-hr-hf-sso.mts` (40 checks, unchanged) · green `hr-HF-SSO-green.txt`.

## 0. Checkpoint
- done: product fix d3e70774e + markers 54d049420 · ORACLE-EDITs 0c3414c8a · notes 4832a5d06 · review round 6a1a0e0f8 (RECOMPUTE v1-only · h1.3 S2.9/X1.1 · h3.4 S4.27 · h3.7 S1.7 one-line pin · hf-sso D2.7) · merge of session/hr dace682c8 044f64a0d · law rows applied + reseed on the lane DB (§2) · full run (§5).
- open: controller items in §6 (lane-DB law rows + reseed · ORACLE-EDIT requests h1.3 S2.9/X1.1 + h3.4 S4.27 · merge of session/hr at the gate).

## 1. What changed where (product)
| file | change |
|---|---|
| `src/lib/modules/hr/payroll-rules-sso.ts` (new, pure, imports only `./payroll-rules`) | `ssoLawForPeriod(periodKey)` (bands by wage period: <2026-01 15,000 · 2026-01..2028-12 17,500 · 2029-01..2031-12 20,000 · ≥2032-01 23,000 · floor 1,650 · 5 %) · `ssoContributionForPeriod(wage, periodKey)` (same rounding as the frozen `ssoContribution`, re-written — not called) · `ssoAllowanceCapSatang(taxYear)` = Σ 12 monthly max contributions (2025 9,000 · 2026–28 10,500 · 2029–31 12,000 · 2032+ 13,800) · `monthlyWhtForTaxYear(input, taxYear)` = frozen `monthlyWhtSatang` formula with that cap. Missing/malformed period/year ⇒ throw. |
| `src/lib/modules/hr/payroll-rules.ts` | **not touched** (sha 75a66c0c…). |
| `src/lib/modules/hr/payroll.ts` (v1, marked `HR HF-SSO`) | imports of `ssoContribution`/`monthlyWhtSatang` removed · `computeItem(profile, law)` uses `ssoContributionForPeriod(base, law.periodKey)` + `monthlyWhtForTaxYear(…, law.taxYear)` · `runLawV1(periodKey, payDate)` (tax year = Bangkok year of payDate via `bkkParts`) · `buildRunRows(tx, ctx, periodKey, payDate)` — callers `createPayrollRun` (input.payDate) and `rebuildDraftRun` (run.payDate; used by recompute + cancel-bound-adjustment) · `stepsJson.ssoLaw = {periodKey, maxBaseSatang, rateBp}` on create and on every v1 rebuild (merged into existing stepsJson) · approve (`claimApproveExpected`, under period lock + run row lock, after the STALE check): every stored row re-derived from its snapshot (base · ssoEligible · deductions) ⇒ SSO base/employee/employer or WHT differ ⇒ `RECOMPUTE` + `APPROVE_RECOMPUTE` text + `hr.payroll.approve.refused` audit (rows without a numeric `snapshot.baseSalarySatang` cannot be re-derived and are not blocked — none written by v1 code) · v2 build passes `{ ssoDay: ssoLawDayOf(run.periodKey) }` to `loadLawSet`. |
| `src/lib/modules/hr/payroll-actions.ts` | one marked line: `RECOMPUTE` ⇒ return the service's fixed Thai note (otherwise the UI would show "already approved"). |
| `src/lib/modules/hr/law.ts` (marked) | `ssoLawDayOf(periodKey)` = `YYYY-MM-01` (throws on bad period) · `pickLawSet(rows, onDay, kinds?, {ssoDay?})` picks SSO on ssoDay, other kinds on onDay · `loadLawSet(onDay, db?, {ssoDay?})` reads rows up to max(onDay, ssoDay) and forwards. `setPayrollEngine` presence check keeps `lawDayOf(now)` (not a computation). |
| `src/lib/modules/hr/labor.ts` (H4.2) | `ssoLawOf(d)` = `ssoLawForPeriod(d.slice(0,7))` (no SSO law-row pick; `pickLawRow` import dropped) — `ssoEstimate` gets that ceiling. |
| `src/lib/modules/hr/payroll-opening.ts` | `SSO_HIGH`: per-month max from `ssoLawForPeriod(asOfDay.slice(0,7))` (no `loadLawSet`/SSO row read). |
| `scripts/hr-seed-law-draft.mts` | LAW_V1_ROWS 4 → 10 (grouped by kind, then date — same order the oracles read from the DB): + `SSO` 2026-01-01/2029-01-01/2032-01-01 (max 1,750,000/2,000,000/2,300,000) + `DEDUCTION` same dates (ssoAllowanceCapSatang 1,050,000/1,200,000/1,380,000; every other field = 1970 row) · 4 1970 rows byte-identical · `lawSourceKey()` ⇒ `v1:SSO` (1970) / `v1:SSO:2569` / `v1:SSO:2572` / `v1:SSO:2575` / `v1:DEDUCTION:2569…` · `verifyAgainstFrozen()` = AST + behaviour on the 1970 rows vs payroll-rules.ts, + dated rows vs payroll-rules-sso.ts · dated rows get their own note text. LAW_V1_DIGEST (all 10 rows) 0ed9de8c… → b0aa6c9c…. All rows DRAFT. |

Live v1 callers converted: run build (create) · recompute · cancel-bound-adjustment rebuild · approve re-derive · H4.2 `ssoEstimate` caller (labor.ts) · opening-YTD `SSO_HIGH`. No v1 preview exists (`previewPayrollRunV2` = stored rows). Frozen `ssoContribution`/`monthlyWhtSatang`: **no caller under src/** (S1.1). Legitimate history-replay callers (scripts only): `scripts/hr-seed-law-draft.mts` behaviour leg (1970 rows) · frozen-function tests (qc-payroll PR-1.x/PR-3.x · qc-hr-h1.3 S2.3 · h3.3 · h3.4-ytd-lib:214 · qc-hr-hf-sso P2.3/P2.7).
Filings / reports / payslip / bank files: untouched — they carry stored amounts (S1.8).

## 2. Migration / seed
- **No migration.** No `prisma migrate`/`db push` run. After the merge: `prisma generate` · `prisma migrate status` = "226 migrations found · Database schema is up to date!" (H4.5 migration applied by the controller).
- Law rows (review round, lane DB free): `hr-seed-law-draft.mts` dry-run "จะสร้าง 6 · มีอยู่แล้วตรงกัน 4 · ไม่ตรง 0" · `--apply` "created 6 · unchanged 4 · mismatched 0" · law digest b0aa6c9c77a4d8f13e0c5af7bd08a122f210b65c23353aa0c04cdb84d1bcce25.
- `seed-hr-qc` 34/34: paid run 2026-10 net ฿172,416.42 · 11 people · `HrLawTable.v1` 4 → 10 · `ssoEmployee`/`ssoEmployer` 727,400 → 789,900 (+5 × 125 ฿) · hr-expected.json sha 23728923… (not committed).

## 3. Production runbook note
No migration. Deploy changes SSO and WHT for every DRAFT and every future v1 run whose wage period is ≥ 2026-01 (ceiling by wage period; WHT allowance cap by Bangkok year of pay date). APPROVED/PAID/REVERSED runs are never recomputed or altered; no back-contribution or adjustment is written. A DRAFT built before the deploy whose numbers no longer match refuses approval with `RECOMPUTE` ("ต้องคำนวณรอบนี้ใหม่ก่อนอนุมัติ (อัตราประกันสังคมของงวดนี้เปลี่ยน)") until "คำนวณใหม่" is pressed. Optional after GO: `hr-seed-law-draft.mts` (dry-run, then `--apply`) adds the 6 dated DRAFT rows (no effect until a platform admin activates rows).
**v2 law activation (whenever it happens):** the dated SSO and DEDUCTION rows (`v1:SSO:2569/2572/2575` · `v1:DEDUCTION:2569/2572/2575`) must be activated **together with** the 1970 rows — activating only the 1970 rows makes v2 use the 15,000 ceiling and the 9,000 allowance cap for 2026+ periods.

## 4. ORACLE-EDITs (all marked `ORACLE-EDIT (HF-SSO-2569 · controller ruling)` or `… later-ticket static, pre-authorised`) — every value re-derived here; all equal the oracle note
| # | file:check | old → new | derivation |
|---|---|---|---|
| 1 | qc-hr-lib FROZEN_MONTHLY (h2.2 S7.2 · h2.9 X1 · h3.4 S8.1) | digest 72166a3e… → f7966f99… · totals `10725000:195000:195000:100000:10430000:475000:100000` → `10725000:220000:220000:97500:10407500:475000:100000` | period 2030-05 ⇒ ceiling 20,000 · M03 52,000 (spouse, 2 children) SSO 750 → 1,000 · WHT: 624,000 − 100,000 − 60,000 − 60,000 − 60,000 − 12,000 = 332,000 ⇒ 7,500 + 3,200 = 10,700 ⇒ 891.67 (was 335,000 ⇒ 916.67) · M01 750 · M04 450 · M02 none/83.33 unchanged · digest recomputed from the 4 item lines (control: same method on the old lines = 72166a3e…) |
| 2–5 | local copies h1.1 S6.5 · h1.2 S5.6 · h1.3 S5.1/S5.2 · h2.1 S8.6 | same | same |
| 6 | h1.3 S5.8 FROZEN_PATH_REVERSE / _CONVERGE | 6e0e7a3d… → 411a19fb… · f2ff11ea… → c4394e6b… | R01 single, 30,000 @ 2033-04 ⇒ SSO 1,150 · WHT 360,000 − 100,000 − 60,000 − 13,800 = 186,200 ⇒ 1,810 ⇒ 150.83 · net 30,699.17 · trail checked; control: substituting the old 3 numbers into the new trail hashes to the old two digests |
| 7 | qc-payroll PR-4.2 | `B(750)` → `B(875)` · 17083 → 16458 · net label 29,079.17 → 28,960.42 | 2026-07 ⇒ 875 · 360,000 − 100,000 − 60,000 − 10,500 = 189,500 ⇒ 1,975 ⇒ 164.58 (e1 single) |
| 8 | qc-hr-payadjust RN-3 | ssoBase 1,500,000 → 1,750,000 (label 15,000 → 17,500) | period 2026-08, base 30,000 ⇒ 17,500 |
| 9 | qc-hr-h3.4-ytd S3.14 (+ title) | item WHT 17,083 → 15,833 · cert/ภ.ง.ด.1ก tax 153,747 → 152,497 (new literal `V1_2031`; `LIT.v1Monthly` untouched) | eV fixture `personalDeductionJson {spouse:false, children:0}`, ssoEligible true ⇒ single · 2031-09 ⇒ SSO 1,000 · 360,000 − 100,000 − 60,000 − 12,000 = 188,000 ⇒ 1,900 ⇒ 158.33 · 136,664 + 15,833 |
| 10–13 | computeItem body sha: h0.1 S4.2 · h0.2 S5.1 · h0.6 S8.4 (constant line only) · h1.3 S5.6 | b151a83c… → 451c72e1… | re-taken with the oracles' own segment rule (`function computeItem(` … `\n}\n`); control: same rule on 55555fa96 = b151a83c… |
| 14 | h1.3 FROZEN_LAW_DIGEST (S2.5) | new const FROZEN_LAW_DIGEST_ALL b0aa6c9c… used by S2.5 (exported + DB digest of 10 rows); FROZEN_LAW_DIGEST 0ed9de8c… kept for S2.2 (4 AST rows) | canonical JSON of the 10 rows (independent Python; control: the 4 old rows = 0ed9de8c…) |
| 15 | h1.3 BRIEF_ROWS + S2.2 | script rows = BRIEF_ALL (4 1970 rows + BRIEF_ROWS_DATED 6) | Q4 + Q1 |
| 16 | h1.3 S2.3 | frozen behaviour on 1970 rows only (explicit) + dated leg: SSO rows vs `ssoContributionForPeriod` (first/last period) · DEDUCTION cap vs `ssoAllowanceCapSatang` | — |
| 17–18 | h1.3 S2.4 · S2.6 | 4 → 10 rows · keys incl. `:2569/:2572/:2575` · created/unchanged 10 | — |
| 19–20 | h1.3 S7.1 · S7.4 | `HrLawTable.v1` 4 → 10 · 4 → 10 v1 DRAFT rows | RED until §6.1 is done on the lane DB |
| 21 | h3.3 S1.6 | seed digest compared on the 4 1970 rows (`seed.lawDigest(1970 rows)` = 0ed9de8c… = fixture `_meta.lawDigest`) — fixture untouched | — |
| — | verify only, no edit needed | h1.3 S2.1 · S2.7 · h3.3 S8.1 · S8.3 pass unchanged | — |
| 22 | h1.3 X7.1 (pre-authorised static) | + `2026-01-01`, `2029-01-01` to the allowed early literals (law band dates in BRIEF_ROWS_DATED) | — |
| 23 | h3.2 S1.8 (pre-authorised static) | `/HR H\d|HR-SET-\d/` + `|HR HF-SSO` (law.ts hunks) | — |
| 24 | h3.4-lib S1.6 (pre-authorised static) | laterOnly regex + `|HR HF-SSO` | — |
| 25 | h3.6 S1.6 (pre-authorised static) | laterMarked regex + `|HF-SSO` | — |
| 26 | h3.7 S1.7 (pre-authorised static) | v1 approveRun frozen block ignores the one `// HR HF-SSO` line (RECOMPUTE → fixed note) | — |
| 27 | h3.9 S1.5 (pre-authorised static) | laterMark + `/HF-SSO/` | — |
| 28 | set-1 S1.6 (pre-authorised static) | law.ts: unchanged OR every hunk carries `HR HF-SSO` on an added line | — |
| 29 | h1.3 S2.9 (controller ruling, review round) | seed rows 4 → 10 | Q4 + Q1 |
| 30 | h1.3 X1.1 (controller ruling, review round) | 4 rows · 4+0/0+4 → 10 rows · 10+0/0+10 | Q4 + Q1 |
| 31 | h3.4 S4.27 law leg (controller ruling, review round) | activated SSO copy `'2031-09-15'` → `'2031-09-01'` | Q2: SSO picked on the wage period's first day |
| 26′ | h3.7 S1.7 (review MINOR) | the drop is pinned to exactly one byte-exact line (`if (claimed.code === "RECOMPUTE") … // HR HF-SSO ◂`), only when it occurs once | — |
| 32 | qc-hr-hf-sso + D2.7 (review MINOR · one assertion) | new GREEN-control: a pre-fix 2026-04 run marked engineVersion 2 (no inputDigest) is not refused with RECOMPUTE (re-derive is v1-only) | 41 checks |

h4.2 / h4.3 after the merge (H4.2-FIX1 S7.1–S7.4 · H4.3): **no golden changes.** h4.2 estimates already used 17,500 (its own QC SSO rows 2026-12…2028-02 = the table for 2027: e.g. S7.1 30,000/month ⇒ 1,000 + 875/30 = 1,029.17/day = 102,917) and its ACTUAL figures read run rows the fixture inserts directly (75,000 employer SSO stored, not computed). h4.3 compares the AI tools' output with the readers' own output (no SSO literal).

Every hunk of this ticket (src + scripts, `git diff -U0 292bc5b7e`) carries `HF-SSO` on an added line (checked with a scratch script), so the base-aware frozen statics accept them.

Ids from the note that needed no edit: h1.3 S2.1, S2.7 (tamper key `v1:SSO`-style key still the 1970 key) · h3.3 S8.1, S8.3 · (h0.6 constants edited at the constant line only).

## 5. Runs — see `hr-HF-SSO-green.txt`
**Review round (merged head, lane DB with H4.5 migration, law rows applied, reseeded):** every suite 100 % (hf-sso 41/41 forced ×3 + unforced · qc-payroll · reverse · payadjust · all h0.*–h4.* present · set-1 · h3.4-ytd · account-cpa · audit-trail · hf-hr-privacy · ai-tools · ai-proposals · fitness/fitness-hr both modes) except **h0.5 67/71** (S6.2/S6.4/S6.5/S6.7 — the oracle spawns the PIN backfill through `scripts/qc4.sh`, i.e. QC4, while its fixture is on this lane DB; outside this ticket). h3.4/h3.4-ytd crashed once in r5 (foreign ACTIVE law rows at activation), residue of that run removed, re-run green. Clean typecheck 461 s.
ORACLE-EDIT 33: qc-hr-h4.3 S1.6/S1.7 (later-ticket static, pre-authorised): files/oracles whose every hunk carries `HF-SSO` count as a later ticket's change; `HR HF-SSO` added to the S1.7 mark list (labor.ts).
Earlier (pre-review) summary below.
- qc-hr-hf-sso 40/40 forced ×3 + unforced, RESIDUE none.
- Green: qc-payroll 19/19 · qc-payroll-reverse 14/14 · payadjust 27/27 · h0.1 67/67 · h0.2 58/58 · h0.6 55/55 · h1.1 81/81 · h1.2 73/73 · h2.1 90/90 · h2.2 60/60 · h2.4 68/68 · h2.9 58/58 · h3.1 58/58 · h3.2 64/64 · h3.3 51/51 · h3.4-ytd 44/44 · h3.5 53/53 · h3.6 62/62 · h3.7 68/68 · h3.8 78/78 · h3.9 60/60 · h4.2 53/53 · set-1 25/25 · account-cpa 107/107 · audit-trail 21/21 · hf-hr-privacy 194/194 · fitness 54/54 + fitness-hr 9/9 (env and no env) · typecheck clean.
- Not green: h1.3 58/63 (S6.1 pre-existing on base · S2.9/X1.1 ORACLE-EDIT requested · S7.1/S7.4 need lane-DB law rows + reseed) · h3.4 84/85 (S4.27 ORACLE-EDIT requested) · seed-hr-qc not run (§6.1).
- Merge of session/hr 8fd6f7dc4: clean, but P2021 `hrLineLink` on this lane DB (privacy G-2…GA-3, h0.6 S10.x) ⇒ reset; merge at the gate.

## 6. For the controller
1. (DONE in the review round, lane DB free) **Lane DB law rows + reseed:** h1.3 S7.1/S7.4 and `seed-hr-qc` ML1 need the 6 new `v1:*` DRAFT rows on the DB (`hr-seed-law-draft.mts --apply`) and a reseed; the seeded paid run is period 2026-10, so a reseed with this code also changes the shared `qc-hr-v2` tenant's SSO/WHT (expected.json ssoEmployee 727400 changes). Doing either from this lane would break l4's runs on base code (its h1.3 S7.4 / seed ML1 expect 4 rows; its hr-expected.json would go stale) ⇒ left for the gate.
2. (APPROVED and applied in the review round) **ORACLE-EDIT request (outside the note's list) — h1.3 S2.9 and X1.1:** both count the seeded rows (`rows1.length === 4`; `created 4` / `unchanged 4` / `nX === 4`) — direct consequence of Q4/Q1 (10 rows). Proposed hunks: S2.9 `rows1.length === 4` → `rows1.length === 10`; X1.1 `c.created !== 4` → `!== 10`, `c.unchanged !== 4` → `!== 10`, `nX === 4` → `nX === 10` (+ titles). Not applied (instruction: ask).
3. (APPROVED and applied in the review round) **ORACLE-EDIT request (outside the list) — h3.4 S4.27 "law" leg:** the fixture activates a copy of the SSO row effective `2031-09-15` and expects the 2031-09 v2 draft to refuse with INPUTS_CHANGED. Under ruling Q2 the SSO row is picked on the wage period's first day (2031-09-01), so a row effective mid-period no longer belongs to that run ⇒ the approve succeeds (correct per Q2) and the rest of S4.27 then sees NOT_DRAFT. Proposed hunk (qc-hr-h3.4-lib.mts S4.27): `'2031-09-15'::date` → `'2031-09-01'::date` (row in force from the period's first day ⇒ still a law activation the run must notice). Not applied.
4. h1.3 S6.1 `payroll.ts+4` is pre-existing on 292bc5b7e ("HR H3.4" matched inside "HR H3.4-YTD"); fixed on session/hr by fb6b4fd06 (exact tag matching). My hunks add 0 tracked tokens (no `HR HF-SSO` declaration needed).

## 7. Accountant list (not in the reference ⇒ not implemented)
- Periods ม.ค.–พ.ย. 2569 already paid/approved with the 15,000 cap: SSO short by up to 125 ฿ per side per month for wages > 15,000; no automatic back-contribution — the shop decides with สปส.
- WHT allowance for those months used the 9,000 cap instead of up to 10,500 (≤ 1,500 ฿ allowance/yr ⇒ ≤ 150 ฿ tax at 10 %); December/ภ.ง.ด.91 settles — no automatic adjustment.
- Next-year pay date: a period paid in the next calendar year (e.g. 2028-12 paid 2029-01-05) uses SSO of the wage period and the WHT projection of the pay-date tax year (today's behaviour, 12 × this period's contribution capped by that year's cap). The reference does not state the rule ⇒ kept, to confirm.
- QC golden FROZEN_MONTHLY (2030-05) changed: M03 SSO 750 → 1,000, WHT 916.67 → 891.67.
- A v1 run for a 2026+ period that is reversed and re-created (or a pre-fix DRAFT that is recomputed) gets the new amounts (17,500 ceiling, 10,500 allowance cap) — the difference vs what was paid earlier is the shop's to settle.
- Contributions for ม.ค.–พ.ย. 2569 paid short (15,000 cap): whether สปส. charges a late/short surcharge and how much — **[U]**, ask สปส./the accountant (the reference has the ม.49 wording of 2556 only, marked as possibly amended).
- Pre-existing v1 gaps NOT fixed by this ticket: a mid-year joiner's WHT is still annualised ×12 (not by remaining months); the annual rounding remainder is not placed in the last period.
- Visible numbers change for shops: the labour-cost estimate (H4.2) uses the period ceiling (17,500 for 2026–2028) and the opening-YTD `SSO_HIGH` warning uses the period ceiling of the as-of month.
- The 3 % temporary rate (Dec 2568 – May 2569, 9 southern provinces, reference §ซ [V2]) is not implemented (expired; no per-shop province rule in v1).
