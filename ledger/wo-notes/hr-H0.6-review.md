# H0.6 — reviewer report (read-only, fresh eyes)

> Tree `/root/projects/shark-hr` · branch `wip/pos-hr-h0.6` · head **11bb1171** (verified) · base `merge-base HEAD origin/session/hr` = 103fde95 · scope `git diff 103fde95..HEAD -- src prisma` + oracle edits (h0.1 S4.2/S4.3/X6.6, h0.2 S5.3, h0.6 S7.2) · 22 Oct 2026 · reviewer: Claude Opus 5.5
> No edits, no DB, no build/typecheck. Only this file was written (not committed).

## Verdict: **ACCEPT WITH NOTES**
No blocking defect in product code. One runbook statement is wrong and must be fixed before deploy (R1, text only). R2 is a deploy pre-check. R3 is a narrow money race worth a small fix or a logged debt.

## Findings (ranked)

| id | sev | where | what is wrong | smallest fix |
|---|---|---|---|---|
| R1 | MEDIUM (deploy/runbook) | `prisma/migrations/20261202000000_hr_payroll_run_live_unique/migration.sql:4` · `ledger/wo-notes/hr-H0.6.md` PAUSE STOP §R1 "Prod order" + debt row "prod order" | The notes say "deploy code first (it works under both indexes), then migrate". It does not. The new Prisma client selects `reversedAt`/`reversedById` on every full-row read of `HrPayrollRun` (`listRuns` `include` payroll.ts:1155, `payslipData` `findFirst` with no select :1174, `approveRun` :988), and `reverseRun`'s raw UPDATE writes `reversedAt` (:1064). Until the migration runs, the payroll page returns 500 and every reverse fails with TX_FAILED. This is the same failure as the 1 Sep `pinnedAt` incident. Going the other way is safe: the migration is additive for old code (old dup check counts every run, so it never inserts a second row for a period; old client never selects the new columns). The real prod pipeline (`scripts/vercel-build.sh`) already runs `migrate deploy` **before** `next build`. | Change the text in both places to: "migrate first (the Vercel prod build does `migrate deploy` before `next build`). The swap is safe for old code. Run it outside pay-day hours." No code change. |
| R2 | MEDIUM (deploy pre-check, data-dependent) | migration + `liveRunWhere` payroll.ts:32-35 | REVERSED runs created **before** H0.6 still have their adjustments bound (`runId` = old run, the old `reverseRun` never unbound them), and their CRM commissions stay PAID. After the migration those periods become "open": `createPayrollRun` is allowed, but `buildRunRows` only takes `runId IS NULL` rows. The new run silently drops those OT/deduction/commission rows, and neither `strandedAdjustments` nor `hr.payroll.reversed` ever sees them. | Add to the runbook a read-only pre-check on prod: `SELECT r."id", r."periodKey", count(a."id") FROM "HrPayrollRun" r JOIN "HrPayAdjustment" a ON a."runId" = r."id" WHERE r."status" = 'REVERSED' GROUP BY 1,2;` If 0 rows, nothing to do. If > 0, the controller rules on a one-off backfill (unbind and emit `hr.payroll.reversed#<id>` per run, i.e. call the same steps) or leaves them documented. |
| R3 | LOW-MEDIUM (money, narrow race) | `crm/commissions.ts:2120-2168` `onPayrollReversed` | Check-then-act across modules. The consumer reads `adjustmentsByIds` (R2 still APPROVED), then (a) `markPaid(R2)` commits, (b) `onPayrollPaid(R2)` runs and changes 0 rows because C1 is still PAID from R1, then (c) the reversed consumer's update sets C1 PAID→APPROVED. End state: R2 is PAID but C1 is APPROVED, and nothing re-pays it. The window is between one read and one update, so it is rare. It is not covered by X9.2, which tests a *late* event, not an interleaved one. | After the update loop, re-read `adjustmentsByIds` for the changed pairs. For any row now bound to a `runStatus === "PAID"` run, run the same guarded `updateMany` with APPROVED→PAID (pair rule, `reversedOfId: null`) and write one audit. This converges whichever of (b)/(c) lands last. About 8 lines inside the H0.6 block. Or log it as a debt for the money hunter. |
| R4 | LOW | payroll.ts:1074-1076 + :1125 | `reverseEntry` can return `{ skipped: true }` (entry not POSTED and no reversal points at it). The code then gives `jvReversed:false` and the success text `REVERSE_OK_NO_ACCOUNT` "…ไม่พบระบบบัญชี…". That text is wrong, because the ACCOUNT system exists and only the entry was not reversible. | Keep the behaviour, use a distinct text, e.g. `REVERSE_OK_JV_SKIPPED = "กลับรายการเงินเดือนเรียบร้อย — รายการบัญชีเดิมไม่อยู่ในสถานะที่ต้องกลับ จึงไม่ได้ลง JV กลับรายการ"`, chosen when `liveAcct && !reversalEntryId`. Add `jvSkipped:true` in the audit. |
| R5 | LOW | `crm/commissions.ts:2158-2163` | The `crm.commission.unpaid` audit is written after a committed `updateManyAndReturn` (separate statement, no tx). If the process dies between the two, the audit is lost for good: a replay changes 0 rows, so it writes 0 audits. This is the house "audit after commit" pattern, so I note it rather than block on it. | Optional: wrap the chunk update and its audits in one `prisma.$transaction` (CRM module, not under the hr/** F5.1 rule). Or accept. |
| R6 | INFO | payroll-actions.ts:181-183 | With the action-level audit removed, the free-text `reason` is no longer in any audit row. It survives only in `HrPayrollRun.note` and the JV memo. This is acceptable and arguably better for PDPA, since free text may carry names. | None. Mention in the notes. |
| R7 | INFO (comments) | payroll.ts:144 "(ทุกสถานะ รวมร่าง)", :590 "unique (systemId, periodKey) เป็นด่านสุดท้าย", :1210 "(ทุกสถานะ)", :1310 "(ทุกสถานะ)" · `crm-bridges/commissions.ts:3` "ตัวรับ 4 ตัว" (now 5) · `qc-hr-h0.1.mts:51` "hashes taken on the base (f85f5455)" (SCHEMA/CRM_BLOCK now H0.6 values) · `hr/index.ts` H0.6 block has no closing `// ◂ HR H0.6` after the two exports (the C3.3 block above has one) | These comments are stale since H0.6. | Fix the comment wording and add the closing marker at merge time. |
| R8 | INFO (merge) | `src/lib/modules/hr/index.ts` | `git merge-tree origin/session/hr HEAD`: **CONFLICT** in `hr/index.ts`. Both H0.5 and H0.6 append at EOF. Every other file merges clean. Migration order is fine (H0.5 `20261201000000` < H0.6 `20261202000000`). | Resolve by keeping both blocks. Run `qc-hr-h0.6` S8.5 with `QC_H06_BASE` set to the merged base. |
| R9 | INFO (UI, R8 out of scope) | payroll-ui.tsx:282/334/339 | The `data-testid`s keyed by `periodKey` (`hr-payroll-run-<P>-negative/-partial/-exclusions`) can now repeat, because a REVERSED run and a live run of the same period can both show. React keys use `r.id`, so rendering is fine. | Carry to H3.4 (key by run id). |

## Item 4 — `crmCommissionBridge("onPayrollReversed" as never)`
**Recommendation: widen the union and drop the cast.** `as never` turns off the only compile-time check that the bridge exports that name. If the function is renamed or removed, typecheck still passes and every `hr.payroll.reversed` event fails at runtime (`bridges[name] is not a function`). It is the retryable first step (`crmFirst`), so the event retries forever and commissions stay PAID with no warning. The C3.3 block's owner (CRM v2 RUN) has finished (53/53), so editing it carries little conflict risk. Hunk (`src/lib/outbox-consumers.ts`):

```diff
 const crmCommissionBridge =
-  (name: "onPayrollPaid" | "onCommissionCreated" | "onCommissionApproved" | "onCommissionReversed"): OutboxHandler =>
+  (name: "onPayrollPaid" | "onCommissionCreated" | "onCommissionApproved" | "onCommissionReversed" | "onPayrollReversed"): OutboxHandler => // HR H0.6 ▸ + onPayrollReversed ◂
@@
-  "hr.payroll.reversed": crmFirst(crmCommissionBridge("onPayrollReversed" as never), withAutomation(async () => {})), // HR H0.6 ▸ … (ชนิดของชื่อ :556 เป็นของ CRM) ◂
+  "hr.payroll.reversed": crmFirst(crmCommissionBridge("onPayrollReversed"), withAutomation(async () => {})), // HR H0.6 ▸ hr/payroll.ts#reverseRun {runId, periodKey, adjustmentIds} → CRM คืน PAID→APPROVED ครั้งเดียว ◂
```
That is 2 marked lines in the hot file instead of 1. If the controller keeps the one-line rule, the cast works at runtime today (the export exists, `crm-bridges/commissions.ts:74`) and S8.1 statically checks that the export exists. In that case log it as a debt.

## Verified correct
1. **Raw SQL under the ACCOUNT scope.** Every HR statement in the tx is a tagged template that binds `tenantId` and the HR `systemId`:
   - lock helpers payroll.ts:655-669 (advisory key = HR systemId + period; `lockRunRow` binds id+tenant+system, FOR UPDATE)
   - claim UPDATE :1064-1068
   - SELECT … FOR UPDATE :1079-1082
   - unbind UPDATE :1084-1086
   No `*Unsafe` and no string-built SQL (the `why` text is a bound parameter). Every statement uses `tx`, including `reverseEntry(…, tx)` :1074, whose `withTx` sends every account query through that tx (gl.ts:1054-1117). `emitOutbox(tx, …)` keeps `systemId` = HR because `OutboxEvent` is tenant-scoped (scope.ts:52), so the acct-scoped extension does not rewrite it. `AppSystem` is tenant-scoped (:225). Audit (`writeAudit`) and `logOps` run after commit or in the catch, outside the tx. The design note (acct-scoped tx because `AccountJournalEntry` is system-scoped and the extension stays active in the itx) is correct: db.ts:88-160.
2. **One transaction.** Freeing the period, unbinding, setting REVERSED (+`reversedAt` UTC, `reversedById`, note), the JV reversal and the event all happen in one tx :1055-1097. A JV throw is wrapped as `JvReverseFailed`, so the whole tx rolls back and the user sees a fixed text :1101-1108. `ReverseUnbindMismatch` also rolls back. Guards: NOT_FOUND / ALREADY_REVERSED / NO_JV (today's text, OQ-1) / BAD_STATUS :1059-1062, plus a guarded UPDATE with count = 1. No `e.message` reaches `note` (`reverseErrorCode` logs name/code only, :1543-1548).
3. **Lock vs `createPayrollRun` (S6).** Both use the identical key `hr:payroll:run:<systemId>:<periodKey>` (:596 and :656). Reverse takes it before the row lock, so a create for the same period waits and then sees REVERSED, which is excluded, and goes ahead. Lock order is advisory → run row → account → adjustments, consistent with create (advisory → adjustments) and approve (run row → account). `markPaid` ∥ reverse is serialised by the run row lock, and the loser's guarded UPDATE matches 0 rows. Reversed-before-paid event ordering is harmless (`onPayrollPaid` sees no bound items).
4. **FREEZE.** `git diff 103fde95..HEAD --stat -- src/lib/modules/hr/payroll-rules.ts` is empty (sha 75a66c0c… = RULES_SHA). `reverseRun` never touches `HrPayrollItem` and recompute is still DRAFT-only. `account/**` is not in the diff (JV Dr=Cr is untouched; `reverseEntry` swaps Dr/Cr).
5. **`liveRunWhere` coverage.** Every period→run lookup uses it:
   - `requestAdjustment` :148
   - `decideAdjustment` :218 / :224
   - `createPayrollRun` :593
   - `strandedAdjustments` :1216
   - `moveStrandedAdjustment` :1248 / :1253
   - `requestCommissionAdjustment` :1311
   - `payrollRunPeriods` :1348 (the CRM callers at commissions.ts:757/1011/1106 inherit it)
   - `moveCommissionAdjustmentPeriod` :1452-1453
   - `strandedCommissionAdjustments` :1487

   Lookups by id (`cancelAdjustment` :278, `adjustmentsOfRun` :1392, `approveRun`, `markPaid`, `payslipData`, `listRuns`) are correctly unfiltered. No reader of `HrPayrollRun` exists outside `hr/payroll.ts` (grep `src/**`).
6. **Replay guard (ruling b).** `onPayrollReversed`:
   - requires the run to be REVERSED (`adjustmentsOfRun`)
   - applies the pair rule `{id: crmCommissionId, hrPayAdjustmentId}` with `status: PAID` and `reversedOfId: null`
   - skips rows bound to a PAID run, logging a WARN with ids only
   - uses `updateManyAndReturn`, so only rows that actually changed get an audit, and a replay or parallel delivery gives 0/0
   - chunks by 500, with integer status only and no money arithmetic

   `adjustmentsByIds` (payroll.ts:1570-1597) is `tenantDb`-scoped plus `systemId`, deduped, and length-capped. The bridge (`crm-bridges/commissions.ts:74-82`) reads the gate without being swallowed by it, like `onPayrollPaid`. A forged event or a foreign tenant finds 0 rows.
7. **CRM seam.** No `qc-crm-c3.3`-relevant behaviour changed. The CRM block of payroll.ts differs only by the live filters (h0.1 S4.3 / h0.2 S5.3 hashes recomputed and the green runs match). R5 clawback rows are skipped by status. Builder runs: c3.3 90/90 and payroll-reverse 14/14.
8. **Migration.** It drops the right name (`HrPayrollRun_systemId_periodKey_key`, created at 20260716150542:68 as an index, so `DROP INDEX` is correct). The partial unique `…_live_key WHERE "status" <> 'REVERSED'` sits on NOT NULL columns, so there is no NULL edge. Creating it cannot fail on existing data, because the old full unique guaranteed no duplicates. ADD COLUMN ×2 is nullable with no default, so it is metadata-only. The whole file is one implicit transaction (multi-statement script). `CONCURRENTLY` is not needed: the table is small, and it cannot run inside the migration tx anyway. The schema comment forbids re-adding the full unique. The drift gate has the same partial-index precedent (crm_v2_b/c, kanban, member).
9. **Privacy.**
   - payload is exactly `{runId, periodKey, adjustmentIds}` :1094
   - success audit holds status, ids, counts and a jv flag :1116-1124
   - refusal audit holds `{runId, code}` :1550-1561
   - CRM audit holds status, via and runId
   - logOps holds ids and an error code

   No names, amounts or notes. DTO whitelists (`privacy.ts`) are not in the diff.
10. **Oracle edits.** Each is the smallest hunk:
    - h0.1 `SCHEMA_SHA` (= sha256 of the current payroll.prisma, 2636c177… verified) and `CRM_BLOCK_SHA`; `MARKPAID_BLOCK_SHA` is unchanged
    - h0.2 `BASE_HASH.stranded` (signature constant unchanged)
    - h0.6 S7.2, a real `null ?? "x"` harness bug; the new form is stricter because a missing row fails

    The X6.6 change keeps Σ items = totals and the orphan and dangling checks on every run. It only skips the per-item = Σ bound check for REVERSED runs, and adds the correct H0.6 invariant "REVERSED ⇒ 0 bound rows". S1–S8 keep their meaning.
11. **House rules.** HR writes outside the ruled block go through `tenantDb`. Comments are in Thai with `HR H0.6 ▸ … ◂` markers. No `console.*` was added (the `console.error` at payroll-actions.ts:298/315 predates H0.6). Who can reverse is unchanged (`hr.payroll.approve` + `canViewPayroll`, payroll-actions.ts:175). The actor comes from the session, like the other actions.

## git status
`git status --short` → `?? ledger/wo-notes/hr-H0.6-review.md` (this file only).
