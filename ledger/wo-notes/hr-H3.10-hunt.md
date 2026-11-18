# H3.10 hunter — phase-H3 close checks (A–E) · 14 Nov 2026

Tree `shark-hr-l3` @ 290414bc2 (wip/hr-h3.10). Lane DB = ep-ancient-truth (via `scripts/qc-hr.sh`, gate lock held for every run).
Executed: 3 probe scripts in `scratchpad/h310-hunt/` (`common.mts` shared fixture + `p1-e2e-book.mts`, `p2-races.mts`, `p3-privacy.mts`; outputs `p1.out`/`p2.out`/`p3.out`).
p3 ran twice (1st run: wrong salary-cert purpose code in the probe, output truncated). Every run ended `RESIDUE none (tenants=1 users=5 activeLaw=0->0)`.
Only own tenants (slug `qc-h310hunt-*`) and own ACTIVE law rows (sourceKey `qc-h310hunt-<tag>-*`, json = `scripts/fixtures/hr-h3.4-vectors.json` law, same insert as qc-hr-h3.4-ytd) were created and deleted. No src/prisma/scripts edits; no migrate/seed.
Only read (not run): D1 (no test seam lowers `TAKE`), the settings-page gate in E, all file:line citations.

## Findings

| # | sev | title | cause |
|---|---|---|---|
| F1 | MINOR | Default pay account of the OTHER book reachable by a race (D-H37-setbook-two-tx) — **no wrong money entry**: mark-paid re-checks and refuses | `hr/payroll.ts:3578-3583` (book check outside the settings lock), `:3566`/`:3569` (link and clear in two tx) |
| F2 | MINOR (known debt H3.6-cert-stale) | Reversal is not blocked by a live 50 ทวิ of that year; cert keeps citing the reversed run (flag `stale:true` only) | `hr/payroll.ts reverseRunH37` (no cert check) · `filings/service.ts:issueOne` |
| F3 | MINOR (info exposure, no money/PII) | Payroll accounting card (book name, payroll money-account names, default pay account) is rendered for MANAGER roles without the payroll key | `settings/page.tsx:96,649` (`canManageHrSettings` passes MANAGER) · `hr/payroll.ts:3598` (`getPayrollAccounting` takes no viewer) |
| — | none | No BLOCKER/MAJOR found. All B money invariants hold to the satang; no deadlock, no double journal, refusals byte-identical. | |

### F1 repro (p1 A1/A2, executed)
- A1 forced half-done state in the DB: `setPayrollBook(BB)` (clears default — normal path OK: `payDefaultAfterSwitch null`), then `jsonb_set(settings,'{hrPayroll,payFinanceAccountId}', finA)` (finA = BANK of book BA).
  Oct run approved → accrual in **BB**. `markPaidRun` with default ⇒ `{ok:false, code:"PAY_ACCOUNT"}`; explicit finA ⇒ same; run stays APPROVED, 0 pay entries, 0 lines in BA. Explicit finB ⇒ ok, pay entry in BB Dr 2120 = 47,829.16.
- A2 deterministic race (holder holds `hr:clockpolicy:<sys>`): `setPayrollPayAccount(finB)` validates against book BB then blocks in `h37WritePaySetting`; `setPayrollBook(BB→BA)` runs through (link tx not under that lock, reads default = null ⇒ no clear) → release → finB written.
  Final: book **BA**, default **finB (of BB)** — both calls returned `{ok:true}`. Nov run approved in BA; mark-paid with default ⇒ `PAY_ACCOUNT`, run APPROVED, only the accrual entry exists.
- Two `setPayrollBook` racing on the link lock (→BB then →BA): both ok, final ONE/BA, default cleared (null) — consistent.
- Why money is safe: `postPayrollPayJV` looks the account up with `systemId = run's recorded book` (`account/gl.ts:2355-2358`) ⇒ foreign-book account = PAY_ACCOUNT; booked pay path re-reads `accountSystemId` under the row lock (`payroll.ts:3426-3428`). UI mark-paid select only preselects the default if it belongs to the run's book (`payroll-run-ui.tsx:316-322`).
- Effect: owner must pick the account on every pay until the default is reset; settings card shows a default that is not in its own account list. Fix (H5.1): validate + write the default inside `lockHrSettings` (re-read book under the lock), and clear the default in the same settings-locked tx as the link change. **D-H37-setbook-two-tx can be downgraded from PRE-PROD money to NTH.**

### F2 repro (p2 C3a, executed)
Run 2031-09 (30,000 ฿ salary) approved+paid; holder holds the period lock; `reverseRun` queued, `issueTaxCertificatesBulk(2031, now 2032-01-05)` not blocked → issues HR50-2031-0001 (row 40(1) 30,000.00, SSO 875.00); release → reverse ok (2 reversals).
After: cert live, `listTaxCertificates` → `stale:true`, `listCertCandidates` → []. Opposite order (C3b, holder holds `hr:ytd:<sys>:2031`): issue waits, reverse does not need hr:ytd and finishes, issue then ⇒ `CERT_NONE` (FOR SHARE re-check sees REVERSED) — correct.
Not a race defect (serialisation correct both ways); it is the documented H3.6-cert-stale design. Accountant/owner to decide: refuse/warn reverse when a live 50 ทวิ of that tax year includes the run, or auto-void.

### F3 evidence (p3, executed + read)
`canManageHrSettings(mgr u1)` = true, `(mgrAll)` = true, `(payU1)` = false. Card data `getPayrollAccounting(ctx)` keys = books, link, bookId, linkedBookId, payAccounts[{id,name,type}], payFinanceAccountId, lastUnlink (actor name). No amounts, no employee data. Edit buttons are owner-only. Decide in H5.2 privacy whether non-owners should see it.

## A. D-H37-setbook-two-tx — see F1. Answer: approve posts only the accrual in the linked book; mark-paid re-checks the account against the run's recorded book and refuses (`PAY_ACCOUNT`); no entry against another book's account was produced in any of 4 attempts.

## B. End-to-end (p1, executed) — tenant 1, system E2E, book BA, Sept 2031, 3 monthly staff
Staff: E01 30,000 (opening YTD 8 months: 240,000 / WHT 1,366.64 / SSO 7,000), E02 20,000, E03 25,000 leaver 2031-09-15. Daily employee (own system) ⇒ create `VARIABLE_PAY` (G-NA11, by design) — so "daily" was replaced by a second monthly.
- Items: gross 62,500.00 (30,000 / 20,000 / 12,500 ÷30 proration) · net 59,954.16 · WHT 170.84 (E01 only, opening-aware) · SSO ee 2,375 / er 2,375 · SSO base 47,500. Run totals = item sums (7/7).
- Bank CSV: 3 items, 59,954.16 = Σnet. PND1 2031-09: 3 lines, income 62,500.00, tax 170.84 = Σ. SSO 1-10: wages 47,500.00 = Σbase, contributions 4,750.00 = ee+er.
- Journals (BA): accrual Dr 6000 62,500 + 6010 2,375 = Cr 2120 59,954.16 + 2130 170.84 + 2150 4,750 (64,875.00 each side); pay Dr 2120 / Cr 1010 59,954.16. Both balanced.
- Slips: net 28,954.16 / 19,125.00 / 11,875.00 = items; E01 history: income 270,000 (= 240,000 opening + 30,000), tax 1,537.48, SSO 7,875, with opening line.
- Reports: payroll-month totals = items (7/7, 3 rows); tax-year income 302,500 / WHT 1,537.48 / SSO ee 9,375 = items + opening.
- Reverse: ok; accrual + pay REVERSED, exactly 1 REVERSAL each, per-ledger net of all 4 entries = 0; slips WITHDRAWN (PDF refused WITHDRAWN); bank file download STATUS; PND1 file CHANGED; SSO file STATUS; payroll-month 0 rows; opening rows byte-identical; adjustments unbound.
- Re-run Sept: create+approve ok, all item figures identical (same digest of 3 items); paid ok.
- Info (not findings): (i) after the re-run the OLD PND1 file (period file, runId null) downloads OK again — rebuild sha equals the stored sha because figures are identical (content-verified, by design); old SSO/bank files stay STATUS (run-bound).
  (ii) 75 `HrWorkDay` rows keep `runId` = reversed run until the next approve rebinds the whole period (`work-entries.ts:532-536`) — matches debt H3.1-rebuild, no money effect.

## C. Concurrency (p2, executed; start order forced with a held lock + pg_blocking_pids)
| pair | order | result |
|---|---|---|
| approve ∥ reverse | approve first | approve ok; reverse got the lock between claim and finalize ⇒ `NO_JV` ("ยังไม่ได้ลงบัญชี… ลบร่าง" — slightly misleading for an approved run, oracle S4.27 area); APPROVED, 1 accrual |
| reverse ∥ approve | reverse first | reverse `NO_JV` on DRAFT; approve ok; 1 accrual |
| pay ∥ reverse | pay first | PAID then REVERSED; accrual+pay REVERSED, 2 reversals |
| reverse ∥ pay | reverse first | REVERSED (1 reversal); pay ⇒ `NOT_APPROVED`, no pay entry |
| reverse ∥ 50 ทวิ | both orders | see F2 (no deadlock) |
| reverse ∥ bank download | row held FOR SHARE: reverse queued, download not blocked → served APPROVED-state bytes (before reverse commit); period-lock order: download ok, after reverse ⇒ STATUS |
| opening save ∥ approve | approve queued | save ok rev 1; approve ⇒ `INPUTS_CHANGED`, run DRAFT, no entry (oracle behaviour confirmed) |
Global on the tenant: duplicate idempotency keys 0 · duplicate reversals 0 · PAID-with-book without pay entry 0 · REVERSED with a live non-reversal entry 0. No deadlock or THROW in any call.

## D. Unconfirmed statuses
1. **D-H32-punch-cap (read only)**: `TAKE = 20_000` (`work-entries.ts:69`) is a PAGE size, not a cap, on the hash path (`allRows` pages punches/days/leaves until a short page — `:161-172,208`). The judge read path caps per build page of 25 employees (`PAGE_SIZE` `:67`): roster rows ≥ 20,000, punches ≥ 50,000 or attendance-day rows ≥ 20,000 ⇒ `truncated` ⇒ `Refusal(WE_TEXT.tooMuch)` (`:366-367`, `judge.ts:172,1133`) ⇒ create run = `BUILD` refusal. Not silent; pay never computed on truncated data (payroll reads `HrWorkDay` without take, `payroll.ts:2482`). Remaining silent takes are display/reference only: `workEntryPreview` rows `take: TAKE` for the whole period (`:617`, > ~645 staff × 31 days drops rows from the preview), OT reference `:372-377`. Refusal text "ลองดึงทีละสาขา" does not help (limit is per 25 staff). Not demonstrated (no seam lowers TAKE).
2. **rdFormFlag**: lane-3 DB column default = `2`; fresh profile saved without the field stores `2` (service always writes it: `filings/service.ts:153,165`; reader default `?? 2` `filings/rd.ts:247`); generated PND1 header ends `…|QCREF00000000000036|2`. Column default is never relied on by the app path. (Lane-1 DB = 1 per handover — not checked here.)
3. **SSO ceiling**: lane DB has exactly one non-QC SSO row: `v1:SSO` effectiveFrom 1970-01-01 status **DRAFT** max 1,500,000 sat (15,000 ฿) min 165,000 rate 500 bp (`scripts/hr-seed-law-draft.mts:34`). No ACTIVE row. QC fixtures (not law) use 17,500 from 2031-01-01 and 20,000 from 2031-10-01. Readers: v2 run `loadLawSet(lawDayOf(payDate))` (`payroll.ts:2429`) → `ssoV2` (`payroll-rules-v2.ts:161`); labour cost `labor.ts:338`; opening SSO_HIGH check `payroll-opening.ts:214`. **v1 engine (all shops today) ignores law rows**: `ssoContribution(base)` with built-in max 15,000 (`payroll-rules.ts:24`, call `payroll.ts:474`); SSO 1-10 rate default 500 bp (`filings/sso.ts:90`).
   20,000 ฿ salary, 2569 period: max 15,000 ⇒ base 15,000 × 5% = **750 ฿** employee + 750 ฿ employer (executed `ssoV2` and v1 both = 75,000 sat); max 17,500 ⇒ 17,500 × 5% = **875 ฿** + 875 ฿. Difference 125 ฿/month each side (1,500 ฿/year each). If 17,500 is adopted, the v1 constant must change too, or v1 shops keep 750.

## E. Privacy (p3, executed; one call each, forbidden id vs unknown id)
Viewers: payU1 = STAFF [u1] + read/pay · mgr = MANAGER [u1] no payroll key · mgrAll = MANAGER [*] no key · owner = positive control (all DATA).
- payU1: bank list/download, filing list/download, other-branch slip + history, salary-cert list/download, opening list ⇒ `NO`, bytes identical to unknown id (11/11). Own-branch slip = DATA (by design, home unit). payroll-month: only eU1 row (net 29,125.00); unitId=u2 ⇒ 0 rows; tax-year: only eU1 (eU2 opening not shown).
- mgr / mgrAll: every money surface `NO`, identical to unknown (12/12 each). Run preview: mgr = manager step (DATA, no ฿ per oracle S6.1), mgrAll = refusal identical to unknown.
- Card: F3.
