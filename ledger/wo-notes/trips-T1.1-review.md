# T1.1 independent review — wip/trips-t1.1 @ b58095c14

Scope: everything in `git diff b58095c14~1 b58095c14` for src/ plus the five scripts. This is a read-only review: nothing was built, run or queried.
Against: T1.1 brief (the controller's ruling section overrides the body), mock-ups 16 and 17, TRIPS-DEFAULTS §5.1, the Next 16.2 docs in node_modules/next/dist/docs, and hotel/layout.tsx as the reference module.

## Verdict: **FIX FIRST**
The fixes are small: one BLOCKER and three MAJORs, each a few lines in `screens.ts` or `TripsSettings.tsx`. Nothing structural needs to change. Once they are in, the pictures can proceed.

---

## Findings

### 1. BLOCKER: product-level PRIVACY settings reach non-owners
**Where:** `src/lib/modules/trips/screens.ts:731-747` and `src/components/trips/TripsSettings.tsx:213,240`
- `productOverrides[]` holds the raw `SettingValue.value` of **every** `trips.*` row set at product level.
- It is serialised to the client in both UNIT and PRODUCT scope.
- `FieldRow` renders it with `formatFieldValue(f, o.value)` even when `f.masked` is true.
- Three PRIVACY keys can be set per product (chain U_P): `trips.pdpa.healthDataProducts`, `trips.waiver.template` and `trips.waiver.requiredFor` (defs/trips.ts:438,446,449).
- So a manager with `trips.settings.edit` who is not the OWNER sees values that the engine masks everywhere else, both in the RSC payload and on screen. This breaks brief §6: PRIVACY values are hidden from non-owners and come from `editIssueFor`/form masking, not from a second decision on the screen.

**Fix:** in the loader, build a `masked` set from `form.groups[].fields[].masked`. For those keys:
- either drop the entry,
- or keep only `{ key, productId, titleTh, value: null, masked: true }`.

Then render `t("settings.hidden")` in `FieldRow` when `f.masked`. Also add an oracle-style case: a non-owner with settings.edit, a waiver.template set at product level, and the value must be absent.

### 2. MAJOR: season prices change with `?ex=`
**Where:** `screens.ts:493-507`
- Season rows reuse `pin`, which was loaded for the example departure. Only `departure.localDate` is changed.
- `pricing-core.ts:589` picks `depRows = usable.filter(r => r.departureId === dep.id)`, and departure-specific prices win.
- So when `?ex=` points at a departure with its own price (the seeded 31 Dec at 4,500), **every season row** shows 4,500/3,150 instead of 3,500 / 3,900 / 2,900.
- The child prices are wrong in the same way.

**Fix:** for season rows, pass `{ ...pin, prices: pin.prices.filter(r => r.departureId === null), departure: { ...pin.departure, localDate } }`. This filters the input and does no arithmetic, so it stays within the "ห้ามคูณ % เอง" rule. Apply the same reasoning to `paxRows` (`:470`): the column header says "ราคาฤดูกาลหลัก", but the value follows `?ex`. Either compute paxRows from the filtered input at today's date, or relabel the column.

### 3. MAJOR: unbounded `quoteTripLine` loop on every editor render
**Where:** `screens.ts:403, 410-412, 510-531`
- `deps` = the 2 next departures **plus every departure that has ever had a departure-specific price**.
- Neither `depPriceRows` nor `pricedDeps` has a `startsAt` filter or a `take`. Past departures are included.
- Each departure costs one `quoteTripLine`, i.e. a full `loadPricingInput` (about 8 queries plus a settings resolve), and these run serially.
- This grows without limit over a shop's lifetime, and past rows add noise to the "ราคาเฉพาะรอบ" table and the example `<select>`.

**Fix:** add `startsAt: { gte: now }` and a cap (e.g. `take: 20`, ordered by `startsAt`) to the departure-priced query. Optionally run the quotes with `Promise.all` in small batches.

### 4. MAJOR: N+1 and unbounded product list
**Where:** `screens.ts:185-234`
- `findMany` on `tripProduct` has no `take`, and it selects body and disclosure JSON for every product, archived ones included.
- For each listed product, `brochureOf` runs `resolveSettings`, a `tripPrice.count` and a `tripDeparture.findMany` (take 500) serially: three round-trips per product.
- That is acceptable for the 4 seeded products but scales linearly.

**Fix:**
- Resolve the unit-level `trips.license.fields` once.
- Batch the price counts with `groupBy({ by:["productId"] })`.
- Batch insured departures in a single `findMany` with `productId in ids`.
- Only `prospectus.checklist` and `minToDepart` need per-product resolution; batch those if the facade allows.
- Cap the list (e.g. 200) or paginate.

### 5. MINOR: misleading age-band source
**Where:** `screens.ts:454-462`, `ProductsScreenEditor.tsx:186`, `messages/th/trips.json pax.source`

On your question, the `bandSource` heuristic is **not sound as a label**:
- T0.2 copies T27 into the pax-type columns when the product is created. After that, the row never follows the setting.
- Reporting "SETTING" because the values happen to match implies a live link that does not exist.
- When the setting changes, the row silently flips to "PRODUCT". That flip is accurate, but it surprises the user.
- Non-ADULT/CHILD/INFANT codes, whose band source is NONE, are also reported as "SETTING".

The UI does not render `bandSource` at all. Instead it shows a fixed header, "ช่วงอายุ: ค่าจากแม่แบบ (ปรับได้)", which is wrong for any customised product.

**Fix:**
- Report `"PRODUCT"` whenever `band.source === "PAX_TYPE"`, with an extra `equalsSetting: boolean`.
- Map NONE to its own value.
- Render the header from the VM: "เท่าค่าตั้ง (คัดไว้ตอนสร้าง)" versus "ตั้งที่สินค้า".

### 6. MINOR: English pickup areas wiped on every edit
**Where:** `ProductsScreenEditor.tsx:774`

`PickupDialog` sends `areas: { th }`, and `cleanAreas` then drops `areas.en`. Every edit therefore erases the English areas (the seeded "Kata · Karon …"). The service accepts this as written.

**Fix:** send `{ th, en: zone?.areas?.en ?? null }`, or add an EN areas field to the dialog.

### 7. MINOR: a corrupt `polygon` row fails open
**Where:** `pickup-core.ts:108-110`

On a parse failure, the row falls back to `active: true` and `kind: "ZONE"`, so a zone that was disabled reappears as active. It does not crash, which is good. The next update or toggle then persists the defaults, again `active:true`, with no audit trail of the corruption.

**Fix:** fall back to `active: false` and add a `corrupt: true` DTO flag shown as "ข้อมูลโซนเสีย — แก้ใหม่". The service should refuse to toggle a corrupt row to active until it has been rewritten through update.

### 8. MINOR: a ZONE window can have zero length
**Where:** `pickup-core.ts:43-46`

`windowMin` 0 is allowed for `kind: ZONE`, which renders as "06:45–06:45". Start < end is not enforced for ZONE.

**Fix:** require `windowMin ≥ 1` for ZONE, or render a single time.

### 9. MINOR: i18n leaks
English screens will show Thai in these places. The th/en key sets are identical (checked), there is no 中文, and every `t()` key exists.
- **loading.tsx:13**: the sr-only text "กำลังโหลด…" is hard-coded.
- **trips-shared.ts:100-130**: hard-coded Thai labels rendered in client components: `EXTRA_BASIS_TH` (also used as the `<option>` labels in ExtraDialog), `CONTENT_SECTION_TH`, `PROSPECTUS_TH`, and the `thDate` weekday/month names.
- **screens.ts**: user-visible Thai built in the loader:
  - `resourcesTh` ("รถตู้ N คัน", "ไกด์ N คน", :126)
  - `optionSummary` ("N ที่", "N ตัวเลือก", :229)
  - `appliedTh` (:318-336)
  - `example.error` strings (:625, :633)
  - `seasonName` "ราคาเฉพาะรอบ" (:639)
  - the `extraWarnings.messageTh` template (:585)
- **page.tsx:12-15**: the `UNIT_NAV.TRIPS` labels are Thai literals. This matches the other entries in that file, so it is acceptable.

**Fix:** move the frame labels into `trips.json`, either as codes plus params from the loader or as message keys. The brief's "ป้ายค่าตั้งเป็นไทย" exception covers registry labels only.

### 10. MINOR: error boundary does not cover the layout
**Where:** `trips/error.tsx`

Using `unstable_retry` is correct for 16.2 (docs `03-api-reference/03-file-conventions/error.md:117`). However, per `error.md:96`, error.js does **not** wrap the `layout.js` of the same segment. A throw inside `trips/layout.tsx` (`loadTripsNav` / `getTranslations`) bubbles up to the app-level boundary, not to `trips-error`.

Note this in wo-notes, or move the nav fetch into a component that sits under a boundary. No change is needed for T1.1 pictures.

### 11. MINOR: the gate runs up to 6 times per request
**Where:** layout, page and loaders.
- One products request runs `requireUnit` twice (layout and page).
- It runs `tripsUnitGate` four times: loadTripsNav, tripsPageGate, loadProductListVM and loadProductEditorVM.
- `getProduct`'s own gate adds one more.

That is about 6 membership and unit lookups. Wrapping `tripsUnitGate` in `React.cache` would remove them (docs `01-getting-started/06-fetching-data.md:541`). The pickup actions also call `refresh()` server-side **and** `useRunner` calls `router.refresh()`, so each mutation re-renders twice.

**Fix:** drop `router.refresh()` when the action already refreshed, or drop `refresh()` from `pickup-actions`.

### 12. MINOR: dead or unused code
- `screen-actions.ts:58` `refreshTripsScreenAction` is exported and never used. It is a callable server endpoint with no purpose; remove it.
- `ExtraDialog`'s `canPrice` prop is accepted and ignored (`ProductsScreenEditor.tsx:700, 744`).
- `EDITOR_IN.locale` is accepted and ignored.

### 13. MINOR: dialogs have weak accessibility
**Where:** `ProductsScreenParts.tsx:35`, `TripsSettings.tsx:191`

These are `role="dialog" aria-modal` with no Escape key, no focus move or trap, and no return of focus.

### 14. MINOR: `trips.settings` UI details
- **Dead anchor:** the section menu anchors `#sec-<key>` point at cards that are not rendered when "ดูเฉพาะที่ปรับ" hides them, or when a section has no fields (`TripsSettings.tsx:62,167`).
- **`effectiveFrom` not validated against the key:** `saveTripsSettings` forwards `effectiveFrom` for any key, with no check against `def.effectiveDated` (`trips-settings.ts:189`). Confirm that the engine rejects or ignores it for keys that are not effective-dated.

### 15. MINOR: `quoteTripLineAction` still requires `trips.product.view` only
**Where:** `pricing-actions.ts:118`

This is inconsistent with the widened list actions. The screen never calls it, since the loader quotes server-side after its own view|edit|publish gate, so it has no effect on T1.1. The ruling asked for "1 จุด". Record it in wo-notes as a known inconsistency for T1.3.

---

## Checked and OK (no action)
- **Route gates:**
  - Every page (index, products, settings, the four not-yet pages) runs `requireUnit(slug)` and then `tripsPageGate` before loading anything.
  - The layout checks `unit.type` and calls `loadTripsNav`.
  - The unit always comes from the slug resolved server-side.
  - Redirects are built only from the validated slug.
  - Links use `encodeURIComponent` / `URLSearchParams`.
- **Search params:**
  - `?type` is an enum.
  - `?q` is sliced to 100 and filtered in memory.
  - `?p` and `?ex` go through zod and are scoped to the unit and product (other units give NOT_FOUND, then `notFound()`).
  - `?scope` / `?id` are checked against the unit's products.
  - `?section` is an enum.
- **Server actions:**
  - `screen-actions.ts` and `pickup-actions.ts` export only async functions.
  - `unitId` is always taken from the slug (`withUnit` overwrites it).
  - The services re-gate from live Membership.
  - `saveTripsSettings` rejects non-`trips.*` keys and scopes outside UNIT(this) / PRODUCT(of this unit). It builds `SettingChangeInput` field by field and caps changes at 200.
- **Client import chains:**
  - Client components import `@/lib/modules/trips` and `@/lib/core/settings/types` as type-only.
  - Everything else is "use server" action modules, `trips-shared` (type-only import), `settings-shared` or `SettingsForm`.
  - No path reaches prisma.
- **Pickup service:**
  - Uses tenantDb scoped to tenant and unit, with strict zod and int4/day bounds.
  - The polygon is validated on read.
  - There is no delete function.
  - Data objects are built field by field.
  - `surchargeSatang ≠ 0` on create, or a changed surcharge on update, requires `trips.price.edit`.
  - Writes take a per-unit advisory lock.
  - Reorder requires the complete, duplicate-free set (`P.ids.length === zones.length`); a foreign id gives NOT_FOUND. The UI reorder re-reads the full set including inactive zones.
  - Writes are audited.
- **`pricing-actions.ts` +6 lines:** this is a strict widening from view to view|edit|publish, as the ruling directs. The old `assertCan` is kept (the S-14 no-delete rule), and no check is weakened. The loader does not call `prices.ts`.
- **Accountant badge:** it comes from engine `reviewHint`. The ACCOUNTANT keys in defs are exactly T26, T35, T37, T39, T41, T42 (hidden until PHASE_2) and T44, plus X5 `trips.fx.rates`, which matches §5.1 + X5.
- **Standing warnings:**
  - They go through `legalInputsOf` + `evaluateTourRule`, with no rule duplicated.
  - Masked fields are skipped.
  - Results are sorted HIGHEST > HIGH > NORMAL.
  - Acknowledgement without a reason is left to the form and domain (OQ3).
- **Shared files:**
  - `app/layout.tsx` and `u/[unitSlug]/page.tsx` are purely additive TRIPS cases. All six hrefs have a `page.tsx`.
  - `i18n/request.ts` adds only the namespace.
  - `index.ts` has an explicit export block.
  - Nothing under `src/lib/core/settings/**` or `src/components/settings/**` changed.
- **UI rules:**
  - Every `data-testid` in brief §11 exists in source (checked by script).
  - Status uses shape (solid / dashed / muted / thick) plus text and `data-status`.
  - No `text-xs` and no raw hex colours; every colour token used exists in `globals.css`. `bg-black/40` has precedent.
  - Buttons and inputs use `min-h-11`.
  - The currency line appears only for LIVEABOARD, and there is no zh.
  - Loading, empty, error, forbidden and not-yet states all exist.
- **Caching:** the pages are dynamic through cookies (`requireUnit`). There is no `"use cache"` (cacheComponents is off). `refresh()` is used only inside server actions (docs `04-functions/refresh.md`).
- **Brochure:**
  - All nine sources are defined deterministically from data.
  - Racha comes out at 7/9 (license and insurance missing), which matches mock 16.
  - `pct` comes from the T0.2 `prospectusChecklist`.
- **Visual script:**
  - No default base URL, and port :3215 is refused.
  - Ids are looked up by slug at run time.
  - The viewport is 1440×900.
  - The session gets a UA tag and is deleted in `finally`, as is the profile directory.
  - The selectors `[data-setting-key]`, `[role="alertdialog"]` and the "บันทึก" button text all exist in `SettingsForm.tsx` (485/801/860).
  - The scene stops before "ยืนยัน".
  - The parity script argument handling is sound.
- **Seed:**
  - Writes go through the services.
  - It reads, compares, then writes, so it is idempotent.
  - It deletes nothing and does not touch child prices.
  - The `shopRates` shape matches `PARK_SCHEMA`.
  - The Similan pay values are 30 / 60 / [7,1].
  - It does not write the 50/30/0 ladder.

## On the declared deviations
1. **Compact read rows with the shared `SettingsForm` in a dialog, so W01/W03 appear in the dialog:** acceptable. Brief §6 prescribes the HotelSettings card→SettingsForm pattern, and §12 defines the warning scene as product scope plus `section=cancel` plus save. Mock 17's inline editable card cannot be built without either drawing settings fields by hand (forbidden) or changing `SettingsForm` (forbidden). The standing warnings do still render inline on the card. Mock 17's global "บันทึก 1 ข้อ / ยกเลิกที่แก้" top bar is missing; record it in wo-notes, by the same reasoning as Q4.
2. **Top bar merged into the app frame:** acceptable. Let the picture confirm there is no double header.
3. **Left menu shows only the nine trips sections, with one text line for the other domains:** this matches brief §1 (✗ / ข้อความ).
4. **`quoteTripLineAction` still view-only:** acceptable for T1.1 (see #15).
5. **Sold counts show 0:** this follows the Q7 ruling, so the 15/24 and 21/24 in the mock are expected to differ.

## Things only the rendered pictures can settle
- **The 11,450.00 total and its lines:** does the park fee come back as two priced items (ADULT/CHILD), giving the grouped label "ค่าอุทยาน 2 + 1", or as one item? In the one-item case, `unitSatangOf` would show a misleading "3 × 500".
- **Clock dependence:**
  - The loaders use the real clock, not `TRIPS_AS_OF`: the "next 2 departures", the season marked "ใช้อยู่", and any booking-date rule in `quoteTripLine`.
  - Take the pictures before 14 Nov.
  - Confirm that 14 Nov, 15 Nov and 31 Dec appear, with sources ฤดูกาลหลัก / ฤดูกาลหลัก / ราคาเฉพาะรอบ "ทับ ปีใหม่".
- **The season table:** shows 3,500/2,450 · 3,900/2,730 · 2,900/2,030 once #2 is fixed. With `ex=14 Nov` it looks right even unfixed; test `ex=31 Dec` as well.
- **Camera row:** the camera shows the dashed "50%" pill, and park fee and trial-dive flags match mock 16.
- **Pickup times:** 06:45–07:35 free · 06:15–06:40 +600 · พบ 08:00. This depends on the first active option's schedule `departTimeMin` being 480.
- **Settings counts:** unit level shows "ต่างจากแม่แบบ 3" and "ตั้งรายสินค้า 6". The 6 includes the three Similan pay keys plus minToDepart 8/10/4.
- **Liveaboard scene:**
  - The 3-row ladder renders as 6 numeric inputs inside `[data-setting-key="trips.cancel.ladder"]`.
  - The W01 box comes before W03.
  - Nothing is written (no "บันทึกแล้ว" notice).
- **General layout:** no horizontal overflow at 1440 with the three columns, the long tables and the settings chain/scope row; font sizes and 44 px targets as rendered.
- **Nav:** the TRIPS nav does not duplicate the app's own side menu and top bar.
- **Regressions:** T0.5 oracles still pass after the three unit pickup zones and the INFANT 0 row are added. This is the controller's regression run.
