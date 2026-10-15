# POS HF-FU — builder notes (server hygiene follow-up bucket) · DONE — 21 items in, f3 included

Builder · VPS (account B) · 15 Oct 2026 · tree `/root/projects/shark-pos-c` · branch `wip/pos-hf-fu` from `wip/pos-hf-fu-oracle` **9e2b1d27** (= `session/pos` c3c52ef1 + oracle `scripts/qc-hf-fu.mts` + 5 ORACLE-EDITs).
Contract: `ledger/pos-briefs/pos-brief-HF-FU.md` §10 rulings 1–14 · names table rows 1–23 of `ledger/wo-notes/pos-HF-FU-oracle.md`. No `scripts/qc-*.mts` edited by the builder. No migration, `prisma/` untouched.

## Items (file · hunk marker · names-table row)
| item | files (hunks `// POS HF-FU ▸ <item> … ◂`) | row | notes |
|---|---|---|---|
| c | `pos/table-split-shared.ts` allocator (`rot` over shared items, EQUAL + SEAT) | 6 | Server item order = `restaurant/pos-tables.ts:146` `tableUnpaidItemsForPos` `orderBy [{createdAt:"asc"},{id:"asc"}]` → `table-split.ts` `registerSplitTable` passes `items.map(...)` in that order (ruling 14.3). Replace path filters the same list (order kept). UI preview uses the same pure function. |
| d | `pos/table-split.ts` `legacyMergeSplitGuard` + `LEGACY_SPLIT_DONE` text | 7 | DONE on from ⇒ `{ok:false, reason}` Thai (CD 5: no messageKey; legacy page `?err=`). Into-side DONE unchanged (CD 4). |
| n | `pos/order.ts` `getOrder` (one `posSale` select) · `order-shared.ts` `OrderDetail.saleStatus` · `OrderPanel.tsx` `noCancel` | 9 | Server cancel path unchanged. |
| s | `table-split-shared.ts` `SplitPlanPartView.memberName/paidMethods` · `table-split.ts` `planView` (`registerMemberBriefs` with the caller's actor + one `posPayment.findMany` distinct (saleId,type) of PAID part sales) · `TableSplitDialog.tsx` (no `billDetailAction`; names seeded from `memberName`) | 11 | Foreign member is refused by `registerMemberGate` (CD 6). |
| l1 | `catalog.ts` recipe writers `invalidAt(msg, field, reason)` + `recipeShape()` wrapper for `ownFields` · `recipe-shared.ts` `RECIPE_REFUSAL_REASONS` · `recipe-actions.ts` `refusalOf` passes `reason` · `recipe-ui.tsx` `recipeRefusalText` maps reason first · keys | 12–13 | Namespace `pos.recipe.errors.*` (drift 5). Also `setRecipeChoiceLines` got the same reasons (same writer family). |
| l2 | `order.ts` `assertCustomerLinks` + keys `orders.errors.*NotFound` | 14 | |
| F3 | `order.ts` `orderChannelSettings(ctx, actor)` · `order-ui-actions.ts` (no `prisma.`) | 15 | |
| h1 | `order.ts` `step()` — inside `mutate`: `transition` (CAS) first, then `SELECT status FROM "PosSale" WHERE id AND "tenantId" FOR SHARE`; VOIDED ⇒ `OrderAbort(stateInvalid(… saleVoided))` | 16 | Lock order CAS → share (CD 9). The out-of-tx pre-read was removed (now in-tx). |
| h2 | `order.ts` `webOrderForUpdate` — `AND (${t}::text IS NULL OR "tenantId" = ${t})` | 16 | |
| j | `outbox-consumers.ts` — `posOrderOnSaleVoided` moved into the main try-chain after the deposit step (same failed/err pattern), one fewer `compose(` on the line below the key | 8 | 0 lines added above `"pos.sale.voided":` (key line still 728). |
| a | `order.ts` ingest held marker (`kitchenPausedForUnit` ⇒ paused else backlog) · `releaseHeldOrders` · `listOrders` sweep before read · `kds.ts` `kdsBoard` (after heal, try/WARN) + `kdsSetAutoAcceptMax` (after commit, try/WARN) via `await import("./order")` · `actions/restaurant.ts` `kitchenPauseAction` one marked line (`if (!paused) await (await import("@/lib/modules/pos/order")).releaseHeldOrders(…)`) · `OrderPanel.tsx` `EVENT_TYPES` + `held` · key `orders.event.held` | 1–4, 23 | Sweeper: candidates NEW, unit, `receivedAt ≥ posDayStart(now)`, held event and no `sale_refused`, channel active/autoAccept/not MANUAL/not paused, FIFO `(receivedAt,id)`, limit ≤ 20; each in its own `runTx`: re-check `autoAcceptBlockedInTx` (blocked ⇒ stop), re-read the row (not NEW ⇒ skip), `acceptInTx(auto:true, actor null, shift null, prep = order ?? channel ?? 15)`; `OrderRaced` ⇒ skip; `OrderAbort` (sale refused) ⇒ one `held {reason:"sale_refused"}` under `PosOrder FOR UPDATE` + re-check, WARN, continue. After commit: `afterSaleCommit` · adapter `accept` · audit `pos.order.accept` SYSTEM `{orderId, auto, swept, saleId}` · `scheduleDrain` once. Never throws. `restaurant/**` untouched. |
| b | `held-cart.ts` `sweepOrphanTableDrafts(db, {tenantId, systemId, unitId, limit?, openSessionIds?})` · `table.ts` `registerTables` (after the floor read, floor OPEN sessions as hint, try/WARN) | 5 | Session null (not found through the facade) ⇒ not touched (conservative). Each discard = own tx (CAS on HELD + audit row) ⇒ replayed read adds nothing. Additive optional `openSessionIds` (perf only). |
| z1 | `account/index.ts` `posSalePosted` = PAID JV or (book marker and `findExternalSaleDoc`) | 18 | |
| z3 | `account/gl.ts` marker writes `after.bookSystemId = ctx.systemId`; reader filters `after.path bookSystemId equals ctx.systemId` | 17 | Old markers without the field ignored (ruling 9). |
| z4 | `ledger/POS-OWNER-PENDING.md` P2.9b fix4 line extended (HF-FU z4 · hunter H2 · cash-only bill strands 2200) | 19 | |
| p | `pre-bill-render.ts` th `.t` = two spans (`.t span {white-space:nowrap}`, `.t2 {font-size:.95em}`, `<wbr>` after `/`) | 10 | en `.t` unchanged; ESC/POS untouched. |
| f1 | `messages/{th,en}/pos.json` `report.channels.empty` | 20 | |
| f2 | `products-data.ts` `unitProducts.incomplete` + `ProductsData.incompleteUnitIds` · `products-scope.ts` `PriceGroup.incomplete?` · `ProductPanel.tsx` line `branch.incomplete` (testid `pos-prod-drawer-incomplete-<unit>`) | 21 | |
| f3 | `price-shared.ts` pure `channelRowsHash` (order-insensitive, two cyrb53 seeds, no crypto) · `catalog.ts` `CP_TOP_KEYS` + `expectedRowsHash` (shape check; compared right after `beforeRows` under the product lock ⇒ `conflict(...)` CONFLICT) · `catalog-price-actions.ts` passes it · `products-data.ts` `ProductsRow.rowsHash` (one query of all stored rows, CD 7) · `ProductPanel.tsx` save + purge send it, CONFLICT ⇒ `branch.conflict` · `ProductsClient.tsx` onSaved recomputes `rowsHash` from the returned full set | 22 | f3 is IN (not deferred). |

## Deviations / CONTROLLER-DECISION
- None of the oracle checks was found wrong; no CONTROLLER-DECISION raised.
- (info) `releaseHeldOrders` also runs on every `listOrders`/`kdsBoard` poll (ruling 1); cheap when no NEW orders of today (one indexed `findMany`).
- (info) purge (`purgeDead`) also sends `expectedRowsHash` — a stale drawer could otherwise delete rows another screen just added.
- (info) orphan sweep skips a draft whose session the facade cannot read (null) instead of discarding it.

## Follow-ups
- Hunter at merge (money lane, brief §8): sweeper double-accept/double-sale + lock order with KDS; EQUAL rotation Σ/VAT; j retry semantics; z1/z3 gate.
- Visual (§9, controller): `--page tables --states --state split-locked,split-seat,split-equal,prebill-preview` · `--page products --states --state products-branch-filter` · `--page orders --states --state orders-detail-platform`.

## Gates (brief §8) — head f0387417 (code = afef29e7; `git diff --name-only afef29e7 f0387417` = ledger only) · dirty 0
Logs `/tmp/claude-0/-root/a129a720-3235-582c-8bcd-f2169f38cd68/scratchpad/hffub/runs/` (every log line 1 = `tree= head= dirty=`); final set `g-*.log` via `scratchpad/hffub/gates.sh`; step logs `s<N>-*.log`. `origin/session/pos` moved by ledger-only commits (a1d8af43) → merged (f0387417, no conflict); P2.9bU not merged upstream yet.

| gate | result |
|---|---|
| qc-hf-fu ×2 **unforced** | **25/25 · 25/25** (PAR 5/5 · residue 0 · leaks 0 · fpDrift none) `g-hffu-1/2.log` |
| qc-pos-p2.5 | 49/49 (M2 M6 T5 C7 green with the ORACLE-EDITs) |
| qc-pos-p2.6 | 67/67 (O4 edit green) |
| qc-pos-p2.9b | 53/53 (A10 edit green) |
| qc-pos-p2.4 | 50/50 |
| qc-pos-p2.8 | 61/61 (ST6 lane pin green here) |
| qc-pos-p2.9 | 62/62 |
| qc-hf-tx | 22/22 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-p1.3 | 128/128 |
| qc-pos-p1.8 | 49/49 |
| qc-pos-p2.3 | 46/46 |
| qc-pos-p2.11 | 33/34 — ST4 lane pin red (lane-A files touched: outbox-consumers.ts, account/gl.ts, account/index.ts = items j/z1/z3 by brief) · ST1 green |
| qc-pos-p2.2 | 42/42 |
| qc-pos-p1.18 (U) | 81/81 (ST7 0) |
| qc-hf-pos-page-authz | 81/81 |
| qc-pos-account | 16/16 |
| qc-account-cpa | 107/107 |
| restaurant ×4: qc-restaurant · qc-restaurant-money · qc-restaurant-pay · qc-restaurant-void | 6/6 · 6/6 · 19/19 · 11/11 |
| typecheck (1 run, pos lock 5632 MB) | rc 0 at afef29e7 `typecheck-1.log` (= final code; 2nd run not needed) |
| fitness no-env · env (qc4) · fitness-pos | 50/50 · 50/50 · 8/8 |

Step runs (forced unless noted): s1 p2.5 49/49 (unforced) · s3 p2.3 46/46 · s4 p2.8 61/61 · s5 qc-hf-fu 17/25 (mid) · s5 p2.6 67/67 · s5 hf-tx 22/22 · s6 p2.4 50/50 · s7 p2.9b 53/53 · pos-account 16/16 · cpa 107/107.
