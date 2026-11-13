# H3.4-YTD — opening year-to-date per employee · H3.7 oracle gaps

> **DRAFT r0 — §9 defaults apply unless the controller rules.** Lane 3 · **MONEY + PDPA** ⇒ reviewer + hunter. **Mig** `20270110000001_hr_opening_ytd` (1 table, additive; Q11). Base `session/hr` aa380f6b0 · branch `wip/hr-h3.4-ytd` · oracle `scripts/qc-hr-h3.4-ytd.mts` (+ lib helpers) + ORACLE-EDIT `qc-hr-h3.7.mts` (part B). Law: shark-thai-law `domain-labour-payroll §ฌ`, `common-withholding-tax §7`.

## 1. Facts (aa380f6b0)
F1 v2 prior = APPROVED/PAID items in SHARK only (`payroll.ts:2457-2500` → `ytdPriorV2` `payroll-rules-v2.ts:400`; tax year = BKK payDay year) → `whtYtdV2` (`:227`): WHT = (annual tax − prior WHT) ÷ (k+1), k = 12 − m, ≥ 0.
F2 `input.prior` is inside `inputDigest` (`:2573-2579`); approve recomputes ⇒ `INPUTS_CHANGED` (`:2825`).
F3 H3.6: every annual figure goes through `yearFigures` (`filings/service.ts:528` = `runsIn` FOR SHARE + `loadItems` + `itemFigures`) → 50 ทวิ issue `:580`, bulk `:641`, list + `stale` `:704/:712`, candidates `:772`. ภ.ง.ด.1ก `:385-399` → `buildPnd1` (`rd.ts:227`) sums `FilingItem`s per person. Monthly ภ.ง.ด.1/สปส.1-10 use a month window.
F4 H3.9: `taxRows` (`reports.ts:460`) sums `itemsOf` by BKK payDate; `payrollYearRows` (`:449`) by periodKey.
F5 v1 WHT = `monthlyWhtSatang` ×12, no YTD (FREEZE). SSO allowance cap 9,000 ฿ (v1 const; v2 law row in H3.4 fixtures).
F6 No rehire path (rehire = new `HrEmployee` row). H3.8 not in base.

## 2. Scope
In: opening YTD of **this employer** for pay before the employee's first SHARK run of a tax year (40(1) income, WHT, employee SSO, months) · v2 projection · missing-opening warning · 50 ทวิ, ภ.ง.ด.1ก, cert `stale`, candidates, H3.9 `tax-year` · single + table (bulk) entry · part B.
Out: **previous employer** (Q1). Por.96/2543 annualises this employer's periods ("start 1 April ⇒ 9") [V §ฌ]. It does not say that a new employer projects another employer's pay [U → accountant A1]. 50 ทวิ shows what *this* payer paid/withheld [V §7], so mixing would corrupt 50 ทวิ/1ก. The employee settles on ภ.ง.ด.90/91. CSV import (D2).

## 3. Contract
R1 **Migration** (marked `HR H3.4-YTD` hunks: `payroll.prisma`, `hr.prisma` back-relation, `core/scope.ts` `sys()`, `hr-qc-env.mts` + delete order): `HrPayrollOpeningYtd {id, tenantId, systemId, employeeId → HrEmployee RESTRICT, taxYear INT 2000–2400, asOfDay DATE (last pay day covered), months INT 0–12, incomeSatang/whtSatang/ssoSatang INT ≥ 0, CHECK wht ≤ income, CHECK year(asOfDay) = taxYear, rev INT ≥ 1, createdById, createdAt, supersededAt?, supersededById?}`. UNIQUE (systemId, employeeId, taxYear, rev) + partial UNIQUE (systemId, employeeId, taxYear) WHERE supersededAt IS NULL (raw SQL). **Append-only**: edit = supersede + insert rev+1, clear = supersede. Re-take qc-hr-h0.1 S4.2. Migrate first, then deploy. No data ⇒ no behaviour change.
R2 **Pure** `hr/payroll-opening-rules.ts` (type-only imports; no db/clock): `OPENING_TEXT` · `parseOpening(raw, {taxYear, todayBkk})` (safe ints ≤ 2^31−1, months ≤ month(asOf), asOf in the year and ≤ today) · `withOpening(prior, opening|null, {onDay})` (adds only when same year and asOf < onDay) · `openingMissing({payDay, periodKey, startDay|null, hasOpening, hasEarlierRun})` = ¬hasOpening ∧ ¬hasEarlierRun ∧ max(startDay ?? 0, 1 Jan) < `<P>-01` · `openingFilingItem(o)` → `FilingItem{runId "opening:<id>", engineVersion 2, runStatus APPROVED, payDate asOf, income, tax = wht, ssoEmployee = sso, other 0}`.
R3 **Service** `hr/payroll-opening.ts` + `-actions.ts`: `listOpeningYtd(ctx, v, {taxYear})` → rows `{employeeId name code startDay state(SET|MISSING|NOT_NEEDED) opening{asOfDay months incomeSatang whtSatang ssoSatang rev}|null locked}` · `saveOpeningYtd(ctx, v, {employeeId, taxYear, asOfDay, months, incomeSatang, whtSatang, ssoSatang, expectRev|null}, {now?})` → `{ok, rev, warnings}` · `saveOpeningYtdBulk(ctx, v, {taxYear, rows ≤ 300})` all-or-nothing · `clearOpeningYtd(ctx, v, {employeeId, taxYear, expectRev})` · internal `openingsInTx`. Refusals `{ok:false, code, reason}` with fixed text: `NO OWN FIELDS WHT_OVER AS_OF OVERLAP CERT_ISSUED REV_CHANGED YEAR`. `OVERLAP` = a non-REVERSED run (any engine/status) of that year with payDay ≤ asOf holds the employee. `CERT_ISSUED` = live 50 ทวิ (Q4). Warning `SSO_HIGH` = sso > months × law max (none without a law set; Q13).
R4 **Locks** (`hr:ytd` always last): save/clear `hr50:<sys>:<emp>:<year>` (ascending) → `hr:ytd:<sys>:<year>` · create/rebuild/approve (v1+v2) P → run row → `hr:ytd` · 50 ทวิ `issueOne` hr50 → `hr:ytd` (new hunk).
R5 **`payroll.ts` hunks:** (a) `buildRunV2InTx`: `prior = withOpening(ytdPriorV2(…), opening, {onDay})` ⇒ inside the digest. (b) `snapshotJson.ytdOpening = {id, rev}` or `"MISSING"` or null. **Not** in `flags`/`ytdJson`/pure input, so H3.4 vectors and digests stay byte-identical without openings. (c) v1 + v2 create: included employee with a live asOf ≥ payDay ⇒ `OPENING_OVERLAP` (Q5). (d) Preview (payroll viewers only): review `{employeeId, name, day:null, code:"YTD_OPENING"}`, live for DRAFT, from the snapshot after approve. **Not blocking** (Q3). Pure engine files frozen.
R6 **`filings/service.ts` hunk:** `yearFigures` and the PND1A path append `openingFilingItem` per live opening (persons include them). 50 ทวิ totals/tax/SSO, `stale`, candidates and 1ก include the opening. Opening-only people are listed (Q6). **Monthly ภ.ง.ด.1 and สปส.1-10 never include it.** `rd/sso/figures/cert` frozen.
R7 **`reports.ts` hunk:** `tax-year` adds income/wht/ssoEmployee and months += opening.months, + fixed note. Other reports unchanged (Q7).
R8 **Gate** read + write = H3.6 `gate` (DB Membership accepted, role = passed role, `bankGateOf` on both; `[]` = all branches). Non-OWNER on own row ⇒ `OWN`. Everyone else incl. the employee ⇒ `NO` (identical bytes). No self view.
R9 **Privacy:** DTO keys exactly R3. No ID/bank. Never in the manager preview, outbox, AI or events.
R10 **Audit:** `hr.payroll.opening.save {employeeId, taxYear, rev, by ONE|BULK}` (bulk: one per row, same tx) · `.clear {employeeId, taxYear, rev}` · `.refused {code}` for OVERLAP/CERT_ISSUED. **No ฿.** Amounts live in the superseded rows; items point to `{id, rev}`.
R11 No JV for openings (booked before SHARK). H3.7 untouched.

## 4. UI (CONTROLLER-RUN visual)
`hr/payroll-opening-ui.tsx` card "ยอดยกมาต้นปี (ก่อนใช้ระบบ)" on the payroll page (`page.tsx` hunk), gate holders only: year select · employee table with badge (ต้องกรอก/กรอกแล้ว/ไม่ต้องกรอก) · inputs asOf, months, income, WHT, SSO (฿ → satang on the server) · button "ไม่มีรายได้ก่อนใช้ระบบ" (saves zeros) · one "บันทึกทั้งหมด" (bulk) · locked rows read-only "ออก 50 ทวิ แล้ว — ยกเลิกใบก่อนแก้". Review item `YTD_OPENING` (`payroll-run-ui.tsx`) links to `#hr-ytd-card`. testids `hr-ytd-card -year -row-<id> -zero-<id> -save-<id> -bulk-save -alert` (`role="alert"`). `hr.ytd.*` th = en, ≥ 44 px, tokens, inventory `wo:"H3.4-YTD"`.

## 5. Files
New: migration · `payroll-opening-rules.ts` · `payroll-opening.ts` · `payroll-opening-actions.ts` · `payroll-opening-ui.tsx`.
Hunks `HR H3.4-YTD ▸ … ◂`: `payroll.ts` · `filings/service.ts` · `reports.ts` (+ `reports-rules.ts` text) · `payroll-run-ui.tsx` · payroll `page.tsx` · prisma ×2 · `core/scope.ts` · `hr-qc-env.mts` · messages th/en · inventory · `hr/index.ts` · `qc-hr-h3.7.mts` (part B only).
**Frozen:** `payroll-rules.ts` (sha) · `payroll-rules-v2.ts` · `payroll-run-rules.ts` · `payroll-journal-rules.ts` · `filings/*` except `service.ts` · `bank-files/**` · `account/**` · `law*` · `privacy*` · `self*` · `approval/**` · `outbox-consumers.ts` · seed · fixtures · other oracles · `package.json`.

## 6. Oracle `qc-hr-h3.4-ytd.mts`
SKIP while the pure file is absent. H3.4 QC law rows (SSO 875 ฿ from 2031-01-01, 1,000 ฿ from 2031-10-01, allowance cap 9,000 ฿). No residue.
**Worked example** (30,000 ฿/month, single). Full year: 360,000 − min(180,000; 100,000) − 60,000 − min(10,500; 9,000) = 191,000 ⇒ (191,000 − 150,000) × 5 % = **205,000 sat**. v1 monthly = round(205,000/12) = 17,083. Opening Jan–Aug: income 24,000,000 · WHT 8 × 17,083 = **136,664** · SSO 8 × 87,500 = 700,000 · months 8 · asOf 2031-08-31.
A1 Pure Sept (k=3), no opening: projected 12,000,000 − 6,000,000 − 6,000,000 − 350,000 < 0 ⇒ **0** (control).
A2 Pure Sept with the opening: projected 36,000,000; SSO 1,050,000 → 900,000; net 19,100,000; tax 205,000; (205,000 − 136,664) ÷ 4 = **17,084**. Same as the v1-history result (hr-H3.7 notes).
A3 DB run 2031-09, start 2030-01-01: with the opening ⇒ WHT 17,084, `ytdOpening {id, rev:1}`. Without ⇒ 0 + review `YTD_OPENING`, create not refused.
A4 Catch-up: Sept approved at 0, then the opening is saved (allowed). Oct: (205,000 − 136,664) ÷ 3 = 22,778.67 ⇒ **22,779** · Nov (205,000 − 159,443) ÷ 2 ⇒ **22,779** · Dec **22,778** · Σ = 205,000. The Sept item is unchanged.
A5 Opening WHT 0 ⇒ Sept 205,000 ÷ 4 = **51,250**.
A6 DRAFT Sept, then opening saved ⇒ approve `INPUTS_CHANGED`, nothing written → rebuild ⇒ 17,084 → approve ok. Zero opening on a DRAFT ⇒ digest equal, warning gone, approve ok.
A7 `OVERLAP` (asOf 09-30 vs DRAFT/APPROVED Sept run, payDay 09-25); a REVERSED run does not count; v1/v2 create with payDay ≤ asOf ⇒ `OPENING_OVERLAP`.
A8 BKK boundary: payDate `2031-12-31T16:59:59Z` uses the 2031 opening · `…T17:00:00Z` (2032 BKK) does not (prior 0) · asOf 2032-01-01 for 2031 ⇒ `AS_OF` · future asOf ⇒ `AS_OF`.
A9 Negative / non-int / string ⇒ `FIELDS` · WHT > income ⇒ `WHT_OVER` · months > month(asOf) ⇒ `FIELDS` · SSO 1,000,000 with 8 months ⇒ saved + `SSO_HIGH`, and A2 is still 17,084 (allowance cap).
A10 rev1 → edit ⇒ rev2, rev1 kept intact · stale expectRev ⇒ `REV_CHANGED` · clear ⇒ no live row · a second live insert fails (partial unique).
A11 50 ทวิ 2031 = items + opening (A4 year: 36,000,000 / 205,000) · live cert ⇒ save `CERT_ISSUED` · void ⇒ save ok ⇒ re-issue has the new total.
A12 1ก 2031 line includes the opening; an opening-only leaver (left 2031-05) is listed · ภ.ง.ด.1 2031-08 and สปส.1-10 bytes identical with/without openings.
A13 H3.9 `tax-year` includes the opening + note · `tax-month`/`payroll-year` rows identical.
A14 Engine-v1 shop: save ok · new v1 WHT 17,083 (golden) · 50 ทวิ/1ก include the opening.
A15 Viewer matrix (COMMON C2) on list/save/bulk/clear: owner ✓, gate holder (read+pay, `[]`) ✓. Explicit unit list · payroll viewer without pay · manager · staff with an HR key · plain member · the employee themself · other tenant · passed role ≠ DB role ⇒ `NO`, identical bytes, nothing written. Non-owner own row ⇒ `OWN`.
A16 DTO keys exact · no ฿ in audits or the manager preview.
A17 Audits as in R10 · a refused bulk writes none.
A18 Statics: frozen files identical · hunks marked · pure has no db/clock · tx client only inside tx.
Races (COMMON §F): A19 save ∥ create: the item holds `{id, rev}` of the saved row, or approve ⇒ `INPUTS_CHANGED` · A20 save ∥ 50 ทวิ issue: the cert includes it, or save ⇒ `CERT_ISSUED` · A21 two saves with the same expectRev ⇒ one ok, one `REV_CHANGED`, one live row · A22 bulk ∥ single: serial, no deadlock.
**Part B** (ORACLE-EDIT S4.35, mark `// ORACLE-EDIT (H3.4-YTD B)`): B1 claim deducted 2031-09 + same employee in an APPROVED finalized 2031-11 run, no 2031-10 run ⇒ giveBack 2031-10 `PERIOD` and `giveBackPeriodOf` = `2031-12`. Control without the 11 run ⇒ 2031-10 accepted. RED: a scratch copy without `(win.lastCovered && p <= win.lastCovered)` (not committed) → `wo-notes/hr-H3.4-YTD-red.txt`. B2 the same `brl` on an employee of `uBr` ⇒ `ok:true` (cleaned up). B3 `reversedRun` asserts `code === "NO"`.

## 7. Run list (builder)
Migration (qc4.sh) → generate → pure → service → payroll.ts → filings → reports → UI → `qc-hr-h3.4-ytd` ×3 → `qc-hr-h3.7` (after B) · `qc-hr-h3.4` · `qc-hr-h3.6` · `qc-hr-h3.9` · `qc-hr-h1.1` · `qc-audit-trail` · `qc-hr-h0.1` (S4.2) · `qc-hr-h3.3` · `qc-hr-h3.5` · `qc-payroll` · `qc-payroll-reverse` · `qc-hr-payadjust` · `qc-crm-c3.3` · `qc-hf-hr-privacy` · fitness ×2 · picker extras → one typecheck (iso.sh). qc-hr-h3.4 pins hit ⇒ ORACLE-EDIT.

## 8. Debts · accountant
D1 previous employer · D2 CSV import · D3 H3.8 `yearTotals` must add the opening (Q12) · D4 YTD across rows of a rehired person (Q14) · D5 v1 stays ×12 · D6 DAILY/HOURLY with NA-11 · D7 leaver true-up NA-12.
Accountant [U]: A1 may/must the projection include a previous employer's 50 ทวิ? · A2 is one combined annual line (pre-system + SHARK) right on 1ก/50 ทวิ? · A3 pre-go-live leaver: on this year's 1ก, and who issues the 50 ทวิ? · A4 is an entered SSO above 9,000 ฿ simply capped?

## 9. QUESTIONS FOR THE CONTROLLER [default · reason]
Q1 Previous-employer income? [Out · not this payer's 50 ทวิ/1ก data; basis [U].]
Q2 Openings in v1 shops? [Store; used by filings/reports only · v1 WHT frozen, 50 ทวิ still needs them.]
Q3 Missing opening: warn or block? [Warn + one-click zero · a block breaks H3.4 fixtures and new hires.]
Q4 Edit with a live 50 ทวิ? [Refuse `CERT_ISSUED`; void first · issued certs match the data.]
Q5 Overlap guard on v1 create? [Yes · otherwise 50 ทวิ double-counts.]
Q6 Opening-only people in 1ก/candidates? [Include · 1ก lists everyone paid in the year.]
Q7 Reports that add the opening? [`tax-year` only · the others are run registers.]
Q8 Who reads/writes? [H3.6 filing gate on the DB membership, not own row · the same people who issue 50 ทวิ.]
Q9 Bulk? [One table form, ≤ 300 rows, all-or-nothing; no CSV · smallest UI.]
Q10 History? [Append-only rev rows; audits without ฿ · PDPA rule, still reconstructable.]
Q11 Migration name? [`20270110000001` · H3.8 holds `…10000000`; additive, order-free.]
Q12 H3.8 slip-history = 50 ทวิ rule? [Amend H3.8 to add an "ยอดยกมา" line · else its S3.7 fails once an opening exists.]
Q13 SSO plausibility? [Warning only · the allowance is capped anyway.]
Q14 Rehire = new row? [Out; never enter old-row pay as opening · double count with the old 50 ทวิ.]
Q15 Missing rule? [no opening ∧ no earlier run ∧ max(start, 1 Jan) < run period start; unknown start ⇒ warn · never warns in January.]

## CONTROLLER RULINGS (13 Nov 23:1xZ) — all 15 questions: the drafter's default is ACCEPTED, with these additions
- Q12: the "ยอดยกมา" line in the H3.8 slip history is done **inside this ticket** (marked `HR H3.4-YTD` hunk in the H3.8 files + marked ORACLE-EDIT of qc-hr-h3.8 S3.7), not by amending H3.8. The builder therefore starts only after H3.8 is merged into session/hr; the oracle writer may start now on aa380f6b0 and must not depend on H3.8 files existing (S-checks about the slip history are added by the builder round as an authorised ORACLE-EDIT).
- Q1 / Q14: accountant list items (previous-employer income; rehire) — add to the AC list in the notes.
- Q3: warning only; never blocks approve. The zero opening is an explicit, audited act by a filing-gate holder.
- Part (b) (qc-hr-h3.7 S4.35 additions + `reversedRun` code === "NO") = authorised ORACLE-EDIT, marked `ORACLE-EDIT (H3.4-YTD · controller ruling)`.
