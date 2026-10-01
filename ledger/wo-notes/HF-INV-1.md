# HF-INV-1 — stock counters lose updates under concurrency (D1) · builder notes / checkpoint

Worktree `/root/projects/shark-hf5` · branch `hotfix/inventory-atomic` (base `hotfix/inventory-authz` 93573210) · DB = QC4 only.
Brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-HF-INV-1.md` · lane rules `pos-brief-LANE-RULES.md`.

## Status (checkpoint)
- [x] 1. writer inventory (§1)
- [x] 2. oracle `scripts/qc-hf-inventory-atomic.mts` RED on 93573210 → `HF-INV-1-red.txt` **9/63**
- [x] 3. fix (§2) — `inventory/service.ts` + 3 small hunks in `account/product.ts` / `account/bundle.ts`
- [x] 4. GREEN ×3 **63/63** (`HF-INV-1-green.txt`) + 2 positive controls (`HF-INV-1-control.txt`)
- [x] 5. regressions before = after, 24 suites (§5)
- [x] 6. `scripts/inv-cache-audit.mts` on QC4 + positive control (`HF-INV-1-cache-audit-qc4.txt`)
- [x] 7. fitness 33/33 both modes before = after · typecheck exit 0
- [x] 8. notes · commit · push `hotfix/inventory-atomic`

## 1. Writer inventory — every place that writes InvItem.onHand / InvItem.costSatang / InvLocationStock / InvLot / InvMovement (verified in THIS tree)
`grep invItem|invLocationStock|invLot|invMovement .(update|updateMany|upsert|create|createMany|delete|deleteMany)` over `src/**` + every importer of `inventory/service`.

| # | writer | fields | tx owner | callers |
|---|---|---|---|---|
| W1 | `receiveInTx` `inventory/service.ts:450` (wrapper `receive :435`) | onHand, **costSatang (moving avg)**, location row, lot row, movement IN | wrapper owns tx · `*InTx` = caller's tx | `receiveAction`; `receivePo` (per line, own tx each); AI `inventory_receive`; POS void restore (per OUT movement, own tx each); shop refund (per line); clinic refund (per movement); acc GOODS_ISSUE_RETURN `account/product.ts:906` (**multi-item, caller tx**); acc opening lot `account/product.ts:1686` (1 item, caller tx) |
| W2 | `consumeInTx` `:531` (wrapper `consume :516`) | onHand, location, lot, movement OUT (cost = avg at that moment) | same | `consumeAction`; AI `inventory_consume`; POS `consumeSaleInventory` (per line, own tx each); shop `confirmOrderPaid` (per line); clinic dispense (per line); acc GOODS_ISSUE `product.ts:905` (**multi-item, caller tx**); acc bundle components `bundle.ts:101` (**multi-item, caller tx** ← `issueDocument` INVOICE/RECEIPT and POS→acc `applyExternalSale` via `consumeBundleComponentsForDoc`) |
| W3 | `adjust` `:592` | onHand := newQty, location += delta, movement ADJUST | own tx | `bulkCount` (per line, own tx each) ← `bulkCountAction`; AI `inventory_adjust` |
| W4 | `transfer` `:679` | 2 location rows, 2 movements TRANSFER (onHand untouched) | own tx | `transferAction` |
| W5 | helpers `seedDefaultStockIfNeeded :54` · `applyLocationDelta :64` · `applyLotDelta :81` | location / lot rows (find→update/create) | called only from W1–W4 | – |
| W6 | **direct** `tx.invItem.update({costSatang})` `account/product.ts:1274` (`createCostAdjustment`) | costSatang (no movement) — reads onHand/costSatang at `:1219-1226`, writes later | account tx | acc COST_ADJUSTMENT issue |
| W7 | `createItem` `:190` | initial costSatang, onHand 0 (INSERT — no read-modify-write, no race) | – | items/services/CSV/AI/booking/`inventory-link` |
| – | NOT stock writers (checked): `updateItem` (meta, never qty/cost), `archiveItem`, `linkAccountProduct`, `inventory-link.ts:159,165,271` (name/sku/unitLabel/accountProductId only), `removeCategory` (categoryId) | | | |

Restaurant: no stock writer (`MenuItem.invItemId` never written). Booking: `createItem`/`nextSku` only. No REST/API route writes stock. No raw SQL in inventory before this WO.

### Multi-item callers (deadlock relevance)
| caller | shape | today |
|---|---|---|
| POS sale cut / void restore | one `consume`/`receive` per line, **each its own tx**, sequential | can't deadlock (1 item lock per tx) |
| shop confirm / refund, clinic dispense / refund, `receivePo`, `bulkCount` | same — own tx per line | can't deadlock |
| acc `applyGoodsDocInTx` (GOODS_ISSUE / RETURN, create + approve) | N items in ONE caller tx, line order | **can deadlock** (A,B vs B,A) once items are locked |
| acc `consumeBundleComponentsInTx` (INVOICE/RECEIPT issue, POS→acc) | N components in ONE caller tx, recipe order | **can deadlock** |
| `transfer` | 1 item, 2 locations | lock is per item ⇒ A→B vs B→A of the same item serialise on the item row |

## 2. Lock design per writer (what changed)
Mechanism (`inventory/service.ts:107-180`): `lockItemForStock(db, ctx, itemId)` = one statement
`SELECT id,name,kind::text,onHand,costSatang FROM "InvItem" WHERE id=$1 AND tenantId=$2 AND systemId=$3 FOR UPDATE` — it
**replaces** the previous `findFirst` of the item (same scope, same "ไม่พบสินค้าในคลัง" when missing), so the lock costs no extra
round trip. After it, the existing read-modify-write code is correct unchanged: under READ COMMITTED every later statement
re-reads committed data, and every writer of InvItem / InvLocationStock / InvLot / InvMovement **of that item** now queues behind
the same row lock (helpers `seedDefaultStockIfNeeded` / `applyLocationDelta` / `applyLotDelta` are only reachable after it).
`movingAvgCost` (rules.ts) and its `Math.round` are untouched — the oracle replays it exactly.

| writer | lock | idempotency |
|---|---|---|
| W1 `receiveInTx` | dup pre-check → `lockItemForStock` → **dup re-check** → old code | pre-check unchanged; re-check turns a concurrent same-key call into "return the original movement" (was: P2002 thrown, AT-6b) |
| W2 `consumeInTx` | same | same |
| W3 `adjust` | same (dup checks keep the system-scoped `tenantDb` filter) · `qtyDelta = newQty − onHand` now uses the locked value | same |
| W4 `transfer` | same — lock is per **item**, so A→B and B→A of one item serialise; location rows read after the lock | re-check on `<key>-out` → `{ok:false}` like the pre-check |
| W6 acc `createCostAdjustment` (`account/product.ts:1227`) | `inventory.lockItemsInTx(tx, invCtx, [p.invItemId])` before it reads onHand/cost | – |
| `*InTx` callers (account) | lock taken on the **caller's tx** (`tx` passed in) — signatures/returns unchanged | unchanged |
| wrappers `receive`/`consume`/`adjust`/`transfer` (own their tx) | wrapped in `withStockRetry`: on deadlock/lock-timeout/serialization/P2028/P2034 the whole tx is retried **once** (safe: idempotency key); second failure → Thai `Error("สินค้านี้กำลังถูกบันทึกสต็อกจากหลายรายการพร้อมกัน — รายการนี้ยังไม่ถูกบันทึก กรุณาลองใหม่อีกครั้ง")` | – |
| W7 `createItem` | none needed (INSERT, onHand 0) | – |

Untouched on purpose: negative-stock policy, `needsReview`, GL posting (still after commit, same calls), outbox, `syncLinkedAccountProduct`, return values.

## 3. Deadlock strategy per multi-item caller
| caller | strategy | why | proof |
|---|---|---|---|
| acc `applyGoodsDocInTx` (GOODS_ISSUE/RETURN create + approve) | **deterministic order**: `inventory.lockItemsInTx(tx, invCtx, linkedItemIds)` right before it reads the items (`product.ts:852`) — one statement, ids sorted, `ORDER BY id COLLATE "C" FOR UPDATE` (rows locked in sort order) | the tx is owned by account code (create/approve/issue + GL in one tx); a retry would have to live there. Also fixes the stale "สต็อกไม่พอ" check and the stale return cost read before the per-line locks | AT-7: 4 goods issues [A,B]/[B,A] + 6 bundle consumptions AB/BA, 10 parallel × 5 rounds → all succeed, invariants exact. **Control**: same fix with these two pre-locks commented out → 6–7 of 10 txs fail per round (`HF-INV-1-control.txt` CONTROL 1, 47/52) |
| acc `consumeBundleComponentsInTx` (INVOICE/RECEIPT issue, POS→acc) | same, all linked non-service components locked before the first consume (`bundle.ts:85`) | same | same (AT-7 bundle half runs on separate PrismaClients) |
| POS sale cut / void restore, shop confirm/refund, clinic dispense/refund, `receivePo`, `bulkCount`, AI | nothing to do — each line is its own tx holding one item lock | can't form a cycle | AT-8 (createSale ×10), AT-9 (receivePo 10 POs × 2 presses) |
| `transfer` | single item lock | – | AT-4 |
| any residual (DB-chosen victim) on the wrapper paths | one bounded retry + Thai message | – | AT-11: a real deadlock provoked against `consume` (PG counter +1 each round, lane survives ⇒ wrapper was the victim) → wrapper still succeeds. On 93573210 the raw `DriverAdapterError: deadlock detected` reached the caller |

Lock order rule for future code: in one tx, call `lockItemsInTx` with every item first, and only then touch any item.
Single-item paths lock the item before any location/lot row.

## 4. Oracle `scripts/qc-hf-inventory-atomic.mts` (own temp tenants `qc-hfatom-*`, cleanup in finally, 5 lanes = separate PrismaClients + app pool)
Invariant after every round: `onHand == Σ InvLocationStock == Σ InvMovement.qtyDelta`; each location row == Σ its movements (null
location = default); each lot == Σ its movements; a serial order exists that explains every `balanceAfter` **and** reproduces the
cached average cost exactly with `movingAvgCost` (OUT/ADJUST must record the average at that point; cost adjustments are
inserted as pseudo-rows); per-location chain for transfer legs.
AT-1 consumes · AT-2 receives at different costs · AT-3 mixed + lots · AT-4 transfers A→B/B→A · AT-5 adjust vs consume ·
AT-6 same key ×10 · AT-7 multi-item opposite order (goods issue + bundle) · AT-8 POS `createSale` ×10 · AT-9 `receivePo` ×20 ·
AT-10 acc cost adjustment vs receives · AT-11 deadlock-victim retry. 10 parallel × 5 rounds (AT-11: 3 rounds).

| run | result |
|---|---|
| RED 93573210 | **ผ่าน 9/63 · CRITICAL 49 · MAJOR 5** — e.g. 10×consume: cache 498 vs ledger 480; receives: onHand 14 vs 108; adjust-vs-consume: ledger −264 vs cache 242; transfers: deadlocks + Σlocation 223 vs 200; P2002 on first-touch seed; same key ×10 → 9 P2002 thrown |
| GREEN 1/2/3 | **63/63 · CRITICAL 0** each (wall 84–86 s incl. setup/cleanup) |
| CONTROL 1 (no account pre-lock) | 47/52 (AT-7 fails every round) |
| CONTROL 2 (no cost-adjust lock) | 51/57 (AT-10 fails every round) |

Timing per round, 10 parallel ops on one item (this VPS → Neon ap-southeast-1): before 0.4–0.6 s (wrong results) → after
**0.8–1.1 s** (serialised ≈ 80–100 ms of lock hold per op from here); multi-item AT-7 3.0–3.6 s (before 3.4–4.3 s with failures).

## 5. Regressions on QC4 (gate lock) — before (93573210) vs after, per-check lines identical (sorted, ids stripped)
qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 · qc-warehouse 15/15 · qc-lot 13/13 · qc-procurement 12/12 ·
qc-vendor-portal 6/6 · qc-approval-wiring 7/7 · qc-pos-inventory 25/25 · qc-pos-register 42/42 · qc-clinic 8/8 · qc-clinic-refund 13/13 ·
qc-shop-refund 12/12 · qc-nav-functions 11/11 · qc-hf-inventory-authz 46/46 · qc-pos-account 16/16 · qc-account-cpa 107/107 ·
qc-restaurant-money 6/6 · qc-restaurant-void 11/11 · qc-acc-v2-adjust 96/96 · qc-acc-v2-detail 85/85 ·
**pre-existing reds, identical before/after**: qc-acc-v2-invitem 77/88 (IV1.* read the seeded "SIAM DIVE QC" shop — 0 products on QC4),
qc-acc-v2-pos-lines 65/79 (PL1.*/PL10.* same fixture), qc-acc-v2-products 57/72 (PR1–PR3 same fixture; PR12 crashes on the missing seed
product ⇒ PR12.6+ cost-adjustment checks never run on QC4 — that is why AT-10 was added). acc-v2 suites that move goods: adjust, invitem,
pos-lines, products, detail.
Fitness: with QC4 env 33/33 → 33/33 · without env 33/33 → 33/33 (check lines byte-identical). Typecheck: exit 0 (once, 351 s incl. lock wait).

## 6. Cache audit `scripts/inv-cache-audit.mts` (read-only)
Checks per PRODUCT item: A onHand≠Σlocation (items with rows) · B onHand≠ledger · C a location row≠Σ its movements · D a lot≠Σ its
movements; per tenant counts, Σ|Δ| units and exposure ≈ |Δ|×avg cost. All queries in one tx that starts with `SET TRANSACTION READ ONLY`
(tx-scoped, pooler-safe). Host guard: prod host ⇒ exit 4 unless `ALLOW_PROD_AUDIT=1` (verified with a fake prod URL, no connection).
Options `--items=N`, `--tenant=<id>`.
QC4 result: `ร้านที่ตรวจ 4 · สินค้าเพี้ยน 0/16` (all temp tenants are cleaned; QC4 has little inventory data).
Positive control (throw-away tenant, deliberate drift, script deleted): detected exactly A1 B1 C1 D1, Δ 3 units, ฿7.50.
Prod run (owner decides): `ALLOW_PROD_AUDIT=1 pnpm exec tsx scripts/inv-cache-audit.mts` with prod env exported.

## 7. Timeout / performance / risks
- Interactive tx timeout here = **30 s**, maxWait 10 s (`core/db.ts:29`, not 5 s default). Lock hold per stock op ≈ 6–8 queries
  (~20–40 ms Vercel↔Neon same region; 80–100 ms from this VPS). Queue of N writers on one hot item waits ≈ N×hold — the 30 s limit
  needs hundreds of simultaneous writers on ONE item. Deadlock detection (PG `deadlock_timeout` 1 s) aborts a victim; wrapper paths retry once.
- Worst case for a wrapper: tx expires (P2028) → retried once → second expiry → Thai "ลองใหม่อีกครั้ง" (≤ ~60 s). POS/shop/clinic stock
  cuts swallow errors (pre-existing) — a stock cut that still fails after the retry is silently skipped as before (now much rarer).
- Account multi-item txs hold item locks until the document tx commits (incl. GL posting) — a long goods-issue/invoice with a bundle
  makes POS sales of the same items wait for it (AT-7: ~300 ms per document from this VPS).
- Extra round trips per mutation: +1 (dup re-check after the lock; the lock itself replaces the item read). Account: +1 per document.
- **Pre-existing, not fixed — pool self-starvation**: `applyGoodsDocInTx` / `consumeBundleComponentsInTx` / `createCostAdjustment` call
  `inventorySystemId()` (global pool) while holding a tx connection. With ≥ pool size (pg default 10) such txs in ONE Node process every
  tx waits for an 11th connection until the 30 s timeout (seen in the first RED attempt: all 10 AT-7 calls P2028 at 30.0 s, with or
  without this fix). Matters on Fluid/long-lived servers with concurrent requests; fix = resolve the inventory system id before the tx
  or pass `tx` (account module, separate WO).
- Lock waits also hold pool connections; a burst of sales of one hot item in one instance can make other requests wait for a connection
  (maxWait 10 s). Before the fix those sales did not wait — they corrupted the cache instead.

## 8. NOT covered (left as is)
- Existing drifted caches are not repaired (audit only).
- First-ever creation of the default location by two txs at once: `getOrCreateDefaultLocation` catches P2002 **inside** a tx (PG has
  already aborted it) — rare, once per system; the oracle pre-creates it. Separate tiny fix (create outside the tx / `ON CONFLICT`).
- Same idempotency key used concurrently for **different items** still ends in P2002 (lock is per item).
- Refund/return paths read the "current" average cost **outside** the lock and pass it as the receive cost (POS void, shop/clinic
  refund `…:costSatang` read before `receive`; acc GOODS_ISSUE_RETURN now reads it after the pre-lock ⇒ fixed there). A receive committed
  in between makes the restore cost slightly stale (no lost update; avg moves by rounding of the stale cost) — LOW.
- `adjust` with a non-default `locationId` still breaks Σlocation (review §3.1, latent — no caller passes it).
- Deadlock cycles that include non-inventory rows (e.g. `AccountProduct` rows updated in recipe order by two bundle documents) — not
  inventory counters; not observed; would surface as a failed document (account `safeReason` → Thai message).
- `AccountProduct.qtyOnHand` mirror written after commit by `syncItemToAccountProduct` can still be momentarily stale (by design, readers use `productStockMap`).
- D2, D4 remainder, D5, D7–D13 from the review.

## 9. Hunks outside `src/lib/modules/inventory/**`
| file:line | hunk |
|---|---|
| `src/lib/modules/account/product.ts:852-854` (`applyGoodsDocInTx`) | `await inventory.lockItemsInTx(tx, invCtx, linked.map((p) => p.invItemId as string));` before `tx.invItem.findMany` (+2 comment lines) |
| `src/lib/modules/account/product.ts:1227-1228` (`createCostAdjustment`) | `await inventory.lockItemsInTx(tx, invCtx, [p.invItemId]);` before `tx.invItem.findFirst` (+1 comment line) |
| `src/lib/modules/account/bundle.ts:85-89` (`consumeBundleComponentsInTx`) | `if (invCtx) await inventory.lockItemsInTx(tx, invCtx, <linked non-service component item ids>)` before the loop (+2 comment lines) |
New files: `scripts/qc-hf-inventory-atomic.mts`, `scripts/inv-cache-audit.mts`, notes/outputs under `ledger/wo-notes/HF-INV-1*`.
No schema, no prisma commands, no hot files, no `src/lib/ai/**`, no `permissions.ts`.

## 10. Decisions for the controller before deploy
1. Ship alone? Branch = HF-INV-0 + this; depends on HF-INV-0 only by base (touches different functions). No migration.
2. Run `inv-cache-audit` on prod (read-only, `ALLOW_PROD_AUDIT=1`) to size existing drift; repair = separate WO (recompute onHand from
   ledger per item + Σlocation reconciliation; avg cost cannot be recomputed exactly where receives were lost — needs owner rule).
3. Accept the behaviour change for concurrent duplicate keys: callers now get the original movement instead of a thrown P2002.
4. Accept wrapper retry-once + Thai message on lock contention (alternative: no retry, message only).
5. Schedule the pool self-starvation fix in account (§7) — independent of this hotfix but surfaced by it.
