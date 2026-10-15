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

## Fix round 1 (R1 F1–F5 · controller rulings 1–7 · 15 Oct 2026)
Base f5e1c8a4 → commits 979d5ac0 (test) · 7334aff2 (red-before) · a30741aa F1 · ede1131c F2 · e5d03a0d F3 · 0e870195 F4 · 120b0e16 merge `origin/session/pos` (P2.9bU 616db657 + ledger; no conflicts — `messages/{th,en}/pos.json` + `POS-OWNER-PENDING.md` auto-merged append-only, 0 removed lines) · this notes commit.

**Oracle (ruling 6)** — `scripts/qc-hf-fu.mts`, 2 registry rows + 2 blocks, all under `// ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 1)`; suite = 25 + 2 = **27**; no existing check touched.
- **HN4** (after HN3): ceiling 1 set *before* ingest, 3 orders held via kitchen pause (o1 on a new PLATFORM channel CUSTOM_H4, o2 o3 on GRAB). A third tx holds o1's `PosOrder` row: S1 = `releaseHeldOrders` passes the ceiling check (0 tickets) and waits on o1. Then o1's channel autoAccept goes off, so later sweepers' candidate lists start at o2 (this models stale/different first candidates). S2–S6 = release ×3 + `listOrders` ×2. Release the hold ⇒ expect 1 ACCEPTED · 1 sale · 1 round · `kitchenBacklog` max open ≤ 1. Leftover NEW orders are rejected in `finally`.
- **OD3** (after OD1/OD2): table with a sent round + a HELD draft. The table is paid in full, and because a draft exists the session stays OPEN. `table.closeSession` then sets it CLOSED, leaving an orphan draft. A third tx holds the draft row FOR UPDATE; `registerTables` sweeps, reads CLOSED outside the tx, then waits. In `during`: `voidSaleByActor` + drain, so the void consumer re-opens the session (asserted OPEN). Release ⇒ draft stays HELD, same version, 0 discard audits. Deterministic, so no static replacement was needed.
- **Red-before** (`HF-FU-red.txt` §fix1, log `runs/fix1/red-2.log`, test commit on f5e1c8a4 code, unforced): 25/27.
  - HN4 = `ACCEPTED,ACCEPTED,NEW · 2 sales · 2 rounds · backlog 2` (F2 overshoot).
  - OD3 = `DISCARDED v2 · +1 discard audit` (F1).
  - red-1 was a fixture miss: setting the ceiling sweeps immediately. Fixed in the same test commit (amended before any push).

**Code (one commit each, explicit paths, marked `fix1` hunks)**
- **F1** `pos/held-cart.ts` `sweepOrphanTableDrafts` (marker `b fix1`). The discard tx now:
  1. locks the draft row (`FOR UPDATE`, HELD + same session);
  2. re-reads the session with `rest.tableSessionForPos(tx, …)`; OPEN or unreadable ⇒ skip;
  3. then runs the CAS + audit as before. The hint logic is unchanged.

  The session row is not locked: the close-table path locks session → drafts, so locking it here would invert that order.
- **F2** `pos/order.ts` `releaseHeldOrders`, sweep tx (marker `a fix1`): the first statement is `pg_advisory_xact_lock(hashtext('posorder-release:<tenant>:<unit>'))`, before `autoAcceptBlockedInTx`. Lock order: advisory → PosOrder CAS → kds-round → sale.
- **F3** same function (marker `a fix1`):
  - a non-`OrderAbort` candidate error ⇒ WARN + `continue` (no rethrow);
  - the `sale_refused` marker tx runs in its own try/WARN;
  - after commit, `afterSaleCommit` · adapter `accept` · swept audit each run in their own try/WARN, and `scheduleDrain` is in a try/WARN.
- **F4** `pos/order.ts` `step()` handOver (marker `h1 fix1`): the mutate tx throws `OrderAbort(HANDOVER_SALE_VOIDED)`, a module-level frozen sentinel, so the tx still rolls back. Because of the rollback this is a throw, not a returned value. The caller compares identity and builds `stateInvalid(…, "orders.errors.saleVoided")` only after rollback, so there is no second pool connection inside the tx.
- **F5** (ruling 5) accepted as is — no code.

**Follow-ups (not owner lines)**
- F5: a book with the POS document layer off never gets a sale document. Its zero-entry bills therefore stay `posSalePosted=false`, and each refund re-runs the idempotent `bridgePosSalePaid`. No money effect; R5 F2 stays open for that setup only.
- F2 scope: ingest's own auto-accept check (`order.ts` held/auto path) does not take `posorder-release`, so ingest ‖ sweep or ingest ‖ ingest can still overshoot the ceiling by one. Out of scope per ruling 2 → P2.14.
- F1 residual: a void that commits between the in-tx session re-read and the discard commit (microseconds; the session is not locked, see F1) can still discard. Closing it fully needs a session-first lock order in the sweep → P2.14 if wanted.
- Hunter (money lane): R1's 4-line brief + F2 overshoot re-probe (HN4 shape with ingest in the mix).

**Gates (ruling 7)** — logs `scratchpad/hffub/runs/fix1/` (line 1 = `tree= head= dirty=`); `g-*` at 0e870195 dirty 0 via `scratchpad/hffub/gates-fix1.sh`; `m-*` at 120b0e16 (post-merge) dirty 0.

| gate | result |
|---|---|
| qc-hf-fu ×2 **unforced** @0e870195 | **27/27 · 27/27** (PAR 5/5 · residue 0 · leaks 0) `g-hffu-1/2.log` |
| qc-pos-p2.6 | 67/67 |
| qc-pos-p2.4 | 50/50 |
| qc-pos-p2.8 | 61/61 |
| qc-hf-tx | 22/22 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-p1.3 | 128/128 |
| typecheck | rc 0 @0e870195 `g-typecheck.log` · rc 0 @120b0e16 `m-typecheck.log` (2 runs) |
| fitness no-env · env (qc4) | 50/50 · 50/50 |
| qc-hf-fu post-merge **unforced** @120b0e16 | **27/27** (PAR 5/5 · residue 0) `m-hffu.log` |

## Fix round 2 (hunter H1 + H2 · controller rulings fix2 1–5 · 15 Oct 2026)
Base aff51c68 → commits 05fea805 (test) · cf1abb84 H1 · 01bbc1a9 H2 (+ owner line) · 1c7d23e1 red-before · this notes commit. `origin/session/pos` fetched = 57a8b19a (already merged at aff51c68) ⇒ no merge this round.

**Oracle (ruling 3)** — `scripts/qc-hf-fu.mts`, 2 registry rows + 2 blocks, all under `// ORACLE-ADD ผู้คุม 15 ต.ค. (HF-FU fix 2)`; suite = 27 + 2 = **29**; no existing check touched.
- **HN5** (after HN4): two custom PLATFORM channels, ceiling 1, a LINEMAN blocker ticket holds each order at the ceiling (held backlog, PLATFORM_PAID).
  - (ก) payout flipped to DIRECT (`saveChannel {id, name, payout}`) before the sweep → blocker done → `releaseHeldOrders` ⇒ NEW + `held sale_refused` 1 · 0 sales · 0 rounds; staff `acceptOrder` ⇒ `CHANNEL_PAY_MISMATCH`, still NEW, 0 sales.
  - (ข) blocker done → a third tx holds `pg_advisory_xact_lock(hashtext('posorder-release:<T>:<A>'))`; the sweeper reads its candidates (channel still live) and waits; meanwhile autoAccept goes off → release ⇒ NEW · no new held row · 0 sales · 0 rounds. (A pre-sweep autoAccept flip is already filtered by the outer read, so the race is forced through the release lock — that is the stale-row window H1 names.)
- **ZE3** (after ZE2): the only real zero-entry bill that carries a commission is P2.9b A10's scene (deposit ฿1,070 while VAT-registered → book de-registers → ฿1,050 then ฿20 · agent channel DIRECT 10 %). A PLATFORM-payout bill always has a full PLATFORM tender row, so it can never be zero entry ⇒ the fixture uses DIRECT (deviation from the ruling's "PLATFORM" wording, same money path). Own unit Z3 + POS Z3 + book A3; COMMISSION of the ฿20 bill in A3 (fixture-asserted) → relink POS Z3 to book B (`S.ACCB`, VAT-registered) → refund the ฿20 bill in full (transfer) → drain with console.error/warn captured ⇒ `pos.sale.refunded` DONE · 0 P2002 in log/lastError · COMMISSION in B 0 · COMMISSION_REFUNDED in B 0 (pinned) · COMMISSION in A3 still 1 · tenant `InvMovement` count unchanged. Prints one info line (B: JV keys · marker · documents · event status).
- **Red-before** (`HF-FU-red.txt` §fix2, log `runs/fix2/red-2.log`, test commit on aff51c68 code, unforced): 27/29.
  - HN5 = (ก) `ACCEPTED · no sale · 1 round` (platform revenue never booked), staff accept `ORDER_STATE_INVALID`; (ข) `ACCEPTED + PLATFORM sale` from the stale row.
  - ZE3 = P2002 logged by the refund consumer's step 1a (book B: refund JV + credit note only, no marker). The event itself ended DONE/0 here because 1a swallows the error — on this fixture the first collision is the **deposit receipt** key `PosSale#<receipt>#PAID` (`ensureDepositReceiptsPosted` → `postExternalDepositReceipt` in B), which fires before the marker/commission the hunter traced. Confirmed by the fix run: with the receipt skip in place book B gets marker 1 + documents 2 and 0 P2002.
  - red-1 was an HN5 fixture miss (`saveChannel` edit needs `name`); fixed in the same test commit (amended before any push).

**Code**
- **H1** `pos/order.ts` (markers `a fix2`):
  - `sweepLive(c, now)` = active · autoAccept · not MANUAL · not paused — used by the outer candidate filter and, inside the sweep tx (after the per-unit advisory lock and the order re-read), on a channel row re-read with the tx client (`archivedAt: null`). Not live ⇒ `"skip"` (stays NEW, no marker). `acceptInTx` gets the fresh row.
  - `acceptInTx` (sweep · manual `acceptOrder` · ingest auto-accept) first line: `(ch.payout === "PLATFORM") !== (o.paymentState === "PLATFORM_PAID")` ⇒ `OrderAbort(refuse("CHANNEL_PAY_MISMATCH", …))` before any write. Sweep ⇒ existing `held {reason:"sale_refused"}` path; staff ⇒ the existing code, UI text `errors.channelPayMismatch` (no new reason, no new key). Ingest always writes a consistent pair, so it never trips.
  - Channel re-read is a plain read (no FOR SHARE): a channel edit committed while the sweeper waits on the PosOrder row is not seen (HN4's S1 still accepts o1, as HN4 pins); locking the channel would block `setChannelOrderSettings` behind the sweeper.
- **H2** `account/gl.ts` + `account/index.ts` (markers `z fix2`):
  - `postedInOtherBook(ctx, key, db)` = journal row with this key in the same tenant and another systemId; checked after `alreadyPosted` in `postExternalChannelCommission`, `postExternalSale` **and `postExternalDepositReceipt`** ⇒ `{ skipped: true, reason: "other-book" }`. The deposit receipt is an addition to the ruling's two functions: it is the same `PosSale#<id>#PAID` key family and is what ZE3's real path hits first (see red-before) — without it ZE3 stays red.
  - `applyExternalSale` / `applyExternalDepositReceipt`: `other-book` ⇒ `{posted:false, reason:"other-book"}` **before the document layer** — the new book gets no second sale/receipt document or tax number (before the fix the P2002 threw before that layer, so the visible outcome is unchanged minus the exception). `applyExternalChannelCommission` passes the reason through (else "already").
  - COMMISSION_REFUNDED gate unchanged (book-scoped) ⇒ no cross-book reversal; owner line appended to `ledger/POS-OWNER-PENDING.md` (ruling 2 text, + Thai gloss).
  - **Bundle double-consume question (ruling 2) = NO.** `consumeBundleComponentsForDoc` only consumes document lines whose `productId` is a BUNDLE of that book. A POS bill's document lines resolve `productId` only via `resolveProductIdsForExternalSale(book, itemIds)` (`AccountProduct.invItemId = line.itemId`; the bridge never sends `accountProductId`), and a BUNDLE cannot carry `invItemId` (`account/product.ts:1721` refuses it) ⇒ every POS document returns `no-bundle-line` in any book; the B-side document never consumes stock. ZE3 asserts the tenant's `InvMovement` count unchanged. No CONTROLLER-DECISION.

**Follow-ups (not owner lines · P2.14 unless noted)**
- R2 G1: the read-path sweep waits on a *blocking* `pg_advisory_xact_lock` inside `runTx` ⇒ `pg_try_advisory_xact_lock` + return `"blocked"` when false.
- R2 G2: F1 residual — the session re-read in the orphan-draft discard tx is unlocked; closing it needs a session-first lock order in the sweep.
- Hunter info: a fully REFUNDED (not voided) bill can still be handed over (predates HF-FU; P2.14 h1 scope).
- Hunter: ingest ‖ sweep can overshoot the ceiling by one (ingest does not take `posorder-release`) — already listed in fix round 1.
- H2 residue (HF-FU2 with the owner line): after a relink, a zero-entry bill's refund still writes a marker + sale document in the new book (zero-entry path never calls `postExternalSale`); no money (0 JV) and no P2002, but a second document exists in the new book. A normal bill's refund after relink gets no sale document in the new book, so its credit note may be refused there (same as before the fix).

**Gates (ruling 5)** — logs `scratchpad/hffub/runs/fix2/` (line 1 = `tree= head= dirty=`); `g-*` at 1c7d23e1 dirty 0 via `scratchpad/hffub/gates-fix2.sh`; step run `s1-hffu.log` at 01bbc1a9 = 29/29.

| gate | result |
|---|---|
| qc-hf-fu ×2 **unforced** | **29/29 · 29/29** (PAR 5/5 · residue 0 · leaks 0 · fpDrift none) `g-hffu-1/2.log` |
| qc-pos-p2.6 | 67/67 |
| qc-pos-p2.8 | 61/61 |
| qc-pos-p2.9b | 53/53 (A10 green with the other-book skip) |
| qc-pos-p1.8 | 49/49 |
| qc-pos-account | 16/16 |
| qc-account-cpa | 107/107 |
| qc-hf-tx | 22/22 |
| qc-pos-p1.1 | 180/180 |
| qc-pos-p1.3 | 128/128 |
| typecheck (pos lock 5632 MB) | rc 0 `g-typecheck.log` |
| fitness no-env · env (qc4) | 50/50 · 50/50 |
| merge `origin/session/pos` | not needed — still 57a8b19a (merged at aff51c68); the final `qc-hf-fu` = the two `g-hffu` runs above |
