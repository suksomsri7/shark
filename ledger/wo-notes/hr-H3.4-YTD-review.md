# H3.4-YTD — independent review (read-only) · commit 39bb24e18 vs 1725eb106

Reviewer: Claude (Opus 5.5) · 14 Nov 2026 · I read the code with `git show 39bb24e18:` (not the working tree). Contract = brief + RULINGS 1/2 + oracle readings.
**Verdict: MERGE WITH NOTES.** I found no BLOCKER or MAJOR. Condition: OE-1 is written in the ruled form (see 7) and that run is green.

## 1. Tax arithmetic — sound
- Entry point: `payroll.ts:2527-2530`, `prior = withOpening(ytdPriorV2(priorRows), opening, {onDay: payDay})`. `withOpening` (`payroll-opening-rules.ts:60-64`) adds the opening once, only for the same BKK payDay year and only when asOf < payDay. Prior runs come only from APPROVED/PAID items, so DRAFT runs never count.
  The opening sits inside `input`, so it is part of `inputDigest`. All values are integer satang. The only rounding is in the frozen `whtYtdV2` (`payroll-rules-v2.ts:245`, `roundDivHalfUp(due, k+1)`, and `due ≤ 0 ⇒ 0`).
  An over-withheld opening therefore gives 0, never a negative amount. The divisor depends only on the payDay month (k = 12 − m) and is not affected by a late opening.
- Catch-up check by hand: Oct 68,336 ÷ 3 = 22,778.67 ⇒ 22,779 · Nov 45,557 ÷ 2 = 22,778.5 ⇒ 22,779 (half-up) · Dec ÷ 1 = 22,778 · Sept 0 + 136,664 + 22,779 + 22,779 + 22,778 = 205,000 ✓.
  Projected income in Oct = 24,000,000 + 3,000,000 + 3,000,000 × 3 = 36,000,000 ✓. SSO goes through the engine's allowance cap: 1,000,000 + 350,000 ⇒ 900,000 ⇒ still 17,084 ✓.
- Zero remaining periods: a December payDay has k = 0, so the full remainder is withheld in December. An employee with only an opening and no runs has nothing withheld, which is correct.
- Overlap guard: both sides use the same inclusive day rule.
  - Save side: `checkInTx` (`payroll-opening.ts:164-171`) refuses when a non-REVERSED run, of any engine or status (DRAFT included), with BKK payDate in [1 Jan, asOf+1) contains the employee.
  - Run side: `ytdOverlap` (`payroll.ts:2423`, `asOf >= payDay`) refuses v1 create (`:752`), v1 rebuild (`:930`), and v2 create/rebuild/approve (`:2483-2484`).
  - No code path edits a run's payDate (I grepped: payDate is written only at create). Approve does not change membership. So the invariant "run payDay > asOf" cannot be broken later.
  - A REVERSED run is correctly ignored. Re-creating a run for that period goes through create, which runs the guard again.
- Tax-year boundary: every reader keys on `bkkParts(payDate)` year, which follows Thai cash-basis tax: a Dec period paid 5 Jan belongs to the next tax year.
  `parseOpening` + CHECK `EXTRACT(YEAR FROM asOfDay) = taxYear` keep the row and its asOf in the same year.

## 2. Consistency across documents — sound
- All four annual readers filter on the same live row (`supersededAt IS NULL`, sys, year) and add it once:
  - 50 ทวิ / stale / candidates: `yearFigures` `filings/service.ts:549`
  - ภ.ง.ด.1ก: `:408`, only when kind = PND1A
  - `tax-year` report: `reports.ts:470-480`
  - H3.8 slip history / mySlips: `payslip.ts:284-301`, adds income/tax/SSO and leaves count/gross/net/slips alone
- Monthly ภ.ง.ด.1 and สปส.1-10 never call `withOpeningsInTx`.
- CERT_ISSUED: all write paths go through `checkInTx` (`:159-160`), which checks for a live certificate first:
  - single save
  - zero (same action)
  - bulk (`writeOneInTx`)
  - clear (`:282`)
  I found no path that bypasses it.
- NOTE-1: a 1ก that was already filed with the Revenue Department has no "filed" state. The CERT_ISSUED guard looks only at 50 ทวิ, so:
  - After a cert is voided, or for a person who never got a cert, the opening can be edited and the 1ก in the system changes.
  - Downloading a stored HrFilingFile then returns `CHANGED` (sha check, `filings/service.ts` downloadFiling), which is good.
  - The amended filing (ยื่นเพิ่มเติม) remains a manual step. This is the same as for run changes; worth a UI hint later.

## 3. Locks and races — no cycle found
- Lock orders:
  - save / clear / bulk: hr50 (seed 36, ids sorted) → hr:ytd (seed 0) (`payroll-opening.ts:51-58`)
  - issueOne: hr50 → hr:ytd (`filings/service.ts:591`), then FOR SHARE on APPROVED/PAID runs
  - create/rebuild/approve: P → run row → hr:ytd
- Why there is no cycle:
  - Nobody takes hr50 or P after hr:ytd.
  - A run under approve is still DRAFT in its committed version while approve waits on hr:ytd (the status UPDATE comes later). The FOR SHARE `status IN (APPROVED, PAID)` scan in issueOne does not qualify it, so it does not wait on it.
  - Bulk 50 ทวิ uses one tx per employee (issueOne → runTx).
- Stale opening between v2 compute and approve: approve recomputes under hr:ytd (`payroll.ts:2850`), so a changed opening gives a different digest and `INPUTS_CHANGED`, and nothing is written.
  A save that queues behind approve's hr:ytd runs only after approve commits. It is then a legitimate catch-up (A4), or OVERLAP if asOf ≥ payDay.
- D-1 (v1 approve does not take hr:ytd): accepted. v1 WHT ignores openings, and the overlap invariant is set at create/rebuild.
- Snapshot: `snapshotJson.ytdOpening = {id, rev}` is frozen in the item. Approved WHT is never recomputed, and the documents read the live row by design.
  - NOTE-2: the digest covers only the summed amounts, not id/rev. An edit that keeps the same amounts (common, see MINOR-2) lets a DRAFT approve while its pointer names a superseded rev. The pointer is informational only.

## 4. Privacy / permission
- Gate:
  - Every entry point calls `canUseFilings` first (DB membership, role must match, `bankGateOf` on both sides).
  - An unknown or foreign employee gets the same `NO` bytes (`:82-85`), and the employee check runs before YEAR/FIELDS.
  - A non-owner acting on their own row gets OWN.
  - Audits carry `{employeeId, taxYear, rev, by}` / `{code}` with no baht amounts. Refused audits are written after rollback, outside the tx, which is fine.
- Bulk: one tx with sorted locks. The first `Refused` rolls back every row and its audits. Over 300 rows or a duplicate employee ⇒ FIELDS before any DB write.
- Input validation:
  - Negative, non-integer, above 2^31−1 or a string ⇒ FIELDS. The action parses ฿ to satang from the string, with no floats.
  - asOf in another year or in the future ⇒ AS_OF.
  - months > month(asOf) ⇒ FIELDS. WHT > income ⇒ WHT_OVER.
- MINOR-1, read-gate divergence. R8 says read = the H3.6 gate, but the opening amounts are also visible to:
  - (a) H3.8 slip-history readers, including branch-limited and read-only payroll readers (the oracle's `V.readOnly` in S3.19)
  - (b) H3.9 `tax-year` viewers in their branch scope
  - (c) the employee themselves through `mySlips` (`payslip.ts:605`)
  (a) and (b) follow from the Q12/Q7 rulings, and the amounts can be derived from year total minus slips anyway. (c) was not explicitly ruled ("no self view" in R8). It matches the employee's own 50 ทวิ, but the controller should confirm it.
- NOTE-3: superseded revisions (the amount history) have no reader in the app. They are visible only in the DB, which is acceptable under PDPA.

## 5. Migration 20270110000001 — OK
- Additive: one table, no ALTER on existing tables.
- CHECKs: year range, year(asOf) = year, months 0–12, amounts ≥ 0, wht ≤ income, rev ≥ 1, superseded pair.
- Indexes: UNIQUE (sys, emp, year, rev) and a raw-SQL partial UNIQUE on the live row. The repo already uses partial unique indexes (kanban/member migrations).
- FK RESTRICT: no `hrEmployee.delete*` exists in src, so nothing breaks.
- Old code ignores the table. The runbook says migrate first, then deploy.
- NOTE-4: the INT columns cap opening income at 21,474,836.47 ฿. That is about 1.95 M ฿ a month for 11 months; such a person gets FIELDS and cannot be entered at all. HrFilingFile already moved to Decimal for exactly this reason. The brief specified INT, so this is an accountant/controller decision.

## 6. Duplicated reads / module boundary
- NOTE-5: the "live opening" query is written 6 times and the `hr:ytd:` key string 3 times:
  - `payroll-opening.ts:62`
  - `payroll.ts:2412`
  - preview `:3109`
  - `filings/service.ts:295`
  - `reports.ts:471`
  - `payslip.ts:284`
  All six are identical today, so there is no drift yet.
  The load cycle can be avoided without copies: a db-only `payroll-opening-read.ts` that imports only Prisma types, holding `liveOpenings(tx, ctx, year, ids?)` and `lockYtdInTx`. That is a follow-up, not a merge condition.
- NOTE-6: `ssoLawInTx` uses `loadLawSet(...).catch(() => null)` inside the tx. If that query ever failed, Postgres would abort the tx and the next bulk row would throw a 500 instead of a refusal. Low risk (a plain findMany).

## 7. ORACLE-EDITs
- qc-hr-h0.1 S4.2: sha re-take is pre-authorised, the text is marked, and the change is an additive append. Legitimate.
- qc-hr-h3.8 S3.7 `noOpening`: adds an assertion and drops nothing. Legitimate and stronger.
- New S3.19: authorised by ruling Q12. It checks:
  - slip history = live 50 ทวิ
  - exactly one opening line, count/slips = 4
  - payroll reader allowed; manager/member/other tenant refused without leaking amounts
  - opening never on a single slip
  - no key without an opening, and the line is gone after clear
  It is not weakening.
- OE-1 (S3.12): legitimate, because the S4.2 race contract accepts both outcomes, so eB2 may legitimately have no opening.
  - Implement it as ruled: count `liveBefore` = the live rows of eB, eB2 and eL just before the clear loop, then assert `clr.length === liveBefore && liveBefore >= 2 && every ok`.
  - Also assert that 0 live rows remain after the loop.
  - The builder's proposed `clr.length >= 2` is a little weaker than the ruling. With equality plus "0 left", the check still catches a clear that silently skips a row.

## 8. Minor findings (UX / robustness, none changes a tax figure)
- MINOR-2, bulk form (`payroll-opening-ui.tsx:94-115`, `payroll-opening-actions.ts:85-86`). Every SET row is prefilled and re-posted, so "บันทึกทั้งหมด" has three side effects:
  - (a) A new rev and a save audit for every unchanged row.
  - (b) For a non-owner gate holder whose own row is SET, the whole bulk is refused with OWN.
  - (c) With more than 300 SET or filled rows, bulk always returns FIELDS.
  The list also stops at `take: 500` (`payroll-opening.ts:111`) without saying so.
  Fix: skip rows whose values equal the DTO, render the own row read-only, and show a "more than 500" notice.
- MINOR-3, preview review (`payroll.ts:3109-3118`). The two cases behave differently:
  - Non-zero opening saved after a DRAFT: the `YTD_OPENING` item disappears at once, but the DRAFT still shows the old WHT, and nothing hints that a rebuild is needed until approve returns INPUTS_CHANGED.
  - Zero opening saved on a DRAFT: the digest is unchanged, so approve succeeds, but after approve the marker "MISSING" brings the warning back for good.
  The second is the R5d wording ("from the snapshot after approve"), but it reads as a false alarm. Suggest: DRAFT + live opening ≠ snapshot ⇒ a "rebuild" hint, and after approve suppress the item when a live opening exists.
- MINOR-4: an asOf before the employee's start date, or an opening for someone not employed in the year, is accepted (`parseOpening` has no startDay). A zero opening on a person who is never paid shows up as a ZERO_INCOME notice on 1ก. Not required by the brief; a small extra guard would help.
- NOTE-7: the zero button uses asOf = 1 Jan. If a run of that year was paid on 1 Jan, zero ⇒ OVERLAP (rare).

## 9. COMMON §F ticks vs diff
- F2: every tx body in `payroll-opening.ts` uses only `tx`. The payroll, filings and payslip hunks use the caller's tx. The preview and `tax-year` reads run outside any tx. ✓
- F4: refusals are Thai and fixed. Bulk adds `employeeId` only for gate holders (D-4); a NO never carries it. ✓
- F5: maxWait 20 s and timeout 30 s on a server action (self-hosted VPS, no route maxDuration). Bulk audits are written per row inside the one tx. ✓
- F7: the own-row check runs before the tx; there is no second connection under a lock (refused audits are written after the tx ends). ✓
- F10: `payslip.ts`, `payslip-ui.tsx` and qc-hr-h3.8 are outside the §5 list but were added by ruling Q12; they are marked. ✓
- Nothing in the diff contradicts a ticked item.
