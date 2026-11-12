# T0.2 review, round 2 (fix commit `08764070a` on `wip/trips-t0.2`)
Scope: read-only. No build, typecheck, tests or DB access were run. Line numbers refer to `src/lib/modules/trips/products.ts` at HEAD.

**Verdict: MERGE**: 0 BLOCKER · 0 MAJOR · 5 MINOR. All five can be carried as notes or fixed in a 5-line follow-up.

## The nine asks
| # | Ask | Result |
|---|---|---|
| 1 | Currency change | **OK.**<br>- Runs inside `lockedTx` + `lockProduct`.<br>- Allowed only when the product is `DRAFT` and `publishedAt` is null (`CURRENCY_LOCKED` otherwise).<br>- The CAS `where` repeats `status: DRAFT, publishedAt: null`.<br>- The product's extras, inactive ones included, get the new currency in the same tx, and the audit records `extrasChanged`.<br>- `createExtra` and `updateExtra` now read `lp.currency` under the product lock. The round-1 lock-in and race are gone. |
| 2 | Product lock in `setProductContent` / `updateProduct` | **OK.** Both now read the row inside the tx after `FOR UPDATE`, so concurrent saves can no longer overwrite each other. |
| 3 | Body merged per section | **OK** (`mergeBody`). An absent key keeps the stored value; `null` or `{}` clears it. `photoFileIds` changes only when sent. |
| 4 | T2 everywhere | **OK.** `checkLocales` covers create and update of the product (title, body, meeting, disclosure), option name, pax label, and extra name and note. `setProductContent` keeps its own check. |
| 5 | `stockItemId` / `photoFileIds` checked for format only | **Agree** as recorded debt. There is no facade or allowed import edge to check ownership through. Condition: the X.2 and T1.1 orders must state that every dereference goes through `tenantDb` (or the owning module's facade) and never trusts the stored id. |
| 6 | Empty or inverted effective age band | **OK.** `isEmptyBand` is refused with `AGE_RANGE` on create, on update and when re-activating. |
| 7 | Broken T2/T3 values | **OK.** `readStrings` throws, and `min(1)` is enforced. |
| 8 | Seed | **OK.**<br>- `dive.products.<slug>.{productId, options{th name}, paxTypes{code}, extras{kind or kind:name}}` is written; `productIds` is kept.<br>- Durations: Phi Phi 510 (08:30–17:00), Deep 3 480 (07:30–15:30), from `TRIPS_SEED_OPTION_TIMES`, flagged as a controller-approved fixture value.<br>- A re-run diffs, writes once, then writes nothing. |
| 9 | `assertProductSellableInTx` | **OK.** Details below. |

## `assertProductSellableInTx` (products.ts:1562-1582)
- **Tenant and unit safety with a plain `prisma.$transaction` client.** Both raw queries bind `tenantId` and `unitId` themselves. The option query also binds `productId = p.id`. An id from another shop, unit or product → `NOT_FOUND`, the same answer as an id that does not exist. The helper does no membership or permission check; that stays with the caller. It is not in a `"use server"` file, so a client cannot call it directly.
- **Against `archiveProduct`.** Archive takes `FOR UPDATE`, which conflicts with `FOR SHARE`. Archive waits until the departure transaction (T0.3) commits. Its `isReferenced` SELECT is a new statement under READ COMMITTED, so it sees the new departure and requires confirm + reason. In the other order, the T0.3 call waits for archive to commit; `FOR SHARE` then returns the latest row version, so it sees `ARCHIVED` → `PRODUCT_ARCHIVED`. Correct both ways.
- **Inactive option under the same lock.** The only writer of `TripOption.active` is `setOptionActive`, and it takes the product `FOR UPDATE` first. So while the share lock is held, the option cannot flip. `updateOption` and `reorderOptions` do not touch `active`. Correct.
- **Deadlocks.** Archive locks the product and then only *reads* departures. No T0.2 path locks a departure, an option before the product, or anything after another shop's row. The order product → option (read) → departure, with no cycle against T0.2.
- **Two rules T0.3/T0.5 must follow** (write them into those orders):
  - (a) Never take `FOR UPDATE` on, or `UPDATE`, the product row after `assertProductSellableInTx` in the same tx. Two share holders upgrading at the same time is a guaranteed 40P01.
  - (b) Call the helper **before** locking any departure, schedule or price row. Locking a departure first, while a T0.2 path holds the product and a later T0.3 step needs both, creates the reverse order.

## Lock order across all 20 functions (regression check)
- Every path that locks takes the product row first, then touches its children: `createOption`, `setOptionActive`, `reorderOptions`, the 3 pax-type functions, `createExtra`/`updateExtra` (product extras), `updateProduct`, `setProductContent`, publish/unpublish/archive/restore.
- Paths that skip the product lock write a single child row and then only insert audit or outbox: `updateOption`, `setExtraActive`, `updateExtra` on a unit extra. None of them asks for the product lock afterwards, so no reverse pair exists.
- `updateProduct` (product → `updateMany` of its extras) against `setExtraActive` (holds one extra row): only one side waits, no cycle.
- Pre-reads outside the tx (`updateExtra` `pre`, `setOptionActive`/pax `cur`) are lock-free, and each is checked again inside.
- **No new deadlock pair found.**

## Minor findings
1. **The currency change ignores prices that already exist** (:604-611).
   - `TripPrice` has its own `currency` column. A never-published DRAFT can already have T0.5 prices, departures or rules. Changing the product's currency then leaves `TripPrice` rows in the old currency.
   - Fix: inside the same lock, `if (await isReferenced(tx, g, cur.id)) return fail("CURRENCY_LOCKED")`. Or put it in the T0.5 order.
2. **A race on unit-level extras is still open** (:1290-1340).
   - `updateExtra` on a unit-level extra (`productId` null) does a read-modify-write of the flags with no lock.
   - Two concurrent edits (A sets `passThrough=true`, B sets `commissionable=true` based on the old row) can end in a CHECK violation: a raw 23514 thrown instead of `PASS_THROUGH_FLAGS`.
   - Fix: `SELECT … FROM "TripExtra" WHERE id=… AND "tenantId"=… AND "unitId"=… FOR UPDATE` before reading `cur`, when `productId` is null.
3. **The helper skips the option check for an empty `optionId`** (:1574). `if (ref.optionId)` treats `""` as "no option" and skips the check. Use `ref.optionId != null` so `""` → `NOT_FOUND`.
4. **The currency-change audit has only a count** (:613). It records `extrasChanged: n`, but not which extras changed or their previous currency. Add `extraIds` with `before: {currency}`, or write one `trips.extra.update` audit per extra.
5. **`disclosure` and `meetingPoint` on `updateProduct` still replace whole objects** (:620-621): sending `{guides}` wipes `accommodationMeals`, and the meeting coordinates are replaced along with the text. This is consistent with what was asked (body only), but T1.1 should know. Merge `disclosure` per key in the same way, or document it.
