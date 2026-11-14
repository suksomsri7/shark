# H3.4-YTD — bug hunt (money · race · privacy) · hunter: Claude Opus 5.5 · 14 Nov 2026
Tree `/root/projects/shark-hr-l3` @ 2f6708d78 (builder 39bb24e18 + oracle-only OE-1 commit). Lane DB only, each probe under
`iso.sh → qc-hr.sh → with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx`, one at a time. Own law rows `qc-ytdh-<tag>-*` (H3.4 QC values), own
tenants `qc-hr-h34yh-*`, all deleted in `finally`. Probes + raw outputs: `scratchpad/h34ytd-hunt/p{1..6}-*.mts` / `p{1..6}.out` (untracked; `.mts`, outside tsconfig include).
**Residue: every probe printed `RESIDUE none` · ACTIVE law 0→0.** No src/prisma/scripts/ledger-brief edits, no commits.

## Verdict
No BLOCKER, no MAJOR. Money paths (overlap, digest, year totals, documents) and the privacy gate held under every probe.
4 MINOR findings + 2 contract questions (below).

## Probes
**P1 double counting (p1-overlap.mts) — all held.**
- v2 DRAFT Sep (payDay 09-25) → save asOf 09-30 ⇒ `OVERLAP`. Save asOf 08-31 ok → approve without rebuild ⇒ `INPUTS_CHANGED`.
- v1 DRAFT Sep → save asOf 09-30 ⇒ `OVERLAP`. Employee without a profile (not in the v1 DRAFT) gets an opening asOf 09-30, then a profile → v1 `recomputeDraftRun` ⇒ `OPENING_OVERLAP` refusal; the run keeps only the old employee and approves.
- Reverse path: Sep approved → opening 08-31 → reverse Sep → edit asOf 09-30 (rev2, allowed) → re-create Sep ⇒ `OPENING_OVERLAP`. Oct run prior = opening only `{27,000,000 / 136,664 / 700,000}`, marker `{rev:2}`.
- Reverse order: Jan–Mar approved, then save asOf 06-30 ⇒ `OVERLAP`. asOf 01-10 (before the first run) is allowed (by the contract).
- BKK boundary on save: run payDate 2031-08-31T16:59Z (BKK 08-31) + asOf 08-31 ⇒ `OVERLAP`. 17:00Z (BKK 09-01) ⇒ ok.
- Opening 08-31, then v2 create with payDay = asOf ⇒ `OPENING_OVERLAP`, 0 runs written.
- Un-reverse: no such path exists in payroll.ts (read). Item writers = v1 create/rebuild + `writeRunV2InTx` only, and all of them check overlap (read).

**P2 stale basis + race (p2-stale.mts)**
- DRAFT computed with rev1 → clear → approve ⇒ `INPUTS_CHANGED` ✓.
- DRAFT with rev1 → edit **non-money fields only** (months 8→5, asOf 08-31→08-15) ⇒ rev2 → approve **ok**. The approved item marker = `{rev:1}` (superseded) while rev2 is live ⇒ **F2**.
- DRAFT `MISSING` → zero opening ⇒ the DRAFT review clears `[]` → approve ok → preview after approve shows `["YTD_OPENING"]` again. The marker is frozen at `"MISSING"` ⇒ **F1**.
- Race approve ∥ save (rev1→rev2, WHT 0). The `hr:ytd:<sys>:2031` seed-0 lock was held by a raw tx, and `pg_blocking_pids` showed 2 blocked. Both start orders: save ok, approve `INPUTS_CHANGED`, item still 17,084 / rev1 (DRAFT). No approved item used a row superseded before approval. ✓ The "approve wins" order was not reached; it is equivalent to the A4 catch-up case.

**P3 year totals (p3-year.mts) — all match oracle arithmetic (`oracleWht`/`oracleTax` from the oracle lib).**
- Over-withheld opening (WHT 2,000,000 > annual 205,000) ⇒ Sep WHT **0**, net 2,912,500. Never negative.
- December, 11-month opening (33,000,000 / 187,913 / 987,500), Dec run (k=0) ⇒ 17,087 = oracle 17,087.
- SSO opening 5,000,000 (≫ cap) ⇒ 17,084 (allowance capped) ✓.
- Opening income INT_MAX + salary 2,000,000,000 sat/month ⇒ WHT 874,301,069 = oracle. All values safe ints; tax numerator ~1.2e13 ≪ 2^53.
- Opening income 2,147,483,648 sat ⇒ `FIELDS`. A real executive case (3,000,000 ฿/month × 8 = 2,400,000,000 sat) ⇒ `FIELDS` ⇒ **F4**.
- Year boundary 16:59:59Z / 17:00Z: covered by oracle S2.2/S3.8 + P1 save boundary. Not re-run.

**P4 documents (p4-docs.mts)**
- Opening Jan–Aug + Sep–Dec approved ⇒ 50 ทวิ 36,000,000 / 205,000 / SSO 1,087,500 = ภ.ง.ด.1ก 36,000,000 / 205,000 = tax-year 360,000.00 / 2,050.00 / 10,875.00 / months 12 = slip history 36,000,000 / 205,000 / 1,087,500 + one opening line. All equal ✓.
- With a live cert: save rev2, clear, bulk, one-click zero ⇒ all `CERT_ISSUED`, refused audits `{code}`. LEAVER cert (Nov, leaver ended 10-31) → edit ⇒ `CERT_ISSUED` ✓. Void → save rev2 → re-issue 36,000,100 ✓. List `stale` false.
- Rehire row (new HrEmployee, same national ID) accepts an 11-month opening of 33,000,000 while the original row's cert is live. **No guard** — this is the known debt D4/Q14 (accountant AC-b). Not counted as a new finding.
- Audits: only `{employeeId,taxYear,rev,by}` / `{employeeId,taxYear,rev}` / `{code}` — no ฿ ✓.

**P5 privacy matrix (p5-privacy.mts) — executed, 8 viewers × 10 cells.**
| viewer | list | save | bulk | clear | zero | own row | unknown id | other-sys id | other-tenant id | role claim OWNER |
|---|---|---|---|---|---|---|---|---|---|---|
| other tenant · employee self (no gate) · manager · payroll reader [u1] · gate holder [u1] | NO | NO | NO | NO | NO | NO | NO | NO | NO | NO |
| gate holder [] that owns a row | OK | OK | OK | OK | OK | **OWN** | NO | NO | NO | NO |
| gate holder [] | OK | OK | OK | REV_CHANGED* | OK | OK (not theirs) | NO | NO | NO | NO |
| owner | OK | OK | OK | REV_CHANGED* | OK | OK | NO | NO | NO | OK |
\*The row was already cleared by an earlier viewer in the sequence (expected). Refusal bytes: **one** `NO` byte string across all cells (forbidden = unknown = foreign) ✓. Bulk including your own row ⇒ `OWN` + own id ✓.
- Not executed (no such API): "read one", "history of revisions". The service exposes only list/save/bulk/clear (read). Revision rows are reachable only through the DB.
- Side readers that now carry opening amounts ⇒ **Q-A / Q-B**:
  - Slip history (H3.8) of a u1 employee returns the full `opening` line to the payroll **reader** [u1] (no pay) and to the gate holder [u1]. Both are refused by the opening card itself.
  - tax-year report: the same viewers get income incl. the opening.
  - `mySlips` (self) returns the employee's own `opening` line.
  - Manager, member and other tenant are refused everywhere ✓.

**P6 bulk (p6-bulk.mts)**
- 301 rows ⇒ `FIELDS`. Duplicate employee ⇒ `FIELDS`. 300 rows with row 299 WHT > income ⇒ `WHT_OVER` + that row's id, 0 rows / 0 audits ✓.
- Row 299 (in id sort order) fails **inside** the tx (`REV_CHANGED`) ⇒ rollback. Only the pre-seeded row and its audit remain ✓. That took 19.5 s.
- 300 valid rows ⇒ ok, 300 saved, **21.0 s** inside one tx with `timeout: 30_000` ⇒ **F3**.
- Two concurrent overlapping bulks (40 + 40 rows, 20 shared) with `hr:ytd` held: one ok (40), the other `REV_CHANGED` (0 written). 40 live rows, max 1 per employee, no deadlock ✓.

## Findings
**F1 MINOR — the "missing opening" warning comes back after approve, even though a zero opening was saved before approve.**
- Cause: `payroll.ts:3109` (`ytdLive` is computed only for DRAFT) + `:3118`. After approve the review is read from the frozen snapshot marker `"MISSING"` (`:2527`/`:2600`).
- The marker is not in the digest, and a zero opening leaves the digest equal, so approve does not demand a rebuild.
- Repro: v2 system, employee start 2030-01-01, 30,000 ฿ → create 2031-09 (marker MISSING, review `YTD_OPENING`) → zero opening (asOf 2031-01-01, all 0) → preview `[]` → approve ok → preview `["YTD_OPENING"]`.
- Effect: a false permanent warning on the approved run that points to `#hr-ytd-card`, which shows the row as SET. Oracle S3.6 checks only the DRAFT.

**F2 MINOR — the approved item's `ytdOpening {id, rev}` can name a superseded revision.**
- Cause: `payroll.ts:2527-2600`. The marker sits outside `inputDigest`, and approve only compares the digest (`:2855`). An edit that keeps income/WHT/SSO but changes asOf (still < payDay) or months leaves the digest equal.
- Repro: opening rev1 (OPEN) → create 2031-09 → save `{months:5, asOfDay:"2031-08-15"}` expectRev 1 ⇒ rev2 → approve ok → item marker `{rev:1}`, live rev 2.
- Effect: none on money (the amounts are equal). But the audit link "item → opening it used" is wrong, and rev2's asOf/months were never seen by the run.

**F3 MINOR (headroom) — a 300-row bulk save runs ~21 s on an idle lane DB against a 30 s tx timeout, holding `hr:ytd:<sys>:<year>` the whole time.**
- Cause: `payroll-opening.ts:255` — a sequential `writeOneInTx` per row with ~8 round trips each (cert, all revs, overlap run, update, insert, audit, plus `loadLawSet` per row at `:193`), under `TX` `:29`.
- Effects:
  - Under load or higher latency the max-size form can hit the tx timeout. That is a Prisma throw, not a `Refused` (`:258-259` rethrows), so the user gets a raw server-action error.
  - Meanwhile every payroll create/rebuild/approve and every 50 ทวิ issue of that system-year waits on `hr:ytd` (maxWait 20 s elsewhere).
- Repro: P6 step d.

**F4 MINOR (contract ceiling) — no opening can be entered once income Jan–asOf exceeds 21,474,836.47 ฿ (`payroll-opening-rules.ts:26,29`, INT column).**
- Example: an employee on ≥ 2,684,355 ฿/month for 8 months.
- Salary profiles accept far larger values (2,000,000,000 sat/month ran fine).
- Effect: for such a person the v2 projection and 50 ทวิ/1ก silently lack the pre-system pay.
- This is inside R2 as written ("safe ints ≤ 2^31−1"), so it is a controller/debt item, not a builder defect.

**Q-A (contract tension, for the controller):** R8 says read = H3.6 filing gate. Through the Q12 slip-history hunk (`payslip.ts:318`), a branch-limited payroll *reader* without pay (and a branch-limited gate holder) gets the full opening line (asOf, months, income, tax, SSO) of employees in their branch. The opening card refuses both of them. Oracle S3.19 asserts "payroll reader ✓" (all-branch reader), so this may be intended. Please confirm or restrict.
**Q-B:** `mySlips` (`payslip.ts:605`) shows the employee their own opening line, while R8 says "No self view". The Q12 ruling names the slip history. Please confirm the self surface is in scope.

## Read-only (not executed)
- Deadlock audit of the lock order. issueOne holds hr50 → hr:ytd → `runsIn … FOR SHARE` (APPROVED/PAID rows). v2 approve holds P → run row (DRAFT) → hr:ytd. That is not a cycle: a DRAFT row does not match the FOR SHARE filter, and finalize/pay/reverse never take hr:ytd.
- The ภ.ง.ด.1ก path reads openings without hr:ytd (read-only, statement-level consistency) — acceptable.
