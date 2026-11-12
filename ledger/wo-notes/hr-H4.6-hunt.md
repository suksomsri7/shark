# H4.6 bug hunt — wip/hr-h4.6 @ e9d4e0349 · lane DB wo-hr-qc-l2 (qc-hr.sh) · 12 Nov 2026

3 probes, 88 checks, **5 FAIL → 2 bugs + 1 recorded debt confirmed**. Seed tenant not touched.

## FAIL
**F1 · MAJOR — a retry after a failed HR step cannot finish once stock is low; stock is gone and no charge exists.**
`requestStockCharge` checks stock (`item.onHand < qty`, stock-charge.ts:272) before it looks at the reservation. On a retry, onHand already has this key's own consumption taken off.
Repro: item stock 3, cost 1 000, qty 2. A temporary trigger makes the HrPayAdjustment INSERT fail. Attempt 1 throws; 1 movement; onHand 1; claimOpen=true; 0 adjustments. Drop the trigger and retry with the same key → "สต็อกไม่พอ…". Still 1 movement, onHand 1, claim open, 0 adjustments. Wanted: ok, closed, 1 adjustment of 2 000.
Same result with stock 1 / qty 1 (onHand 0). The claim is listed under "ต้องตรวจ", but the promised fix, "retry with the same key", is impossible until someone receives stock. Then a retry consumes nothing new: 1 movement for the key, so 2 units go uncharged until then.
Fix: decide replay/resume (claim lookup) before the stock check, or skip the stock check when a movement already exists for `hr-stock:<sys>:<key>`.

**F2 · MINOR — a replay of a request that already finished is refused once stock reaches 0.**
Stock 2, qty 2 → ok. The same key again → "สต็อกไม่พอ", where it should say replayed with the same chargeId. Nothing is double-charged, but the client is told it failed. The same pre-check order causes this (also the noCost and noPeriod checks run before replay).

**D1 · recorded debt (race) — parallel charges for the last unit drive stock negative.**
Item onHand 1, separate keys, qty 1 each, run in parallel:
- 2 requests → both ok, 2 movements, onHand **−1**
- 5 requests → 5 ok, 5 movements, onHand **−4**, 5 PENDING charges

The stock check runs without the item lock, and consumeBatch allows negative stock.

## Info (not failures, decide if intended)
- **I1:** if another user retries a stuck claim with the same key, it completes. `HrStockCharge.requestedById` = the first user, but `HrPayAdjustment.requestedById` = the retrier. So decideAdjustment's "own request" rule no longer blocks the original filer: a filer who also holds the approve key could approve their own charge. This is not proven end-to-end; the probe showed only that the two `requestedById` values differ. `sameRequest` does not compare the requester.
- **I2:** an injected HR-tx failure comes back from the service as a thrown DriverAdapterError, not `{ok:false, failed}`. The action wrapper must catch it.
- **I3:** ENDED employees:
  - New filing is refused (PASS).
  - A PENDING charge stays approvable after offboarding. If endDate falls inside the period, the final run deducts it: 40 000 from gross 1 160 000.
  - If endDate is before the period, the APPROVED charge stays unbound forever, never deducted and never flagged.
- **I4:** withdraw (b) ∥ deleteDraftRun → "draftRefused". The row goes back to its previous state (adj APPROVED, unbound) and a second withdraw is needed.

## PASS (got = wanted)
- **Amounts:**
  - 12 345×3 = 37 035 · 1×999 = 999 · 5 005×999 = 4 999 995
  - 5 006×999 → amount refused
  - Overrides: 1, 99 999 and 5 000 000 ok; 5 000 001, 0, −1, "100", 1e21 and NaN → amount refused
  - qty 0, −1, 1e9 and "3" → qty refused
  - Cost 0 → noCost; cost 0 with override 500 → 500
  - Manual 8 900 ok
  - Stock afterwards is exactly 94/1001/1001/2000/99
- **Failures injected on adjustment INSERT, outbox INSERT, claim-close UPDATE (plenty of stock), and InvMovement INSERT:** the retry always finishes with 1 movement and 1 adjustment, and stock is taken once. The stuck claim is listed after 10 minutes.
- **Same key, 5 different payloads in parallel:** 1 charge; movements match the winner; stock taken once.
- **Consent:**
  - Thai "today" at 00:30 Bangkok accepted; tomorrow refused
  - `confirmed:"true"`, a blank ref and 2031-02-30 refused
  - A DB UPDATE setting consentRef to '' is refused by a CHECK
- **DRAFT (b):** item deduction 37 035 → 0; run net 1 462 965 → 1 500 000; CANCELLED; adjustment deleted.
- **APPROVED (c):** REFUND_OWED 37 035; run byte-identical; second withdraw refused.
  - mark-repaid: the requester is refused; 2 parallel calls → 1 new + 1 replay
  - markPaid, then reverseRun → adjustment unbound and APPROVED
  - cancelAdjustment / moveStranded / decide on it are refused
  - Re-run deducts 37 035 once; status is REPAID (or REFUND_OWED when not repaid) with the returnedAfterReversal flag; delete and withdraw are refused
  - A second reverse and run3 still deduct 37 035 once
- **Statuses:** PENDING never approved, rejected by the approver, and deleted on the payroll page (REMOVED) → run deduction 0; withdraw on REJECTED → NOOP. A PENDING charge approved after its period already has a run moves to the next period.
- **Races:**
  - withdraw (a) ∥ createPayrollRun (period lock held, both orders ×4): always refused "changed" with the adjustment bound and 37 035 deducted. Never both, never deducted after CANCELLED.
  - approve ∥ requester withdraw ×4: approve wins and the withdraw is refused cleanly.
  - 3 parallel withdraws (c) → 1 REFUND_OWED.
  - withdraw (b) ∥ approveRun ×3 → REFUND_OWED 37 035 = amount deducted.
  - withdraw (b) ∥ recompute ×3 → CANCELLED, deduction 0.
  - No CANCELLING left stuck.
- **Flags:** over 10 % of the monthly base: 150 000 → false, 150 100 → true; base 0 → null. Total 300 100 > 1/5 flags both rows. Nothing is blocked.
- **Privacy and permissions:**
  - Other tenant using raw ids (withdraw, repaid, cancel, decide, move) → refused; the row stays PENDING.
  - Refused: an employee approving their own charge, a payroll-read-only user withdrawing, a manager of another branch filing.
  - myFiled: own rows only, no amount keys.
  - formOptions without inventory read → no items.
  - list: requester/employee get null; the payroll viewer sees rows; the employee's self view shows amounts.
  - The outbox, audit and notification payloads contain none of the amounts, the consent ref or the repay ref.

## Not tested
- A crash between reserve and consume in a live process (no internal step is exported, so failures were simulated with triggers).
- GL posting failure inside consumeBatch.
- The UI and actions layer.
- H4.4 offboarding flow itself (status was set directly).
- Reversal of PAID runs from other systems' bridges.

## Housekeeping
- Residue after every probe: **none** (all tenantId tables incl. HR, Inv*, AccountJournal*, plus users/sessions).
- 0 `zz_hunt_h46*` triggers or functions left.
- Probe scripts `scripts/zz-hunt-h46-*.mts` deleted. The only new file is this note.
