# T0.2 code review: products · options · pax types · extras · content
Tree `/root/projects/shark-trips-l2` · branch `wip/trips-t0.2` · commit `71c07cf4d` (src + seed + fixture; the scripts/qc-*.mts oracle edits were not reviewed)
Scope: read-only. No build, typecheck, tests or DB access were run.

**Verdict: FIX FIRST**: 0 BLOCKER · 1 MAJOR · 9 MINOR. The MAJOR is a small fix.

## What holds (checked, no finding)
- **Isolation.** All 20 services go through `gate()` in the ruled order (products.ts:350-377): live Membership (`acceptedAt` not null), then the unit belongs to the shop, is ACTIVE and passes `canAccessUnit`, then the TRIPS check, then `evaluate`. Every read and write goes through `tenantDb({tenantId, unitId})`. The only raw SQL is `lockProduct` (:403), and it binds `tenantId` and `unitId` itself. A child id from another unit or shop returns the same NOT_FOUND. No check that runs before the NOT_FOUND gives a different answer for an id that exists and one that does not. LOCALE_DISABLED, AGE_RANGE and the unit-level paxPrices check all run before the lookup and do not depend on the row.
- **Actions.** All 20 actions (product-actions.ts) override `unitId` with the id from `requireUnit(slug)`, and the service checks every gate again. The file exports only async functions.
- **Mass assignment.** Every `create`/`updateMany` `data` is built field by field from parsed values. `tenantDb.create` spreads the scope filter last, so the scope wins. No caller-controlled object reaches `data` (TRIPS-RUN §3 is satisfied). All schemas are `z.strictObject`. Ints are bounded at 0..2^31-1, lat/lng are bounded, text is ≤160/8000 chars.
- **Invariants.** Each of these holds and has a named error:
  - publish requires `title.th`, an active option and an active seat-using pax type
  - the publish ↔ last-option and publish ↔ last-seat-pax races are serialised by `FOR UPDATE` on the product
  - age bands are checked under the lock on create, update and re-activate
  - pass-through and tax-kind conflicts return named errors before the DB CHECK can raise 23514
  - TOUR/ATTRACTION is forced to THB before the CHECK
  - status changes are CAS with audit and outbox in the same tx
  - `publishedAt` is set once and never cleared (§12)
  - archive requires confirm plus a reason of ≥10 characters when the product is ACTIVE, was published or is referenced
  - there is no `.delete`/`deleteMany`
  - concurrent creates with the same slug hit the unique index, P2002 → `SLUG_TAKEN`
- **Events.** Registered in outbox-consumers and AUTOMATION_EVENTS. Webhooks pick them up through the spread at `src/lib/webhooks/labels.ts:6` (verified). The payload is exactly `{productId, unitId, productType, status}`. The key `<type>:<id>:<ms>` is fine (emitOutbox upserts).
- **Settings.** T27 is copied into the columns at creation and read at `{unitId, productId}` when the type is null. T44 supplies the flag defaults on create and `commissionPct` on read. T3 and T2 are read as ruled. products-core.ts has no imports, no I/O and no `any`. T27's refine (`infantBelow ≤ childFrom ≤ childTo`) guarantees that the copied default bands never overlap.

## Findings

### 1. MAJOR: once a LIVEABOARD draft has an extra, its currency can never change
products.ts:579-582 (`updateProduct`) and products.ts:1156-1159 (`extraCurrency`)
- **Why.** `updateProduct` refuses a currency change while any extra of the product (inactive ones included) has another currency. `updateExtra` refuses any extra currency other than the product's (`CURRENCY_MISMATCH`). Rows cannot be deleted (§11 rule 8).
  - So a USD→THB switch on a draft that has even one extra is blocked for good. The only way out is to archive it and re-create it under a new slug.
  - Related race: `createExtra` and `updateExtra` read the product currency outside the tx and without the lock (:1177, :1238). A concurrent `updateProduct` currency change (its extra count at :580 is also unlocked) can leave an extra in the old currency.
- **Fix.** In `updateProduct`, when the currency changes: `lockedTx` + `lockProduct`, then check `status === DRAFT`. Inside the same tx, `updateMany` the product's extras to the new currency and write a `trips.extra.update` audit per row. Prices stay as entered; return or flag them for review. Or, if the controller prefers, return a dedicated error and let `updateExtra` change an extra's currency while the product is DRAFT.
- **Also.** In `createExtra`/`updateExtra`, take `lockProduct` inside the tx and re-read `currency` from the locked row.

### 2. MINOR: lost updates on product JSON (body, title, meetingPoint)
products.ts:556-598 and :617-658
- **Why.** `setProductContent` and `updateProduct` read, modify and write `title`/`body`/`meetingPoint` without a lock or a version check. Two editors, for example one saving TH and one saving EN, or a content save racing an `updateProduct`, silently drop one side's text. §4.12 does not require a lock here, but the data loss is real.
- **Fix.** Use `lockedTx` + `lockProduct`, and read the row inside the tx before computing `next`.

### 3. MINOR: builder decision "updateProduct replaces the whole body" (disagree)
products.ts:568, 451-459
- **Why.** `body: {summary}` wipes `itinerary`, `includes` and `photoFileIds`. T1.1 will upload photos and edit sections separately, so any partial form loses data.
- **Fix.** Merge per key: a key that is absent keeps its stored value, and `null` or `{}` clears it. Or have the controller rule it explicitly before T1.1.

### 4. MINOR: T2 (enabled locales) only applies to `setProductContent`
products.ts:126-136 and 148-157
- **Why.** `createProduct`, `updateProduct`, options, pax labels and extras accept `zh` (or `en`) even when T2 disables it. §4.13 says the writable locales are T2.
- **Fix.** After parsing, reject (`LOCALE_DISABLED`) any non-`th` key not in T2 at `{unitId}`, or strip it. Either way, rule it.

### 5. MINOR: foreign ids are stored unchecked
`stockItemId` at :238 and :1201; `photoFileIds` at :141
- **Why.** Any string is accepted, including another shop's stock item or file id. Whatever later dereferences them unscoped (X.2 stock deduction, T1.1 photo rendering) inherits a cross-tenant reference.
- **Fix.** Validate ownership now through the stock/file facade, or put a hard note on X.2/T1.1 that every dereference must go through `tenantDb`.

### 6. MINOR: a null-age INFANT can be created with an empty band
products.ts:1006-1026 with core :202-203
- **Why.** On a product whose T27 has `infantBelow = 0`, `createPaxType({code:"INFANT"})` without ages stores a type whose effective band is `{0,-1}`. It is accepted silently and never matches anything.
- **Fix.** Return `AGE_RANGE` when the effective band has `to !== null && to < from`. Check it on create, update and re-activate.

### 7. MINOR: SLUG_TAKEN reveals slugs in units the actor cannot see
products.ts:546 and :601
- **Why.** Slugs are unique per shop, as specified, so a staff member limited to unit A can find out which slugs exist in unit B. This is an inherent consequence of §4.8.
- **Fix.** None needed. Record it as accepted.

### 8. MINOR: archive does not stop new references
products.ts:726-736
- **Why.** `isReferenced` is a point-in-time check under the product lock. Nothing stops T0.3/T0.5 from adding departures or prices to an ARCHIVED product afterwards.
- **Fix.** Add to the T0.3/T0.5 orders: lock the product row `FOR UPDATE` and refuse unless the status is DRAFT/ACTIVE.

### 9. MINOR: the seed is not a full reset, and later orders lack ids
seed-trips-qc.mts, `ensureTripProduct`
- **Why.**
  - The seed restores fields, options and extras, but not extra flags (`passThrough`/`commissionable`/`taxKind`). It does not touch pax types: a deactivated ADULT makes `publishProduct` throw.
  - Extras that the fixture does not list are left in place.
  - `trips-expected.json` exports only `productIds`. T0.3 (departures need option ids) and T0.5 (prices per pax type) will have to look ids up by Thai name.
- **Fix.** Also export `optionIds`, `paxTypeIds` (by code) and `extraIds` (by kind) per product. Optionally re-assert pax types and flags.
- **Otherwise the seed is good.** Fixture numbers match mock 16 and §7.4: duration 510, park fee 60,000 with `{ADULT:60000, CHILD:30000}`, camera 50,000, intro dive 190,000, Similan park fee per person; Racha EN is missing exactly 2 sections. A second run writes nothing (canon diff). Existing fixture arithmetic is untouched.

### 10. MINOR: `readStrings` hides a broken setting
products.ts:338-341
- **Why.** An unreadable T2 or T3 becomes `[]`. The user then sees `LOCALE_DISABLED` or `CURRENCY_NOT_ALLOWED` and is told to change settings. T27 and T44 throw instead.
- **Fix.** Throw, as for T27 and T44.

## Builder's decisions
1. **Permission gate before input parsing, unparsable ctx → NOT_FOUND.** Agree. `ctx` is built on the server. Malformed input without `unitId` gives INVALID_INPUT before the membership check, which leaks nothing.
2. **`updateProduct` replaces the whole body.** Disagree; see finding 3.
3. **INFANT not created when `infantBelow` is 0.** Agree, since the band would be empty. Apply the same rule to manual creates (finding 6).
4. **Extras `sortOrder` max+1 without a lock.** Agree. Ties are broken by `createdAt` and `id`, which is harmless. It becomes free if finding 1 adds `lockProduct` to `createExtra`.
5. **Seed overwrites manual edits of the four seeded products.** Agree for a QC-only seed where the fixture is the truth. Note it is a partial reset (finding 9).
