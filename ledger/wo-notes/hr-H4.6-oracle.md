# H4.6 oracle — check list (`scripts/qc-hr-h4.6.mts`, 56 checks · 53 RED by design · 3 GREEN controls)

Brief: `ledger/hr-briefs/hr-brief-H4.6.md` (DRAFT, defaults in force). Base `session/hr` 9adc3be3c. Red run: `ledger/wo-notes/hr-H4.6-red.txt` (lane DB l2 after seed-hr-qc 33/33; forced: BASE-EXPECTATION 56/56, 3/56 pass = the 3 GREEN controls, every RED reads `∅requestStockCharge (∅ src/lib/modules/hr/stock-charge.ts)` or absent file/table, no crash, RESIDUE none; unforced: SKIPPED exit 0).
Run: `bash scripts/iso.sh bash scripts/qc-hr.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-hr-h4.6.mts` (QC4 confirmation: `qc4.sh`).
Base: `baseRef("QC_H46_BASE")` (merge-base with origin/session/hr). Statics vs base (S12.2, S12.3, S14.1 unchanged-part) become n/a once `hr/stock-charge.ts` is in the base; no check asserts "newest migration".
Time: 2031 dates, `opts.now` injected; Bangkok-month edge 2031-07-01 00:30 +07. Races: 5 lanes same requestKey (S4.3), 3 parallel withdraws (S6.6).
Fixtures: tenant T (u1/u2, HR + INVENTORY systems) + T2 (own HR/INVENTORY). Items A 12,345×20 · B 25,000×50 · C 714,286×10 · D 5,005×2000 · Z 0×5 · S service · X (T2). E1 (u1, linked, base 1,500,000) · E2 (u2, no profile) · E3 (u1, linked to a payroll approver) · E4 · EX ENDED · EI inactive · EO (T2). Fake runs 2031-08 APPROVED · 09 PAID · 11 REVERSED · 12 DRAFT · 2032-03 APPROVED.
Viewers: owner · manager-u1 · payroll-all (read+approve) · payroll-u1 · STAFF request+consume · STAFF request-only · inventory-only · member · employee (linked E1) · payroll staff linked to E3 · other-tenant owner.
Literal money: S2.1 25,000 / 37,035 / 4,999,995 / 15,050 / 8,900 / 5,000,000 / 50,000 · S2.3 7×714,286 = 5,000,002 refused · S2.8 Σ 10,135,980 · S6.2 refund 37,035 (Σ D − A = 0) · S6.3 5,000,000 → 2032-04 · S8.8 cap 150,000 false / 150,001 true. Stock literals S2.7 / S3.5 / S4.x.
For the controller: `qc-hr-h1.3` S6.1 will count `sourceRef` in the new `hr/stock-charge.ts` — needs the narrow exemption in brief Q15 (ORACLE-EDIT on qc-hr-h1.3, not this oracle).

## S1 — migration / schema (4)
- `H4.6-S1.1` MAJOR · RED · [static] migration 20270104000000_hr_stock_charge: CREATE TYPE HrStockChargeKind (ISSUE,DAMAGE) · CREATE TABLE · no ALTER TYPE/DROP
- `H4.6-S1.2` CRITICAL · RED · [static] CHECKs amount 1..5000000 · qty 1..999 · consentRef 1..80 · description ≤ 120 · uniques requestKey/adjustmentId/partial movementId · employee FK RESTRICT
- `H4.6-S1.3` MAJOR · RED · [static] payroll.prisma model + enum · core/scope.ts HrStockCharge: sys()
- `H4.6-S1.4` CRITICAL · RED · [db] HrStockCharge table + columns on the lane DB
## S2 — amount vectors (R5) (8)
- `H4.6-S2.1` CRITICAL · RED · valid vectors: 25000 · 37035 · 4999995 · override 15050 (unit 12345) · manual 8900 · override 5000000 · no-take 50000
- `H4.6-S2.2` CRITICAL · RED · adjustment rows: DEDUCTION · PENDING · INVENTORY_ISSUE · sourceRef hrstock:<key> · 2031-06 · requestedById · runId null · charge row amount = adjustment amount
- `H4.6-S2.3` CRITICAL · RED · amount refusals (7×10^5×7 · override 0/12.5/5000001/-100 · manual w/o override) ⇒ amount text · cost 0 ⇒ noCost
- `H4.6-S2.4` MAJOR · RED · qty refusals 0/-1/1.5/1000 ⇒ qty text
- `H4.6-S2.5` MAJOR · RED · item/desc/kind/key refusals (service · other-tenant item · no item+no desc · desc 121 · kind LOAN · key "short")
- `H4.6-S2.6` CRITICAL · RED · refusals write nothing (adjustments · charges · movements · stock unchanged)
- `H4.6-S2.7` CRITICAL · RED · stock literals after S2: B 49 · A 15 · D 1001 · Z 4 · C 10 · 5 HR movements (OUT, qty literal)
- `H4.6-S2.8` CRITICAL · RED · Σ E1 PENDING INVENTORY_ISSUE deductions = 10135980
## S3 — gates (R3) (5)
- `H4.6-S3.1` CRITICAL · RED · allowed: owner · manager-u1 (u1 emp) · STAFF request+consume · STAFF request-only with takeStock=false
- `H4.6-S3.2` CRITICAL · RED · STAFF request-only + takeStock ⇒ invAccess (no row, no stock)
- `H4.6-S3.3` CRITICAL · RED · noAccess identical bytes: mgr-u1→u2 emp · inventory-only · member · payroll-only · other tenant · unknown id · other-tenant inv system · non-INVENTORY system
- `H4.6-S3.4` CRITICAL · RED · own row ⇒ self (payroll staff linked to E3)
- `H4.6-S3.5` CRITICAL · RED · gate refusals write nothing · item B = 47 after gates
## S4 — idempotency / races (R6) (5)
- `H4.6-S4.1` CRITICAL · RED · same key twice ⇒ same chargeId · replayed · 1 adjustment · 1 movement · stock once
- `H4.6-S4.2` CRITICAL · RED · same key, other qty ⇒ replayDiff · nothing changed
- `H4.6-S4.3` CRITICAL · RED · [race] 5 lanes same key ⇒ one charge/adjustment/movement · stock once
- `H4.6-S4.4` CRITICAL · RED · resume: inventory movement already written for the key ⇒ charge reuses it · stock once
- `H4.6-S4.5` MAJOR · RED · two keys same input ⇒ two charges
## S5 — period targeting (R6) (3)
- `H4.6-S5.1` CRITICAL · RED · Bangkok month: 2031-07-01 00:30 +07 ⇒ 2031-07
- `H4.6-S5.2` CRITICAL · RED · live runs skip: Aug APPROVED + Sep PAID ⇒ 2031-10 · Nov REVERSED ⇒ 2031-11 · Dec DRAFT ⇒ 2032-01
- `H4.6-S5.3` CRITICAL · RED · no INVENTORY_ISSUE row bound to a run · fake runs untouched
## S6 — withdraw / reversal (R7) (6)
- `H4.6-S6.1` CRITICAL · RED · withdraw PENDING ⇒ REJECTED (decidedById) · withdrawnAt/ById · status WITHDRAWN · second ⇒ withdrawn text
- `H4.6-S6.2` CRITICAL · RED · withdraw APPROVED ⇒ refund ALLOWANCE 37035 PENDING hrstock:<key>#refund 2031-06 · original untouched · Σ D−A = 0
- `H4.6-S6.3` CRITICAL · RED · withdraw APPROVED bound to APPROVED run ⇒ refund in 2032-04 · original row/run untouched
- `H4.6-S6.4` CRITICAL · RED · withdraw rights: requester own PENDING ok · requester other's ⇒ withdrawPerm · manager w/o payroll ⇒ withdrawPerm · linked employee ⇒ self · member ⇒ noAccess
- `H4.6-S6.5` MAJOR · RED · adjustment deleted on payroll page ⇒ status REMOVED · withdraw ⇒ NOOP
- `H4.6-S6.6` CRITICAL · RED · [race] 3 parallel withdraws of an APPROVED charge ⇒ exactly 1 refund
## S7 — approval (H1.3 rules) (2)
- `H4.6-S7.1` CRITICAL · RED · nothing APPROVED without a decision (all charge rows PENDING after S2–S5)
- `H4.6-S7.2` CRITICAL · RED · decideAdjustment: requester ⇒ own-request text · linked employee ⇒ own-row text · payroll approver ⇒ APPROVED
## S8 — privacy / reads (R8–R9) (8)
- `H4.6-S8.1` CRITICAL · RED · list viewers: owner/payroll obj · manager w/o payroll · request staff · member · employee ⇒ null · other tenant sees none of T
- `H4.6-S8.2` CRITICAL · RED · list keys exactly (18) · status/period literal
- `H4.6-S8.3` CRITICAL · RED · branch scope: payroll viewer [u1] sees E1 charges, none of E2
- `H4.6-S8.4` CRITICAL · RED · myStockCharges: own rows only · keys exactly (10) · member ⇒ none
- `H4.6-S8.5` CRITICAL · RED · inventory movement: sourceModule HR · refType HrStockCharge · refId key · note null · no employee/amount
- `H4.6-S8.6` CRITICAL · RED · outbox: 1 event per charge · payload exactly {chargeId, employeeId} · key …#chargeId · systemId HR
- `H4.6-S8.7` CRITICAL · RED · audit hr.stock_charge.request: ids only (no amount, no consent ref)
- `H4.6-S8.8` MAJOR · RED · overCap: 150000 false · 150001 true · 4999995 true · no profile null
## S9 — ENDED (2)
- `H4.6-S9.1` CRITICAL · RED · ENDED / inactive employee ⇒ ended text · nothing written
- `H4.6-S9.2` MAJOR · RED · PENDING charge stays PENDING after the employee ends
## S10 — event (R10) (2)
- `H4.6-S10.1` CRITICAL · RED · consumer registered · replay ×2 ⇒ 1 notification to the linked user · title notify · no amount/item
- `H4.6-S10.2` MAJOR · RED · [static] labels: event once · consumer hunk marked
## S11 — consent (2)
- `H4.6-S11.1` CRITICAL · RED · consent refusals (missing · unconfirmed · empty ref · 81 chars · tomorrow · bad date) ⇒ consent text · nothing written
- `H4.6-S11.2` CRITICAL · RED · consent recorded: ref · date · recordedBy = requester · 80-char ref accepted
## S12 — cross-module hunks (3)
- `H4.6-S12.1` CRITICAL · RED · [static] stock-charge imports inventory only via "@/lib/modules/inventory" · no raw prisma · tx client
- `H4.6-S12.2` MAJOR · RED · [static] fitness ALLOWED_EDGES "hr→inventory" in one marked hunk
- `H4.6-S12.3` MAJOR · RED · [static] outbox-consumers: one marked hunk · labels one hunk
## S13 — actions / UI (3)
- `H4.6-S13.1` MAJOR · RED · [static] actions "use server": 2 wrappers · requireTenant · no now
- `H4.6-S13.2` MAJOR · RED · [static] ui testids · tokens · 44 px · payroll page mounts · source chip
- `H4.6-S13.3` MINOR · RED · [static] inventory rows · hr.stock th=en
## S14 — frozen controls (2)
- `H4.6-S14.1` CRITICAL · GREEN · [static] payroll-rules sha · payroll.ts/privacy.ts/inventory/**/inventory.prisma unchanged vs base
- `H4.6-S14.2` CRITICAL · GREEN · [db] manual requestAdjustment ⇒ sourceType/sourceRef null · consumeBatch same key ⇒ same movement
## Z1 — residue (1)
- `H4.6-Z1` CRITICAL · GREEN · no residue
Typecheck (rm .next/types; iso 14000M): exit 0.
