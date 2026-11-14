# H3.4-YTD oracle — `scripts/qc-hr-h3.4-ytd.mts` (+ `scripts/qc-hr-h3.4-ytd-lib.mts`) · part B in `scripts/qc-hr-h3.7.mts`

Run (lane DB only): `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_H06_BASE=d350c26cb95cec22c9b0bcb6e897f79a18a7b0f7 pnpm exec tsx scripts/qc-hr-h3.4-ytd.mts` ·
`--list` prints the registry without DB · unforced without `hr/payroll-opening-rules.ts` = SKIPPED exit 0 (no DB touched). Statics base = `QC_H34Y_BASE`, else merge-base(HEAD, session/hr)
when it descends from merge-base(HEAD, origin/session/hr) (same rule as qc-hr-h3.7; origin/session/hr is stale on this VPS). In-base guard: once `payroll-opening-rules.ts` is in the base, S1.4/S1.5 = n/a (pass).

## Independence
- Amounts = brief §6 literals (lib `OPEN`/`LIT`). S2.0 (GREEN control) re-derives every one with the lib's own tax formula (`oracleTax`/`oracleWht`, written from the law, imports nothing under test)
  AND checks the base law engine `whtYtdV2` returns the same when the opening is fed as prior. My derivation = the brief's (no disagreement):
  full year 36,000,000 − 10,000,000 − 6,000,000 − min(1,050,000; 900,000) = 19,100,000 ⇒ 205,000 · v1 17,083 · opening WHT 8 × 17,083 = 136,664 · A1 net < 0 ⇒ 0 ·
  A2 (205,000 − 136,664) ÷ 4 = 17,084 · A4 Oct 68,336 ÷ 3 = 22,778.67 ⇒ 22,779 · Nov 45,557 ÷ 2 = 22,778.5 ⇒ 22,779 · Dec 22,778 · Σ 205,000 · A5 205,000 ÷ 4 = 51,250 ·
  A9 SSO 1,000,000 + 350,000 capped 900,000 ⇒ 17,084. Oct–Dec use the 1,000 ฿ SSO row (from 2031-10-01) — capped allowance, so no effect. S3.14 v1: 27,000,000 / 136,664 + 17,083 = 153,747.
- DB runs are real `createPayrollRunV2` (maker pay1) → `approveRun` (owner) on roster-less MONTHLY employees (probed on base: works, no book ⇒ approvedNoBook, finalized).

## DB design
- 2 tenants `qc-hr-h34y-<stamp>` (+ `-other`) · 11 v2 HR systems (one per scenario: A B C D E F H1 H2 R1 R2 R3) + 2 v1 (V V2) · QC law rows `qc-ytd-<tag>-*` (H3.4 fixture values, ACTIVE, deleted at the end; ACTIVE count restored).
- System B carries one tax year: Sept (missing warning) → opening (catch-up) → Oct/Nov/Dec → 50 ทวิ → race A20 → opening-only leaver → "with" snapshot → void certs + clear all openings → "without" snapshot (A12/A13 with/without = same data state).
- Races hold the KNOWN neighbour locks in a raw tx and detect waiters with `pg_blocking_pids` (lib `underLock`; positive control on base: period lock blocks create, hr50 seed 36 blocks 50 ทวิ issue, seed 0 blocks nothing).
- Cleanup: every `tenantId` table × 4 passes + `cleanupFx` + law rows; Z1 = residue none.
- Caveat (as H3.7): the DB groups have never run against an implementation; base-side calls (v1/v2 create+approve, rebuild, reverse, preview, filings profile/person/issue/void/preview/generate, reports, lock holder) were probed on the lane DB. First builder contact may need harness-only ORACLE-EDITs (DTO wrapper / input names); amounts and rules are not to change.

## Checks (39: 34 RED-by-design · 5 GREEN controls)
- `S1.1` R1 C R — migration: table, CHECKs (wht ≤ income, year(asOf) = taxYear, months 0–12, year 2000–2400, ≥ 0, rev ≥ 1), UNIQUE rev, partial unique live, FK RESTRICT, additive
- `S1.2` R1 C R — schema model + hr.prisma back-relation + core/scope.ts + hr-qc-env
- `S1.3` R2 C R — pure file: type-only imports, no db/clock/random, 5 exports
- `S1.4` §5 C R — every hunk outside new files marked `HR H3.4-YTD` (messages/inventory: additive) · payroll.ts, filings/service.ts, reports.ts touched
- `S1.5` §5 C G — frozen list identical vs base · other oracles only `ORACLE-EDIT … H3.4-YTD` hunks (h3.7, h0.1, h3.8*) · payroll-rules sha
- `S1.6` R4 C R — svc locks `hr50:` (seed 36) before `hr:ytd:` · payroll.ts + filings/service.ts mention `hr:ytd:` · no tenantDb(/prisma. inside $transaction bodies of the svc
- `S1.7` R9 R11 C R — no ID/bank fields, no account import, no outbox, not in AI tools / outbox consumers, actions "use server"
- `S1.8` §4 m R — UI testids, role=alert, YTD_OPENING → #hr-ytd-card, page card, hr.ytd th=en, inventory wo H3.4-YTD, tokens, 44 px
- `S1.9` X12 M G — fitness + fitness-hr without env
- `S2.0` fix C G — worked example re-derived + base whtYtdV2 agrees
- `S2.1` A1 A2 A5 A9 C R — withOpening → whtYtdV2: 0 / 17,084 / 51,250 / 17,084
- `S2.2` R2 A8 C R — withOpening: same year ∧ asOf < onDay · BKK 16:59:59Z in / 17:00Z out · input untouched
- `S2.3` R2 A9 C R — parseOpening 15 vectors · reason ∈ OPENING_TEXT
- `S2.4` Q15 C R — openingMissing 9 vectors
- `S2.5` R2 R6 C R — openingFilingItem exact FilingItem
- `S3.0` fix C G — fixture
- `S3.1` A3 C R — with opening: Sept 17,084 · ytdOpening {id, rev 1} · ytdJson.prior = opening · no review · approve ok
- `S3.2` A3 Q3 Q15 C R — without: create ok · 0 · "MISSING" · review item (not for 09-01 starter) · list MISSING · approve ok · review kept after approve
- `S3.3` A4 C R — catch-up 22,779 / 22,779 / 22,778 · Σ 205,000 · Sept item unchanged
- `S3.4` A5 C R — 51,250
- `S3.5` A6 C R — INPUTS_CHANGED, nothing written → rebuild 17,084 → approve ok
- `S3.6` A6 Q3 C R — zero opening: warning gone, digest unchanged, approve ok
- `S3.7` A7 Q5 C R — OVERLAP (DRAFT, APPROVED) · REVERSED ignored · v2 + v1 create OPENING_OVERLAP, no run · refused audits
- `S3.8` A8 C R — BKK boundary in DB · AS_OF (next year, future), nothing written
- `S3.9` A9 C R — FIELDS ×3 · WHT_OVER · months · YEAR · nothing written · SSO_HIGH saved
- `S3.10` A10 Q10 C R — rev 2, rev 1 intact + superseded · REV_CHANGED · clear + audit · DB partial unique + CHECK
- `S3.11` A11 Q4 C R — 50 ทวิ 36,000,000 / 205,000 / SSO · not stale · candidate · CERT_ISSUED + locked + refused audit · void → edit → re-issue 36,000,100
- `S3.12` A12 Q6 C R — 1ก with opening · opening-only leaver in 1ก + candidates · PND1 08/09 + SSO110 bytes identical with/without
- `S3.13` A13 Q7 C R — tax-year with/without · one extra Thai note · tax-month / payroll-year identical
- `S3.14` A14 Q2 C R — v1 shop: save ok · 17,083 · 50 ทวิ + 1ก 27,000,000 / 153,747
- `S3.15` A15 R8 C R — matrix (8 refused viewers × list/save/bulk/clear = one identical NO) · owner + gate ok · own row OWN
- `S3.16` A16 R9 C R — DTO keys exact · no forbidden keys · manager preview clean · no outbox
- `S3.17` A17 R10 C R — audit shapes ONE/BULK/clear/refused · no ฿ · refused bulk none
- `S3.18` Q9 C R — bulk all-or-nothing · 301 refused · 2 rows ok
- `S4.1` A19 C R — P held ⇒ save first ⇒ item {id, rev} 17,084 · hr50 held ⇒ create first ⇒ INPUTS_CHANGED · free run ⇒ one of the two
- `S4.2` A20 C R — hr50 held, issue ∥ save: cert includes opening XOR CERT_ISSUED
- `S4.3` A21 C R — two saves waiting: one ok, one REV_CHANGED, one live row
- `S4.4` A22 C R — bulk ∥ single waiting: settle < 90 s, one wins, all-or-nothing
- `Z1` house C G — no residue

## RED on base (aa380f6b0 + brief commits · lane DB) — evidence `hr-H3.4-YTD-red.txt`
| group | result on base | reason |
|---|---|---|
| unforced | SKIPPED exit 0 | pure file absent · no DB touched |
| S1.1–S1.4 · S1.6–S1.8 statics | RED | migration / schema / pure / service / UI absent · no marked hunks |
| S1.5 · S1.9 | GREEN (control) | frozen files unchanged (incl. the part-B h3.7 hunks, all marked) · fitness exit 0 ×2 |
| S2.0 | GREEN (control) | oracle arithmetic + base `whtYtdV2` = brief literals |
| S2.1–S2.5 pure | RED | `∅ withOpening / parseOpening / openingMissing / openingFilingItem` |
| S3.0 · Z1 | GREEN (control) | fixture built · residue none, law rows gone, ACTIVE count restored |
| S3.1–S3.18 · S4.1–S4.4 | RED | group guard `missing saveOpeningYtd … (∅ payroll-opening.ts)` — no crash |
Forced ×2 identical: 5/39 pass = exactly the 5 GREEN controls · BASE-EXPECTATION 39/39 · ~60 s per run.
Type check (no project typecheck): `NODE_OPTIONS=--max-old-space-size=12000 ISO_MEM=14000M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsc --noEmit --skipLibCheck -p scratchpad/h34ytd/tsconfig.oracle.json`
(temp tsconfig extends the root one, includes only qc-hr-h3.4-ytd.mts + -lib + next-env.d.ts) ⇒ 0 errors, exit 0 (11 min). A second run adding qc-hr-h3.7.mts sat 30 min in the machine-wide heavy-lock queue and was stopped — the part-B lines are checked only by tsx (2 green runs), not yet by tsc.

## Part B (qc-hr-h3.7.mts S4.35 · marker `ORACLE-EDIT (H3.4-YTD · controller ruling)`, the ruling's mark — the brief body's `(H3.4-YTD B)` is superseded)
- B1 (MINOR-1): new system hG2, example B approved (claim deducted 2031-09) · control: offer 2031-10 and give back 2031-10 accepted · then an APPROVED finalized 2031-11 run for the same
  employee (no 2031-10 run) ⇒ give back 2031-10 `PERIOD` and `giveBackPeriodOf` = 2031-12.
- B2 (MINOR-2): the same `brl` (STAFF, unit uBr) on hG2's employee moved to uBr ⇒ `ok:true` (tenant cleanup removes it).
- B3 (NOTE-4): `reversedRun` asserts `code === "NO"`.
- RED evidence (scratch only, restored byte for byte): see `hr-H3.4-YTD-red.txt`.

## Ambiguities — how I read them (controller please confirm)
1. **hr:ytd advisory seed** is not in the brief. Races therefore hold the known locks (period lock seed 0; `hr50:<sys>:<emp>:<year>` seed 36 = H3.6 issueOne). S1.6 and S4.2–S4.4
   REQUIRE save/clear to take hr50 with seed 36 (otherwise 50 ทวิ is not serialised). Suggest ruling: `hr:ytd` = `hashtextextended(key, 0)`.
2. Return shapes assumed: `listOpeningYtd` → `{ok, rows}` (also accepts `items` or a bare array); `saveOpeningYtd` → `{ok, rev, warnings}` with "SSO_HIGH" somewhere in warnings;
   bulk → `{ok}`; refusals `{ok:false, code, reason}`; `parseOpening(raw, {taxYear, todayBkk})` with raw = the save input fields → `{ok:true,…}|{ok:false, code, reason}`;
   `withOpening(prior, openingRow|null, {onDay})` and `openingFilingItem(row)` take a row-like object with `asOfDay` as "YYYY-MM-DD" string + `taxYear`; `openingMissing` → boolean.
   Service amounts are satang (฿→satang in the action, brief §4). Bulk rows = `{employeeId, asOfDay, months, incomeSatang, whtSatang, ssoSatang, expectRev}`.
3. `YEAR` = taxYear outside 2000–2400 (vector uses 1999 with a 1999 asOf so no other rule fires).
4. Q15 "1 Jan" = 1 Jan of the run's tax year (BKK payDay year). A December run paid in January is not asserted (differs between "payDay year" and "period year" readings).
5. List `state NOT_NEEDED` is not asserted (the list has no run context to decide it); `MISSING` → `SET` and `locked` are.
6. v1 `createPayrollRun` throws `PayrollInputError`; accepted as OPENING_OVERLAP: result/error `code === "OPENING_OVERLAP"` or message ∈ OPENING_TEXT; plus no run row.
7. tax-year "+ fixed note": read as shown only when an opening is included (with = without + 1 Thai note). Opening-only people in tax-year: not asserted.
8. "Identical bytes" (A15) = one canonical refusal across all 8 refused viewers AND all 4 entry points.
9. Zero opening = `saveOpeningYtd` with months 0, amounts 0, asOf 2031-08-31 (the UI's asOf for the zero button is unspecified).
10. `supersededById` (user or row?) not asserted; only `supersededAt` + rev 1 amounts unchanged.
11. A12 monthly bytes "with/without openings" are compared on the same data state by clearing the openings (void certs first), not across two shops.
12. Leaver flag of candidates uses the real clock (`new Date()` in listCertCandidates) — only membership asserted.
13. Clear by a non-owner on a non-existent own row: OWN or NO accepted.

## Accountant list (rulings Q1 / Q14)
- AC-a previous-employer income (50 ทวิ of another employer) — out of scope, may/must the projection include it? (brief A1)
- AC-b rehire = new HrEmployee row — old-row pay is never entered as an opening (double count with the old 50 ทวิ) (brief D4/Q14)
- AC-c (brief A2–A4) one combined annual line on 1ก/50 ทวิ · pre-go-live leaver · SSO above 9,000 ฿ capped.
