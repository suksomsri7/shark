# T1.2 review — shop departure calendar (RUN TRIPS) · wip/trips-t1.2 @ 90c0c7580

Reviewer: independent, read-only (no build, no tsx, no DB). Diff reviewed: `a9c23ffa1..90c0c7580` on src + scripts listed in the brief.
Read: brief T1.2 (incl. final "มติผู้คุม"), mock 11 PNG, wo-notes T1.1/T1.2, oracle qc-trips-t1.2.mts (titles + CV-6/8/14, DA-13), T0.3 departures.ts/resources.ts/departures-core.ts, T0.4 capacity-core, T0.5 pricing.ts/pricing-core.ts, T1.1 ProductsScreenParts (Dialog/useRunner), app shell padding (AppMain.tsx), Next docs for `<Link scroll>`.

## Verdict: **FIX FIRST** (0 BLOCKER · 2 MAJOR · 16 MINOR)

Both MAJORs are small fixes. Security, tenant/unit scoping, the "full from counters" rule, time-zone handling and the loader caps are sound.

---

## MAJOR

### M1. At 1440 the two-column layout is on a knife edge and drops the panel below the table on any browser with a visible scrollbar
`src/components/trips/DeparturesScreen.tsx:111` — `@min-[1100px]:grid-cols-[minmax(0,1fr)_356px]`.
- Arithmetic: `AppMain.tsx:54,65` gives `lg:pl-[calc(18rem+1.5rem)]` (312 px) + `sm:px-6` right (24 px) ⇒ content width at 1440 = **1104 px** without a scrollbar, about **1087–1089 px** with a classic 15–17 px scrollbar (Windows Chrome/Edge, and possibly headless Chrome). The calendar page is always taller than 900 px, so it always has a vertical scrollbar. 1089 < 1100 ⇒ the container query fails ⇒ single column ⇒ the panel and the "ต้องตัดสินใจ" card render *below* the table. Mock 11 and brief §5 say table | panel side by side at 1440.
- Even when it is 2-col at 1104: table section = 1104 − 356 − 20 = 728, minus `p-3.5` (28) and border (2) = 698 < table `min-w-[700px]` ⇒ a 2 px inner horizontal scroll. Day column ≈ (698 − 152 − 16)/7 ≈ 76 px, which is the floor in the brief.
- Fix (pick one, then check the picture): breakpoint `@min-[1060px]`, panel `340px` (brief allows 340–372), gap `gap-4`, calendar section padding `p-3` ⇒ at 1087: 1087 − 340 − 16 − 24 − 2 = 705 ≥ 700. Or keep 356 and drop the table min to `min-w-[680px]` with product col 150 (but then day col < 76). The first option is cleaner.

### M2. "Remove guarantee" (ถอนการยืนยัน) runs on one click with no confirmation
`src/components/trips/DeparturePanel.tsx:181-185`. Un-guaranteeing (GUARANTEED → OPEN) clears `guaranteedAt` (`departures.ts:1082`), emits `trips.departure.status_changed`, and removes the customer-visible "ยืนยันออก" signal. If the departure is still below the minimum, it falls back to BELOW_MIN. Once the decision time has passed, the T0.3 job then emits `below_min`. The `guarantee` button is then hidden (`departure-screens.ts:656` needs `state ≠ BELOW_MIN`), so the only way back is the Decide dialog → RUN.
- T0.3 ruling: guarantee never reverts on its own, and clearing it must be deliberate (`departures.ts:1055`, "ยกเลิกการยืนยันโดยตั้งใจ"). A 44 px button in a 2-column grid, next to "ปิดรับจอง" and "เปลี่ยนความจุ", is a misclick risk, not a deliberate act.
- Fix: a small confirmation dialog (`DepDialog`) with a summary, e.g. "รอบนี้จะกลับเป็นเปิดขาย · ขายแล้ว {sold}/ขั้นต่ำ {min} → จะเป็น 'ต่ำกว่าขั้นต่ำ'". Reopen and guarantee can stay one-click: both are additive and easy to undo.

---

## MINOR (ranked)

1. **RUN/CANCEL (and RUN/MERGE) race can cancel a departure that was just guaranteed.** `departure-desk.ts:57-60` checks BELOW_MIN *outside* any lock, then calls `cancelDeparture`, which re-reads under lock but only CASes on the status it just read (`departures.ts:1104-1109`). GUARANTEED → CANCELLED is a legal STAFF move. The window is milliseconds: a stale dialog is safe because the pre-check reads fresh. The end state is the same as a legitimate "cancel a guaranteed departure" click, and cancel only succeeds when sold = held = reserved = 0 (atomic in the SQL), so no customer is affected. Accept as debt, but the proper fix needs T0.3 to take an `expectStatus`/`version` on `cancelDeparture`/`setDepartureStatus` (not allowed in this WO). Oracle DA-13 currently *blesses* this outcome; see the oracle gaps.
2. **MERGE checks the target outside the transaction.** `departure-desk.ts:73-77`: target validity (state, seats, same day, not archived) is checked before `cancelDeparture(source)`. The target can become CLOSED/FULL/CANCELLED in between; the source is still cancelled with a reason naming that target. Harmless because the source is empty (enforced atomically in the T0.3 SQL `sold=0 AND held=0 AND reserved=0` plus TripHold/TripBooking NOT EXISTS), so nobody actually moves. The used>0 refusal is enforced server-side inside the tx by `cancelDeparture`, so `MERGE_NEEDS_BOOKINGS` is a pre-check plus a guaranteed backstop. `HAS_BOOKINGS` for CANCEL is fully inside the tx. **MERGE is atomic** (one T0.3 tx); it never touches the target (DA-13 checks target.version).
3. **"ต้องตัดสินใจ" card offers options that cannot run.** `departure-screens.ts:409-424` computes `mergeTargets`/`firstTargetTitle` without `people === 0`. `DeparturePanel.tsx:242-244` always lists "รวมกับ X / ออกขาดทุน / ยกเลิก". After T0.6, a departure with 3 sold will propose merge and cancel, and both are refused (`MERGE_NEEDS_BOOKINGS`, `HAS_BOOKINGS`). Controller ruling 1 requires the screen to say plainly that departures with bookings cannot merge yet. Fix: in the loader, `mergeTargets = used>0 ? 0 : …`, and drop cancel from the list (or add "(มีผู้จอง — รอระบบการจอง)") when `sold+held+reserved > 0`.
4. **The "ต้องตัดสินใจ N" chip and the cancelled chip silently use truncated data.** `counts.belowMin = decisions.length`, and decisions come from `cells` already cut at `shownUntil` (`departure-screens.ts:404,433`). The truncation note sits at the bottom of the calendar (`DeparturesCalendar.tsx:31-41`), not next to the chips. Fix: when `vm.truncated`, append "(ถึง {shownUntil})" to both chips, or compute belowMin with a count query over the full range. Rare (more than 600 departures a week), so MINOR.
5. **Cancel reasons are stored in the screen language at click time; merge reasons are always Thai.** `DepartureDialogs.tsx:80-81` stores `"Weather/sea · note"` from an English screen; `departure-desk.ts:79` hard-codes `รวมรอบกับ …`. The calendar chip, cell line 2 and panel then show mixed languages (`DepartureParts.tsx:105`, `DeparturesScreen.tsx:89`). Brief §5 lists preset cancel reasons among the things to render via messages. Since the T0.3 column is free text, the realistic fix is to always store the shop's language (Thai) for presets and record that decision; or keep it and log it as debt in wo-notes. Controller's call.
6. **Internal work-order codes on screen.** `departures.notYet.bookings` "(T1.3)", `notYet.money` "T1.7", `cancelDialog.blockedLong` "T1.6", `errors.MERGE_NEEDS_BOOKINGS` "(T1.6)", and the service message `DEPARTURE_DESK_MESSAGES` (`departure-desk.ts:18`). The brief dictated "(T1.3)", but to a shop owner these read as raw codes. Suggest "เปิดใช้เมื่อมีระบบการจอง" with no ticket id.
7. **Status pill shape collision.** `DeparturePanel.tsx:56` gives CLOSED the same dashed danger pill as BELOW_MIN, but the legend says dashed = below minimum. Use `solid` or `muted` for CLOSED.
8. **"Sold" mislabels sold+held.** `departures.decide.lead` and `summaryRun` say "ขายแล้ว {used}" with `used = sold + held`, while `shortBy = minPax − sold`. With held > 0 (after T0.6): "ขายแล้ว 5 · ขั้นต่ำ 8 · ขาดอีก 5" doesn't add up. Pass `d.sold` for that placeholder.
9. **English cells break words mid-word.** Day column text width ≈ 63 px (79 − px-2). "guaranteed" at 14 px ≈ 70 px, and `[overflow-wrap:anywhere]` (`DeparturesCalendar.tsx:105`) breaks it as "guarantee|d". Use `[overflow-wrap:break-word]` plus `hyphens-auto`, or a shorter English string ("{n} free · go").
10. **Month view truncates Thai by code unit.** `DeparturesCalendar.tsx:310` `.slice(0, 10)` can split a base letter from its vowel or tone mark, giving broken glyphs. The CSS `truncate` already handles length; drop the slice.
11. **Dead anchor.** `trips-cal-attention` links to `#trips-decisions`, but `DecisionsCard` returns null when there are 0 decisions (`DeparturePanel.tsx:223`), so a "ต้องตัดสินใจ 0" chip links nowhere. Brief §15 forbids dead links. Render a `<span>` when the count is 0.
12. **Stop-sell "until" input.** `departure-screen-actions.ts:51-56`: (a) the regex accepts 2026-02-31, which `localToUtc` rolls over to 3 Mar silently; use `isCalendarYmd`. (b) A bad or missing `untilMin` silently becomes 00:00, so "until 20 Nov" means *start* of 20 Nov, and the hint doesn't say so. (c) A time with no date is dropped silently (`DepartureDialogs.tsx:468`). (d) The channel list comes only from `cutoffGroups` (`DepartureDialogs.tsx:456`), so no cut-off policy means no channels and no way to stop-sell.
13. **Trips view ("ทริปหลายวัน") label says "(1 ปี)" but the query has no upper bound** (`departure-screens.ts:457-464`: only `localDate >= today`, LIMIT 101). Add `AND "localDate" <= ${to}::date`, or change the label.
14. **`loadDepartureSchedulesVM` keeps the *oldest* 300 rules** (`listSchedules` orders createdAt asc, then `slice(0,300)`, `departure-screens.ts:778-779`), so newly created rules vanish from the dialog once a unit passes 300. `listSchedules` itself is unbounded (T0.3 debt). The calendar header uses a different query (`dateFrom desc take 300`, line 354-358), so the two can disagree. Order desc before slicing. The page also runs this loader on every week/month navigation when the user can edit; consider loading it lazily when the dialog opens.
15. **English screen shows Thai product names** although the VM carries `titleEn` (`departure-screens.ts:490`), and the price row falls back to the raw pax code (`labelTh || x.code`, line 693). Same as the accepted T1.1 debt for product names; the code fallback is the raw-code issue the controller rejected in T1.1.
16. **Small UX/accessibility gaps.**
    - The mobile panel sheet (`max-md:fixed inset-0`) has no `role="dialog"`, no focus move or trap, and the page behind still scrolls.
    - Month mobile dots are 24 px tap targets (`DeparturesCalendar.tsx:289`), against the brief's 44 px rule.
    - Clicking a decision for the departure whose panel is already open does not open the Decide dialog: `useState` init only, panel keyed by id (`DeparturePanel.tsx:31`).
    - The price dialog does not say the prices are per person before promotions/codes. The data matches T1.1 neutral inputs (`rules: [], promoCode: null, promoProviders: []`, same `loadPricingInput` + `resolveTripPrice`), but the label could be more honest: add "ราคาต่อคน ก่อนโปร/โค้ด".
    - `resourceClash` in merge targets also counts the target's own use of the same boat as a clash (`departure-screens.ts:633` excludes only `d.id`), so a same-boat target always shows the clash warning. It is informational only.
    - Departures crossing midnight show "22:00–02:00" with no +1 marker, and multi-day trips show only times in `timeText`.

---

## Answers to the specific questions

**1. Security**
- The page gates first: `requireUnit` then `tripsPageGate(page "departures")` (`page.tsx:16-22`).
- The unit always comes from the slug. Search params are whitelisted or validated: `view` and `f` against fixed lists, `start` and `month` via `calendarWeekDays`/`calendarMonthDays`, `dep` sliced to 128 then zod-checked in the loader. A `dep` from another unit or a missing one gives `notFound()`.
- Loaders validate with strict zod, then `tripsUnitGate`, then `canAny(view|edit|status)`. Every query is scoped by `tenantId + unitId`.
- New actions: `enter()` = `requireUnit` + `guard` (`evaluate`/`assertCan`), with `unitId` overwritten from the slug. The services validate every field with zod. `decideBelowMin` re-gates with `gateUnit(..,"status")` and reads both source and target through `unitDb` with tenant+unit in `where`. Cross-unit targets give `NOT_FOUND` (oracle DA-9).
- Clash description: `findClash` only joins rows with `u.tenantId = g.tenantId AND u.unitId = g.unitId` (`resources.ts:197`), and the title lookup in `assignResourceForScreenAction` is unit-scoped, so nothing from another unit or tenant can leak.
- `departure-screen-actions.ts` is `"use server"` and exports only 3 `export async function`s.
- Client imports from the facade are `import type` only. Actions are imported from `"use server"` modules (`departure-actions`, `pricing-actions`, `departure-screen-actions`), so no client chain reaches prisma. New module files use `tenantDb` and do not import prisma. **Fine.**

**2. Numbers**
- `seatsLeft = publicLeftOf = capacity − sold − held − reserved` (`capacity-core.ts:62`). FULL comes from `left ≤ 0`, not status, and a FULL status with free seats is treated as OPEN.
- Below-minimum uses **sold only** (`d.sold < d.minPax`), which matches T0.3 `needsDecision` and `evaluateMinPaxCore` (`sold >= minPax` ⇒ guarantee). The screen and the job agree on the count. They differ only in timing: the screen flags BELOW_MIN *before* the decision time (Q3 ruling) and `overdue = needsDecision`. One edge case: a departure with status FULL but free seats shows BELOW_MIN on screen, yet the job ignores it (OPEN only), and RUN gets `FORBIDDEN_TRANSITION` (FULL→GUARANTEED is SYSTEM-only). This is transient; not worth fixing now.
- `decisionAt` comes from the T0.3 DTO (`decisionAtFor` in the unit's tz). Display uses `utcToLocal(tz)`. Cut-offs come from the DTO, are grouped, and shown in shop time. `today = utcToLocal(tz, now).ymd`. Week and month grids are pure date strings, not the server tz.
- Panel price uses the same path as T1.1 (`loadPricingInput` once + `resolveTripPrice` per pax, no rules or codes); the label could be more explicit (MINOR 16).
- Low threshold and minPax come from settings. No hard-coded business numbers found (the caps are engineering limits, exported and messaged).

**3. `decideBelowMin`**
- It calls only T0.3 `setDepartureStatus` (RUN) or `cancelDeparture` (CANCEL/MERGE). Each runs in its own T0.3 tx with a row lock + CAS + event + audit. The desk's own reads are outside any tx.
- The RUN→CANCEL race is real but narrow (MINOR 1). It ends equal to a legitimate cancel and only on empty departures, so no customer impact.
- MERGE on an empty departure = cancel the source with the reason `รวมรอบกับ {target title} {HH:MM}[ · note]` (≤ 500). The target is untouched, and the merge is atomic (single T0.3 tx).
- Can the source be cancelled while the target turns full/closed/cancelled? Yes, inside the check→write window (MINOR 2). It is harmless because nobody moves.
- `HAS_BOOKINGS` is enforced in-tx in the SQL. `MERGE_NEEDS_BOOKINGS` is a pre-check, with the in-tx SQL as a backstop (it would come back as `HAS_BOOKINGS`).

**4. Loaders**
- Calendar: one groupBy (bounded by `take`), one `listDepartures` over a range cut to ≤ 600 (the first-day overflow case reads that day and slices), then batched extras (3 queries), policies (one `resolveSettingsMany`), options, schedules (take 300), resources, next trips (one DISTINCT ON), and trips (LIMIT 101). No N+1.
- Products: 4 queries with `take 60`, plus a count. The truncation message is on screen.
- The cap counts departures of *all* products of the unit (including filtered-out ones) to decide the cut: conservative and honest ("shown of total" counts only shown products).
- Chips use truncated data (MINOR 4).
- When truncated, a product with departures only beyond `shownUntil` shows "ไม่มีทริปช่วงนี้". It is in `productsInRange`, so `nextTrip` is not loaded. Rare; folded into MINOR 4.
- `listSchedules` is unbounded and the slice happens after the read (MINOR 14).
- Panel: `getDeparture` + 7 parallel reads. Merge targets: one same-day `listDepartures` (unbounded within a day, acceptable) + one product query + one resource-use query (take 500).
- The 366-day view is not passed to `listDepartures` (62-day limit); it uses its own raw query with LIMIT 101 (MINOR 13 on the missing upper bound).

**5. Time**
- No DST-free assumption: `utcToLocal`/`localToUtc` use Intl for non-Bangkok zones, and CT-4 covers Asia/Tokyo.
- "Past" means `startsAt ≤ now` (not date-based). Today uses the unit's tz. A departure that has started today is DEPARTED_TODAY.
- Midnight crossing: the date comes from the stored `localDate`, and `endDate` from `utcToLocal(endsAt)`. Display lacks a +1 marker (MINOR 16).
- `visual-trips.mts` pins: `--week`/`--month`/`--dec-date` pin URLs only, not "now". `racha1114` still comes from `--ex-date`, so passing `--week` alone can open a panel outside the shown week (cosmetic). The state of calendar-week cells depends on the shot date (brief §10.6 accepted this). The panel scenes use 31 Dec, which stays valid until about 30 Dec 2026.

**6. UI rules**
- th/en: 618 keys each, identical sets, no Thai characters in en values (checked).
- No raw enum renders: states, channels, resource kinds, rule kinds and price sources all go through messages. Exceptions:
  - the `labelTh || code` fallback (MINOR 15)
  - free-text cancel reasons in click-time language plus the Thai-only merge reason (MINOR 5)
  - WO codes in copy (MINOR 6)
- Dialogs use the T1.1 `Dialog` (Escape, focus trap, confirm-before-discard, no close while busy) with `flushBottom` and a sticky footer. The DepDialog Escape double-confirm suppression works because the capture listener runs first.
- Panel buttons: at most 8 in practice (manifest, book, decide|guarantee|reopen|unguarantee, close, capacity, resources, price, cancel), i.e. 4 rows × 2 — acceptable, not a vertical stack.
- Tables: week table in `relative hidden md:block min-w-0 overflow-x-auto`, month grid in `relative min-w-0 overflow-x-auto`, no sr-only in the table file.
- Width arithmetic: see M1. At 390 the week table is hidden (`hidden md:block`) and the day list is shown; the month view is 7 columns at about 46 px with dots; I found nothing obviously wider than 358 px.

**7. States**
- Empty states exist: no products (`trips-cal-empty`), no trips in the multi-day view, no departure for a day, panel hint, no rules, no resources.
- Loading and error are covered by the existing `trips/loading.tsx`, `trips/error.tsx` and `TripsCatch` in the layout.
- The disabled "ใบรายชื่อ"/"จองให้ลูกค้า" buttons carry a visible "ยังไม่เปิดใช้" subtitle and a `title` attribute.

**8. Builder decisions**
- (a) Merge only when sold+held+reserved = 0: correct and stricter than `used`; it matches the T0.3 cancel SQL.
- (b) Over-capacity warning against the *sum* of boat seats: sensible for multi-boat (พีพี 2×15 = 30). It ignores boats with null seats, which is fine.
- (c) One dialog for close-all (status) and stop-some (edit): fine. Each section is gated by its own `actions.*`, and the server re-checks permissions. Edit-only users see the button labelled "หยุดขายบางช่องทาง". Small gap: on a CLOSED departure with an active stop-sell, the button is hidden, so the stop-sell can't be cleared.
- (d) Reopen and guarantee on one click: OK. Un-guarantee on one click: **not OK** (M2).
- (e) Inventory roles owner-only: acceptable given the `$roles` definitions; permissions live in `needs`.

**9. ORACLE-EDITs**
- t1.2 CV-8 / CV-14: justified. CV-6 (same oracle) forces ดำน้ำลึก 14 = BELOW_MIN (OPEN, minPax 4, sold 0, not started on 12 Nov 18:00), and §4.1 defines `decisions` = all BELOW_MIN cells. The edit is tight: it pins the exact order with deep3 14 first (decision at 13 Nov 18:00) and the count is 9. Housekeeping: CV-8's title still says "= 8 รอบ", and brief §10 item 2 still says the chip = 8. Update both so the next reader isn't misled.
- t1.1 NAV-1 and S-3: exact and tight.
- t1.1 S-12: justified, but looser than §14 says. §14 says wo ∈ {T1.1, T1.2}; the regex accepts any `T1.x|A1.x|W1.x|L1.x|K1.x`. That is harmless and saves future edits, but it is not "tight".

---

## Checked and fine
- `departureCellState` follows the brief's decision table exactly (order, FULL→OPEN, low threshold > 0, minPax null).
- `calendarWeekDays`/`calendarMonthDays`/`defaultWeekStart` are pure, UTC date math, and handle year and month boundaries.
- `departure-view-core.ts` imports only `./capacity-core` and `./departures-core`, and does not read the clock.
- Facade block exports exactly the 12 names plus types, with no `export *`.
- No writes to Trip* tables in the new module files. `removePrice` goes through T0.5. Booking and money tables are not touched.
- The panel `actions` matrix matches brief §4.2 (started or cancelled ⇒ all false; manifest/book always false).
- `cancelBlocked` is shown before clicking, and cancel is disabled in the dialog.
- `CAPACITY_BELOW_USED` shows the used count; `RESOURCE_CLASH` shows date, title and time in the shop's tz.
- Price dialog: baht → satang with an int4 guard; remove requires a reason ≥ 10.
- Next 16 usage: `params`/`searchParams` awaited as Promises, `notFound` from `next/navigation`, `<Link scroll={false}>` (documented in the bundled `link.md`), `router.refresh()` in the client after actions (no server `refresh()` used). No `"use cache"`.
- `useRunner` maps the new error codes to `errors.*` for English; Thai shows the service message.
- The page re-calls the loader with defaults on `INVALID_INPUT`, so it never 404s on bad params.

## Oracle gaps (suggest adding)
1. DA-13 accepts RUN ok + final CANCELLED. Add a sequential case — RUN ok, then a stale-check CANCEL/MERGE — and decide explicitly whether that is acceptable. Today nothing would catch a regression that makes it worse.
2. No test for `setStopSellLocalAction` (shop-time → UTC conversion, invalid date, null clear) or `assignResourceForScreenAction` (clash payload has no other-unit data). Both can be tested through the pure core if extracted.
3. No test that `decisions`/`counts.belowMin` stay honest under truncation (CT-5 checks only `shown`/`total`).
4. No test that a decision row with used > 0 doesn't advertise merge (MINOR 3). It matters once T0.6 lands.
5. No check that `actions.merge` is false when held > 0 in the panel (DA-6 only covers the desk).
6. No layout assertion for the 2-column breakpoint at 1440 (M1). The visual run should assert that the panel's `getBoundingClientRect().left` is greater than the table's right edge at 1440.

## What the controller should check in the rendered pictures
- [ ] **calendar-week 1440**: is the panel *beside* the table (not below)? Is there an inner horizontal scrollbar on the week table? (M1)
- [ ] Day cells: each "ว่าง 24 · ยืนยันออก" / "ต่ำกว่าขั้นต่ำ 8" line wraps cleanly; no mid-word breaks (check the English locale too if shot).
- [ ] 5 shapes distinguishable: dashed red (below min), thick black (full), stripes (cancelled), grey (past), accent outline (selected). The CLOSED pill in the panel is dashed red and clashes with the legend (MINOR 7).
- [ ] Header row line "เรือราชา 1 · 24 ที่ · ขั้นต่ำ 8" and พีพี "เรือ 2 ลำ"; Similan row "ไม่มีทริปช่วงนี้ · ทริปถัดไป 14–18 ก.พ. 2570 ขายแล้ว 0/20 เตียง".
- [ ] Chips: "ต้องตัดสินใจ 9" (dashed red) and "ยกเลิก 3 รอบ · คลื่นลม"; the toolbar wraps without overflow.
- [ ] Panel: buttons in a 2-column grid (about 8 buttons in 4 rows), the cancel button red, the two disabled buttons with "ยังไม่เปิดใช้", the T1.3/T1.7 notes (consider the WO-code wording, MINOR 6).
- [ ] Decisions card: lines "ตัดสินภายใน …" and "เสนอ: รวมกับ… / ออกขาดทุน / ยกเลิก".
- [ ] calendar-month 1440: no garbled Thai in truncated titles (MINOR 10); today border; days outside the month greyed.
- [ ] 390 (all 4 scenes): no horizontal overflow, no 7-column week table, day list present, month dots tappable, panel as a full-screen sheet with the close ✕ visible, dialogs as bottom sheets with a sticky footer and nothing bleeding through.
- [ ] departure-panel scene: price dialog shows 4,500 / 3,150 with "ราคาเฉพาะรอบนี้" and remove buttons.
- [ ] belowmin-decision scene: 3 options; merge shows the targets and the "เฉพาะรอบที่ยังไม่มีผู้จอง" note; confirm disabled until a choice is made.
- [ ] Remember: cell states in scene 1 depend on the shot date (pins are URL-only).

## Not checked
- I did not run anything (oracle, typecheck, fitness, seed, visual): the builder's 95/97 and the post-edit green status are unverified by me.
- `scripts/trips-ui-inventory.json` rows were not inspected row by row; only the roles decision.
- I did not read the full `body.html` of mock 11; I used the PNG and the brief's line references.
- `requireUnit` internals, `tripsPageGate`, `tripsUnitGate` (T1.1, already reviewed) were not re-read.
- Behaviour of `next-intl` when a message key is missing at runtime.
- Real browser scrollbar width in the controller's headless Chrome: M1's 1087 figure assumes a classic 15–17 px scrollbar; with overlay scrollbars it is 1104 and passes by 4 px.
