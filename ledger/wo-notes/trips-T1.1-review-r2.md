# T1.1 review, round 2: wip/trips-t1.1 @ 3bb000c98

- **Fix round:** e7145ea55 (`git diff b58095c14 e7145ea55`).
- **Merge:** 3bb000c98 brought in session/trips, which carries main and T0.4.
- **Method:** read-only. Nothing was built, run, sent through tsx, or queried. The only tool run was a Python key-parity check over the two `trips.json` files.
- **Measured against:** the round-1 REVIEW.md, the T1.1 brief including the controller rulings, the Next 16.2.11 docs in `node_modules/next/dist/docs`, and React 19.2.4.

## Verdict: **MERGE**

- There is no BLOCKER and no MAJOR. The round-1 BLOCKER and all three MAJORs are closed.
- The new findings are all MINOR. None of them leaks data, breaks permissions or changes a number on the pictures.
- They can go into wo-notes, or be fixed in a short follow-up before T1.2. The cheapest to fix are N1 and N2, both one-liners.

---

## 1. Round-1 findings

| # | Sev (r1) | Status | Evidence |
|---|---|---|---|
| 1 | BLOCKER: product-level PRIVACY values reach non-owners | **CLOSED** (caveat) | See below. |
| 2 | MAJOR: season prices follow `?ex=` | **CLOSED** (caveat N4) | See below. |
| 3 | MAJOR: unbounded `quoteTripLine` loop | **CLOSED** (caveat N1) | See below. |
| 4 | MAJOR: N+1 queries and an unbounded product list | **CLOSED** (caveat N3) | See below. |
| 5 | MINOR: bandSource label | **CLOSED** | See below. |
| 6 | MINOR: EN pickup areas wiped on edit | **CLOSED** | See below. |
| 7 | MINOR: a corrupt polygon row fails open | **CLOSED** | See below. |
| 8 | MINOR: a ZONE can have a zero-length window | **CLOSED** | See below. |
| 9 | MINOR: i18n leaks | **CLOSED** (caveat N6) | See below. |
| 10 | MINOR: error boundary does not cover the layout | **CLOSED** | See below. |
| 11 | MINOR: gate runs up to 6×, double refresh | **CLOSED** | See below. |
| 12 | MINOR: dead code | **CLOSED** (caveat N2) | See below. |
| 13 | MINOR: dialog accessibility | **CLOSED** (caveat N5) | See below. |
| 14a | MINOR: dead section anchors | **CLOSED** | See below. |
| 14b | MINOR: `effectiveFrom` not checked against the key | **CLOSED** | See below. |
| 15 | MINOR: `quoteTripLineAction` is view-only | **NOT CLOSED** (deferred) | See below. |

**#1, product-level PRIVACY values (BLOCKER).**
- `screens.ts:831` builds `visibleKeys` from the engine's `form.fields[].masked`. Keys outside the viewer's form count as hidden.
- `:838-839` sends `value: null, masked: true` for those keys, so the RSC payload no longer carries the value.
- `TripsSettings.tsx:250` renders `settings.hidden` when `f.masked || o.masked`.
- Other paths checked, none leaking a value:
  - The `form` model and history are masked by the engine (`form.ts:208-227, 265-279`).
  - `standingWarnings` skips masked fields (`screens.ts:852`).
  - The only cross-key `legalInput` reads `depositPct`, which is not PRIVACY (`defs/trips.ts:329`).
  - The editor VM's `applied` keys contain no PRIVACY key.
- Writes:
  - `saveTripsSettings` → `setSettings` → `permissionIssue` returns OWNER_ONLY for every PRIVACY key (`defs/trips.ts:103` sets `ownerOnly`, `service.ts:405`).
  - `resetTripsSetting` → `resetSetting` → the same `permissionIssue` (`service.ts:1231`).
  - So a non-owner cannot overwrite or reset a masked key, and the failure messages carry only the label.
- **Caveat:** the existence and count of masked product overrides still reach the client: the key, productId and `masked:true` rows, `products[].overrideCount`, `header.productOverrideCount` and the "ตั้งรายสินค้า N" badge.
  - The engine itself exposes the same facts through `overrideCount`, `hasOwn` and `differsFromTemplate` on masked fields (`form.ts:224-229`).
  - This matches the brief's "ซ่อนค่า", which hides values, not existence. Not a defect.
- The oracle case suggested in round 1 was **not** added: `qc-trips-t1.1.mts:1015` checks only the form field `masked`, not `productOverrides`. That is the controller's call (ORACLE-EDIT).

**#2, season prices follow `?ex=` (MAJOR).**
- `screens.ts:411-414`: `basePin` filters out the rows with `departureId ≠ null`. `atDate()` changes only `localDate`. Season rows use this at `:557-559`.
- `paxRows` now use `todayPin` (`:424`), and the column header comes from the VM (`paxPrice`, `:584` → `Editor.tsx:57`).
- No percentage arithmetic is done.

**#3, unbounded `quoteTripLine` loop (MAJOR).**
- `screens.ts:379-386` adds `startsAt ≥ now`, `orderBy startsAt`, `take: 20` and a `count`, which produces `departuresTruncated`.
- `:477-487` runs the quotes in batches of 5. They run outside any transaction, so there is no second-connection-in-transaction hazard: `quoteTripLine` → `loadAll` does reads only (`pricing.ts:118-330`).

**#4, N+1 queries and unbounded product list (MAJOR).**
- `screens.ts:164-243`:
  - The light select is used for counts and search.
  - The heavy select runs only for the ids that will be shown, capped at 200.
  - `brochuresOf` does one `resolveSettingsMany` call, one `groupBy` and one insured `findMany`.
- The cap note is shown at `ProductsScreen.tsx:104-108`.
- The counts are computed before the cap and before the type/q filters, as the brief asks, and `matched` is the honest total.

**#5, bandSource label (MINOR).**
- `screens.ts:403-409, 445-446`: PAX_TYPE gives PRODUCT; SETTING and NONE are separate values; `equalsSetting` is added.
- The header comes from `vm.ageSource` (`Editor.tsx:48`).
- The oracle EV-3 edit (`qc-trips-t1.1.mts:764`) matches.

**#6, EN pickup areas wiped on edit (MINOR).**
- `Editor.tsx:246, 255, 263-265` adds an EN areas field and sends `{ th|null, en|null }`.
- The schema allows null for both (`pickup-core.ts:26-31`).

**#7, corrupt polygon row fails open (MINOR).**
- `pickup-core.ts:113, 126`: a corrupt row now gives `active:false, corrupt:true`.
- `pickup.ts:274-276`: a toggle on a corrupt row is refused, or is a no-op when it would turn the row off.
- `update` rewrites v1 and audits `corrupt:true` (`:260`).
- The UI shows the message and an Edit button instead of the toggle (`Editor.tsx:591-600`).
- A corrupt row does **not** block listing or reordering:
  - `zonesOf` never throws.
  - `reorderPickupZones` writes only `sortOrder` (`pickup.ts:292-307`), and the UI reorder re-reads the set including inactive rows (`Editor.tsx:503-517`).
  - Name-uniqueness and limit checks count the corrupt row as inactive.

**#8, zero-length ZONE window (MINOR).**
- `pickup-core.ts:45`: a ZONE now needs `windowMin ≥ 1`.
- No seed or oracle row creates a ZONE with window 0. PZ-6 calls `pickupWindowFor` directly, not the schema.

**#9, i18n leaks (MINOR).**
- `loading.tsx:16` now uses a message.
- `trips-shared.ts` now holds codes only, plus `formatYmd` with names from messages.
- `resources`, `summary`, `AppliedView`, `example.error` codes and the `extraWarnings` parameters are now all rendered through `t()`.
- The th and en files both have 336 keys, and the key sets are identical. No EN value contains Thai, and the placeholders match one to one.

**#10, error boundary does not cover the layout (MINOR).**
- `layout.tsx` now renders `<TripsCatch><TripsShell/></TripsCatch>`.
- `unstable_catchError` exists in 16.2.11 (`next/error.d.ts`, `dist/client/components/catch-error.js`).
- The docs (`04-functions/catchError.md`) say redirect() and notFound() pass through. The fallback signature `(props, { error, unstable_retry })` matches the docs.
- `requireUnit` (the login redirect) sits outside the boundary.
- A FORBIDDEN result is a return value, not a throw, so it is never swallowed (`layout.tsx:27-29`).

**#11, gate runs up to 6×, double refresh (MINOR).**
- The gate:
  - `pickup.ts:78-102` wraps it in `cache()`, keyed on the primitives (tenantId, actorUserId, unitId), so one cache entry cannot serve a different user or unit.
  - Outside an RSC render (oracle, scripts, client React build) `cache` passes straight through (react 19.2.4 `cjs/react.*.js:917`).
  - No T1.1 action changes membership, so there is no stale-gate path.
- The double refresh:
  - The pickup actions no longer call `refresh()` (`pickup-actions.ts:6, 42-57`).
  - `useRunner` refreshes once.

**#12, dead code (MINOR).**
- `refreshTripsScreenAction` is removed, as are `canPrice` on ExtraDialog and `locale` on EDITOR_IN.
- Removing `locale` is the caveat: see N2.

**#13, dialog accessibility (MINOR).**
- `ProductsScreenParts.tsx:34-88` adds Escape to close, focus on the first field, a Tab trap and focus return.
- TripsSettings now uses the shared Dialog (`:211`).
- The visual selector `[role="dialog"] …` still matches.

**#14a, dead section anchors (MINOR).**
- `TripsSettings.tsx:62-86`: sections with no fields render as a non-link span. A section hidden by the "only changed" filter switches the filter off before scrolling.

**#14b, `effectiveFrom` not checked against the key (MINOR).**
- `trips-settings.ts:67-68` rejects `effectiveFrom` for keys without `effectiveDated`. SettingsForm never sends `effectiveFrom`, so nothing regresses.

**#15, `quoteTripLineAction` is view-only (MINOR, deferred).**
- `pricing-actions.ts` is unchanged, which is acceptable for T1.1.
- However, `ledger/wo-notes/trips-T1.1.md` does not exist yet, so neither this item, the #10 note nor the missing global save bar from mock 17 is recorded anywhere.
- Brief §13.4 requires wo-notes before acceptance.

### Merge resolution, `index.ts`
**OK.**
- The T0.4 block (`index.ts:213-269`) comes first, then the T1.1 block (`:271-299`), each with its own markers.
- No identifier is exported twice. The only repeated tokens are words in comments, such as `tripSellable` in the T0.4 note.
- Nothing is missing. Every T1.1 consumer imports the VM types it uses: the new `ResourcesVM`, `BrochureVM`, `AppliedView` and `ExampleLineVM` are reached through `ProductEditorVM[...]`, and no client imports them by name.
- The merge touched no other T1.1 file: `git diff e7145ea55 HEAD` changes only T0.4 files plus `departures.ts` and `sellable-impl.ts`.

---

## 2. New findings (fix round)

### N1. MINOR: the truncation note's count includes departures without their own price
- **Where:**
  - `ProductsScreenEditor.tsx:109` renders `t("seasons.depTruncated", { n: vm.departures.length })`.
  - `vm.departures` holds the 2 next departures plus up to 20 priced ones (`screens.ts:388-389`).
- **Effect:** the message reads "Showing the next 22 departures with their own price" when only 20 have one. The other screens are honest:
  - The `?ex=` choice list is the same set by design.
  - `hasOwnPrice` uses the full id list (`:605`).
  - The list `counts` are taken before the cap.
- **Fix:** add `pricedShown: pricedDeps.length` and `pricedTotal` to the VM, and render `{ n: vm.pricedShown, total: vm.pricedTotal }`. Alternatively use `n: TRIPS_PRICED_DEPARTURE_CAP`.

### N2. MINOR: `locale` removed from the strict editor input, breaking the brief's signature
- **Where:** `screens.ts:248`. EDITOR_IN is a `z.strictObject`.
- **Effect:**
  - Brief §4 item 4 defines `loadProductEditorVM(ctx, { unitId, productId, exampleDepartureId?, locale? })`.
  - A caller that follows the brief and passes `locale` now gets INVALID_INPUT, which the page turns into notFound().
  - The page and the oracle do not pass it today, so nothing breaks yet.
- **Fix:** restore `locale: z.enum(["th","en"]).optional()` and ignore it, with a comment. Or record the contract change in wo-notes.
- **Related contract renames** (none of them is tested by the oracle) to list in wo-notes for T1.2+ readers:
  - `optionSummary` → `summary{}`
  - `resourcesTh` → `resources`
  - `applied.valueTh` → `view`
  - `example.error`, from a Thai string to a code plus `errorDetailTh`

### N3. MINOR: the batched insured-departure query has no row bound
- **Where:** `screens.ts:91-94`. It selects `{ productId, insurance }` for every future non-cancelled departure of up to 200 products, with no `take`. Round 1 had `take: 500` per product.
- **Effect:** a shop with daily departures a year ahead sends about 73k JSON rows per list render, only to set a boolean per product.
- **Fix:** let the database answer instead.
  - Either use a JSON path filter with distinct: `where: { …, insurance: { path: ["policyNo"], not: Prisma.AnyNull } }, distinct: ["productId"], select: { productId: true }`, keeping the `textOf` check in JS.
  - Or use one raw `SELECT DISTINCT "productId" … WHERE insurance->>'policyNo' <> ''`.

### N4. MINOR (latent): season and "today" rows still inherit time-of-booking inputs from the example departure
- **Where:** `screens.ts:413` `atDate()` changes only `departure.localDate`. `departure.startsAt`, `sold`, `held` and `reserved` stay those of the `?ex=` departure.
- **Effect:** `pricing-core.ts:755-757` uses `dep.startsAt` for LAST_MINUTE, and seat counts for load rules.
  - If the shop has an active LAST_MINUTE rule and `?ex=` points at tomorrow's departure, every season row and the pax prices show the discount.
  - The seed has no such rule, so the pictures are unaffected.
- **Fix:** in `atDate`, also set `startsAt` to the season date combined with the departure's local time, and `sold: 0, held: 0, reserved: 0`. This only filters and replaces input; it does no arithmetic.
  - Or label the column "ราคาฤดูกาล (ไม่รวมกฎโปร)" and document that rules are not reflected.

### N5. MINOR: Escape discards in-progress edits without asking
- **Where:** `ProductsScreenParts.tsx:52-56`. The document-level Escape handler always calls `onClose`, including:
  - while SettingsForm's own legal-warning `role="alertdialog"` is open (`SettingsForm.tsx:801`),
  - while a `run()` is busy,
  - after the user has typed into Content, Pickup or Season dialogs.
- **Effect:** one key press loses the W01/W03 confirmation step and any unsaved text. Saving is not affected, because nothing is written without the explicit button.
- **Fix:** add a `dirty` or `busy` prop to Dialog. If set, ignore Escape or ask with `confirm`. Also skip Escape when `e.target` is inside a `[role="alertdialog"]`.

### N6. MINOR: Thai still reaches EN screens through service and action error text
- **Where:**
  - `useRunner`'s `msgOf` shows `r.message ?? r.messageTh` (`ProductsScreenParts.tsx:111-112`).
  - Service failure messages are Thai: pickup INVALID_INPUT, NAME_TAKEN and others, and T0.x actions.
  - `example.errorDetailTh` comes from the pricing engine (`Panels.tsx:117`).
- **Effect:** these are outside the brief §9 frame-only scope, but they are the remaining Thai on English screens.
  - One case is unhelpful in either language: saving a ZONE with window 0, or repairing a corrupt zone without changing its window (the dialog opens with `win = "0"`, `Editor.tsx:248`), returns a generic INVALID_INPUT without saying that the window must be at least 1 minute.
- **Fix:** map the `code` values (INVALID_INPUT, NAME_TAKEN, ZONE_LIMIT, BUSY, FORBIDDEN) to `trips.errors.*` in `useRunner`. Also default `win` to `"30"` when `zone.corrupt`.

### N7. MINOR (process): wo-notes for T1.1 are missing
`ledger/wo-notes/trips-T1.1.md` is absent. Brief §13.4 requires it before acceptance, with:
- Q1–Q8,
- the inactive-zone debt in pricing,
- EN registry labels,
- 15/24 pending T0.6,
- the r1 #10 note,
- the r1 #15 note,
- the mock-17 global save bar deviation,
- N2's contract renames.

---

## 3. Checked, no issue
- **`unstable_catchError` usage:**
  - The fallback is in a `'use client'` module.
  - The async Server Component `TripsShell` is passed as children from the server layout, which is allowed.
  - `notFound()` inside `TripsShell` passes through to the parent not-found handling, as before.
  - Page errors are still caught first by `trips/error.tsx`, which sits inside the layout.
- **`React.cache` gate:**
  - The cached object is shared within one render. Callers do not mutate it, and `settingsActorOf` copies `unitAccess` and `permissions`.
  - Failures are cached for the request, which is correct.
- **Batch-of-5 quotes:** no transaction, no advisory lock. A peak of 5 concurrent read chains is acceptable for the pool.
- **Corrupt rows:** with `active:false` they are excluded from `activePickupZonesOf`, so the editor shows them only in the inactive list. `update` rewrites v1 and leaves the zone inactive, and it can then be switched on. `pricing.ts:181` still reads every zone; this debt is already recorded.
- **Hard-coded Thai:** none left in `src/app/app/u/[unitSlug]/trips/**` or `src/components/trips/**`, apart from:
  - comments,
  - `฿`,
  - `TRIPS_SETTINGS_SECTIONS.labelTh`, which only feeds the VM; the UI uses `t("settings.sections.*")`.
- **`loading.tsx`:** it is now async (`getTranslations`). The docs allow Server Component loading.
- **Visual script `--ex-date`:** the date is validated as `YYYY-MM-DD`, the id is looked up from the seed, and the default is unchanged at 14 Nov.
- **`pickup-actions`:** the actions still export only async functions, after `refresh()` and the `after()` helper were removed.

## 4. Not checked
- No build, tsc, oracle, seed, visual or parity run. The gate in this worktree is running them.
- Runtime behaviour of `unstable_catchError` when a Server Component throws during SSR (where the client boundary first catches). This was taken from the docs only.
- Whether a Server Action shares a React.cache scope with the re-render that follows it in the same request. No T1.1 action changes permissions, so this is moot for now.
- The T0.4 code brought in by the merge, beyond its index.ts export block and the absence of name collisions.
- Pixel and numeric parity (§10 numbers and mock 16/17). That is the controller's PARITY step.
