# P5.3 fix1+fix1b — R1 review + hunter (authz/money)
Reviewer: independent R lane · tree p11 detached `3fafb1dd` · range `a3959a4e..3fafb1dd` (src: 6 files) · 2026-10-24T12:08:03Z
Method: read the diff, then traced in context — `registerScan` (register.ts:1064–1115) vs `registerBarcodeIndex` (:1117–1208), `regScope`/`regVisibleWhere` (:756–806), `regViews` (:844–947), quote line pricing (:1655–1707), submit re-price (:2773, :2839), `sessionScope`/`deviceScope`/action wrappers (register-actions.ts), `pick`/`applyScan`/`onScannedCode` + camera/keyboard wiring (RegisterScreen.tsx:1551, :1636, :1687, :2649, :3166), the hook, the 86 write path (catalog.ts:1089, :1771), stock writers (inventory/service.ts:628/710/858, catalog-legacy.ts:351), Next 16.2.11 action queue (node_modules/next/dist/client/components/app-router-instance.js:49–157). No suite run: none of my doubts needed a DB probe (builder probes in pos-P5.3-fix1.md §4 cover the cheap paths; my findings are about cadence and cost, which follow from the code). No ESLint config in the repo; I did not re-run typecheck (builder: exit 0).

## Verdict: MERGEABLE-WITH-FIXES
Parity and money are sound: a client hit cannot add a line that quote/submit would price differently or let through when the server would refuse it. The problems are in how often the index is fetched and what each fetch costs. Because the fetch is a server action, every full fetch also holds up quote and submit.

## R1 findings
F1 · Med · use-barcode-index.ts:123 (refresh → `loadRef.current`) · RegisterScreen.tsx:693
Why: the index is fetched with a server action. Next serializes server actions (app-router-instance.js:49–157 action queue), so while a full fetch runs, quote, submit, scans that miss the index, and catalog calls all wait behind it. Most fetches during trading are full: `version` includes max(InvItem.updatedAt), and every stock cut is a Prisma `invItem.update` that bumps `@updatedAt` (builder §5 says so too). So the 15-min tick, focus after 60 s, online edge, price edge and `noteServerOne` (F2) each tend to download the whole set. Size: 2.5–3.4 MiB at 5k items (builder), and by the same 515–700 B/item about 10–14 MiB at the 20,000 cap. Each product object is also serialized once per key when both p.barcode and InvItem.barcode are single-owner keys.
Fix (any of): serve the index from a GET route handler, which runs in parallel with actions and can use ETag=version/304; or at minimum skip refresh while the cart is non-empty or a pay/done layer is open. Also slim the item to the fields `pick`/cart rendering use, and lower the cap or measure at 20k.

F2 · Med · use-barcode-index.ts:137 (`staleTried.clear()` on every new set) + :209 (full-JSON compare)
Why: two kinds of server-path "one" results keep re-triggering refetches:
(a) codes that are absent on purpose, e.g. a parent and its variant sharing a code, where registerScan returns the variant (register.ts:1093–1094). The comment at :108 names exactly this case.
(b) cached non-sellable hits whose `stockLeft` changed, e.g. NO_STOCK tracked items sold into negative stock. These always take the server path (client gate `soldOutReason == null`, RegisterScreen.tsx:1702), and their stockLeft moves after every sale.
Each new set clears `staleTried`, and with F1's churn almost every refresh produces a new set. Result: about one full rebuild per bill that contains such a code, instead of one per 15 min. Per register.
Fix: compare only the fields the client decision uses (id, priceSatang, soldOutReason, notSold, variantCount, optionGroupCount, requiredOptionGroupCount, soldByWeight, kind). Keep a per-scope "confirmed absent" set that survives new sets and clears only on scope change. Or have the server return the list of excluded codes (shared/parent).

F3 · Med · use-barcode-index.ts:190–192, :139–141
Why: `Date.now() >= edgeMs` compares the client clock with a server-computed `priceValidUntil`. If the tablet clock runs X ahead of the server, then once the client passes the edge, the server still sees the same edge in the future and returns it again. Every lookup calls `refresh(true)`, and the edge timer clamps to 15 s, so full fetches run back-to-back for X (each one holding up actions, per F1). If the client clock is behind, the old promo price shows on lines after the real edge. Quote corrects the price (no money impact).
Fix: return server `now` with the result and apply the offset. Or, if a refresh returns an edge that has already passed locally, don't re-trigger until edge + a margin.

F4 · Low · use-barcode-index.ts:181
Why: `if (!online || st.current.fetchedAt === 0) return;` If the register opens offline, the mount effect skips (onlineRef false). If the first fetch throws, the catch leaves fetchedAt at 0. In both cases coming back online never fetches, and the index stays off until the 15-min tick or a window focus.
Fix: `if (!online) return; if (!inflight.current && (!st.current.version || stale)) void refresh(!st.current.version);`

F5 · Low · use-barcode-index.ts:139–141, :150 vs cleanup :168–176
Why: a refresh that completes after unmount (or after cleanup) arms a new `edgeTimer` and runs the queued refresh. Nothing clears these, so index calls go on after navigating away from the register until page unload. Cadence is bounded by price edges, ≥15 s.
Fix: an `alive` ref set false in cleanup; skip timer, queued work and state writes when !alive.

F6 · Low · use-barcode-index.ts:191, :195
Why: while the set is past its edge or older than MAX_AGE, every lookup calls `refresh(...)`. With a fetch already in flight, this queues a "full" that runs right after the fresh set arrives, so one redundant full fetch per edge.
Fix: return early when `inflight.current`.

F7 · Low (UX; no money impact) · RegisterScreen.tsx:1702 vs pick :1551–1576
Why: before this change a scan always went to the server; now a cached hit can be up to 15 min old, or 30 min (MAX_AGE) when refreshes fail. Stale cases: 86 (unavailableUnitIds / isOutOfStock / MenuItem out / stockQty 0), a newly linked option group, new variants, archive. In these cases the server path would toast or open the options/choose dialog, but the client path adds a plain line. Quote then refuses it with a lineIndex: PRODUCT_NOT_FOUND :1658, PRODUCT_UNAVAILABLE :1659, VARIANT_REQUIRED :1661, OPTIONS_REQUIRED via regResolveOptions :1663–1664, PRICE_NOT_SET/CHANNEL_NOT_SOLD :1704. One case is not caught: a non-required option group added after the index load. The line is sold without offering the options, and quote accepts it. Grid tiles have the same staleness today.
Fix: call `refresh(false)` (or an `invalidate()`) when quote refuses a product line, and/or when an availability flip is seen.

F8 · Low · RegisterScreen.tsx:1688–1712
Why: a miss (server path, awaiting the response) followed by a hit adds the hit line first. Before, scans were serialized and cart order matched scan order.
Fix: accept and document, or route hits through a per-scan sequence when a server-path scan is pending.

### Checked, no finding
1. Parity: both use the same `regVisibleWhere`, the same keys (p.barcode ∪ InvItem.barcode with the same tenant join), and the same exact match. The trim/len≤200/regCleanText filter (:1170) mirrors registerScan :1071–1072. Codes shared by more than one visible product are excluded: this is a superset of the server's "choose" case, and the server's "one after dropping parents" case is also excluded, which costs speed only. Parents with variants are excluded (:1201; variantCount = visible kids, so the server would return choose). Variants with their own code are included. Archived and other-unit products are excluded. Scale labels are never registered codes, so registered codes win on both sides. regViews maps every row, so the server cannot return one where the index has none for the same data. NO_STOCK hits take the server path although pick() allows NO_STOCK (perf only; feeds F2).
2. Version covers what regViews reads (writes bump updatedAt: the 86 raw SQL sets `"updatedAt" = now()`, and Prisma updates/updateMany do the same). The gaps (recipe-component onHand → stockLeft/NO_STOCK; a variant's parent outside the visible set) affect only NO_STOCK or display. The real problem is that the version changes too often (F1).
3. Scan ordering is as designed: member → frozen (R2 toast) → gen → index → await in-flight → gen/frozen re-check → sellable → pay/done guard → sync applyScan, else the server path unchanged. P1.4-S1 strings are still present. Camera: `pop()` then sync `push(options)` apply in order. Search-Enter path and classifyScanBurst are untouched.
4. The `loading()` promise always resolves (`release()` in finally, after the map is set and before the queued refresh). Waiters resume FIFO. A scope change mid-fetch is dropped and the new scope's full fetch is queued correctly.
6. No `any`. The hook has no server imports (load is injected). register-shared adds only types/constants. The action import from the "use server" module follows the existing pattern.

## Hunter findings
H1 · Med · register.ts:1117–1208 · register-actions.ts:199–211
Why: no throttle or cache. Any pos.sale.create holder can loop `knownVersion:null`. Each call runs: the version aggregate over the visible set; a row read of up to 40,001; up to 40 `regRowsInOrder+regPriceBook+regViews` batches (each about 8–10 queries, including regVisibleWhere-heavy child counts, recipes and portions; 2 concurrent); and a response of up to ~10–14 MiB. That is about 40× the largest `registerCatalog` page (500 rows, one regViews). Legitimate churn (F1/F2) multiplies this by the number of registers.
Fix: an in-process memo keyed (tenant, system, unit, version) with a short TTL; and/or a per-user/device throttle (e.g. ≤1 full fetch per 30 s, otherwise return the last version), plus a per-tenant concurrency cap.

H2 · none (consistent) · Scoping is the same as `registerScanAction`: `sessionScope` (canAccessUnit + assertCan pos.sale.create) → `regScope` (system/unit link, unit not archived, REG_SELL_PERMS). A cashier of unit A cannot read unit B (NOT_FOUND). A user without sell permission gets PERMISSION_DENIED (builder probe). Device binding: neither the index nor `registerScan`/`registerCatalog` goes through `deviceScope`. Only submit, override quote, status and held carts bind the device cookie (P5.2 D+E). Consistent.

H3 · none · Money: a client hit adds only `productId`+qty (cartAddProduct). The cached `priceSatang` feeds local display only. Quote re-prices from the DB (priceOf at register.ts:1703–1707; refusals listed in F7). Submit re-prices with server caps (`regPrice(…, regMaxDiscountBp(s.actor, caps))` :2773) and refuses on a total mismatch (`req.expected !== q.grandTotalSatang` → PRICE_CHANGED :2839). openPrice still needs the open-price dialog and the server-side permission. The index has no path to inject a price or bypass a cap. The local PIN-override preview (localQuote) can show a stale price, but submit's expected check catches it.

H4 · none · Data exposure: items are the same `RegisterProduct` that regViews returns to the grid and scan (id, names, kind, category, price/list/source/rule name+end, sku, barcode, image, option counts, parent/variantCount, soldOut*/mark source+time, stockLeft/trackStock, notSold, invItemId). No cost, no internal notes. Variants and stock are already reachable through the catalog, scan and product options. The only difference is that the whole store comes back in one call (see H1).

## Must-fix before merge
F1 (at least: no refresh while a pay/done layer is open or the cart is non-empty; preferably a route handler), F2, F3, H1.
Should-fix (cheap): F4, F5, F6. Optional: F7 (quote-refusal → refresh), F8.

## Delta review fix1c (f30aef7c)
Reviewer: same R lane · range `3fafb1dd..f30aef7c` (src: route.ts new, use-barcode-index.ts rewrite, register.ts, register-shared.ts, RegisterScreen.tsx, register-actions.ts reverted) · 2026-10-24T12:33:08Z
Method: I read the diff and checked it in context against the auth helpers (context.ts getAuth/requireTenant), `/api/pos/sync/snapshot/route.ts`, regScope/regActorOf, pick/known/cart-line stock display (RegisterScreen.tsx:1350–1380, :1552), and the matrix generator OVERRIDES + qc-pos-p5.2 M4/M5. I read the builder's fix1c notes only after forming my view. I ran no suites or probes: the builder's fixture probe already covers cache hit/miss, BUSY, the shared promise, stock-cut-unchanged and the exclusion cases, and my remaining points follow from the code.

### Verdict: MERGEABLE-WITH-FIXES
F1–F7 and H1 are resolved and F8 is accepted with a comment. The route's gates match the removed action and the snapshot route. Removing stock from the version introduces one regression (D1). The remaining points are low.

### Status of the earlier findings
- F1 resolved: the index now comes from a GET route (route.ts:29–69, fetch with no-store at use-barcode-index.ts:122–127), outside the Next action queue. It also defers while a pay/done layer is open (:96–113, RegisterScreen.tsx:693). Version churn is gone: InvItem now contributes only an md5 of id/barcode/sku (register.ts:1193), and MenuItem only its out-of-stock set (:1199). Payload size is unchanged (not slimmed), but it no longer blocks quote or submit.
- F2 resolved: decisions compare only decision fields (sameDecision, use-barcode-index.ts:46). The server returns `excluded` (register.ts:1253, :1275), which feeds a per-scope serverOnly set (:269); confirmAbsent covers codes whose 304/refetch still lacks them. staleTried no longer re-arms through churn.
- F3 resolved: server time comes from the header and the body, kept as offsetMs; the edge check uses server time (:243); an edge already past is ignored (:168); the timer delay is relative to the server.
- F4 resolved: the offline→online transition (:225–230) and a lookup with no set (:236–239, ≥10 s apart, not while in flight or during a 429 retry) both start a fetch.
- F5 resolved: an `alive` ref (:210) gates state writes, timers and the queued run after cleanup; all four timers are cleared and queued/deferred reset.
- F6 resolved: inflight guards at :244, :248 and on focus.
- F7 mostly resolved: invalidate() runs on a product-line quote refusal (RegisterScreen.tsx:1124). Residual in D5.
- F8 accepted with a comment at RegisterScreen.tsx:1694.
- H1 resolved: the version is computed first (cheap), then the in-process cache is checked (key tenant|system|unit|version, TTL 120 s, edge-expiry, 64 LRU), then one shared build promise, at most 2 builds per tenant, and a per-user|unit build throttle of 10 s returning 429 (route.ts:43–55). 304s and cache hits don't count toward the throttle. Residual memory bound in D3.

### Hunter on the GET route: no finding
- Gates are the same as the removed `registerBarcodeIndexAction` (sessionScope) and `/api/pos/sync/snapshot`: tenant from the session (getAuth) → 401 JSON; tenant SUSPENDED/CLOSED → 403 (requireTenant redirects in the same cases); canAccessUnit → 404; evaluate pos.sale.create on that unit → 403; then regScope re-checks system/unit link, archived unit, role and permission. Neither the snapshot route's device binding nor the old action's lack of it is relevant here: neither registerScan nor the old action used the device cookie, so this is consistent.
- Query validation: systemId/unitId non-empty and ≤100 (route.ts:37), then regIsId inside regScope (NOT_FOUND). knownVersion: If-None-Match must match `"[A-Za-z0-9_-]{1,100}"`, otherwise the query value, which register.ts caps at 100 (VALIDATION 422). No cross-tenant or cross-unit read: tenant from the session, unit gated before the call, cache key includes unit and the version hash includes unit and unitInv.
- ETag/304: the version is computed after the scope gates for the requested unit only. A 304 says only "your tag equals this unit's version" for a unit you are already allowed to read, so it cannot leak another unit's version.
- 429: keyed `userId|unitId` (route.ts:41), so one user cannot lock out others on the same unit. It fires only on a cache miss with no build in flight.
- Headers: `cache-control: private, no-store` on every response, including 304 and errors. `x-pos-server-now` is an ISO timestamp only. No CORS headers; GET is read-only.
- The money-path findings from the first review (H3/H4) are unchanged.

### Cache in register.ts: no finding beyond D3
- Key `tenant|system|unit|version` (register.ts:1213), and the version also hashes unitInv. RegisterProduct does not depend on the actor, so sharing between users of the same unit is safe.
- A failed build: `then(put, noop).finally(delete)` (:1221–1224). A rejected build is never cached, the building entry is removed, and awaiting callers get INTERNAL via regGuard. No unhandled rejection, because a handler is attached.
- regBiTenantSlot (:1154–1170) decrements in finally and wakes one waiter, which re-checks in a loop. Every release wakes one, so no slot is lost and nothing stays stuck after a failure.
- Version cost: one aggregate with string_agg+md5 over the visible set on every request, including 304s (builder measured 31–36 ms at 5k). Acceptable.

### Findings
D1 · Med · use-barcode-index.ts (version no longer moves on stock) → RegisterScreen.tsx:1552 (`pick` → `known.current.set`) and :1350–1351, :1379 (cart line stock "from→to" and the over-stock `warn`)
Why: by design the version now ignores onHand, so the cached `stockLeft`/`trackStock`/NO_STOCK can be hours old (304s never refresh them). An index hit then overwrites the fresher grid/scan entry in `known`. The cart line shows a wrong "stock 50 → 49" and drops the qty > stockLeft warning the server path would have shown. Before this change, a scan always brought fresh stock. There is no money impact (the warning is advisory; createSale cuts stock). Side effect: a product cached as NO_STOCK that gets restocked stays on the server path until some other edit moves the version (perf only).
Fix (cheap): when applying an index hit, keep stockLeft/trackStock/trackStockMode/soldOut* from an existing `known` entry if there is one. Otherwise null `stockLeft` for index products (server-side in the index items, or client-side), so the line shows no stock rather than a wrong one. Optionally refresh that product's stock with the next quote.

D2 · Low · register.ts:1199 (MenuItem term hashes only `mi.id` of out-of-stock rows)
Why: if an out-of-stock MenuItem is relinked from product A to product B (`posProductId` change), the out-of-stock id set and the count stay the same. menuSoldOutIds (catalog.ts:985–988) then marks B UNAVAILABLE instead of A, but the version does not move. Quote catches it (PRODUCT_UNAVAILABLE) and invalidate() then refetches, but the version is unchanged, so the fix only arrives at the next real change.
Fix: aggregate `mi.id || ':' || mi."posProductId"` (the whole linked set, plus the out-of-stock flag).

D3 · Low · register.ts:1133, :1150–1153 (cache bound is 64 entries with no byte budget)
Why: at the 20k cap a full set is about 10+ MiB as JSON and several times that as live objects. 64 entries (and old versions linger up to 120 s, since TTL is only checked on get) could pin hundreds of MiB to over 1 GiB per instance for large tenants. The cache and the throttle are also per process, so on multiple instances they are weaker but still correct.
Fix: a byte budget (estimate items × ~600 B, e.g. ≤ 200 MiB total), and/or skip caching sets above N items; sweep expired entries on put.

D4 · Low · scripts/pos-authz-matrix.json:109 (generator has no OVERRIDES row for the route)
Why: the row has CASHIER/STAFF_NOPERM/OTHER_UNIT = "?", perm [], tenantScope "?", unitScoped false. qc-pos-p5.2 M4 only fails "?" on action/page rows, so the gate is green, but the authz record is wrong for a session API that is in fact unit-scoped and requires pos.sale.create. The builder flags it too.
Fix: add an OVERRIDES entry in scripts/pos-authz-matrix-gen.mts like the snapshot one (CASHIER allow · STAFF_NOPERM deny · OTHER_UNIT deny · OTHER_TENANT deny · ANON deny · perm ["pos.sale.create"] · unitScoped true · tenantScope "session (getAuth)"), then `--write`. This edits an oracle-adjacent file, so it needs the controller's ruling.

D5 · Low · RegisterScreen.tsx:1124 / use-barcode-index.ts:280–282
Why: (a) invalidate() fires on any product-line refusal (e.g. INVALID_LINE on weighed lines, DISCOUNT_EXCEEDS_LIMIT with a lineIndex). While such a line stays in the cart, every cart edit triggers one debounced version check (cheap 304; no loop). (b) Residual from F7: a non-required option group linked after load gives no quote refusal, so the line is still sold without the options dialog until the next tick or focus.
Fix: limit invalidate to index-relevant codes (PRODUCT_NOT_FOUND, PRODUCT_UNAVAILABLE, VARIANT_REQUIRED, OPTIONS_REQUIRED, PRICE_NOT_SET, CHANNEL_NOT_SOLD) and once per (line key, code). For (b), accept or document.

### Must-fix before merge
D1 (cheap stock-field merge or null). D4 is cheap and should go in before the P6 handover, but needs the controller's ruling because it touches the generator. D2, D3 and D5 are should-fix or optional.
