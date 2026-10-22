# H0.6 r3 — reviewer report (read-only, fresh eyes)

Tree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.6` · head **91a1c2cb** (verified) · scope `git diff d838fccf..91a1c2cb -- src prisma scripts/qc-hr-h0.6.mts` + r3 notes, hunt, r2 review, brief COMMON §C. No edits apart from this file. No DB, build, typecheck or unit touched.

## Verdict: **ACCEPT WITH NOTES**

The converging handlers are correct. They lock first and then read HR on the same tx. The target rule matches the ruled global rule. Writes are guarded and replays are no-ops. The R3.2 guard is under the period lock, before any write. The oracle edit is minimal. The schema is unchanged. The frozen hashes are unchanged; I recomputed them myself. There are no blockers. Two LOW notes follow, and the first one should be applied when convenient.

## Findings (ranked)

| id | sev | file:line | defect | smallest fix |
|---|---|---|---|---|
| **R3-1** | LOW | `src/lib/modules/crm/commissions.ts:2168` | `CONVERGE_TX_OPTS = { maxWait: 60_000, timeout: 600_000 }` is larger than the budget of the only prod caller. The outbox cron route has `maxDuration = 60` (`src/app/api/cron/outbox/route.ts:8`). The platform kills a hung chunk long before Prisma's 600 s timeout fires. The `FOR UPDATE` row locks and the pool connection then stay held until the backend notices the dropped client, which is worse through a pooler. In that window, approve/reject/clawback (`lockRow` :248) on those commissions block. A 60 s `maxWait` alone already uses the whole function budget. | `{ maxWait: 10_000, timeout: 30_000 }` (see the recommendation below). Replays are idempotent, so a timeout only means one retry. |
| **R3-2** | LOW (R5 debt class, now slightly wider) | `commissions.ts:2208-2226` | Audits are written only after **all** chunks have committed. If chunk k > 1 throws (timeout, deadlock abort, pool error), chunks 1..k-1 are committed but unaudited. On the outbox retry those rows are already at their target, so they produce 0 changes and the audit rows are lost for good. The r2 code audited per chunk. A throw from the audit itself is not a problem: `writeAudit` swallows its errors (`src/lib/core/audit.ts:26`), so it cannot cause a retry or a double write. It only happens with more than 500 commission rows in one event, so it is rare. | Audit each chunk right after it commits: move the `for (const c of part)` audit loop to just after `changes.push(...part)` (:2208), or write the audit inside the tx. |
| R3-3 | INFO | `commissions.ts:2201-2204` | One `UPDATE` per row, so up to 500 round trips per tx. Correct and guarded, and it costs ≈1–5 s per full chunk. A set-based `UPDATE … FROM (VALUES …)` would be faster, but it is not needed. | none / later |
| R3-4 | INFO | `src/lib/modules/hr/payroll.ts:1581,1588` | `opts: { tx?: unknown }` is then cast to `Prisma.TransactionClient`, so the type checker never verifies what a caller passes. The only caller passes a real `Prisma.TransactionClient` (commissions.ts:2185 `Tx`). | Optional: type it as `Prisma.TransactionClient`. |
| R3-5 | INFO | `payroll.ts:597-601` | The legacy guard joins `HrPayAdjustment.runId`, which has no index. The planner will scan by the `(systemId, …)` index prefix. That is one bounded scan per `createPayrollRun`, which is negligible. | none |
| R3-6 | INFO | `commissions.ts:2142` | `onPayrollReversed` now returns the gross `unpaid` (r2 returned `unpaid − repaid`). The bridge ignores the return value (`src/lib/outbox-consumers.ts:555-559`), so nothing changes. | none |

## tx-timeout recommendation

Use `CONVERGE_TX_OPTS = { maxWait: 10_000, timeout: 30_000 }`. Do not reduce the chunk size: 500 is fine.

A full chunk does 1 locking SELECT, 1 HR read (PK `IN` + the unique `(runId, employeeId)` probe) and at most 500 single-row UPDATEs. That is seconds, not minutes. 30 s leaves room for lock waits behind `lockRow` users and still finishes inside the 60 s outbox function. The handler is idempotent, so a timed-out chunk just retries. If the controller prefers to match `REVERSE_TX_OPTS` (`payroll.ts:1524`, 20 s / 120 s), that is acceptable only if the outbox route's `maxDuration` is raised to match. Otherwise the timeout is fiction.

## Verified correct

1. **convergeCommissions**
   - **Lock statement** (`commissions.ts:2186-2190`): a tagged-template `$queryRaw`. It binds `"tenantId" = ${tenantId}` and uses `Prisma.join(chunk)`. The chunk is never empty: `ids.length === 0` returns early at :2178, and `slice(i, i+500)` with `i < ids.length` is always non-empty. It has `reversedOfId IS NULL` and status ∈ {APPROVED, PAID}, plus `ORDER BY "id" FOR UPDATE`. LockRows sits above the Sort, so locks are taken in id order. `ids` is sorted globally (:2177) and chunks commit one after another, so a converge holds at most one chunk's locks.
   - **No deadlock with other lockers:** every other `CrmCommission` lock is single-row. That covers `lockRow` :248 and every `crmCommission.updateMany` (:910/941/1027/1049/1059/1388/1402/1885), so there is no lock-order cycle. Converge takes no HR row lock or advisory lock (it only reads HR), so it has no cycle with markPaid, reverseRun or the X4 path.
   - **Same tx for the HR read:** `adjustmentsByIds(…, { tx })` (:2193) uses `opts.tx` (`payroll.ts:1588`), so there is no second connection under the lock (§C.8, HF-HR-0 5d). The tx comes from `tenantDb({tenantId})`, whose extension does not touch raw SQL, so the raw queries keep their explicit bindings. There is no global `isolationLevel` override, so it runs at READ COMMITTED. Each statement takes a fresh snapshot, so the HR read after the lock sees every markPaid/reverseRun that committed earlier. That is the converge argument.
   - **Pair rule:** `want.get(r.id) === r.hrPayAdjustmentId` (:2191) and `a.crmCommissionId === r.id` (:2197). Dedup to the first pair per commission is safe because of the partial unique on `HrPayAdjustment.crmCommissionId` (`prisma/migrations/20261102000000_crm_v2_c/migration.sql:214`).
   - **Target rule** (:2198-2199):
     - APPROVED iff `runId === null` or the run is DRAFT/APPROVED.
     - PAID iff the run is PAID **and** `hasItem`.
     - Everything else is `null`, which means skip. That covers REVERSED (legacy), a PAID run without an item, and a run row that is missing or in another system (LEFT JOIN null ⇒ `runStatus` null with `runId` set ⇒ skip).
     - This matches the ruled global rule.
   - **Guarded writes:** `target === r.status` is skipped (:2200), so replays write nothing and `updatedAt` is kept. The UPDATE guards on prior status, tenant and `reversedOfId IS NULL`, and `n === 1` is checked (:2201-2205).
   - **Cross-system:** the CRM `systemId` is taken from the locked row and used for the audit scope. The HR `systemId` is used only for the HR read. The SELECT intentionally scopes the CRM side by tenant only, because the pair binding through `hrPayAdjustmentId` plus the HR-system-bound read is the real join.
   - **Audits:** written after commit, only for rows that changed. `unpaid` uses `PAYROLL_REVERSED` or `PAYROLL_PAID_RECHECK`. `repaid` is written only in REVERSED_EVENT mode. APPROVED→PAID in PAID_EVENT mode writes no audit, as before (:2213-2224).
2. **onPayrollPaid delegation**
   - **Append-only:** `git diff d350c26c..91a1c2cb --numstat` gives `109 0` (0 deletions). The single marked line is at `commissions.ts:1415`. The `H06_R3_CONVERGING = true as boolean` const (:2167) is module-level and only read at call time, so there is no TDZ issue.
   - **Dead body:** the old body (:1416-1426) is unreachable and harmless. The narrowing explanation is plausible: after an unconditional `return`, TS stops narrowing in the unreachable tail, and the `boolean` widening keeps the tail "reachable" for the checker.
   - **Paid path, old vs new:** the candidates are the same (`adjustmentsOfRun`, H4 at `payroll.ts:1400-1411`), and `hasItem` (`payroll.ts:1592-1595`) is the same H4 predicate. Converge sets PAID in exactly the cases where the old code did, unless the HR state changed between the event and the lock (run reversed, row unbound). In those cases not setting PAID is the intended fix (F1a).
   - **New behaviour:** a PAID row can go to APPROVED (`PAYROLL_PAID_RECHECK`) when its adjustment was unbound in the meantime. This is correct convergence.
   - **Coverage:** the notes report `qc-crm-c3.3` at 90/90 on 101b2852 and on e8ce78a7, and it pins behaviour, not text.
3. **adjustmentsByIds** (`payroll.ts:1581-1603`)
   - It is a tagged template. It binds the HR `tenantId` and `systemId` on `a`, joins `r` and `it` through `a`'s tenant/system, and uses `Prisma.join` on a non-empty slice: there is an empty guard at :1584 and the 64-character id filter.
   - `hasItem` is true only when the employee has an item in **that** run (`it.runId = a.runId AND it.employeeId = a.employeeId`), and false when `runId` is null.
   - `runStatus` is null when unbound.
   - `Prisma` became a value import, with a marker (:2).
4. **R3.2 guard** (`payroll.ts:595-602`)
   - It runs inside the tx after `pg_advisory_xact_lock` on `hr:payroll:run:<system>:<period>` (:589) and after the dup check, before `buildRunRows` and before any write.
   - It binds tenant, system and period on `r`, and tenant and system on `a`.
   - It uses a fixed Thai constant `LEGACY_REVERSED_BOUND_TH` (:1521), which is different from the dup text and carries no id, name or amount.
   - **Hashes recomputed here** with the oracles' slicing (h0.1 `seg`, h0.2 `fnRegion`): CRM block `33ec8e46…`, markPaid `893a9e4e…`, stranded `bf3c0b67…`, rules `75a66c0c…`. All four equal the frozen constants.
5. **Oracle S10.6 ORACLE-EDIT:** `git diff 8480089f..91a1c2cb -- scripts/qc-hr-h0.6.mts` = +7/−5. It touches only the S10.6 registry line (:139) and the S10.6 block (:1461-1478): the DRAFT row moves out of `others`, and `dr` is asserted as APPROVED with un=1, re=0 and still bound. That is the global rule. `d838fccf..8480089f` has no deletions, so S1–S9 and X≤9 are untouched.
6. **Migration/schema:** `git diff d838fccf..91a1c2cb --stat -- prisma` is empty.
7. **House rules:**
   - Thai comments and `HR H0.6 r3 ▸ … ◂` markers are on every new hunk.
   - No `console.*` among the added lines.
   - `payroll-rules.ts` is byte-identical (empty diff against d350c26c, and the hash matches).
   - fitness F5.1 counts only raw `prisma` imports, and the new `tenantDb` import (`commissions.ts:36`) is not one.

## git status --short (at review end)
```
?? ledger/wo-notes/hr-H0.6-control1.txt
?? ledger/wo-notes/hr-H0.6-control2.txt
?? ledger/wo-notes/hr-H0.6-review-r3.md
```
The first two are the controller's files. The third is this report, not committed.
