# P2.2U review: `wip/pos-p2.2u` d95ea560 (code 2fc89cab), read-only
**Verdict: MERGEABLE-AFTER-FIXES.** Two Medium register bugs and one Medium rules-list display bug. None of them moves money: Pay and submit always use the server `quoteFresh`. The 06 page, actions, bills note, marketing flip and merge hygiene are sound.
## Findings
- **F1 (Medium-High) The `priceValidUntil` refetch chain stops after the first timer** (`RegisterScreen.tsx:808,824,827`). The effect depends only on the ISO string. The server sends the same edge again (`price.ts:122` gives a deterministic `nextPriceEdge`), so `setPriceValidUntil(same)` changes nothing and no new timer is set.
  - Example: register opened 10:00 with a rule 14:00–16:00. The 1 h cap fires at 11:00 and gets back "14:00" again. Nothing fires at 14:00, so the tile shows no chip or struck price all through happy hour, and `local` totals use the stale base price until the quote lands.
  - Client clock ahead of the server breaks it the same way: an early fire returns the same edge.
  - Fix: keep `{iso, seq}` (a new object on every page-1 load) as the effect key, or always reschedule inside the timer callback.
- **F2 (Medium) The end date shows one day late on the rules list and the 06 callout** (`price-ui.tsx:76` via `PriceRulesClient.tsx:327`, `ProductPanel.tsx:277`).
  - Example: the editor saves inclusive "10 ต.ค." as `endsAt` = 11 Oct 00:00+07 (`PriceRulesClient.tsx:113`, correct, with a fixed +7 h offset at :41-44). `ruleWindowText` then formats the raw `endsAt`, so the row reads "10 ต.ค. – 11 ต.ค.", while the editor reads 10 (`bkkDate(…, true)` at :43).
  - Fix: in `ruleWindowText`, format `endsAt − 1 ms`, the same rule as `bkkDate(inclusiveEnd)`.
- **F3 (Medium) The `localQuote` guard misses the main `local` memo** (`RegisterScreen.tsx:853-864` unchanged; guard only in `localQuote` :1479/:1490, which runs only for the P1.15U PIN path at :966).
  - Example: a LINE MAN held cart, cashier taps +1. `local` prices the cart with STORE tile prices. The line shows ฿75 and the total ฿150 instead of ฿95 / ฿190 until the quote returns (`shownTotals` :1061, `lastAmount` :1077, `ll` :1116).
  - Fix: `if (cartUsesPriceLayer(cart)) return null` inside `local` (add `quote` to the deps). Also add `|| cartUsesPriceLayer(cart)` to `totalsPending` :1060 and to the line `pending` :1117, so the screen shows "—" instead of a stale or STORE figure.
- **F4 (Low) A full-replace save resends rows the drawer cannot see or edit.**
  - `keep` (`products-scope.ts:87`) still contains rows of an **archived custom channel**. Channel archive leaves the rows in place, and no writer outside catalog.ts touches them. `setChannelPrices` then refuses `VALIDATION "ไม่รู้จักช่องทางนี้"` (`catalog.ts:2014-2015`), so the product's prices can never be saved from 06.
  - The UI then shows `errors.validation` "ตรวจช่องที่เป็นสีแดง" with no red field: `CatalogError` has no `field`, so `ProductPanel.tsx:99` is dead.
  - Fix now: map server VALIDATION to a non-field text. Then P2.11/S: either strip dead-code rows on the client and say so, or have the server accept unchanged rows of dead codes. Rows of archived branches are dropped silently (builder F6, same root cause).
- **F5 (Low) The bulk dialog's category scope does not match the server.**
  - The preview and count use `inScope` parents only (`ProductsClient.tsx:302`). The server takes every non-archived product of the category, variants included (`catalog.ts:2093`).
  - A category with more than 500 products is refused with VALIDATION, which shows the "red fields" text (`BulkMarkupDialog.tsx:67`), so the ≤ 500 category guard (ruling 3) is not surfaced.
  - Fix: map that refusal to `bulk.tooMany`, and label the preview "first 5 of the category (variants with their own price are written separately)".
- **F6 (Low, gates) The `dry-*.log` files carry no `tree=… head=…` header and no rc.** Their mtime (01:24) equals the 2fc89cab commit time. Re-run or append the header before the controller relies on them.
## ORACLE-EDIT
- **p1.18 :319: done correctly.** 2b95374f touches only `qc-pos-p1.18.mts:319` and `pos-integrations.ts:60`, both `["happyHourPricing", true, null]`. The count is unchanged, and the run is 81/81 phase U with ST7 green.
- **p2.2 :475 proposal: accept.** The regex should become `/\[\s*"happyHourPricing"\s*,\s*true\s*,\s*null\s*\]/`, and the push text on the same line should say `true, null (P2.2U Q8)`. Also update the ST3 label at :477 ("happyHourPricing false" → "true"); it is the same check, so the count stays 42.
## Verified OK
1. **Actions:** `catalog-price-actions.ts`
   - `"use server"`, async-only exports; the refusal type is not exported.
   - Session builds the ctx (`actorUserId = auth.user.id`). The only gate is a role-level `assertCan pos.product.setPrice` (:34), which does not bypass the service's row scope.
   - Only `setChannelPrices`/`bulkChannelMarkup` are called. No prisma, no price math.
   - `CatalogError` code and message pass through unchanged; `unstable_rethrow` is in place.
2. **06 table and drawer:**
   - Platform line = first PLATFORM channel in display order whose effective price ≠ base (`products-scope.ts:49-56`), as ruling 1 says (not min/max).
   - Chips hide notSold. Stock is per branch.
   - Edit sends the full row set: every loaded row except the drafted (code, scope) rows, plus the drafts (`:79-99`, `ProductPanel.tsx:78-93`). The page requires all-branch price access (`page.tsx:48,62`), so the loader holds every live branch's rows.
   - The drawer remounts when the branch changes (key `id|unit`, `ProductsClient.tsx:293`).
   - notSold toggles per channel; bad/max money input maps to the row.
3. **Bulk:**
   - Preset and custom channels only. % is 1–200 with 2 decimals, converted to bp (`price-ui.tsx:26`). Rounding is 100 | 1.
   - Preview uses `channelMarkupPrice` from price-shared (`BulkMarkupDialog.tsx:145`). Selected ≤ 500 is guarded.
   - The toast uses the service's `written`/`skipped`.
4. **Rules:**
   - The 18-key DTO is rendered; weekdays 0–6; `+07:00` is hard-coded, with no local `new Date()`.
   - Overnight windows are refused client- and server-side with a readable `errors.timeTo`; the `PRICE_RULE_LIMIT` banner shows.
   - Without `pos.price.rule` the page is read-only; without `pos.product.manage` it shows a refusal card. Archived rules sit behind the toggle.
   - Pills render only after the client load, so there is no hydration risk.
5. **Register:**
   - The tile shows the server's STORE price; chip and struck price only appear for `priceSource === "RULE"`.
   - notSold is blocked in `pick` (:1299) for tap, keyboard Enter, scanner `scanOutcome` (`add`→pick) and scan-choose. Weighed items cannot be notSold (CD7).
   - Badges come from the quote, with the tile as fallback. The timer is cleared on unmount, and no clock text renders before mount.
6. **Bills:** keys `billNote.channel/.branch/.rule` only show the channel name and the list price; there is no commission or rate. No receipt renderer is in the diff.
7. **Settings 10:** the marketing card's `happyHourPricingLive` link goes to `/pos/products/price-rules` (`SharkSettings.tsx:218-226`).
8. **Keys and ST7:** 140 new keys in each of th and en, matched. No existing th value changed and no new Thai in en; ST7 = 0 (my grep agrees). Testids are in the spec addendum, and the 61 interactive rows are in the inventory.
9. **Merge hygiene:** `diff 5c7f73f9 2fc89cab` for `products/page.tsx` and `visual-pos.mts` contains only builder additions. The O13 refusal card still returns first, and the HF StateKeys are kept.
10. **Visual states:** all states named in ruling 11 exist.
    - Fixtures use owner module calls; before-rows are restored whole.
    - Rules are archived in finally/signal; the bill key is fixed per day.
11. **Deviations (accepted)** — 06 shell not built (Q1); "—" placeholders (P2.3/P3); QR/CHAT chips only in the drawer; variants inherit parent rows; inclusive end date (input side OK, display see F2); default tab = prices; RULE note `{kind}` from `price.source.RULE`; chip = rule name.
12. **Gates:** final block at head 2fc89cab. p2.2 is 41/42 with only ST3 red. p1.18 is 81/81 phase U; the other suites, typecheck and both fitness runs pass.
## Follow-ups
- **P2.11:**
  - F4 strategy for rows of archived branches and channels.
  - An editor for the (null, unit) branch row.
  - A drawer/bulk warning that variants with their own base price inherit the parent's fixed channel price.
- **P2.12:** S F8, level-aware notSold skip in bulk.
- **Owners:**
  - A (STORE, *) row gives a STORE line the "ราคาตามช่องทาง" badge and the bills note "ราคา หน้าร้าน": suppress it for STORE?
  - Tiles show the STORE price even on LINE MAN held carts.
  - Test ids `pos-prod-price-<id>`, `pos-prod-price-<code>` and `pos-prod-price-edit` share a prefix (as the rulings set them).

## Controller rulings (account A · 10 Oct 02:0xZ)
- **F1 fix**: effect key = `{iso, seq}` (new seq on every catalog/page load) **and** the timer callback always reschedules from the response; cap 1 h stays; clock-skew safe (fire early ⇒ refetch ⇒ reschedule).
- **F2 fix**: `ruleWindowText` (and every display of `endsAt`) formats `endsAt − 1 ms` in Bangkok = the inclusive day the editor shows.
- **F3 fix**: `local` memo returns null when `cartUsesPriceLayer(cart)`; `totalsPending` and line `pending` include that condition ⇒ "—" until the server quote; Pay/submit unchanged (server quote only).
- **F4 fix-now**: server VALIDATION without `field` ⇒ non-field message (`errors.serverValidation` th/en, show the service message text). Dead-code/archived-branch rows strategy → **P2.11 line** (S: accept unchanged rows of archived codes; or client strips with a note) — add to `POS-MASTER-PLAN.md` P2.11 row note + `pos-P2.2U.md` follow-ups; not in this round.
- **F5 fix**: map the > 500 refusal to `bulk.tooMany`; preview label "5 รายการแรกของหมวด (variant ที่มีราคาเองเขียนแยก)" th/en.
- **F6 fix**: re-run every `--dry` with `tree=… head=…` + rc header on the fix head.
- **ORACLE-EDIT `qc-pos-p2.2.mts:475`** accepted exactly as the reviewer wrote (regex `true, null`, push text `true, null (P2.2U Q8)`, label at `:477`), own commit, count 42 unchanged; red-before log on the current code (41/42) → 42/42 after.
- **F7 (owner item → fix now, small)**: a `(STORE, *)` channel row must not produce the "ราคาตามช่องทาง" badge/bill note; `(STORE, unit)` row ⇒ `billNote.branch` / tile badge "ราคาสาขา"; `(STORE, all)` ⇒ no badge (it is the base price). Pure helper in `price-shared.ts` or UI-only mapping — no server change.
- Deferred: tiles show STORE price on platform held carts → **P2.11** (tile prices per cart channel); testid prefix sharing → leave.
- Fix round = one commit per finding (F1 F2 F3 F4 F5 F7 + ORACLE-EDIT + F6 logs + notes). Gates after: `qc-pos-p2.2` (expect 42/42) · p2.1 · p1.18 phase U (ST7 0) · p1.3 · p1.16 · products · authz · typecheck · fitness ±env · fitness-pos · `--dry` all states. Reviewer R2 on the diff; then controller build on tree d + screenshots on QC5 vs 06/01/12/10.
