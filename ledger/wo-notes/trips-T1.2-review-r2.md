# T1.2 review, round 2: fix round `90c0c7580..f462c5714` (wip/trips-t1.2)

Reviewer: independent, read-only. I used read, grep and git only. I did not build, run tsx, query the DB or run the oracle. I used one `python3 -I` call to read the two message JSON files for key parity.
Layout arithmetic is skipped: the controller accepted the 1440/390 renders.

## Verdict: **MERGE** (0 BLOCKER · 0 MAJOR · 7 new MINOR/NIT)

Both MAJORs are closed. 13 of the 16 MINORs are closed. Two are accepted as debt and logged in wo-notes, and one is closed with a caveat. The fix round adds no security, scoping or money defect. The new items below are small. #1–#3 are cheap and worth doing before or soon after the merge, at the controller's call.

---

## 1. Round-1 findings: status

| # | Status | Evidence |
|---|---|---|
| M1 layout 1440 | **closed** (controller verified the picture) | `DeparturesScreen.tsx:113` `@min-[1060px]:grid-cols-[minmax(0,1fr)_340px]` gap-4 · `DeparturesCalendar.tsx:16` `p-3` · table `min-w-[704px]` (:146) |
| M2 un-guarantee one click | **closed** | `DeparturePanel.tsx:210-213` now only opens the dialog · `UnguaranteeDialog` `DepartureDialogs.tsx:955-990`: one `setDepartureStatusAction(OPEN)` call, same action and permission as before, explains the consequence (`unguaranteeToBelowMin`, `departure-screens.ts:771`). This is the only OPEN-from-GUARANTEED path in components (the other `status:"OPEN"` call is reopen, gated `d.status === "CLOSED"`, `departure-screens.ts:697`). There are no keyboard shortcuts, and the decision card and mobile sheet go through the same panel. |
| m1 RUN/CANCEL race | **accepted debt** | logged in wo-notes with the exact T0.3 fix (`expectStatus`/`expectVersion`) |
| m2 MERGE target outside tx | **accepted debt** | logged in wo-notes |
| m3 decision card offers impossible options | **closed** | loader `departure-screens.ts:420-421` (`hasPeople` ⇒ no targets) · card `DeparturePanel.tsx:276-281` · dialog note `DepartureDialogs.tsx:163-167` |
| m4 chips use truncated data | **closed with caveat** | 3 COUNT queries `departure-screens.ts:443-462`. The decisions card still counts cut data: see new #2 |
| m5 reason language | **closed with caveat** | codes `DepartureParts.tsx:286-300`, `departure-desk.ts:44-48`. The merge code stores the **Thai** target title, so the English screen shows "Merged with ดำน้ำลึก 10:00" (new #4) |
| m6 WO codes on screen | **closed** for T1.2 strings (no `T\d.\d` in th/en departures values or desk messages). Out of scope: T1.1 `seasons.depPickHint` / `seasons.depTruncated` still say "(T1.2)" in both locales |
| m7 CLOSED pill shape | **closed** | `DeparturePanel.tsx:84` CLOSED ⇒ `plain` |
| m8 "sold" = sold+held | **closed** | `decide.lead`/`summaryRun` use `{sold}` and show held separately (`DepartureDialogs.tsx:121,176-177`) · next trip `+ held n` (`DeparturesCalendar.tsx:129-130`) |
| m9 English mid-word break | **closed** | `cell.left` "{n} free · will run", `[overflow-wrap:break-word]` (:106) |
| m10 month `.slice(0,10)` | **closed** | `DeparturesCalendar.tsx:316-318` CSS `block min-w-0 truncate` |
| m11 dead anchor at 0 | **closed with caveat** | `DeparturesScreen.tsx:78-87` renders a `<span>` at 0. It can still be dead when truncated (new #2) |
| m12 stop-sell until | **closed** | (a) `isCalendarYmd` + (b) explicit minute 0–1439 required server-side (`departure-screen-actions.ts:52-60`) · (c) client requires both or neither (`DepartureDialogs.tsx:478-482`) with a message · (d) channels = all 12 `DEPARTURE_SELL_CHANNELS` (`departure-screens.ts:772`; all 12 have en/th labels) |
| m13 trips view unbounded | **closed** | `departure-screens.ts:516` `BETWEEN today AND to` |
| m14 oldest 300 schedules | **closed** | `departure-screens.ts:825` `slice(-CAP).reverse()`. The header query still orders by `dateFrom desc` (a different "recent" order) and is still not loaded lazily (logged as debt) |
| m15 Thai names / raw pax code | **closed with caveat** | pax fallback `DepartureDialogs.tsx:419` (messages). English titles apply to the row header, panel, dialog titles, decision item, day list and month. Still Thai: merge targets (`DepartureDialogs.tsx:123,191`), `firstTargetTitle` (`departure-screens.ts:436`), trips list (`DeparturesCalendar.tsx:364`), create/schedule dialogs (:636, :889), `optionName` (`departure-screens.ts:580`), pax `labelTh`. Partly logged in wo-notes |
| m16 UX/a11y | **mostly closed** | month day = one ≥44 px link (`DeparturesCalendar.tsx:290-302`) · open-decide event · price "per person before promotions" · self-clash fixed (`:688`) · `(+N)` day marker (`:404-410`). Mobile sheet: scroll lock and focus move added, but no `role="dialog"`/trap (logged), and the focus move now steals focus from an open dialog (new #1) |

---

## 2. New findings (ranked)

### 1. MINOR: On mobile, the panel's focus move steals focus from a dialog that opens at mount
`DeparturePanel.tsx:53-63`.
- With `?decide=1` (every decisions-card link sets it), `useState` opens `DecideDialog` at mount (`:35`).
- React runs child effects first, so the T1.1 `Dialog` focuses its first control (`ProductsScreenParts.tsx:74`). The panel effect then runs and focuses `trips-dep-panel-close`, which sits *behind* the `aria-modal` overlay.
- The Dialog's Tab trap only wraps when focus is on its own first or last element (`:90-96`). Tab therefore walks the panel behind the modal, and screen readers start outside the dialog.
- The Dialog's `opener` is also captured before the panel focus moves, so focus is restored to whatever was active before.
- **Fix:** in the panel effect, skip the focus move when a dialog is open: `if (!sheetRef.current?.querySelector('[role="dialog"]')) …focus()`, or `if (!openDecide)`.

### 2. MINOR: Under truncation, the chip count and the decisions card disagree, and the chip can point to nothing
`DeparturesScreen.tsx:78` uses `counts.belowMin` (full range, from the COUNT query), while `DeparturePanel.tsx:258` titles the card `decisions.length` (cells cut at `shownUntil`), and `DecisionsCard` returns null at 0 (`:256`).
- Scenario: more than 600 departures in the month, with every BELOW_MIN departure after the cut. The chip reads "Needs decision 4" and links to `#trips-decisions`, but no card renders, so the anchor is dead again (m11).
- In the milder case, the chip says 9 and the card says "(5)".
- The new key `departures.countsPartial` ("whole range") is defined in both locales and used nowhere, which suggests this was meant to be labelled.
- **Fix:** when `vm.truncated`, either render the card whenever `counts.belowMin > 0`, with a line such as "showing {k} of {n} — until {shownUntil}", or append `countsPartial` to the chip and point it at `trips-cal-truncated`. Use or delete the dead key.

### 3. MINOR: Reason codes can be spoofed through "Other" free text, and the encode/decode contract is split across client and server
- `useReason` stores "Other" text verbatim (`DepartureDialogs.tsx:83`). Two examples:
  - Typed text `merge:10:00|Phi Phi` is shown as "Merged with Phi Phi 10:00", a merge that never happened.
  - Typed text `preset:VEHICLE` is shown as "Boat/van breakdown".
- These are staff-only, typed by someone who could pick the preset anyway, and the audit log keeps the raw string. The real risk is a fake merge claim on the screen.
- Other parsing is sound:
  - Preset notes replace `|` with `/` (`DepartureParts.tsx:300`).
  - The merge title and note are cleaned the same way (`departure-desk.ts:45-47`).
  - Both regexes are anchored, so a title or note cannot start a new code.
  - The merge title cannot spoof, because the `merge:` prefix is server-built.
- Length is bounded: the note input `maxLength=400` gives a code of ≤ 418 characters. The client checks `valid ≤ 500` on the encoded string, zod in T0.3 checks `trim().max(500)` (`departures.ts:883`), and merge uses `.slice(0,500)`.
- The parser lives in a `"use client"` hook (`useReasonText`), the preset encoder in `DepartureParts.tsx`, and the merge encoder in the server desk. The first non-screen consumer (T1.6 customer notification, exports) will have to re-implement it.
- **Fix:**
  - Move `reasonCode`, `mergeReasonCode` and a pure `parseReasonCode(raw) → {kind, code?, time?, title?, note?} | {kind:"text"}` into `departure-view-core.ts`. Keep only the `t()` mapping in the hook.
  - In `useReason`, reject or neutralise "Other" text that matches `/^(preset|merge):/i`, for example by prefixing a space or showing a validation message.
  - Record in wo-notes that `cancelReason` is now a coded field that downstream readers must decode.

### 4. MINOR: The English screen still mixes Thai into one sentence
- `departures.reason.merge` is filled with the stored **Thai** title (`departure-desk.ts:83-86` stores `title.th`), giving "Merged with ดำน้ำลึก 10:00". The same happens in the decisions card ("merge with ดำน้ำลึก", from `firstTargetTitle`), in `summaryMerge` and in the target list (`tgt.titleTh`).
- **Fix:** add `titleEn` to `MergeTargetVM` and to `DecisionVM.firstTargetTitle`, using the `{th,en}` pair already in `titleOf`'s source rows.
- For the stored code there are two options:
  - store the target `departureId`/`productId` instead of the title and resolve it at render (preferred: names stay live);
  - or accept Thai inside the code as data and log it.
- The trips list and create dialogs are also Thai, but those are whole labels, not mixed sentences, and partly logged.

### 5. NIT: COUNT query compares a `timestamp` column to a raw JS `Date`
`departure-screens.ts:451` `"startsAt" > ${now}`. The rest of the trips module binds clocks as `${iso}::timestamp` (`jobs.ts:231`, `capacity.ts:387`, `departures.ts:1108`). If Prisma binds a Date as `timestamptz`, the comparison depends on the DB session TimeZone. It is harmless when that is UTC; T1.1 `screens.ts:150` has the same pattern.
- **Fix** (for consistency and the boundary): `"startsAt" > ${now.toISOString()}::timestamp`.

### 6. NIT: Small edges
- `unguaranteeToBelowMin` (`departure-screens.ts:771`) ignores the FULL precedence of `departureCellState`. A GUARANTEED departure with sold < min but held/reserved filling it would become FULL, not "Below minimum", so the dialog's note would be wrong. Rare. Also check `publicLeftOf(d) > 0`.
- The `trips:open-decide` handler does nothing when the user lacks `status` (`DeparturePanel.tsx:46`), so the click is silent. That is acceptable: the panel shows no decide button either.
- `departures.reason.merge` with an empty Thai title renders "Merged with  10:00" (double space).
- EN wording: the cell says "Called off" (`cellShort.CANCELLED`) while the legend and pill say "Cancelled". The cell says "will run" while the pill says "Guaranteed". Not wrong, but the claim was "badges one-to-one with the legend". Consider using one word.
- The tooltip `full()` for CANCELLED reads "Cancelled · Called off · …", which is redundant.
- `trips-ui-inventory.json`: the new `trips-unguarantee-dialog` row's `needs` says "trips.departure.status หรือ trips.price.edit ตามปุ่ม". It should be `trips.departure.status` (copy-paste).

### 7. Checked and fine (the specific questions)
- **(b) COUNT queries.** The predicates match `departureCellState` exactly:
  - `CANCELLED` excluded
  - not started = `startsAt > now`, the complement of `startsAt ≤ now`, so a departure starting exactly now is excluded by both
  - `left > 0` (FULL first)
  - `CLOSED` excluded
  - `FULL`-with-seats treated as OPEN
  - `GUARANTEED` excluded
  - `minPax IS NOT NULL AND sold < minPax`, sold only
  - `minPax` in the DTO is the raw column (`departures.ts:406`), so it matches the SQL.

  They are scoped by tenant, unit and `shownIds` (the same product filter as the cells). There is no option filter in either. All values are parameterised tagged templates and `from`/`to` come from validated day lists, so there is no injection surface. In the cancelled pax sum, `sold+held` equals the cell's `used`. The `LIMIT 20` on reasons is fine because only `reasons[0]` is rendered. The tie-break uses DB collation vs `localeCompare`, which differs only on equal counts. The non-truncated path is unchanged.
- **(c) `hasPeople`.** It is `sold + held + reserved`, the same as the panel's `people`/`cancelBlocked` (`:660,770`), the desk's MERGE pre-check (`departure-desk.ts:77`) and the T0.3 cancel SQL counters. T0.3 also checks for an active `TripHold`/`TripBooking` row, which is a strictly stronger backstop.
- **(d)** See the M2 row.
- **(e) Stop-sell.**
  - `localToUtc(g.tz, ymd, min)` is used after validation and is Intl-based (no DST-free assumption).
  - The stop-sell button now shows on CLOSED departures (`DeparturePanel.tsx:195`). It needs `actions.stopSell` (`canEdit`, and not started/cancelled) and opens only the stop-sell section (`actions.close` is false on CLOSED).
  - Server side, `setDepartureStopSell` gates on `edit` and refuses only CANCELLED (`departures.ts:1197-1213`), so clearing on CLOSED is allowed, permission-correct and audited.
  - An "until" in the past is not refused; `stopSellOf` simply treats it as expired. This is pre-existing.
- **(f) Listeners and scroll lock.**
  - The window listener is removed in the cleanup (deps: id + flags).
  - The scroll lock restores `prev` on unmount.
  - Because the panel is keyed by id, switching departures runs the old cleanup before the new effect.
  - `Dialog` does not touch `body.overflow`, so there is no nested-restore problem.
  - The `matchMedia` check runs only at mount, so resizing while open does not re-evaluate it. Negligible.
- **(a) Other readers of `cancelReason`.** The only reader is `departure-screens.ts`, which is screen-only. The `trips.departure.cancelled` event payload has no reason (`departures.ts:1117`), and its consumer is a no-op automation hook (`outbox-consumers.ts:1548`). The audit `after.reason` stores the raw code, but `/app/audit` does not render `after`. There is no public availability, API or export reader today, so no customer sees `preset:WEATHER` now. This is a future risk only (see #3).
- **(h) Messages.**
  - The th and en files have 642 keys each, with identical key sets.
  - There are no Thai characters in en values.
  - No `T\d.\d` appears in the departures strings.
  - No raw enum is rendered in the changed components. Every `code`/`kind`/`state`/`source` goes through `t()`; the only `r.code` is a testid and an allow-listed `pax.codes.*` key, and all 3 keys exist.
- **(g)** `useTitle` falls back to Thai when `en` is missing or blank (`i18nEn` trims, `departure-screens.ts:45`).

## 3. What I did not check
- I ran nothing: no oracle, typecheck, fitness check, visual run or seed. The builder's green status is unverified by me.
- The rendered pictures (the controller did these): the focus behaviour in #1 is inferred from React effect order and the T1.1 Dialog code, not observed.
- How Prisma actually binds a `Date` in `$queryRaw` (#5).
- `scripts/visual-trips.mts` diff (not read). Of the inventory JSON, I read only the 2 changed rows.
- The th message values: I checked key parity and WO codes only and did not read them for wording.
- Whether `oracle qc-trips-t1.2#PV-4` exercises the new dialog. It only asserts the `actions.unguarantee` flag, so a regression in the dialog would not be caught. Suggest a visual or oracle step that clicks `trips-dep-unguarantee` and expects `trips-unguarantee-dialog`.
