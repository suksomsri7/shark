# H3.7 oracle — `scripts/qc-hr-h3.7.mts` (+ `scripts/qc-hr-h3.7-lib.mts`, fixtures `scripts/fixtures/hr-h3.7-vectors.json`, `hr-h3.7-texts.json`)

Run (lane DB only): `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h3.7.mts` · `--list` prints the registry without DB · unforced run without `hr/payroll-journal-rules.ts` = SKIPPED exit 0 (no DB touched).

## Independence
- Every expected amount is hand arithmetic (design §4) stored in the vectors; `vectorsSelfCheck` (S2.0, GREEN control) re-derives them with the oracle's **own** formula (`oracleAmounts`/`oracleRows` in the lib — written from the spec, imports nothing under test) and checks Σdr = Σcr = total and pay = Σ net.
- Fuzz (S2.4): mulberry32 seed 3707, 3,000 runs of 1–6 items with BASE/PRORATION/LATE/ABSENT/OT/COMMISSION/BONUS/ALLOWANCE/REFUND/ADVANCE/DEDUCTION (carry-in, all claim sources) and receivables; builder amounts must equal the oracle's and the template rows must equal the oracle's rows (balanced, positive integers).
- DB expectations compare ledger **codes** (default mapping) as multisets; texts byte-exact from the texts fixture; `lockedMessage` comes from the existing base `account/policy.ts`.

## DB design
- 3 throwaway tenants `qc-hr-h37-<stamp>{-a,-b,-c}`; T1: books A (created first), B, F, L, D + 22 HR systems (one per scenario so LATER_RUN never couples scenarios); T2: book C + HR h3; T3: book V + HR hv (v1 golden).
- v2 runs are **inserted** (raw SQL, `engineVersion 2`, `inputDigest qc37-…`, `stepsJson {}`, APPROVED, approver = owner, creator = manager) with items (`snapshotJson.lines` refs re-keyed to inserted bound `HrPayAdjustment` rows) and driven through `approveRun(ctx, runId, undefined, actor[, hooks])` ⇒ H3.4 **RETRY_FINAL** (only the final tx runs — no digest recompute). `__failFinal` (H3.4 test hook) proves no orphan. `markPaidRun` gets `now = 2032-01-10` so 2031 pay dates are not in the future.
- Presence guard: S4 needs `HrPayrollRun.stepsJson` + `inputDigest` and enum value `HrPaySource.CARRY_FORWARD` (H3.4 migrations). Absent ⇒ S4.0 RED and every S4 check RED "H3.4 not in base" (group guard, no crash). **The S4 harness has never executed against H3.4 here** (lane DB has no H3.4 migration) — first contact after the H3.4 merge may need harness-only ORACLE-EDITs (SQL column/enum spelling); amounts/texts/expectations are not to change.
- Cleanup: every table with `tenantId` for the 3 tenants, 4 passes (reversal FK cleared first) + `cleanupFx`; Z1 = residue none.
- Order inside S4 matters and is fixed: examples A–E → pay (S4.6) → pay refusals on E → reverse A → reverse E → moved book → no link → MANY → mapping missing (book F) → closed/locked (A 2031-03, book L) → failure/retry → races → LATER/CARRY → H3.4-era → inconsistent → **S4.10 last** (closes today's period in book A) → scoping → audits; S4.20 (v1 golden, T3) runs outside the guard.

## RED on this base (session/hr 1b0898377, H3.4 not merged)
Clean typecheck (`rm -rf .next/types tsconfig.tsbuildinfo` → `pnpm typecheck` via iso + gate lock) exit 0 on 421e619f1.
Forced ×2, identical: **8/54 pass = exactly the 8 GREEN controls** (S1.4 S1.6 S1.7 S1.9 S2.0 S3.0 S4.20 Z1) · BASE-EXPECTATION 54/54 as registered · no crash · residue none. Evidence `ledger/wo-notes/hr-H3.7-red.txt`.

## Checks
- `H3.7-S1.1` R6 · CRITICAL · RED — [static] gl.ts: ≥1 hunk vs base, every hunk carries "HR H3.7", no line removed (additive only)
- `H3.7-S1.2` R6 · CRITICAL · RED — [static] connections.ts + index.ts: every hunk marked "HR H3.7" · index exports payrollBookOf linkPayrollBook ensurePayrollLedgersInTx postPayrollAccrualJV postPayrollPayJV payrollAccrualTemplate PAYROLL_ACCOUNTS
- `H3.7-S1.3` R6 · CRITICAL · RED — [static] account/** files changed vs base ⊆ gl · connections · index · coa (coa: only marked MAPPING_KEY_LABEL lines) · ≥1 of gl/connections/index changed
- `H3.7-S1.4` R6 · CRITICAL · GREEN — [static] [control] hr/** imports account only via "@/lib/modules/account" · no account table delegate / raw "Account…" SQL in hr/**
- `H3.7-S1.5` R3 · CRITICAL · RED — [static] pure file hr/payroll-journal-rules.ts: exists · imports type-only or none · no db / clock / random
- `H3.7-S1.6` R9 · CRITICAL · GREEN — [static] [control] no new migration and prisma/schema unchanged vs base (H3.7 needs none: HrPayrollRun.accountSystemId already exists)
- `H3.7-S1.7` R8 · CRITICAL · GREEN — [static] [control] frozen vs base: markPaid block · v1 approveRun block · gl postPayrollJV/reverseEntry/reverseFor/commitEntry/resolveLine/ensureAccounting/postManualJV bodies
- `H3.7-S1.8` §5 · MAJOR · RED — [static] every new fixed text byte-exact in payroll.ts ∪ gl.ts ∪ connections.ts ∪ pure file (placeholders split)
- `H3.7-S1.9` X12 · MAJOR · GREEN — [run] [control] fitness + fitness-hr without env ⇒ exit 0
- `H3.7-S1.10` R7 · MINOR · RED — [static] UI testids hr-pay-book · hr-pay-account (HR settings) · hr-markpaid-account · hr-markpaid-date (payroll) present under hr UI
- `H3.7-S1.11` R1 R7 · MAJOR · RED — [static] connections HR card accountKeys ⊇ PAYROLL_SALARY_EXPENSE, PAYROLL_SALARY_PAYABLE · payroll.ts exports markPaidRun setPayrollBook setPayrollPayAccount · payroll-actions calls markPaidRun
- `H3.7-S2.0` fix · CRITICAL · GREEN — [pure] [control] worked examples A–E self-consistent (oracle formula = hand numbers · Σdr = Σcr = total · pay = Σ net)
- `H3.7-S2.1` R2 · CRITICAL · RED — [pure] PAYROLL_ACCOUNTS = fixture (key · code · type · label · ledgerName) in order
- `H3.7-S2.2` R3 · CRITICAL · RED — [pure] accrualAmountsV2 on examples A–E = hand amounts (11 fields each)
- `H3.7-S2.3` R4 · CRITICAL · RED — [pure] payrollAccrualTemplate on A–E = hand rows (order · key · side · amount · zero rows omitted) + notes = fixture
- `H3.7-S2.4` R3 R4 · CRITICAL · RED — [pure] fuzz 3,000 runs: builder amounts = oracle amounts · rows = oracle rows · Σdr = Σcr · all amounts safe integers > 0
- `H3.7-S2.5` R3 · CRITICAL · RED — [pure] 7 inconsistent vectors ⇒ {ok:false, code:"INCONSISTENT"}
- `H3.7-S2.6` R3 · MAJOR · RED — [pure] claimClassOf: 12 vectors (ADVANCE · DAMAGES · OVERPAY · carry suffix · LATE/ABSENT null)
- `H3.7-S2.7` R5 · MAJOR · RED — [pure] payrollAccrualDay (8 vectors: min(payDay, last day of P) · leap · malformed null) · paidOnOk (6 vectors)
- `H3.7-S2.8` R3 · MAJOR · RED — [pure] deterministic + input not mutated (amounts · template)
- `H3.7-S3.0` fix · CRITICAL · GREEN — [db] [control] fixture: 3 tenants · 5 books in T1 (A created first) · 1 in T2 · 1 in T3 · HR systems · owners
- `H3.7-S3.1` R1 R2 · CRITICAL · RED — [db] setPayrollBook(hA→A) ⇒ payrollBookOf ONE A · 4 new ledgers (6010 2120 2150 1140, isSystem, type, name) · 8 mappings → fixture codes · ensure again = no new rows · audit hr.payroll.book · manager ⇒ bookOwner
- `H3.7-S3.2` R1 · CRITICAL · RED — [db] move A→B (A link disabled · B enabled) · null ⇒ NONE · account-side connect of a 2nd book ⇒ hrOtherBook, rows unchanged
- `H3.7-S3.3` R6 · CRITICAL · RED — [db] cross-tenant: T2 book ⇒ bookNotFound, no link row · facade with foreign HR ⇒ refused · forged T2 link to a T1 HR system ignored both ways
- `H3.7-S3.4` R1 · CRITICAL · RED — [db] two enabled links ⇒ payrollBookOf MANY
- `H3.7-S3.5` R2 · CRITICAL · RED — [db] shop's own 2120 (not ours) ⇒ PAYROLL_SALARY_PAYABLE never mapped to it · accrual ⇒ MAPPING_MISSING naming "เงินเดือนค้างจ่าย"/2120 · no entry · owner maps 2121 ⇒ posts there
- `H3.7-S3.6` R4 · CRITICAL · RED — [db] postPayrollAccrualJV (example B amounts) on A: key hr-payroll#<id>#accrual · refType hr-payroll · GENERAL/ADJUST · day · memo · lines = B by code · repeat ⇒ same id (reused) · other book ⇒ OTHER_BOOK
- `H3.7-S3.7` R4 · CRITICAL · RED — [db] postPayrollPayJV: Dr 2120 / Cr 1010 · PAYMENTS/PAYMENT · repeat reused · archived / other-book finance ⇒ PAY_ACCOUNT · net 0 ⇒ entryId null
- `H3.7-S3.8` R5 · CRITICAL · RED — [db] facade on a CLOSED period ⇒ PERIOD_CLOSED (existing text) · before lockBeforeDate ⇒ PERIOD_LOCKED (lockedMessage) · nothing written
- `H3.7-S4.0` dep · CRITICAL · RED — [db] H3.4 in base: HrPayrollRun.stepsJson + inputDigest · HrPaySource CARRY_FORWARD
- `H3.7-S4.1` R1 R4 · CRITICAL · RED — [db] example A via approveRun (final tx): ok · journalEntryId = accrual · accountSystemId = A · finalized · key/book/day 2031-09-30 (payDay 10-05) · lines = A
- `H3.7-S4.2` R1 · CRITICAL · RED — [db] example B: lines = B (advances 1140 · damages 4900 · overpay 6000 · refund Dr 4900) · H3.4 carry row DAMAGES 87,777 → 2031-10 written · carry not booked
- `H3.7-S4.3` R1 · CRITICAL · RED — [db] example C (leavers): lines = C incl. receivable rows · ADVANCE receivable 145,000 not booked · net-0 employee ok
- `H3.7-S4.4` R1 · CRITICAL · RED — [db] example D (bonus month) lines = D
- `H3.7-S4.5` R1 R3 · CRITICAL · RED — [db] example E on the SECOND book (link, not "first ACCOUNT"): 2 lines in B · nothing for that run in A
- `H3.7-S4.6` R1 · CRITICAL · RED — [db] markPaidRun: A with chosen bank (Dr 2120 / Cr 1010, PAYMENTS, day 10-05, key #pay) · D with the default pay account setting (Cr 1000) · PAID · one hr.payroll.paid each
- `H3.7-S4.7` R1 R5 · CRITICAL · RED — [db] pay refusals on E: no account · other book's finance ⇒ payAccount · before P / after today ⇒ payDate · closed period ⇒ periodClosed · each: APPROVED, no pay entry, no paid event
- `H3.7-S4.8` R5 · CRITICAL · RED — [db] reverse PAID A ⇒ 2 REVERSAL entries (of pay and of accrual) · mirrored · originals REVERSED · per-ledger net of the run = 0 · dated today · repeat ⇒ alreadyReversed, nothing new
- `H3.7-S4.9` R5 · CRITICAL · RED — [db] reverse APPROVED-unpaid E ⇒ exactly 1 reversal (accrual) · no pay entry
- `H3.7-S4.10` R5 · CRITICAL · RED — [db] today's period CLOSED in A ⇒ reversals of PAID B dated the 1st of the next month (existing rule) · nothing in the closed period
- `H3.7-S4.11` R3 · CRITICAL · RED — [db] book moved after approve: pay with the new book's finance ⇒ payAccount · pay/reverse land in the recorded book A · new book untouched
- `H3.7-S4.12` R3 · CRITICAL · RED — [db] no link: approve ok approvedNoBook · finalized · no JV · accountSystemId null · note · markPaidRun PAID no entry · reverse ok reverseNoBook (Q1)
- `H3.7-S4.13` R3 · CRITICAL · RED — [db] two enabled links ⇒ approve BOOK_AMBIGUOUS · run DRAFT · no entry anywhere
- `H3.7-S4.14` R2 · CRITICAL · RED — [db] mapping PAYROLL_SSO_PAYABLE removed ⇒ MAPPING_MISSING naming it · DRAFT · no entry · audit post_failed code · a run that needs no SSO still posts in that book
- `H3.7-S4.15` R5 · CRITICAL · RED — [db] accrual day in a CLOSED period ⇒ periodClosed · before lockBeforeDate ⇒ lockedMessage · DRAFT · no entry
- `H3.7-S4.16` R4 · CRITICAL · RED — [db] failure after the post (__failFinal) ⇒ no entry (no orphan) · DRAFT · retry ⇒ exactly one · approve again ⇒ approveNotDraft, still one
- `H3.7-S4.17` R4 · CRITICAL · RED — [db] 4 × approveRun ∥ ⇒ one accrual entry · 4 × markPaidRun ∥ ⇒ one PAID, one pay entry, one paid event
- `H3.7-S4.18` R5 · CRITICAL · RED — [db] LATER_RUN (later v2 run APPROVED) and CARRY_BOUND (carry row bound to a later draft) ⇒ fixed texts · no reversal entry · status unchanged
- `H3.7-S4.19` R8 · CRITICAL · RED — [db] H3.4-era run (one-step JV, accountSystemId null): reverse ⇒ 1 reversal of that JV, no hr-payroll entry · markPaidRun of such a run ⇒ PAID, no entry
- `H3.7-S4.20` R8 · CRITICAL · GREEN — [db] [control] v1 golden: v1 run in a linked shop ⇒ one-step JV (AccountManualJV · PAYMENTS · 6000/6000/1010/2100/2130 from run totals) · no hr-payroll key · markPaid posts nothing · reverse 1 reversal
- `H3.7-S4.21` R6 · CRITICAL · RED — [db] scoping: every hr-payroll entry/line in T1 · entry book = run.accountSystemId · T2/T3 books have none
- `H3.7-S4.22` R1 R5 · MAJOR · RED — [db] audits: approve after {accountSystemId, journalEntryId} · reverse after {reversalEntryIds ×2}
- `H3.7-S4.23` R3 · CRITICAL · RED — [db] stored figures inconsistent (Σ lines ≠ gross) ⇒ approve INCONSISTENT · DRAFT · no entry
- `H3.7-Z1` house · CRITICAL · GREEN — no residue
