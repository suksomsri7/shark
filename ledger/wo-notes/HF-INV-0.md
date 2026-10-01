# HF-INV-0 — Inventory authorization / id-trust gaps (security hotfix)

Worktree `/root/projects/shark-hf4` · branch `hotfix/inventory-authz` (base origin/main 04d2ade9) · DB = QC4 only.
Brief: `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-HF-INV-0.md` · lane rules: `pos-brief-LANE-RULES.md`.

## Status (checkpoint)
- [x] 1. audit (below)
- [x] 2. oracle `scripts/qc-hf-inventory-authz.mts` RED on unfixed code → `ledger/wo-notes/HF-INV-0-red.txt` (5/33 — guard checks collapse to 1 line each while guard.ts is missing)
- [x] 3. fix
- [x] 4. GREEN 46/46 (`HF-INV-0-green.txt`) + regressions before/after identical (table below)
- [x] 5. fitness 33/33 both modes before = after · typecheck (see A4)
- [x] 6. commit · push (`hotfix/inventory-authz`)

## 1. Audit — every inventory surface and every client-supplied id (verified in THIS tree, origin/main 04d2ade9)

Permission facts: inventory keys `permissions.ts:467-487`; **no cost/supplier-specific key exists** ⇒ field-level
cost hiding is not expressible with existing keys → whole page is gated on the read permission (see decision D-1).
`assertCan` without `unitId` ⇒ MANAGER always passes (`rbac.ts:22-25,34-36`); STAFF needs the key or `inventory.*`.

### Pages / server components
| surface | file | before | data shown |
|---|---|---|---|
| items | `src/app/app/sys/[id]/inventory/items/page.tsx:12-14` | system type ✔ · **no permission** | SKU, onHand, avg cost, lots, per-location stock |
| services | `…/services/page.tsx` | same | prices, deposits, images |
| count | `…/count/page.tsx` | same | items + onHand |
| movements | `…/movements/page.tsx` | same | movement ledger incl. cost |
| locations | `…/locations/page.tsx` | same | stock per location |
| procurement | `…/procurement/page.tsx` | same | suppliers (phone/email), PO totals, vendor-portal links |
| settings | `…/settings/page.tsx` | same | categories, SKU settings |
| hub `InvHub` | `src/app/app/sys/[id]/page.tsx` (generic, CRM-shared file) → `inventory/ui.tsx:826` | system found by `{id,tenantId}` only · **no permission** · calls `ensureDefaultLocation` (a WRITE) on view | item count, low stock, open POs |

### Server actions (`inventory/actions.ts`, `inventory/procurement-actions.ts`) — systemId is client-supplied in all of them
| action | key | systemId check before | other client ids | id check before |
|---|---|---|---|---|
| createItemAction | item.create | ✘ (any system of tenant) | – | – |
| updateItemAction | item.update | ✘ | itemId | ✔ tenantDb scoped (`service.ts:314`) |
| archiveItemAction | item.update | ✘ | itemId | ✔ scoped (`:365`) |
| receiveAction | movement.receive | ✘ | itemId · locationId · lotCode(text) | itemId ✔ (`:460`) · locationId ✔ `resolveLocationId` (`:114-122`, not archived-checked; nothing archives locations today) |
| consumeAction | movement.consume | ✘ | itemId · locationId · lotCode | same ✔ |
| bulkCountAction | movement.adjust | ✘ | countItemId[] | ✔ via adjust (tenantDb) |
| importItemsAction | item.import | ✘ | – | – |
| createLocationAction | location.create | ✘ | – | – |
| **transferAction → transfer** | movement.transfer | ✘ | itemId · **fromLocationId · toLocationId** | itemId ✔ · **locations ✘ (D3)** — `applyLocationDelta` creates a row for any id (`service.ts:64-77`, `702-708`) |
| itemLotsAction | item.read | ✘ | itemId | ✔ scoped read |
| findItemByBarcodeAction | item.read | ✘ | barcode(text) | – |
| createServiceAction | item.create | ✘ | categoryId | ✘ loose string (no FK; reads are scoped ⇒ no leak, LOW) |
| updateServiceAction | item.update | ✘ | itemId · categoryId | itemId ✔ · categoryId loose (LOW) |
| saveCategoryAction | item.update | ✘ | id | ✔ scoped findFirst (`:1045`) |
| removeCategoryAction | item.update | ✘ | id | ✔ scoped deleteMany/updateMany |
| saveSettingsAction | item.update | ✘ | – | – |
| uploadItemImageAction | item.update | ✘ | itemId | ✔ after upload (`addItemImage`) — file uploaded first (orphan file, LOW) |
| removeItemImageAction | item.update | ✘ | imageId | ✔ scoped deleteMany |
| setPrimaryImageAction | item.update | ✘ | itemId · imageId | ✔ scoped |
| createSupplierAction | supplier.create | ✘ | – | – |
| enable/disableVendorPortalAction | supplier.update | ✘ | supplierId | ✔ scoped updateMany |
| **createPoAction → createPo** | po.create | ✘ | **supplierId · lines[].itemId** | **✘ both** (`procurement.ts:118-159`) — PO for a phantom supplier / another system's item / a SERVICE; blows up later inside receivePo after the status flip (D4) |
| markOrderedAction | po.order | ✘ | poId | ✔ scoped |
| **receivePoAction → receivePo** | po.receive | ✘ | poId · **locationId** | poId ✔ · locationId checked only inside the per-line `receive` — **after** the ORDERED→RECEIVED flip (`procurement.ts:223-243`) ⇒ a bad id leaves the PO RECEIVED with nothing received |
| cancelPoAction | po.cancel | ✘ | poId | ✔ scoped |

### Other routes / tools that return inventory data
| surface | gate | note |
|---|---|---|
| `GET /api/v1/inventory/items` | fixed in another hotfix | NOT touched (brief) |
| AI `low_stock` (`ai/tools.ts:127-140`) | skill-level only; ToolCtx has no actor | returns name/SKU/onHand/reorderPoint (no cost). Fix needs `ai/tools.ts`/`ai/skills.ts` = shared hot files not named in brief ⇒ **left, reported** |
| AI proposals `inventory_*` | access map key | `proposals.ts` — do not touch (brief) |
| kanban link resolver `INV_ITEM` | `inventory.item.read` ✔ | – |
| clinic page `u/[unitSlug]/clinic/page.tsx:69` | clinic page's own gate | lists items for dispensing — clinic scope, out |
| public `/vendor/[token]` | bearer token | unchanged (no expiry/rate limit = P, out) |

## Decisions taken (controller may override)
- D-1 read gate = `inventory.item.read` **or any other `inventory.*` key the STAFF member holds** (write ⇒ read, same
  idea as account `IMPLIES` `account/access.ts:30-37`). Reason: a clerk who was given only "รับของเข้าคลัง" must still
  open the page that holds the receive form; otherwise the hotfix silently takes away work they are allowed to do.
  Strict alternative = one line in `guard.ts` (`inventoryCanRead`).
- D-2 no cost/supplier key exists ⇒ whole-page gate (no field-level hiding).
- D-3 transfer negative stock: module policy = allowed + `needsReview` (`service.ts:669`, `qc-warehouse` WH-5.1) ⇒ kept;
  only "both locations real, in this system, not archived" is enforced.

## 3. What changed (minimal hunks)
| file | change |
|---|---|
| `src/lib/modules/inventory/guard.ts` (new) | `inventoryCanRead(m)` · `findInventoryCtx` / `requireInventoryCtx` (system `{id, tenantId, type INVENTORY}` via `tenantDb`) · `requireInventoryPage(id)` = requireTenant → system → read permission → `notFound()` |
| 7 × `src/app/app/sys/[id]/inventory/*/page.tsx` | own system lookup → `requireInventoryPage(id)` (-3 lines +2 each) |
| `inventory/ui.tsx` `InvHub` | `requireInventoryPage(systemId)` before `ensureDefaultLocation` (the shared `/app/sys/[id]/page.tsx` is NOT touched — CRM edits it) |
| `inventory/actions.ts` (19 actions) | `const ctx: Ctx = {tenantId, systemId}` → `await requireInventoryCtx(...)` (void form actions throw) or `findInventoryCtx` + Thai error state (bulkCount / import / itemLots / barcode / upload — upload now checks the system **before** uploading the file) |
| `inventory/procurement-actions.ts` (7 actions) | same |
| `inventory/service.ts` `transfer` | D3: both locations must be in `{tenant, system}` and `archivedAt: null` (one `findMany`) else throw · negative source still allowed + `needsReview` (policy kept) |
| `inventory/procurement.ts` `createPo` | supplier must exist in this system; every `lines[].itemId` must be a PRODUCT of this system |
| `inventory/procurement.ts` `receivePo` | `locationId` checked **before** the ORDERED→RECEIVED flip → `{ok:false, note}` (PO stays ORDERED, can be retried) |

Callers traced: `transfer` ← `transferAction` only (+ qc-warehouse); `createPo` / `receivePo` ← procurement-actions only (+ qc-procurement, qc-vendor-portal, qc-warehouse, qc-approval-wiring); inventory server actions are imported only by `inventory/ui.tsx`, `StockCount.tsx`, `BarcodeSearch.tsx`. POS / shop / clinic / booking / account call `receive`/`consume`/`*InTx`/`createItem`/`listItems`/`getItem` — **none of these were changed**.

## 4. Per-surface before → after
| surface | before | after |
|---|---|---|
| 7 inventory pages | any tenant member (STAFF with no inventory key, unit-limited MANAGER) sees cost/suppliers/PO totals | OWNER · MANAGER · STAFF with any `inventory.*` key; others **404** · non-INVENTORY / other-tenant id → 404 |
| hub `/app/sys/[id]` (INVENTORY) | any member; also writes a default location on view | same gate as pages, before any read/write |
| 26 server actions | accepted any `systemId` of the tenant (rows created under POS/ACCOUNT ids or under ANOTHER TENANT's system id with our tenantId) | system re-resolved `{id, tenantId, type INVENTORY}`; otherwise throw / Thai error state, nothing written |
| transfer | fake / other-system / other-tenant / archived location ⇒ phantom −qty row + free +qty in the real location | throw, nothing moves |
| createPo | phantom supplier, other-system/other-tenant item, SERVICE item accepted | throw, no PO |
| receivePo | bad location ⇒ PO flipped RECEIVED, nothing received, cannot retry | `{ok:false}`, PO stays ORDERED |

## 5. Who loses access to what
- STAFF members with **no** `inventory.*` key at all (e.g. cashiers with only `pos.*`): lose the 7 inventory pages + the inventory hub (404). They never had any inventory action rights, so they lose read-only visibility of cost, avg cost, suppliers (phone/email), PO totals, movements.
- Nobody with any inventory key loses anything (D-1). MANAGER/OWNER unchanged (MANAGER is still not unit-limited for inventory — `InvLocation` has no `unitId`; out of scope).
- Forms posted with a wrong/foreign system id (stale tabs after a system is deleted, tampering) now fail with "ไม่พบระบบสินค้า/บริการนี้ในกิจการ — รีเฟรชหน้าแล้วลองใหม่อีกครั้ง".

## 6. Results
- A1 oracle: RED `ผ่าน 5/33` (`HF-INV-0-red.txt`) → GREEN `ผ่าน 46/46 · CRITICAL 0` (`HF-INV-0-green.txt`).
- A2 regressions on QC4 (gate lock), before (original code) = after (fix), per-check lines identical:
  qc-inventory 12/12 · qc-inventory-item 11/11 · qc-inventory-account 23/23 · qc-warehouse 15/15 · qc-lot 13/13 ·
  qc-procurement 12/12 · qc-vendor-portal 6/6 · qc-approval-wiring 7/7 · qc-pos-inventory 25/25 · qc-pos-register 42/42 ·
  qc-clinic 8/8 · qc-clinic-refund 13/13 · qc-shop-refund 12/12 · qc-nav-functions 11/11 ·
  qc-acc-v2-invitem 77/88 **both before and after, same 11 ❌ (IV1.1–IV1.9 read the seeded "SIAM DIVE QC" shop, which has 0 products on QC4 — environment, not this change)**.
- A3 fitness: with QC4 env 33/33 → 33/33 · without env 33/33 → 33/33 (check lines identical). (First fix draft imported raw `prisma` in guard.ts → F5.1 46>45; switched to `tenantDb`.)
- A4 typecheck: `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → `tsc --noEmit` **exit 0** (run once, at the end).

## 7. Found but left (report only)
- AI `low_stock` tool `src/lib/ai/tools.ts:127-140`: no per-actor permission (ToolCtx has no actor) — any STAFF with `ai.chat.send`, and any API key via the AI tool route, can list low-stock SKU/onHand (no cost). Fix needs `ai/tools.ts` + `ai/skills.ts` (shared hot files, not named in the brief) → separate small WO: either a scope map for the `inventory` skill like `account`/`members`, or pass the actor in ToolCtx.
- `categoryId` in create/updateServiceAction is a loose string (`actions.ts` → `service.ts:200,335`): a foreign id is stored but every read is scoped ⇒ no leak, display just shows no category (LOW).
- `resolveLocationId` (`service.ts:114-122`, receive/consume/adjust) does not check `archivedAt`; nothing archives a location today (no writer of `InvLocation.archivedAt` in src) ⇒ latent. Left unchanged because POS/account callers pass stored location ids and a behavior change there is not a hotfix.
- `receivePo` mid-loop failure (D4) still possible for other reasons (item archived/deleted/turned SERVICE after the PO was created) — only the client-id triggers were closed.
- `adjust` with a non-default location breaks Σ location = onHand (review §3.1) — latent, no caller passes `locationId`.
- clinic page `src/app/app/u/[unitSlug]/clinic/page.tsx:69` lists inventory items under the clinic page's own gate (clinic scope).
- Unit-limited MANAGER still passes every inventory action (no `unitId` on inventory data) — design gap, needs schema.
- D1 / D2 / D4 / D5 / D7–D13 untouched (see below for D1).

## 8. D1 (non-atomic stock counters) — read-only analysis, NOT changed
Reproduced on QC4 with a throw-away tenant (temporary script, deleted, not committed), calling the real `consume`/`receive`:
```
5 parallel consume(1) on onHand 20: cacheOnHand 18 · ledgerSum 15 · locationSum 15 · OUT balanceAfter [19,19,19,18,18]   (expected 15)
2 parallel consume(1):              18/18/18 (no loss this time — timing dependent)
2 parallel receive(10 @1.00, 10 @3.00) on a new item: onHand 10 (expected 20) · avg cost 1.00 (expected 2.00)  ← a whole receive erased
```
So the lost update is real under the default READ COMMITTED: `InvItem.onHand` cache drifts from the ledger, `balanceAfter` repeats, the Σ-location invariant breaks, and a concurrent receive can vanish together with its cost.
Smallest safe fix (no schema change, ~5 lines): take a row lock on the item at the top of every stock tx —
`` await tx.$queryRaw`SELECT id FROM "InvItem" WHERE id = ${itemId} AND "tenantId" = ${ctx.tenantId} FOR UPDATE` ``
right after the idempotency check in `receiveInTx`, `consumeInTx`, `adjust`, `transfer` (the 4 entry points every caller goes through), then keep the existing read-modify-write code: it becomes correct because every writer of InvItem / InvLocationStock / InvLot for that item is serialized behind the same lock (also removes the `seedDefaultStockIfNeeded` count-then-create race). Caveats for the WO that does it: (1) multi-line callers (POS sale, bundle, Accounting GI) lock items in line order → two bills with A,B vs B,A can deadlock; PG aborts one (40P01) — sort lines by itemId in those callers or retry once; (2) the concurrent-duplicate idempotency case still raises P2002 (separate); (3) add the concurrency oracle from review §7 gap 1 (N parallel consumes ⇒ exact onHand, Σ movements = onHand, Σ locations = onHand). `{ increment }` alone is NOT enough for receive because the moving-average cost needs the pre-receive quantity.

## 9. Decisions for the controller before deploy
1. D-1 read rule: keep "any `inventory.*` key ⇒ can open inventory pages" (no one with inventory rights loses access) or make it strict `inventory.item.read` (one line in `guard.ts::inventoryCanRead`; clerks with only receive/count keys would then 404).
2. Cost/supplier visibility is all-or-nothing per page because no cost key exists; a field-level "ดูต้นทุน/ผู้ขาย" key needs a `permissions.ts` change (not done).
3. Tell shop owners: STAFF without any inventory key now get 404 on inventory pages (cashiers) — expected; grant `inventory.item.read` if they should see stock.
4. AI `low_stock` + AI tool route still bypass the inventory read permission (left — hot files).
5. Merge order: this branch touches only `src/lib/modules/inventory/**` + `src/app/app/sys/[id]/inventory/**` + one new script; no CRM hot file, no schema. `scripts/qc-hf-inventory-authz.mts` joins `qc:all` via the glob.
6. D1 needs its own WO (row lock, §8) — HIGH, reproduced.
