# T0.7a independent review — trips-side money (RUN TRIPS)

Worktree `/root/projects/shark-trips-l1` · branch `wip/trips-t0.7` · HEAD `3d4c00aae` · diff `d4b06ad7f..3d4c00aae`.
Read-only review: no tsx, build or database commands were run.

## Verdict: **FIX FIRST**

No BLOCKER was found. The money arithmetic is exact, and every split sums to its total. The lock order has no cycle.
Idempotency holds on every path that moves money. The refund ledger keeps its invariants under the races I traced.

Four MAJORs should be fixed or ruled on before merge:
- **M-1 (dues job):** a scalability bug that becomes a correctness bug. Upcoming dues can stop getting reminders.
- **M-2 (permissions):** a role can bypass the refund permission.
- **M-3 (dues view):** wrong due data on a refunded booking, on the screen meant for issuing tax documents by hand.
- **M-4 (APPROVED requests):** latent. An APPROVED request has no exit once the booking's version changes. Needs a controller ruling.

---

## MAJOR

### M-1 — `runPaymentDue` opens a locking transaction for every open due within a year, every 15 minutes; dues later in the list can stop getting reminders
`jobs.ts:353–357` (scan) · `jobs.ts:378` · `money.ts:766–801` (`markTripDueOverdue`)

**What the code does:**
- The scan returns every OPEN, PARTLY_PAID or OVERDUE due with `dueAt ≤ now+366d` on a CONFIRMED or PART_PAID booking.
- For **every** row it calls `markTripDueOverdue`. That opens a transaction and runs `SELECT … FOR UPDATE` on the booking, even when `now < dueAt`. The function only learns afterwards that there is nothing to do (money.ts:784).
- OVERDUE dues never leave the scan. Under NOTIFY_SHOP they stay OVERDUE until the booking ends. They sort first (oldest `dueAt`).
- For OVERDUE plus AUTO_RELEASE, every tick also re-runs `openRefundOf`, `readMoneyBooking` and `requestTripRefund`. That last one costs a gate read, a booking read and a key lookup, and ends in a replay.

**Failure scenario:**
- A shop has 3,000 open dues and 800 of them are OVERDUE (NOTIFY_SHOP).
- Each tick runs about 3,000 sequential transactions, each locking a booking row. Payments on those bookings wait on the row lock (they serialise behind the job).
- When the minute-job deadline hits, `stopped()` breaks the loop. The next tick restarts the keyset from the beginning (`cursor` is local).
- So rows late in `(dueAt, id)` order are never reached. These are exactly the upcoming dues that need `due_soon` reminders and the first OVERDUE marking. Reminders stop silently.

**Fix:**
- Split the work:
  - (a) Reminders need no transaction. Emit them only for rows where `dueAt − max(T16)·day ≤ now < dueAt`.
  - (b) Call `markTripDueOverdue` only for `status IN ('OPEN','PARTLY_PAID') AND dueAt <= now`. Grace is ≥ 0, so this is a safe pre-filter. It can go in SQL, as a separate keyset query on the same `status,dueAt` index.
  - (c) Attempt AUTO_RELEASE only when `ov.value.overdue === true`, i.e. on the tick that made the transition.
- Optionally, keep a separate retry list for AUTO_RELEASE attempts that failed. Right now a failed attempt is never retried unless the row comes round again, and with the fix it only comes round once.
- This also removes the OVERDUE rows that sit permanently at the head of every scan.
- Oracle: add a check with more than 200 OVERDUE dues plus one upcoming due. With a short deadline, the upcoming reminder must still fire.

### M-2 — `cancelTripBooking` EXECUTE on a sold booking files a refund request without the refund permission
`booking.ts:1415–1427` · `booking-actions.ts:142–150` (`assertCan … "trips.booking.cancel"`)

`cancelTripBookingAction` checks only `trips.booking.cancel`, labelled "ยกเลิกการจองทัวร์ที่ยังไม่ชำระ" (cancel *unpaid* bookings). Since T0.7, the same action on a CONFIRMED, PART_PAID or PAID booking calls `requestTripRefundForCancel`. That path never checks `trips.refund.request`, and the action layer is the only place RBAC lives.

The requester also picks `reasonKind`. For example, `SHOP_FAULT` gives a 100 % refund.

**Scenario:**
- A counter role is granted only "cancel unpaid".
- They call cancel EXECUTE `{reasonKind:"SHOP_FAULT"}` on a PAID booking of 1,145,000.
- A QUOTED request for 1,145,000 is created. With X12 `autoApproveUpTo ≥ 1,145,000` it becomes **APPROVED** with no human decision.
- Executing it still needs `trips.refund.execute`, so no money leaves the system on this step alone. It is still a privilege-boundary break, and it blocks payments and changes on that booking (REFUND_IN_PROGRESS).

**Fix:**
- In `cancelTripBookingAction`, also `assertCan(trips.refund.request)` when the request will hit a sold booking. Simplest: assert it for `mode:"EXECUTE"` and let `cancelImpl` decide. Another option is to check both keys in the action.
- `booking-actions.ts` is outside the T0.7 file list, so this needs a controller allowance (about 3 lines). The `tripSellable.cancel` path (sellable-impl) has the same question for platform callers. Document that SYSTEM and STAFF there are trusted.

### M-3 — after a refund is DONE the booking has no current dues, so `listTripDues` / `tripMoneySummary` show phantom OPEN draft dues
`refund.ts:702–705` (cancels `OPEN, PARTLY_PAID, PAID, OVERDUE`) · `money.ts:291–309` (`duesView` falls back to snapshot drafts when no row has `status <> 'CANCELLED'`)

- The brief §8.4 says "งวด**เปิด**ทั้งหมด → CANCELLED". The code also cancels **PAID** dues.
- `currentDues` excludes CANCELLED, so for any refunded booking `rows.length === 0`.
- `duesView` then returns drafts: `{id:null, seq:1, BALANCE, paidSatang:0, outstandingSatang:1,145,000, status:"OPEN"}`.

**Scenario:** the DN-1 booking (PAID 1,145,000, refund DONE). `tripMoneySummary.dues` shows an OPEN due of ฿11,450 with nothing paid, on a CANCELLED booking. `listTripDues` shows the same.

Until T0.7b exists, `tripMoneySummary` is the source the shop uses to issue tax documents and credit notes by hand (§0 warning). So this is wrong data on the money-document screen. A PART_PAID booking that gets refunded ends the same way.

**Fix:**
- (a) In `executeTripRefund`, cancel only `OPEN/PARTLY_PAID/OVERDUE`, as the brief says. Leave PAID dues as PAID.
- (b) In `duesView`, fall back to drafts only when the booking has **no due rows at all**, of any status.
- (c) For a CANCELLED booking, return the real rows including CANCELLED ones, with their `paidSatang`.
- Oracle: DN-1 should assert the dues view after DONE.

### M-4 (latent — needs a ruling) — an APPROVED request is stranded if anything bumps `booking.version` before execute
`refund.ts:640` (`b.version !== comp.bookingVersion ⇒ STALE_QUOTE`) · G.3 table `money-core.ts:32–41`

- G.3 has no exit from APPROVED except EXECUTING. You cannot withdraw it (`withdraw` takes QUOTED only), reject it, or re-quote it.
- `executeTripRefund` requires the booking version to equal the version at request time.
- Inside this lane nothing can bump the version while a request is open: pay and change are blocked, and the sweeper only touches HOLD and PENDING. So today it is safe.
- It will not stay safe. Ruling 5 says the T0.8 lane bumps `version`. Planned version bumpers include the purge job (expired bookings only, so unaffected), any booker or passenger edit that bumps the version, and `transitionBookingInTx` → TRAVELLED (T1.5).
- If any of these runs between APPROVE and EXECUTE, `executeTripRefund` returns STALE_QUOTE forever. The open request then blocks payments and changes on that booking forever.

**Fix options (controller):**
- (a) At execute time, check money facts instead of the version: `paidSatang − refundedSatang = comp.paidSatang`, `departureId`, and status ∈ REFUNDABLE. The version is already checked at decide time.
- (b) Allow APPROVED → WITHDRAWN.
- (c) Make the other lanes refuse to bump the version while a refund is open.

Pick one now, so T0.8 and T1.5 are told before they land.

---

## MINOR

1. **Statutory floor via a W01 probe** (`refund.ts:85–99`), answering question 2.
   - **Correct:**
     - The probe ladder `[{d+1,100},{d,p},{0,100}]` evaluated by `ladderShortfalls` (th-tour-2569.ts:139–150) checks only point `d` against the floor.
     - The other points (30, 15, d+1, 0) all see 100.
     - Result: d ≥ 30 ⇒ 100 %, 15–29 ⇒ 50 %, 0–14 ⇒ 0 %, d < 0 ⇒ null (the notice applies before departure only, per Krisdika 585/2557).
     - Both sides use the same "largest `fromDaysBefore ≤ d`" semantics as `cancelOf`.
   - **Deterministic and bounded:** binary search over 0..100, about 7 evaluations plus one sanity check. All pure.
   - **But fragile, and it fails open silently:**
     - If W01's input contract or messages change (e.g. it requires a 0-day step, sorted steps, or more checkpoints), `evaluateTourRule` returns `INVALID_INPUT_WARN` or `OK`. `warns()` reads that as "no warning", the floor becomes 0, and `REFUND_BELOW_STATUTORY_MINIMUM` disappears with no error.
     - The `warns(full)` sanity check only catches the opposite case ("always warns").
   - **Recommendation: replace it.** Ruling 4 explicitly allowed an additive export in the legal file. Add `export function tourRefundFloorPctAt(daysBefore: number): number | null` in `core/settings/legal/th-tour-2569.ts`, reading the existing `REFUND_FLOOR`, and exempt that file in S-checks. The trips module then has no ladder numbers and no probe.
   - The oracle has only one positive check (RF-5) and no negative or boundary checks; see the oracle gaps section.

2. **A retained-VAT row can be dropped** (`money-core.ts:262–266`).
   - Refund VAT per receipt is `min(r.vat, receiptVatSatang(np, vatCtx))`, using the **current** snapshot's `vatCtx`. Receipt VAT was computed with the snapshot that applied at payment time.
   - A paid change (`retimeTripDuesInTx`) can replace the snapshot. `duesShapeUnchanged` compares amount, vatable and pass-through per due, but not the VAT7/EXEMPT mix.
   - Then on a full refund of a receipt, `receiptVatSatang(r.vatable) ≠ r.vat`. The retained slice has `amount 0` but `vat > 0` and is skipped (`if (ret.amountSatang > 0)`). VAT stops summing to the receipt.
   - Fix: when `np === r.vatableSatang`, refunded VAT = `r.vatSatang`. Also emit the retained row when `amount > 0 || vat > 0`. Better: compute refund VAT from the receipt's own ratio (`mulDivHalfUp(r.vat, np, r.vatable)`), which removes any dependence on snapshot drift. That needs a controller nod because the brief names `receiptVatSatang`.

3. **Retiming does not clear OVERDUE** (`money.ts:261–274`). A PART_PAID booking whose OVERDUE balance due is moved to a later date stays OVERDUE. `markTripDueOverdue` then reports `dueStatus OVERDUE` on every tick, which feeds the AUTO_RELEASE path. The replayed key prevents a second request, but the status is wrong. Fix: when the new `dueAt + grace > now`, set OVERDUE → `paidSatang>0 ? PARTLY_PAID : OPEN` in the same CAS.

4. **Reminders and overdue run while a refund is open.** `emitDueReminders` and `markTripDueOverdue` do not check `openRefundOf`. A customer with a QUOTED or APPROVED cancellation still gets "please pay" reminders, while `recordTripPayment` refuses with REFUND_IN_PROGRESS. Skip both when a request is open. Also, the first tick can fire several `d` at once (T16 `[7,1]`, a due created 12 h before `dueAt` gets both d=7 and d=1). Fire only the smallest `d` whose window contains `now`.

5. **`AuditLog.createdAt = ctx.now`** (`money.ts:166`), answering question 5.
   - **Where `ctx.now` comes from in production:** server actions omit `now`, so `parseCtx` uses `new Date()` on the app server (`capacity.ts:179`). Minute jobs pass the runner's `now`. No external route passes a client clock, so a remote caller cannot manipulate it.
   - **Risks that remain:**
     - The audit trail mixes app-server clocks with the database `now()` used by every other module, including T0.6 `auditBooking`, which uses the database default.
     - Any internal caller that injects a skewed `now` can backdate audit rows.
   - **The −24 h window still covers replays**, because the request row is written with the same clock. Even when the lookup misses, safety does not depend on it: every money path is guarded by a status CAS, so a miss only turns a replay into STATE_CONFLICT.
   - **Better:** leave `AuditLog.createdAt` at the database default and widen the lookup to `"createdAt" >= LEAST(${r.createdAt}, now()) - interval '24 hours'`. That handles a test clock ahead of the database.

6. **`moneyRowId` does not encode write order** (`money.ts:42–50`), answering question 6.
   - Its parts: machine milliseconds, a per-process counter and 8 random bytes.
   - Across processes or servers there is no ordering. A clock step backwards breaks monotonicity.
   - `createdAt` itself is `ctx.now`, captured before the advisory wait. A payment that commits second can carry the earlier `createdAt`.
   - Collisions are negligible (64 random bits).
   - **Correctness does not depend on write order.** `planRefundSlices` only needs a deterministic total order. `ORDER BY seq, createdAt, id` is total because `id` is unique, and `allocateWithin` gives exact sums in any order; only where the last satang of rounding lands changes.
   - No column holds a per-receipt sequence (TripMoneyEvent has no `seq`), and a max+1 sequence needs a migration. **Recommendation:** keep the current order and fix the comment, which overclaims. Do not add a sequence.

7. **`receiptsByKey`** (`money.ts:361–372`) issues up to 64 sequential point queries. A payment split over more than 64 dues would falsely conflict on replay (the sum differs). Use one query: `"idempotencyKey" = ANY(${keys 1..n})`. Also reject `slices.length > 64` in `payTx`.

8. **Pass-through evidence is read only at request time.** If evidence that the park fee was paid out is filed between APPROVE and EXECUTE, pass-through is still refunded. This matches the brief, but should be documented, or the evidence should be re-checked at execute and the refund refused as `STALE_QUOTE`.

9. **`tripCashDay`** (`money.ts:714–718`). The filter `postingStatus = ANY(all three)` makes the index `(tenantId, postingStatus)` equivalent to scanning every money row of the tenant ever, with no LIMIT. This is acknowledged as debt for T1.3; it should be logged as a ledger item.

10. **`markTripDueOverdue` counts `overdue++` even when the outbox deduplicated** a re-overdue. For example, an OVERDUE due gets a partial payment, becomes PARTLY_PAID, then goes OVERDUE again. This also writes a second `trips.payment.overdue` audit row. Cosmetic.

11. **The slip gate does not require the slip's due to be open**, nor its amount to be ≤ that due's outstanding. Allocation silently spills into other dues. This is acceptable, but a slip bound to `TRIP_DUE` X ends up credited to dues X and X+1. Note it for T0.7b.

---

## Answers by question (file:line)

1. **Arithmetic** — fine apart from MINOR 2.
   - All money goes through BigInt `money-math`. There is no float in the WO files.
   - Dues come straight from the snapshot and are validated: Σ = payable, Σ pass-through = pass-through total, amount = vatable + pass-through (`money-core.ts:61–80`).
   - Pass-through per payment uses the same cumulative formula as `snapshot.ts:299–313`, so quote and receipts agree to the satang. The `min/max` clamp at `money-core.ts:139` never binds: proof `round(x+pt·a/A) − round(x) ≤ a` when `pt ≤ A`.
   - Refund split: `allocateWithin` with the explicit Σ check at `:256`. Per receipt it never exceeds what was received; retained = received − refunded field by field.
   - **int4:**
     - Pay: the JS guard `paid+a ≤ payable` runs before the SQL addition (`money.ts:450`).
     - Execute: `refundedSatang + refunded ≤ paidSatang` (`refund.ts:711`).
     - Deductions: Σ checked (`:248–249`).
     - Manual delta: `final ≤ comp.paid` (`:452`).
   - **Ladder:** `cancelOf` uses calendar days in `snap.travel.tz` (`snapshot.ts:285–287`). D−30 at 23:59 ⇒ 30 ⇒ 100 %. D−29 at 00:00 ⇒ 50 %. D+1 ⇒ no step, 0.
   - Shop-cancel reasons come from `shopCancelRefundBpByReason` in the snapshot.
   - The statutory warning is CUSTOMER-only (`money-core.ts:208–216`).
   - VAT per receipt for 990,655 is **64,809** (990,655×700/10,700 = 64,809.2). Σ with 284 = 65,093, equal to the document. The brief's "+1" example was wrong.
   - The only current-settings reads are policy values: X12, X13, T16, the PromptPay receiver, the unit tz for cash-day, and the legal registry. No amounts are recomputed from current settings.

2. **Statutory floor** — see MINOR 1. It is correct for all integer `d ≥ 0` and deterministic. Replace it with an additive export in `th-tour-2569.ts`.

3. **Invariants:**
   - `paidSatang = Σ RECEIVED` and `refundedSatang = Σ REFUNDED`. Note: the model keeps `paidSatang` gross. The question's form "RECEIVED − REFUNDED = paid" is not the contract.
   - Execute asserts Σ receipts = paid and that no prior REFUNDED or RETAINED rows exist (`refund.ts:661–664`).
   - Per-receipt and per-tender-group caps hold (`:677–681`). No cross-group refund: tender is the receipt's, `bankTender` only inside BANK (`:695`).
   - Pass-through is 0 plus WARN when paid-out evidence exists (`money-core.ts:201–205`), with booking- or departure-level evidence (`refund.ts:181–186`).
   - Dues and payment are updated in a single CAS (`money.ts:454–460`).
   - PART_PAID and PAID events are keyed by bookingId and fire only on a status change (`:484–489`).
   - HOLD → conversion runs once: the hold CAS on ACTIVE, and a later payment sees PART_PAID or PAID.
   - Seats are released only in `returnSeatsForRefundInTx` (`refund.ts:562`), called once (`:636`). The promo is released after seats and after the booking CAS (`:716`).
   - Exception: dues and invariant display after DONE, see M-3.

4. **Concurrency:**
   - **Lock orders:**
     - Pay CONFIRMED: adv `pay:` → 2b → 2d → 2b CAS → 2h.
     - Pay HOLD: adv → 1a/2a per hold → 2b.
     - Request, withdraw: 2b → 2b′.
     - Decide: 2b → adv `approval:` → 2b′.
     - Execute: adv `refund:` → 1a → 2b → 2b′ → 2d → promo → 2h.
     - Overdue job: 2b → 2d.
   - **Against T0.6/T0.4:** confirm, cancel-unpaid, sweeper and paid-change all take 1a before 2b. No path holds 2b and then waits on 1a, so there is no cycle.
   - **One inversion exists:** T0.6 change consumes approvals (adv `approval:`) before its 2b UPDATE, while decide takes 2b → `approval:`. It is unreachable: the same approvalId cannot pass both bindings (`trips.price_override` vs `trips.refund`, both checked before the tx). A 32-bit `hashtext` collision would only produce 40P01, which is retried.
   - **Pairs traced:**
     - Same-key double pay: the advisory lock, then the in-tx `receiptsByKey` replay.
     - Same key on another booking: unique violation → retry → replay → conflict.
     - Different keys, same amount: serialised; the second is OVERPAYMENT or NOTHING_DUE, or is accepted as a genuine second payment.
     - Pay ∥ sweeper: the hold CAS decides.
     - Pay ∥ cancel-unpaid: same.
     - Pay ∥ refund request: the booking lock plus `openRefundOf` under lock.
     - Two executes: the advisory lock plus the APPROVED CAS.
     - Decide ∥ withdraw: the QUOTED CAS.
     - Overdue ∥ pay: the booking lock plus the due CAS.
     - Purge between read and CAS: pay re-reads under lock (BOOKER_PURGED). Request, decide and execute check the version under lock (but see M-4).
   - No read-then-write on balances: every balance write is a conditional UPDATE.
   - **No second connection inside a tx:** gate, settings, `requestBindings`, FileAsset, `loadCapacityPolicies` and `promptpayQrFor` all run before the tx. The `*InTx` callees use `gateOfTx(tx)`.

5. **Idempotency:**
   - Payment keys `rcv:<sha(nsKey)[0:40]>:i` and `rcv:slip:<slipId>:i`. nsKey = actor + key + unit.
   - Lookup by the unique `(tenantId, idempotencyKey)`.
   - Same body ⇒ replay. A different booking, amount, tender or slip ⇒ IDEMPOTENCY_CONFLICT (SLIP_ALREADY_USED for slips).
   - Refund requests use the unique key plus `requestHash`. Decide, withdraw and execute use the audit `idemKeyHash`/`bodyHash` within the 24 h window.
   - `reference` is outside the body hash (acceptable).
   - Audit clock: MINOR 5.

6. **Row ids:** MINOR 6.

7. **Approvals:**
   - Bound to entityType `trips.refund` and `trf1_` sha256 of (unit, requestId, final amount). Unit checked. Status APPROVED.
   - Single-use: advisory lock plus a `trips.approval.consumed` audit row, rolled back with the tx.
   - Required only when |delta| > X13.
   - Free text (`reason`, `decisionReason`, `manualReason`, `withdrawReason`) lives only in `computed`.
   - It is stripped by `publicComputed` (`refund.ts:354–358`), which is used by the DTO, `RefundRequestValue` and the cancel result. It is absent from events and audit.
   - It does reach `TripBooking.cancelReason`, which is intended by the brief.
   - All text goes through `tripText` (T0.6 `text()`).

8. **QR:**
   - Locked amount = outstanding of the first open due, real or draft (`money.ts:606–608`).
   - Uses the platform `promptpayQrFor` (receiver: unit setting, then tenant `PaymentProfile`).
   - NO_RECEIVER ⇒ STATE_CONFLICT NO_PROMPTPAY_RECEIVER. Other failures ⇒ BUSY or NOT_FOUND.
   - Writes nothing. Called outside any tx.
   - Result: bookingId, dueId, amount, payload, svg, shop displayName. No PII.
   - Permission `trips.payment.record` is acceptable, since it exposes the shop's PromptPay account.

9. **Permissions:**
   - Every service calls `parseCtx` (AGENT ⇒ AGENCY_NOT_ENABLED).
   - Pay: PUBLIC forbidden, SYSTEM needs a slip.
   - Request: PUBLIC ⇒ OTP_REQUIRED.
   - Decide, withdraw, execute: STAFF only.
   - Reads: STAFF or SYSTEM. Cash-day: STAFF.
   - All 10 actions use `requireUnit` + `assertCan`.
   - Withdraw uses `trips.refund.request` (acceptable).
   - BOOKER_PURGED is refused on pay and QR.
   - The helpers `tripsSafely`/`runTripsTx` (`booking.ts:1738–1740`) and `tripText` (`booking-core.ts:167`) are plain aliases, are **not** exported from `index.ts`, and are acceptable.
   - Gap: M-2.

10. **Events:**
    - Payloads are ids, counts and satang only.
    - Outbox keys `type:<id>` with `skipDuplicates` give exactly-once delivery.
    - 8 consumers plus 8 automation labels are registered; webhooks via spread.
    - Sweeper fix `capacity.ts:1242/1248`: `(policySnapshot->'totals'->>'payableSatang')::int` with fallback to gross. Correct and order-neutral.

11. **Dues job:**
    - Per-tenant gate; uses the keyset; idempotent through outbox keys, CAS and the request key `due_<dueId>`. Grace and action come from the snapshot.
    - AUTO_RELEASE files a SYSTEM CUSTOMER/MONEY request through `requestTripRefund` at the job's `now`, so the shop ladder applies as of that day (ruling 11).
    - A withdrawn auto-request is not re-filed (replay).
    - **Not bounded well:** M-1, plus MINORs 3, 4 and 10.

12. **Cash-day and summary:**
    - Day boundaries use `localToUtc(g.tz, day, 0)` up to the next day, which is correct around DST.
    - Expected = CASH received − CASH refunded; RETAINED is excluded.
    - `receiptRoundingDiffSatang` = Σ receipt VAT − booking VAT, shown once fully paid.
    - Not N+1. Cash-day is unbounded, see MINOR 9. Dues display: M-3.

13. **Oracle edits:**
    - MC-4 and PY-2: correct, and the arithmetic is verified above.
    - QR-2: adding a `uD` receiver is a pure setup omission (the QR-4 negative stays on `uA2`). Tight.
    - t0.6 CN-3: retiring it is justified, but t0.7 CN-2 does not re-assert what CN-3 checked (booking version and sold count unchanged after cancel EXECUTE on a sold booking). See the oracle gaps section.

---

## Checked and fine
- `money-core` is pure: no I/O, no clock, no throw paths beyond the try-wrapped `recomputeFromSnapshot`. The sha256 is FIPS-shaped (only checked for structure; the MC-17 oracle covers it).
- `allocatePayment` handles OVERPAYMENT, NOTHING_DUE and INVALID_AMOUNT, fills in seq order, and gets `completesDue` right.
- `refundQuoteFromSnapshot`: `deductionsUsed` = Σ (bp share − refund) over BP lines. The pass-through-paid-out case changes only FULL lines.
- `planRefundSlices` reproduces CC :783 (32,547 / 32,546).
- `ensureTripDuesInTx` takes the booking lock, then `ON CONFLICT DO NOTHING` and a re-read. It is called in finalize for every booking and in approve.
- `replaceTripDuesInTx` refuses when paid > 0. `retimeTripDuesInTx` changes `dueAt` only.
- Change on PART_PAID/PAID re-checks for an open refund under the UPDATE lock, and the version CAS rejects a race with a payment.
- On HOLD payments, the hold-expiry CAS uses `ctx.now`, the same as T0.6. A partial payment converts seats (ruling 2).
- Decide freshness check: version plus paid − refunded. A manual delta only touches the non-pass-through part, bounded to [0, paidNonPt]. `MANUAL_BELOW_POLICY` is a warning.
- Execute with refund 0 or paid 0 (CONFIRMED, never paid) gives only RETAINED rows, or none; the booking is CANCELLED and seats returned.
- No `DELETE`, no `any`, no `console`, no `Math.round`/`toFixed` in the WO files. Prisma `data` only receives locally built objects.
- Legal: the ladder floor matches notice 2563 §4 (≥30 days 100, ≥15 days 50, <15 days 0), before departure only. The warning is WARN-level only. Deductions apply only to the non-pass-through part with evidence, as in §6. Applying the CUSTOMER ladder to AUTO_RELEASE is a [U] call that the controller already ruled on (ruling 11).

## Oracle gaps (checks too weak for the findings above)
- **No load or deadline check for `runPaymentDue`** (M-1). Add more than 200 OVERDUE plus one upcoming due under a tiny deadline, and assert the reminder fires.
- **No dues or summary assertion after DONE** (M-3). Extend DN-1: `listTripDues` and `tripMoneySummary.dues` after DONE must show no OPEN or draft dues.
- **No permission test through `cancelTripBookingAction`** (M-2). The oracle calls services with ctx directly, so RBAC at the action layer is untested for the new behaviour.
- **No version-bump-between-approve-and-execute case** (M-4).
- **Statutory warning:** only RF-5 is positive. Add negatives: default ladder at 23 days ⇒ no warning; at 10 days ⇒ no warning; a 50 % step at 31 days ⇒ warning; reasonKind EXTERNAL ⇒ never. Also a guard that fails if `statutoryFloorBpAt(40)` returns anything but 10,000, so the probe cannot fail open silently.
- **`receiptRoundingDiffSatang` is never exercised with a non-zero value.** Every fixture sums to 65,093.
- **Retained-VAT drift after a paid change** (MINOR 2), and **retimed OVERDUE** (MINOR 3).
- **CN-2 should assert** booking version, status and sold count unchanged, and no seats released, after cancel EXECUTE on a sold booking. This restores what retiring t0.6 CN-3 removed.
- RC-9 mixes paths but has no `changeTripBooking` (paid) ∥ `executeTripRefund` pair, and no decide ∥ pay pair.

## Not checked
- Nothing was run: no tsx, typecheck, fitness, oracle or database.
- I did not verify the builder's 121/124 claim, nor read every oracle check body (I read the names, the edits, CN-2 and JB-3).
- Read only in part: CC §H/§E/§G, `TRIPS-OWNER-QUESTIONS`, `wo-notes trips-T0.5/T0.6`, `T0.6.md` §16–17. I relied on the T0.7 brief's citations of them.
- `promo.releasePromoInTx`, `returnCoreTx`/`offerNextInTx` internals, and `transitionBookingInTx` were not re-audited (T0.6 code, already accepted).
- `tripRefundEntityId`'s pure sha256 was not checked against Node's crypto (MC-17 covers it).
- Whether `IDEM_CONSTRAINTS` should include the two new unique names. As written, money-table key collisions fall through to the retry loop and resolve as a replay, which works but costs retries.
