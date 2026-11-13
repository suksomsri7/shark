# T0.6 booking core: review round 3 (fix round 2, S1–S9, plus merge d2883e13b)

Scope: `git diff baebccfe1 30ec13f43 -- src`, and the merge resolutions in `src/lib/modules/trips/index.ts` and `scripts/seed-trips-qc.mts`. This was a read-only review. Nothing was executed (no tsx, build or DB).

## Verdict: MERGE

Nothing blocks. Two quick fixes are recommended, in this round or the next ticket: F1, the idempotency `createdAt` margin, and F2, ZWSP in Thai text. The rest are low or informational.

---

## 1. S1: forBookingId / HOLD_HAS_BOOKING

`convertCoreTx` is the only place that converts (`capacity.ts:835`). It has three callers.

| Path | Call | forBookingId |
|---|---|---|
| finalize CONVERT (bookNow PAY_NOW/zero-due, confirm FAIL, confirm REHOLD) | `booking.ts:955` | `l.bookingId` ✓ |
| approve when nothing is due (SHOP_CONFIRM → CONFIRMED) | `booking.ts:1477` | `b.id` ✓ |
| change add-on (`cg_<ver>_<id>`, inserted with `bookingId: b.id`) | `booking.ts:1609` | `b.id` ✓ |
| staff `convertHold` action (`capacity-service.ts:475`) | none | refuses bound holds (intended) |

- **Ordering inside finalize.** Step 2a first binds the hold (`UPDATE "TripHold" SET "bookingId" = l.bookingId … ("bookingId" IS NULL OR = l.bookingId)`, `booking.ts:945`). Only then, in the same loop iteration, does it call convert. So convert always runs after `bookingId` is set, and it needs the option, which it gets. No path converts before binding, so no path skips the guard.
- **REHOLD.** `insertHoldsInTx` creates holds with `bookingId` NULL. `finalizeCoreInTx` binds them, then converts with the option ✓. The released old hold is never converted.
- **Approve with an amount due.** It only CASes purpose to PAYMENT and doesn't convert ✓.
- **Confirm replay.** `lockOpenBasket` returns `{replay:true}` and then `refsOfBasket`, with no convert ✓.
- **KEEP mode (PAY_LATER pending).** The hold stays bound and ACTIVE. Payment-side conversion is T0.7's job and must pass `forBookingId`. Staff can no longer convert it by hand, which is intended.
- **T0.4 sweeper and waitlist.** Neither converts nor extends. The only writes to `expiresAt` are `capacity.ts:940` (extend) and the two purpose CASes in booking.ts. Offer holds are unbound until a basket finalize binds them, and that finalize passes the option ✓.
- **Extend.** It refuses any bound hold. PAYMENT and WAITLIST_OFFER were already non-extendable. The new effect is that a staff member can no longer extend the SHOP_CONFIRM hold of a PENDING booking, which matches the ruling.
- **No legitimate path now returns HOLD_HAS_BOOKING.**

## 2. S3: approval binds qty

- **`baseItemsOf` (`booking.ts:253`)** calls `quoteTripLine(sc, line, {})`. It runs outside any transaction, as do `quoteTrips` and the whole of `approvalsGate`: it is pre-tx and goes through the Prisma pool. That is fine.
- **Cost.**
  - When approvals are present, it adds one extra pricing call per line, at most 20.
  - On the REQUIRES_APPROVAL failure path, `withApprovalTarget` adds up to 2 × lines more.
  - Each call is DB reads only.
- **Can the base run differ from the main quote?**
  - **Clock:** both use the same `sc.now` (injected clock).
  - **Promo:** the line carries `promoCode` into both runs, and promo never changes qty.
  - **Agent discount and linkId:** these are request-level opts that the base run omits. They change discount and attribution, not item qty or unitMinor.
  - **FREE_LEADER:** this split (`pricing-core.ts:788–811`) happens before the override step (step 8), so the paid qty `seat:X` and `seat:X:free` are identical with or without overrides.
  - The base run cannot fail where the main run succeeds, because the override is the last step.
  - The only divergence is a TOCTOU if a pricing rule changes between the two reads. That is harmless: the result is a FORBIDDEN or PRICE_CHANGED rejection.
- **Can qty be manipulated?**
  - itemRefs are unique within a line (`seat:<code>`, `seat:<code>:free`, `extra:<id>[:<code>]`, `pickup:<zone>`).
  - The pricing override hits `work.find(itemRef)`, which is that single item.
  - The same itemRef across two lines → APPROVAL_MULTI_LINE ✓. This covers the same itemRef split across two option lines of one departure.
  - Infants are their own `seat:INFANT` itemRef.
  - Qty always comes from the real pax counts of the line, so changing pax changes the qty and the entityId no longer matches ✓.
- **Per-booking extras.** `extra:<id>` has the qty of the request (often 1), and amount = unitMinor × qty is correct ✓.
- **Same transaction.** The consumed-approval row is written in the booking tx: `finalizeCoreInTx` (`booking.ts:967`) and the change tx (`booking.ts:1591`) ✓.
- **Lock before lookup.** The advisory lock is taken before the lookup, per id and sorted (`booking.ts:465`) ✓.
- **Lock order.** Products → departures → approval lock in finalize. Change-lock → products → departures → approval lock in change. These are consistent.

## 3. S4: consumption lookup and idempotency lookups

- **Consumption** (`booking.ts:466`): `action = 'trips.approval.consumed' AND tenantId AND targetId = approvalId`.
  - It is correct and tenant-scoped.
  - The action string is written only at `booking.ts:475`; nothing else writes it. `core/audit.ts` takes the action from code, not from user input.
  - The approvalId has already been checked against the tenant by `requestBindings({tenantId})`. Nobody can plant a colliding row.
  - Index `AuditLog_action_idx` holds only consumption rows for this action, so the lookup is cheap.
  - AuditLog is never purged, except one unrelated dorm `deleteMany` scoped to its own action.
- **Idempotency bound** (`booking.ts:1363–1366`, `createdAt >= booking.createdAt`).
  - **Which clock:** both `TripBooking.createdAt` and `AuditLog.createdAt` are Prisma `@default(now())` (`TIMESTAMP(3)`), written by `tripBooking.create` and `auditLog.create`. Neither uses `ctx.now`, the injected clock, so the injected test clock can't skew this.
  - **Ordering:** both come from the same real clock source (Prisma engine/app wall clock, or DB tx-start time if it falls back to DB `DEFAULT`). A cancel or change audit is always written in a later tx than the booking insert. ms rounding is monotone.
  - **Residual risk (F1):** under multi-instance serving, if the engine fills `now()` per instance, an instance whose clock is behind could write an audit row with `createdAt` < the booking's. The replay is then missed, and the second call returns STATE_CONFLICT instead of the original result. That is broken idempotency, though never a double-apply, because S7/CAS still protect it.
  - **Performance:** the index range covers every audit row of the tenant since the booking was created. Cancelling or changing an old booking in a busy tenant (POS writes audits per sale) can scan a lot. This is the recorded debt: a `(tenantId, targetId)` index needs a migration.
  - The `'…Z'::timestamp` cast drops the zone suffix and keeps the UTC wall value. This matches how Prisma stores timestamps ✓.

## 4. S5: product lock inside finalizeTripsInTx

- No in-tree caller calls `finalizeTripsInTx`. `confirmTx` and `bookTripsNow` call `finalizeCoreInTx` directly, so no internal path locks twice and nothing is inverted.
- The only caller is external: `tripSellable.finalizeInTx`, used by K1.1.
- Its documented contract is "caller did basket/rekey + products + 1a". Under that contract the re-run `FOR SHARE` on product/option rows it already holds doesn't wait.
- If a future K1.1 locks departures without first locking products, this becomes a departure → product order against confirm's product → departure. K1.1 must follow the contract (see F7).

## 5. S6: text hygiene

- **What passes:**
  - Thai (U+0E00–0E7F) and its combining vowels and tone marks.
  - Emoji ZWJ sequences (ZWJ/ZWNJ allowed) and VS16 U+FE0F.
  - Skin-tone and other astral emoji, as valid surrogate pairs.
  - NBSP U+00A0.
- **NFC on Thai.** It is a no-op: U+0E33 has only a compatibility decomposition. Latin combining marks compose correctly.
- **What fails: ZWSP U+200B (F2).** Thai text pasted from web pages, Word or LINE often contains ZWSP word-break hints. Names, notes and reasons pasted that way are now rejected with "มีอักขระควบคุม".
- **Where NFC applies and what it affects downstream:**
  - **Covered fields:** names, phone, email, lineUserId, promoCode, attribution codes, itemRef, reasons.
  - **Body and request hashes** are computed on parsed, normalised values, so NFD and NFC variants of the same request replay the same. That is better.
  - **Promo codes, itemRefs and link/agent codes** are ASCII in practice, so nothing changes.
  - **contactKey** (email lower-cased, phone E.164) is unaffected for ASCII.
  - **Party lookup** goes by `partyId` (`ID`, not normalised), not by name.
- **Length:** `max` is checked before NFC. NFC lengthens only composition-exclusion characters (e.g. U+0958 becomes two code units). That is negligible (F6).

## 6. S7/S9: two-argument advisory lock

- **Hashing:** `pg_advisory_xact_lock(hashtext('trips.booking.v1'), hashtext('<kind>:<id>'))`. Both arguments are int4, which is the correct overload.
- **Key space:** the (int4,int4) space is separate from the bigint space used by the rest of the repo. A grep found no other two-argument user in `src`.
- **Same key for every taker:** approval at `booking.ts:465`, change at `booking.ts:1594`, and the probe `probe-trips-t0.6-r2.mts:197` uses the identical expression ✓.
- **Old keys:** no remaining one-argument takers of `trips-approval:` or `trips-booking-change:` (grep is empty).
- **Collisions:** a 32-bit objid collision only adds waiting.
- **S7:** the version/status re-read runs under the change lock and after the idempotency replay check, so the order is correct.

## 7. Merge d2883e13b

- **index.ts:**
  - The T1.1 block sits at lines 271–299, then T0.6 at 300–337.
  - The T0.6 block is identical to 30ec13f43's, and the T1.1 block is identical to a26a41e2d's.
  - A script over every export name (349) found no duplicates and no conflict markers.
- **seed-trips-qc.mts:**
  - Imports keep both blocks with no duplicate.
  - The T1.1 block runs before the T0.6 block. That is the right order: T0.6 bookings are priced against the final state.
  - Nothing T1.1 writes changes Racha booking amounts:
    - The infant price affects no booking, because none has infants.
    - The `parkFee.table` shopRates feed only the W05 warning (`pricing-core.ts:1116–1121`), and the extra `label`/`effectiveFrom` fields are stripped by a non-strict zod object.
    - Similan pay settings and the confirmation text don't affect Racha.
  - Pickup zones are not required by pricing.
  - Re-runs stay idempotent: T0.6 skips CHECKED_OUT baskets.
  - The `expected.dive.departures` assign is kept.

---

## Ranked findings

**F1 (Low–Med): idempotency lookup can miss under cross-instance clock skew.** `booking.ts:1364`
- **Scenario:** a booking is created on instance A. A cancel/change is retried with the same key on instance B, whose wall clock is behind. B's audit row gets `createdAt` < the booking's, so the replay is missed and the retry gets STATE_CONFLICT instead of the original result.
- **Fix:** `const since = new Date(new Date(b.createdAt).getTime() - 24 * 3600_000).toISOString();`. Any margin far above NTP skew works. It is still bounded by the index, and `targetId`/`idemKeyHash` keep it exact.

**F2 (Low–Med): ZWSP rejection blocks pasted Thai text.** `booking-core.ts:19,23`
- **Fix:** in `text()`, strip `​` (and an interior `﻿`) before the refine, e.g. `z.string().transform(s => s.replace(/[​﻿]/g, "")).pipe(z.string().trim().max(max).refine(noCtl)…)`. Keep rejecting them in `ID`.

**F3 (Low): `logUnexpected` now stores `e.message`, which can contain user input.** `booking.ts:138–143`
- **Scenario:** Prisma raw-query errors embed the Postgres message and detail, e.g. `22P02 invalid input syntax … "<value>"` or `23505 Key (…)=(<value>)`. That can be a phone or email, which goes into ops logs. The JSDoc "ไม่มีข้อมูลบุคคล" (no personal data) is no longer true.
- **Fix:** for `Prisma.PrismaClientKnownRequestError` log `code` + `meta.target` only. Otherwise redact quoted literals (`message.replace(/"[^"]*"|'[^']*'|\([^)]*\)=\([^)]*\)/g, "…")`).

**F4 (Low): the guard is reachable from outside.** `capacity.ts:854`
- **Scenario:** the `internal` 4th parameter of the exported `convertHoldInTx` (re-exported via `index.ts:234`) lets any module pass `forBookingId = hold.bookingId` and bypass S1. The rule is a convention, not enforced.
- **Fix:** keep the public 3-argument export, and give booking.ts a non-exported `convertBoundHoldInTx` (or import `convertCoreTx` directly).

**F5 (Low): approval amount uses mixed units for non-THB.** `booking.ts:283` and `withApprovalTarget`
- **Scenario:** `amountSatang` is compared with `unitMinor × qty`. In a foreign-currency line, unitMinor is in foreign minor units. The check stays internally consistent, because the screen receives the same value, but approval-amount routing is off by the FX rate.
- **Fix:** convert with the line's `fx.rateMicros` (`minorToSatang`), or document that it is minor units.

**F6 (Info):** `text()` checks `max` before NFC. Reorder to `.transform(NFC).pipe(z.string().max(max))` if any column is length-limited.

**F7 (Info): K1.1 contract.** Note in the K1.1 brief that `finalizeTripsInTx` now locks products `FOR SHARE` itself. The caller must lock products before 1a, or this inverts the order against confirm.

**F8 (Info, pre-existing, not in this diff):** `auditBooking` skips AGENT/PUBLIC. If AGENT can reach `cancelTripBooking`, its idempotency row is never written, so a retry gets STATE_CONFLICT. (S4 moved approval consumption out of `auditBooking` for exactly this reason.) The same applies if any future AGENT change path appears. Change is STAFF-only today.

**F9 (Info):** the convert CAS (`capacity.ts:835`) doesn't re-assert `bookingId`. It relies on the departure lock serialising it against the bind UPDATE, and every in-tree bind runs under 1a. Belt-and-braces option: add `AND "bookingId" IS NOT DISTINCT FROM ${h1?.bookingId ?? null}`.

## Not checked

- Nothing was executed: no probes, oracle, tsc or DB plans. Index choices were inferred from the schema and migrations, not from EXPLAIN.
- Whether the Prisma version in use fills `@default(now())` in the engine or leaves it to DB `DEFAULT`. F1 holds either way for multi-instance engine fill; with a DB default it is a non-issue.
- Probe and oracle edits (`scripts/probe-trips-t0.6-*.mts`, ORACLE-EDIT CF-23).
- T1.1 UI and screens code beyond export collisions, and whether the T1.1 product editor can close options in ways T0.6 needs to see beyond `assertProductSellableInTx`.
- Approval-module semantics of `amountSatang` (whether routing thresholds expect the override total or the discount).
- Whether AGENT can actually reach cancel (F8).
