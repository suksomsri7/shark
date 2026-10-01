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

---

# Round 2 (controller rulings after the review of c4ca074b · brief `pos-brief-HF-INV-1-R2.md`)

## R2 status (checkpoint)
- [x] 0. merged `origin/hotfix/inventory-authz` (55b4a678) → f3254ca2 · `qc-hf-inventory-authz` **112/112** · regression BEFORE captured on f3254ca2 (round-1 outputs not reusable: merge changed guard/actions/ui/reports)
- [x] 1. oracle +31 checks (AT-12..AT-18) → RED on the pre-fix code **67/94** (`HF-INV-1-red2.txt`)
- [x] 2. fix R2.1 · R2.2 · R2.3 · R2.5 (+ N6 label fix)
- [x] 3. controls: 7 runs, each fix reverted in the working tree → its checks red (`HF-INV-1-control2.txt`)
- [x] 4. GREEN ×3 **94/94** (`HF-INV-1-green2.txt`) · 24 regressions identical · fitness 33/33 ×2 modes identical · typecheck **exit 0** (once, 6 min 21 s incl. lock wait, heap 5632)
- [x] 5. notes · commit · push

## R2.1 — unlinked `AccountProduct.qtyOnHand` in ONE statement
Writers of `qtyOnHand` (grep of the whole `src/`, verified): goods doc `applyGoodsDocInTx` (unlinked) · bundle components `consumeBundleComponentsInTx` (unlinked) · opening lot `addOpeningLot` (unlinked) — the three counter writers, all fixed;
linked mirrors (`= mv.balanceAfter` in goods doc / bundle / opening lot, `syncItemToAccountProduct` `= item.onHand`) copy a value read under the InvItem lock or after commit — not counters, unchanged;
`unlinkProductFromItem` freezes `= item.onHand` once (absolute set at unlink, not a counter) — unchanged.
| site | before | after |
|---|---|---|
| `account/product.ts:892-911` goods issue/return (unlinked) | read `p.qtyOnHand` before any lock, write `current ± qty` | refusing rule (issue, `allowNegative` false): `updateMany({ id, tenantId, systemId, qtyOnHand ≥ qty }, decrement)` + `count === 1`, refusal text unchanged (`สต็อก "…" ไม่พอ (คงเหลือ X, เบิก Y)`, X re-read in the tx after the failed update) · otherwise `increment: ±qty` (negative still allowed where it was) · loop sorted by product id |
| `account/bundle.ts:91-100, 136-138` unlinked components | `Number(comp.qtyOnHand) - qty` + in-memory copy | ordered pre-lock `SELECT … FROM "AccountProduct" … ORDER BY id COLLATE "C" FOR UPDATE` of the unlinked components, then `decrement: qty` (in-memory copy removed — no longer needed) · negative still allowed (sale must not block) |
| `account/product.ts:1733-1737` opening lot (unlinked) | `Number(p.qtyOnHand) + qty` | `increment: qty` |
No value is reported back from these writes (no balanceAfter-like field for unlinked products) ⇒ nothing to re-read.
**Finding while testing**: goods docs of the SAME type and SAME month already serialise on the `AccountDocSequence` row (`nextGoodsDocNo` upsert-increment holds the row until commit, and `applyGoodsDocInTx` re-reads products after it). The race is real across months (back-dated docs), across types (issue vs return), bundle sales, opening lots — the oracle dates its documents in 12 different months of 2025.

## R2.2 — bounded lock wait + visible contention
- `inventory/service.ts:124-151`: both lock statements now start with `WITH lt AS MATERIALIZED (SELECT set_config('lock_timeout', '5s', true))` and lock `FOR UPDATE OF i`. `set_config(…, true)` = `SET LOCAL` (tx-scoped). Put in the SAME statement as the lock (the CTE must produce its row before any row reaches LockRows) ⇒ **no extra round trip** — chosen over a separate `SET LOCAL` statement because the brief requires the happy path not to slow down. It stays in force for the rest of that tx (later lock waits in the same stock/account tx are also bounded to 5 s).
- `:162-194`: `stockContentionCode()` returns the SQLSTATE/Prisma code; on the first failure `console.warn("[inventory] stock write contention — retrying", { code, op, itemId })` (op = receive/consume/adjust/transfer; no payload/PII); second failure → same Thai busy message with `{ cause: e }` (it had no cause before).
- Oracle AT-18: inside `consumeInTx`/`lockItemsInTx` `SHOW lock_timeout` = `5s`; after commit AND after rollback on the same backend (direct URL, pool max 1, same `pg_backend_pid`) = `0` (default); positive control: a session `SET lock_timeout='7s'` IS seen by the probe, then `RESET`. Holder keeps the item 12 s → wrapper fails at **10.1 s** with the Thai message, cause = 55P03, exactly one warn `{code:"55P03",op:"consume",itemId}`; after release the same key succeeds once. Account goods issue against a held item fails at **5.2 s** (was 9.0 s = the whole hold), no document, no stock change (message = generic `บันทึกเอกสารเบิกไม่สำเร็จ`, see N5).

## R2.3 — return cap after the lock (+ a pre-existing cap defect)
- `account/product.ts:836-845`: for a return with `sourceDocId`, lock the source issue document row (`SELECT … FROM "AccountDocument" WHERE id, tenantId, systemId FOR UPDATE`) **before** the item locks. Chosen guard: this one row lock serialises all returns of one issue for linked AND unlinked products (no InvItem exists for unlinked). Order issue-doc → items is the same order as approving a draft issue (doc row updated, then stock) ⇒ no new cycle.
- `:879-889`: the cap check moved after the linked block (after `lockItemsInTx` + item reads), per the brief.
- CONTROL 6: cap moved back before the item locks with the doc lock kept → still 94/94 (the doc lock is the guard that matters; the move is belt-and-braces). CONTROL 4: doc lock removed + cap moved back → 2 of 2 concurrent returns succeed (stock +10 for an issue of 5).
- **Pre-existing defect found (brief item impossible as written without it)**: `returnableQtyForIssue` counted the return being created (it is inserted with status ISSUED in the same tx before the check) ⇒ a return could take at most HALF of what is left: issue 6 → "return 6" refused `เหลือคืนได้ 0`, "return 4" refused `เหลือคืนได้ 2`, "return 3" ok (probe on QC4). The UI (`returnableQtyForIssueNow`) shows the full figure. Fix: optional `excludeDocId` (`:727-748`), passed only by `applyGoodsDocInTx` (`input.docId`). Without it the brief's "exactly one of two returns of 5 succeeds" can never happen (both are refused) — on c4ca074b this defect also masked the race. AT-17.0 covers it (MAJOR). Existing AJ9 (adjust) / IV7 (invitem) checks unchanged.

## R2.5 — `scripts/inv-cache-audit.mts`
- `--tenant` now filters inside every CTE (`tf()` fragment, column names constant via `Prisma.raw`, tenant value as a parameter) — EXPLAIN (`--explain`, new, read-only) shows all three `InvMovement` scans as `Bitmap Index Scan … Index Cond: ("tenantId" = …)` instead of a full aggregate. Per-tenant runs 6+6+2+2 = 16 = all-tenant run (QC4: 0 drifted). Still one `SET TRANSACTION READ ONLY` tx; prod host without `ALLOW_PROD_AUDIT=1` → exit 4 before connecting (re-verified).
- **No unlinked `qtyOnHand` check**: there is no reliable history. Bundle component cuts are derived from the CURRENT recipe (recipes are editable, not versioned) · unlink writes an absolute value with no record · nothing records that a product was ever linked. A sum over goods docs + opening lots would flag correct products ⇒ false alarms. Not added (stated in the script header).

## Oracle `scripts/qc-hf-inventory-atomic.mts` — 63 → **94** checks
AT-12 10 goods issues ×[A,B]/[B,A] unlinked, 20→10 · AT-13 5 issues −2 + 5 returns +1, 50→45 · AT-14 10 bundle docs AB/BA unlinked components on separate clients, −10 each · AT-15 opening lot +7 vs 8 issues −1 + a lane that decrements 1 and holds the row 1 s (deterministic stale pre-read), 30→28 · AT-16 5 issues of 3 from 10 with the refusing rule ⇒ exactly 3 ok, 2 refused with the unchanged text, 1 left, never negative · AT-17.0 full return passes · AT-17.1–6 two concurrent returns of 5 of an issue of 5 (different months) ⇒ exactly one, other `เกินจำนวนที่เบิกไว้`, stock +5 once, returnable 0 (linked / unlinked / mixed × 2) · AT-18.1–18.8 lock_timeout / no leak / leak-detector control / busy message 4.5–11.5 s / cause / warn shape / same key once after release / account path < 8 s + retry control. R2 rounds = 3 (AT-17: 6 cases).
Oracle change to a round-1 check: **AT-10 receives now all go through `receiveInTx` on the lanes** (was half wrapper). Reason: the wrapper posts GL after commit and `gl.nextJournalNo` (= `count + 1`) collides with the cost adjustment's own JV — `P2002 (systemId, docNo)` on `AccountJournalEntry`, seen 2× in 10 rounds on the fixed tree, 0× in a 12-round probe; pre-existing GL defect, unrelated to stock (see Decisions). The AT-10 contract (cost adjustment serialises with receives on the InvItem lock) is unchanged; the wrapper uses the same lock.

| run | result |
|---|---|
| RED pre-fix (f3254ca2) | **67/94** · CRITICAL 24 · MAJOR 3 — the 63 round-1 checks green; all 27 R2 findings red for the right reason (`HF-INV-1-red2.txt`) |
| GREEN 1/2/3 | **94/94** · CRITICAL 0 each |
| CONTROL 1 goods-doc hunk | 82/94 — AT-12/13/15/16 |
| CONTROL 2 bundle + opening lot + lock_timeout | 86/94 — AT-14, AT-18.1/3/4/5/7 (AT-15 stayed green with the random-window draft ⇒ AT-15 made deterministic) |
| CONTROL 3 id order only (sort + bundle pre-lock) + warn/cause + doc lock | 84/94 — AT-12 (deadlocks), AT-14 (deadlocks), AT-17.3/17.4 (unlinked returns 2 of 2), AT-18.4/18.5 |
| CONTROL 4 doc lock + cap move | 88/94 — AT-17.1–17.6 (2 of 2 returns) |
| CONTROL 5 exclude-own | 87/94 — AT-17.0–17.6 |
| CONTROL 6 cap move only (informative) | 94/94 |
| CONTROL 7 opening lot only (final oracle) | 91/94 — AT-15.1–3 (31/32/29 instead of 28) |

### Timing (wall per round, 10 parallel, this VPS → Neon ap-southeast-1)
| scenario | round 1 after | round 2 GREEN ×3 |
|---|---|---|
| AT-1 consume ×10 | 0.8–1.1 s | 0.7–1.1 s (one 2.1 s first-round warm-up) |
| AT-2 receive ×10 | ≈0.8 s | 0.7–0.8 s |
| AT-5 adjust vs consume | ≈0.8 s | 0.7–0.9 s (one 1.4) |
| AT-8 POS createSale ×10 | ≈0.9–1.1 s | 0.9–1.1 s |
| AT-7 multi-item | 3.0–3.6 s | 2.8–3.1 s (one 4.1–4.2 per run) |
| AT-10 cost adjust vs receives | ≈1.0 s | 0.9–1.0 s |
| AT-12 / 13 / 14 / 16 / 17 (new) | – | 1.9–2.1 / 1.8–2.6 / 0.3–0.4 / 0.6–0.9 / 0.4–0.6 s |
R2.2 adds no statement to the happy path (set_config rides inside the lock statement) — no measurable change. RED same scenarios: AT-12 8.5–9.3 s and AT-14 3.2–5.1 s on the old code (deadlock detection), vs 2.0 s / 0.3 s now.

## Regressions on QC4 — before (f3254ca2) vs after: per-check lines identical (sorted; ids, timestamps, doc numbers stripped)
qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 · qc-warehouse 15/15 · qc-lot 13/13 · qc-procurement 12/12 · qc-vendor-portal 6/6 ·
qc-approval-wiring 7/7 · qc-pos-inventory 25/25 · qc-pos-register 42/42 · qc-clinic 8/8 · qc-clinic-refund 13/13 · qc-shop-refund 12/12 · qc-nav-functions 11/11 ·
qc-hf-inventory-authz **112/112** (was 46 in round 1 — HF-INV-0 round 2) · qc-pos-account 16/16 · qc-account-cpa 107/107 · qc-restaurant-money 6/6 · qc-restaurant-void 11/11 ·
qc-acc-v2-adjust 96/96 · qc-acc-v2-detail 85/85 · pre-existing reds identical: qc-acc-v2-invitem 77/88 · qc-acc-v2-pos-lines 65/79 · qc-acc-v2-products 57/72 (missing "SIAM DIVE QC" seed on QC4, as round 1).
Fitness 33/33 → 33/33 with QC4 env and with `env -u DATABASE_URL -u DIRECT_URL` (check lines identical; "before" = HEAD versions of the 3 src + 2 script files).

## Hunks (round 2)
`src/lib/modules/inventory/service.ts` (lock statements + retry/warn/cause) · `src/lib/modules/account/product.ts` (returnable excludeDocId · issue-doc lock · cap move · unlinked single-statement loop · opening lot increment) · `src/lib/modules/account/bundle.ts` (ordered pre-lock + decrement) · `scripts/qc-hf-inventory-atomic.mts` · `scripts/inv-cache-audit.mts` · `ledger/wo-notes/HF-INV-1-control.txt` label (N6). No schema, no prisma command, no hot files.

## NOT covered (round 2 additions — notes only, R2.4)
- **N1 void/refund restore cost** (money policy → Inventory V2 / owner+accountant): POS void, shop/clinic refund read the item's CURRENT average before the receive and restore at it. Reviewer's proposal: restore at the OUT movement's own `costSatang`. Worked example (reconstructed; the reviewer's text is not in the repo): 1 unit @ ฿100 → sold (OUT cost 100, onHand 0) → receive 1 @ ฿300 (avg 300) → void the sale: restored at 300 ⇒ 2 units @ 300 = ฿600 on the books of the item while only ฿400 was ever paid (100 + 300); if the sale's COGS reversal uses the sale's cost (฿100), ฿200 of inventory value is created by the void. Restoring at the OUT cost (100) gives avg (300+100)/2 = 200, value ฿400 = what was paid. Not changed.
- **N3** inventory→account mirror sync after commit can apply out of order (two syncs racing) — mirror only, readers use `productStockMap`.
- **N4** pool exhaustion: `unable to start a transaction` (P2028 after maxWait 10 s) is classified as contention ⇒ retried once, so a saturated pool costs ≈ 20 s before the Thai busy message; whether to retry it at all is left as is.
- **N5** the busy message is masked in server actions/account (`safeReason` → generic `บันทึกเอกสารเบิกไม่สำเร็จ` — AT-18.7) · shop `confirmOrderPaid` can throw after the order is PAID when the stock cut fails.
- **N6** done: `HF-INV-1-control.txt` CONTROL 2 label (57 checks = oracle before AT-11; final round-1 = 63).
- `createCostAdjustment` on an UNLINKED product reads `qtyOnHand` and `buyPrice` before any lock (`account/product.ts` ~1240) and uses them for the GL amount `(new − old) × qty` — two concurrent cost adjustments, or one racing a goods issue, post a JV from stale values. Same defect class; not a `qtyOnHand` writer, not in the brief → not changed (see Decisions).
- Account txs: after `lockItemsInTx` the rest of the tx has `lock_timeout 5s` (GL rows, doc rows) — a > 5 s wait anywhere later now fails the document instead of waiting up to 30 s.
- GL journal numbering `count + 1` race (below).

## Decisions for the controller (round 2)
1. **R2.3 exclude-own** (behaviour change beyond the brief): a return can now take the full remaining quantity the screen shows (before: at most half). Needed for the brief's own acceptance test; arguably a bug fix users will notice. Accept?
2. **R2.2 as `set_config(…, true)` inside the lock statement** instead of a separate `SET LOCAL` statement — identical semantics (tx-local, proven not to leak on the same backend), zero extra round trip. Accept?
3. **R2.1 ordering additions**: id-sorted unlinked updates in goods docs + an ordered `FOR UPDATE` pre-lock of unlinked bundle components. Not literally in the brief; without them [A,B]/[B,A] documents deadlock (CONTROL 3: 8–9 of 10 fail per round) — the brief's "bundle with unlinked components in parallel" cannot pass otherwise.
4. **R2.3 guard = issue-document row lock** (covers unlinked); cap also moved after the item locks as briefed (CONTROL 6 shows the doc lock alone suffices).
5. **New finding, GL**: `gl.nextJournalNo` = `count(...) + 1` ⇒ concurrent JV postings in one system/book/period collide (`P2002 AccountJournalEntry (systemId, docNo)`). Inventory wrappers post GL after commit and swallow failures (`postMovementGl` catch) ⇒ a perpetual-inventory JV can be **silently lost**; in a tx (cost adjustment) the whole document fails. Pre-existing, outside inventory — recommend a separate WO (sequence row with upsert-increment like `nextGoodsDocNo`). AT-10 now avoids it.
6. Unlinked `createCostAdjustment` stale read (above) — fix in a round 3 or Inventory V2? (≈4 lines: lock the AccountProduct row for unlinked products before reading qty/buyPrice.)

---

# Round 3 (controller rulings after the hunter on bf5482d9 · brief `origin/session/pos:ledger/pos-briefs/pos-brief-HF-INV-1-R3.md`)

## R3 status (checkpoint)
- [x] 0. `git merge origin/main` (929c39ce, clean) → **2a759a8e** · regression BEFORE captured on 2a759a8e (29 suites)
- [x] 1. oracles extended: `qc-hf-inventory-atomic` 94 → **133** · `qc-hf-inventory-authz` 112 → **116** · new `qc-hf-reports-authz` **23** — RED on 2a759a8e for the right reason (`HF-INV-1-red3.txt`: 94/133 · 111/116 · 8/23; every round-1/2 check green)
- [x] 2. fix R3.1–R3.9 (below)
- [x] 3. controls A–F, each fix reverted in the working tree → its own checks red, all others green (`HF-INV-1-control3.txt`)
- [x] 4. GREEN ×3 (+1) atomic 133/133 · authz 116/116 ×2 · reports 23/23 ×2 (`HF-INV-1-green3.txt`) · regression 29 suites (27 identical, 2 by design) · fitness 33/33 ×2 modes identical · typecheck exit 0 (2nd run; 1st = exit 2 on the new oracle's typing, below)
- [x] 5. notes · commit · push

## R3.1 — every HF-INV-1 row lock is `FOR NO KEY UPDATE`
`inventory/service.ts` `lockItemForStock` :136 / `lockItemsInTx` :158 (`FOR NO KEY UPDATE OF i`) · `account/product.ts` issue-document lock :875-882 · `account/bundle.ts` unlinked-component pre-lock :93-101 · the new R3.4 lock (:1303) uses it too. NO KEY UPDATE conflicts with itself and with plain UPDATEs (all stock writers still queue on the same row), but not with the FOR KEY SHARE that FK inserts take (`AccountDocumentLine.productId`, `InvMovement.itemId` …).
AT-19: deterministic interleaving (lane holds X via `lockItemsInTx`, sleeps 1.2 s, runs the real `consumeBundleComponentsInTx` on bundle [U,X]; 300 ms later a goods issue [U,X] inserts its lines and waits for X) ×2 → both succeed, `pg_stat_database.deadlocks` +0 (RED: goods issue fails, +1 deadlock each round) · storm 5 goods issues [U,X] ∥ 5 bundle txs × 5 rounds → 0 failures, +0 deadlocks, U −10 exactly, X invariants (RED: 6–9 of 10 fail per round). All 63 round-1 + 31 round-2 lost-update checks stay green with the weaker lock (control A reverts all four sites → only AT-19 goes red).

## R3.2 — the 5 s cap covers acquiring the stock lock only
One statement per lock call (`inventory/service.ts:136-171`): `prev` (current_setting) → `lt` (set_config(..., true) = SET LOCAL to the budget, evaluated before any row reaches LockRows) → `locked` (FOR NO KEY UPDATE) → `restore` (count(*) over `locked` forces every lock first, then set_config back to `prev`, tx-local) → `SELECT … FROM restore LEFT JOIN locked ON true` (restore is always the outer side ⇒ evaluated even with 0 rows). Zero extra round trips. Budgets: `STOCK_LOCK_WAIT_WRAPPER = "5s"` (`lockItemForStock`, wrapper txs keep retry-once) · `STOCK_LOCK_WAIT_ACCOUNT_DOC = "15s"` (`lockItemsInTx`, called only by account documents: goods issue/return, bundle cut, cost adjustment).
AT-18.1 inside the tx after `consumeInTx`/`lockItemsInTx` SHOW lock_timeout = the previous value (0) · caller's own `SET LOCAL '3s'` survives (3s) · AT-18.2 no leak after commit/rollback (same backend pid) · AT-18.3 wrapper 12 s hold → Thai busy at 10.1 s (unchanged) · **AT-18.7a 6 s hold → goods issue succeeds at 6.0 s** (RED: fails 5.2 s) · **AT-18.7b 20 s hold → fails at 15.1 s, no doc, no stock** with today's refusal (`บันทึกเอกสารเบิกไม่สำเร็จ`) · **AT-18.9** after the stock lock, the same tx waits 6.7 s for another row held 7 s and succeeds (RED: 55P03 at 5.1 s).

## R3.3 — a sale committed without its stock cut leaves a trace
`pos/service.ts:315-323` `stockErrorCode()` (code / Prisma meta code / error name — no message, it can carry a product name) · `:353-357` cut swallow → `console.error("[pos] stock cut failed — sale committed without stock movement", { saleId, itemId, qty, code })` · `:442-446` same one-liner at the void-restore swallow (`[pos] stock restore failed — void committed without stock movement`). Shop/clinic: **no swallow sites exist** (shop `confirmOrderPaid`/`refundOrder` and clinic dispense/refund let the error propagate) ⇒ nothing to add. CRM branch touches none of these files. AT-24.1/24.2: exactly one line each, keys exactly `code,itemId,qty,saleId`.

## R3.4 — unlinked cost adjustment reads after a row lock
`account/product.ts:1302-1314`: unlinked product ⇒ `SELECT "qtyOnHand","buyPrice" … WHERE id, tenantId, systemId FOR NO KEY UPDATE` before computing the GL delta. **Plus** `:958-965, :997`: goods issue/return reads the unlinked `buyPrice` after its own row-locking update (the pre-lock read was the other half of the inconsistency: adjustment saw qty before the issue, the issue costed at the price before the adjustment). AT-20.1 deterministic holder (100→200 held 1 s, adjustment →300) ⇒ oldCost 200, delta 1000 (RED 100/2000) · AT-20.2–4 100→200 ∥ 100→300 at qty 10 ⇒ Σ delta = (final−100)×10 and old costs chain (RED 3000 vs 1000) · AT-20.5–7 adjustment ∥ issue 3 ⇒ (qty 10 & issue cost 300) or (qty 7 & cost 100), stock 7.

## R3.5 — idempotency keys
(a) key schemes of every stock-writer caller (grep of all importers of `inventory/service`, verified):
| caller | op | key | same key, different payload possible? |
|---|---|---|---|
| POS sale cut `pos/service.ts consumeSaleInventory` | consume | `pos-consume-<saleId>-<saleLineId>` | no (qty from the stored line) |
| POS void restore | receive | `pos-refund-<saleId>-<outMovementId>` | no |
| shop `confirmOrderPaid` / `refundOrder` | consume / receive | `ecom-<orderId>-<lineId>` / `ecom-refund-<orderId>-<lineId>` | no |
| clinic `dispense` | consume | was `clinic-<visitId>-<itemId>` → **`clinic-<visitId>-<dispenseJson position>-<itemId>`** | **yes before (2nd dispense of a drug) — the defect** |
| clinic `refundVisit` | receive | was `clinic-refund-<visitId>-<itemId>` → **`clinic-refund-<visitId>-<outMovementId>`** | would collide once a drug has 2 OUT rows ⇒ changed with (b) |
| procurement `receivePo` | receive | `po-<poLineId>` | no |
| AI proposals (receive/adjust/consume) | — | `ai-<proposalId>` | only if the proposal is re-executed after its sku was re-pointed to another item (now refused, was silently "done") |
| manual actions / `bulkCount` | receive/consume/transfer/adjust | `manual-in/out/tf-<uuid>` / `count-<uuid>` | no (random) |
| account goods issue / return | consumeInTx / receiveInTx | `acc-issue-<docLineId>` / `acc-return-<docLineId>` | no |
| account bundle components | consumeInTx | `acc-issue-<docLineId>-<componentProductId>` | only if the recipe changed between two cuts of the same doc (now typed error → caught + warned inside bundle.ts; before: first movement returned) |
| account opening lot | receiveInTx | `acc-open-<productId>-<seq>` | no |
| transfer | — | `<key>-out` / `<key>-in` | unchanged (dup → `{ ok:false }`, not part of (c)) |
`account-bridge.ts` keys off `"refund"` in the key → clinic refund keys still contain it. No legitimate flow relies on "same key, different payload" (the clinic case was the defect); 29 regression suites agree except the two clinic checks that encode the defect (below).
(b) `clinic/service.ts:203-217, :349-350` — position in `dispenseJson` is stable across a retry of the same event (the JSON is appended only after every line is cut) and new for the next dispense.
(c) `inventory/service.ts:173-206` `StockKeyConflictError` (code `INV_IDEMPOTENCY_CONFLICT`, Thai, non-blaming) · `sameMovementOrThrow` at both dup checks of `receiveInTx` :598/:605, `consumeInTx` :682/:689, `adjust` :750/:756 (item + type + qty; ADJUST compares the counted qty `balanceAfter`) · same payload ⇒ original movement as before.
(d) `.catch(rethrowKeyConflict)` on the three movement inserts (:642, :726, :786): P2002 (the only unique besides id) ⇒ the same typed error.
AT-21.1–21.4/21.6 (qty / item / direction / InTx / adjust) · 21.5 control · 21.7–21.9 same key concurrently on two items (wrapper + InTx) ⇒ one movement, other item's calls get the typed error, never raw P2002. AT-22.1 second dispense cut (80, 2 OUT) · 22.2 retry after a mid-way failure (2nd drug held 12 s) ⇒ first drug not cut twice (75/95, dispenseJson 4) · 22.3 refund restores every cut (IN 4 = OUT 4).

## R3.6 — return cap cannot inflate stock
`account/product.ts` `returnableQtyForIssue` :730-807 — (i) issue not `ISSUED` ⇒ every product returnable 0 (UI shows 0) and `applyGoodsDocInTx` :874-890 refuses with a clear Thai reason read after the (NO KEY UPDATE) lock: draft → `ใบเบิกต้นทางยังเป็นร่าง (ยังไม่ได้ตัดสต็อก) — อนุมัติใบเบิกก่อน…`, voided/cancelled → `ใบเบิกต้นทางถูกยกเลิกแล้ว — ทำใบคืนอ้างอิงใบเบิกนี้ไม่ได้`. (ii) VOIDED returns now counted by whether their stock still stands: linked lines = Σ `InvMovement.qtyDelta` with `refType "AccountDocument"`, `refId = return id`, per item (a future reversing OUT on the same ref is netted out); **unlinked lines have no movement record at all ⇒ counted as standing** (voidDocument in `account/service.ts` never touches `qtyOnHand`; safe direction = refuse). AT-23.1 voided issue · 23.2 draft issue · 23.3 linked / 23.4 unlinked issue 5 → return 5 → void return → return 5 again ⇒ `เกินจำนวนที่เบิกไว้`, stock +5 once · 23.5 control: return 3 → void → return 2 ok, 1 more refused.

## R3.7 — report datasets need the owning module's read right
`reports/actions.ts:20-80` (table :26, `readScope` :46): ONE table `DATASET_READ` (sales → `pos.sale.create` + branch scope, mirror of `posSalesScope` on `hotfix/pos-page-authz` with `evaluate`; customers → member read, mirror of `canReadMember`: OWNER/MANAGER or STAFF with any `member.*` key; inventory → `canReadInventory`) · `readScope()` runs before `runReport` for screen, CSV and groupBy alike; undeclared or non-own-property names refused. `reports/service.ts`: `getDataset` own-property check :128 · scalar filter values :140-145 (object/array refused, Date allowed) · `ctx.unitIds` → base `unitId IN (…)` that user filters (in `AND`) cannot escape :195-199 (`unitField` declared per dataset) · grouped path capped: `clampReportTake(take, EXPORT_CAP)`, reads cap+1, aggregates cap, returns `truncated` :202-206, :222-243. New oracle `scripts/qc-hf-reports-authz.mts` (23): RP-1 STAFF with only `reports.report.run` refused for customers (screen/CSV/groupBy phone) and sales · RP-2 positives (member.customer.read, member.loyalty.stamp, MANAGER, OWNER) · RP-3 branch scope (STAFF u1 → 2 rows, CSV 2, groupBy one group, `unitId eq u2` filter → 0, MANAGER u2 → 1, OWNER/"*" → 3, no branch → refused) · RP-4 operator objects, `constructor`/`__proto__`/`toString`/`hasOwnProperty` (action + service), grouped cap + truncated, undeclared dataset. `qc-hf-inventory-authz` HF-11.2 now positive with `pos.sale.create` (contract change).

## R3.8 — `receivePoAction`
`inventory/procurement-actions.ts:129-158` (action :134) returns `{ status: "ok" | "error", message }` (house shape of this module's useActionState actions); a non-ok `receivePo` on a PO that is now `RECEIVED` (double click / second request) ⇒ `{ status: "ok", "ใบสั่งซื้อนี้รับของเข้าคลังแล้ว" }`; thrown errors from the receive mapped through `safeReason`; system/permission guards still throw like the sibling actions. New client component `inventory/PoReceiveForm.tsx` (useActionState; multi-warehouse form or the existing ConfirmDialog; shows the error message inline) used by `ui.tsx:721-731`. `receivePo`'s own contract unchanged (AT-9 still 10 ok of 20). HF-10.1 (now: returned error, not a throw), HF-12.1–12.4.

## R3.9 — `scripts/inv-cache-audit.mts`
Own prod check :47-70: lowercase + repeated percent-decode of DATABASE_URL, DIRECT_URL, PGHOST, PGHOSTADDR (covers `?host=` and host-less URLs) against `PROD_HOST_MARK`; shared `qc-env-guard.mts` untouched. **E** :147-152 lot movements with no `InvLot` row. **F** :172-249 average cost replayed read-only from the movement chain (+ COST_ADJUSTMENT docs of linked products as chain points, status ≠ DRAFT/CANCELLED since void never reverts the cost): ordered by `createdAt` (verified on QC4: Prisma sets it client-side at INSERT time, i.e. after the stock lock — probe 2 038 ms after tx start), with a 2 s look-ahead for a row whose balance-before links (equal ms / clock skew between instances); IN = `movingAvgCost(balanceBefore, avg, qty, cost)`, OUT/ADJUST must record the running avg; items whose avg is unknowable (first IN at a non-zero balance before any cost) are counted as skipped, not drifted; `--no-cost` disables F. AT-25.1 four prod-URL forms ⇒ exit 4 without connecting (RED: uppercase/percent-encoded/PGHOST tried to connect) · AT-25.2 tenant 1 (all AT-1..AT-24 races + 2 deliberate defects) ⇒ E 1, F 1, A–D 0 · AT-25.3 tenant 2 (cost adjustments racing receives, goods docs, bundle cuts) ⇒ 0 drifted (no false F). Full QC4 run: 4 tenants, 0/16 drifted, F skipped 0.

## Oracle changes to earlier checks (round 3)
AT-18.1 (was: "inside the tx lock_timeout = 5s") → "after the lock = previous value" · AT-18.7 (was: 9 s hold fails < 8 s) → AT-18.7a/b (6 s succeeds, 20 s fails ≈15 s) + AT-18.9 · AT-Z excludes the 2 items AT-25 damages on purpose · HF-10.1 (throw → returned error) · HF-11.2 (STAFF needs `pos.sale.create` for sales). All by the brief's rulings.

## Runs
| run | atomic | authz | reports |
|---|---|---|---|
| RED (2a759a8e) | 94/133 (CRITICAL 36 · MAJOR 3 — all 39 = R3 checks) | 111/116 (HF-10.1, HF-12.*) | 8/23 |
| GREEN | 133/133 ×3 | 116/116 ×2 | 23/23 ×2 |
| CONTROL A R3.1+R3.3+R3.9 | 121/133 — AT-19.*, AT-24.*, AT-25.* | | |
| CONTROL B R3.2+R3.5(b) | 126/133 — AT-18.1/7a/7b/9, AT-22.* | | |
| CONTROL C R3.4+R3.5(c/d) | 118/133 — AT-20.*, AT-21.1–4/6–9 | | |
| CONTROL D R3.6 | 128/133 — AT-23.* | | |
| CONTROL E R3.7 | | | 8/23 (= RED set) |
| CONTROL F R3.8 | | 111/116 — HF-10.1, HF-12.* | |

### Timing (wall per round, 10 parallel, this VPS → Neon ap-southeast-1) — round 2 code (RED run) vs round 3 GREEN ×3
| scenario | round 2 (round-2 notes / RED run on 2a759a8e) | round 3 GREEN |
|---|---|---|
| AT-1 consume ×10 | 0.7–1.1 / 0.8–1.2 | 0.8–1.0 (one 2.1 first-round warm-up) |
| AT-2 receive ×10 | 0.7–0.8 / 0.7–0.9 | 0.7–0.8 |
| AT-3 mixed + lots | – / 0.8–0.9 | 0.8–0.9 |
| AT-4 transfers | – / 1.1 | 1.1 (one 1.4, one 1.8) |
| AT-5 adjust vs consume | 0.7–0.9 / 0.7–0.8 | 0.8–0.9 |
| AT-8 POS createSale ×10 | 0.9–1.1 / 0.8–1.0 | 0.8–1.1 |
| AT-7 multi-item | 2.8–3.1 / 2.9–3.0 | 2.7–3.5 |
| AT-10 cost adjust vs receives | 0.9–1.0 / 0.9 | 0.9 |
| AT-12 / 13 / 14 / 16 / 17 | 1.9–2.1 / 1.8–2.6 / 0.3–0.4 / 0.6–0.9 / 0.4–0.6 | 2.0–2.5 / 1.8–2.0 / 0.3–0.5 / 0.6–1.1 / 0.3–0.5 |
| AT-19 storm (new) | RED 1.5–6.1 with deadlocks | 2.1–3.1 |
| AT-20 cost adj pair (new) | RED 0.4 (wrong GL) | 0.4–1.1 |
The lock statement grew (prev/lt/locked/restore CTEs) but is still one round trip ⇒ no measurable change on the happy path.

## Regressions on QC4 — BEFORE (2a759a8e) vs AFTER, per-check lines (sorted; ids, timestamps, doc numbers stripped)
identical (27): qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 · qc-warehouse 15/15 · qc-lot 13/13 · qc-procurement 12/12 · qc-vendor-portal 6/6 · qc-approval-wiring 7/7 · qc-pos-inventory 25/25 · qc-pos-register 42/42 · qc-clinic-refund 13/13 · qc-shop-refund 12/12 · qc-nav-functions 11/11 · qc-pos-account 16/16 · qc-account-cpa 107/107 · qc-restaurant-money 6/6 · qc-restaurant-void 11/11 · qc-acc-v2-adjust 96/96 · qc-acc-v2-detail 85/85 · qc-clinic-public 15/15 · qc-pos-closeday 22/22 · qc-pos-coupon 8/8 · qc-pos-products 24/24 · qc-report-builder 9/9 · pre-existing reds identical: qc-acc-v2-invitem 77/88 · qc-acc-v2-pos-lines 65/79 · qc-acc-v2-products 57/72 (missing "SIAM DIVE QC" seed on QC4, as rounds 1–2).
changed by design (2): **qc-clinic 8/8 → 6/8** — CL-2.2 asserts the defect R3.5(b) fixes ("dispense the same drug twice → stock 90, not cut again"; now 80) and CL-2.3 looks the movement up by the old key `clinic-<visit>-<item>`. The file is marked "Fable oracle, Builder ห้ามแตะ" ⇒ not edited; proposed ORACLE-EDIT for the controller: CL-2.2 expect 80 (second dispense is a real dispense; retry-of-the-same-event coverage lives in AT-22.2), CL-2.3 `idempotencyKey: { startsWith: \`clinic-${v.id}-\` }`. **qc-hf-inventory-authz 112/112 → 116/116** (HF-10.1/HF-11.2 rewritten per R3.8/R3.7, HF-12.1–12.4 new).
Fitness: 33/33 → 33/33 with QC4 env and with `env -u DATABASE_URL -u DIRECT_URL` (check lines identical; "before" = HEAD versions of every changed file, new files moved aside; "after" re-run on the final tree).
Typecheck (`env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck`): run 1 **exit 2** after 6 min 11 s — one error in the new oracle only (`scripts/qc-hf-inventory-atomic.mts` spawnSync `env: Record<string,string>` not assignable to Next's `ProcessEnv`) → env built as `NodeJS.ProcessEnv` (no runtime change; atomic re-run 133/133 = run 4 in `HF-INV-1-green3.txt`) · run 2 **exit 0** after 6 min 48 s (incl. lock wait). Two runs = the lane maximum.

## Who loses a previously working behaviour (R3.5(c), R3.7 and others)
- R3.5(c/d): any caller that re-sends an existing key with another item / direction / qty now gets `StockKeyConflictError` instead of the stored movement: an AI proposal re-executed after its sku was re-pointed; a bundle document re-cut after its recipe changed (caught inside bundle.ts → warn, component skipped, document still issues — same outward result, but the mirror qty is not rewritten and `consumed` is lower); a clinic dispense retried mid-failure with a **changed qty for the same position** (refused until the list changes). Concurrent same key on two items: raw P2002 → typed error.
- R3.5(b): clinic — dispensing the same drug a second time in one visit now cuts stock (was silently not cut); refunds restore every cut. Deploy-window edge: a dispense that failed mid-way before deploy and is retried after deploy gets new keys ⇒ its already-cut lines are cut again (old behaviour also left those lines' stock un-recorded in dispenseJson).
- R3.7: STAFF with `reports.report.run` but no `member.*` key lose the customers dataset (screen, CSV, groupBy); STAFF without `pos.sale.create`/`pos.*` lose the sales dataset; branch-limited STAFF/MANAGER now see only their branches' sales (were: all branches); requests with object/array filter values or odd dataset names are refused; grouped reports over 50 000 rows aggregate the first 50 000 and say `truncated` (were unbounded).
- R3.6: returns against draft/voided issues refused (were accepted); after voiding a return, its quantity still counts against the cap (linked: while its IN movement stands; unlinked: always) ⇒ "void the return and enter it again" no longer works until void reverses stock (O15).
- R3.2: an account goods document now waits up to 15 s for a busy item (was 5 s) before failing; statements after the stock lock are no longer cut at 5 s (they wait up to the 30 s tx timeout, as before round 2).
- R3.8: none (a duplicate click now shows success instead of an error). R3.1/R3.3/R3.4/R3.9: none.

## NOT covered (round 3)
- `addOpeningLot` calls `receiveInTx` without `lockItemsInTx` ⇒ its item-lock budget is the wrapper's 5 s (no retry) — single item, unchanged from round 2.
- Durable pending-cut record + sweeper for POS (P1.14) · void of goods documents not reversing stock (O15, `account/service.ts`) · journal numbering (CRM C5.4-N) · shop `confirmOrderPaid`/`refundOrder` (MINOR-3) · branch-limited managers on inventory actions (Inventory V2) · pool self-starvation (round 1 §7) — as briefed.
- R3.6 (ii) for unlinked lines is decided by code knowledge (void never touches `qtyOnHand`), not by data — there is no stock record for unlinked products.
- F (audit) cannot verify items whose first IN happened at a non-zero balance before any cost is known (reported as "skipped"); cross-instance clock skew > 2 s with interleaved writes could misorder (none seen on QC4).
- Clinic `dispenseJson` itself is still read-modify-write (two concurrent dispenses on one visit can lose a JSON entry while both cuts happen) — pre-existing, not a stock counter.

## Decisions for the controller (round 3)
1. **qc-clinic CL-2.2/CL-2.3** are red by design (R3.5(b) vs a Builder-may-not-touch oracle) — apply the proposed ORACLE-EDIT above, or rule (b) out.
2. **R3.6 (ii) unlinked**: voided returns count as standing (safe direction, no data exists) — accept, or (i)-only for unlinked?
3. **R3.4 extra hunk**: goods issue/return reads the unlinked `buyPrice` after its row lock — required for "adjustment ∥ goods issue ⇒ consistent"; not literally in the brief.
4. **R3.3 extra site**: the POS void-restore swallow got the same one-line trace (same file, same class).
5. **R3.7 member rule** = any `member.*` key for STAFF (exact mirror of the member pages' `canReadMember`), not strictly `member.customer.read`; phone is exposed under the same rule the member list uses (no `member.sensitive.read` requirement).
6. **R3.7 grouped cap** = `clampReportTake(take, EXPORT_CAP)` (50 000 default, client can lower) + `truncated`, not the 500 screen cap — grouping 500 rows would make totals meaningless.
7. **R3.5 scope**: typed error also on `adjust` (same key, different counted qty); `transfer` keeps its `{ ok:false }` duplicate answer.
8. **R3.8 idempotency** is decided in the action (PO now `RECEIVED` ⇒ ok) so `receivePo`'s contract (used by AT-9 and the vendor portal) is unchanged.

## Round 3 — controller rulings (2026-10-01 15:32 UTC)
- Controller re-run confirmed atomic 133/133 · authz 116/116 · reports 23/23. Decisions 2–8 **accepted as built**.
- Decision 1: **ORACLE-EDIT approved** for `scripts/qc-clinic.mts` CL-2.2 + CL-2.3 only (nothing else in the file, no product code): CL-2.2 expects 80 and its label says the second dispense is a real second dispense that cuts stock and is recorded in dispenseJson; CL-2.3 looks the movement up with `idempotencyKey: { startsWith: \`clinic-${v.id}-\` }`.
- Results on QC4 after the edit: qc-clinic **8/8** · qc-clinic-refund **13/13**.
- Typecheck not re-run by the builder: CL-2.3's `idempotencyKey` filter changed from a string to a `{ startsWith }` object (an expression-type change) ⇒ left to the controller as instructed.
- NOT covered (added): clinic dispense has no client request key ⇒ two sequential identical submits (double click) now cut and record twice (consistent record==stock; before: recorded twice, cut once). Real double-submit protection = request id from the form — later work order.
