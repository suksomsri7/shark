# P2.3 R2 review: `wip/pos-p2.3` 06f2d825 (code 09e2ca11) · diff 14dec332...06f2d825 · read-only
**Verdict: MERGEABLE.** F1, F2, F3, F5, F6 and F8 are fixed as ruled, and round 2 changes logging only. No Medium or higher findings. N1 is optional hardening.

## Findings
- **N1 Low: the post-batch re-read can throw after the sale has committed.** `service.ts:903-905` (the re-read, `restoreVoidedInventory` and `restockSaleRefunds`) sits outside any try.
  - A DB error there now escapes `consumeSaleInventory`. On submit (`register.ts:2250`) it reaches the generic `throw e`, so the cashier sees an error on a committed bill. In the retry loop (`service.ts:1062`) it aborts the run with INTERNAL and writes no audit. A second click is safe because the keys are idempotent.
  - The same risk already existed for the reads at :867-876, so this is Low. Smallest fix: wrap :903-905 in try/catch and `console.error(STOCK_CUT_FAILED-style, {saleId, code})`.
- **N2 Info: brief item 8's premise does not hold.** Merge 0eec926f brought app code from session/pos 6f90a2c1: HF-P1CLOSE UI (`products/page.tsx`, `settings/*`, 4 register components, +2 message keys), plus `qc-pos-p2.6.mts`, `visual-pos.mts`, `qc-hf-pos-page-authz.mts` and `pos-ui-inventory.json`.
  - All of it is identical to 6f90a2c1: `diff 6f90a2c1 06f2d825 -- . ':!ledger'` lists P2.3 files only. The notes describe the merge accurately ("HF-P1CLOSE UI + P2.6 oracle + ledger"). `qc-pos-p2.8.mts` and `qc5.sh` were already on 14dec332. No action needed.
- **N3 Info: a crash-only window remains for F6.** If the process dies between the batch commit and the re-read (:880→:903), a VOIDED sale keeps its OUT. It is no longer PAID, so it is not pending and nothing retries it.
  - Restore failures on this path are only logged (:926, and the `restoreVoidedInventory` onError). This is the same class as F7 (pending-restore follow-up, already recorded).
- **N4 Info:** the skipped-part log lines (:896) repeat every time `consumeSaleInventory` runs for a sale that has a SERVICE or NOT_FOUND part. Logging only.

## Verified OK
1. **F1.**
   - After a successful batch, `service.ts:903-905` re-reads the sale; `refundedSatang>0` triggers `restockSaleRefunds` (:913-930), which handles every REFUND doc through `restockRefundDoc` (:938-973) with the same `pos-refund-<refund>-<line>[-<inv>]` keys.
   - `refund-consumer.ts:131-139` now calls the same function. Partial-refund walk (latte ×2, refund 1, restock): wanted, parts, keys, the OUT lookup and `returnStockAtOriginalCost` are line-for-line the old code, so the behaviour is byte-identical. The `some()` pre-check only gates `systemForUnit` as before.
   - V6 (`qc-pos-p2.3.mts:103,1819-1858`) checks OUT ×2, refund IN 18/150/1/1 at the OUT cost, net = −1 latte, and no new rows on replay. Red-before on 88604d75 (code 276a1934) was 45/46 for the stated reason ("IN [] · net beans-36…"); fdccdf4c was 46/46.
2. **F2.** `posDayStart()` (:1016) is used by `registerStatus` (`register.ts:2502`) and by the retry (:1051). Omitting `since` means today; `since: null` means all time. The action passes `{since: posDayStart()}` (`register-actions.ts:335`) and takes only `{systemId, unitId}`, so `null` cannot be reached from the action or U.
3. **F3.** `catalog.loadRowPortions` (:605-645) is the single calculator, used at `register.ts:767` and `catalog.ts:1036`.
   - An untracked BUNDLE component (C2 via `effectiveTrackStock`; no row means AUTO; `@@unique([systemId, invItemId])` gives one row) maps to `undefined`, so portions are `null` (`recipe-shared.ts:59`). A tracked negative gives 0. MENU rows use raw on-hand, and A2 is green.
   - The `stockLeft` and `listForUnit.stock` formulas are unchanged.
4. **F5.** `lockItemsInTx` takes a 4th arg that defaults to `"15s"` (`inventory/service.ts:163-168`). All 12 other call sites pass 3 args: `account/bundle.ts:88`, `product.ts:906,1324`, `pos/service.ts:582`, `stock-count.ts:451,622,961`, and 5 in `qc-hf-inventory-atomic`. `consumeBatch` passes `"5s"` (:767).
5. **F6.**
   - VOIDED calls `restoreVoidedInventory` (:904) with the `pos-refund-<sale>-<mv>` keys, so it is idempotent with void's own restore. REFUNDED goes through the refund-doc path only; this deviation is recorded and sound.
   - The PAID→void race is closed under READ COMMITTED. A void that commits before the re-read is restored here. A void that commits after it finds the committed OUT in its own post-commit restore (`voidSale` :1179). Void of a refunded sale is refused (:1115-1126), so VOIDED and refunds never mix. The only remaining gap is a crash (N3).
6. **F8.** `POS-OWNER-PENDING.md:79-80` are accurate.
   - Line 79: void and refund now post IN at the original OUT cost, so Dr1200/Cr5000 equals the original cut. The ฿30 vs ฿55 example matches the R1 walk.
   - Line 80: a retried cut posts COGS on the retry date; with the today window that is the same Bangkok day, and `since:null` is flagged for the owner. The F5 note is on line 76.
7. **Round 2.** `09e2ca11` adds the following and changes nothing else:
   - On a throw: one `{saleId,itemId,qty,code}` line per part (:889) plus a summary line `{saleId,parts,code}`.
   - For skipped parts: `code` = `ConsumeBatchSkip.reason` (`SERVICE|NOT_FOUND`, :896).
   - `fix2/hf-inventory-atomic.log`: head=09e2ca11, 143/143 (AT-24.1 ✅), rc=0. fix1 had been 142/143.
8. **Scope.**
   - The P2.3-only commits touch 7 expected files: oracle, `inventory/service`, `catalog`, `refund-consumer`, `register-actions`, `register`, `service`.
   - The oracle diff is +45/−0, V6 only, and the check count goes from 45 to 46. `pos-sale-contract.json` is not in the diff, so its sha is unchanged.
   - Logs: fix1/* have `head=0eec926f` with exit codes (V6 red/green at 88604d75 and fdccdf4c); fix2/* have `head=09e2ca11` and `rc=0`. Typecheck, fitness and p24 now carry `head=`. All builder-reported counts match the logs.

## Controller rulings (10 Oct 02:5xZ)
- Verdict accepted; merge after gates63 green. N1 (try/catch around the post-batch re-read) + N3 (crash window ⇒ pending-restore) → P2.3U follow-up lines together with R1 F7 (pending-restore counter + retry). N2/N4 noted.
