# T0.7a hunter report: trips-side money (wip/trips-t0.7 @ 3d4c00aae)

**Verdict: MERGE.** I reproduced no BLOCKER or MAJOR defect. There are 3 MINOR items and 4 INFO notes below. Each can be fixed later or accepted as a brief gap.

Every number below comes from real runs against the qc-trips DB (`ep-green-sound`), on temporary tenants `trips-t07h-*`. Each run cleaned up after itself; the leftover count was 0 every time.

## Harness
- `scripts/probe-trips-t0.7-lib.mts` is a copy of the T0.6 lib with the prefix changed to t07h. It adds:
  - the money checker `invMoney`, covering M1–M7;
  - `allMoneyInv`, which adds the T0.6 I1–I5 checks on top (seats, counters, promo usedCount);
  - `moneyControls`, a set of positive controls.
- Money probes:
  - `probe-trips-t0.7-pay.mts`: workloads A, B, G, H, J
  - `probe-trips-t0.7-refund.mts`: workloads C, D, I
  - `probe-trips-t0.7-round.mts`: workload E
  - `probe-trips-t0.7-job.mts`: workload F (F1 F2 F3 F3b F4)
  - `probe-trips-t0.7-storm.mts`: workload K
- **Positive controls.** In every run, each checker was shown to fire on deliberately corrupted rows in my own tenant, and the data was then restored to the same state ("same-as-before"). Controls covered:
  - M1-paid, M3-duepaid, M3-status, M4-vat
  - M5-posting, M5-received-evt
  - M2-over (REFUNDED +1 satang)
  - M7-open>1 (two cloned open requests)
- After every wave, all invariants were **clean** in every run.

## Totals
- About **5,500 service calls** across 13 runs.
  - 0 raw throws.
  - 0 leaked driver messages.
  - 0 BUSY results.
  - 0 P2028 errors.
- **DB-wide deadlock delta: 0 in every run.**
- Max client connections were 11 and max idle-in-transaction was 10 (pool of 10).
- Storm p95 was 1.4–1.8 s for the round without a job, and up to about 10 s when the round included a full `runPaymentDue` pass of 62 dues. The job itself is sequential.

| Workload | Operations | Result |
|---|---|---|
| A double/parallel pay | 320 | Same key ×20 (5 reps) gave exactly 1 receipt, with 20 ok and 19 replayed. Different keys with the full amount ×20 (5 reps) gave 1 ok and 19 `NOTHING_DUE`. 10 × payable/8 in parallel (5 reps) gave 8 ok and 2 refused, with paid = payable exactly. payable+1 is refused with `OVERPAYMENT`. On the remainder, 2 is refused, 1 is ok, and then `NOTHING_DUE`. 60 × 1-satang parallel payments plus the remainder gave 61 receipts, pass-through Σ = snapshot exactly, and a VAT rounding diff of −3, which is ≤ n−1. The excess of an overpayment is never recorded: the call is refused with no money rows. |
| B HOLD | 113 | Pay ∥ pay ×3 on HOLD (10 bookings) all ok. The hold was converted once and exactly one `trips.booking.confirmed` event was emitted. Pay vs sweeper at the hold edge (12 rounds × 4): 31 ok, 17 `HOLD_EXPIRED`, never EXPIRED with money, 0 deadlocks. Pay ∥ staff cancel on HOLD (10): pay always won and cancel got `STATE_CONFLICT`, with no cancelled booking holding money. A pay after expiry got `HOLD_EXPIRED` with no rows. |
| C refunds | 285 | Pay ∥ request (8): exactly one request, quote = paid/version under the lock, and pays got `REFUND_IN_PROGRESS`. Request ×10 (4 reps): 1 row. Approve ∥ reject ∥ withdraw ∥ approve ∥ withdraw (8): exactly one ok, one audit row, and the approved event only if APPROVED. Execute ×10 with different keys: 1 ok and 9 `STATE_CONFLICT`, sold back to 0. Execute ×10 with the same key: 10 ok (replay). Execute ∥ pay ∥ pay ∥ request (6): execute ok, the rest `REFUND_IN_PROGRESS`. Cash + PromptPay + transfer across 2 dues: allocation proportional per receipt, CASH→CASH, PROMPTPAY→TRANSFER via bankTender, no cross-group refund. Refund amount 0 (<15 days): pass-through refunded, rest RETAINED. CONFIRMED with no money → cancel → QUOTED → DONE with seats returned. Departure-level pass-through evidence → pt 0 plus `PASS_THROUGH_PAID_OUT`. Deductions are capped at the non-pt refund. Cancel QUOTE = request amount. |
| C7 manual override | 22 | Short reason gives `MANUAL_REASON_REQUIRED`. +1 over paid non-pt and below 0 both give `OVER_REFUND`. A large delta gives `REQUIRES_APPROVAL` with entityType/entityId/amount. Wrong entity, other unit, PENDING, wrong type and other tenant all give `APPROVAL_NOT_APPROVED`. One good approval used by 6 parallel decides gives 1 ok, 5 `APPROVAL_USED` and 1 consumed audit row. Reuse on another request gives `NOT_APPROVED`; reuse with the entity forged to match gives `APPROVAL_USED`. −150,000 gives `MANUAL_BELOW_POLICY`. All executed fine. |
| D ladder | 57 | All 12 boundaries match the brief exactly. D−30 23:59 BKK = 100 %. D−29 00:00 (=17:00Z) = 50 %. D−15 23:59 = 50 %. D−14 00:00 = 0 %. D, after departure, and D+1 are 0 % with pt refunded. EXTERNAL / MIN_NOT_MET / SHOP_FAULT = 100 %. A shop ladder [60→100, 0→0] warns `REFUND_BELOW_STATUTORY_MINIMUM` at D−40 and D−20, not at D−10 or D−61, and never blocks. The expected amount was computed independently from snapshot lines. |
| E rounding | 1,312 | 156 bookings. Prices: 990,655 / 4,345 / 1 / 99 / 107 / 10,700 / 1,145,000 / 333,333 / 0. Deposit 1/7/33/50/99/100 %. Pass-through on and off. VAT-registered and non-registered shops. 10 % promo on 3 prices. 1–6 random instalments over 4 tenders, with ~40 % refunded at 50 % then executed. M3/M4 exact. `receiptRoundingDiffSatang` always equalled Σ receipt VAT − booking VAT, within ±(n−1): observed −2…+2. `moneyDocument.vatSatang` = booking VAT. |
| F dues job | 252 | Grace 23 h → nothing; 25 h → OVERDUE. Reminders d=7/d=1 each once. Reruns don't re-emit. NOTIFY_SHOP files no requests. AUTO_RELEASE files ≤1 request per booking. After a withdraw, reruns don't refile; they replay the WITHDRAWN request. 220 dues (more than one 200-row page) all marked once, with 220 events and run 2 = 0. 6 parallel job runs: ≤1 request per booking and 0 deadlocks. HOLD and PAID dues untouched. Job ∥ pay on the same due: see M-3. |
| G inputs | 44 | All refused with VALIDATION. int4 gives `OVERPAYMENT`. int4+1, 0, −1, 1.5, "100", NaN, Infinity, 1e300 and null are refused. Reference: >64 characters, 100k characters, NUL, newline, Thai and RLO are refused. Extra `receivedAt`/`now` (back-dating) is refused by `strictObject`. Tenders AGENCY, BITCOIN and lowercase are refused. Bad keys and invalid ctx.now are refused. Refund reasons with control characters, bidi or >500 characters are refused. Σ deductions > int4 is refused. CREDIT / MOVE_DATE / bad reasonKind are refused. An invalid business date is refused. |
| H isolation | 118 + 17 slip | Tenant-B, unit-2 and mixed contexts: NOT_FOUND on all 12 money functions. Cash-day and list show 0 of A's rows. PUBLIC: FORBIDDEN, or `OTP_REQUIRED` on request/cancel. AGENT: `AGENCY_NOT_ENABLED`. SYSTEM without a slip: pay `SLIP_REQUIRED`; decide/withdraw/execute/cash-day FORBIDDEN; reads ok. Slips: 1 receipt per slip under 10 parallel replays. A CASH tender on a slip gives `SLIP_ALREADY_USED`. Other-tenant slip gives NOT_FOUND. PENDING gives `SLIP_NOT_APPROVED`. Amount mismatch or another booking's due gives `SLIP_MISMATCH`. SYSTEM plus slip on a HOLD booking converts the hold (allowed by §6.2). `piiPurgedAt` gives `BOOKER_PURGED` on pay, staff QR and public QR. |
| I change/promo | 30 | PART_PAID move-date to a same-price departure: ok, dues retimed, money untouched. Deposit-paid move to a date where the balance due would already have passed (schedule collapses to 1 due) gives `PRICE_CHANGED_AFTER_PAYMENT`. A later date is ok and dueAt shifts. PAID pax change gives `PRICE_CHANGED_AFTER_PAYMENT` with the version unchanged. A CONFIRMED change cancels old dues and inserts seq 2, then pays fine. Promo bookings ×4 paid, then cancel → request → approve → execute: seats returned, all 4 redemptions RELEASED, usedCount 0. `dropPromo` on a paid booking gives `PRICE_CHANGED_AFTER_PAYMENT`. |
| J QR | 40 | The amount equals the open-due remainder after partial payments, every time. 20 QR calls wrote 0 rows (TripMoneyEvent, TripPaymentDue, AuditLog, OutboxEvent). No receiver gives `NO_PROMPTPAY_RECEIVER`. PAID gives `NOTHING_DUE`. During a refund it gives `REFUND_IN_PROGRESS`. PUBLIC with a bookingId gives FORBIDDEN; a bad or other-unit token gives NOT_FOUND. `tripCashDay` midnight boundary: 16:59:59Z belongs to the previous BKK day; expected = CASH only. |
| K storm | 560 | 7 rounds of 80 mixed parallel callers: pay with shared and unique keys, QR, request, decide, withdraw, execute, job, sweeper, summary and cancel. 0 THROW, 0 BUSY, 0 deadlocks; invariants clean after every round. |

## Reproduced findings

### M-1 (MINOR, brief gap): `tripPaymentIntent` issues a QR for a HOLD booking whose hold has already expired
- **Reproduce:** `probe-trips-t0.7-pay.mts --only=J`, the `expiredHoldQr` block. This was 1/1.
  1. Create a HOLD booking (PAY_NOW) on a unit that has a receiver.
  2. Call PUBLIC `tripPaymentIntent({publicToken})` at expiresAt + 30 min. It returns ok with a locked QR for 225,000.
  3. `recordTripPayment(225,000)` at expiresAt + 31 min returns `HOLD_EXPIRED`.
- **Impact:** the customer can pay the bank for a booking that can no longer be recorded, so money arrives outside the system. §7 only checks the §6.2 status (HOLD is payable) and never checks the hold's `expiresAt` against ctx.now.
- **Expected:** refuse with `HOLD_EXPIRED` (or `STATE_CONFLICT BOOKING_EXPIRED`) when there is no ACTIVE hold with `expiresAt > now`.

### M-2 (MINOR, needs a version bump from outside the money paths): an APPROVED refund request has no exit once the booking's version changes
- **Reproduce:** `probe-trips-t0.7-refund.mts --only=C`, block C8. This was 2/2.
  1. Pay in full, request a refund, approve it.
  2. Simulate T0.8's purge bump with `UPDATE "TripBooking" SET version = version + 1`.
- **Result:**
  - execute returns `STALE_QUOTE`;
  - withdraw returns `STATE_CONFLICT` (APPROVED cannot be withdrawn, per CC :709);
  - a new request returns `REFUND_IN_PROGRESS`;
  - decide returns `STATE_CONFLICT`.
- **Impact:** the booking is frozen permanently. Today no T0.7 or T0.6 path bumps the version while a request is open (pay, change and cancel are all blocked), so this cannot be reached in practice yet. §22 rule 5 announces that T0.8 will add version bumps. If any future version bump can hit a CONFIRMED/PART_PAID/PAID booking with an APPROVED request, it lands here.
- **Suggestion:** allow APPROVED→WITHDRAWN (or REJECTED) when the quote is stale, or re-quote at execute.

### M-3 (MINOR, race; reproduced the adjacent window, not the harmful one): AUTO_RELEASE re-checks neither the overdue due nor the booking status under a lock before filing
- **Reproduce:** `probe-trips-t0.7-job.mts --only=F3b`. 40 CONFIRMED bookings had their deposit overdue; the deposit payments were spread across the job's sequential pass.
- **Result:** the job reported `failed: [{code: "STATE_CONFLICT", count: 4}]` out of 32 overdue rows. In those 4, a payment landed after the job's `readMoneyBooking`, and the version check in `requestTripRefund` caught it. The money was correct, but ops receives 4 failure reports for a benign race.
- **Unguarded window:** `jobs.ts` runs `markTripDueOverdue` (commit), then `openRefundOf`, then `readMoneyBooking`, then `requestTripRefund(expectedVersion = fresh)`. A payment that commits *between the OVERDUE CAS and `readMoneyBooking`* turns the booking PART_PAID with a new version. The job then reads that fresh version, so the SYSTEM refund request is filed even though the overdue deposit is now PAID. I hit this 0 times in 80 attempts (it is about one round trip wide). It is a suspicion from code reading.
- **Harm is limited:** the request waits for staff approval (default X12 = 0), and the amounts are computed correctly from the locked booking.

## INFO / design observations (no fix required by the brief)
- **Approval with a NULL unit:** an approval whose `unitId` is NULL (tenant-wide) is accepted for a unit's refund override (`refund.ts:459`, condition `x.unitId !== null && …`). The brief says "หน่วยตรง". Please confirm that tenant-wide approvals are intended.
- **Purged bookings:** a booking with `piiPurgedAt` set still accepts `requestTripRefund` and `tripMoneySummary`. The brief only requires BOOKER_PURGED on pay/QR.
- **Job reminders during an open refund:** `runPaymentDue` still emits `due_soon` and marks OVERDUE for dues of bookings that have an open refund request, while payment on them is refused with `REFUND_IN_PROGRESS`. The job saw this in F1 (shA bookings that already had AUTO_RELEASE requests got balance reminders and overdue events).
- **Service trust boundary:** money services trust `ctx.tenantId` / `actor.userId`. A forged ctx (tenant-B user id with tenant A's tenantId) succeeds. The boundary is `money-actions.ts` (`requireUnit` + `assertCan`, with the tenant taken from the session), which I checked by reading the code but could not drive without a session.
- **M1 semantics:** this build keeps `paidSatang` = Σ RECEIVED (gross) and `refundedSatang` = Σ REFUNDED, per brief §3/§16. It does not use "Σ RECEIVED − Σ REFUNDED = paidSatang" as the work order phrased it. The checker uses the brief's form.

## False positives I raised and discarded
- `G-accepted rfDedOneMax`: a single deduction of exactly int4 is valid input.
- `H-tenantB` / `H-unit2` cash-day "ok": these are the actor's own unit, with 0 of tenant A's events.
- `H-mutated`: caused by the forged-ctx row above.

## Not tested
- The action layer (`money-actions.ts` RBAC, the 4 new permission keys), because there is no session harness.
- Bookings with `collectMode = AGENT` or non-THB currency: they cannot be created via the services; the gate was read in code only.
- EXECUTING/FAILED states (unreachable in T0.7a).
- The real T0.8 purge job.
- Multi-departure bookings (one booking spanning 2 holds).
- More than 64 slices per payment (impossible with ≤ 2 dues).
- POS and accounting (out of scope).
- Production pool sizes. QC pool is 10.
